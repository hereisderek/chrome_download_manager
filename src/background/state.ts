import type { PendingDownload } from "../lib/types.ts";

let pendingDownload: PendingDownload | null = null;
let popupId: number | null = null;
let bypassNextDownload = false;
const allowedDownloadUrls = new Set<string>();
const allowedDownloadIds = new Set<number>();

const sessionStorage =
  typeof chrome !== "undefined" && chrome?.storage?.session
    ? chrome.storage.session
    : null;

if (sessionStorage) {
  sessionStorage.get(["pendingDownload", "allowedUrls", "allowedIds"]).then((data) => {
    if (data?.pendingDownload && !pendingDownload) {
      pendingDownload = data.pendingDownload as PendingDownload;
    }
    if (Array.isArray(data?.allowedUrls)) {
      for (const u of data.allowedUrls) allowedDownloadUrls.add(u);
    }
    if (Array.isArray(data?.allowedIds)) {
      for (const id of data.allowedIds) allowedDownloadIds.add(id);
    }
  }).catch(() => {});
}

export function getPendingDownload(): PendingDownload | null {
  return pendingDownload;
}

export async function getPendingDownloadAsync(): Promise<PendingDownload | null> {
  if (pendingDownload) return pendingDownload;
  if (!sessionStorage) return null;
  try {
    const data = await sessionStorage.get("pendingDownload");
    if (data?.pendingDownload) {
      pendingDownload = data.pendingDownload as PendingDownload;
      return pendingDownload;
    }
  } catch (err) {
    console.debug("[ADM] Failed to read pendingDownload from session storage:", err);
  }
  return null;
}

export function setPendingDownload(download: PendingDownload | null): void {
  pendingDownload = download;
  if (sessionStorage) {
    if (download) {
      sessionStorage.set({ pendingDownload: download }).catch(() => {});
    } else {
      sessionStorage.remove("pendingDownload").catch(() => {});
    }
  }
}

/** The id of whatever the download-choice UI is currently open in - a
 *  window id in "window" mode, a tab id in "overlay" mode (see popupWindow.ts). */
export function getPopupId(): number | null {
  return popupId;
}

export function setPopupId(id: number | null): void {
  popupId = id;
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
  if (sessionStorage) {
    sessionStorage.set({ allowedUrls: Array.from(allowedDownloadUrls) }).catch(() => {});
  }
  // Auto-expire after 20 seconds so all redirect and filename phases complete safely
  setTimeout(() => {
    allowedDownloadUrls.delete(url);
    if (sessionStorage) {
      sessionStorage.set({ allowedUrls: Array.from(allowedDownloadUrls) }).catch(() => {});
    }
  }, 20000);
}

/** True if `url` was pre-approved (e.g. routed via "Chrome Built-in"). */
export function isAllowedDownload(url: string): boolean {
  return allowedDownloadUrls.has(url);
}

/** Backward-compatible alias. */
export function consumeAllowedDownload(url: string): boolean {
  return isAllowedDownload(url);
}

export function allowDownloadId(id: number): void {
  allowedDownloadIds.add(id);
  if (sessionStorage) {
    sessionStorage.set({ allowedIds: Array.from(allowedDownloadIds) }).catch(() => {});
  }
  // Auto-expire after 30 seconds
  setTimeout(() => {
    allowedDownloadIds.delete(id);
    if (sessionStorage) {
      sessionStorage.set({ allowedIds: Array.from(allowedDownloadIds) }).catch(() => {});
    }
  }, 30000);
}

/** True if download `id` was pre-approved. */
export function isAllowedDownloadId(id: number): boolean {
  return allowedDownloadIds.has(id);
}

/** Backward-compatible alias. */
export function consumeAllowedDownloadId(id: number): boolean {
  return isAllowedDownloadId(id);
}
