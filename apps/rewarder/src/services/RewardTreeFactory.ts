class RewardTreeFactory implements IRewardTreeFactory<Reward> {
    public constructor(public readonly nodes: readonly RewardNodeConfig[]) {}

    public async create(executionContext: RewardExecutionContext): Promise<IRewardTree<Reward>> {
        const root = RewardTreeNodes.empty<Reward>("root");
        for (const node of this.nodes) {
            root.connectChild(this.buildNode(node), node.rate);
        }
        return RewardTrees.create(root);
    }

    private buildNode(config: RewardNodeConfig): IRewardTreeNode<Reward> {
        if (!config.isGroup) {
            const reward = new Reward(config.id, config.name);
            return RewardTreeNodes.create(config.id, reward);
        }
        const groupNode = RewardTreeNodes.empty<Reward>(config.id);
        for (const child of config.children) {
            groupNode.connectChild(this.buildNode(child), child.rate);
        }
        return groupNode;
    }
}