class WeightedUntilLeafTreeWalkPlanner<TReward> implements IRewardTreeWalkPlanner<TReward> {
    public async prepare(
        tree: IRewardTree<TReward>,
        executionContext: RewardExecutionContext
    ): Promise<IRewardTreeWalker<TReward> | undefined> {
        return new WeightedUntilLeafTreeWalker(tree, executionContext);
    }
}

class WeightedUntilLeafTreeWalker<TReward> implements IRewardTreeWalker<TReward> {
    private readonly _tree: IRewardTree<TReward>;
    private readonly _executionContext: RewardExecutionContext;

    public constructor(
        _tree: IRewardTree<TReward>,
        _executionContext: RewardExecutionContext,
    ) {
        this._tree = _tree;
        this._executionContext = _executionContext;
    }
    
    get tree(): IRewardTree<TReward> {
        return this._tree;
    }

    get executionContext(): RewardExecutionContext {
        return this._executionContext;
    }

    get startNode(): IRewardTreeNode<TReward> {
        return this._tree.root;
    }

    public *walk(): Iterable<IRewardTreeEdge<TReward>> {
        let nextEdges = this.startNode.childEdges;
        while (nextEdges.length > 0) {
            const nextEdge = this.selectEdge(nextEdges);
            
            yield nextEdge;

            nextEdges = nextEdge.target.childEdges;
        }
    }

    private selectEdge(edges: readonly IRewardTreeEdge<TReward>[]): IRewardTreeEdge<TReward> {
        const weights = edges.map(e => e.weight);
        const selectedEdge = Collections.randomItemWeighted(edges, weights, () => this.executionContext.rng.next());
        if (!selectedEdge) {
            throw new Error("No edge selected");
        }
        return selectedEdge;
    }
}