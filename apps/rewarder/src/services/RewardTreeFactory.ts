class RewardTreeFactory implements IRewardTreeFactory<Reward> {
    public constructor(public readonly nodes: readonly RewardNodeConfig[]) {}

    public async create(executionContext: RewardExecutionContext): Promise<IRewardTree<Reward>> {
        const root = this.createRootNode();
        for (const node of this.nodes) {
            const childNode = this.buildNode(node);
            root.connectChild(childNode, node.rate);
        }
        return RewardTrees.create(root);
    }

    private createRootNode(): IRewardTreeNode<Reward> {
        const rootId = "root-" + Randoms.nextTimestampedString();
        const root = RewardTreeNodes.empty<Reward>(rootId);
        return root;
    }

    private buildNode(config: RewardNodeConfig): IRewardTreeNode<Reward> {
        return config.isGroup
            ? this.buildGroupNode(config)
            : this.buildLeafNode(config);
    }

    private buildLeafNode(config: RewardNodeConfig): IRewardTreeNode<Reward> {
        const reward = new Reward(config.id, config.name);
        return RewardTreeNodes.reward(config.id, reward);
    }

    private buildGroupNode(config: RewardNodeConfig): IRewardTreeNode<Reward> {
        const groupNode = RewardTreeNodes.empty<Reward>(config.id);
        for (const child of config.children) {
            const childNode = this.buildNode(child);
            groupNode.connectChild(childNode, child.rate);
        }
        return groupNode;
    }
}