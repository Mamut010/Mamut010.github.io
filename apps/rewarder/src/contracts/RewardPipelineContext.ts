type RewardPipelineContext<TReward> = {
    readonly exec: RewardExecutionContext,
    tree: IRewardTree<TReward>,
    resolver: IRewardResolver<TReward>,
};