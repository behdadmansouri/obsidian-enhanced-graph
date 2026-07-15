import { App, TFile } from 'obsidian';

export interface PageRankScores {
    [path: string]: number;
}

/**
 * Computes an undirected PageRank on the vault's file link structure.
 */
export function computeGlobalPageRank(app: App, iterations = 20, damping = 0.85): PageRankScores {
    const resolvedLinks = app.metadataCache.resolvedLinks;
    const nodes = new Set<string>();
    
    // Graph representation: node path -> array of neighbor paths
    const graph: Record<string, string[]> = {};

    // Build undirected graph
    for (const source in resolvedLinks) {
        nodes.add(source);
        if (!graph[source]) graph[source] = [];
        
        for (const target in resolvedLinks[source]) {
            nodes.add(target);
            if (!graph[target]) graph[target] = [];
            
            // Add undirected links
            if (!graph[source].includes(target)) graph[source].push(target);
            if (!graph[target].includes(source)) graph[target].push(source);
        }
    }

    const nodeArray = Array.from(nodes);
    const N = nodeArray.length;
    if (N === 0) return {};

    let pr: PageRankScores = {};
    const initialScore = 1 / N;
    
    for (const node of nodeArray) {
        pr[node] = initialScore;
    }

    // Iterations
    for (let i = 0; i < iterations; i++) {
        const nextPr: PageRankScores = {};
        for (const node of nodeArray) {
            let sum = 0;
            const neighbors = graph[node];
            if (neighbors && neighbors.length > 0) {
                for (const neighbor of neighbors) {
                    sum += pr[neighbor] / graph[neighbor].length;
                }
            } else {
                // If it's isolated, its PageRank just decays to the base
                sum = 0; 
            }
            nextPr[node] = (1 - damping) / N + damping * sum;
        }
        pr = nextPr;
    }

    return pr;
}

/**
 * Computes undirected PageRank only on a specific subset of nodes (local graph).
 */
export function computeLocalPageRank(nodesSubset: string[], app: App, iterations = 20, damping = 0.85): PageRankScores {
    const resolvedLinks = app.metadataCache.resolvedLinks;
    const nodes = new Set(nodesSubset);
    
    const graph: Record<string, string[]> = {};
    for (const node of nodes) {
        graph[node] = [];
    }

    for (const source of nodes) {
        const targets = resolvedLinks[source] || {};
        for (const target in targets) {
            if (nodes.has(target)) {
                if (!graph[source].includes(target)) graph[source].push(target);
                if (!graph[target].includes(source)) graph[target].push(source);
            }
        }
    }

    const N = nodes.size;
    if (N === 0) return {};

    let pr: PageRankScores = {};
    const initialScore = 1 / N;
    for (const node of nodes) {
        pr[node] = initialScore;
    }

    for (let i = 0; i < iterations; i++) {
        const nextPr: PageRankScores = {};
        for (const node of nodes) {
            let sum = 0;
            const neighbors = graph[node];
            if (neighbors && neighbors.length > 0) {
                for (const neighbor of neighbors) {
                    sum += pr[neighbor] / graph[neighbor].length;
                }
            }
            nextPr[node] = (1 - damping) / N + damping * sum;
        }
        pr = nextPr;
    }

    return pr;
}
