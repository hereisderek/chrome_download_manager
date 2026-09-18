# Project Roadmap & Major Milestones

This document tracks major and semi-major features, capabilities, and roadmap items for the Chrome Download Manager extension.

---

## 🚀 Completed Major & Semi-Major Updates

### 1. Direct Free Download Manager (FDM) Integration & In-App Diagnostics
- **Native Messaging & Protocol Integration**: Direct communication with FDM's native messaging host (`org.freedownloadmanager.fdm5.cnh`) with automatic cookie forwarding and fallback to the `fdm://` URL protocol scheme.
- **In-App Diagnostic Suite**: Real-time diagnostic tool in Options checking official FDM extension status (`chrome.management`), native messaging authorization, and protocol scheme support.
- **Educational Guide & Origin Helper**: Built-in interactive guidance modal explaining extension origin authorization on macOS/Windows, featuring a 1-click extension ID/origin copier and native host manifest paths.

### 2. 1-Click Local Application Dispatch (Elimination of .txt files)
- **Direct RPC & Local APIs**: Replaced manual `.txt` script generation with direct 1-click triggers for Motrix (`:16800`), Aria2 (`:6800`), and JDownloader 2 Click'n'Load (`:9666`).
- **Custom OS Protocol Schemes**: Support for launching desktop downloaders via registered URL schemes (e.g. `motrix://`, `thunder://`, custom patterns).
- **Type-Specific Dynamic Configuration**: Dynamic form fields in Options that display and persist only the parameters applicable to the selected downloader (RPC endpoint, secret token, or scheme pattern), keeping configurations clean.

### 3. Full Shell Command Compression Engine
- **POSIX Self-Executing Compression**: Automated compression of entire shell commands into compact `eval "$(printf '%s' '<data>' | base64 -d | gzip -dc)"` one-liners using standard POSIX utilities.
- **Universal Availability**: Supported across cURL, Wget, SSH cURL, and custom templates, shrinking bloated multi-kilobyte cookies and commands by ~90%.

### 4. SSH Remote cURL & Command Template Engine
- **In-Popup Remote Overrides**: Contextual popdown panel allowing on-the-fly customization of remote target paths, SSH passwords (with show/hide toggle), and private keys.
- **Custom Command Template Builder**: User-defined command templates with placeholder replacement, real-time syntax validation, and deep-linked configuration hubs.

### 5. Resilient MV3 Interception & Service Worker State Management
- **Dormancy-Resistant State**: Dual in-memory and `chrome.storage.session` synchronization ensuring pending downloads survive MV3 service worker sleep cycles.
- **Clean Lifecycle Interception**: Strictly synchronized `onDeterminingFilename` and cancellation lifecycle to prevent browser warnings and race conditions on high-speed connections.

---

## 🔮 Upcoming Major & Semi-Major Roadmap

- [ ] **Automated Routing Rules Engine**
  - Configurable auto-routing rules based on URL patterns, domains, MIME types, or file sizes (e.g., `.torrent` / `.magnet` auto-routed to qBittorrent, large video files auto-routed to FDM).
  - Rule priority management and default fallback downloader selection.

- [ ] **Native IDM (Internet Download Manager) Integration**
  - Seamless 1-click forwarding to Internet Download Manager on Windows via native messaging or protocol hooks, matching the FDM workflow without manual path entry.

- [ ] **Active Downloads & Queue Monitoring Dashboard**
  - Unified status overlay or dedicated tab to monitor active downloads, speeds, and completion statuses across connected services (Aria2, Motrix, qBittorrent, and Chrome).

- [ ] **Lightweight Native Companion Bridge (Optional)**
  - Optional minimal native messaging bridge for macOS, Linux, and Windows to launch CLI tools (cURL, Wget, custom scripts) in the background without requiring terminal copy-pasting.
