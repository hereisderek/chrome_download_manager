import { buildLocalCommand } from "../downloaders/local.ts";
import { buildSshCurlCommand, sendToAria2, sendToQBittorrent } from "../downloaders/remote.ts";
import { buildCurlCommand, buildWgetCommand, isReauthCheckpoint } from "../lib/commands.ts";
import { compressCookieHeader, formatCookieHeader } from "../lib/cookies.ts";
import type { ExportTool, Message, Response } from "../lib/messages.ts";
import type { DownloadChoice, DownloadContext } from "../lib/types.ts";
import { downloadTextFile, notify } from "./effects.ts";
import { closeDownloadPopup } from "./popupWindow.ts";
import { allowDownload, getPendingDownload, setBypassNextDownload, setPendingDownload } from "./state.ts";

async function buildExportCommand(tool: ExportTool, ctx: DownloadContext, compressCookies?: boolean): Promise<string> {
  let compressedCookie: string | undefined;
  if (compressCookies && ctx.cookies.length > 0) {
    const cookieHeader = formatCookieHeader(ctx.cookies);
    if (cookieHeader) {
      compressedCookie = await compressCookieHeader(cookieHeader);
    }
  }
  const opts = { mimicBrowserNavigation: true, compressedCookie };
  return tool === "curl" ? buildCurlCommand(ctx, opts) : buildWgetCommand(ctx, opts);
}

async function routeDownload(choice: DownloadChoice, ctx: DownloadContext): Promise<void> {
  switch (choice.kind) {
    case "chrome":
      // No custom headers here: chrome.downloads.download() throws on
      // "unsafe" header names, and Referer is one of them (along with
      // Cookie, Origin, Host, ...) - the browser reserves control of those.
      // This path was never actually broken; it uses Chrome's own request,
      // cookies included automatically, same as any normal download.
      allowDownload(ctx.url);
      if (ctx.originalUrl) allowDownload(ctx.originalUrl);
      await chrome.downloads.download({ url: ctx.url, saveAs: false });
      return;

    case "local": {
      const command = buildLocalCommand(choice.config, ctx);
      await downloadTextFile(`download_command_${Date.now()}.txt`, command);
      notify("Download Forwarded to Local Manager", "Command saved to a text file - open it to copy the command.");
      return;
    }

    case "remote": {
      if (choice.config.type === "ssh-curl") {
        notify("SSH Command", "Please copy the SSH command from the download popup.");
        return;
      }
      if (choice.config.type === "qbittorrent") {
        await sendToQBittorrent(choice.config, ctx);
        notify("Download Added", "Successfully added the download to qBittorrent.");
        return;
      }
      await sendToAria2(choice.config, ctx);
      notify("Download Added", "Successfully added the download to aria2.");
      return;
    }
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse: (response: Response) => void) => {
  switch (message.action) {
    case "setBypassExtension":
      setBypassNextDownload(message.bypass);
      sendResponse({ success: true });
      return true;

    case "getPendingDownload":
      sendResponse({ success: true, download: getPendingDownload() });
      return true;

    case "handleDownload": {
      const pending = getPendingDownload();
      if (!pending) {
        sendResponse({ success: false, error: "No pending download" });
        return true;
      }
      routeDownload(message.choice, pending)
        .then(() => {
          setPendingDownload(null);
          closeDownloadPopup();
          sendResponse({ success: true });
        })
        .catch((error: unknown) => {
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    case "cancelDownload":
      setPendingDownload(null);
      closeDownloadPopup();
      sendResponse({ success: true });
      return true;

    case "exportCommand": {
      const pending = getPendingDownload();
      if (!pending) {
        sendResponse({ success: false, error: "No pending download" });
        return true;
      }
      const warning = isReauthCheckpoint(pending.url)
        ? "Google is asking to re-verify this session before releasing the file. That step needs a real browser to pass - this command likely won't work. Try \"Chrome downloader\" instead."
        : undefined;
      buildExportCommand(message.tool, pending, message.compressCookies)
        .then((command) => {
          sendResponse({ success: true, command, warning });
        })
        .catch((error: unknown) => {
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }
  }
});
