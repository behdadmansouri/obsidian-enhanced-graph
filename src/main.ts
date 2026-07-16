import { App, Plugin, WorkspaceLeaf } from 'obsidian';
import { EnhancedGraphSettings, DEFAULT_SETTINGS, EnhancedGraphSettingTab } from './settings';
import { GraphPatcher } from './graphPatch';

export default class EnhancedGraphPlugin extends Plugin {
	settings!: EnhancedGraphSettings;
	patcher!: GraphPatcher;

	async onload() {
		await this.loadSettings();

		this.patcher = new GraphPatcher(this.app, this.settings);

		// Add settings tab
		this.addSettingTab(new EnhancedGraphSettingTab(this.app, this));

		// Hook into workspace layout changes to detect graph view openings
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.patcher.onLayoutChange();
			})
		);


		// Command: Open Local Graph in New Tab
		this.addCommand({
			id: 'open-local-graph-new-tab',
			name: 'Open Local Graph in New Tab',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						this.openLocalGraphInNewTab(activeFile.path);
					}
					return true;
				}
				return false;
			}
		});

		// Trigger initial check for already open graphs
		this.app.workspace.onLayoutReady(() => {
			this.patcher.onLayoutChange();
		});
	}

	async openLocalGraphInNewTab(filePath: string) {
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: 'localgraph',
			state: {
				file: filePath
			}
		});
	}

	onunload() {
		// Clean up injected UI elements if necessary, though closing the graph handles most of it.

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update patcher settings ref
		this.patcher.settings = this.settings;
		// Re-apply layout changes to active graphs

		this.patcher.onLayoutChange();
	}
}
