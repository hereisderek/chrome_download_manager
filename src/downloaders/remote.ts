import { buildCurlCommand, buildSshCommand, resolveRemotePath } from "../lib/commands.ts";
import { formatCookieHeader } from "../lib/cookies.ts";
import type { DownloadContext, RemoteDownloaderConfig } from "../lib/types.ts";

/** ssh-curl produces an SSH command that runs curl on the remote host. */
export function buildSshCurlCommand(
  config: RemoteDownloaderConfig,
  ctx: DownloadContext,
  opts: { remotePath?: string; compressedCookie?: string } = {},
): string {
  if (!config.sshHost) throw new Error("Remote downloader is missing an SSH host");
  const target = config.sshUser ? `${config.sshUser}@${config.sshHost}` : config.sshHost;
  const defaultFilename = ctx.filename || "download";
  const outputPath = resolveRemotePath(opts.remotePath || config.remoteFolder, defaultFilename);

  const curlCmd = buildCurlCommand(ctx, {
    mimicBrowserNavigation: true,
    compressedCookie: opts.compressedCookie,
    outputFilename: outputPath,
  });

  return buildSshCommand(target, curlCmd, {
    port: config.sshPort,
    password: config.sshPassword,
    keyFile: config.sshKeyFile,
    keyContent: config.sshKeyContent,
  });
}

export async function sendToQBittorrent(config: RemoteDownloaderConfig, ctx: DownloadContext): Promise<void> {
  if (!config.webUIUrl) throw new Error("qBittorrent Web UI URL is not configured");

  const loginResponse = await fetch(`${config.webUIUrl}/api/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=${encodeURIComponent(config.username ?? "")}&password=${encodeURIComponent(config.password ?? "")}`,
  });
  if (!loginResponse.ok) throw new Error("Failed to log in to qBittorrent");

  const formData = new FormData();
  formData.append("urls", ctx.url);
  formData.append("cookie", formatCookieHeader(ctx.cookies));
  if (ctx.filename) formData.append("rename", ctx.filename);

  const addResponse = await fetch(`${config.webUIUrl}/api/v2/torrents/add`, {
    method: "POST",
    body: formData,
  });
  if (!addResponse.ok) throw new Error("qBittorrent rejected the download");
}

export async function sendToAria2(config: RemoteDownloaderConfig, ctx: DownloadContext): Promise<void> {
  if (!config.rpcUrl) throw new Error("aria2 RPC URL is not configured");

  const header = [`Cookie: ${formatCookieHeader(ctx.cookies)}`];
  if (ctx.referrer) header.push(`Referer: ${ctx.referrer}`);

  const options: Record<string, unknown> = { header };
  if (ctx.filename) options.out = ctx.filename;

  const params: unknown[] = [];
  if (config.token) params.push(`token:${config.token}`);
  params.push([ctx.url], options);

  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: `download_${Date.now()}`, method: "aria2.addUri", params }),
  });
  if (!response.ok) throw new Error("aria2 rejected the download");
}
