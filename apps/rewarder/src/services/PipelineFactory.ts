type PipelineBuildingParams = {
    nodes:                 readonly RewardNodeConfig[],
    pityEnabled:           boolean,
    pityThreshold:         number,
    pityTargetConfig:      RewardNodeConfig | null,
    stdPityEnabled:        boolean,
    stdPityThreshold:      number,
    stdPityNodes:          readonly RewardNodeConfig[],
    featuredPityEnabled:   boolean,
    featuredConfigs:       readonly FeaturedPityConfig[],
};

type PipelineBuildingResult = {
    pipeline:                 RewardPipeline<Reward>;
    pityInterceptor:          HardPityInterceptor     | null;
    stdPityInterceptor:       StandardPityInterceptor  | null;
    featuredPityInterceptors: FeaturedPityInterceptor[];
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
        featuredConfigs,
    } = params;

    const treeFactory = new RewardTreeFactory(nodes);
    const walker      = new WeightedUntilLeafTreeWalker<Reward>(new BaseEdgeProvider<Reward>());
    const collector   = new SubtreeRewardCollector<Reward>();
    const resolver    = new RewardResolver<Reward>(walker, collector);
    const pipeline    = new RewardPipeline(treeFactory, resolver);

    let pityInterceptor:    HardPityInterceptor    | null = null;
    let stdPityInterceptor: StandardPityInterceptor | null = null;
    const featuredPityInterceptors: FeaturedPityInterceptor[] = [];

    if (featuredPityEnabled) {
        for (const cfg of featuredConfigs) {
            featuredPityInterceptors.push(
                new FeaturedPityInterceptor(cfg.entryId, cfg.threshold, cfg.group, cfg.featured),
            );
        }
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

    // Featured outermost (outgoing priority — final say over result),
    // then Standard (may override tree), then Hard (forces specific node).
    const interceptors: IRewardInterceptor<Reward>[] = [
        ...featuredPityInterceptors,
        ...(stdPityInterceptor ? [stdPityInterceptor] : []),
        ...(pityInterceptor    ? [pityInterceptor]    : []),
    ];
    pipeline.setInterceptors(interceptors);

    return { pipeline, pityInterceptor, stdPityInterceptor, featuredPityInterceptors };
}
