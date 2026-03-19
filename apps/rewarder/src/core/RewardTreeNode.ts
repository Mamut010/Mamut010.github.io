class RewardTreeNode<TReward> implements IRewardTreeNode<TReward> {
    private readonly _reward?: TReward;
    private readonly _outgoingEdges: Map<IRewardTreeNode<TReward>, RewardTreeEdge<TReward>>;
    private readonly _metadata?: Record<string, unknown>;
    
    public constructor(reward?: TReward, metadata?: Record<string, unknown>) {
        this._reward = reward;
        this._outgoingEdges = new Map();
        this._metadata = metadata;
    }

    public get reward(): TReward | undefined {
        return this._reward;
    }

    public get metadata(): Record<string, unknown> | undefined {
        return this._metadata;
    }

    public get outgoingEdges(): readonly IRewardTreeEdge<TReward>[] {
        return [... this._outgoingEdges.values()];
    }

    public get children(): readonly IRewardTreeNode<TReward>[] {
        return [... this._outgoingEdges.keys()];
    }

    public connect(node: IRewardTreeNode<TReward>, weight: number): boolean {
        if (this._outgoingEdges.has(node)) {
            return false;
        }

        const edge = new RewardTreeEdge(this, node, weight, weight);
        this._outgoingEdges.set(node, edge);
        return true;
    }

    public disconnect(node: IRewardTreeNode<TReward>): boolean {
        return this._outgoingEdges.delete(node);
    }

    public getConnection(node: IRewardTreeNode<TReward>): IRewardTreeEdge<TReward> | undefined {
        return this._outgoingEdges.get(node);
    }
}