# Project Progress & TODOs

This file tracks active tasks, bugs, and upcoming features for the Chrome Download Manager extension.

---

## Active TODOs & Bug Fixes

- [x] **Always show a link in the download popup to the config page**
  - Ensure there is a permanent, persistent link/button in the download popup (e.g. in the footer or header) to open the extension Options page, regardless of whether any downloaders or templates are currently configured.

- [x] **Always show "Configure" button to the right of section headers with deep-linking**
  - Display a "Configure" link/button to the right of:
    - `Command templates` &rarr; opens options page focused on **Command Templates** (`#custom`)
    - `Local downloaders` &rarr; opens options page focused on **Local Downloaders** (`#local`)
    - `Remote downloaders` &rarr; opens options page focused on **Remote Downloaders** (`#remote`)
  - Ensure clicking takes the user directly to the respective tab, not just the default options page.

- [x] **Fix Extension Page Error: `Uncaught (in promise) Error: Unable to download all specified images.`**
  - **Location**: `src/background/effects.ts` (`notify()`).
  - **Root Cause**: `chrome.notifications.create` uses relative path `iconUrl: "icons/icon48.png"`. In service worker contexts, relative icon paths fail image loading unless resolved using `chrome.runtime.getURL("icons/icon48.png")`.
  - **Fix**: Use `chrome.runtime.getURL("icons/icon48.png")` for notification icon URLs.

- [x] **Fix Extension Page Error: `Unchecked runtime.lastError: Download must be in progress`**
  - **Location**: `src/background/downloadInterceptor.ts` (`chrome.downloads.cancel(item.id, ...)`).
  - **Root Cause**: If a download completes, fails, or is cancelled before `chrome.downloads.cancel` finishes, Chrome sets `chrome.runtime.lastError = { message: "Download must be in progress" }`. Because the callback does not inspect `chrome.runtime.lastError`, Chrome logs an "Unchecked runtime.lastError".
  - **Fix**: Check and clear `chrome.runtime.lastError` inside the `chrome.downloads.cancel` callback.

- [x] **Validate custom command template placeholders on save**
  - In the Options page Command Template form, validate all placeholders used in the template string when saving.
  - If invalid/unrecognized placeholders or malformed placeholder syntax are detected, display an error message in red and prevent saving.

- [x] **Fix cURL (SSH) Remote Downloader downloading a .txt file instead of remote execution**
  - **Issue**: When using a cURL (SSH) remote downloader, selecting it currently downloads a `.txt` file containing the command to the local machine rather than triggering or managing remote execution properly.
  - **Download path in popup**: When selecting the remote downloader in the popup, allow the user to optionally specify the target folder/file to download the file to on the remote server.
  - **Auth options in config**: In the remote downloader config for cURL (SSH), allow the user to optionally specify:
    - SSH password
    - SSH private key (file path or raw key content)

- [x] **Compress entire shell command instead of just cookies**
  - Replace "Compress cookies" with "Compress command (shorter one-liner)", compressing the entire shell command using gzip + base64 into a self-executing `eval "$(printf '%s' '<data>' | base64 -d | gzip -dc)"` one-liner.
  - Ensure the option is always visible and available for all commands (cURL, Wget, custom templates, and SSH cURL).

- [x] **Show command box and overrides directly below clicked downloader selection**
  - Dynamically move the `#commandPanel` immediately below the selected item (whether built-in, custom template, or remote downloader).
  - Provide popup overrides for cURL (SSH): destination folder/file, password with privacy protection (`type="password"` with show/hide toggle), private key path, and key content.

- [x] **Expand default size of the popup window**
  - Increased popup window dimensions to 680x760px and overlay dimensions to 600x750px to comfortably display all content, downloader lists, and command panels without unnecessary scrolling.

- [x] **Fix "no pending download" error when downloading with Chrome downloader**
  - **Issue**: Sometimes when clicking "Chrome downloader", the popup displays an error in red: "No pending download".
  - **Root Cause**: Manifest V3 service worker goes idle / sleeps after inactivity, which wipes in-memory variables (`pendingDownload`). When the user clicks the button, the newly woken-up service worker has `pendingDownload = null`.
  - **Fix**:
    1. Pass `download: pendingDownload` directly in the `handleDownload` message from the popup (which already holds the pending download in its own memory).
    2. Persist `pendingDownload` in `chrome.storage.session` so it survives service worker dormancy.
    3. Allow downloads by returned `downloadId` in addition to URL matching so re-triggered Chrome downloads are never accidentally intercepted or lost.

- [x] **Fix persistent `Unchecked runtime.lastError: Download must be in progress`**
  - **Issue**: The extension page console still reports `Unchecked runtime.lastError: Download must be in progress`.
  - **Root Cause**: In `downloadInterceptor.ts`, calling `suggest()` synchronously while simultaneously calling `chrome.downloads.cancel(item.id)` creates a race condition where fast/small downloads finish before `cancel()` completes. Calling `cancel` on a completed download fails with `Download must be in progress`. Furthermore, calling `chrome.downloads.erase({ id: item.id })` with `.catch()` leaves `chrome.runtime.lastError` unchecked in Chromium.
  - **Fix**: Do not call `suggest()` when canceling an intercepted download. Catch and clear `chrome.runtime.lastError` via callbacks on both `chrome.downloads.cancel` and `chrome.downloads.erase`.

- [x] **Support Direct Local Downloader Invocation & Eliminate .txt File Downloads**
  - **Issue**: Clicking a Local Downloader (FDM, IDM, cURL, Wget) previously downloaded a `download_command_<timestamp>.txt` file instead of directly triggering the download in the application.
  - **Fix**:
    1. **Eliminated `.txt` file generation entirely**: Removed all calls to `downloadTextFile` for local downloaders.
    2. **1-Click Local RPC / API Support**: Added native 1-click downloads for Motrix (`http://127.0.0.1:16800/jsonrpc`), JDownloader 2 (`http://127.0.0.1:9666/flash/add`), and Aria2 (`http://127.0.0.1:6800/jsonrpc`), communicating directly from Chrome extension JavaScript via HTTP/RPC with zero extra files or terminal scripts required on the user's computer.
    3. **Custom URL Protocol Schemes**: Supported opening registered OS URL schemes (`motrix://{url}`, `thunder://{url}`, etc.) directly via browser navigation.
    4. **Unified Popup Command Panel for CLI Tools**: For CLI tools (cURL, Wget, FDM, IDM), clicking them displays the command panel directly beneath the item with 1-click **Copy Command** and compression options.


