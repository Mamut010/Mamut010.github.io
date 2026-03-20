class BaseEdgeProvider<TReward> implements IEdgeProvider<TReward> {
    public getEdges(node: IRewardTreeNode<TReward>): readonly IRewardTreeEdge<TReward>[] {
        return node.outgoingEdges;
    }
}