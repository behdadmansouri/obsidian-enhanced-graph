import { App, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import { EnhancedGraphSettings } from './settings';
import EnhancedGraphPlugin from './main';
import { MoveVisibleModal } from './ui';

export class GraphPatcher {
    app: App;
    settings: EnhancedGraphSettings;
    

    plugin: EnhancedGraphPlugin;

    patchedLeaves: Set<string> = new Set();
    observers: Map<string, MutationObserver> = new Map();

    constructor(plugin: EnhancedGraphPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.settings = plugin.settings;
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
        s.options.showUnresolved = false; // "Existing files only" ON (alternative internal name)
        
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
        this.patchRendererUpdateNodes(leaf, view);
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
        // A. Exclude Files UI (replaces custom search bar text area)
        const searchInputContainer = controls.querySelector('.search-input-container');
        if (searchInputContainer && !searchInputContainer.parentElement?.querySelector('.exclude-panel-enhanced')) {
            const excludePanel = document.createElement('div');
            excludePanel.className = 'exclude-panel-enhanced';
            excludePanel.style.marginTop = '10px';
            excludePanel.style.padding = '10px';
            excludePanel.style.border = '1px solid var(--background-modifier-border)';
            excludePanel.style.borderRadius = '4px';

            const title = document.createElement('div');
            title.innerText = 'Excluded Files';
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '5px';
            excludePanel.appendChild(title);

            const inputRow = document.createElement('div');
            inputRow.style.display = 'flex';
            inputRow.style.gap = '5px';
            inputRow.style.marginBottom = '10px';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Exact file name...';
            input.style.flex = '1';

            const addBtn = document.createElement('button');
            addBtn.innerText = 'Add';
            addBtn.className = 'mod-cta';

            inputRow.appendChild(input);
            inputRow.appendChild(addBtn);
            excludePanel.appendChild(inputRow);

            const listContainer = document.createElement('div');
            listContainer.style.display = 'flex';
            listContainer.style.flexDirection = 'column';
            listContainer.style.gap = '2px';
            excludePanel.appendChild(listContainer);

            const renderList = () => {
                listContainer.empty();
                for (const file of this.settings.globalExcludeList) {
                    const item = document.createElement('div');
                    item.style.display = 'flex';
                    item.style.justifyContent = 'space-between';
                    item.style.alignItems = 'center';
                    item.style.fontSize = '12px';

                    const name = document.createElement('span');
                    name.innerText = file;
                    name.style.overflow = 'hidden';
                    name.style.textOverflow = 'ellipsis';
                    name.style.whiteSpace = 'nowrap';

                    const delBtn = document.createElement('button');
                    delBtn.innerText = 'X';
                    delBtn.style.padding = '0 4px';
                    delBtn.style.height = '20px';
                    delBtn.addEventListener('click', async () => {
                        this.settings.globalExcludeList = this.settings.globalExcludeList.filter(f => f !== file);
                        await this.plugin.saveSettings();
                        renderList();
                        this.triggerGraphUpdate(leaf);
                    });

                    item.appendChild(name);
                    item.appendChild(delBtn);
                    listContainer.appendChild(item);
                }
            };

            addBtn.addEventListener('click', async () => {
                const val = input.value.trim();
                if (val && !this.settings.globalExcludeList.includes(val)) {
                    this.settings.globalExcludeList.push(val);
                    await this.plugin.saveSettings();
                    input.value = '';
                    renderList();
                    this.triggerGraphUpdate(leaf);
                }
            });

            renderList();
            searchInputContainer.parentElement?.insertBefore(excludePanel, searchInputContainer.nextSibling);

            // Hook Alt+Click on Canvas
            this.hookAltClick(leaf, renderList);
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
            if (node.id && !this.settings.globalExcludeList.includes(node.id)) {
                const file = this.app.vault.getAbstractFileByPath(node.id);
                if (file instanceof TFile) {
                    files.push(file);
                }
            }
        }
        return files;
    }

    triggerGraphUpdate(leaf: WorkspaceLeaf) {
        const view: any = leaf.view;
        if (view && view.engine) {
            if (typeof view.engine.update === 'function') view.engine.update();
            else if (typeof view.engine.render === 'function') view.engine.render();
        }
    }

    hookAltClick(leaf: WorkspaceLeaf, renderList: () => void) {
        const view: any = leaf.view;
        if (!view.containerEl) return;
        
        const canvas = view.containerEl.querySelector('canvas');
        if (!canvas || canvas.dataset.altClickHooked) return;
        canvas.dataset.altClickHooked = 'true';

        canvas.addEventListener('click', async (e: MouseEvent) => {
            if (e.altKey) {
                // Find hovered node
                const renderer = view.renderer;
                if (!renderer) return;
                
                // Usually PIXI stores the hovered node in hoverNode or interactiveNode
                const node = renderer.hoverNode || renderer.hoveredNode || renderer.nodeUnderMouse || renderer.highlightedNode;
                if (node && node.id) {
                    e.preventDefault();
                    e.stopPropagation();
                    const val = node.id;
                    if (!this.settings.globalExcludeList.includes(val)) {
                        this.settings.globalExcludeList.push(val);
                        await this.plugin.saveSettings();
                        renderList();
                        this.triggerGraphUpdate(leaf);
                    }
                }
            }
        }, true); // use capture phase
    }

    patchRendererUpdateNodes(leaf: WorkspaceLeaf, view: any) {
        if (!view.renderer) return;
        const originalUpdateNodes = view.renderer.updateNodes || view.renderer.renderNodes;
        if (!originalUpdateNodes || view.renderer.isEnhancedPatched) return;
        view.renderer.isEnhancedPatched = true;

        const plugin = this.plugin;

        const patchedMethod = function (this: any, ...args: any[]) {
            const excludeSet = new Set(plugin.settings.globalExcludeList);
            
            if (excludeSet.size > 0 && this.nodes && this.links) {
                // Filter nodes
                this.nodes = this.nodes.filter((n: any) => !excludeSet.has(n.id));
                // Filter links
                this.links = this.links.filter((l: any) => {
                    const sourceId = l.source?.id || l.source;
                    const targetId = l.target?.id || l.target;
                    return !excludeSet.has(sourceId) && !excludeSet.has(targetId);
                });
            }
            
            return originalUpdateNodes.apply(this, args);
        };

        if (view.renderer.updateNodes) {
            view.renderer.updateNodes = patchedMethod;
        } else {
            view.renderer.renderNodes = patchedMethod;
        }
    }
}
