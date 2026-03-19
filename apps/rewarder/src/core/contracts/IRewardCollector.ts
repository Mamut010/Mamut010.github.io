interface IRewardCollector<TReward> {
    collect(
        node: IRewardTreeNode<TReward>,
        path: IRewardTreeEdge<TReward>[],
        executionContext: RewardExecutionContext): RewardResult<TReward>;
}