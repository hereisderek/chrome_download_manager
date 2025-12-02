# Advanced Download Manager

A powerful Chrome extension that intercepts downloads and gives you complete control over how files are downloaded. Route downloads to Chrome's built-in downloader, local download managers (Free Download Manager, IDM, cURL, wget), or remote services (qBittorrent, aria2) with automatic cookie forwarding.

## Features

- 🎯 **Download Interception** - Catch all downloads before they start
- 🔗 **Smart URL Tracking** - Automatically captures final download URLs even through multiple redirects (works with Google Takeout, etc.)
- 🍪 **Automatic Cookie Forwarding** - Extract and forward cookies to external downloaders
- 📋 **Export as cURL** - Generate ready-to-use cURL commands with cookies included
- 💻 **Local Downloader Support** - Free Download Manager, IDM, cURL, wget
- 🌐 **Remote Downloader Support** - qBittorrent Web UI, aria2 RPC, SSH/cURL
- ⚙️ **Easy Configuration** - User-friendly options page for managing downloaders
- 🔒 **Privacy-Focused** - Cookies only extracted for downloads you initiate

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `chrome_download_manager` directory
6. The extension icon should appear in your toolbar

## Usage

### Basic Workflow

1. **Configure Downloaders** (first time)
   - Click the extension icon or right-click → Options
   - Add your preferred local or remote downloaders
   - Save the configuration

2. **Download Files**
   - Click any download link or start a download in Chrome
   - A popup will appear with available options
   - Choose your preferred download method:
     - **Chrome Built-in**: Use default browser downloader
     - **Export as cURL**: Generate a cURL command with cookies (can be executed anywhere)
### Export as cURL Command

The **Export as cURL** option generates a standalone shell script containing a complete cURL command with all necessary cookies and headers. This is perfect for:

- Running downloads on different machines
- Scheduling downloads for later
- Sharing download commands (ensure you trust the recipient!)
- Debugging download issues
- Using in automation scripts

**Example generated command:**
```bash
#!/bin/bash
# Generated curl command
# Execute this script to download the file

curl -L -o "example_file.zip" \
  -H "Cookie: session_id=abc123; user_token=xyz789" \
  -H "Referer: https://example.com/downloads" \
  -H "User-Agent: Mozilla/5.0..." \
  "https://example.com/download/file.zip"
```

To use:
1. Click "Export as cURL" in the download popup
2. The script is saved to your downloads folder
3. Make it executable: `chmod +x curl_download_*.sh`
4. Run it: `./curl_download_*.sh`

### Configuring Local Downloaders

Local downloaders generate command-line instructions that you execute on your machine.

### Configuring Local Downloaders

Local downloaders generate command-line instructions that you execute on your machine.

**Free Download Manager (FDM)**
- Name: `Free Download Manager`
- Type: `Free Download Manager (FDM)`
- Path: `/Applications/FreeDownloadManager.app/Contents/MacOS/fdm` (macOS)
  or `C:\Program Files\FDM\fdm.exe` (Windows)

**cURL**
- Name: `cURL`
- Type: `cURL`
- Path: `/usr/bin/curl` (usually pre-installed on macOS/Linux)

**wget**
- Name: `wget`
- Type: `wget`
- Path: `/usr/local/bin/wget`

### Configuring Remote Downloaders

Remote downloaders automatically send downloads to external services.

**qBittorrent Web UI**

1. Enable Web UI in qBittorrent:
   - Open qBittorrent → Preferences → Web UI
   - Check "Enable the Web User Interface"
   - Set port (default: 8080)
   - Set username and password

2. Add to extension:
   - Name: `qBittorrent Server`
   - Type: `qBittorrent Web UI`
   - Web UI URL: `http://localhost:8080` (or your server IP)
   - Username: (your qBittorrent username)
   - Password: (your qBittorrent password)

**aria2 RPC**

1. Start aria2 with RPC enabled:
   ```bash
   aria2c --enable-rpc --rpc-listen-all=true --rpc-allow-origin-all=true
   ```
   
   Or with secret token:
   ```bash
   aria2c --enable-rpc --rpc-secret=your_secret_token
   ```

2. Add to extension:
   - Name: `aria2`
   - Type: `aria2 RPC`
| Downloader | Type | Cookie Support | Notes |
|------------|------|----------------|-------|
| Chrome Built-in | Local | ✅ Native | Default Chrome downloader |
| **Export as cURL** | **Export** | **✅ Script file** | **Portable bash script with cookies** |
| Free Download Manager | Local | ✅ CLI args | Requires FDM installed |
| Internet Download Manager | Local | ✅ CLI args | Requires IDM installed |
| cURL | Local | ✅ Headers | Pre-installed on most systems |
| wget | Local | ✅ Headers | May need installation |
| qBittorrent | Remote | ✅ Web UI API | Requires Web UI enabled |
| aria2 | Remote | ✅ RPC headers | Requires aria2c running |
| SSH/cURL | Remote | ✅ SSH command | Requires SSH access |
- SSH User: `root` or your username

The extension will generate an SSH command that you can execute.

## How Cookie Forwarding Works

When you download a file, the extension:

1. Extracts all cookies from the download URL's domain
2. Includes cookies from parent domains (e.g., `.example.com` for `subdomain.example.com`)
3. Formats cookies appropriately for each downloader type:
   - **cURL/wget**: HTTP Cookie header format
   - **qBittorrent/aria2**: Sent via API parameters
   - **Local tools**: Command-line arguments or cookie files

This ensures that downloads from authenticated sessions work correctly with external tools.

## Supported Downloader Types

| Downloader | Type | Cookie Support | Notes |
|------------|------|----------------|-------|
| Chrome Built-in | Local | ✅ Native | Default Chrome downloader |
| Free Download Manager | Local | ✅ CLI args | Requires FDM installed |
| Internet Download Manager | Local | ✅ CLI args | Requires IDM installed |
| cURL | Local | ✅ Headers | Pre-installed on most systems |
| wget | Local | ✅ Headers | May need installation |
| qBittorrent | Remote | ✅ Web UI API | Requires Web UI enabled |
| aria2 | Remote | ✅ RPC headers | Requires aria2c running |
| SSH/cURL | Remote | ✅ SSH command | Requires SSH access |

## Permissions Explained

The extension requires these permissions:

- **downloads** - Intercept and manage downloads
- **cookies** - Extract cookies for download URLs
- **storage** - Save your downloader configurations
- **notifications** - Show download status messages
- **webRequest** - Monitor download requests
- **host_permissions** - Access cookies from all websites (only for downloads you initiate)

## Troubleshooting

### Downloads Not Being Intercepted

- Check if the extension is enabled in `chrome://extensions/`
- Refresh the extension by clicking the reload icon
- Ensure the service worker is running (click "Details" → "Inspect views: service worker")

### Cookies Not Working

- Verify the extension has permission to access the download site
- Check browser console for error messages
- Some sites use special authentication that may not work with external tools

### Remote Downloaders Not Connecting

- **qBittorrent**: Verify Web UI is enabled and accessible
- **aria2**: Ensure aria2c is running with RPC enabled
- **SSH**: Check SSH credentials and network connectivity
- Check for CORS issues (may need to configure remote service)

### Commands Not Working

For local downloaders, ensure:
- The executable path is correct
- The downloader is properly installed
- You're executing the command in the correct directory

## Development

### Project Structure

```
chrome_download_manager/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (download interception & routing)
├── popup.html             # Download choice UI
├── popup.js               # Popup logic
├── popup.css              # Popup styling
├── options.html           # Configuration page
├── options.js             # Configuration logic
├── options.css            # Configuration styling
├── icons/                 # Extension icons
└── .github/
    └── copilot-instructions.md  # AI agent instructions
```

### Building

No build step required - load directly as unpacked extension.

### Testing

1. Load the extension in Chrome
2. Visit a site with downloadable files
3. Click a download link
4. Verify popup appears with configured options
5. Check console logs for debugging

## Privacy & Security

- Cookies are only extracted for URLs you actively download
- Cookies are never sent to third parties except downloaders you configure
- Remote downloader credentials are stored in Chrome sync storage (not encrypted)
- For production use, consider using HTTPS for remote connections
- SSH commands are generated but not executed automatically

## Known Limitations

- Chrome sync storage has a ~100KB quota (limit on number of configured downloaders)
- Some sites with complex authentication may not work with external tools
- Service worker may need periodic refresh in Chrome's extension page
- Manifest V3 restrictions prevent some advanced download manipulation

## Contributing

Contributions welcome! Please ensure:
- Code follows existing patterns (async/await, error handling)
- Test with multiple downloader types
- Update documentation for new features

## License

MIT License - see LICENSE file for details

## Author

**derek**  
GitHub: [https://github.com/hereisderek](https://github.com/hereisderek)

## Credits

Created as an advanced download management solution for power users who need flexible download routing with authentication support.

---

**Note**: This extension is for personal use. Ensure you comply with website terms of service when using automated download tools.
