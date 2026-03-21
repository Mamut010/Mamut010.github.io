interface IRewardTreeNode<TReward> {
    get id(): string;
    get reward(): TReward | undefined;
    get children(): readonly IRewardTreeNode<TReward>[];
    get childEdges(): readonly IRewardTreeEdge<TReward>[];
    get parent(): IRewardTreeNode<TReward> | undefined;
    get parentEdge(): IRewardTreeEdge<TReward> | undefined;

    /**
     * Returns the metadata associated with this node, if any.
     * Metadata is opaque to the core and can be used by external systems to store auxiliary information.
     */
    metadata<TMeta extends object = Record<string, unknown>>(): TMeta;

    connectParent(node: IRewardTreeNode<TReward>, weight: number): IRewardTreeEdge<TReward> | undefined;
    connectChild(node: IRewardTreeNode<TReward>, weight: number): IRewardTreeEdge<TReward> | undefined;
    disconnectParent(): boolean;
    disconnectChild(node: IRewardTreeNode<TReward>): boolean;
    disconnectChildren(): void;
}