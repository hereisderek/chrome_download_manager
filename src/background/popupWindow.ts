import type { OverlayMessage } from "../lib/messages.ts";
import { getPopupId, setPopupId } from "./state.ts";

/**
 * Two ways to present the download-choice UI. "window" (default) opens it as
 * its own chrome.windows popup - the original, battle-tested behavior.
 * "overlay" injects it as an iframe into the tab that triggered the download
 * instead (see content/index.ts) - useful for automated testing since a
 * popup-type window is invisible to tooling built around tabs, but it has
 * real downsides found while trying it: the host page's Permissions-Policy
 * can block clipboard access, and it does nothing to fix (and arguably makes
 * more confusing) the unrelated race between our cancel() call and Chrome's
 * native "ask where to save" dialog. Flip this to revisit it later.
 */
const POPUP_MODE: "window" | "overlay" = "window";

const POPUP_WIDTH = 550;
const POPUP_HEIGHT = 650;

async function openPopupWindow(): Promise<void> {
  const currentWindow = await chrome.windows.getCurrent();

  let left = 100;
  let top = 100;
  if (
    currentWindow.left !== undefined &&
    currentWindow.top !== undefined &&
    currentWindow.width !== undefined &&
    currentWindow.height !== undefined
  ) {
    left = Math.round(currentWindow.left + (currentWindow.width - POPUP_WIDTH) / 2);
    top = Math.round(currentWindow.top + (currentWindow.height - POPUP_HEIGHT) / 2);
  }

  const popup = await chrome.windows.create({
    url: "popup/index.html",
    type: "popup",
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    left,
    top,
    focused: true,
  });

  setPopupId(popup.id ?? null);
}

function closePopupWindow(): void {
  const id = getPopupId();
  if (id === null) return;
  chrome.windows.remove(id);
  setPopupId(null);
}

/**
 * chrome.downloads.DownloadItem has no tabId to tell us exactly which tab
 * triggered a given download, so the active tab in the current window is
 * used as a best-effort stand-in for where to inject the overlay.
 */
async function openPopupOverlay(): Promise<void> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) return;

  const message: OverlayMessage = { action: "showDownloadOverlay" };
  await chrome.tabs.sendMessage(activeTab.id, message).catch((error: unknown) => {
    console.error("Failed to show download overlay (no content script on this page?):", error);
  });
  setPopupId(activeTab.id);
}

function closePopupOverlay(): void {
  const tabId = getPopupId();
  if (tabId === null) return;
  const message: OverlayMessage = { action: "hideDownloadOverlay" };
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
  setPopupId(null);
}

export function openDownloadPopup(): Promise<void> {
  return POPUP_MODE === "overlay" ? openPopupOverlay() : openPopupWindow();
}

export function closeDownloadPopup(): void {
  return POPUP_MODE === "overlay" ? closePopupOverlay() : closePopupWindow();
}
