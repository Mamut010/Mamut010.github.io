type RewardPipelineContext<TReward> = {
    readonly exec: RewardExecutionContext,
    tree: IRewardTree<TReward>,
};