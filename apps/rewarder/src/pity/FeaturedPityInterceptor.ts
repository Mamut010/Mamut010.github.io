// ===== Featured Pity Interceptor =====

/**
 * Group-scoped pity interceptor.
 *
 * Tracks consecutive non-featured entries into a specific group (i.e. rolls
 * that yield a reward from that group but NOT the designated "featured" reward).
 * After `threshold - 1` such misses, the guarantee is owed: the next roll that
 * enters the group is forced to produce the featured reward.
 *
 * Counter semantics:
 *   threshold = 2  →  after 1 miss the next group entry is guaranteed (50/50)
 *   threshold = 3  →  after 2 misses the next group entry is guaranteed
 *   threshold = 1  →  every group entry is forced to the featured reward
 *
 * Unlike Hard/Standard pity:
 *  - The counter only increments on non-featured group entries (not every roll).
 *  - The tree override patches only the target group's children; the group's
 *    own rate in the root tree is preserved, so entering the group still
 *    requires the normal probability.
 *  - When the guarantee is owed but the roll does not enter the group, the
 *    guarantee carries over to the next roll.
 *
 * Ordering note: place BEFORE StandardPityInterceptor in the pipeline so this
 * patch is visible to downstream interceptors.
 */
class FeaturedPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;
    private readonly _groupIndex: number;

    public get counter(): number           { return this._counter; }
    public setCounter(value: number): void { this._counter = value; }

    public get groupId():      string { return this._group.id; }
    public get groupName():    string { return this._group.name; }
    public get featuredId():   string { return this._featured.id; }
    public get featuredName(): string { return this._featured.name; }

    public constructor(
        private readonly _threshold: number,
        private readonly _group:     RewardNodeConfig,
        private readonly _featured:  RewardNodeConfig,
        rootNodes:                   readonly RewardNodeConfig[],
    ) {
        this._groupIndex = rootNodes.findIndex(n => n.id === _group.id);
    }

    public async intercept(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        const isOwed = this._isOwed();
        if (isOwed) {
            this._applyOverride(ctx);
        }

        const result = await next(ctx);

        const hitFeatured = result.rewards.some(r => r.id === this._featured.id);
        const hitGroup    = RewardUtils.containsResultRecursive(this._group.children, result);

        if (hitFeatured) {
            // Featured reward obtained (naturally or via override) → reset.
            this._counter = 0;
        } else if (hitGroup && !isOwed) {
            // Non-featured group entry on a normal (non-owed) roll → accumulate.
            this._counter++;
        }
        // If owed but group was not entered this roll, the guarantee carries over (counter unchanged).

        return result;
    }

    private _isOwed(): boolean {
        return this._counter >= this._threshold - 1;
    }

    /**
     * Rewires the group node in the already-built tree so it only connects to the
     * featured reward.  Works directly on ctx.tree (which is freshly created per
     * pipeline.invoke() call and discarded afterwards) — no cloning required.
     */
    private _applyOverride(ctx: RewardPipelineContext<Reward>): void {
        if (this._groupIndex < 0) return;
        const groupNode = ctx.tree.root.children[this._groupIndex];
        groupNode.disconnectAll();
        groupNode.connect(new RewardTreeNode(new Reward(this._featured.id, this._featured.name)), 100);
    }
}
