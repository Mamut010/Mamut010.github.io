function buildPipeline(
    nodes:            readonly RewardNodeConfig[],
    pityEnabled:      boolean,
    pityThreshold:    number,
    pityTargetConfig: RewardNodeConfig | null,
    stdPityEnabled:   boolean,
    stdPityThreshold: number,
    stdPityNodes:     readonly RewardNodeConfig[],
): {
    pipeline:           RewardPipeline<Reward>;
    pityInterceptor:    HardPityInterceptor    | null;
    stdPityInterceptor: StandardPityInterceptor | null;
} {
    const treeFactory = new RewardTreeFactory(nodes);
    const walker      = new WeightedUntilLeafTreeWalker<Reward>(new BaseEdgeProvider<Reward>());
    const collector   = new SubtreeRewardCollector<Reward>();
    const resolver    = new RewardResolver<Reward>(walker, collector);
    const pipeline    = new RewardPipeline(treeFactory, resolver);

    let pityInterceptor:    HardPityInterceptor    | null = null;
    let stdPityInterceptor: StandardPityInterceptor | null = null;

    if (stdPityEnabled && stdPityNodes.length > 0) {
        const stdTotal = stdPityNodes.reduce((s, n) => s + n.rate, 0);
        if (Math.abs(stdTotal - 100) < 0.001) {
            stdPityInterceptor = new StandardPityInterceptor(stdPityThreshold, stdPityNodes);
        }
    }

    if (pityEnabled) {
        const targetConfig = pityTargetConfig ?? findDefaultPityTarget(nodes);
        if (targetConfig) {
            pityInterceptor = new HardPityInterceptor(pityThreshold, targetConfig);
        }
    }

    // Standard pity first: overrides the tree so downstream interceptors see the pity pool.
    const interceptors: IRewardInterceptor<Reward>[] = [];
    if (stdPityInterceptor) interceptors.push(stdPityInterceptor);
    if (pityInterceptor)    interceptors.push(pityInterceptor);
    pipeline.setInterceptors(interceptors);

    return { pipeline, pityInterceptor, stdPityInterceptor };
}
