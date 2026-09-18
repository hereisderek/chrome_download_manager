import { getCookiesForUrl } from "../lib/cookies.ts";
import type { PendingDownload } from "../lib/types.ts";
import { openDownloadPopup } from "./popupWindow.ts";
import { consumeAllowedDownload, consumeBypassFlag, setPendingDownload } from "./state.ts";

function extractFilename(path: string | undefined): string | null {
  if (!path) return null;
  return path.split("/").pop()!.split("\\").pop() ?? null;
}

chrome.downloads.onCreated.addListener(async (item) => {
  console.log("[ADM] onCreated:", item.url, "finalUrl:", item.finalUrl);

  if (consumeBypassFlag()) {
    console.log("[ADM] skipped: bypass flag was set");
    return;
  }
  if (consumeAllowedDownload(item.url)) {
    console.log("[ADM] skipped: url was pre-allowed");
    return;
  }

  try {
    await chrome.downloads.cancel(item.id);
    await chrome.downloads.erase({ id: item.id });
  } catch (error) {
    console.error("[ADM] Failed to intercept download:", error);
    return;
  }

  // item.url is "before any redirects" (often just the page the click happened
  // on); item.finalUrl is Chrome's own post-redirect URL, tracked internally
  // by its download manager rather than guessed at via webRequest - use it.
  const finalUrl = item.finalUrl || item.url;
  const pending: PendingDownload = {
    url: finalUrl,
    originalUrl: item.url,
    filename: extractFilename(item.filename),
    referrer: item.referrer || null,
    mime: item.mime || null,
    fileSize: item.fileSize ?? null,
    cookies: await getCookiesForUrl(finalUrl),
    timestamp: Date.now(),
  };

  setPendingDownload(pending);
  await openDownloadPopup();
});
