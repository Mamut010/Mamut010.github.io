// ===== Base Pity Interceptor =====
// Abstract base class that encapsulates the shared pity-trigger logic:
//   - roll counter with public getter / setter (for persistence)
//   - threshold check → force-pity branch
//   - natural-hit auto-reset
//
// Subclasses implement the two template methods:
//   _isHit()       — decides whether a result counts as a natural pity hit
//   _buildPityTree() — constructs the reward tree used for the forced pull

abstract class BaseRollCountingPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;

    public get counter(): number           { return this._counter; }
    public setCounter(value: number): void { this._counter = value; }

    protected constructor(protected readonly _threshold: number) {}

    public async intercept(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        this._counter++;

        if (this._counter >= this._threshold) {
            this._counter = 0;
            return await this._forcePity(ctx, next);
        }

        const result = await next(ctx);

        if (this._counter > 0 && this._isHit(result)) {
            this._counter = 0;
        }

        return result;
    }

    protected abstract _isHit(result: RewardResult<Reward>): boolean;

    protected abstract _buildPityTree(
        ctx: RewardPipelineContext<Reward>,
    ): Promise<IRewardTree<Reward>>;

    private async _forcePity(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        ctx.tree = await this._buildPityTree(ctx);
        return await next(ctx);
    }
}
