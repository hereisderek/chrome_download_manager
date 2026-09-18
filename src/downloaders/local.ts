import { buildCurlCommand, buildLocalGuiDownloaderCommand, buildWgetCommand } from "../lib/commands.ts";
import { formatCookieHeader } from "../lib/cookies.ts";
import { shellQuote } from "../lib/shellQuote.ts";
import type { DownloadContext, LocalDownloaderConfig, RemoteDownloaderConfig } from "../lib/types.ts";
import { sendToAria2 } from "./remote.ts";

export async function sendToMotrix(config: LocalDownloaderConfig, ctx: DownloadContext): Promise<void> {
  const rpcUrl = config.rpcUrl || "http://127.0.0.1:16800/jsonrpc";
  const rpcConfig: RemoteDownloaderConfig = {
    name: config.name,
    type: "aria2",
    enabled: config.enabled,
    rpcUrl,
    token: config.token,
  };
  try {
    await sendToAria2(rpcConfig, ctx);
  } catch (err: unknown) {
    if (err instanceof TypeError || (err instanceof Error && err.message.includes("fetch"))) {
      throw new Error(`Could not connect to Motrix at ${rpcUrl}. Please ensure Motrix is running.`);
    }
    throw err;
  }
}

export async function sendToJDownloader(config: LocalDownloaderConfig, ctx: DownloadContext): Promise<void> {
  const endpoint = config.rpcUrl || "http://127.0.0.1:9666/flash/add";
  const formData = new URLSearchParams();
  formData.append("urls", ctx.url);
  if (ctx.referrer) formData.append("source", ctx.referrer);
  if (ctx.filename) formData.append("package", ctx.filename);

  const cookies = formatCookieHeader(ctx.cookies);
  if (cookies) {
    formData.append("cookies", cookies);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    if (!response.ok) {
      throw new Error(`JDownloader returned HTTP ${response.status}`);
    }
  } catch (err: unknown) {
    if (err instanceof TypeError || (err instanceof Error && err.message.includes("fetch"))) {
      throw new Error(`Could not connect to JDownloader at ${endpoint}. Please ensure JDownloader 2 is running.`);
    }
    throw err;
  }
}

import { sendToFdm } from "./fdm.ts";
import { openProtocolScheme } from "../lib/protocols.ts";
export { openProtocolScheme } from "../lib/protocols.ts";

/** Directly executes a local download via open API / protocol. */
export async function routeLocalDownload(config: LocalDownloaderConfig, ctx: DownloadContext): Promise<void> {
  switch (config.type) {
    case "motrix":
      await sendToMotrix(config, ctx);
      return;
    case "jdownloader":
      await sendToJDownloader(config, ctx);
      return;
    case "aria2": {
      const rpcConfig: RemoteDownloaderConfig = {
        name: config.name,
        type: "aria2",
        enabled: config.enabled,
        rpcUrl: config.rpcUrl || "http://127.0.0.1:6800/jsonrpc",
        token: config.token,
      };
      await sendToAria2(rpcConfig, ctx);
      return;
    }
    case "protocol":
      await openProtocolScheme(config.protocolPattern || "motrix://{url}", ctx);
      return;
    case "fdm":
      await sendToFdm(config, ctx);
      return;
    case "idm":
    case "curl":
    case "wget":
      throw new Error(`CLI tool "${config.name}" cannot be launched directly by browser sandbox. Please copy the command from the popup.`);
  }
}

/** Generates the shell command for displaying in the popup command box. */
export function buildLocalCommand(config: LocalDownloaderConfig, ctx: DownloadContext): string {
  switch (config.type) {
    case "motrix":
    case "aria2": {
      const parts = ["aria2c", shellQuote(ctx.url)];
      const cookieHeader = formatCookieHeader(ctx.cookies);
      if (cookieHeader) parts.push(`--header='Cookie: ${cookieHeader}'`);
      if (ctx.referrer) parts.push(`--header='Referer: ${ctx.referrer}'`);
      if (ctx.filename) parts.push("-o", shellQuote(ctx.filename));
      return parts.join(" ");
    }
    case "jdownloader":
      return `curl -X POST -d "urls=${encodeURIComponent(ctx.url)}" "${config.rpcUrl || "http://127.0.0.1:9666/flash/add"}"`;
    case "protocol":
      return (config.protocolPattern || "motrix://{url}")
        .replace(/\{url\}/gi, encodeURIComponent(ctx.url))
        .replace(/\{raw_url\}/gi, ctx.url)
        .replace(/\{filename\}/gi, encodeURIComponent(ctx.filename ?? "download"));
    case "fdm":
    case "idm":
      return buildLocalGuiDownloaderCommand(config, ctx);
    case "curl":
      return buildCurlCommand(ctx, { binary: config.path || "curl", mimicBrowserNavigation: true });
    case "wget":
      return buildWgetCommand(ctx, { binary: config.path || "wget", mimicBrowserNavigation: true });
  }
}
