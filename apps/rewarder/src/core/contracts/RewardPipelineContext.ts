type RewardPipelineContext<TReward> = {
    readonly exec: RewardExecutionContext,
    readonly treeFactory: IRewardTreeFactory<TReward>,
    readonly resolver: IRewardResolver<TReward>,
    tree: IRewardTree<TReward>,
};