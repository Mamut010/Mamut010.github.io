function buildPipeline(
    nodes: readonly RewardNodeConfig[],
    pityEnabled: boolean,
    pityThreshold: number,
): { pipeline: RewardPipeline<Reward>; pityInterceptor: HardPityInterceptor | null } {
    const treeFactory = new DynamicRewardTreeFactory(nodes);
    const walker      = new WeightedUntilLeafTreeWalker<Reward>(new BaseEdgeProvider<Reward>());
    const collector   = new SubtreeRewardCollector<Reward>();
    const resolver    = new RewardResolver<Reward>(walker, collector);
    const pipeline    = new RewardPipeline(treeFactory, resolver);

    let pityInterceptor: HardPityInterceptor | null = null;
    if (pityEnabled) {
        pityInterceptor = new HardPityInterceptor(pityThreshold);
        pipeline.setInterceptors([pityInterceptor]);
    }

    return { pipeline, pityInterceptor };
}
