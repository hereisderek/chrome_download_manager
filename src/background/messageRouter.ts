import { buildLocalCommand } from "../downloaders/local.ts";
import { buildSshCurlCommand, sendToAria2, sendToQBittorrent } from "../downloaders/remote.ts";
import { buildCurlCommand, buildWgetCommand, isReauthCheckpoint } from "../lib/commands.ts";
import type { ExportTool, Message, Response } from "../lib/messages.ts";
import type { DownloadChoice, DownloadContext } from "../lib/types.ts";
import { downloadTextFile, notify } from "./effects.ts";
import { closeDownloadPopup } from "./popupWindow.ts";
import { allowDownload, getPendingDownload, setBypassNextDownload, setPendingDownload } from "./state.ts";

function buildExportCommand(tool: ExportTool, ctx: DownloadContext): string {
  const opts = { mimicBrowserNavigation: true };
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
        const command = buildSshCurlCommand(choice.config, ctx);
        await downloadTextFile(`remote_download_${Date.now()}.sh`, command);
        notify("Remote Download Command", "SSH command saved to a file - open it to copy the command.");
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
      sendResponse({ success: true, command: buildExportCommand(message.tool, pending), warning });
      return true;
    }
  }
});
