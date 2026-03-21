class RewardTreeNode<TReward> implements IRewardTreeNode<TReward> {
    private readonly _id: string;
    private readonly _reward?: TReward;
    private readonly _childEdges: Map<string, RewardTreeEdge<TReward>>;
    private _parentEdge?: IRewardTreeEdge<TReward>;
    private _metadata?: object;
    
    public constructor(id: string, reward?: TReward, metadata?: object) {
        this._id = id;
        this._reward = reward;
        this._childEdges = new Map();
        this._metadata = metadata ?? {};
    }

    public get id(): string {
        return this._id;
    }

    public get reward(): TReward | undefined {
        return this._reward;
    }

    public get childEdges(): readonly IRewardTreeEdge<TReward>[] {
        return [... this._childEdges.values()];
    }

    public get children(): readonly IRewardTreeNode<TReward>[] {
        return [... this._childEdges.values()].map(edge => edge.target);
    }

    public get parentEdge(): IRewardTreeEdge<TReward> | undefined {
        return this._parentEdge;
    }

    public get parent(): IRewardTreeNode<TReward> | undefined {
        return this._parentEdge?.source;
    }

    public metadata<TMeta extends object = Record<string, unknown>>(): TMeta {
        return this._metadata as TMeta;
    }

    public connectParent(node: IRewardTreeNode<TReward>, weight: number): IRewardTreeEdge<TReward> | undefined {
        const currentParent = this._parentEdge?.source;
        if (currentParent?.id === node.id) {
            return undefined;
        }

        currentParent?.disconnectChild(this);

        this._parentEdge = new RewardTreeEdge(node, this, weight);

        node.connectChild(this, weight);

        return this._parentEdge;
    }

    public connectChild(node: IRewardTreeNode<TReward>, weight: number): IRewardTreeEdge<TReward> | undefined {
        if (this._childEdges.has(node.id)) {
            return undefined;
        }

        const edge = new RewardTreeEdge(this, node, weight);
        this._childEdges.set(node.id, edge);

        node.connectParent(this, weight);

        return edge;
    }

    public disconnectParent(): boolean {
        const parent = this._parentEdge?.source;
        if (!parent) {
            return false;
        }

        this._parentEdge = undefined;
        parent.disconnectChild(this);

        return true;
    }

    public disconnectChild(node: IRewardTreeNode<TReward>): boolean {
        const edge = this._childEdges.get(node.id);
        if (!edge) {
            return false;
        }

        this._childEdges.delete(node.id);
        edge.target.disconnectParent();

        return true;
    }

    public disconnectChildren(): void {
        const children = this.children;

        this._childEdges.clear();

        for (const child of children) {
            child.disconnectParent();
        }
    }
}

class RewardTreeNodes {
    /**
     * Creates a new empty node with the given ID and optional metadata.
     * @param id The unique ID of the node
     * @param metadata The metadata object to attach to the node (optional)
     * @returns The created node instance
     */
    public static empty<
        TReward,
        TMeta extends object = Record<string, unknown>
        >(id: string, metadata?: TMeta): IRewardTreeNode<TReward> {
        return new RewardTreeNode<TReward>(id, undefined, metadata);
    }

    /**
     * Creates a new reward node with the given ID, reward, and optional metadata.
     * @param id The unique ID of the node
     * @param reward The reward value to attach to the node
     * @param metadata The metadata object to attach to the node (optional)
     * @returns The created node instance
     */
    public static reward<
        TReward,
        TMeta extends object = Record<string, unknown>
        >(id: string, reward: TReward, metadata?: TMeta): IRewardTreeNode<TReward> {
        return new RewardTreeNode<TReward>(id, reward, metadata);
    }
}