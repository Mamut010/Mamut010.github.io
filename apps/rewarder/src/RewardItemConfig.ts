interface RewardNodeConfig {
    id: string;
    name: string;
    rate: number;           // weight relative to siblings (siblings should sum to 100)
    isGroup: boolean;       // true = intermediate group node; false = leaf reward
    color: string;          // leaf foreground / text color
    borderColor: string;    // leaf card border color
    children: RewardNodeConfig[];
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
        { id: "common", name: "Common Reward", rate: 80, isGroup: false, color: "#8b96a5", borderColor: "#444f5a", children: [] },
    ];
}
