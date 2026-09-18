import type { PendingDownload } from "../lib/types.ts";

let pendingDownload: PendingDownload | null = null;
let popupTabId: number | null = null;
let bypassNextDownload = false;
const allowedDownloadUrls = new Set<string>();

export function getPendingDownload(): PendingDownload | null {
  return pendingDownload;
}

export function setPendingDownload(download: PendingDownload | null): void {
  pendingDownload = download;
}

/** The tab the download-choice overlay is currently injected into, if any. */
export function getPopupTabId(): number | null {
  return popupTabId;
}

export function setPopupTabId(id: number | null): void {
  popupTabId = id;
}

export function setBypassNextDownload(bypass: boolean): void {
  bypassNextDownload = bypass;
}

/** Reads and resets the bypass flag in one step, so it only ever applies once. */
export function consumeBypassFlag(): boolean {
  const value = bypassNextDownload;
  bypassNextDownload = false;
  return value;
}

export function allowDownload(url: string): void {
  allowedDownloadUrls.add(url);
}

/** True if `url` was pre-approved (e.g. routed via "Chrome Built-in"); clears it either way. */
export function consumeAllowedDownload(url: string): boolean {
  return allowedDownloadUrls.delete(url);
}
