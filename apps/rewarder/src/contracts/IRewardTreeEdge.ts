interface IRewardTreeEdge<TReward> {
    get source(): IRewardTreeNode<TReward>;
    get target(): IRewardTreeNode<TReward>;
    get baseWeight(): number;

    weight: number;
}