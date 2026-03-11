import { requestUrl, RequestUrlParam } from "obsidian";

/**
 * Client for the LOCAL Syncthing REST API (http://127.0.0.1:8384).
 *
 * Used during the "Connect Vault to Cortex" flow to:
 * 1. Read the local device ID
 * 2. Add the Cortex server as a remote device
 * 3. Configure the shared vault folder
 */
export class SyncthingLocalClient {
  constructor(
    private apiUrl: string,
    private apiKey: string
  ) {}

  configure(apiUrl: string, apiKey: string): void {
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const params: RequestUrlParam = {
      url: `${this.apiUrl}${path}`,
      method,
      headers: this.headers,
      throw: false,
    };
    if (body) {
      params.body = JSON.stringify(body);
    }
    const response = await requestUrl(params);
    if (response.status >= 400) {
      const detail =
        response.json?.error || response.text || `HTTP ${response.status}`;
      throw new Error(`Syncthing API error (${response.status}): ${detail}`);
    }
    return response.json as T;
  }

  // ── Read operations ──

  /**
   * Get the local Syncthing device ID.
   */
  async getDeviceId(): Promise<string> {
    const status = await this.request<{ myID: string }>(
      "GET",
      "/rest/system/status"
    );
    return status.myID;
  }

  /**
   * Get a folder config by ID, or null if it doesn't exist.
   */
  async getFolder(
    folderId: string
  ): Promise<Record<string, unknown> | null> {
    try {
      return await this.request<Record<string, unknown>>(
        "GET",
        `/rest/config/folders/${folderId}`
      );
    } catch {
      return null;
    }
  }

  // ── Write operations ──

  /**
   * Add a remote device (the Cortex server).
   */
  async addDevice(
    deviceId: string,
    name: string,
    addresses: string[]
  ): Promise<void> {
    // Use PUT to add or update
    await this.request<unknown>("PUT", `/rest/config/devices/${deviceId}`, {
      deviceID: deviceId,
      name: name,
      addresses: addresses,
      autoAcceptFolders: false,
      compression: "metadata",
    });
  }

  /**
   * Add a shared folder pointing to the local vault path.
   *
   * @param folderId  - Must match the server-side folder ID
   * @param label     - Human-readable label
   * @param path      - Local filesystem path to sync (the Obsidian vault)
   * @param deviceIds - Remote device IDs to share with (server device ID)
   */
  async addFolder(
    folderId: string,
    label: string,
    path: string,
    deviceIds: string[]
  ): Promise<void> {
    // Get own device ID to include in the folder config
    const myId = await this.getDeviceId();

    const devices: Array<{ deviceID: string; introducedBy: string }> = [
      { deviceID: myId, introducedBy: "" },
    ];
    for (const did of deviceIds) {
      if (did !== myId) {
        devices.push({ deviceID: did, introducedBy: "" });
      }
    }

    await this.request<unknown>("PUT", `/rest/config/folders/${folderId}`, {
      id: folderId,
      label: label,
      path: path,
      type: "sendreceive",
      devices: devices,
      rescanIntervalS: 60,
      fsWatcherEnabled: true,
      fsWatcherDelayS: 10,
      ignorePerms: false,
      autoNormalize: true,
    });
  }

  /**
   * Test connection to local Syncthing.
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const deviceId = await this.getDeviceId();
      return {
        ok: true,
        message: `Connected! Device ID: ${deviceId.substring(0, 7)}…`,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
