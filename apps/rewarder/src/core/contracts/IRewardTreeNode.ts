interface IRewardTreeNode<TReward> {
    get reward(): TReward | undefined;
    get metadata(): Record<string, unknown> | undefined;
    get outgoingEdges(): readonly IRewardTreeEdge<TReward>[];
    get children(): readonly IRewardTreeNode<TReward>[];

    connect(node: IRewardTreeNode<TReward>, weight: number): IRewardTreeEdge<TReward> | undefined;
    disconnect(node: IRewardTreeNode<TReward>): boolean;
    disconnectAll(): void;
    getConnection(node: IRewardTreeNode<TReward>): IRewardTreeEdge<TReward> | undefined;
}