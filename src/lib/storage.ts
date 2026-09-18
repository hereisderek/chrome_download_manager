import type { LocalDownloaderConfig, RemoteDownloaderConfig } from "./types.ts";

export async function getLocalDownloaders(): Promise<LocalDownloaderConfig[]> {
  const { localDownloaders } = await chrome.storage.sync.get("localDownloaders");
  return localDownloaders ?? [];
}

export async function getRemoteDownloaders(): Promise<RemoteDownloaderConfig[]> {
  const { remoteDownloaders } = await chrome.storage.sync.get("remoteDownloaders");
  return remoteDownloaders ?? [];
}

export function setLocalDownloaders(downloaders: LocalDownloaderConfig[]): Promise<void> {
  return chrome.storage.sync.set({ localDownloaders: downloaders });
}

export function setRemoteDownloaders(downloaders: RemoteDownloaderConfig[]): Promise<void> {
  return chrome.storage.sync.set({ remoteDownloaders: downloaders });
}
