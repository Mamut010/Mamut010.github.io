interface IRewardResolver<TReward> {
    resolve(tree: IRewardTree<TReward>, executionContext: RewardExecutionContext): Promise<RewardResult<TReward>>;
}