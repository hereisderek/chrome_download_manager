let pendingDownload = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get pending download from background
  chrome.runtime.sendMessage({ action: 'getPendingDownload' }, async (response) => {
    if (response && response.download) {
      pendingDownload = response.download;
      displayDownloadInfo(pendingDownload);
      await loadDownloaderConfigs();
    } else {
      showError('No pending download found');
    }
  });
  
  // Set up event listeners
  document.getElementById('defaultBtn').addEventListener('click', () => {
    handleDownload('default');
  });
  
  document.getElementById('exportCurlBtn').addEventListener('click', () => {
    exportAsCurl();
  });
  
  document.getElementById('cancelBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'cancelDownload' }, () => {
      window.close();
    });
  });
  
  document.getElementById('openOptions')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('openOptionsRemote')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

// Display download information
function displayDownloadInfo(download) {
  const urlElement = document.getElementById('downloadUrl');
  const filenameElement = document.getElementById('downloadFilename');
  const sizeElement = document.getElementById('downloadSize');
  const cookieCountElement = document.getElementById('cookieCount');
  
  // Truncate long URLs
  const url = download.url.length > 60 ? download.url.substring(0, 60) + '...' : download.url;
  urlElement.textContent = url;
  urlElement.title = download.url;
  
  const filename = download.filename || 'Unknown';
  filenameElement.textContent = filename;
  
  const size = download.fileSize ? formatBytes(download.fileSize) : 'Unknown';
  sizeElement.textContent = size;
  
  const cookieCount = download.cookies ? download.cookies.length : 0;
  cookieCountElement.textContent = `${cookieCount} cookie${cookieCount !== 1 ? 's' : ''}`;
}

// Load configured downloaders
async function loadDownloaderConfigs() {
  const result = await chrome.storage.sync.get(['localDownloaders', 'remoteDownloaders']);
  
  // Load local downloaders
  const localContainer = document.getElementById('localDownloaders');
  if (result.localDownloaders && result.localDownloaders.length > 0) {
    localContainer.innerHTML = '';
    result.localDownloaders.forEach(downloader => {
      if (downloader.enabled) {
        const btn = createDownloaderButton(downloader, 'local');
        localContainer.appendChild(btn);
      }
    });
  }
  
  // Load remote downloaders
  const remoteContainer = document.getElementById('remoteDownloaders');
  if (result.remoteDownloaders && result.remoteDownloaders.length > 0) {
    remoteContainer.innerHTML = '';
    result.remoteDownloaders.forEach(downloader => {
      if (downloader.enabled) {
        const btn = createDownloaderButton(downloader, 'remote');
        remoteContainer.appendChild(btn);
      }
    });
  }
}

// Create downloader button
function createDownloaderButton(downloader, type) {
  const button = document.createElement('button');
  button.className = 'option-btn';
  button.dataset.type = type;
  button.dataset.config = JSON.stringify(downloader);
  
  const icon = getDownloaderIcon(downloader.type);
  
  button.innerHTML = `
    <span class="icon">${icon}</span>
    <span class="text">
      <strong>${downloader.name}</strong>
      <small>${downloader.description || getDownloaderDescription(downloader.type)}</small>
    </span>
  `;
  
  button.addEventListener('click', () => {
    handleDownload(type, downloader);
  });
  
  return button;
}

// Get icon for downloader type
function getDownloaderIcon(type) {
  const icons = {
    'fdm': '📥',
    'idm': '⚡',
    'curl': '🔧',
    'wget': '🔧',
    'qbittorrent': '🌊',
    'aria2': '🚀'
  };
  return icons[type] || '📦';
}

// Get description for downloader type
function getDownloaderDescription(type) {
  const descriptions = {
    'fdm': 'Free Download Manager',
    'idm': 'Internet Download Manager',
    'curl': 'cURL command-line tool',
    'wget': 'Wget command-line tool',
    'qbittorrent': 'qBittorrent Web UI',
    'aria2': 'aria2 RPC'
  };
  return descriptions[type] || 'External downloader';
}

// Handle download choice
function handleDownload(choice, downloaderConfig = null) {
  const button = choice === 'default' ? document.getElementById('defaultBtn') : event.target.closest('.option-btn');
  
  // Disable all buttons
  document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
  document.getElementById('cancelBtn').disabled = true;
  
  // Show loading state
  if (button) {
    button.classList.add('loading');
  }
  
  chrome.runtime.sendMessage({
    action: 'handleDownload',
    choice: choice,
    downloaderConfig: downloaderConfig
  }, (response) => {
    if (response && response.success) {
      showSuccess('Download initiated successfully');
      setTimeout(() => window.close(), 1000);
    } else {
      showError(response?.error || 'Failed to initiate download');
      // Re-enable buttons
      document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = false);
      document.getElementById('cancelBtn').disabled = false;
      if (button) {
        button.classList.remove('loading');
      }
    }
  });
}

// Format bytes to human-readable size
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return 'Unknown';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Show error message
function showError(message) {
  const container = document.querySelector('.container');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'message error';
  errorDiv.textContent = message;
  container.insertBefore(errorDiv, container.firstChild);
  
  setTimeout(() => errorDiv.remove(), 5000);
}

// Export as cURL command
function exportAsCurl() {
  const button = document.getElementById('exportCurlBtn');
  
  // Disable all buttons
  document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
  document.getElementById('cancelBtn').disabled = true;
  
  // Show loading state
  button.classList.add('loading');
  
  chrome.runtime.sendMessage({ action: 'exportCurl' }, async (response) => {
    if (response && response.success && response.command) {
      try {
        // Copy to clipboard
        await navigator.clipboard.writeText(response.command);
        showSuccess('cURL command copied to clipboard!');
        setTimeout(() => window.close(), 1500);
      } catch (error) {
        showError('Failed to copy to clipboard: ' + error.message);
        // Re-enable buttons
        document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = false);
        document.getElementById('cancelBtn').disabled = false;
        button.classList.remove('loading');
      }
    } else {
      showError(response?.error || 'Failed to generate cURL command');
      // Re-enable buttons
      document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = false);
      document.getElementById('cancelBtn').disabled = false;
      button.classList.remove('loading');
    }
  });
}

// Show success message
function showSuccess(message) {
  const container = document.querySelector('.container');
  const successDiv = document.createElement('div');
  successDiv.className = 'message success';
  successDiv.textContent = message;
  container.insertBefore(successDiv, container.firstChild);
}
