class HardPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;

    public get counter(): number { return this._counter; }

    public constructor(private _threshold: number) {}

    public async intercept(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        const leastReward = this.getLeastProbableLeaf(ctx.tree.root);
        if (leastReward.equals(Reward.Empty)) return next(ctx);

        const result = await next(ctx);

        if (result.rewards.some(r => r.equals(leastReward))) {
            this._counter = 0;
            return result;
        }
        if (this._counter + 1 < this._threshold) {
            this._counter++;
            return result;
        }
        this._counter = 0;
        return { rewards: [leastReward], path: result.path };
    }

    public getLeastProbableLeaf(root: IRewardTreeNode<Reward>): Reward {
        const result = this.findMinProbLeaf(root, 1);
        return result?.reward ?? Reward.Empty;
    }

    private findMinProbLeaf(
        node: IRewardTreeNode<Reward>,
        prob: number,
    ): { reward: Reward; prob: number } | null {
        const edges = node.outgoingEdges.filter(e => e.weight > 0);
        if (edges.length === 0) {
            const r = node.reward;
            if (r != null && !r.equals(Reward.Empty)) return { reward: r, prob };
            return null;
        }
        const totalWeight = edges.reduce((s, e) => s + e.weight, 0);
        let best: { reward: Reward; prob: number } | null = null;
        for (const edge of edges) {
            const child = this.findMinProbLeaf(edge.target, prob * (edge.weight / totalWeight));
            if (child && (!best || child.prob < best.prob)) best = child;
        }
        return best;
    }
}
