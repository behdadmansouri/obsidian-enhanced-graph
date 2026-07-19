import { App, Modal, Setting, Notice, TFile, TFolder, FuzzySuggestModal } from 'obsidian';

export class MoveVisibleModal extends Modal {
    targetFolder: string = '';
    filesToMove: TFile[] = [];
    
    constructor(app: App, filesToMove: TFile[]) {
        super(app);
        this.filesToMove = filesToMove;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Move Visible Nodes' });

        contentEl.createEl('p', { text: `You are about to move ${this.filesToMove.length} files.` });

        new Setting(contentEl)
            .setName('Target Folder')
            .setDesc('Enter the path to the target folder (e.g., "Cooking"). It will be created if it doesn\'t exist.')
            .addText(text => text
                .onChange(value => {
                    this.targetFolder = value.trim();
                }));

        const progressContainer = contentEl.createDiv({ cls: 'progress-container', attr: { style: 'margin-top: 20px; display: none;' } });
        const progressBar = progressContainer.createDiv({ attr: { style: 'width: 0%; height: 10px; background-color: var(--interactive-accent); transition: width 0.1s ease;' } });
        const progressText = progressContainer.createDiv({ attr: { style: 'margin-top: 5px; font-size: 0.8em; text-align: center;' } });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Move Files')
                .setCta()
                .onClick(async () => {
                    if (!this.targetFolder) {
                        new Notice('Please enter a target folder.');
                        return;
                    }

                    btn.setDisabled(true);
                    progressContainer.style.display = 'block';

                    await this.moveFiles(progressBar, progressText);
                    
                    this.close();
                }));
    }

    async moveFiles(progressBar: HTMLElement, progressText: HTMLElement) {
        // Ensure folder exists
        let folder = this.app.vault.getAbstractFileByPath(this.targetFolder);
        if (!folder) {
            try {
                await this.app.vault.createFolder(this.targetFolder);
            } catch (e) {
                new Notice(`Failed to create folder: ${this.targetFolder}`);
                return;
            }
        } else if (!(folder instanceof TFolder)) {
            new Notice(`A file already exists with the name ${this.targetFolder}`);
            return;
        }

        let moved = 0;
        let skipped = [];

        for (let i = 0; i < this.filesToMove.length; i++) {
            const file = this.filesToMove[i];
            if (!file) continue;
            const newPath = `${this.targetFolder}/${file.name}`;
            
            // Update progress
            const percent = Math.round((i / this.filesToMove.length) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.setText(`Moving ${file.name}... (${i + 1}/${this.filesToMove.length})`);

            if (file.path === newPath) {
                // already there
                moved++;
                continue;
            }

            if (this.app.vault.getAbstractFileByPath(newPath)) {
                skipped.push(file.name);
            } else {
                try {
                    await this.app.fileManager.renameFile(file, newPath);
                    moved++;
                } catch (e) {
                    console.error('Failed to move', file.path, e);
                    skipped.push(file.name);
                }
            }
        }

        progressBar.style.width = `100%`;
        progressText.setText(`Done!`);

        new Notice(`Moved ${moved} files.${skipped.length > 0 ? ` Skipped: ${skipped.length}` : ''}`);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class ExcludeSuggestModal extends FuzzySuggestModal<TFile> {
    onSelectCallback: (file: TFile) => void;

    constructor(app: App, onSelectCallback: (file: TFile) => void) {
        super(app);
        this.onSelectCallback = onSelectCallback;
        this.setPlaceholder("Select a file to exclude from local graphs...");
    }

    getItems(): TFile[] {
        return this.app.vault.getFiles();
    }

    getItemText(file: TFile): string {
        return file.path;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onSelectCallback(file);
    }
}
