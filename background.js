// Background service worker for download interception
let pendingDownload = null;
let popupWindowId = null;
let allowedDownloads = new Set(); // Track downloads we're allowing to proceed
let bypassExtension = false; // Track if user wants to bypass extension (modifier keys held)
let downloadRedirects = new Map(); // Track URL redirects: initialUrl -> finalUrl
let pendingRedirects = new Map(); // Track in-progress redirects: requestId -> initialUrl

// Track URL redirects using webRequest API to capture final download URLs
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Only track potential downloads (not page navigations)
    if (details.type === 'main_frame' || details.type === 'sub_frame') {
      return;
    }
    
    // Store the initial URL for this request
    pendingRedirects.set(details.requestId, details.url);
    console.log('[Redirect Tracker] Initial request:', details.url);
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    // Track the redirect chain
    const initialUrl = pendingRedirects.get(details.requestId) || details.url;
    console.log('[Redirect Tracker] Redirect from', initialUrl, 'to', details.redirectUrl);
    
    // Update the redirect map to point to the latest URL
    downloadRedirects.set(initialUrl, details.redirectUrl);
    
    // Update pending redirects to track the new URL
    pendingRedirects.set(details.requestId, details.redirectUrl);
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    // Get the initial URL for this request
    const initialUrl = pendingRedirects.get(details.requestId);
    if (initialUrl && initialUrl !== details.url) {
      // Store the final URL after all redirects
      downloadRedirects.set(initialUrl, details.url);
      console.log('[Redirect Tracker] Final URL for', initialUrl, ':', details.url);
    }
    
    // Clean up after a delay (5 seconds)
    setTimeout(() => {
      pendingRedirects.delete(details.requestId);
    }, 5000);
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    // Clean up on error
    pendingRedirects.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

// Listen for download events
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  console.log("Download detected:", downloadItem);
  console.log("bypassExtension flag:", bypassExtension);
  console.log("allowedDownloads set:", Array.from(allowedDownloads));

  // Check if user held modifier key - bypass extension
  if (bypassExtension) {
    console.log("Bypassing extension due to modifier key");
    bypassExtension = false; // Reset
    return; // Let download proceed normally
  }

  // Check if this is a download we're allowing to proceed
  if (allowedDownloads.has(downloadItem.url)) {
    console.log("Allowing download to proceed:", downloadItem.url);
    allowedDownloads.delete(downloadItem.url);
    return; // Let this download proceed normally
  }

  console.log("Intercepting download - canceling and showing popup");
  // Cancel the download immediately to intercept it
  try {
    await chrome.downloads.cancel(downloadItem.id);
    await chrome.downloads.erase({ id: downloadItem.id });
  } catch (error) {
    console.error("Error canceling download:", error);
  }

  // Store pending download info
  // Extract just the filename without path (Chrome provides full path)
  const filenameOnly = downloadItem.filename
    ? downloadItem.filename.split("/").pop().split("\\").pop()
    : null;

  // Check if we have a final redirected URL for this download
  // The download URL might be in our redirect map, or we need to search for it
  let finalUrl = downloadItem.url;
  
  console.log('[Download] Looking for redirect for:', downloadItem.url);
  console.log('[Download] Current redirect map:', Array.from(downloadRedirects.entries()));
  
  // First, check if this exact URL was redirected
  if (downloadRedirects.has(downloadItem.url)) {
    finalUrl = downloadRedirects.get(downloadItem.url);
    console.log('[Download] Using direct redirect mapping:', finalUrl);
    downloadRedirects.delete(downloadItem.url);
  } else {
    // Search through redirect map values to find the most recent actual download URL
    // This handles cases where the download fires with a page URL but the actual file URL is in redirects
    let bestMatch = null;
    let bestMatchInitial = null;
    
    for (const [initialUrl, redirectedUrl] of downloadRedirects.entries()) {
      // Look for actual download URLs (not just pages)
      if (redirectedUrl.includes('takeout-download.usercontent.google.com') ||
          redirectedUrl.includes('.zip') ||
          redirectedUrl.includes('.tar') ||
          redirectedUrl.includes('.tgz') ||
          (redirectedUrl.includes('/download/') && redirectedUrl.includes('?'))) {
        console.log('[Download] Found potential download URL:', redirectedUrl);
        bestMatch = redirectedUrl;
        bestMatchInitial = initialUrl;
        // Don't break - keep looking for the best match
      }
    }
    
    if (bestMatch) {
      console.log('[Download] Using best match download URL:', bestMatch);
      finalUrl = bestMatch;
      if (bestMatchInitial) {
        downloadRedirects.delete(bestMatchInitial);
      }
    }
  }

  pendingDownload = {
    url: finalUrl,
    originalUrl: downloadItem.url, // Keep original URL for reference
    filename: filenameOnly,
    referrer: downloadItem.referrer,
    mime: downloadItem.mime,
    fileSize: downloadItem.fileSize,
    timestamp: Date.now(),
  };

  // Get cookies for the final download URL (after redirects)
  const cookies = await getCookiesForUrl(finalUrl);
  pendingDownload.cookies = cookies;

  // Clean up old redirect entries (older than 30 seconds)
  const now = Date.now();
  for (const [url, timestamp] of downloadRedirects.entries()) {
    if (typeof timestamp === 'number' && now - timestamp > 30000) {
      downloadRedirects.delete(url);
    }
  }

  // Show download options popup
  showDownloadOptionsPopup();
});

// Get cookies for a given URL
async function getCookiesForUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Get all cookies for this domain
    const cookies = await chrome.cookies.getAll({ domain: domain });

    // Also try to get cookies for parent domains
    const domainParts = domain.split(".");
    const allCookies = [...cookies];

    if (domainParts.length > 2) {
      const parentDomain = domainParts.slice(1).join(".");
      const parentCookies = await chrome.cookies.getAll({
        domain: parentDomain,
      });
      allCookies.push(...parentCookies);
    }

    // Remove duplicates
    const uniqueCookies = allCookies.filter(
      (cookie, index, self) =>
        index ===
        self.findIndex(
          (c) => c.name === cookie.name && c.domain === cookie.domain
        )
    );

    return uniqueCookies;
  } catch (error) {
    console.error("Error getting cookies:", error);
    return [];
  }
}

// Show popup window for download options
async function showDownloadOptionsPopup() {
  const width = 550;
  const height = 650;

  // Get current window to position popup relative to it
  // In service workers, we can't access screen directly
  const currentWindow = await chrome.windows.getCurrent();

  let left, top;
  if (
    currentWindow &&
    currentWindow.left !== undefined &&
    currentWindow.width !== undefined
  ) {
    // Center relative to current window
    left = Math.round(currentWindow.left + (currentWindow.width - width) / 2);
    top = Math.round(currentWindow.top + (currentWindow.height - height) / 2);
  } else {
    // Fallback to default position
    left = 100;
    top = 100;
  }

  const popup = await chrome.windows.create({
    url: "popup.html",
    type: "popup",
    width: width,
    height: height,
    left: left,
    top: top,
    focused: true,
  });

  popupWindowId = popup.id;
}

// Message handler for all communications (popup and content script)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle bypass extension flag from content script
    if (request.action === "setBypassExtension") {
      bypassExtension = request.bypass;
      console.log("Bypass extension:", bypassExtension);
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "getPendingDownload") {
      sendResponse({ download: pendingDownload });
      return true;
    }

    if (request.action === "handleDownload") {
      handleDownloadChoice(request.choice, request.downloaderConfig)
        .then(() => {
          sendResponse({ success: true });
          // Close the popup window
          if (popupWindowId) {
            chrome.windows.remove(popupWindowId);
            popupWindowId = null;
          }
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Will respond asynchronously
    }

    if (request.action === "cancelDownload") {
      pendingDownload = null;
      if (popupWindowId) {
        chrome.windows.remove(popupWindowId);
        popupWindowId = null;
      }
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "exportCurl") {
      if (!pendingDownload) {
        sendResponse({ success: false, error: "No pending download" });
        return true;
      }

      const curlCommand = generateCurlCommand(
        pendingDownload.url,
        pendingDownload.filename,
        pendingDownload.cookies,
        pendingDownload.referrer
      );

      // Send command back to popup for clipboard copy (can't access clipboard from service worker)
      sendResponse({ success: true, command: curlCommand });
      return true;
    }
});

// Handle the download based on user's choice
async function handleDownloadChoice(choice, downloaderConfig) {
    if (!pendingDownload) {
      throw new Error("No pending download");
    }

    const { url, filename, cookies, referrer } = pendingDownload;

    switch (choice) {
      case "default":
        // Use Chrome's built-in downloader
        // Add to allowed list to prevent re-interception
        allowedDownloads.add(url);

        // Don't specify filename to avoid path issues - let Chrome handle it
        await chrome.downloads.download({
          url: url,
          saveAs: false,
        });
        break;

      case "local":
        // Forward to local download manager (e.g., Free Download Manager)
        await forwardToLocalDownloader(
          downloaderConfig,
          url,
          filename,
          cookies,
          referrer
        );
        break;

      case "remote":
        // Forward to remote downloader (e.g., curl, qBittorrent)
        await forwardToRemoteDownloader(
          downloaderConfig,
          url,
          filename,
          cookies,
          referrer
        );
        break;

      default:
        throw new Error("Invalid download choice");
    }

    pendingDownload = null;
  }

  // Forward download to local downloader
  async function forwardToLocalDownloader(
    config,
    url,
    filename,
    cookies,
    referrer
  ) {
    // Create a command that includes cookies
    const cookieString = formatCookiesForLocalDownloader(cookies, config.type);

    // Generate a download command file
    const command = generateLocalDownloadCommand(
      config,
      url,
      filename,
      cookieString,
      referrer
    );

    // Create a notification with instructions
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Download Forwarded to Local Manager",
      message: `Copy the command from the notification or check the downloaded command file.`,
      priority: 2,
    });

    // Create a downloadable command file using data URL
    const base64Command = btoa(unescape(encodeURIComponent(command)));
    const dataUrl = `data:text/plain;base64,${base64Command}`;

    await chrome.downloads.download({
      url: dataUrl,
      filename: `download_command_${Date.now()}.txt`,
      saveAs: false,
    });

    // Also copy to clipboard if possible (requires user interaction in popup)
    console.log("Generated command:", command);
  }

  // Forward download to remote downloader
  async function forwardToRemoteDownloader(
    config,
    url,
    filename,
    cookies,
    referrer
  ) {
    const cookieString = formatCookiesForRemoteDownloader(cookies, config.type);

    if (config.type === "curl") {
      await sendToCurlRemote(config, url, filename, cookieString, referrer);
    } else if (config.type === "qbittorrent") {
      await sendToQBittorrent(config, url, filename, cookieString, referrer);
    } else if (config.type === "aria2") {
      await sendToAria2(config, url, filename, cookieString, referrer);
    }
  }

  // Format cookies for local downloaders
  function formatCookiesForLocalDownloader(cookies, downloaderType) {
    if (downloaderType === "fdm") {
      // Free Download Manager format
      return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    } else if (downloaderType === "idm") {
      // Internet Download Manager format
      return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
    // Default: Netscape cookie format
    return cookies
      .map(
        (c) =>
          `${c.domain}\t${c.hostOnly ? "FALSE" : "TRUE"}\t${c.path}\t${
            c.secure ? "TRUE" : "FALSE"
          }\t${Math.floor(c.expirationDate || 0)}\t${c.name}\t${c.value}`
      )
      .join("\n");
  }

  // Format cookies for remote downloaders
  function formatCookiesForRemoteDownloader(cookies, downloaderType) {
    if (downloaderType === "curl" || downloaderType === "wget") {
      // curl/wget cookie format
      return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    } else if (downloaderType === "aria2") {
      // aria2 header format
      return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  // Generate command for local downloader
  function generateLocalDownloadCommand(
    config,
    url,
    filename,
    cookieString,
    referrer
  ) {
    let command = "";

    if (config.type === "fdm") {
      // Free Download Manager CLI
      command = `"${config.path}" "${url}" --cookies "${cookieString}"`;
      if (referrer) {
        command += ` --referer "${referrer}"`;
      }
    } else if (config.type === "curl") {
      command = `curl -o "${filename}" -H "Cookie: ${cookieString}"`;
      if (referrer) {
        command += ` -H "Referer: ${referrer}"`;
      }
      command += ` "${url}"`;
    } else if (config.type === "wget") {
      command = `wget -O "${filename}" --header="Cookie: ${cookieString}"`;
      if (referrer) {
        command += ` --referer="${referrer}"`;
      }
      command += ` "${url}"`;
    }

    return command;
  }

  // Send to remote curl endpoint
  async function sendToCurlRemote(
    config,
    url,
    filename,
    cookieString,
    referrer
  ) {
    const command = `curl -o "${filename}" -H "Cookie: ${cookieString}"`;
    const fullCommand = referrer
      ? `${command} -H "Referer: ${referrer}" "${url}"`
      : `${command} "${url}"`;

    // Send command to remote server via SSH or API
    if (config.sshHost) {
      // Generate SSH command
      const sshCommand = `ssh ${config.sshUser}@${config.sshHost} '${fullCommand}'`;

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Remote Download Command",
        message: `Execute this command on your remote server:\n${sshCommand}`,
        priority: 2,
      });

      // Download command file using data URL
      const base64Command = btoa(unescape(encodeURIComponent(sshCommand)));
      const dataUrl = `data:text/plain;base64,${base64Command}`;
      await chrome.downloads.download({
        url: dataUrl,
        filename: `remote_download_${Date.now()}.sh`,
        saveAs: false,
      });
    }
  }

  // Send to qBittorrent Web UI
  async function sendToQBittorrent(
    config,
    url,
    filename,
    cookieString,
    referrer
  ) {
    try {
      // Login to qBittorrent Web UI
      const loginResponse = await fetch(
        `${config.webUIUrl}/api/v2/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `username=${encodeURIComponent(
            config.username
          )}&password=${encodeURIComponent(config.password)}`,
        }
      );

      if (!loginResponse.ok) {
        throw new Error("Failed to login to qBittorrent");
      }

      // Add download with cookies
      const formData = new FormData();
      formData.append("urls", url);
      formData.append("cookie", cookieString);
      if (filename) {
        formData.append("rename", filename);
      }

      const addResponse = await fetch(
        `${config.webUIUrl}/api/v2/torrents/add`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (addResponse.ok) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Download Added",
          message: `Successfully added download to qBittorrent`,
          priority: 1,
        });
      }
    } catch (error) {
      console.error("Error sending to qBittorrent:", error);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Download Failed",
        message: `Failed to add to qBittorrent: ${error.message}`,
        priority: 2,
      });
    }
  }

  // Generate curl command for export
  function generateCurlCommand(url, filename, cookies, referrer) {
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Generate default filename from URL if not provided
    let outputFilename = filename;
    if (!outputFilename) {
      try {
        const urlPath = new URL(url).pathname;
        outputFilename = urlPath.split("/").pop() || "download";
        // If no extension, try to add one
        if (!outputFilename.includes(".")) {
          outputFilename += ".html";
        }
      } catch {
        outputFilename = "download";
      }
    }

    let command = `curl -L`;

    if (outputFilename) {
      command += ` -o "${outputFilename}"`;
    }

    if (cookieString) {
      command += ` -H "Cookie: ${cookieString}"`;
    }

    if (referrer) {
      command += ` -H "Referer: ${referrer}"`;
    }

    // Add user agent
    command += ` -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`;

    command += ` "${url}"`;

    return command;
  }

  // Send to aria2 RPC
  async function sendToAria2(config, url, filename, cookieString, referrer) {
    try {
      const options = {
        header: [`Cookie: ${cookieString}`],
      };

      if (referrer) {
        options.header.push(`Referer: ${referrer}`);
      }

      if (filename) {
        options.out = filename;
      }

      const payload = {
        jsonrpc: "2.0",
        id: "download_" + Date.now(),
        method: "aria2.addUri",
        params: [
          config.token ? `token:${config.token}` : "",
          [url],
          options,
        ].filter(Boolean),
      };

      const response = await fetch(config.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Download Added",
          message: `Successfully added download to aria2`,
          priority: 1,
        });
      }
    } catch (error) {
      console.error("Error sending to aria2:", error);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Download Failed",
        message: `Failed to add to aria2: ${error.message}`,
        priority: 2,
      });
    }
  }
