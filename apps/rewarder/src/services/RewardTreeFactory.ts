class RewardTreeFactory implements IRewardTreeFactory<Reward> {
    public constructor(public readonly nodes: readonly RewardNodeConfig[]) {}

    public async create(executionContext: RewardExecutionContext): Promise<IRewardTree<Reward>> {
        const root = new RewardTreeNode<Reward>();
        for (const node of this.nodes) {
            root.connect(this.buildNode(node), node.rate);
        }
        return new RewardTree(root);
    }

    private buildNode(config: RewardNodeConfig): RewardTreeNode<Reward> {
        const metadata = { id: config.id };
        if (!config.isGroup) {
            return new RewardTreeNode(new Reward(config.id, config.name), metadata);
        }
        const groupNode = new RewardTreeNode<Reward>(undefined, metadata);
        for (const child of config.children) {
            groupNode.connect(this.buildNode(child), child.rate);
        }
        return groupNode;
    }
}