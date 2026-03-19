interface IEdgeProvider<TReward> {
    getEdges(node: IRewardTreeNode<TReward>): readonly IRewardTreeEdge<TReward>[];
}