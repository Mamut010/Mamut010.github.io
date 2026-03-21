class WeightedUntilLeafTreeWalkPlanner<TReward> implements IRewardTreeWalkPlanner<TReward> {
    public async plan(
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
        let nextEdges = this._tree.root.childEdges;
        while (nextEdges.length > 0) {
            const selectedEdge = this.selectEdge(nextEdges);
            
            yield selectedEdge;

            nextEdges = selectedEdge.target.childEdges;
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