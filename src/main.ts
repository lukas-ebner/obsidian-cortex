import {
  Plugin,
  TFolder,
  Menu,
  Notice,
  TAbstractFile,
} from "obsidian";
import {
  CortexSettings,
  DEFAULT_SETTINGS,
  FolderProjectState,
} from "./types";
import { CortexApiClient } from "./api/client";
import { PathMapper } from "./utils/pathMapper";
import { CortexSettingTab } from "./settings";

export default class CortexPlugin extends Plugin {
  settings: CortexSettings = DEFAULT_SETTINGS;
  api: CortexApiClient = new CortexApiClient("", "");
  private pathMapper: PathMapper | null = null;
  private statusBarEl: HTMLElement | null = null;
  private pollInterval: number | null = null;

  /** Cache: Obsidian folder path → project state */
  private folderStates: Map<string, FolderProjectState> = new Map();
  /** Server project_root, learned from first /folders call */
  private serverProjectRoot: string = "";

  async onload(): Promise<void> {
    await this.loadSettings();

    this.api = new CortexApiClient(
      this.settings.serverUrl,
      this.settings.apiKey
    );

    // Settings tab
    this.addSettingTab(new CortexSettingTab(this.app, this));

    // Status bar
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("Cortex: ...");

    // Commands
    this.addCommand({
      id: "cortex-refresh",
      name: "Refresh project status",
      callback: () => this.refreshAllProjects(),
    });

    this.addCommand({
      id: "cortex-sync-current",
      name: "Sync current folder",
      callback: () => this.syncCurrentFolder(),
    });

    // Context menu on folders
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFolder) {
          this.addFolderMenuItems(menu, file);
        }
      })
    );

    // Initial refresh (delayed to let vault load)
    this.registerInterval(
      window.setTimeout(() => this.refreshAllProjects(), 2000) as unknown as number
    );

    // Periodic refresh
    this.startPolling();
  }

  onunload(): void {
    this.stopPolling();
    this.clearDecorations();
  }

  // ── Settings ──

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.api.configure(this.settings.serverUrl, this.settings.apiKey);
    this.serverProjectRoot = ""; // Reset so it gets re-discovered with new settings
    this.startPolling();
    await this.refreshAllProjects();
  }

  // ── Polling ──

  private startPolling(): void {
    this.stopPolling();
    if (this.settings.serverUrl && this.settings.apiKey) {
      const ms = this.settings.pollIntervalSeconds * 1000;
      this.pollInterval = window.setInterval(() => this.refreshAllProjects(), ms);
      this.registerInterval(this.pollInterval);
    }
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // ── Core: refresh project state ──

  async refreshAllProjects(): Promise<void> {
    if (!this.settings.serverUrl || !this.settings.apiKey) {
      this.updateStatusBar(0, false);
      return;
    }

    try {
      // Step 1: Discover project_root if unknown
      if (!this.serverProjectRoot) {
        const rootResponse = await this.api.listFolders("");
        this.serverProjectRoot = rootResponse.project_root;
      }

      // Step 2: Compute vault path relative to project_root
      const vaultAbs = this.settings.serverVaultRoot.replace(/\/+$/, "");
      const projectRoot = this.serverProjectRoot.replace(/\/+$/, "");
      let vaultRelPath: string;
      if (vaultAbs.startsWith(projectRoot + "/")) {
        vaultRelPath = vaultAbs.slice(projectRoot.length + 1);
      } else if (vaultAbs === projectRoot) {
        vaultRelPath = "";
      } else {
        // Fallback: strip leading slash
        vaultRelPath = vaultAbs.replace(/^\/+/, "");
      }

      // Step 3: Update path mapper
      this.pathMapper = new PathMapper(vaultAbs, projectRoot);

      // Step 4: List folders in vault
      const response = await this.api.listFolders(vaultRelPath);
      this.folderStates.clear();
      this.mapFolderStates(response.folders);

      // Step 5: Count active projects and update UI
      const projects = await this.api.listProjects();
      const activeCount = projects.projects.filter((p) => p.is_active).length;
      this.updateStatusBar(activeCount, true);
      this.applyDecorations();
    } catch (e) {
      console.error("Cortex refresh failed:", e);
      this.updateStatusBar(0, false);
    }
  }

  private mapFolderStates(
    folders: Array<{
      name: string;
      rel_path: string;
      is_active: boolean;
      project_external_id: string | null;
      project_name: string | null;
    }>
  ): void {
    for (const f of folders) {
      const localPath = this.pathMapper?.fromServerRelPath(f.rel_path);
      if (localPath !== null && localPath !== undefined) {
        this.folderStates.set(localPath, {
          isProject: f.is_active,
          projectName: f.project_name,
          externalId: f.project_external_id,
        });
      }
    }
  }

  // ── Status bar ──

  private updateStatusBar(count: number, connected: boolean): void {
    if (!this.statusBarEl) return;
    if (!this.settings.serverUrl) {
      this.statusBarEl.setText("Cortex: not configured");
    } else if (!connected) {
      this.statusBarEl.setText("Cortex: offline");
    } else {
      this.statusBarEl.setText(`Cortex: ${count} project${count !== 1 ? "s" : ""}`);
    }
  }

  // ── Folder decorations ──

  private applyDecorations(): void {
    this.clearDecorations();

    // Find file explorer leaf
    const fileExplorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
    if (!fileExplorer) return;

    const view = fileExplorer.view as any; // eslint-disable-line
    if (!view?.fileItems) return;

    for (const [folderPath, state] of this.folderStates) {
      if (!state.isProject) continue;
      const item = view.fileItems[folderPath];
      if (!item?.selfEl) continue;

      // Add a small colored dot badge
      const badge = item.selfEl.createEl("span", {
        cls: "cortex-badge",
        attr: { "aria-label": `Cortex: ${state.projectName}` },
      });
      badge.setText("●");
    }
  }

  private clearDecorations(): void {
    document
      .querySelectorAll(".cortex-badge")
      .forEach((el) => el.remove());
  }

  // ── Context menu ──

  private addFolderMenuItems(menu: Menu, folder: TFolder): void {
    const state = this.folderStates.get(folder.path);

    if (state?.isProject && state.externalId) {
      // Folder IS a project
      menu.addItem((item) =>
        item
          .setTitle("Cortex: Sync")
          .setIcon("refresh-cw")
          .onClick(() => this.syncFolder(state.externalId!))
      );
      menu.addItem((item) =>
        item
          .setTitle("Cortex: Deactivate")
          .setIcon("circle-minus")
          .onClick(() => this.deactivateFolder(state.externalId!))
      );
    } else {
      // Folder is NOT a project
      menu.addItem((item) =>
        item
          .setTitle("Cortex: Activate as project")
          .setIcon("circle-plus")
          .onClick(() => this.activateFolder(folder))
      );
    }
  }

  // ── Actions ──

  private async activateFolder(folder: TFolder): Promise<void> {
    if (!this.pathMapper) {
      new Notice("Cortex: Not connected to server");
      return;
    }
    const relPath = this.pathMapper.toServerRelPath(folder.path);
    try {
      new Notice(`Cortex: Activating "${folder.name}"...`);
      const result = await this.api.enableFolder(relPath);
      new Notice(`✅ ${result.message}`);
      await this.refreshAllProjects();
    } catch (e) {
      new Notice(`❌ Cortex: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async syncFolder(externalId: string): Promise<void> {
    try {
      new Notice("Cortex: Syncing...");
      const result = await this.api.syncProject(externalId);
      new Notice(`✅ ${result.message}`);
    } catch (e) {
      new Notice(`❌ Cortex sync: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async deactivateFolder(externalId: string): Promise<void> {
    try {
      new Notice("Cortex: Deactivating...");
      await this.api.disableProject(externalId);
      new Notice("✅ Project deactivated");
      await this.refreshAllProjects();
    } catch (e) {
      new Notice(`❌ Cortex: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async syncCurrentFolder(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Cortex: No active file");
      return;
    }
    // Walk up to find a folder that's a project
    let folder: TAbstractFile | null = file.parent;
    while (folder && folder instanceof TFolder) {
      const state = this.folderStates.get(folder.path);
      if (state?.isProject && state.externalId) {
        await this.syncFolder(state.externalId);
        return;
      }
      folder = folder.parent;
    }
    new Notice("Cortex: Current folder is not an active project");
  }

}
