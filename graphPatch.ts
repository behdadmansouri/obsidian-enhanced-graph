import { App, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import { EnhancedGraphSettings } from './settings';
import { computeGlobalPageRank, computeLocalPageRank, PageRankScores } from './pagerank';
import { MoveVisibleModal } from './ui';

export class GraphPatcher {
    app: App;
    settings: EnhancedGraphSettings;
    
    // Cache for PageRank so we don't calculate every frame
    cachedGlobalPageRank: PageRankScores | null = null;
    cachedLocalPageRanks: Map<string, PageRankScores> = new Map(); // leaf id -> pagerank

    // Track patched leaves to avoid double patching
    patchedLeaves: Set<string> = new Set();

    constructor(app: App, settings: EnhancedGraphSettings) {
        this.app = app;
        this.settings = settings;
    }

    // Predefined appealing colors for folders
    readonly folderColors = [
        '#FFB3BA', // pastel red
        '#FFDFBA', // pastel orange
        '#FFFFBA', // pastel yellow
        '#BAFFC9', // pastel green
        '#BAE1FF', // pastel blue
        '#D0BAFF', // pastel purple
        '#FFBAED', // pastel pink
        '#BaffF3', // pastel cyan
    ];

    onLayoutChange() {
        const leaves = this.app.workspace.getLeavesOfType('localgraph');
        for (const leaf of leaves) {
            // internal id
            const leafId = (leaf as any).id;
            if (!this.patchedLeaves.has(leafId)) {
                this.patchLocalGraphLeaf(leaf);
                this.patchedLeaves.add(leafId);
            }
        }
    }

    patchLocalGraphLeaf(leaf: WorkspaceLeaf) {
        const view: any = leaf.view;
        const container = view.containerEl as HTMLElement;

        // 1. Setup Defaults (only if newly opened, we can guess by checking if it has children yet)
        this.applyGraphDefaults(view);

        // 2. Auto-color Root Folders
        if (this.settings.autoColorRootFolders) {
            this.applyFolderColors(view);
        }

        // 3. UI Enhancements (Search OK button, slider to 10)
        setTimeout(() => {
            this.enhanceGraphUI(leaf, container);
        }, 500); // Wait for UI to build

        // 4. Monkey Patch Renderer for Node Sizing
        this.patchRendererNodeSizing(leaf, view);
    }

    applyGraphDefaults(view: any) {
        // Try to access internal options
        if (view.engine && view.engine.options) {
            const opts = view.engine.options;
            opts.localBacklinks = true;
            opts.showAttachments = false;
            opts.localJumps = Math.max(opts.localJumps || 1, 1);
            opts.repelForce = 1;
            opts.centerForce = 1;
            opts.linkForce = 1;
            opts.linkDistance = 0;
            // Not 100% sure of the internal name for text fade, could be textFadeMultiplier
            opts.textFadeMultiplier = -1; // min
            
            if (view.engine.render) view.engine.render();
        } else if (view.dataEngine && view.dataEngine.setOptions) {
            // Another variation of internal graph API
            view.dataEngine.setOptions({
                localBacklinks: true,
                showAttachments: false
            });
            if (view.renderer) {
                view.renderer.setForces({
                    repelForce: 1,
                    centerForce: 1,
                    linkForce: 1,
                    linkDistance: 0
                });
            }
        }
    }

    applyFolderColors(view: any) {
        const rootFolders = this.app.vault.getRoot().children.filter(c => c instanceof TFolder) as TFolder[];
        const colorGroups = [];
        
        for (let i = 0; i < rootFolders.length; i++) {
            const folder = rootFolders[i];
            const color = this.settings.customFolderColors[folder.path] || this.folderColors[i % this.folderColors.length];
            colorGroups.push({
                query: `path:"${folder.path}"`,
                color: {
                    a: 1,
                    rgb: this.hexToRgb(color)
                }
            });
        }

        if (view.engine && view.engine.options) {
            view.engine.options.colorGroups = colorGroups;
        } else if (view.renderer && view.renderer.colorGroups) {
            view.renderer.colorGroups = colorGroups;
        }
    }

    hexToRgb(hex: string): number {
        const h = hex.replace('#', '');
        return parseInt(h, 16);
    }

    enhanceGraphUI(leaf: WorkspaceLeaf, container: HTMLElement) {
        const controls = container.querySelector('.graph-controls');
        if (!controls) return;

        // A. Search Input Enhancement
        const searchInput = controls.querySelector('.search-input-container input') as HTMLInputElement;
        if (searchInput && !searchInput.dataset.enhanced) {
            searchInput.dataset.enhanced = 'true';
            
            // Create textarea wrapper
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

            // Auto-grow
            textarea.addEventListener('input', () => {
                textarea.style.height = '30px';
                textarea.style.height = textarea.scrollHeight + 'px';
            });

            const okBtn = document.createElement('button');
            okBtn.innerText = 'OK';
            okBtn.style.marginTop = '4px';
            okBtn.style.alignSelf = 'flex-end';

            okBtn.addEventListener('click', () => {
                searchInput.value = textarea.value;
                // Trigger native search
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            wrapper.appendChild(textarea);
            wrapper.appendChild(okBtn);

            // Hide original, insert ours
            searchInput.style.display = 'none';
            searchInput.parentElement?.appendChild(wrapper);
        }

        // B. Depth Slider to 10
        // Find slider for depth. It's usually the first range input in local graph controls or labeled "Depth"
        const labels = controls.querySelectorAll('.tree-item-self');
        for (let i = 0; i < labels.length; i++) {
            const label = labels[i] as HTMLElement;
            if (label.innerText.toLowerCase().includes('depth')) {
                const parent = label.parentElement;
                if (parent) {
                    const range = parent.querySelector('input[type="range"]') as HTMLInputElement;
                    if (range && range.max === '5') {
                        range.max = '10';
                        // Intercept change to update internal option directly if needed
                        range.addEventListener('change', (e) => {
                            const val = parseInt((e.target as HTMLInputElement).value);
                            const view: any = leaf.view;
                            if (view.engine && view.engine.options) {
                                view.engine.options.localJumps = val;
                                if(view.engine.update) view.engine.update();
                            }
                        });
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
                    new Notification('No visible files found in the graph.');
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

        // Attempt to extract nodes from internal renderer
        if (view.renderer && view.renderer.nodes) {
            nodes = view.renderer.nodes;
        } else if (view.engine && view.engine.nodes) {
            nodes = Object.values(view.engine.nodes);
        }

        for (const node of nodes) {
            // Node usually has id as the file path
            if (node.id) {
                const file = this.app.vault.getAbstractFileByPath(node.id);
                if (file instanceof TFile) {
                    files.push(file);
                }
            }
        }
        return files;
    }

    patchRendererNodeSizing(leaf: WorkspaceLeaf, view: any) {
        if (!view.renderer) return;

        // Hook into the render loop or update method
        const originalUpdateNodes = view.renderer.updateNodes || view.renderer.renderNodes;
        if (!originalUpdateNodes) return;

        const leafId = (leaf as any).id;
        const plugin = this;

        // Intercept updateNodes
        const patchedMethod = function (...args: any[]) {
            const result = originalUpdateNodes.apply(this, args);

            if (plugin.settings.enablePageRank) {
                const nodes = this.nodes || [];
                
                // Determine PageRank
                let prScores: PageRankScores = {};
                if (plugin.settings.globalPageRank) {
                    if (!plugin.cachedGlobalPageRank) {
                        plugin.cachedGlobalPageRank = computeGlobalPageRank(plugin.app);
                    }
                    prScores = plugin.cachedGlobalPageRank;
                } else {
                    if (!plugin.cachedLocalPageRanks.has(leafId)) {
                        const nodeIds = nodes.map((n: any) => n.id).filter(Boolean);
                        plugin.cachedLocalPageRanks.set(leafId, computeLocalPageRank(nodeIds, plugin.app));
                    }
                    prScores = plugin.cachedLocalPageRanks.get(leafId)!;
                }

                // Apply to nodes
                const maxPr = Math.max(...Object.values(prScores), 0.0001);
                for (const node of nodes) {
                    if (node.id && prScores[node.id]) {
                        // Normalize size, typical graph node size scale is around 1x to 4x
                        const normalized = (prScores[node.id] / maxPr);
                        // Force size (this depends on Obsidian's internal properties, could be .size, .radius, .scale)
                        const newScale = 1 + (normalized * 3); 
                        
                        node.weight = newScale; // Sometimes internal logic uses weight
                        if (node.info) node.info.scale = newScale; 
                        if (node.viewObject) node.viewObject.scale.set(newScale, newScale);
                    }
                }
            }

            return result;
        };

        if (view.renderer.updateNodes) {
            view.renderer.updateNodes = patchedMethod;
        } else {
            view.renderer.renderNodes = patchedMethod;
        }
    }

    clearCache() {
        this.cachedGlobalPageRank = null;
        this.cachedLocalPageRanks.clear();
    }
}
