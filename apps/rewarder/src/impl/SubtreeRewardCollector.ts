class SubtreeRewardCollector<TReward> implements IRewardCollector<TReward> {
    public collect(
        node: IRewardTreeNode<TReward>,
        path: IRewardTreeEdge<TReward>[],
        executionContext: RewardExecutionContext
        ): RewardResult<TReward> {
        const accum: TReward[] = [];
        let currentNodes = [node];
        while (currentNodes.length > 0) {
            const rewards = currentNodes
                .map(n => n.reward)
                .filter(r => r !== undefined) as TReward[];
            accum.push(...rewards);
            currentNodes = currentNodes.flatMap(n => n.children);
        }
        return {
            rewards: accum,
            path,
        };
    }
}