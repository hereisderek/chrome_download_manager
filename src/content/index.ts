// Tracks modifier-key held clicks so the user can force a download straight
// to Chrome's own downloader (e.g. right-click links that need auth headers
// only Chrome itself can supply), bypassing interception entirely.
import { sendMessage } from "../lib/messages.ts";
import type { OverlayMessage } from "../lib/messages.ts";

const BYPASS_DURATION_MS = 5000; // long enough to cover multi-hop redirects (e.g. Google Takeout)

let bypassTimeout: ReturnType<typeof setTimeout> | null = null;

function setBypass(): void {
  if (bypassTimeout) clearTimeout(bypassTimeout);

  void sendMessage({ action: "setBypassExtension", bypass: true });

  bypassTimeout = setTimeout(() => {
    void sendMessage({ action: "setBypassExtension", bypass: false });
    bypassTimeout = null;
  }, BYPASS_DURATION_MS);
}

function hasModifier(event: MouseEvent | KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}

document.addEventListener("mousedown", (event) => hasModifier(event) && setBypass(), true);
document.addEventListener("click", (event) => hasModifier(event) && setBypass(), true);
document.addEventListener("keydown", (event) => {
  if (hasModifier(event) && event.key === "Enter") setBypass();
});

// The download-choice popup, shown as an in-page overlay (an iframe running
// the same popup/index.html) instead of a separate chrome.windows popup, so
// it's an ordinary part of the page's own DOM - inspectable and automatable
// like any other page content, rather than a window type that tooling built
// around tabs (including, notably, other extensions) can't see into.
const OVERLAY_ID = "advanced-download-manager-overlay";

function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

function showOverlay(): void {
  removeOverlay();

  const backdrop = document.createElement("div");
  backdrop.id = OVERLAY_ID;
  backdrop.style.cssText =
    "all:initial;position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;";

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("popup/index.html");
  iframe.allow = "clipboard-write"; // for the popup's "Copy" button - the host page's own Permissions-Policy can still veto this
  iframe.style.cssText = "width:400px;height:640px;max-height:90vh;border:0;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,0.35);";

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) void sendMessage({ action: "cancelDownload" });
  });

  backdrop.append(iframe);
  document.documentElement.append(backdrop);
}

chrome.runtime.onMessage.addListener((message: OverlayMessage) => {
  if (message.action === "showDownloadOverlay") showOverlay();
  if (message.action === "hideDownloadOverlay") removeOverlay();
});
