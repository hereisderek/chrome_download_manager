import type { DownloadChoice, PendingDownload } from "./types.ts";

export type ExportTool = "curl" | "wget";

export type Message =
  | { action: "setBypassExtension"; bypass: boolean }
  | { action: "getPendingDownload" }
  | { action: "handleDownload"; choice: DownloadChoice }
  | { action: "cancelDownload" }
  | { action: "exportCommand"; tool: ExportTool };

export type Response =
  | { success: true; download?: PendingDownload | null; command?: string; warning?: string }
  | { success: false; error: string };

/** Promise-based wrapper around chrome.runtime.sendMessage with typed request/response. */
export function sendMessage(message: Message): Promise<Response> {
  return chrome.runtime.sendMessage(message);
}

/** Background -> content script, to show/hide the download popup as an in-page overlay. */
export type OverlayMessage = { action: "showDownloadOverlay" } | { action: "hideDownloadOverlay" };
