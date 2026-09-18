# Advanced Download Manager

A Chrome extension that intercepts downloads and gives you complete control over how files are downloaded — without getting in the way of normal browsing. It can route a download to:

* Chrome's built-in downloader
* A local download manager (FDM, IDM, cURL, wget) — generates a command with cookies that you run yourself
* A remote download service (qBittorrent, aria2, SSH + cURL) — sent automatically, cookies included
* Your clipboard, as a ready-to-run cURL command

## Features
- 🎯 **Download Interception** — Catch all downloads before they start
- 🔗 **Smart URL Tracking** — Automatically captures final download URLs even through multiple redirects (works with Google Takeout, etc.)
- 🍪 **Automatic Cookie Forwarding** — Extract and forward cookies to external downloaders
- 📋 **Copy as cURL** — Generate a ready-to-use cURL command with cookies included
- 💻 **Local Downloader Support** — Free Download Manager, IDM, cURL, wget
- 🌐 **Remote Downloader Support** — qBittorrent Web UI, aria2 RPC, SSH + cURL
- ⚙️ **Easy Configuration** — Clean options page for managing downloaders, with dark mode support
- 🔒 **Privacy-Focused** — Cookies are only extracted for downloads you initiate

## Install Locally (Developer Mode)

This extension isn't on the Chrome Web Store yet, so for now it's loaded as an unpacked extension. Source is TypeScript, bundled into a plain-JS `dist/` folder — Chrome loads `dist/`, not the repo root.

1. **Clone the repo**
   ```bash
   git clone https://github.com/hereisderek/chrome_download_manager.git
   cd chrome_download_manager
   ```

2. **Install dependencies and build**
   ```bash
   npm install
   npm run build
   ```
   This produces a self-contained extension in `dist/`.

3. **Load it in Chrome**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (toggle, top-right)
   - Click **Load unpacked**
   - Select the `dist/` folder (not the repo root)
   - The extension icon should appear in your toolbar

4. **Keep it up to date while developing**
   - Run `npm run watch` to rebuild automatically as you edit source files
   - After editing anything under `background/` or `content/`, click the reload icon for the extension on `chrome://extensions/`
   - After editing `popup/` or `options/`, just reopen the popup or options page — no reload needed

### From GitHub Releases

Prefer not to build it yourself? Each release ships a pre-built zip:

1. Go to [Releases](https://github.com/hereisderek/chrome_download_manager/releases)
2. Download the latest `chrome_download_manager.zip`
3. Extract it
4. Open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder

### From the Chrome Web Store

Not published yet — coming once it's had more real-world testing.

## Usage

### Basic Workflow

1. **Configure downloaders** (first time only)
   - Right-click the extension icon → Options (or click the icon, then "Configure now")
   - Add your preferred local and/or remote downloaders
   - Save

2. **Download files as usual**
   - Click any download link, or start a download normally
   - A popup appears with your available options
   - Pick one:
     - **Chrome downloader** — use Chrome's normal downloader
     - **Copy as cURL** — copies a ready-to-run command with cookies to your clipboard
     - Any local or remote downloader you've configured

### Copy as cURL

Copies a complete cURL command — including cookies, referrer, and a spoofed user-agent — to your clipboard. Useful for:

- Running the download on a different machine
- Scheduling it for later
- Debugging why a download isn't working
- Automation scripts

**Example command:**
```bash
curl -L -o 'example_file.zip' \
  -H 'Cookie: session_id=abc123; user_token=xyz789' \
  -H 'Referer: https://example.com/downloads' \
  -H 'User-Agent: Mozilla/5.0...' \
  'https://example.com/download/file.zip'
```

Paste it into a terminal to run it. Every value is single-quote escaped (see [Security notes](#security-notes) below), so it's safe to run even if the filename or URL contains unusual characters.

### Configuring Local Downloaders

Local downloaders generate a command you run yourself — the extension can't execute arbitrary binaries on your machine, only Chrome's own downloads API.

| Type | Path example | Notes |
|---|---|---|
| Free Download Manager (FDM) | `/Applications/FreeDownloadManager.app/Contents/MacOS/fdm` (macOS) or `C:\Program Files\FDM\fdm.exe` (Windows) | Cookie/referrer flags are best-effort, not an officially documented CLI |
| Internet Download Manager (IDM) | `C:\Program Files (x86)\Internet Download Manager\IDMan.exe` | Same caveat as FDM above |
| cURL | `/usr/bin/curl` (usually pre-installed on macOS/Linux) | |
| wget | `/usr/local/bin/wget` or `/opt/homebrew/bin/wget` | May need installing (`brew install wget`) |

### Configuring Remote Downloaders

Remote downloaders are sent the download automatically, with cookies included — no manual step required.

**qBittorrent Web UI**
1. In qBittorrent: Preferences → Web UI → enable it, set a port (default `8080`) and credentials
2. In the extension: Type `qBittorrent Web UI`, Web UI URL `http://localhost:8080` (or your server's address), username, password

**aria2 RPC**
1. Start aria2 with RPC enabled:
   ```bash
   aria2c --enable-rpc --rpc-listen-all=true --rpc-secret=your_secret_token
   ```
2. In the extension: Type `aria2 RPC`, RPC URL `http://localhost:6800/jsonrpc`, and the same secret token

**cURL (SSH)**
Generates an `ssh user@host '<curl command>'` command as a `.sh` file for you to run — nothing is executed automatically.
1. In the extension: Type `cURL (SSH)`, SSH Host (e.g. `example.com` or an IP), SSH User (e.g. `root`)
2. Requires SSH access to that host from wherever you run the generated script

## Supported Downloader Types

| Downloader | Kind | How it runs | Cookie delivery | Requires |
|---|---|---|---|---|
| Chrome downloader | Built-in | Automatic | Native | Nothing — always available |
| Copy as cURL | Clipboard | You paste and run it | `Cookie` header | `curl` on your machine |
| Free Download Manager (FDM) | Local | Generated command, you run it | Best-effort CLI flag | FDM installed |
| Internet Download Manager (IDM) | Local | Generated command, you run it | Best-effort CLI flag | IDM installed |
| cURL | Local | Generated command, you run it | `Cookie` header | `curl` installed |
| wget | Local | Generated command, you run it | `Cookie` header | `wget` installed |
| qBittorrent | Remote | Automatic, via Web UI API | API parameter | Web UI enabled + reachable |
| aria2 | Remote | Automatic, via JSON-RPC | RPC header | `aria2c` running with `--enable-rpc` |
| cURL (SSH) | Remote | Generated `.sh`, you run it on the host | `Cookie` header | SSH access to that host |

"Local" and "cURL (SSH)" downloaders can't be executed by the extension itself — a browser extension can't invoke arbitrary binaries on your machine — so it hands you a ready-to-run command instead. "Remote" downloaders with a real API (qBittorrent, aria2) are triggered automatically.

## How Cookie Forwarding Works

When you download a file, the extension:

1. Extracts all cookies from the download URL's domain
2. Includes cookies from parent domains (e.g., `.example.com` for `subdomain.example.com`)
3. Formats them per downloader:
   - **cURL/wget/SSH**: an HTTP `Cookie` header
   - **qBittorrent/aria2**: sent via API parameters
   - **FDM/IDM**: passed as command-line arguments

This is what lets downloads from an authenticated session keep working once handed off to an external tool.

## Permissions Explained

- **downloads** — intercept and manage downloads
- **cookies** — extract cookies for download URLs
- **storage** — save your downloader configurations
- **notifications** — show download status messages
- **host_permissions** (`<all_urls>`) — needed to read cookies for whatever site you download from

## Security Notes

Generated commands are built from data a remote site controls (URL, filename, cookies), and get written out as a script you later run. Every interpolated value is POSIX single-quote escaped before being placed into a command, so a crafted filename or URL can't break out of its argument and inject shell commands. This is covered by unit tests (`npm test`) — see [AGENTS.md](AGENTS.md) for details.

- Cookies are only extracted for URLs you actively download, and only sent to the downloaders you configure
- Remote downloader credentials (e.g. a qBittorrent password) are stored in `chrome.storage.sync`, which is **not encrypted** — use HTTPS for remote connections where you can
- SSH commands are generated as a file for you to run; nothing is executed automatically

## Troubleshooting

### Downloads not being intercepted
- Check the extension is enabled in `chrome://extensions/`
- Reload it from that page
- Confirm the service worker is running: Details → "Inspect views: service worker"

### Cookies not working
- Some sites use authentication schemes that don't translate to a simple cookie header
- Check the service worker console for errors

### Remote downloader not connecting
- **qBittorrent**: confirm the Web UI is enabled and reachable, and credentials are correct
- **aria2**: confirm `aria2c` is running with `--enable-rpc`
- **SSH**: confirm you have SSH access to the host from wherever you run the generated script
- Watch for CORS issues on the remote service's side

### Generated command doesn't work
- Confirm the executable path is correct for local downloaders
- Confirm the tool is actually installed at that path

## Development

See [AGENTS.md](AGENTS.md) for the full architecture breakdown. Quick reference:

```bash
npm install
npm run build      # bundle src/ -> dist/
npm run watch       # rebuild on file changes
npm run typecheck   # tsc --noEmit
npm test            # unit tests for the shell-command/cookie logic
npm run check       # typecheck + test + build
```

### Project Structure

```
src/
├── manifest.json      # copied to dist/ as-is
├── background/          # service worker: interception, routing, messaging
├── content/              # modifier-key bypass tracker
├── popup/                # download-choice UI
├── options/               # downloader configuration UI
├── downloaders/            # per-type command/request builders (local + remote)
├── shared/                  # theme.css - design tokens shared by popup + options
└── lib/                      # types, messaging, cookies, shell-quoting, icons, storage
```

### Manual Testing

1. `npm run build`, then load `dist/` in Chrome
2. Visit a site with downloadable files and click a download link
3. Confirm the popup appears with your configured options
4. Check the service worker console for errors if something looks wrong

## Privacy Policy

**Effective Date:** December 2, 2025

This extension does not collect, store, or transmit any personal data.

**What the extension accesses:**
- Download URLs — processed only to intercept and route the download
- Cookies — extracted from the download's domain, forwarded only to the downloader you pick
- Your downloader configuration — stored locally via `chrome.storage.sync`

**What it does not do:**
- Collect or store any user data
- Track your browsing activity
- Send data anywhere except the downloader you explicitly configured
- Use analytics or telemetry
- Share information with third parties

All processing happens locally on your device.

## Known Limitations

- `chrome.storage.sync` has a ~100KB quota, capping how many downloaders you can configure
- Some sites with unusual authentication schemes won't work with external tools
- The service worker can go idle and may need a moment to wake up on the next download
- Manifest V3 restricts some lower-level download manipulation Manifest V2 extensions could do

## Contributing

Contributions welcome. Please:
- Follow the existing patterns (async/await, typed messages — see AGENTS.md)
- Run `npm run check` before opening a PR
- Update this README or AGENTS.md for anything that changes behavior or architecture

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**derek**
GitHub: [https://github.com/hereisderek](https://github.com/hereisderek)

---

**Note**: This extension is for personal use. Make sure you comply with the terms of service of any site you use it with.
