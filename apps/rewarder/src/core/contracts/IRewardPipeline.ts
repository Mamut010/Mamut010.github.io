interface IRewardPipeline<TReward> {
    invoke(executionContext: RewardExecutionContext): Promise<RewardResult<TReward>>;
}