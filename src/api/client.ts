import { requestUrl, RequestUrlParam } from "obsidian";
import {
  ProjectList,
  FolderListResponse,
  EnableFolderResponse,
  SyncResponse,
  ProjectStatusResponse,
  ProjectItem,
} from "../types";

/**
 * Cortex API client using Obsidian's built-in requestUrl (CORS-safe).
 */
export class CortexApiClient {
  constructor(
    private serverUrl: string,
    private apiKey: string
  ) {}

  /** Update connection settings. */
  configure(serverUrl: string, apiKey: string): void {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const params: RequestUrlParam = {
      url: `${this.serverUrl}${path}`,
      method,
      headers: this.headers,
      throw: false,
    };
    if (body) {
      params.body = JSON.stringify(body);
    }
    const response = await requestUrl(params);
    if (response.status >= 400) {
      const detail = response.json?.detail || response.text || `HTTP ${response.status}`;
      throw new Error(`Cortex API error (${response.status}): ${detail}`);
    }
    return response.json as T;
  }

  // ── Project endpoints ──

  async listProjects(): Promise<ProjectList> {
    return this.request<ProjectList>("GET", "/v2/projects/");
  }

  async getProject(externalId: string): Promise<ProjectItem> {
    return this.request<ProjectItem>("GET", `/v2/projects/${externalId}`);
  }

  async syncProject(externalId: string): Promise<SyncResponse> {
    return this.request<SyncResponse>(
      "POST",
      `/v2/projects/${externalId}/sync?run_in_background=true`
    );
  }

  async disableProject(externalId: string): Promise<ProjectStatusResponse> {
    return this.request<ProjectStatusResponse>(
      "PATCH",
      `/v2/projects/${externalId}`,
      { is_active: false }
    );
  }

  // ── Folder endpoints ──

  async listFolders(path: string = ""): Promise<FolderListResponse> {
    const encoded = encodeURIComponent(path);
    return this.request<FolderListResponse>(
      "GET",
      `/v2/projects/folders?path=${encoded}`
    );
  }

  async enableFolder(folderPath: string): Promise<EnableFolderResponse> {
    return this.request<EnableFolderResponse>(
      "POST",
      "/v2/projects/enable-folder",
      { folder_path: folderPath }
    );
  }

  // ── Connection test ──

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await this.listProjects();
      return {
        ok: true,
        message: `Connected! ${result.projects.length} project(s) found.`,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
