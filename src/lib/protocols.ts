import type { DownloadContext } from "./types.ts";

export async function openProtocolScheme(pattern: string, ctx: DownloadContext): Promise<void> {
  if (!pattern) throw new Error("No URL protocol pattern configured");
  const target = pattern
    .replace(/\{url\}/gi, encodeURIComponent(ctx.url))
    .replace(/\{raw_url\}/gi, ctx.url)
    .replace(/\{filename\}/gi, encodeURIComponent(ctx.filename ?? "download"));

  const tab = await chrome.tabs.create({ url: target, active: false });
  if (tab?.id) {
    setTimeout(() => {
      chrome.tabs.remove(tab.id!).catch(() => {});
    }, 2000);
  }
}
