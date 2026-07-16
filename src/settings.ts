import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import EnhancedGraphPlugin from './main';

export interface EnhancedGraphSettings {

	autoColorRootFolders: boolean;
	customFolderColors: Record<string, string>;

    // Exact Default Values
    defaultCenterForce: number;
    defaultRepelForce: number;
    defaultLinkForce: number;
    defaultLinkDistance: number;
    defaultTextFade: number;
    defaultDepth: number;
}

export const DEFAULT_SETTINGS: EnhancedGraphSettings = {

	autoColorRootFolders: true,
	customFolderColors: {},
    defaultCenterForce: 1,
    defaultRepelForce: 20,
    defaultLinkForce: 1,
    defaultLinkDistance: 30,
    defaultTextFade: -3,
    defaultDepth: 1
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

        containerEl.createEl('h3', {text: 'Exact Graph Defaults'});
        containerEl.createEl('p', {text: 'These values will be applied exactly every time a new local graph opens.'});

        new Setting(containerEl)
            .setName('Default Center Force')
            .addText(text => text
                .setValue(String(this.plugin.settings.defaultCenterForce))
                .onChange(async (value) => {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed)) {
                        this.plugin.settings.defaultCenterForce = parsed;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Default Repel Force')
            .addText(text => text
                .setValue(String(this.plugin.settings.defaultRepelForce))
                .onChange(async (value) => {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed)) {
                        this.plugin.settings.defaultRepelForce = parsed;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Default Link Force')
            .addText(text => text
                .setValue(String(this.plugin.settings.defaultLinkForce))
                .onChange(async (value) => {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed)) {
                        this.plugin.settings.defaultLinkForce = parsed;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Default Link Distance')
            .addText(text => text
                .setValue(String(this.plugin.settings.defaultLinkDistance))
                .onChange(async (value) => {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed)) {
                        this.plugin.settings.defaultLinkDistance = parsed;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Default Text Fade Threshold')
            .addText(text => text
                .setValue(String(this.plugin.settings.defaultTextFade))
                .onChange(async (value) => {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed)) {
                        this.plugin.settings.defaultTextFade = parsed;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Default Depth (Jumps)')
            .addText(text => text
                .setValue(String(this.plugin.settings.defaultDepth))
                .onChange(async (value) => {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed)) {
                        this.plugin.settings.defaultDepth = parsed;
                        await this.plugin.saveSettings();
                    }
                }));

        containerEl.createEl('h3', {text: 'Node Sizing & Colors'});



		new Setting(containerEl)
			.setName('Auto-Color Root Folders')
			.setDesc('Automatically assign distinct colors to all root-level folders in the graph.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoColorRootFolders)
				.onChange(async (value) => {
					this.plugin.settings.autoColorRootFolders = value;
					this.display(); 
					await this.plugin.saveSettings();
				}));

        if (this.plugin.settings.autoColorRootFolders) {
            containerEl.createEl('h4', { text: 'Folder Colors' });
            containerEl.createEl('p', { text: 'Assign permanent colors for your root folders here.' });

            const rootFolders = this.app.vault.getRoot().children.filter(c => c instanceof TFolder) as TFolder[];
            const defaultColors = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D0BAFF', '#FFBAED', '#BAFFF3'];

            for (let i = 0; i < rootFolders.length; i++) {
                const folder = rootFolders[i];
                if (!folder) continue;
                
                const currentColor = this.plugin.settings.customFolderColors[folder.path] || defaultColors[i % defaultColors.length] || '#ffffff';

                if (!this.plugin.settings.customFolderColors[folder.path]) {
                    this.plugin.settings.customFolderColors[folder.path] = currentColor;
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
