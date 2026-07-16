import { App, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import { EnhancedGraphSettings } from './settings';
import { MoveVisibleModal } from './ui';

export class GraphPatcher {
    app: App;
    settings: EnhancedGraphSettings;
    

    patchedLeaves: Set<string> = new Set();
    observers: Map<string, MutationObserver> = new Map();

    constructor(app: App, settings: EnhancedGraphSettings) {
        this.app = app;
        this.settings = settings;
    }

    onLayoutChange() {
        const leaves = this.app.workspace.getLeavesOfType('localgraph');
        for (const leaf of leaves) {
            const leafId = (leaf as any).id;

            this.enforceDefaults(leaf);

            if (!this.patchedLeaves.has(leafId)) {
                this.patchLocalGraphLeaf(leaf);
                this.patchedLeaves.add(leafId);
            }
        }
    }

    enforceDefaults(leaf: WorkspaceLeaf) {
        const state = leaf.getViewState();
        
        const s = state.state as any;
        if (!s) state.state = {} as any;
        if (!s.options) s.options = {};

        if (s.enhancedGraphDefaultsApplied) {
            return; 
        }

        s.options.localJumps = this.settings.defaultDepth;
        s.options.localBacklinks = true;
        s.options.showAttachments = false;
        s.options.showUncreated = false; // "Existing files only" ON
        
        s.options.centerStrength = this.settings.defaultCenterForce;
        s.options.repelStrength = this.settings.defaultRepelForce;
        s.options.linkStrength = this.settings.defaultLinkForce;
        s.options.linkDistance = this.settings.defaultLinkDistance;
        s.options.textFadeMultiplier = this.settings.defaultTextFade;

        if (this.settings.autoColorRootFolders) {
            s.options.colorGroups = this.generateFolderColorGroups();
        }

        s.enhancedGraphDefaultsApplied = true;

        leaf.setViewState(state);
    }

    generateFolderColorGroups() {
        const rootFolders = this.app.vault.getRoot().children.filter(c => c instanceof TFolder) as TFolder[];
        const colorGroups = [];
        const defaultColors = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D0BAFF', '#FFBAED', '#BAFFF3'];
        
        for (let i = 0; i < rootFolders.length; i++) {
            const folder = rootFolders[i];
            if (!folder) continue;
            const color = this.settings.customFolderColors[folder.path] || defaultColors[i % defaultColors.length] || '#ffffff';
            colorGroups.push({
                query: `path:"${folder.path}"`,
                color: {
                    a: 1,
                    rgb: this.hexToRgb(color)
                }
            });
        }
        return colorGroups;
    }

    hexToRgb(hex: string): number {
        const h = hex.replace('#', '');
        return parseInt(h, 16);
    }

    patchLocalGraphLeaf(leaf: WorkspaceLeaf) {
        const view: any = leaf.view;
        const leafId = (leaf as any).id;

        this.observeControls(leaf, leafId);
    }

    intervals: Map<string, NodeJS.Timeout> = new Map();

    observeControls(leaf: WorkspaceLeaf, leafId: string) {
        if (this.intervals.has(leafId)) {
            clearInterval(this.intervals.get(leafId)!);
        }

        // A robust, low-tax polling mechanism (every 1 second) is significantly 
        // more reliable than MutationObserver for React-rendered components 
        // because React frequently unmounts and remounts elements.
        const intervalId = setInterval(() => {
            const view: any = leaf.view;
            if (!view || !view.containerEl) {
                clearInterval(intervalId);
                this.intervals.delete(leafId);
                return;
            }

            const container = view.containerEl as HTMLElement;
            const controls = container.querySelector('.graph-controls');
            if (controls) {
                this.enhanceGraphUI(leaf, controls as HTMLElement);
            }
        }, 1000);

        this.intervals.set(leafId, intervalId);
    }

    enhanceGraphUI(leaf: WorkspaceLeaf, controls: HTMLElement) {
        // A. Search Input Enhancement
        const searchInput = controls.querySelector('.search-input-container input') as HTMLInputElement;
        if (searchInput && !searchInput.dataset.enhanced) {
            searchInput.dataset.enhanced = 'true';
            
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.width = '100%';

            const textarea = document.createElement('textarea');
            textarea.style.resize = 'none';
            textarea.style.minHeight = '30px';
            textarea.style.height = '30px';
            textarea.style.overflow = 'hidden';
            textarea.style.width = '100%';
            textarea.placeholder = searchInput.placeholder;
            textarea.value = searchInput.value;

            textarea.addEventListener('input', () => {
                textarea.style.height = '30px';
                textarea.style.height = textarea.scrollHeight + 'px';
            });

            const okBtn = document.createElement('button');
            okBtn.innerText = 'OK';
            okBtn.style.marginTop = '4px';
            okBtn.style.alignSelf = 'flex-end';

            okBtn.addEventListener('click', () => {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                if (nativeInputValueSetter) {
                    nativeInputValueSetter.call(searchInput, textarea.value);
                } else {
                    searchInput.value = textarea.value;
                }
                
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            wrapper.appendChild(textarea);
            wrapper.appendChild(okBtn);

            searchInput.style.display = 'none';
            const parentContainer = searchInput.parentElement;
            if (parentContainer) {
                parentContainer.style.height = 'auto';
                parentContainer.style.minHeight = '30px';
                parentContainer.style.overflow = 'visible';
                parentContainer.appendChild(wrapper);
            }
        }

        // B. Depth Slider to 10
        const labels = controls.querySelectorAll('.tree-item-self');
        for (let i = 0; i < labels.length; i++) {
            const label = labels[i] as HTMLElement;
            if (label.innerText.toLowerCase().includes('depth') || label.innerText.toLowerCase().includes('jumps')) {
                const parent = label.parentElement;
                if (parent) {
                    const originalRange = parent.querySelector('input[type="range"]') as HTMLInputElement;
                    // Fully replace the React slider to break its 5-max limit
                    if (originalRange && !originalRange.dataset.enhanced) {
                        originalRange.dataset.enhanced = 'true';
                        originalRange.style.display = 'none'; // Hide native React slider

                        const customRange = document.createElement('input');
                        customRange.type = 'range';
                        customRange.min = '1';
                        customRange.max = '10';
                        customRange.step = '1';
                        customRange.className = originalRange.className;
                        
                        // Sync initial value from engine
                        const engine = (leaf.view as any).engine;
                        customRange.value = engine?.options?.localJumps?.toString() || '1';

                        const textDisplay = parent.querySelector('.slider-readout');
                        if (textDisplay) textDisplay.textContent = customRange.value;

                        customRange.addEventListener('input', (e) => {
                            const val = (e.target as HTMLInputElement).value;
                            if (textDisplay) textDisplay.textContent = val;
                            
                            // Immediately apply jumps to engine to bypass ViewState strict clamp
                            if (engine && engine.options) {
                                engine.options.localJumps = parseInt(val, 10);
                                if (typeof engine.update === 'function') engine.update();
                                else if (typeof engine.render === 'function') engine.render();
                            }
                        });

                        originalRange.parentElement?.appendChild(customRange);
                    }
                }
            }
        }

        // C. Move Visible Nodes Button
        if (!controls.querySelector('.move-visible-btn')) {
            const moveBtn = document.createElement('button');
            moveBtn.innerText = 'Move Visible Files';
            moveBtn.className = 'move-visible-btn mod-cta';
            moveBtn.style.marginTop = '10px';
            moveBtn.style.width = '100%';

            moveBtn.addEventListener('click', () => {
                const filesToMove = this.getVisibleFiles(leaf.view);
                if (filesToMove.length === 0) {
                    alert('No visible files found in the graph.');
                    return;
                }
                new MoveVisibleModal(this.app, filesToMove).open();
            });

            controls.appendChild(moveBtn);
        }
    }

    getVisibleFiles(view: any): TFile[] {
        const files: TFile[] = [];
        let nodes = [];

        if (view.renderer && view.renderer.nodes) {
            nodes = view.renderer.nodes;
        } else if (view.engine && view.engine.nodes) {
            nodes = Object.values(view.engine.nodes);
        }

        for (const node of nodes) {
            if (node.id) {
                const file = this.app.vault.getAbstractFileByPath(node.id);
                if (file instanceof TFile) {
                    files.push(file);
                }
            }
        }
        return files;
    }


}
