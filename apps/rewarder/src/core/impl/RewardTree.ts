class RewardTree<TReward> implements IRewardTree<TReward> {
    private readonly _root: IRewardTreeNode<TReward>;

    public constructor(root: IRewardTreeNode<TReward>) {
        this._root = root;
    }

    public get root(): IRewardTreeNode<TReward> {
        return this._root;
    }
}
