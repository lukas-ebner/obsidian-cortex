import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type CortexPlugin from "./main";
import { SyncthingLocalClient } from "./api/syncthing";

export class CortexSettingTab extends PluginSettingTab {
  plugin: CortexPlugin;

  constructor(app: App, plugin: CortexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Server Connection ──

    containerEl.createEl("h2", { text: "Cortex Server" });

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc("URL of your Cortex server (e.g. https://memory.frct.me)")
      .addText((text) =>
        text
          .setPlaceholder("https://memory.frct.me")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.replace(/\/+$/, "");
            await this.plugin.saveSettings();
            this.plugin.api.configure(
              this.plugin.settings.serverUrl,
              this.plugin.settings.apiKey
            );
          })
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Bearer token for authentication (starts with bm_)")
      .addText((text) =>
        text
          .setPlaceholder("bm_...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
            this.plugin.api.configure(
              this.plugin.settings.serverUrl,
              this.plugin.settings.apiKey
            );
          })
      );

    new Setting(containerEl)
      .setName("Server Vault Root")
      .setDesc(
        "Absolute path to your vault on the server (auto-configured after sync connect)"
      )
      .addText((text) =>
        text
          .setPlaceholder("/app/data/lukas-vault/Obsidian-Cloud")
          .setValue(this.plugin.settings.serverVaultRoot)
          .onChange(async (value) => {
            this.plugin.settings.serverVaultRoot = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Poll Interval")
      .setDesc("How often to refresh project status (in seconds)")
      .addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(String(this.plugin.settings.pollIntervalSeconds))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 10) {
              this.plugin.settings.pollIntervalSeconds = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Verify your server URL and API key")
      .addButton((button) =>
        button.setButtonText("Test").onClick(async () => {
          button.setButtonText("Testing...");
          button.setDisabled(true);
          const result = await this.plugin.api.testConnection();
          if (result.ok) {
            new Notice(`✅ ${result.message}`);
            button.setButtonText("✅ Connected");
          } else {
            new Notice(`❌ ${result.message}`);
            button.setButtonText("❌ Failed");
          }
          setTimeout(() => {
            button.setButtonText("Test");
            button.setDisabled(false);
          }, 3000);
        })
      );

    // ── Vault Sync (Syncthing) ──

    containerEl.createEl("h2", { text: "Vault Sync (Syncthing)" });

    const syncDesc = containerEl.createEl("p", {
      cls: "setting-item-description",
    });
    syncDesc.style.marginBottom = "12px";
    if (this.plugin.settings.syncConnected) {
      syncDesc.setText(
        `✅ Connected — Folder: ${this.plugin.settings.syncFolderId}`
      );
      syncDesc.style.color = "var(--text-success)";
    } else {
      syncDesc.setText(
        "Connect your vault to Cortex for automatic file sync via Syncthing. " +
          "Install Syncthing first, then enter your local API key below."
      );
    }

    new Setting(containerEl)
      .setName("Syncthing API URL")
      .setDesc("URL of your local Syncthing instance")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:8384")
          .setValue(this.plugin.settings.syncthingApiUrl)
          .onChange(async (value) => {
            this.plugin.settings.syncthingApiUrl = value.replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Syncthing API Key")
      .setDesc(
        "Find in Syncthing GUI → Actions → Settings → API Key"
      )
      .addText((text) =>
        text
          .setPlaceholder("paste your local API key here")
          .setValue(this.plugin.settings.syncthingApiKey)
          .onChange(async (value) => {
            this.plugin.settings.syncthingApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // Connect / Disconnect button
    if (this.plugin.settings.syncConnected) {
      new Setting(containerEl)
        .setName("Sync Status")
        .setDesc(`Syncing via folder "${this.plugin.settings.syncFolderId}"`)
        .addButton((button) =>
          button
            .setButtonText("Disconnect")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.syncConnected = false;
              this.plugin.settings.syncFolderId = "";
              await this.plugin.saveSettings();
              new Notice("Syncthing sync disconnected (local config unchanged)");
              this.display(); // re-render
            })
        );
    } else {
      new Setting(containerEl)
        .setName("Connect Vault to Cortex")
        .setDesc(
          "Pairs your local Syncthing with the Cortex server and sets up bidirectional sync"
        )
        .addButton((button) =>
          button
            .setButtonText("Connect")
            .setCta()
            .onClick(async () => {
              await this.connectVault(button);
            })
        );
    }
  }

  // ── Connect Flow ──

  private async connectVault(
    button: { setButtonText: (t: string) => void; setDisabled: (d: boolean) => void }
  ): Promise<void> {
    const { settings } = this.plugin;

    // Validate prerequisites
    if (!settings.serverUrl || !settings.apiKey) {
      new Notice("❌ Please configure Server URL and API Key first");
      return;
    }
    if (!settings.syncthingApiKey) {
      new Notice("❌ Please enter your local Syncthing API Key first");
      return;
    }

    button.setButtonText("Connecting...");
    button.setDisabled(true);

    try {
      const syncthing = new SyncthingLocalClient(
        settings.syncthingApiUrl,
        settings.syncthingApiKey
      );

      // 1. Get local device ID
      new Notice("🔄 Reading local Syncthing device ID...");
      const localDeviceId = await syncthing.getDeviceId();

      // 2. Get device name from vault name
      const deviceName = `${this.app.vault.getName()} (Obsidian)`;

      // 3. Register with Cortex server
      new Notice("🔄 Registering with Cortex server...");
      const response = await this.plugin.api.connectSync(
        localDeviceId,
        deviceName
      );

      // 4. Add server device to local Syncthing
      new Notice("🔄 Adding Cortex server to local Syncthing...");
      await syncthing.addDevice(
        response.server_device_id,
        "Cortex Server",
        [response.server_address]
      );

      // 5. Configure shared folder locally
      const vaultPath = (this.app.vault.adapter as any).basePath as string;
      new Notice("🔄 Configuring sync folder...");

      // Check if folder already exists locally
      const existing = await syncthing.getFolder(response.folder_id);
      if (!existing) {
        await syncthing.addFolder(
          response.folder_id,
          response.folder_label,
          vaultPath,
          [response.server_device_id]
        );
      }

      // 6. Update plugin settings
      settings.serverVaultRoot = response.server_vault_root;
      settings.syncConnected = true;
      settings.syncFolderId = response.folder_id;
      await this.plugin.saveSettings();

      new Notice("✅ Vault connected! Syncthing will start syncing shortly.");
      button.setButtonText("✅ Connected");

      // Re-render settings to show connected state
      setTimeout(() => this.display(), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`❌ Connection failed: ${msg}`);
      button.setButtonText("Connect");
      button.setDisabled(false);
    }
  }
}
