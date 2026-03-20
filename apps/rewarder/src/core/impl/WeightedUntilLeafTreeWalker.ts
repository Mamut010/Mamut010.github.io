class WeightedUntilLeafTreeWalker<TReward> implements IRewardTreeWalker<TReward> {
    public constructor(
        public readonly edgeProvider: IEdgeProvider<TReward>
    ) {}
    
    public next(
        currentNode: IRewardTreeNode<TReward>,
        executionContext: RewardExecutionContext
        ): Promise<IRewardTreeEdge<TReward> | undefined> {
        const edges = this.edgeProvider.getEdges(currentNode);
        if (edges.length === 0) {
            return Promise.resolve(undefined);
        }
        const nextEdge = this.selectEdge(edges, executionContext.rng);
        return Promise.resolve(nextEdge);
    }

    private selectEdge(edges: readonly IRewardTreeEdge<TReward>[], rng: IRandomNumberGenerator): IRewardTreeEdge<TReward> {
        const weights = edges.map(e => e.weight);
        const selectedEdge = Collections.randomItemWeighted(edges, weights, () => rng.next());
        if (!selectedEdge) {
            throw new Error("No edge selected");
        }
        return selectedEdge;
    }
}