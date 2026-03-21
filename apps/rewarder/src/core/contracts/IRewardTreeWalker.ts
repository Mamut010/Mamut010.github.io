interface IRewardTreeWalkPlanner<TReward> {
    plan(
        tree: IRewardTree<TReward>,
        executionContext: RewardExecutionContext
    ): Promise<IRewardTreeWalker<TReward> | undefined>;
}

interface IRewardTreeWalker<TReward> {
    get executionContext(): RewardExecutionContext;
    get tree(): IRewardTree<TReward>;
    get startNode(): IRewardTreeNode<TReward>;

    walk(): Iterable<IRewardTreeEdge<TReward>>;
}