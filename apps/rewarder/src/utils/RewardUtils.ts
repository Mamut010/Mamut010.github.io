class RewardUtils {
    private constructor() {}

    public static containsResultRecursive(nodes: readonly RewardNodeConfig[], result: RewardResult<Reward>): boolean {
        const leafIds = new Set(collectLeaves(nodes).map(l => l.id));
        return result.rewards.some(r => leafIds.has(r.id));
    }
}