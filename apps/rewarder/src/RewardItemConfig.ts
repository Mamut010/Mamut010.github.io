interface RewardItemConfig {
    id: string;
    name: string;
    rate: number;         // percentage (0–100)
    color: string;        // text / foreground color
    borderColor: string;  // card border & accent color
}

function defaultRewardItems(): RewardItemConfig[] {
    return [
        { id: "sr",     name: "Super Rare Reward", rate: 1,  color: "#f0a830", borderColor: "#f0a830" },
        { id: "rare",   name: "Rare Reward",        rate: 15, color: "#4f8ef7", borderColor: "#4f8ef7" },
        { id: "common", name: "Common Reward",      rate: 84, color: "#8b96a5", borderColor: "#444f5a" },
    ];
}
