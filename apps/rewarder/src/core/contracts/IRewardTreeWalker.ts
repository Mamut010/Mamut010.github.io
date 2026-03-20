interface IRewardTreeWalker<TReward> {
    next(
        currentNode: IRewardTreeNode<TReward>,
        executionContext: RewardExecutionContext
        ): Promise<IRewardTreeEdge<TReward> | undefined>;
}