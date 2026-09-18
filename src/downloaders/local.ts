import { buildCurlCommand, buildLocalGuiDownloaderCommand, buildWgetCommand } from "../lib/commands.ts";
import type { DownloadContext, LocalDownloaderConfig } from "../lib/types.ts";

/** Generates the shell command that forwards a download to a local downloader. */
export function buildLocalCommand(config: LocalDownloaderConfig, ctx: DownloadContext): string {
  switch (config.type) {
    case "fdm":
    case "idm":
      return buildLocalGuiDownloaderCommand(config, ctx);
    case "curl":
      return buildCurlCommand(ctx, { binary: config.path || "curl", mimicBrowserNavigation: true });
    case "wget":
      return buildWgetCommand(ctx, { binary: config.path || "wget", mimicBrowserNavigation: true });
  }
}
