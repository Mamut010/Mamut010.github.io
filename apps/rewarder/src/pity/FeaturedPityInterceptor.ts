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
 * Multiple instances of this class can coexist independently — one per featured
 * group — without any shared state between them.
 *
 * Group discovery and hit detection are done at intercept time against the live
 * tree (via node metadata) and the traversal path (via result.path), so no
 * structural pre-knowledge of the tree is required.
 *
 * Ordering note: place BEFORE StandardPityInterceptor in the pipeline so this
 * patch is visible to downstream interceptors.
 */
class FeaturedPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;

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
    ) {}

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
        const hitGroup    = result.path.some(
            e => (e.target.metadata?.["id"] as string | undefined) === this._group.id,
        );

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
     * Searches the live tree for the group node by its metadata id and rewires
     * it so it only connects to the featured reward.  Works directly on ctx.tree
     * (freshly created per pipeline.invoke() call and discarded afterwards) — no
     * cloning required.  Because the search uses the live tree rather than a
     * pre-computed index, it remains correct even if the tree's structure has
     * changed since the interceptor was constructed.
     */
    private _applyOverride(ctx: RewardPipelineContext<Reward>): void {
        const groupNode = this._findGroupNode(ctx.tree.root);
        if (!groupNode) return;
        groupNode.disconnectAll();
        groupNode.connect(new RewardTreeNode(new Reward(this._featured.id, this._featured.name)), 100);
    }

    /** DFS search for the node whose metadata.id matches the configured group id. */
    private _findGroupNode(node: IRewardTreeNode<Reward>): IRewardTreeNode<Reward> | undefined {
        for (const child of node.children) {
            if ((child.metadata?.["id"] as string | undefined) === this._group.id) {
                return child;
            }
            const found = this._findGroupNode(child);
            if (found) return found;
        }
        return undefined;
    }
}

