interface StandardPityEntry {
    nodeId: string;   // ID of a root-level node in the active pool
    rate:   number;   // override rate within the pity pool (all entries should sum to 100)
}

interface RewardNodeConfig {
    id: string;
    name: string;
    rate: number;           // weight relative to siblings (siblings should sum to 100)
    isGroup: boolean;       // true = intermediate group node; false = leaf reward
    color: string;          // leaf foreground / text color
    borderColor: string;    // leaf card border color
    children: RewardNodeConfig[];
}

interface PityNodeChoice {
    id: string;
    label: string;
    kind: "leaf" | "group";
}

function collectLeaves(nodes: readonly RewardNodeConfig[]): RewardNodeConfig[] {
    const result: RewardNodeConfig[] = [];
    for (const node of nodes) {
        if (node.isGroup) {
            result.push(...collectLeaves(node.children));
        } else {
            result.push(node);
        }
    }
    return result;
}

function collectPityChoices(
    nodes: readonly RewardNodeConfig[],
    indent = "",
): PityNodeChoice[] {
    const result: PityNodeChoice[] = [];
    for (const node of nodes) {
        if (node.isGroup) {
            result.push({ id: node.id, label: indent + "\u25b6 " + node.name, kind: "group" });
            result.push(...collectPityChoices(node.children, indent + "\u00a0\u00a0"));
        } else {
            result.push({ id: node.id, label: indent + node.name, kind: "leaf" });
        }
    }
    return result;
}

function findDefaultPityTarget(
    nodes: readonly RewardNodeConfig[],
    parentProb = 1,
): RewardNodeConfig | null {
    const total = nodes.reduce((s, n) => s + n.rate, 0);
    if (total === 0) return null;
    let best: { config: RewardNodeConfig; prob: number } | null = null;
    for (const node of nodes) {
        const prob = parentProb * (node.rate / total);
        const candidate = node.isGroup
            ? findDefaultPityTarget(node.children, prob)
            : node;
        const candidateProb = node.isGroup
            ? (node.children.length > 0 ? parentProb * (node.rate / total) * (node.children.reduce((s, n) => s + n.rate, 0) > 0 ? node.children.reduce((min, n) => n.rate < min ? n.rate : min, Infinity) / node.children.reduce((s, n) => s + n.rate, 0) : 0) : 0)
            : prob;
        if (candidate && (!best || prob < best.prob)) {
            best = { config: candidate, prob: candidateProb };
        }
    }
    return best?.config ?? null;
}

function defaultRewardNodes(): RewardNodeConfig[] {
    return [
        {
            id: "rare-group", name: "Rare Tier", rate: 20, isGroup: true,
            color: "", borderColor: "",
            children: [
                { id: "sr",   name: "Super Rare", rate: 10, isGroup: false, color: "#f0a830", borderColor: "#f0a830", children: [] },
                { id: "rare", name: "Rare",        rate: 90, isGroup: false, color: "#4f8ef7", borderColor: "#4f8ef7", children: [] },
            ],
        },
        { id: "common", name: "Common", rate: 80, isGroup: false, color: "#8b96a5", borderColor: "#444f5a", children: [] },
    ];
}
