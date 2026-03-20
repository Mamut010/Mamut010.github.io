class HardPityInterceptor extends BasePityInterceptor {
    public get targetName(): string { return this._target.name; }
    public get targetId():   string { return this._target.id; }

    public constructor(
        threshold: number,
        private readonly _target: RewardNodeConfig,
    ) {
        super(threshold);
    }

    protected _isHit(result: RewardResult<Reward>): boolean {
        return RewardUtils.containsResultRecursive([this._target], result);
    }

    protected async _buildPityTree(ctx: RewardPipelineContext<Reward>): Promise<IRewardTree<Reward>> {
        const pityConfig = { ...this._target, rate: 100 };
        return await new RewardTreeFactory([pityConfig]).create(ctx.exec);
    }
}
