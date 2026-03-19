class HardPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;

    public get counter(): number { return this._counter; }
    public setCounter(value: number): void { this._counter = value; }

    public get targetName(): string { return this._target.name; }
    public get targetId():   string { return this._target.id; }

    public constructor(
        private readonly _threshold: number,
        private readonly _target: RewardNodeConfig,
    ) {}

    public async intercept(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        const result = await next(ctx);

        if (this._isHit(result)) {
            this._counter = 0;
            return result;
        }
        if (this._counter + 1 < this._threshold) {
            this._counter++;
            return result;
        }
        this._counter = 0;
        return this._forcePity(ctx);
    }

    private _isHit(result: RewardResult<Reward>): boolean {
        const leafIds = new Set(collectLeaves([this._target]).map(l => l.id));
        return result.rewards.some(r => leafIds.has(r.id));
    }

    private async _forcePity(ctx: RewardPipelineContext<Reward>): Promise<RewardResult<Reward>> {
        const pityConfig = { ...this._target, rate: 100 };
        const pityTree = await new DynamicRewardTreeFactory([pityConfig]).create(ctx.exec);
        return ctx.resolver.resolve(pityTree, ctx.exec);
    }
}
