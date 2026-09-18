export interface DownloadContext {
  url: string;
  filename: string | null;
  cookies: chrome.cookies.Cookie[];
  referrer: string | null;
  originalUrl?: string | null;
}

export interface PendingDownload extends DownloadContext {
  originalUrl: string;
  mime: string | null;
  fileSize: number | null;
  timestamp: number;
}

export type LocalDownloaderType = "motrix" | "jdownloader" | "aria2" | "protocol" | "fdm" | "idm" | "curl" | "wget";
export type RemoteDownloaderType = "ssh-curl" | "qbittorrent" | "aria2";

export interface LocalDownloaderConfig {
  name: string;
  type: LocalDownloaderType;
  path?: string;
  rpcUrl?: string;
  token?: string;
  protocolPattern?: string;
  description?: string;
  enabled: boolean;
}

export interface RemoteDownloaderConfig {
  name: string;
  type: RemoteDownloaderType;
  description?: string;
  enabled: boolean;
  // ssh-curl
  sshHost?: string;
  sshUser?: string;
  sshPort?: number;
  sshPassword?: string;
  sshAuthType?: "agent" | "password" | "keyFile" | "keyContent";
  sshKeyFile?: string;
  sshKeyContent?: string;
  remoteFolder?: string;
  // qbittorrent
  webUIUrl?: string;
  username?: string;
  password?: string;
  // aria2
  rpcUrl?: string;
  token?: string;
}

export type DownloadChoice =
  | { kind: "chrome" }
  | { kind: "local"; config: LocalDownloaderConfig }
  | { kind: "remote"; config: RemoteDownloaderConfig };

export interface CustomCommandTemplate {
  id: string;
  name: string;
  template: string;
  description?: string;
  enabled: boolean;
}

