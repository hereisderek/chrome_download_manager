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
import { checkFdmStatus } from "../downloaders/fdm.ts";

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
  if (config.type === "ssh-curl") {
    if (!config.sshHost) return undefined;
    const user = config.sshUser ? `${config.sshUser}@` : "";
    const port = config.sshPort && config.sshPort !== 22 ? `:${config.sshPort}` : "";
    const folder = config.remoteFolder ? ` (${config.remoteFolder})` : "";
    return `${user}${config.sshHost}${port}${folder}`;
  }
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
    if (local.type === "motrix" || local.type === "jdownloader" || local.type === "aria2") {
      const defaultRpc =
        local.type === "motrix"
          ? "http://127.0.0.1:16800/jsonrpc"
          : local.type === "jdownloader"
            ? "http://127.0.0.1:9666/flash/add"
            : "http://127.0.0.1:6800/jsonrpc";
      body.push(el("p", { className: "path" }, [el("strong", {}, ["Endpoint: "]), local.rpcUrl || defaultRpc]));
    } else if (local.type === "protocol") {
      body.push(el("p", { className: "path" }, [el("strong", {}, ["Protocol: "]), local.protocolPattern || "motrix://{url}"]));
    } else if (local.type === "fdm") {
      body.push(el("p", { className: "path" }, [el("strong", {}, ["Integration: "]), "1-Click Native Host / fdm:// Scheme"]));
    } else if (local.path) {
      body.push(el("p", { className: "path" }, [el("strong", {}, ["Binary: "]), local.path]));
    }
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

function updateLocalFields(): void {
  const type = $<HTMLSelectElement>("localType").value as LocalDownloaderType;
  const isRpc = type === "motrix" || type === "jdownloader" || type === "aria2";
  const hasToken = type === "motrix" || type === "aria2";
  const isProtocol = type === "protocol";
  const isPath = type === "curl" || type === "wget" || type === "idm";
  const isFdm = type === "fdm";

  $("localRpcGroup").classList.toggle("hidden", !isRpc);
  $("localTokenGroup").classList.toggle("hidden", !hasToken);
  $("localProtocolGroup").classList.toggle("hidden", !isProtocol);
  $("localPathGroup").classList.toggle("hidden", !isPath);
  $("fdmHelpBtn").classList.toggle("hidden", !isFdm);
  if (!isFdm) {
    $("fdmEduCard").classList.add("hidden");
  }

  const rpcInput = $<HTMLInputElement>("localRpcUrl");
  const rpcHint = $("localRpcHint");
  const pathInput = $<HTMLInputElement>("localPath");
  const pathHint = document.getElementById("localPathHint");
  const infoText = $("localTypeInfoText");

  if (type === "motrix") {
    rpcInput.placeholder = "http://127.0.0.1:16800/jsonrpc";
    rpcHint.textContent = "Motrix Aria2 JSON-RPC endpoint (default: http://127.0.0.1:16800/jsonrpc)";
    infoText.textContent = "⚡ 1-Click Download: Direct connection to Motrix via local Aria2 RPC. Make sure Motrix is running.";
  } else if (type === "jdownloader") {
    rpcInput.placeholder = "http://127.0.0.1:9666/flash/add";
    rpcHint.textContent = "JDownloader 2 Click'n'Load endpoint (default: http://127.0.0.1:9666/flash/add)";
    infoText.textContent = "⚡ 1-Click Download: Direct connection to JDownloader 2 via Click'n'Load. Make sure JDownloader is running.";
  } else if (type === "aria2") {
    rpcInput.placeholder = "http://127.0.0.1:6800/jsonrpc";
    rpcHint.textContent = "Aria2 JSON-RPC endpoint (default: http://127.0.0.1:6800/jsonrpc)";
    infoText.textContent = "⚡ 1-Click Download: Direct connection to local Aria2 via JSON-RPC.";
  } else if (type === "protocol") {
    infoText.textContent = "🔗 Protocol: Triggers the desktop app registered with your OS for this scheme.";
  } else if (type === "fdm") {
    infoText.textContent = "⚡ 1-Click / Scheme: Direct native host integration or fdm:// protocol. Click (?) for setup & diagnostics.";
  } else if (type === "idm") {
    pathInput.placeholder = "e.g., idman or C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe";
    if (pathHint) pathHint.textContent = "Binary name or full path for Internet Download Manager (default: idman)";
    infoText.textContent = "📋 CLI Export: Displays the IDM command in the popup for convenient 1-click copying.";
  } else if (type === "curl") {
    pathInput.placeholder = "curl";
    if (pathHint) pathHint.textContent = "Binary name or path for cURL (default: curl)";
    infoText.textContent = "📋 CLI Export: Displays the cURL command in the popup for convenient 1-click copying.";
  } else if (type === "wget") {
    pathInput.placeholder = "wget";
    if (pathHint) pathHint.textContent = "Binary name or path for wget (default: wget)";
    infoText.textContent = "📋 CLI Export: Displays the wget command in the popup for convenient 1-click copying.";
  }
}

function handleLocalTypeChange(): void {
  const index = Number($<HTMLInputElement>("localIndex").value);
  const type = $<HTMLSelectElement>("localType").value as LocalDownloaderType;
  const nameInput = $<HTMLInputElement>("localName");

  const defaultNames = [
    "Motrix",
    "JDownloader 2",
    "Aria2",
    "Custom Protocol",
    "Free Download Manager",
    "Internet Download Manager",
    "cURL",
    "wget",
  ];
  if (index === -1 && (!nameInput.value || defaultNames.includes(nameInput.value))) {
    const nameMap: Record<LocalDownloaderType, string> = {
      motrix: "Motrix",
      jdownloader: "JDownloader 2",
      aria2: "Aria2",
      protocol: "Custom Protocol",
      fdm: "Free Download Manager",
      idm: "Internet Download Manager",
      curl: "cURL",
      wget: "wget",
    };
    nameInput.value = nameMap[type] ?? "";
  }

  const isRpc = type === "motrix" || type === "jdownloader" || type === "aria2";
  const hasToken = type === "motrix" || type === "aria2";
  const isProtocol = type === "protocol";
  const isPath = type === "curl" || type === "wget" || type === "idm";

  // Clear fields not applicable to newly selected type
  if (!isRpc) $<HTMLInputElement>("localRpcUrl").value = "";
  if (!hasToken) $<HTMLInputElement>("localToken").value = "";
  if (!isProtocol) $<HTMLInputElement>("localProtocolPattern").value = "";
  if (!isPath) $<HTMLInputElement>("localPath").value = "";

  if (isRpc && !$<HTMLInputElement>("localRpcUrl").value) {
    if (type === "motrix") $<HTMLInputElement>("localRpcUrl").value = "http://127.0.0.1:16800/jsonrpc";
    else if (type === "jdownloader") $<HTMLInputElement>("localRpcUrl").value = "http://127.0.0.1:9666/flash/add";
    else if (type === "aria2") $<HTMLInputElement>("localRpcUrl").value = "http://127.0.0.1:6800/jsonrpc";
  }

  updateLocalFields();
}

function showLocalForm(data: LocalDownloaderConfig | null, index: number): void {
  $<HTMLFormElement>("localForm").reset();
  if (data) {
    $<HTMLInputElement>("localName").value = data.name;
    $<HTMLSelectElement>("localType").value = data.type;
    $<HTMLInputElement>("localRpcUrl").value = data.rpcUrl ?? "";
    $<HTMLInputElement>("localToken").value = data.token ?? "";
    $<HTMLInputElement>("localProtocolPattern").value = data.protocolPattern ?? "";
    $<HTMLInputElement>("localPath").value = data.path ?? "";
    $<HTMLInputElement>("localDescription").value = data.description ?? "";
    $<HTMLInputElement>("localEnabled").checked = data.enabled;
  } else {
    $<HTMLSelectElement>("localType").value = "motrix";
    $<HTMLInputElement>("localName").value = "Motrix";
    $<HTMLInputElement>("localRpcUrl").value = "http://127.0.0.1:16800/jsonrpc";
    $<HTMLInputElement>("localToken").value = "";
    $<HTMLInputElement>("localProtocolPattern").value = "";
    $<HTMLInputElement>("localPath").value = "";
    $<HTMLInputElement>("localDescription").value = "";
    $<HTMLInputElement>("localEnabled").checked = true;
  }
  updateLocalFields();
  $<HTMLInputElement>("localIndex").value = String(index);
  $("localDownloaderForm").classList.remove("hidden");
  $("localDownloaderForm").scrollIntoView({ behavior: "smooth" });
}

function hideLocalForm(): void {
  $("localDownloaderForm").classList.add("hidden");
  $("fdmEduCard").classList.add("hidden");
  $<HTMLFormElement>("localForm").reset();
}

async function saveLocalDownloader(): Promise<void> {
  const index = Number($<HTMLInputElement>("localIndex").value);
  const type = $<HTMLSelectElement>("localType").value as LocalDownloaderType;

  const isRpc = type === "motrix" || type === "jdownloader" || type === "aria2";
  const hasToken = type === "motrix" || type === "aria2";
  const isProtocol = type === "protocol";
  const isPath = type === "curl" || type === "wget" || type === "idm";

  const downloader: LocalDownloaderConfig = {
    name: $<HTMLInputElement>("localName").value.trim(),
    type,
    rpcUrl: isRpc ? ($<HTMLInputElement>("localRpcUrl").value.trim() || undefined) : undefined,
    token: hasToken ? ($<HTMLInputElement>("localToken").value.trim() || undefined) : undefined,
    protocolPattern: isProtocol ? ($<HTMLInputElement>("localProtocolPattern").value.trim() || undefined) : undefined,
    path: isPath ? ($<HTMLInputElement>("localPath").value.trim() || undefined) : undefined,
    description: $<HTMLInputElement>("localDescription").value.trim() || undefined,
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

function updateSshAuthFields(): void {
  const authType = $<HTMLSelectElement>("sshAuthType").value;
  $("sshPasswordGroup").classList.toggle("hidden", authType !== "password");
  $("sshKeyFileGroup").classList.toggle("hidden", authType !== "keyFile");
  $("sshKeyContentGroup").classList.toggle("hidden", authType !== "keyContent");
}

function updateRemoteFields(type: RemoteDownloaderType): void {
  $("sshCurlFields").classList.toggle("hidden", type !== "ssh-curl");
  $("qbittorrentFields").classList.toggle("hidden", type !== "qbittorrent");
  $("aria2Fields").classList.toggle("hidden", type !== "aria2");
  if (type === "ssh-curl") {
    updateSshAuthFields();
  }
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
    $<HTMLInputElement>("sshPort").value = data.sshPort ? String(data.sshPort) : "";
    $<HTMLInputElement>("sshRemoteFolder").value = data.remoteFolder ?? "";
    $<HTMLSelectElement>("sshAuthType").value =
      data.sshAuthType ??
      (data.sshPassword ? "password" : data.sshKeyFile ? "keyFile" : data.sshKeyContent ? "keyContent" : "agent");
    $<HTMLInputElement>("sshPassword").value = data.sshPassword ?? "";
    $<HTMLInputElement>("sshKeyFile").value = data.sshKeyFile ?? "";
    $<HTMLTextAreaElement>("sshKeyContent").value = data.sshKeyContent ?? "";
    $<HTMLInputElement>("qbWebUIUrl").value = data.webUIUrl ?? "";
    $<HTMLInputElement>("qbUsername").value = data.username ?? "";
    $<HTMLInputElement>("qbPassword").value = data.password ?? "";
    $<HTMLInputElement>("aria2RpcUrl").value = data.rpcUrl ?? "";
    $<HTMLInputElement>("aria2Token").value = data.token ?? "";
  } else {
    $<HTMLInputElement>("sshPort").value = "";
    $<HTMLInputElement>("sshRemoteFolder").value = "";
    $<HTMLSelectElement>("sshAuthType").value = "agent";
    $<HTMLInputElement>("sshPassword").value = "";
    $<HTMLInputElement>("sshKeyFile").value = "";
    $<HTMLTextAreaElement>("sshKeyContent").value = "";
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
    name: $<HTMLInputElement>("remoteName").value.trim(),
    type,
    description: $<HTMLInputElement>("remoteDescription").value.trim() || undefined,
    enabled: $<HTMLInputElement>("remoteEnabled").checked,
  };

  if (type === "ssh-curl") {
    downloader.sshHost = $<HTMLInputElement>("sshHost").value.trim();
    downloader.sshUser = $<HTMLInputElement>("sshUser").value.trim() || undefined;
    const portVal = $<HTMLInputElement>("sshPort").value.trim();
    downloader.sshPort = portVal ? parseInt(portVal, 10) : undefined;
    downloader.remoteFolder = $<HTMLInputElement>("sshRemoteFolder").value.trim() || undefined;
    const authType = $<HTMLSelectElement>("sshAuthType").value as RemoteDownloaderConfig["sshAuthType"];
    downloader.sshAuthType = authType;
    if (authType === "password") {
      downloader.sshPassword = $<HTMLInputElement>("sshPassword").value;
    } else if (authType === "keyFile") {
      downloader.sshKeyFile = $<HTMLInputElement>("sshKeyFile").value.trim();
    } else if (authType === "keyContent") {
      downloader.sshKeyContent = $<HTMLTextAreaElement>("sshKeyContent").value.trim();
    }
  } else if (type === "qbittorrent") {
    downloader.webUIUrl = $<HTMLInputElement>("qbWebUIUrl").value.trim();
    downloader.username = $<HTMLInputElement>("qbUsername").value.trim();
    downloader.password = $<HTMLInputElement>("qbPassword").value;
  } else {
    downloader.rpcUrl = $<HTMLInputElement>("aria2RpcUrl").value.trim();
    downloader.token = $<HTMLInputElement>("aria2Token").value.trim() || undefined;
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

// ---------- FDM Education & Diagnostics ----------

async function runFdmDiagnostics(): Promise<void> {
  const extStatus = $("fdmExtStatus");
  const hostStatus = $("fdmHostStatus");
  const schemeStatus = $("fdmSchemeStatus");
  const noteEl = $("fdmDiagNote");

  extStatus.className = "diag-badge status-pending";
  extStatus.textContent = "Checking...";
  hostStatus.className = "diag-badge status-pending";
  hostStatus.textContent = "Checking...";
  schemeStatus.className = "diag-badge status-pending";
  schemeStatus.textContent = "Checking...";
  noteEl.classList.add("hidden");

  try {
    const status = await checkFdmStatus();

    // 1. Extension
    if (status.extensionInstalled) {
      if (status.extensionEnabled) {
        extStatus.className = "diag-badge status-ok";
        extStatus.textContent = "Installed & Active";
      } else {
        extStatus.className = "diag-badge status-warn";
        extStatus.textContent = "Installed (Disabled)";
      }
    } else {
      extStatus.className = "diag-badge status-warn";
      extStatus.textContent = "Not Installed";
    }

    // 2. Native Host
    if (status.nativeHostStatus === "connected") {
      hostStatus.className = "diag-badge status-ok";
      hostStatus.textContent = "Connected (Authorized)";
      noteEl.textContent = "Native Messaging is active and authorized. Downloads will be routed directly to FDM with complete cookies and headers.";
      noteEl.classList.remove("hidden");
    } else if (status.nativeHostStatus === "forbidden") {
      hostStatus.className = "diag-badge status-err";
      hostStatus.textContent = "Forbidden (Origin not authorized)";
      noteEl.textContent = "FDM Native Host found, but Chrome denied access because this extension's origin isn't listed in FDM's allowed_origins. Click 'Copy' above, add it to the host manifest, and restart Chrome.";
      noteEl.classList.remove("hidden");
    } else if (status.nativeHostStatus === "not_found") {
      hostStatus.className = "diag-badge status-warn";
      hostStatus.textContent = "Not Found (FDM not detected)";
      noteEl.textContent = "FDM native messaging host was not detected. Ensure Free Download Manager is installed on your computer.";
      noteEl.classList.remove("hidden");
    } else {
      hostStatus.className = "diag-badge status-err";
      hostStatus.textContent = "Error";
      noteEl.textContent = `Diagnostic error: ${status.nativeHostError || "Unknown error"}`;
      noteEl.classList.remove("hidden");
    }

    // 3. Scheme
    schemeStatus.className = "diag-badge status-ok";
    schemeStatus.textContent = "Supported (fdm://)";
  } catch {
    hostStatus.className = "diag-badge status-err";
    hostStatus.textContent = "Check Failed";
  }
}

function initFdmEducation(): void {
  const originCode = $("extensionOriginCode");
  const extOrigin = `chrome-extension://${chrome.runtime?.id || "extension-id"}/`;
  originCode.textContent = extOrigin;

  const copyBtn = $<HTMLButtonElement>("copyExtOriginBtn");
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(extOrigin);
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1500);
    } catch {
      copyBtn.textContent = "Failed";
    }
  });

  const helpBtn = $("fdmHelpBtn");
  const eduCard = $("fdmEduCard");
  const closeBtn = $("closeFdmEduBtn");
  const diagBtn = $("runFdmDiagnosticsBtn");

  helpBtn.addEventListener("click", () => {
    const isHidden = eduCard.classList.contains("hidden");
    eduCard.classList.toggle("hidden", !isHidden);
    if (isHidden) {
      void runFdmDiagnostics();
    }
  });

  closeBtn.addEventListener("click", () => {
    eduCard.classList.add("hidden");
  });

  diagBtn.addEventListener("click", () => {
    void runFdmDiagnostics();
  });
}

// ---------- wiring ----------

document.addEventListener("DOMContentLoaded", async () => {
  localDownloaders = await getLocalDownloaders();
  remoteDownloaders = await getRemoteDownloaders();
  customCommands = await getCustomCommands();
  renderLocalDownloaders();
  renderRemoteDownloaders();
  renderCustomCommands();
  initFdmEducation();

  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab!));
  });

  $("addLocalBtn").addEventListener("click", () => showLocalForm(null, -1));
  $("cancelLocalBtn").addEventListener("click", hideLocalForm);
  $<HTMLFormElement>("localForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveLocalDownloader();
  });
  $<HTMLSelectElement>("localType").addEventListener("change", handleLocalTypeChange);

  $("addRemoteBtn").addEventListener("click", () => showRemoteForm(null, -1));
  $("cancelRemoteBtn").addEventListener("click", hideRemoteForm);
  $<HTMLFormElement>("remoteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveRemoteDownloader();
  });
  $<HTMLSelectElement>("remoteType").addEventListener("change", (event) => {
    updateRemoteFields((event.target as HTMLSelectElement).value as RemoteDownloaderType);
  });
  $<HTMLSelectElement>("sshAuthType").addEventListener("change", updateSshAuthFields);

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

