class HardPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;

    public get counter(): number { return this._counter; }

    public constructor(private _threshold: number) {}

    public async intercept(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        const edges = ctx.tree.root.outgoingEdges;
        if (edges.length === 0) return next(ctx);

        const leastReward = this.getLeastWeightedReward(edges);
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

    public getLeastWeightedReward(edges: readonly IRewardTreeEdge<Reward>[]): Reward {
        const valid = edges.filter(e => e.weight > 0 && e.target.reward != null);
        if (valid.length === 0) return Reward.Empty;
        return valid.reduce((min, e) => e.weight < min.weight ? e : min).target.reward!;
    }
}
