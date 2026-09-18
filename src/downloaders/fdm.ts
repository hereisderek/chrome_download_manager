import { formatCookieHeader } from "../lib/cookies.ts";
import { openProtocolScheme } from "../lib/protocols.ts";
import type { DownloadContext, LocalDownloaderConfig } from "../lib/types.ts";

export const FDM_NATIVE_HOST = "org.freedownloadmanager.fdm5.cnh";
export const FDM_CHROME_EXT_ID = "ahmpjcflkgiildlgicmcieglgoilbfdp";
export const FDM_EDGE_EXT_ID = "mdfcjfioplkdchnhcpcobaheocanedjg";

export interface FdmStatus {
  extensionInstalled: boolean;
  extensionEnabled: boolean;
  extensionId?: string;
  nativeHostStatus: "connected" | "forbidden" | "not_found" | "error";
  nativeHostError?: string;
  schemeSupported: boolean;
}

/**
 * Diagnoses the availability and accessibility of FDM's native host,
 * official browser extension, and URL protocol scheme.
 */
export async function checkFdmStatus(): Promise<FdmStatus> {
  const status: FdmStatus = {
    extensionInstalled: false,
    extensionEnabled: false,
    nativeHostStatus: "not_found",
    schemeSupported: true,
  };

  // 1. Check Official FDM extension via chrome.management
  if (typeof chrome !== "undefined" && chrome.management?.get) {
    try {
      const ext = await chrome.management.get(FDM_CHROME_EXT_ID);
      status.extensionInstalled = true;
      status.extensionEnabled = ext.enabled;
      status.extensionId = FDM_CHROME_EXT_ID;
    } catch {
      try {
        const edgeExt = await chrome.management.get(FDM_EDGE_EXT_ID);
        status.extensionInstalled = true;
        status.extensionEnabled = edgeExt.enabled;
        status.extensionId = FDM_EDGE_EXT_ID;
      } catch {
        status.extensionInstalled = false;
        status.extensionEnabled = false;
      }
    }
  }

  // 2. Check FDM Native Host via sendNativeMessage handshake
  if (typeof chrome !== "undefined" && chrome.runtime?.sendNativeMessage) {
    try {
      await new Promise<unknown>((resolve, reject) => {
        chrome.runtime.sendNativeMessage(
          FDM_NATIVE_HOST,
          { id: "1", task: "handshake", version: "1.0.0" },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          },
        );
      });
      status.nativeHostStatus = "connected";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("forbidden")) {
        status.nativeHostStatus = "forbidden";
        status.nativeHostError = msg;
      } else if (msg.toLowerCase().includes("not found")) {
        status.nativeHostStatus = "not_found";
        status.nativeHostError = msg;
      } else {
        status.nativeHostStatus = "error";
        status.nativeHostError = msg;
      }
    }
  }

  return status;
}

/**
 * Sends download info directly to FDM's native messaging host.
 */
export async function sendToFdmNative(ctx: DownloadContext): Promise<boolean> {
  const cookieStr = formatCookieHeader(ctx.cookies);
  const payload = {
    id: String(Date.now()),
    task: "create_downloads",
    downloads: [
      {
        url: ctx.url,
        originalUrl: ctx.originalUrl || ctx.url,
        httpReferer: ctx.referrer || "",
        httpCookies: cookieStr || "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        suggestedName: ctx.filename || "",
      },
    ],
  };

  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(FDM_NATIVE_HOST, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Forwards download to FDM via its registered fdm:// scheme.
 */
export async function sendToFdmScheme(ctx: DownloadContext, customPattern?: string): Promise<void> {
  const pattern = customPattern || "fdm://{url}";
  await openProtocolScheme(pattern, ctx);
}

/**
 * High-level router to send download to Free Download Manager.
 * Tries Native Messaging host first; falls back to fdm:// protocol scheme;
 * provides actionable instructions if host access is forbidden.
 */
export async function sendToFdm(config: LocalDownloaderConfig, ctx: DownloadContext): Promise<void> {
  let nativeError: string | null = null;
  try {
    await sendToFdmNative(ctx);
    return;
  } catch (err: unknown) {
    nativeError = err instanceof Error ? err.message : String(err);
  }

  // If native messaging failed, attempt fdm:// protocol scheme
  try {
    await sendToFdmScheme(ctx, config.protocolPattern);
    return;
  } catch (schemeErr: unknown) {
    // Both failed, throw detailed error
    if (nativeError && nativeError.toLowerCase().includes("forbidden")) {
      throw new Error(
        `FDM Native Host access was forbidden. Chromium requires this extension's ID to be authorized in FDM's host manifest. Check the (?) button in Options > Local Downloaders for 1-click instructions.`,
      );
    }
    if (nativeError && nativeError.toLowerCase().includes("not found")) {
      throw new Error(
        `Free Download Manager native host was not found. Please ensure Free Download Manager is installed.`,
      );
    }
    throw new Error(`Failed to send download to FDM: ${nativeError || (schemeErr instanceof Error ? schemeErr.message : String(schemeErr))}`);
  }
}
