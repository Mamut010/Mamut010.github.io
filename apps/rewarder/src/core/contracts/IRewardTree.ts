interface IRewardTree<TReward> {
    get root(): IRewardTreeNode<TReward>;
}