// ===== Standard Pity Interceptor =====

class StandardPityInterceptor extends BaseRollCountingPityInterceptor {
    public constructor(
        threshold: number,
        private readonly _pityNodes: readonly RewardNodeConfig[],
    ) {
        super(threshold);
    }

    protected _isHit(result: RewardResult<Reward>): boolean {
        return RewardUtils.containsResultRecursive(this._pityNodes, result);
    }

    protected async _buildPityTree(ctx: RewardPipelineContext<Reward>): Promise<IRewardTree<Reward>> {
        return await new RewardTreeFactory(this._pityNodes).create(ctx.exec);
    }
}
