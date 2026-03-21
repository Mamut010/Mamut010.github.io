class RewardTree<TReward> implements IRewardTree<TReward> {
    private readonly _root: IRewardTreeNode<TReward>;

    public constructor(root: IRewardTreeNode<TReward>) {
        this._root = root;
    }

    public get root(): IRewardTreeNode<TReward> {
        return this._root;
    }
}

class RewardTrees {
    /**
     * Creates a reward tree with the given root node. The root node should already be fully constructed with its subtree.
     * @param root The root node of the tree
     * @returns The created reward tree instance
     */
    public static create<TReward>(root: IRewardTreeNode<TReward>): IRewardTree<TReward> {
        return new RewardTree(root);
    }
}