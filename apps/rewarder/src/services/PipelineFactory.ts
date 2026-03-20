type PipelineBuildingParams = {
    nodes:                     readonly RewardNodeConfig[],
    pityEnabled:               boolean,
    pityThreshold:             number,
    pityTargetConfig:          RewardNodeConfig | null,
    stdPityEnabled:            boolean,
    stdPityThreshold:          number,
    stdPityNodes:              readonly RewardNodeConfig[],
    featuredPityEnabled:       boolean,
    featuredPityThreshold:     number,
    featuredPityGroupConfig:   RewardNodeConfig | null,
    featuredPityFeaturedConfig: RewardNodeConfig | null,
};

type PipelineBuildingResult = {
    pipeline:                RewardPipeline<Reward>;
    pityInterceptor:         HardPityInterceptor     | null;
    stdPityInterceptor:      StandardPityInterceptor  | null;
    featuredPityInterceptor: FeaturedPityInterceptor  | null;
};

function buildPipeline(params: PipelineBuildingParams): PipelineBuildingResult {
    const {
        nodes,
        pityEnabled,
        pityThreshold,
        pityTargetConfig,
        stdPityEnabled,
        stdPityThreshold,
        stdPityNodes,
        featuredPityEnabled,
        featuredPityThreshold,
        featuredPityGroupConfig,
        featuredPityFeaturedConfig,
    } = params;

    const treeFactory = new RewardTreeFactory(nodes);
    const walker      = new WeightedUntilLeafTreeWalker<Reward>(new BaseEdgeProvider<Reward>());
    const collector   = new SubtreeRewardCollector<Reward>();
    const resolver    = new RewardResolver<Reward>(walker, collector);
    const pipeline    = new RewardPipeline(treeFactory, resolver);

    let pityInterceptor:         HardPityInterceptor     | null = null;
    let stdPityInterceptor:      StandardPityInterceptor  | null = null;
    let featuredPityInterceptor: FeaturedPityInterceptor  | null = null;

    if (featuredPityEnabled && featuredPityGroupConfig !== null && featuredPityFeaturedConfig !== null) {
        featuredPityInterceptor = new FeaturedPityInterceptor(
            featuredPityThreshold,
            featuredPityGroupConfig,
            featuredPityFeaturedConfig,
        );
    }

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

    // Featured first (patches group children), then Standard (may override the whole tree),
    // then Hard (forces a specific node within whatever tree is active).
    const interceptors: IRewardInterceptor<Reward>[] = [];
    if (featuredPityInterceptor) interceptors.push(featuredPityInterceptor);
    if (stdPityInterceptor)      interceptors.push(stdPityInterceptor);
    if (pityInterceptor)         interceptors.push(pityInterceptor);
    pipeline.setInterceptors(interceptors);

    return { pipeline, pityInterceptor, stdPityInterceptor, featuredPityInterceptor };
}
