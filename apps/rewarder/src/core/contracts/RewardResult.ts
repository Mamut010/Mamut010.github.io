type RewardResult<TReward> = {
    rewards: TReward[],
    path: readonly IRewardTreeEdge<TReward>[],
};