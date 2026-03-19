const Rarity = {
    SuperRare: "Super Rare",
    Rare: "Rare",
    Common: "Common",
} as const;
type Rarity = typeof Rarity[keyof typeof Rarity];

class Reward {
    public constructor(
        public readonly name: string,
        public readonly rarity: Rarity,
    ) {}

    public static get Empty(): Reward {
        return new Reward('', Rarity.Common);    
    }

    public equals(other: Reward): boolean {
        return this.name === other.name;
    }

    public toString(): string {
        return `${this.name} (${this.rarity})`;
    }
}

class FixedRateRewardTreeFactory implements IRewardTreeFactory<Reward> {
    public constructor(
        public readonly rates: ReadonlyMap<Rarity, number>
    ) {}

    public async create(): Promise<IRewardTree<Reward>> {
        const commonReward = new Reward("Common Reward", Rarity.Common);
        const rareReward = new Reward("Rare Reward", Rarity.Rare);
        const superRareReward = new Reward("Super Rare Reward", Rarity.SuperRare);

        const commonRewardNode = new RewardTreeNode(commonReward);
        const rareRewardNode = new RewardTreeNode(rareReward);
        const superRareRewardNode = new RewardTreeNode(superRareReward);

        const commonRewardRate = this.rates.get(Rarity.Common) ?? 0;
        const rareRewardRate = this.rates.get(Rarity.Rare) ?? 0;
        const superRareRewardRate = this.rates.get(Rarity.SuperRare) ?? 0;

        const rootNode = new RewardTreeNode<Reward>(Reward.Empty);
        rootNode.connect(commonRewardNode, commonRewardRate);
        rootNode.connect(rareRewardNode, rareRewardRate);
        rootNode.connect(superRareRewardNode, superRareRewardRate);

        return new RewardTree(rootNode);
    }
}

function createPipeline(treeFactory: IRewardTreeFactory<Reward>): RewardPipeline<Reward> {
    const traversalStrategy = new WeightedUntilLeafTreeWalker<Reward>(new BaseEdgeProvider<Reward>());
    const collector = new SubtreeRewardCollector<Reward>();
    const resolver = new RewardResolver<Reward>(traversalStrategy, collector);
    const pipeline = new RewardPipeline(treeFactory, resolver);
    return pipeline;
}

function createInterceptedPipeline(treeFactory: IRewardTreeFactory<Reward>): RewardPipeline<Reward> {
    const pipeline = createPipeline(treeFactory);

    class HardPityInterceptor implements IRewardInterceptor<Reward> {
        private counter = 0;

        public constructor(public readonly threshold: number) {}

        public async intercept(ctx: RewardPipelineContext<Reward>, next: RewardNextHandler<Reward>): Promise<RewardResult<Reward>> {
            const tree = ctx.tree;
            const edges = tree.root.outgoingEdges;
            if (edges.length === 0) {
                return await next(ctx);
            }

            const leastWeightedReward = this.getLeastWeightedReward(tree.root.outgoingEdges);
            const result = await next(ctx);
            const rewards = result.rewards;

            if (rewards.findIndex(r => r.equals(leastWeightedReward)) >= 0) {
                this.counter = 0;
                return result;
            }

            if (this.counter + 1 < this.threshold) {
                this.counter++;
                return result;
            }

            this.counter = 0;
            return {
                rewards: [leastWeightedReward],
                path: result.path,
            };
        }

        private getLeastWeightedReward(edges: readonly IRewardTreeEdge<Reward>[]): Reward {
            edges = edges.filter(e => e.weight > 0 && e.target.reward);

            let leastWeightedEdge = edges[0];
            for (let i = 1; i < edges.length; i++) {
                const currentWeight = edges[i].weight;
                if (currentWeight < leastWeightedEdge.weight) {
                    leastWeightedEdge = edges[i];
                }
            }
            return leastWeightedEdge.target.reward!;
        }
    }

    pipeline.setInterceptors([new HardPityInterceptor(90)]);

    return pipeline;
}

async function roll(pipeline: IRewardPipeline<Reward>, count: number = 1): Promise<void> {
    const received: Reward[][] = [];
    const rarityGroups = new Map<Rarity, Reward[]>();
    const rng = new MathRandomNumberGenerator();
    for (let i = 0; i < count; i++) {
        const executionContext: RewardExecutionContext = { rng };
        const result = await pipeline.invoke(executionContext);
        const receivedRewards = result.rewards;
        received.push(receivedRewards);

        for (const reward of receivedRewards) {
            const group = rarityGroups.get(reward.rarity);
            if (group) {
                group.push(reward);
            }
            else {
                rarityGroups.set(reward.rarity, [reward]);
            }
        }
    }

    console.log(`Rolled ${count} time(s):`)
    for (const rarity of Object.values(Rarity)) {
        const rewardCount = rarityGroups.get(rarity)?.length ?? 0;
        console.log(`${rarity}: ${rewardCount} reward(s)`);
    }
    
    if (received.length <= 100) {
        for (let i = 0; i < received.length; i++) {
            console.log(`#${i+1}: ${received[i].join(', ')}`);
        }
    }
}

const treeFactory = new FixedRateRewardTreeFactory(
    new Map([
        [Rarity.SuperRare, 0.01],
        [Rarity.Rare, 0.15],
        [Rarity.Common, 0.84],
    ]));
const pipeline = createInterceptedPipeline(treeFactory);
roll(pipeline, 90);