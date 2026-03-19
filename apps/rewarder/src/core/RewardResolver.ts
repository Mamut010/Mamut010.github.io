class RewardResolver<TReward> implements IRewardResolver<TReward> {
    public constructor(
        public readonly walker: IRewardTreeWalker<TReward>,
        public readonly collector: IRewardCollector<TReward>,
    ) {}

    public async resolve(tree: IRewardTree<TReward>, executionContext: RewardExecutionContext): Promise<RewardResult<TReward>> {
        let currentNode = tree.root;
        let nextEdge = await this.walker.next(currentNode, executionContext);
        const path: IRewardTreeEdge<TReward>[] = [];
        while (nextEdge) {
            path.push(nextEdge);
            currentNode = nextEdge.target;
            nextEdge = await this.walker.next(currentNode, executionContext);
        }

        const result = this.collector.collect(currentNode, path, executionContext);
        return result;
    }
}