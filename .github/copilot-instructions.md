# Advanced Download Manager - AI Agent Instructions

## Project Overview

A Chrome Manifest V3 extension that intercepts downloads and routes them to various download managers (built-in, local, or remote) with automatic cookie extraction and forwarding. The extension acts as a middleware layer between Chrome's download system and external download tools.

## Architecture

### Core Components

1. **background.js** (Service Worker)
   - Intercepts all downloads via `chrome.downloads.onCreated` listener
   - Immediately cancels and erases original download to take control
   - Extracts cookies from download URL domain (including parent domains)
   - Opens popup window for user to choose download method
   - Handles message passing between popup and background contexts
   - Implements downloader-specific routing logic

2. **popup.html/js** (Download Choice UI)
   - Modal popup triggered on each download
   - Displays download metadata (URL, filename, size, cookie count)
   - Shows configured downloaders as action buttons
   - Provides "Export as cURL" option to generate command with cookies
   - Sends user's choice back to background worker

3. **options.html/js** (Configuration Page)
   - Tab-based interface for local/remote downloader configuration
   - CRUD operations for downloader configs stored in `chrome.storage.sync`
   - Type-specific form fields that show/hide based on downloader type

### Data Flow

```
Download Triggered → background.js intercepts → Extract cookies → 
Show popup → User selects method → background.js routes download →
Execute via Chrome API / Generate command / Send to remote API / Export cURL
```

## Key Features

### cURL Command Export

- **Generation**: `generateCurlCommand()` creates a complete cURL command with:
  - All cookies in HTTP header format
  - Referrer header if present
  - User-Agent header for compatibility
  - Proper filename output with `-o` flag
  - `-L` flag to follow redirects
- **Export**: Creates downloadable `.sh` file with executable bash script
- **Notification**: Shows system notification with usage instructions
- **Use Case**: Allows users to execute downloads manually or transfer to other systems

## Key Patterns

### URL Redirect Tracking

- **Problem**: Dynamic download links (e.g., Google Takeout) use multiple redirects before reaching the final download URL
- **Solution**: Uses `chrome.webRequest` API to track redirect chains
- **Implementation**: 
  - `onBeforeRequest`: Stores initial URL for each request
  - `onBeforeRedirect`: Tracks redirect chain, maps initial → intermediate → final URLs
  - `onCompleted`: Stores final URL after all redirects complete
  - `downloadRedirects` Map: Stores mapping of initial URL to final URL
- **Usage**: When download is intercepted, checks if a final redirected URL exists and uses it instead of the initial URL
- **Cleanup**: Automatically cleans up redirect tracking data after 5 seconds to prevent memory leaks

### Cookie Handling

- **Extraction**: `chrome.cookies.getAll()` for both exact domain and parent domains
- **Deduplication**: Filters cookies by name+domain to remove duplicates
- **Format Conversion**: Different formats for different tools:
  - **Local tools**: Netscape format or semicolon-separated
  - **Remote APIs**: HTTP Cookie header format
  - Implemented in `formatCookiesForLocalDownloader()` and `formatCookiesForRemoteDownloader()`

### Download Interception

- Must use `chrome.downloads.cancel()` followed by `chrome.downloads.erase()` immediately in `onCreated` listener
- Store download metadata in `pendingDownload` global variable
- Single pending download at a time (new download replaces previous if not handled)

### Message Passing

- Background uses `chrome.runtime.onMessage.addListener()` for:
  - `getPendingDownload`: Returns stored download info to popup
  - `handleDownload`: Processes user's choice and routing config
  - `cancelDownload`: Cleans up pending download and closes popup
  - `exportCurl`: Generates and exports cURL command with cookies
- All handlers return `true` to indicate async response via `sendResponse()`

### Storage Schema

Stored in `chrome.storage.sync`:

```javascript
{
  localDownloaders: [
    { name, type, path, description, enabled }
  ],
  remoteDownloaders: [
    { name, type, description, enabled, 
      // Type-specific fields:
      sshHost, sshUser,           // for curl
      webUIUrl, username, password, // for qbittorrent
      rpcUrl, token               // for aria2
    }
  ]
}
```

### Downloader Types

**Local**: `fdm`, `idm`, `curl`, `wget`
- Generates command strings with cookie headers
- Creates downloadable .txt/.sh file with command
- Shows notification with instructions

**Remote**: `curl` (SSH), `qbittorrent`, `aria2`
- **curl**: Generates SSH command string for remote execution
- **qbittorrent**: Direct Web UI API integration with login
- **aria2**: JSON-RPC calls with token auth

## Development Workflow

### Testing Extension

```bash
# Load unpacked extension in Chrome
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the chrome_download_manager directory
```

### Testing Downloads

- Trigger any download in Chrome (right-click → Save link as, or direct file link)
- Popup should appear immediately
- Check Console in background page (chrome://extensions/ → Details → Inspect views: service worker)

### Debugging

- **Background logs**: Inspect service worker in chrome://extensions/
- **Popup logs**: Right-click popup → Inspect
- **Options page logs**: Right-click options page → Inspect
- **Check permissions**: Ensure `downloads`, `cookies`, `storage`, `notifications`, `webRequest` are granted

### Common Issues

1. **Downloads not intercepted**: Check if service worker is active (refresh in chrome://extensions/)
2. **Cookies not extracted**: Verify `host_permissions: ["<all_urls>"]` is present
3. **Remote API failures**: Check CORS settings on remote server (qBittorrent/aria2)
4. **Storage not syncing**: `chrome.storage.sync` has quota limits (~100KB)

## Code Conventions

- **Async/await** preferred over promise chains
- **Error handling**: Always wrap API calls in try-catch, show user-friendly notifications
- **Validation**: Check for null/undefined before accessing download metadata
- **UI state**: Disable buttons during async operations, show loading states
- **Message format**: Use `{ action: string, ...data }` pattern for runtime messages

## Extension Manifest Notes

- **Manifest V3** required (V2 deprecated)
- **Service worker** replaces background page (no persistent background)
- **host_permissions** separate from permissions in V3
- **action** replaces browser_action/page_action

## File Organization

```
chrome_download_manager/
├── manifest.json          # Extension config
├── background.js          # Service worker (main logic)
├── popup.html/js/css      # Download choice UI
├── options.html/js/css    # Settings page
└── icons/                 # Extension icons (16, 48, 128px)
```

## Testing Remote Downloaders

### qBittorrent Setup
1. Enable Web UI in qBittorrent settings
2. Configure port (default 8080) and auth
3. Add to remote downloaders with `http://host:port` format

### aria2 Setup
1. Start aria2 with RPC enabled: `aria2c --enable-rpc`
2. Use `http://localhost:6800/jsonrpc` as RPC URL
3. Add secret token if configured: `--rpc-secret=TOKEN`

## Security Considerations

- Passwords stored in `chrome.storage.sync` are synced across devices (not encrypted by default)
- Cookies are only extracted for actively downloaded URLs
- SSH credentials require user to execute commands manually (no auto-execution)
- Remote API connections should use HTTPS in production
