interface IRewardCollector<TReward> {
    collect(
        node: IRewardTreeNode<TReward>,
        tree: IRewardTree<TReward>,
        path: readonly IRewardTreeEdge<TReward>[],
        executionContext: RewardExecutionContext): RewardResult<TReward>;
}