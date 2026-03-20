interface IRewardTreeFactory<TReward> {
    create(executionContext: RewardExecutionContext): Promise<IRewardTree<TReward>>;
}