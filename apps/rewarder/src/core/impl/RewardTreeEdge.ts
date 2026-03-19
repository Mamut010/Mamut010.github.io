class RewardTreeEdge<TReward> implements IRewardTreeEdge<TReward> {
    public readonly source: IRewardTreeNode<TReward>;
    public readonly target: IRewardTreeNode<TReward>;
    public readonly baseWeight: number;
    public weight: number;

    public constructor(
        source: IRewardTreeNode<TReward>,
        target: IRewardTreeNode<TReward>,
        baseWeight: number,
        weight?: number
    ) {
        this.source = source;
        this.target = target;
        this.baseWeight = baseWeight;
        this.weight = weight ?? baseWeight;
    }
}