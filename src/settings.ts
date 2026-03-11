import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type CortexPlugin from "./main";

export class CortexSettingTab extends PluginSettingTab {
  plugin: CortexPlugin;

  constructor(app: App, plugin: CortexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Cortex Settings" });

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
        "Absolute path to your vault on the server (e.g. /app/data/lukas-vault/Obsidian-Cloud)"
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

    // ── Test Connection button ──

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
  }
}
