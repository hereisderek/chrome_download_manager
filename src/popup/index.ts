import { getLocalDownloaders, getRemoteDownloaders } from "../lib/storage.ts";
import { ICON_ALERT_CIRCLE, ICON_CHECK_CIRCLE, ICON_CLIPBOARD, ICON_CLOUD_DOWNLOAD, ICON_FILE, ICON_SERVER, ICON_TERMINAL } from "../lib/icons.ts";
import { sendMessage } from "../lib/messages.ts";
import type { ExportTool } from "../lib/messages.ts";
import type {
  DownloadChoice,
  LocalDownloaderConfig,
  LocalDownloaderType,
  PendingDownload,
  RemoteDownloaderConfig,
  RemoteDownloaderType,
} from "../lib/types.ts";

const DESCRIPTIONS: Record<LocalDownloaderType | RemoteDownloaderType, string> = {
  fdm: "Free Download Manager",
  idm: "Internet Download Manager",
  curl: "cURL command-line tool",
  wget: "Wget command-line tool",
  "ssh-curl": "cURL over SSH",
  qbittorrent: "qBittorrent Web UI",
  aria2: "aria2 RPC",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return bytes === 0 ? "0 Bytes" : "Unknown size";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[i] ?? "TB";
  return `${Math.round((bytes / k ** i) * 100) / 100} ${size}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

function icon(svg: string): HTMLSpanElement {
  const span = el("span");
  span.innerHTML = svg; // trusted, hardcoded SVG from lib/icons.ts - never user data
  return span;
}

function showMessage(kind: "success" | "error", text: string): void {
  const slot = document.getElementById("messageSlot");
  if (!slot) return;
  const message = el("div", { className: `message ${kind}` }, [icon(kind === "success" ? ICON_CHECK_CIRCLE : ICON_ALERT_CIRCLE), text]);
  slot.replaceChildren(message);
  if (kind === "error") setTimeout(() => message.remove(), 5000);
}

function setBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>(".option-row, .ghost-btn").forEach((btn) => {
    btn.disabled = busy;
    btn.classList.toggle("loading", busy);
  });
}

function displayDownloadInfo(download: PendingDownload): void {
  document.getElementById("summaryIcon")!.replaceChildren(icon(ICON_FILE));

  const urlEl = document.getElementById("downloadUrl")!;
  urlEl.textContent = download.url.length > 60 ? `${download.url.slice(0, 60)}...` : download.url;
  urlEl.title = download.url;

  const filenameEl = document.getElementById("downloadFilename")!;
  filenameEl.textContent = download.filename || "Unknown file";
  filenameEl.title = download.filename ?? "";

  document.getElementById("downloadSize")!.textContent = formatBytes(download.fileSize);

  const cookieCount = download.cookies.length;
  document.getElementById("cookieCount")!.textContent = `${cookieCount} cookie${cookieCount !== 1 ? "s" : ""}`;

  const commandOptions = document.getElementById("commandOptions");
  if (commandOptions) {
    commandOptions.style.display = cookieCount > 0 ? "" : "none";
  }
}

function createDownloaderRow(
  config: LocalDownloaderConfig | RemoteDownloaderConfig,
  kind: "local" | "remote",
  onClick: () => void,
): HTMLButtonElement {
  const row = el("button", { type: "button", className: "option-row" }, [
    el("span", { className: "option-icon" }, [icon(kind === "local" ? ICON_TERMINAL : ICON_SERVER)]),
    el("span", { className: "option-text" }, [
      el("strong", {}, [config.name]),
      el("small", {}, [config.description || DESCRIPTIONS[config.type]]),
    ]),
  ]);
  row.addEventListener("click", onClick);
  return row;
}

function noConfigMessage(): HTMLParagraphElement {
  const link = el("a", { href: "#" }, ["Configure now"]);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  return el("p", { className: "no-config" }, ["Nothing configured yet. ", link]);
}

async function runChoice(choice: DownloadChoice): Promise<void> {
  setBusy(true);
  const response = await sendMessage({ action: "handleDownload", choice });
  if (response.success) {
    showMessage("success", "Download started");
    setTimeout(() => window.close(), 1000);
  } else {
    showMessage("error", response.error);
    setBusy(false);
  }
}

let currentExportTool: ExportTool | null = null;
let currentExportCommand = "";

async function updateExportCommand(): Promise<void> {
  if (!currentExportTool) return;
  const checkbox = document.getElementById("compressCookiesCheckbox") as HTMLInputElement | null;
  const compressCookies = checkbox?.checked ?? false;

  const response = await sendMessage({
    action: "exportCommand",
    tool: currentExportTool,
    compressCookies,
  });
  if (!response.success) {
    showMessage("error", response.error);
    return;
  }

  currentExportCommand = response.command ?? "";
  document.getElementById("commandText")!.textContent = currentExportCommand;

  const warningEl = document.getElementById("commandWarning")!;
  warningEl.textContent = response.warning ?? "";
  warningEl.classList.toggle("hidden", !response.warning);
}

async function showExportCommand(tool: ExportTool): Promise<void> {
  currentExportTool = tool;
  setBusy(true);
  await updateExportCommand();
  setBusy(false);

  const panel = document.getElementById("commandPanel")!;
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** The async Clipboard API can be vetoed by the host page's Permissions-Policy
 *  now that this popup runs as an in-page overlay iframe rather than its own
 *  window; the older execCommand mechanism isn't gated the same way, so it's
 *  worth a shot before giving up. */
function copyWithExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function copyExportCommand(): Promise<void> {
  const button = document.getElementById("copyCommandBtn") as HTMLButtonElement;
  try {
    await navigator.clipboard.writeText(currentExportCommand);
  } catch (error) {
    if (!copyWithExecCommand(currentExportCommand)) {
      showMessage("error", `Couldn't copy to clipboard: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }
  const original = button.textContent;
  button.textContent = "Copied!";
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

async function loadDownloaderConfigs(): Promise<void> {
  const localContainer = document.getElementById("localDownloaders")!;
  const local = (await getLocalDownloaders()).filter((d) => d.enabled);
  localContainer.replaceChildren(
    ...(local.length
      ? local.map((config) => createDownloaderRow(config, "local", () => void runChoice({ kind: "local", config })))
      : [noConfigMessage()]),
  );

  const remoteContainer = document.getElementById("remoteDownloaders")!;
  const remote = (await getRemoteDownloaders()).filter((d) => d.enabled);
  remoteContainer.replaceChildren(
    ...(remote.length
      ? remote.map((config) => createDownloaderRow(config, "remote", () => void runChoice({ kind: "remote", config })))
      : [noConfigMessage()]),
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("defaultIcon")!.replaceChildren(icon(ICON_CLOUD_DOWNLOAD));
  document.getElementById("exportCurlIcon")!.replaceChildren(icon(ICON_CLIPBOARD));
  document.getElementById("exportWgetIcon")!.replaceChildren(icon(ICON_CLIPBOARD));

  const response = await sendMessage({ action: "getPendingDownload" });
  if (!response.success || !response.download) {
    showMessage("error", "No pending download found");
    return;
  }
  displayDownloadInfo(response.download);
  await loadDownloaderConfigs();

  document.getElementById("defaultBtn")!.addEventListener("click", () => void runChoice({ kind: "chrome" }));
  document.getElementById("exportCurlBtn")!.addEventListener("click", () => void showExportCommand("curl"));
  document.getElementById("exportWgetBtn")!.addEventListener("click", () => void showExportCommand("wget"));
  document.getElementById("copyCommandBtn")!.addEventListener("click", () => void copyExportCommand());
  document.getElementById("closeCommandBtn")!.addEventListener("click", () => {
    document.getElementById("commandPanel")!.classList.add("hidden");
  });
  document.getElementById("compressCookiesCheckbox")?.addEventListener("change", () => {
    void updateExportCommand();
  });
  document.getElementById("cancelBtn")!.addEventListener("click", async () => {
    await sendMessage({ action: "cancelDownload" });
    window.close();
  });
});
