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
    public constructor(public readonly items: readonly RewardItemConfig[]) {}

    public async create(executionContext: RewardExecutionContext): Promise<IRewardTree<Reward>> {
        const rootNode = new RewardTreeNode<Reward>(Reward.Empty);
        for (const item of this.items) {
            const node = new RewardTreeNode(new Reward(item.id, item.name));
            rootNode.connect(node, item.rate);
        }
        return new RewardTree(rootNode);
    }
}
