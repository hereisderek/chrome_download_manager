import {
  getCustomCommands,
  getLocalDownloaders,
  getRemoteDownloaders,
  setCustomCommands,
  setLocalDownloaders,
  setRemoteDownloaders,
} from "../lib/storage.ts";
import {
  CustomCommandTemplate,
  LocalDownloaderConfig,
  LocalDownloaderType,
  RemoteDownloaderConfig,
  RemoteDownloaderType,
} from "../lib/types.ts";
import { validateCommandTemplate } from "../lib/commands.ts";

let localDownloaders: LocalDownloaderConfig[] = [];
let remoteDownloaders: RemoteDownloaderConfig[] = [];
let customCommands: CustomCommandTemplate[] = [];

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
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

// ---------- tabs ----------

function switchTab(tab: string): void {
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll<HTMLElement>(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === `${tab}Tab`);
  });
}

// ---------- rendering ----------

function remoteAddress(config: RemoteDownloaderConfig): string | undefined {
  if (config.type === "qbittorrent") return config.webUIUrl;
  if (config.type === "aria2") return config.rpcUrl;
  if (config.type === "ssh-curl") return config.sshHost ? `${config.sshUser ? `${config.sshUser}@` : ""}${config.sshHost}` : undefined;
  return undefined;
}

function createDownloaderCard(
  config: LocalDownloaderConfig | RemoteDownloaderConfig,
  index: number,
  kind: "local" | "remote",
): HTMLDivElement {
  const body: HTMLElement[] = [];
  if (config.description) body.push(el("p", {}, [config.description]));
  if (kind === "local") {
    const local = config as LocalDownloaderConfig;
    body.push(el("p", { className: "path" }, [el("strong", {}, ["Path: "]), local.path]));
  } else {
    const address = remoteAddress(config as RemoteDownloaderConfig);
    if (address) body.push(el("p", { className: "path" }, [el("strong", {}, ["Address: "]), address]));
  }

  const editBtn = el("button", { type: "button", className: "edit-btn" }, ["Edit"]);
  const deleteBtn = el("button", { type: "button", className: "delete-btn" }, ["Delete"]);
  const toggle = el("input", { type: "checkbox", className: "toggle-enabled", checked: config.enabled });

  editBtn.addEventListener("click", () => (kind === "local" ? editLocalDownloader(index) : editRemoteDownloader(index)));
  deleteBtn.addEventListener("click", () => (kind === "local" ? deleteLocalDownloader(index) : deleteRemoteDownloader(index)));
  toggle.addEventListener("change", () => {
    config.enabled = toggle.checked;
    void (kind === "local" ? saveLocalDownloaders() : saveRemoteDownloaders());
  });

  const card = el("div", { className: `downloader-card${config.enabled ? "" : " disabled"}` }, [
    el("div", { className: "card-header" }, [
      el("h3", {}, [config.name]),
      el("span", { className: "type-badge" }, [config.type]),
    ]),
    el("div", { className: "card-body" }, body),
    el("div", { className: "card-actions" }, [
      editBtn,
      deleteBtn,
      el("label", { className: "toggle-label" }, [toggle, "Enabled"]),
    ]),
  ]);
  return card;
}

function renderLocalDownloaders(): void {
  const container = $("localDownloadersList");
  container.replaceChildren(
    ...(localDownloaders.length
      ? localDownloaders.map((d, i) => createDownloaderCard(d, i, "local"))
      : [el("p", { className: "empty-message" }, ["No local downloaders configured yet."])]),
  );
}

function renderRemoteDownloaders(): void {
  const container = $("remoteDownloadersList");
  container.replaceChildren(
    ...(remoteDownloaders.length
      ? remoteDownloaders.map((d, i) => createDownloaderCard(d, i, "remote"))
      : [el("p", { className: "empty-message" }, ["No remote downloaders configured yet."])]),
  );
}

// ---------- storage ----------

async function saveLocalDownloaders(): Promise<void> {
  await setLocalDownloaders(localDownloaders);
}

async function saveRemoteDownloaders(): Promise<void> {
  await setRemoteDownloaders(remoteDownloaders);
}

function showStatusMessage(message: string, kind: "success" | "error" = "success"): void {
  const status = $("statusMessage");
  status.textContent = message;
  status.className = `status-message ${kind}`;
  setTimeout(() => status.classList.add("hidden"), 3000);
}

// ---------- local form ----------

function showLocalForm(data: LocalDownloaderConfig | null, index: number): void {
  $<HTMLFormElement>("localForm").reset();
  if (data) {
    $<HTMLInputElement>("localName").value = data.name;
    $<HTMLSelectElement>("localType").value = data.type;
    $<HTMLInputElement>("localPath").value = data.path;
    $<HTMLInputElement>("localDescription").value = data.description ?? "";
    $<HTMLInputElement>("localEnabled").checked = data.enabled;
  }
  $<HTMLInputElement>("localIndex").value = String(index);
  $("localDownloaderForm").classList.remove("hidden");
  $("localDownloaderForm").scrollIntoView({ behavior: "smooth" });
}

function hideLocalForm(): void {
  $("localDownloaderForm").classList.add("hidden");
  $<HTMLFormElement>("localForm").reset();
}

async function saveLocalDownloader(): Promise<void> {
  const index = Number($<HTMLInputElement>("localIndex").value);
  const downloader: LocalDownloaderConfig = {
    name: $<HTMLInputElement>("localName").value,
    type: $<HTMLSelectElement>("localType").value as LocalDownloaderType,
    path: $<HTMLInputElement>("localPath").value,
    description: $<HTMLInputElement>("localDescription").value || undefined,
    enabled: $<HTMLInputElement>("localEnabled").checked,
  };

  if (index === -1) localDownloaders.push(downloader);
  else localDownloaders[index] = downloader;

  await saveLocalDownloaders();
  hideLocalForm();
  renderLocalDownloaders();
  showStatusMessage("Local downloader saved successfully");
}

function editLocalDownloader(index: number): void {
  showLocalForm(localDownloaders[index] ?? null, index);
}

async function deleteLocalDownloader(index: number): Promise<void> {
  if (!confirm("Are you sure you want to delete this downloader?")) return;
  localDownloaders.splice(index, 1);
  await saveLocalDownloaders();
  renderLocalDownloaders();
  showStatusMessage("Local downloader deleted");
}

// ---------- remote form ----------

function updateRemoteFields(type: RemoteDownloaderType): void {
  $("sshCurlFields").classList.toggle("hidden", type !== "ssh-curl");
  $("qbittorrentFields").classList.toggle("hidden", type !== "qbittorrent");
  $("aria2Fields").classList.toggle("hidden", type !== "aria2");
}

function showRemoteForm(data: RemoteDownloaderConfig | null, index: number): void {
  $<HTMLFormElement>("remoteForm").reset();
  const type = data?.type ?? "ssh-curl";

  if (data) {
    $<HTMLInputElement>("remoteName").value = data.name;
    $<HTMLInputElement>("remoteDescription").value = data.description ?? "";
    $<HTMLInputElement>("remoteEnabled").checked = data.enabled;
    $<HTMLInputElement>("sshHost").value = data.sshHost ?? "";
    $<HTMLInputElement>("sshUser").value = data.sshUser ?? "";
    $<HTMLInputElement>("qbWebUIUrl").value = data.webUIUrl ?? "";
    $<HTMLInputElement>("qbUsername").value = data.username ?? "";
    $<HTMLInputElement>("qbPassword").value = data.password ?? "";
    $<HTMLInputElement>("aria2RpcUrl").value = data.rpcUrl ?? "";
    $<HTMLInputElement>("aria2Token").value = data.token ?? "";
  }
  $<HTMLSelectElement>("remoteType").value = type;
  $<HTMLInputElement>("remoteIndex").value = String(index);
  updateRemoteFields(type);

  $("remoteDownloaderForm").classList.remove("hidden");
  $("remoteDownloaderForm").scrollIntoView({ behavior: "smooth" });
}

function hideRemoteForm(): void {
  $("remoteDownloaderForm").classList.add("hidden");
  $<HTMLFormElement>("remoteForm").reset();
}

async function saveRemoteDownloader(): Promise<void> {
  const index = Number($<HTMLInputElement>("remoteIndex").value);
  const type = $<HTMLSelectElement>("remoteType").value as RemoteDownloaderType;

  const downloader: RemoteDownloaderConfig = {
    name: $<HTMLInputElement>("remoteName").value,
    type,
    description: $<HTMLInputElement>("remoteDescription").value || undefined,
    enabled: $<HTMLInputElement>("remoteEnabled").checked,
  };

  if (type === "ssh-curl") {
    downloader.sshHost = $<HTMLInputElement>("sshHost").value;
    downloader.sshUser = $<HTMLInputElement>("sshUser").value || undefined;
  } else if (type === "qbittorrent") {
    downloader.webUIUrl = $<HTMLInputElement>("qbWebUIUrl").value;
    downloader.username = $<HTMLInputElement>("qbUsername").value;
    downloader.password = $<HTMLInputElement>("qbPassword").value;
  } else {
    downloader.rpcUrl = $<HTMLInputElement>("aria2RpcUrl").value;
    downloader.token = $<HTMLInputElement>("aria2Token").value || undefined;
  }

  if (index === -1) remoteDownloaders.push(downloader);
  else remoteDownloaders[index] = downloader;

  await saveRemoteDownloaders();
  hideRemoteForm();
  renderRemoteDownloaders();
  showStatusMessage("Remote downloader saved successfully");
}

function editRemoteDownloader(index: number): void {
  showRemoteForm(remoteDownloaders[index] ?? null, index);
}

async function deleteRemoteDownloader(index: number): Promise<void> {
  if (!confirm("Are you sure you want to delete this downloader?")) return;
  remoteDownloaders.splice(index, 1);
  await saveRemoteDownloaders();
  renderRemoteDownloaders();
  showStatusMessage("Remote downloader deleted");
}

// ---------- custom command form & rendering ----------

function createCustomCommandCard(
  config: CustomCommandTemplate,
  index: number,
): HTMLDivElement {
  const body: HTMLElement[] = [];
  if (config.description) body.push(el("p", {}, [config.description]));
  body.push(el("p", { className: "path" }, [el("strong", {}, ["Template: "]), config.template]));

  const editBtn = el("button", { type: "button", className: "edit-btn" }, ["Edit"]);
  const deleteBtn = el("button", { type: "button", className: "delete-btn" }, ["Delete"]);
  const toggle = el("input", { type: "checkbox", className: "toggle-enabled", checked: config.enabled });

  editBtn.addEventListener("click", () => editCustomCommand(index));
  deleteBtn.addEventListener("click", () => void deleteCustomCommand(index));
  toggle.addEventListener("change", () => {
    config.enabled = toggle.checked;
    void saveCustomCommands();
  });

  const card = el("div", { className: `downloader-card${config.enabled ? "" : " disabled"}` }, [
    el("div", { className: "card-header" }, [
      el("h3", {}, [config.name]),
      el("span", { className: "type-badge" }, ["template"]),
    ]),
    el("div", { className: "card-body" }, body),
    el("div", { className: "card-actions" }, [
      editBtn,
      deleteBtn,
      el("label", { className: "toggle-label" }, [toggle, "Enabled"]),
    ]),
  ]);
  return card;
}

function renderCustomCommands(): void {
  const container = $("customCommandsList");
  container.replaceChildren(
    ...(customCommands.length
      ? customCommands.map((c, i) => createCustomCommandCard(c, i))
      : [el("p", { className: "empty-message" }, ["No custom command templates configured yet."])]),
  );
}

async function saveCustomCommands(): Promise<void> {
  await setCustomCommands(customCommands);
}

function showCustomForm(data: CustomCommandTemplate | null, index: number): void {
  $<HTMLFormElement>("customForm").reset();
  const errorEl = $("customError");
  errorEl.classList.add("hidden");
  errorEl.textContent = "";

  if (data) {
    $<HTMLInputElement>("customName").value = data.name;
    $<HTMLTextAreaElement>("customTemplate").value = data.template;
    $<HTMLInputElement>("customDescription").value = data.description ?? "";
    $<HTMLInputElement>("customEnabled").checked = data.enabled;
    $("customFormTitle").textContent = "Edit Command Template";
  } else {
    $("customFormTitle").textContent = "Add Command Template";
  }
  $<HTMLInputElement>("customIndex").value = String(index);
  $("customCommandForm").classList.remove("hidden");
  $("customCommandForm").scrollIntoView({ behavior: "smooth" });
}

function hideCustomForm(): void {
  $("customCommandForm").classList.add("hidden");
  const errorEl = $("customError");
  errorEl.classList.add("hidden");
  errorEl.textContent = "";
  $<HTMLFormElement>("customForm").reset();
}

async function saveCustomCommand(): Promise<void> {
  const templateStr = $<HTMLTextAreaElement>("customTemplate").value.trim();
  const validation = validateCommandTemplate(templateStr);
  const errorEl = $("customError");

  if (!validation.valid) {
    errorEl.textContent = validation.error ?? "Invalid command template";
    errorEl.classList.remove("hidden");
    $<HTMLTextAreaElement>("customTemplate").focus();
    return;
  }
  errorEl.classList.add("hidden");
  errorEl.textContent = "";

  const index = Number($<HTMLInputElement>("customIndex").value);
  const command: CustomCommandTemplate = {
    id: index >= 0 && customCommands[index] ? customCommands[index].id : `custom_${Date.now()}`,
    name: $<HTMLInputElement>("customName").value.trim(),
    template: templateStr,
    description: $<HTMLInputElement>("customDescription").value.trim() || undefined,
    enabled: $<HTMLInputElement>("customEnabled").checked,
  };

  if (index === -1) customCommands.push(command);
  else customCommands[index] = command;

  await saveCustomCommands();
  hideCustomForm();
  renderCustomCommands();
  showStatusMessage("Command template saved successfully");
}

function editCustomCommand(index: number): void {
  showCustomForm(customCommands[index] ?? null, index);
}

async function deleteCustomCommand(index: number): Promise<void> {
  if (!confirm("Are you sure you want to delete this command template?")) return;
  customCommands.splice(index, 1);
  await saveCustomCommands();
  renderCustomCommands();
  showStatusMessage("Command template deleted");
}

// ---------- wiring ----------

document.addEventListener("DOMContentLoaded", async () => {
  localDownloaders = await getLocalDownloaders();
  remoteDownloaders = await getRemoteDownloaders();
  customCommands = await getCustomCommands();
  renderLocalDownloaders();
  renderRemoteDownloaders();
  renderCustomCommands();

  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab!));
  });

  $("addLocalBtn").addEventListener("click", () => showLocalForm(null, -1));
  $("cancelLocalBtn").addEventListener("click", hideLocalForm);
  $<HTMLFormElement>("localForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveLocalDownloader();
  });

  $("addRemoteBtn").addEventListener("click", () => showRemoteForm(null, -1));
  $("cancelRemoteBtn").addEventListener("click", hideRemoteForm);
  $<HTMLFormElement>("remoteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveRemoteDownloader();
  });
  $<HTMLSelectElement>("remoteType").addEventListener("change", (event) => {
    updateRemoteFields((event.target as HTMLSelectElement).value as RemoteDownloaderType);
  });

  $("addCustomBtn").addEventListener("click", () => showCustomForm(null, -1));
  $("cancelCustomBtn").addEventListener("click", hideCustomForm);
  $<HTMLFormElement>("customForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveCustomCommand();
  });

  function handleHash(): void {
    const hash = location.hash.replace(/^#/, "");
    if (hash === "custom" || hash === "local" || hash === "remote" || hash === "about") {
      switchTab(hash);
    } else {
      const tab = new URLSearchParams(location.search).get("tab");
      if (tab === "custom" || tab === "local" || tab === "remote" || tab === "about") {
        switchTab(tab);
      }
    }
  }

  handleHash();
  window.addEventListener("hashchange", handleHash);
});

