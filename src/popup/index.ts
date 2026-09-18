import { getCustomCommands, getLocalDownloaders, getRemoteDownloaders } from "../lib/storage.ts";
import { ICON_ALERT_CIRCLE, ICON_CHECK_CIRCLE, ICON_CLIPBOARD, ICON_CLOUD_DOWNLOAD, ICON_FILE, ICON_SERVER, ICON_TERMINAL } from "../lib/icons.ts";
import { sendMessage } from "../lib/messages.ts";
import { buildCurlCommand, buildWgetCommand, compressShellCommand, isReauthCheckpoint, renderCommandTemplate } from "../lib/commands.ts";
import { buildLocalCommand } from "../downloaders/local.ts";
import { buildSshCurlCommand } from "../downloaders/remote.ts";
import { formatCookieHeader } from "../lib/cookies.ts";
import type {
  CustomCommandTemplate,
  DownloadChoice,
  LocalDownloaderConfig,
  LocalDownloaderType,
  PendingDownload,
  RemoteDownloaderConfig,
  RemoteDownloaderType,
} from "../lib/types.ts";

const DESCRIPTIONS: Record<LocalDownloaderType | RemoteDownloaderType, string> = {
  motrix: "Motrix (1-Click Local RPC)",
  jdownloader: "JDownloader 2 (1-Click)",
  aria2: "aria2 RPC",
  protocol: "Custom URL Protocol",
  fdm: "Free Download Manager CLI",
  idm: "Internet Download Manager CLI",
  curl: "cURL command-line tool",
  wget: "Wget command-line tool",
  "ssh-curl": "cURL over SSH",
  qbittorrent: "qBittorrent Web UI",
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
}

function createDownloaderRow(
  config: LocalDownloaderConfig | RemoteDownloaderConfig,
  kind: "local" | "remote",
  onClick: (event: MouseEvent) => void,
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

async function openOptionsTab(tab?: "custom" | "local" | "remote"): Promise<void> {
  const hash = tab ? `#${tab}` : "";
  const targetUrl = chrome.runtime.getURL(`options/index.html${hash}`);
  const matchPattern = chrome.runtime.getURL("options/index.html*");
  const [existingTab] = await chrome.tabs.query({ url: matchPattern });
  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
    if (existingTab.windowId) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: targetUrl });
  }
}

function noConfigMessage(tab: "local" | "remote"): HTMLParagraphElement {
  const link = el("a", { href: "#" }, ["Configure now"]);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void openOptionsTab(tab);
  });
  return el("p", { className: "no-config" }, ["Nothing configured yet. ", link]);
}

function createCustomTemplateRow(
  tmpl: CustomCommandTemplate,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const row = el("button", { type: "button", className: "option-row" }, [
    el("span", { className: "option-icon" }, [icon(ICON_CLIPBOARD)]),
    el("span", { className: "option-text" }, [
      el("strong", {}, [tmpl.name]),
      el("small", {}, [tmpl.description || tmpl.template]),
    ]),
  ]);
  row.addEventListener("click", onClick);
  return row;
}

function noCustomConfigMessage(): HTMLParagraphElement {
  const link = el("a", { href: "#" }, ["+ Add command template"]);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void openOptionsTab("custom");
  });
  return el("p", { className: "no-config" }, ["No custom templates yet. ", link]);
}

async function runChoice(choice: DownloadChoice): Promise<void> {
  setBusy(true);
  const response = await sendMessage({
    action: "handleDownload",
    choice,
    download: pendingDownload ?? undefined,
  });
  if (response.success) {
    showMessage("success", "Download started");
    setTimeout(() => window.close(), 1000);
  } else {
    showMessage("error", response.error);
    setBusy(false);
  }
}

type ActiveExport =
  | { kind: "curl" }
  | { kind: "wget" }
  | { kind: "custom"; template: CustomCommandTemplate }
  | { kind: "local"; config: LocalDownloaderConfig }
  | {
      kind: "ssh-curl";
      config: RemoteDownloaderConfig;
      remotePath?: string;
      passwordOverride?: string;
      keyFileOverride?: string;
      keyContentOverride?: string;
    };

let activeExport: ActiveExport | null = null;
let currentExportCommand = "";
let pendingDownload: PendingDownload | null = null;

function updateCommandPanelFields(): void {
  const sshGroup = document.getElementById("sshOverridesGroup");
  const sshDestInput = document.getElementById("sshDestinationInput") as HTMLInputElement | null;
  const sshPassInput = document.getElementById("sshPasswordInput") as HTMLInputElement | null;
  const sshKeyFileInput = document.getElementById("sshKeyFileInput") as HTMLInputElement | null;
  const sshKeyContentInput = document.getElementById("sshKeyContentInput") as HTMLTextAreaElement | null;
  const togglePassBtn = document.getElementById("togglePasswordBtn");

  if (!sshGroup) return;

  if (activeExport?.kind === "ssh-curl") {
    sshGroup.classList.remove("hidden");
    if (sshDestInput) sshDestInput.value = activeExport.remotePath ?? "";
    if (sshPassInput) {
      sshPassInput.value = activeExport.passwordOverride ?? "";
      sshPassInput.type = "password";
    }
    if (togglePassBtn) togglePassBtn.textContent = "Show";
    if (sshKeyFileInput) sshKeyFileInput.value = activeExport.keyFileOverride ?? "";
    if (sshKeyContentInput) sshKeyContentInput.value = activeExport.keyContentOverride ?? "";
  } else {
    sshGroup.classList.add("hidden");
  }
}

async function updateExportCommand(): Promise<void> {
  if (!activeExport || !pendingDownload) return;
  const compressCheckbox = document.getElementById("compressCommandCheckbox") as HTMLInputElement | null;
  const compressCommand = compressCheckbox?.checked ?? false;

  let command = "";
  if (activeExport.kind === "curl" || activeExport.kind === "wget") {
    const opts = { mimicBrowserNavigation: true };
    command = activeExport.kind === "curl"
      ? buildCurlCommand(pendingDownload, opts)
      : buildWgetCommand(pendingDownload, opts);
  } else if (activeExport.kind === "local") {
    command = buildLocalCommand(activeExport.config, pendingDownload);
  } else if (activeExport.kind === "ssh-curl") {
    const effectiveConfig: RemoteDownloaderConfig = {
      ...activeExport.config,
      sshPassword: activeExport.passwordOverride !== undefined ? activeExport.passwordOverride : activeExport.config.sshPassword,
      sshKeyFile: activeExport.keyFileOverride !== undefined ? activeExport.keyFileOverride : activeExport.config.sshKeyFile,
      sshKeyContent: activeExport.keyContentOverride !== undefined ? activeExport.keyContentOverride : activeExport.config.sshKeyContent,
    };
    command = buildSshCurlCommand(effectiveConfig, pendingDownload, {
      remotePath: activeExport.remotePath,
    });
  } else {
    command = await renderCommandTemplate(activeExport.template.template, pendingDownload, {});
  }

  if (compressCommand) {
    command = await compressShellCommand(command);
  }

  currentExportCommand = command;
  document.getElementById("commandText")!.textContent = currentExportCommand;

  const warning = isReauthCheckpoint(pendingDownload.url)
    ? "Google is asking to re-verify this session before releasing the file. That step needs a real browser to pass - this command likely won't work. Try \"Chrome downloader\" instead."
    : "";
  const warningEl = document.getElementById("commandWarning")!;
  warningEl.textContent = warning;
  warningEl.classList.toggle("hidden", !warning);
}

function showCommandPanel(targetElement?: HTMLElement): void {
  const panel = document.getElementById("commandPanel")!;
  if (targetElement) {
    targetElement.after(panel);
  }
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function showBuiltinCommand(tool: "curl" | "wget", targetElement: HTMLElement): Promise<void> {
  activeExport = { kind: tool };
  updateCommandPanelFields();
  setBusy(true);
  await updateExportCommand();
  setBusy(false);
  showCommandPanel(targetElement);
}

async function showLocalCommand(config: LocalDownloaderConfig, targetElement: HTMLElement): Promise<void> {
  activeExport = { kind: "local", config };
  updateCommandPanelFields();
  setBusy(true);
  await updateExportCommand();
  setBusy(false);
  showCommandPanel(targetElement);
}

async function showCustomCommand(template: CustomCommandTemplate, targetElement: HTMLElement): Promise<void> {
  activeExport = { kind: "custom", template };
  updateCommandPanelFields();
  setBusy(true);
  await updateExportCommand();
  setBusy(false);
  showCommandPanel(targetElement);
}

async function showSshCurlCommand(config: RemoteDownloaderConfig, targetElement: HTMLElement): Promise<void> {
  activeExport = {
    kind: "ssh-curl",
    config,
    remotePath: config.remoteFolder,
    passwordOverride: config.sshPassword,
    keyFileOverride: config.sshKeyFile,
    keyContentOverride: config.sshKeyContent,
  };
  updateCommandPanelFields();
  setBusy(true);
  await updateExportCommand();
  setBusy(false);
  showCommandPanel(targetElement);
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
  const customContainer = document.getElementById("customCommands")!;
  const custom = (await getCustomCommands()).filter((c) => c.enabled);
  customContainer.replaceChildren(
    ...(custom.length
      ? custom.map((tmpl) =>
          createCustomTemplateRow(tmpl, (event) => void showCustomCommand(tmpl, event.currentTarget as HTMLElement)),
        )
      : [noCustomConfigMessage()]),
  );

  const localContainer = document.getElementById("localDownloaders")!;
  const local = (await getLocalDownloaders()).filter((d) => d.enabled);
  localContainer.replaceChildren(
    ...(local.length
      ? local.map((config) =>
          createDownloaderRow(config, "local", (event) => {
            const isOneClick = ["motrix", "jdownloader", "aria2", "protocol"].includes(config.type);
            if (isOneClick) {
              void runChoice({ kind: "local", config });
            } else {
              void showLocalCommand(config, event.currentTarget as HTMLElement);
            }
          }),
        )
      : [noConfigMessage("local")]),
  );

  const remoteContainer = document.getElementById("remoteDownloaders")!;
  const remote = (await getRemoteDownloaders()).filter((d) => d.enabled);
  remoteContainer.replaceChildren(
    ...(remote.length
      ? remote.map((config) =>
          createDownloaderRow(config, "remote", (event) => {
            if (config.type === "ssh-curl") {
              void showSshCurlCommand(config, event.currentTarget as HTMLElement);
            } else {
              void runChoice({ kind: "remote", config });
            }
          }),
        )
      : [noConfigMessage("remote")]),
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
  pendingDownload = response.download;
  displayDownloadInfo(response.download);
  await loadDownloaderConfigs();

  document.getElementById("defaultBtn")!.addEventListener("click", () => void runChoice({ kind: "chrome" }));
  document.getElementById("exportCurlBtn")!.addEventListener("click", (event) => void showBuiltinCommand("curl", event.currentTarget as HTMLElement));
  document.getElementById("exportWgetBtn")!.addEventListener("click", (event) => void showBuiltinCommand("wget", event.currentTarget as HTMLElement));
  document.getElementById("configureCustomLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    void openOptionsTab("custom");
  });
  document.getElementById("configureLocalLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    void openOptionsTab("local");
  });
  document.getElementById("configureRemoteLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    void openOptionsTab("remote");
  });
  document.getElementById("openOptionsPageLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    void openOptionsTab();
  });
  document.getElementById("togglePasswordBtn")?.addEventListener("click", () => {
    const passInput = document.getElementById("sshPasswordInput") as HTMLInputElement | null;
    const btn = document.getElementById("togglePasswordBtn");
    if (!passInput || !btn) return;
    if (passInput.type === "password") {
      passInput.type = "text";
      btn.textContent = "Hide";
    } else {
      passInput.type = "password";
      btn.textContent = "Show";
    }
  });
  document.getElementById("sshDestinationInput")?.addEventListener("input", (event) => {
    if (activeExport?.kind === "ssh-curl") {
      activeExport.remotePath = (event.target as HTMLInputElement).value;
      void updateExportCommand();
    }
  });
  document.getElementById("sshPasswordInput")?.addEventListener("input", (event) => {
    if (activeExport?.kind === "ssh-curl") {
      activeExport.passwordOverride = (event.target as HTMLInputElement).value;
      void updateExportCommand();
    }
  });
  document.getElementById("sshKeyFileInput")?.addEventListener("input", (event) => {
    if (activeExport?.kind === "ssh-curl") {
      activeExport.keyFileOverride = (event.target as HTMLInputElement).value;
      void updateExportCommand();
    }
  });
  document.getElementById("sshKeyContentInput")?.addEventListener("input", (event) => {
    if (activeExport?.kind === "ssh-curl") {
      activeExport.keyContentOverride = (event.target as HTMLTextAreaElement).value;
      void updateExportCommand();
    }
  });
  document.getElementById("copyCommandBtn")!.addEventListener("click", () => void copyExportCommand());
  document.getElementById("closeCommandBtn")!.addEventListener("click", () => {
    document.getElementById("commandPanel")!.classList.add("hidden");
  });
  document.getElementById("compressCommandCheckbox")?.addEventListener("change", () => {
    void updateExportCommand();
  });
  document.getElementById("cancelBtn")!.addEventListener("click", async () => {
    await sendMessage({ action: "cancelDownload" });
    window.close();
  });
});
