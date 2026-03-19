interface IRewardInterceptor<TReward> {
    intercept(ctx: RewardPipelineContext<TReward>, next: RewardNextHandler<TReward>): Promise<RewardResult<TReward>>;
}