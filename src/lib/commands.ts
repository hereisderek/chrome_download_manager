import { formatCookieHeader } from "./cookies.ts";
import { shellQuote } from "./shellQuote.ts";
import type { DownloadContext, LocalDownloaderConfig } from "./types.ts";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Every value below comes from the page that served the download (URL, filename,
 *  cookies, referrer) and ends up in a shell script the user later executes, so
 *  every interpolation goes through shellQuote() - see shellQuote.ts. */

function resolveFilename(ctx: DownloadContext): string {
  if (ctx.filename) return ctx.filename;
  try {
    const name = new URL(ctx.url).pathname.split("/").pop();
    return name && name.includes(".") ? name : `${name || "download"}.html`;
  } catch {
    return "download";
  }
}

function registrableDomain(url: string): string | null {
  try {
    return new URL(url).hostname.split(".").slice(-2).join(".");
  } catch {
    return null;
  }
}

/**
 * A real top-level navigation (clicking a link, a redirect landing on a
 * download) sends `Sec-Fetch-*` and `Upgrade-Insecure-Requests` headers that
 * curl/wget don't send by default. Some download endpoints reject requests
 * missing them as a signal of scripted (non-browser) access - cheap to add,
 * and the only lever we have from outside an actual browser process.
 */
function browserNavigationHeaders(ctx: DownloadContext): [string, string][] {
  const site = ctx.referrer && registrableDomain(ctx.referrer) === registrableDomain(ctx.url) ? "same-site" : ctx.referrer ? "cross-site" : "none";
  return [
    ["Sec-Fetch-Site", site],
    ["Sec-Fetch-Mode", "navigate"],
    ["Sec-Fetch-User", "?1"],
    ["Sec-Fetch-Dest", "document"],
    ["Upgrade-Insecure-Requests", "1"],
  ];
}

export function buildCurlCommand(
  ctx: DownloadContext,
  opts: { mimicBrowserNavigation?: boolean; binary?: string } = {},
): string {
  const parts = [shellQuote(opts.binary ?? "curl"), "-L", "-o", shellQuote(resolveFilename(ctx))];
  const cookieHeader = formatCookieHeader(ctx.cookies);
  if (cookieHeader) parts.push("-H", shellQuote(`Cookie: ${cookieHeader}`));
  if (ctx.referrer) parts.push("-H", shellQuote(`Referer: ${ctx.referrer}`));
  if (opts.mimicBrowserNavigation) {
    parts.push("-H", shellQuote(`User-Agent: ${DEFAULT_USER_AGENT}`));
    for (const [name, value] of browserNavigationHeaders(ctx)) parts.push("-H", shellQuote(`${name}: ${value}`));
  }
  parts.push(shellQuote(ctx.url));
  return parts.join(" ");
}

export function buildWgetCommand(ctx: DownloadContext, opts: { mimicBrowserNavigation?: boolean; binary?: string } = {}): string {
  const parts = [shellQuote(opts.binary ?? "wget"), "-O", shellQuote(resolveFilename(ctx))];
  const cookieHeader = formatCookieHeader(ctx.cookies);
  if (cookieHeader) parts.push(`--header=${shellQuote(`Cookie: ${cookieHeader}`)}`);
  if (ctx.referrer) parts.push(`--referer=${shellQuote(ctx.referrer)}`);
  if (opts.mimicBrowserNavigation) {
    parts.push(`--user-agent=${shellQuote(DEFAULT_USER_AGENT)}`);
    for (const [name, value] of browserNavigationHeaders(ctx)) parts.push(`--header=${shellQuote(`${name}: ${value}`)}`);
  }
  parts.push(shellQuote(ctx.url));
  return parts.join(" ");
}

/** FDM and IDM both expose a "queue this URL" CLI with the same shape:
 *  executable, URL, an optional cookie flag, an optional referrer flag. */
export function buildLocalGuiDownloaderCommand(config: LocalDownloaderConfig, ctx: DownloadContext): string {
  const parts = [shellQuote(config.path), shellQuote(ctx.url)];
  const cookieHeader = formatCookieHeader(ctx.cookies);
  if (cookieHeader) parts.push("--cookies", shellQuote(cookieHeader));
  if (ctx.referrer) parts.push("--referer", shellQuote(ctx.referrer));
  return parts.join(" ");
}

export function buildSshCommand(target: string, remoteCommand: string): string {
  return `ssh ${shellQuote(target)} ${shellQuote(remoteCommand)}`;
}

/**
 * Google intermittently interposes a re-authentication checkpoint
 * (accounts.google.com/.../interstitial/...) in front of sensitive bulk
 * downloads (confirmed for Takeout exports), based on its own per-request
 * risk signals - it doesn't happen every time. When it does, it's a real
 * interactive step: passing it seems to require actually being a browser
 * (JS execution, or some other signal a plain HTTP client can't produce),
 * not just the right cookies. Chrome's own downloader gets through it fine;
 * curl/wget just receive the static challenge page back. Detect it so the
 * UI can warn instead of silently handing over a command that can't work
 * this time, even though the exact same export works for the same site on
 * a different request where the checkpoint doesn't trigger.
 */
export function isReauthCheckpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "accounts.google.com" && parsed.pathname.includes("/interstitial/");
  } catch {
    return false;
  }
}
