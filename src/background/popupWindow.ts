import type { OverlayMessage } from "../lib/messages.ts";
import { getPopupTabId, setPopupTabId } from "./state.ts";

// The popup is injected into the active tab's own page as an overlay (see
// content/index.ts) rather than opened as a separate chrome.windows popup.
// chrome.downloads.DownloadItem has no tabId to tell us exactly which tab
// triggered a given download, so the active tab in the current window is
// used as a best-effort stand-in - true for the overwhelming majority of
// downloads (the user just clicked something), but not guaranteed if a
// download were somehow triggered from a background/inactive tab.
export async function openDownloadPopup(): Promise<void> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) return;

  const message: OverlayMessage = { action: "showDownloadOverlay" };
  await chrome.tabs.sendMessage(activeTab.id, message).catch((error: unknown) => {
    console.error("Failed to show download overlay (no content script on this page?):", error);
  });
  setPopupTabId(activeTab.id);
}

export function closeDownloadPopup(): void {
  const tabId = getPopupTabId();
  if (tabId === null) return;

  const message: OverlayMessage = { action: "hideDownloadOverlay" };
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
  setPopupTabId(null);
}
