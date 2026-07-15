import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
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
					this.display(); // re-render to show/hide colors
					await this.plugin.saveSettings();
				}));

        if (this.plugin.settings.autoColorRootFolders) {
            containerEl.createEl('h3', { text: 'Folder Colors' });
            containerEl.createEl('p', { text: 'Assign permanent colors for your root folders here.' });

            const rootFolders = this.app.vault.getRoot().children.filter(c => c instanceof TFolder) as TFolder[];
            
            // Default visually appealing colors to cycle through if not set
            const defaultColors = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D0BAFF', '#FFBAED', '#BAFFF3'];

            for (let i = 0; i < rootFolders.length; i++) {
                const folder = rootFolders[i];
                if (!folder) continue;
                
                const currentColor = this.plugin.settings.customFolderColors[folder.path] || defaultColors[i % defaultColors.length] || '#ffffff';

                // Ensure it's saved if it was falling back to default
                if (!this.plugin.settings.customFolderColors[folder.path]) {
                    this.plugin.settings.customFolderColors[folder.path] = currentColor;
                    // Intentionally not saving here to avoid excessive writes during render, it will save when they change it
                }

                new Setting(containerEl)
                    .setName(folder.path)
                    .addColorPicker(color => color
                        .setValue(currentColor)
                        .onChange(async (value) => {
                            this.plugin.settings.customFolderColors[folder.path] = value;
                            await this.plugin.saveSettings();
                        })
                    );
            }
        }
	}
}
