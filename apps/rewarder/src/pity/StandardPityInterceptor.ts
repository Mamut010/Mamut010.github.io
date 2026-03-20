// ===== Standard Pity Interceptor =====

/**
 * Tree-overriding pity interceptor.
 *
 * Guarantees a roll from a configurable "pity pool" on every N-th pull,
 * regardless of what was drawn.  Unlike HardPityInterceptor, this interceptor
 * does not target a specific node — instead it replaces the reward tree in the
 * pipeline context with a secondary pool on every N-th roll.
 *
 * Ordering note: place BEFORE HardPityInterceptor in the pipeline so that the
 * tree override is visible to downstream interceptors (HardPityInterceptor will
 * then evaluate its hit-check against the pity-pool result).
 */
class StandardPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;

    public get counter(): number           { return this._counter; }
    public setCounter(value: number): void { this._counter = value; }

    public constructor(
        private readonly _threshold: number,
        private readonly _pityNodes: readonly RewardNodeConfig[],
    ) {}

    public async intercept(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        this._counter++;

        if (this._counter >= this._threshold) {
            this._counter = 0;
            // Override the tree in-place; downstream interceptors (e.g. HardPity) see it.
            const pityTree = await new RewardTreeFactory(this._pityNodes).create(ctx.exec);
            ctx.tree = pityTree;
        }

        const result = await next(ctx);

        // If a reward from the pity pool was obtained naturally, reset the counter.
        if (this._counter > 0 && this._isHit(result)) {
            this._counter = 0;
        }

        return result;
    }

    private _isHit(result: RewardResult<Reward>): boolean {
        const leafIds = new Set(collectLeaves(this._pityNodes as RewardNodeConfig[]).map(l => l.id));
        return result.rewards.some(r => leafIds.has(r.id));
    }
}
