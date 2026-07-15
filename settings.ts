import { App, PluginSettingTab, Setting } from 'obsidian';
import EnhancedGraphPlugin from './main';

export interface EnhancedGraphSettings {
	enablePageRank: boolean;
	globalPageRank: boolean;
	autoColorRootFolders: boolean;
	customFolderColors: Record<string, string>;
}

export const DEFAULT_SETTINGS: EnhancedGraphSettings = {
	enablePageRank: true,
	globalPageRank: false,
	autoColorRootFolders: true,
	customFolderColors: {}
}

export class EnhancedGraphSettingTab extends PluginSettingTab {
	plugin: EnhancedGraphPlugin;

	constructor(app: App, plugin: EnhancedGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Enhanced Graph Settings'});

		new Setting(containerEl)
			.setName('Enable PageRank Node Sizing')
			.setDesc('Scale local graph nodes based on a light PageRank algorithm instead of distance from center.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePageRank)
				.onChange(async (value) => {
					this.plugin.settings.enablePageRank = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Use Global PageRank')
			.setDesc('Calculate PageRank over the entire vault instead of just the local graph nodes.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.globalPageRank)
				.onChange(async (value) => {
					this.plugin.settings.globalPageRank = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-Color Root Folders')
			.setDesc('Automatically assign distinct colors to all root-level folders in the graph.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoColorRootFolders)
				.onChange(async (value) => {
					this.plugin.settings.autoColorRootFolders = value;
					await this.plugin.saveSettings();
				}));
	}
}
