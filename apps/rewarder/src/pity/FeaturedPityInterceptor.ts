// ===== Featured Pity Interceptor =====

/**
 * Group-scoped pity interceptor (outgoing / result-replacement model).
 *
 * Lets the pipeline resolve naturally, then inspects the returned rewards:
 *
 *  - Natural featured hit   → reset counter.
 *  - Non-featured group hit → increment counter; when counter reaches the
 *                             threshold, replace that reward in the result
 *                             with the featured one and reset.
 *  - No group hit           → counter unchanged (guarantee carries over).
 *
 * Counter semantics:
 *   threshold = 1  →  every non-featured group entry is immediately replaced.
 *   threshold = N  →  the N-th consecutive non-featured group entry is replaced.
 *
 * Multiple instances coexist independently — one per (group, featured) pairing.
 */
class FeaturedPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;

    public get entryId():     string { return this._entryId; }
    public get counter():     number { return this._counter; }
    public setCounter(value: number): void { this._counter = value; }

    public get groupId():      string { return this._group.id; }
    public get groupName():    string { return this._group.name; }
    public get featuredId():   string { return this._featured.id; }
    public get featuredName(): string { return this._featured.name; }
    public get threshold():    number { return this._threshold; }

    public constructor(
        private readonly _entryId:   string,
        private readonly _threshold: number,
        private readonly _group:     RewardNodeConfig,
        private readonly _featured:  RewardNodeConfig,
    ) {}

    public async intercept(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        // Collect all leaf reward IDs that belong to this group in the live tree.
        const groupLeafIds = this._collectGroupLeafIds(ctx.tree.root);

        const result = await next(ctx);

        if (groupLeafIds.size === 0) return result;

        const hitIndex = this._findFirstGroupHitIndex(result, groupLeafIds);
        if (hitIndex === -1) {
            // No group entry this roll — carry over guarantee, counter unchanged.
            return result;
        }

        if (this._isNaturalFeaturedHit(result, hitIndex)) {
            this._resetCounter();
            return result;
        }

        // Non-featured group entry.
        this._counter++;
        if (this._isThresholdReached()) {
            this._resetCounter();
            this._replaceReward(result, hitIndex);
        }

        return result;
    }

    private _findFirstGroupHitIndex(result: RewardResult<Reward>, groupLeafIds: Set<string>): number {
        return result.rewards.findIndex(r => groupLeafIds.has(r.id));
    }

    private _isNaturalFeaturedHit(result: RewardResult<Reward>, hitIndex: number): boolean {
        return result.rewards[hitIndex].id === this._featured.id;
    }

    private _isThresholdReached(): boolean {
        return this._counter >= this._threshold;
    }

    private _resetCounter(): void {
        this._counter = 0;
    }

    private _replaceReward(result: RewardResult<Reward>, index: number): void {
        result.rewards[index] = new Reward(this._featured.id, this._featured.name);
    }

    /**
     * Finds the group node in the live tree by id, then collects all
     * leaf reward IDs beneath it.
     */
    private _collectGroupLeafIds(root: IRewardTreeNode<Reward>): Set<string> {
        const groupNode = this._findNodeById(root, this._group.id);
        if (!groupNode) return new Set();
        const ids = new Set<string>();
        this._collectLeafIds(groupNode, ids);
        return ids;
    }

    private _findNodeById(
        node: IRewardTreeNode<Reward>,
        id: string,
    ): IRewardTreeNode<Reward> | undefined {
        for (const child of node.children) {
            if (child.id === id) return child;
            const found = this._findNodeById(child, id);
            if (found) return found;
        }
        return undefined;
    }

    private _collectLeafIds(node: IRewardTreeNode<Reward>, ids: Set<string>): void {
        if (node.reward) {
            ids.add(node.reward.id);
            return;
        }
        for (const child of node.children) {
            this._collectLeafIds(child, ids);
        }
    }
}

