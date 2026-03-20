function buildPipeline(
    nodes: readonly RewardNodeConfig[],
    pityEnabled: boolean,
    pityThreshold: number,
    pityTargetConfig: RewardNodeConfig | null,
): { pipeline: RewardPipeline<Reward>; pityInterceptor: HardPityInterceptor | null } {
    const treeFactory = new RewardTreeFactory(nodes);
    const walker      = new WeightedUntilLeafTreeWalker<Reward>(new BaseEdgeProvider<Reward>());
    const collector   = new SubtreeRewardCollector<Reward>();
    const resolver    = new RewardResolver<Reward>(walker, collector);
    const pipeline    = new RewardPipeline(treeFactory, resolver);

    let pityInterceptor: HardPityInterceptor | null = null;
    if (pityEnabled) {
        const targetConfig = pityTargetConfig ?? findDefaultPityTarget(nodes);
        if (targetConfig) {
            pityInterceptor = new HardPityInterceptor(pityThreshold, targetConfig);
            pipeline.setInterceptors([pityInterceptor]);
        }
    }

    return { pipeline, pityInterceptor };
}
