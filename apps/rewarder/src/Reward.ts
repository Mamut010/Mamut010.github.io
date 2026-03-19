class Reward {
    public constructor(
        public readonly id: string,
        public readonly name: string,
    ) {}

    public static get Empty(): Reward {
        return new Reward("__empty__", "");
    }

    public equals(other: Reward): boolean {
        return this.id === other.id;
    }
}

class DynamicRewardTreeFactory implements IRewardTreeFactory<Reward> {
    public constructor(public readonly nodes: readonly RewardNodeConfig[]) {}

    public async create(executionContext: RewardExecutionContext): Promise<IRewardTree<Reward>> {
        const root = new RewardTreeNode<Reward>(Reward.Empty);
        for (const node of this.nodes) {
            root.connect(this.buildNode(node), node.rate);
        }
        return new RewardTree(root);
    }

    private buildNode(config: RewardNodeConfig): RewardTreeNode<Reward> {
        if (!config.isGroup) {
            return new RewardTreeNode(new Reward(config.id, config.name));
        }
        const groupNode = new RewardTreeNode<Reward>(Reward.Empty);
        for (const child of config.children) {
            groupNode.connect(this.buildNode(child), child.rate);
        }
        return groupNode;
    }
}
