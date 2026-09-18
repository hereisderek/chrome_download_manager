# Project Progress & TODOs

This file tracks active tasks, bugs, and upcoming features for the Chrome Download Manager extension.

---

## Active TODOs & Bug Fixes

- [ ] **Always show a link in the download popup to the config page**
  - Ensure there is a permanent, persistent link/button in the download popup (e.g. in the footer or header) to open the extension Options page, regardless of whether any downloaders or templates are currently configured.

- [ ] **Always show "Configure" button to the right of section headers with deep-linking**
  - Display a "Configure" link/button to the right of:
    - `Command templates` &rarr; opens options page focused on **Command Templates** (`#custom`)
    - `Local downloaders` &rarr; opens options page focused on **Local Downloaders** (`#local`)
    - `Remote downloaders` &rarr; opens options page focused on **Remote Downloaders** (`#remote`)
  - Ensure clicking takes the user directly to the respective tab, not just the default options page.

- [ ] **Fix Extension Page Error: `Uncaught (in promise) Error: Unable to download all specified images.`**
  - **Location**: `src/background/effects.ts` (`notify()`).
  - **Root Cause**: `chrome.notifications.create` uses relative path `iconUrl: "icons/icon48.png"`. In service worker contexts, relative icon paths fail image loading unless resolved using `chrome.runtime.getURL("icons/icon48.png")`.
  - **Fix**: Use `chrome.runtime.getURL("icons/icon48.png")` for notification icon URLs.

- [ ] **Fix Extension Page Error: `Unchecked runtime.lastError: Download must be in progress`**
  - **Location**: `src/background/downloadInterceptor.ts` (`chrome.downloads.cancel(item.id, ...)`).
  - **Root Cause**: If a download completes, fails, or is cancelled before `chrome.downloads.cancel` finishes, Chrome sets `chrome.runtime.lastError = { message: "Download must be in progress" }`. Because the callback does not inspect `chrome.runtime.lastError`, Chrome logs an "Unchecked runtime.lastError".
  - **Fix**: Check and clear `chrome.runtime.lastError` inside the `chrome.downloads.cancel` callback.
