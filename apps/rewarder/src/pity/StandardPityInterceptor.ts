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
class StandardPityInterceptor extends BaseRollCountingPityInterceptor {
    public constructor(
        threshold: number,
        private readonly _pityNodes: readonly RewardNodeConfig[],
    ) {
        super(threshold);
    }

    // If a reward from the pity pool was obtained naturally, reset the counter.
    protected _isHit(result: RewardResult<Reward>): boolean {
        return RewardUtils.containsResultRecursive(this._pityNodes, result);
    }

    protected async _buildPityTree(ctx: RewardPipelineContext<Reward>): Promise<IRewardTree<Reward>> {
        return await new RewardTreeFactory(this._pityNodes).create(ctx.exec);
    }
}
