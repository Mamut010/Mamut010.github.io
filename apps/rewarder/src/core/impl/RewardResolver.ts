class RewardResolver<TReward> implements IRewardResolver<TReward> {
    public constructor(
        public readonly walkPlanner: IRewardTreeWalkPlanner<TReward>,
        public readonly collector: IRewardCollector<TReward>,
    ) {}

    public async resolve(tree: IRewardTree<TReward>, executionContext: RewardExecutionContext): Promise<RewardResult<TReward>> {
        const walker = await this.walkPlanner.plan(tree, executionContext);
        if (!walker) {
            return {
                rewards: [],
                path: [],
            }
        }

        let currentNode = walker.startNode;
        const path: IRewardTreeEdge<TReward>[] = [];
        for (const edge of walker.walk()) {
            path.push(edge);
            currentNode = edge.target;
        }

        const result = this.collector.collect(currentNode, walker.tree, path, executionContext);
        return result;
    }
}