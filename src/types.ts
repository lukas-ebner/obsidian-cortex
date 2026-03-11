/** Cortex API types matching the server's Pydantic schemas. */

export interface CortexSettings {
  serverUrl: string;
  apiKey: string;
  serverVaultRoot: string; // e.g. "/app/data/lukas-vault/Obsidian-Cloud"
  pollIntervalSeconds: number;
  // Syncthing auto-connect
  syncthingApiUrl: string; // default: "http://127.0.0.1:8384"
  syncthingApiKey: string; // local Syncthing API key
  syncConnected: boolean; // true after successful connect
  syncFolderId: string; // Syncthing folder ID after connect
}

export const DEFAULT_SETTINGS: CortexSettings = {
  serverUrl: "",
  apiKey: "",
  serverVaultRoot: "",
  pollIntervalSeconds: 60,
  syncthingApiUrl: "http://127.0.0.1:8384",
  syncthingApiKey: "",
  syncConnected: false,
  syncFolderId: "",
};

// ── Sync API types ──

export interface ConnectSyncResponse {
  server_device_id: string;
  server_address: string;
  folder_id: string;
  folder_label: string;
  server_vault_root: string;
}

export interface SyncStatusResponse {
  connected: boolean;
  folder_id: string | null;
  folder_label: string | null;
  server_device_id: string | null;
  server_address: string | null;
}

// ── API Response types ──

export interface ProjectItem {
  id: number;
  external_id: string;
  name: string;
  path: string;
  is_default: boolean;
  is_active: boolean;
  display_name: string | null;
  is_private: boolean;
}

export interface ProjectList {
  projects: ProjectItem[];
  default_project: string | null;
}

export interface FolderEntry {
  name: string;
  rel_path: string;
  abs_path: string;
  md_count: number;
  is_active: boolean;
  project_external_id: string | null;
  project_name: string | null;
}

export interface FolderListResponse {
  folders: FolderEntry[];
  md_files: Array<{ name: string; rel_path: string }>;
  current_path: string;
  project_root: string;
}

export interface EnableFolderResponse {
  status: string;
  message: string;
  project: ProjectItem;
}

export interface SyncResponse {
  status: string;
  message: string;
}

export interface ProjectStatusResponse {
  message: string;
  status: string;
  default: boolean;
  old_project: ProjectItem | null;
  new_project: ProjectItem | null;
}

/** Cached state of a folder's project status, used for decorations. */
export interface FolderProjectState {
  isProject: boolean;
  projectName: string | null;
  externalId: string | null;
}
