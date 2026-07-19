import { App, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import { EnhancedGraphSettings } from './settings';
import EnhancedGraphPlugin from './main';
import { MoveVisibleModal, ExcludeSuggestModal } from './ui';

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
        // A. Expandable Search Bar + Exclusion Trick
        const searchInputContainer = controls.querySelector('.search-input-container');
        if (searchInputContainer) {
            const nativeSearchInput = searchInputContainer.querySelector('input') as HTMLInputElement;
            if (nativeSearchInput && !nativeSearchInput.dataset.enhancedSearch) {
                nativeSearchInput.dataset.enhancedSearch = 'true';
                nativeSearchInput.style.display = 'none';

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
                textarea.placeholder = nativeSearchInput.placeholder;
                
                // We shouldn't initially set the textarea to the full hidden string
                const parts = (nativeSearchInput.value || '').split(' -file:');
                textarea.value = parts[0] ? parts[0].trim() : '';

                textarea.addEventListener('input', () => {
                    textarea.style.height = '30px';
                    textarea.style.height = textarea.scrollHeight + 'px';
                });

                const triggerSync = () => {
                    let hiddenQuery = textarea.value;
                    for (const f of this.settings.globalExcludeList) {
                        hiddenQuery += ` -file:"${f}"`;
                    }
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                    if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(nativeSearchInput, hiddenQuery);
                    } else {
                        nativeSearchInput.value = hiddenQuery;
                    }
                    nativeSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    nativeSearchInput.dispatchEvent(new Event('change', { bubbles: true }));
                };

                // Trigger on init
                triggerSync();

                // Save a reference so we can trigger it when exclude list changes
                (leaf as any).triggerSearchSync = triggerSync;

                const okBtn = document.createElement('button');
                okBtn.innerText = 'OK';
                okBtn.style.marginTop = '4px';
                okBtn.style.alignSelf = 'flex-end';
                okBtn.addEventListener('click', triggerSync);

                wrapper.appendChild(textarea);
                wrapper.appendChild(okBtn);

                const parentContainer = nativeSearchInput.parentElement;
                if (parentContainer) {
                    parentContainer.style.height = 'auto';
                    parentContainer.style.minHeight = '30px';
                    parentContainer.style.overflow = 'visible';
                    parentContainer.appendChild(wrapper);
                }
            }
        }

        // B. Exclude Files UI (Corrected Placement)
        if (!controls.querySelector('.exclude-panel-enhanced')) {
            const excludePanel = document.createElement('div');
            excludePanel.className = 'exclude-panel-enhanced setting-item';
            excludePanel.style.marginTop = '10px';
            excludePanel.style.display = 'block'; // override flex
            excludePanel.style.borderTop = '1px solid var(--background-modifier-border)';
            excludePanel.style.paddingTop = '10px';

            const addBtn = document.createElement('button');
            addBtn.innerText = 'Exclude File...';
            addBtn.className = 'mod-cta';
            addBtn.style.width = '100%';
            addBtn.style.marginBottom = '10px';
            
            excludePanel.appendChild(addBtn);

            const listContainer = document.createElement('div');
            listContainer.style.display = 'flex';
            listContainer.style.flexDirection = 'column';
            listContainer.style.gap = '2px';
            excludePanel.appendChild(listContainer);

            const renderList = () => {
                listContainer.empty();
                for (const file of this.settings.globalExcludeList) {
                    const item = document.createElement('div');
                    item.className = 'setting-item';
                    item.style.padding = '5px 0';
                    item.style.border = 'none';

                    const nameInfo = document.createElement('div');
                    nameInfo.className = 'setting-item-info';
                    const name = document.createElement('div');
                    name.className = 'setting-item-name';
                    name.innerText = file;
                    name.style.fontSize = 'var(--font-ui-smaller)';
                    nameInfo.appendChild(name);

                    const control = document.createElement('div');
                    control.className = 'setting-item-control';

                    const delBtn = document.createElement('button');
                    delBtn.innerText = 'X';
                    delBtn.style.padding = '0 8px';
                    delBtn.addEventListener('click', async () => {
                        this.settings.globalExcludeList = this.settings.globalExcludeList.filter(f => f !== file);
                        await this.plugin.saveSettings();
                        renderList();
                        if ((leaf as any).triggerSearchSync) (leaf as any).triggerSearchSync();
                        this.triggerGraphUpdate(leaf);
                    });

                    control.appendChild(delBtn);
                    item.appendChild(nameInfo);
                    item.appendChild(control);
                    listContainer.appendChild(item);
                }
            };

            addBtn.addEventListener('click', () => {
                const visibleFiles = this.getVisibleFiles(leaf.view);
                new ExcludeSuggestModal(this.app, visibleFiles, async (file: TFile) => {
                    const val = file.path;
                    if (!this.settings.globalExcludeList.includes(val)) {
                        this.settings.globalExcludeList.push(val);
                        await this.plugin.saveSettings();
                        renderList();
                        if ((leaf as any).triggerSearchSync) (leaf as any).triggerSearchSync();
                        this.triggerGraphUpdate(leaf);
                    }
                }).open();
            });

            renderList();
            
            // Append to controls
            controls.appendChild(excludePanel);
        }

        // C. Deep Graph Explorer Widget
        if (!controls.querySelector('.deep-graph-explorer')) {
            const explorerPanel = document.createElement('div');
            explorerPanel.className = 'deep-graph-explorer setting-item';
            explorerPanel.style.marginTop = '10px';
            explorerPanel.style.display = 'block';
            explorerPanel.style.borderTop = '1px solid var(--background-modifier-border)';
            explorerPanel.style.paddingTop = '10px';

            const title = document.createElement('div');
            title.innerText = 'Deep Explorer (Hops 6+)';
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '5px';
            explorerPanel.appendChild(title);

            const inputRow = document.createElement('div');
            inputRow.style.display = 'flex';
            inputRow.style.gap = '5px';
            inputRow.style.marginBottom = '10px';

            const depthInput = document.createElement('input');
            depthInput.type = 'number';
            depthInput.min = '1';
            depthInput.max = '20';
            depthInput.value = '6';
            depthInput.style.flex = '1';

            const runBtn = document.createElement('button');
            runBtn.innerText = 'Find Files';
            runBtn.className = 'mod-cta';

            inputRow.appendChild(depthInput);
            inputRow.appendChild(runBtn);
            explorerPanel.appendChild(inputRow);

            const resultContainer = document.createElement('div');
            resultContainer.style.maxHeight = '150px';
            resultContainer.style.overflowY = 'auto';
            resultContainer.style.fontSize = 'var(--font-ui-smaller)';
            explorerPanel.appendChild(resultContainer);

            runBtn.addEventListener('click', () => {
                resultContainer.empty();
                resultContainer.innerText = 'Calculating...';
                
                setTimeout(() => {
                    const depth = parseInt(depthInput.value) || 6;
                    
                    const rootFile = (leaf.view as any).file;
                    if (!rootFile) {
                        resultContainer.innerText = 'Error: No root file found.';
                        return;
                    }

                    const resolvedLinks = this.app.metadataCache.resolvedLinks;
                    const excludedSet = new Set(this.settings.globalExcludeList);
                    
                    const queue: {path: string, dist: number}[] = [{path: rootFile.path, dist: 0}];
                    const visited = new Set<string>();
                    visited.add(rootFile.path);

                    const reverseLinks: Record<string, string[]> = {};
                    const backOn = (leaf.view as any).engine?.options?.localBacklinks !== false;
                    
                    if (backOn) {
                        for (const source in resolvedLinks) {
                            if (excludedSet.has(source)) continue;
                            for (const target in resolvedLinks[source]) {
                                if (!reverseLinks[target]) reverseLinks[target] = [];
                                reverseLinks[target].push(source);
                            }
                        }
                    }

                    const resultsByDepth: Record<number, string[]> = {};

                    while (queue.length > 0) {
                        const {path, dist} = queue.shift()!;
                        
                        if (!resultsByDepth[dist]) resultsByDepth[dist] = [];
                        resultsByDepth[dist].push(path);

                        if (dist >= depth) continue;

                        const neighbors = new Set<string>();
                        
                        const forward = resolvedLinks[path];
                        if (forward) {
                            for (const target in forward) {
                                neighbors.add(target);
                            }
                        }

                        if (backOn && reverseLinks[path]) {
                            for (const source of reverseLinks[path]) {
                                neighbors.add(source);
                            }
                        }

                        for (const n of neighbors) {
                            if (!visited.has(n) && !excludedSet.has(n)) {
                                visited.add(n);
                                queue.push({path: n, dist: dist + 1});
                            }
                        }
                    }

                    resultContainer.empty();
                    const targetResults = resultsByDepth[depth] || [];
                    
                    if (targetResults.length === 0) {
                        resultContainer.innerText = `No files found at exact depth ${depth}.`;
                        return;
                    }

                    resultContainer.innerText = `Found ${targetResults.length} files at depth ${depth}:\n`;
                    for (const res of targetResults) {
                        const row = document.createElement('div');
                        row.innerText = res;
                        row.style.whiteSpace = 'nowrap';
                        row.style.overflow = 'hidden';
                        row.style.textOverflow = 'ellipsis';
                        resultContainer.appendChild(row);
                    }
                }, 10);
            });

            controls.appendChild(explorerPanel);
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
