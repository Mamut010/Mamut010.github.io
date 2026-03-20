// ===== Rewarder Service =====
// Owns all application state and business logic. No DOM access.

class RewarderService {
    rewardNodes: RewardNodeConfig[] = defaultRewardNodes();
    pityEnabled    = true;
    pityThreshold  = 90;
    pityTargetId: string | null = null;
    nextId         = 1;

    stdPityEnabled   = false;
    stdPityThreshold = 10;
    stdPityEntries:  StandardPityEntry[] = [];

    featuredPityEnabled    = false;
    featuredPityThreshold  = 2;
    featuredPityGroupId:    string | null = null;
    featuredPityFeaturedId: string | null = null;

    totalRolls   = 0;
    rewardCounts = new Map<string, number>();
    history: RollRecord[] = [];

    private pipeline!: RewardPipeline<Reward>;
    pityInterceptor:    HardPityInterceptor    | null = null;
    stdPityInterceptor: StandardPityInterceptor | null = null;
    featuredPityInterceptor: FeaturedPityInterceptor | null = null;
    private rng = new MathRandomNumberGenerator();
    private readonly _colorProvider: IRewardColorProvider;

    profiles: RewardProfile[] = [];
    activeProfileId = "";

    constructor(colorProvider: IRewardColorProvider = new CyclingColorProvider()) {
        this._colorProvider = colorProvider;
    }

    // ===== Init =====

    init(): void {
        this.loadState();
    }

    // ===== Pipeline =====

    rebuildPipeline(): void {
        if (this.pityTargetId !== null && !this.findNode(this.pityTargetId)) {
            this.pityTargetId = null;
        }
        const targetConfig = this.pityTargetId
            ? (this.findNode(this.pityTargetId) ?? null)
            : null;

        const featuredGroup    = this.featuredPityGroupId
            ? (this.findNode(this.featuredPityGroupId) ?? null)
            : null;
        const featuredFeatured = this.featuredPityFeaturedId
            ? (this.findNode(this.featuredPityFeaturedId) ?? null)
            : null;
        // Nullify IDs that no longer exist in the tree.
        if (!featuredGroup)    this.featuredPityGroupId    = null;
        if (!featuredFeatured) this.featuredPityFeaturedId = null;

        const { pipeline, pityInterceptor, stdPityInterceptor, featuredPityInterceptor } = buildPipeline({
            nodes: this.rewardNodes,
            pityEnabled: this.pityEnabled,
            pityThreshold: this.pityThreshold,
            pityTargetConfig: targetConfig,
            stdPityEnabled: this.stdPityEnabled,
            stdPityThreshold: this.stdPityThreshold,
            stdPityNodes: this.resolvedStdPityNodes(),
            featuredPityEnabled: this.featuredPityEnabled,
            featuredPityThreshold: this.featuredPityThreshold,
            featuredPityGroupConfig: featuredGroup,
            featuredPityFeaturedConfig: featuredFeatured,
        });
        
        this.pipeline                = pipeline;
        this.pityInterceptor         = pityInterceptor;
        this.stdPityInterceptor      = stdPityInterceptor;
        this.featuredPityInterceptor = featuredPityInterceptor;
        if (this.pityInterceptor) {
            this.pityTargetId = this.pityInterceptor.targetId;
        }
        this.saveProfileConfig();
    }

    /** Resolves stdPityEntries into full RewardNodeConfig objects from the active pool. */
    resolvedStdPityNodes(): RewardNodeConfig[] {
        const result: RewardNodeConfig[] = [];
        for (const entry of this.stdPityEntries) {
            const node = this.rewardNodes.find(n => n.id === entry.nodeId);
            if (node) result.push({ ...node, rate: entry.rate });
        }
        return result;
    }

    // ===== Node Queries =====

    findNode(id: string, nodes: RewardNodeConfig[] = this.rewardNodes): RewardNodeConfig | undefined {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.isGroup) {
                const found = this.findNode(id, node.children);
                if (found) return found;
            }
        }
        return undefined;
    }

    isRateValid(): boolean {
        return this.validateTree(this.rewardNodes);
    }

    rootTotalRate(): number {
        return this.rewardNodes.reduce((s, n) => s + n.rate, 0);
    }

    private validateTree(nodes: RewardNodeConfig[]): boolean {
        if (nodes.length === 0) return false;
        const sum = nodes.reduce((s, n) => s + n.rate, 0);
        if (Math.abs(sum - 100) >= 0.001) return false;
        for (const n of nodes) {
            if (n.rate < 0) return false;
            if (n.isGroup && !this.validateTree(n.children)) return false;
        }
        return true;
    }

    // ===== Node Mutations =====

    addRootLeaf(): string {
        const id = `leaf-${this.nextId++}`;
        const color = this._colorProvider.next();
        this.rewardNodes.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color, borderColor: color, children: [],
        });
        return id;
    }

    addRootGroup(): string {
        const gid = `group-${this.nextId++}`;
        const lid = `leaf-${this.nextId++}`;
        const color = this._colorProvider.next();
        this.rewardNodes.push({
            id: gid, name: "New Group", rate: 0, isGroup: true,
            color: "", borderColor: "",
            children: [{
                id: lid, name: "New Reward", rate: 100, isGroup: false,
                color, borderColor: color, children: [],
            }],
        });
        return gid;
    }

    addChildToGroup(groupId: string): string | null {
        const group = this.findNode(groupId);
        if (!group || !group.isGroup) return null;
        const id = `leaf-${this.nextId++}`;
        const color = this._colorProvider.next();
        group.children.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color, borderColor: color, children: [],
        });
        return id;
    }

    removeNode(id: string): void {
        if (this.rewardNodes.length > 1) {
            const idx = this.rewardNodes.findIndex(n => n.id === id);
            if (idx !== -1) {
                this.rewardNodes.splice(idx, 1);
                // Clean up any std pity entry referencing this root node.
                this.stdPityEntries = this.stdPityEntries.filter(e => e.nodeId !== id);
                // Clean up featured pity if group is removed.
                if (this.featuredPityGroupId === id) {
                    this.featuredPityGroupId    = null;
                    this.featuredPityFeaturedId = null;
                }
                return;
            }
        }
        for (const group of this.rewardNodes) {
            if (!group.isGroup) continue;
            if (group.children.length > 1) {
                const idx = group.children.findIndex(n => n.id === id);
                if (idx !== -1) {
                    group.children.splice(idx, 1);
                    // Clean up featured pity if the featured child is removed.
                    if (this.featuredPityFeaturedId === id) {
                        this.featuredPityFeaturedId = null;
                    }
                    return;
                }
            }
        }
    }

    // ===== Rolling =====

    async roll(): Promise<{ reward: Reward; rollNum: number }> {
        const result = await this.pipeline.invoke({ rng: this.rng });
        const reward = result.rewards[0] ?? new Reward("unknown", "Unknown");
        const rollNum = ++this.totalRolls;
        this.rewardCounts.set(reward.id, (this.rewardCounts.get(reward.id) ?? 0) + 1);
        this.history.unshift({ rollNum, reward });
        if (this.history.length > 200) this.history.pop();
        return { reward, rollNum };
    }

    resetStats(): void {
        this.totalRolls   = 0;
        this.rewardCounts = new Map();
        this.history      = [];
    }

    // ===== Profiles & Persistence =====

    saveProfileConfig(): void {
        const idx = this.profiles.findIndex(p => p.id === this.activeProfileId);
        if (idx === -1) return;
        this.profiles[idx] = {
            ...this.profiles[idx],
            nodes:            this.rewardNodes,
            pityEnabled:      this.pityEnabled,
            pityThreshold:    this.pityThreshold,
            pityTargetId:     this.pityTargetId,
            nextId:           this.nextId,
            stdPityEnabled:   this.stdPityEnabled,
            stdPityThreshold: this.stdPityThreshold,
            stdPityEntries:   this.stdPityEntries,
            featuredPityEnabled:    this.featuredPityEnabled,
            featuredPityThreshold:  this.featuredPityThreshold,
            featuredPityGroupId:    this.featuredPityGroupId,
            featuredPityFeaturedId: this.featuredPityFeaturedId,
        };
        storageSaveProfiles(this.profiles);
    }

    saveCurrentStats(): void {
        const stats: PersistedStats = {
            totalRolls:    this.totalRolls,
            rewardCounts:  Object.fromEntries(this.rewardCounts),
            history:       this.history.map(h => ({
                rollNum:    h.rollNum,
                rewardId:   h.reward.id,
                rewardName: h.reward.name,
            })),
            pityCounter:         this.pityInterceptor?.counter         ?? 0,
            stdPityCounter:      this.stdPityInterceptor?.counter      ?? 0,
            featuredPityCounter: this.featuredPityInterceptor?.counter ?? 0,
        };
        storageSaveStats(this.activeProfileId, stats);
    }

    // Returns true if the active profile was replaced (caller should do a full re-render).
    switchProfile(id: string): boolean {
        if (id === this.activeProfileId) return false;
        const profile = this.profiles.find(p => p.id === id);
        if (!profile) return false;

        this.saveCurrentStats();
        this.activeProfileId = id;
        storageSaveActiveProfileId(id);

        this.totalRolls   = 0;
        this.rewardCounts = new Map();
        this.history      = [];

        this.applyProfile(profile);
        this.rebuildPipeline();

        const stats = storageLoadStats(id);
        if (stats) {
            this.applyStats(stats);
            if (this.pityInterceptor)         this.pityInterceptor.setCounter(stats.pityCounter);
            if (this.stdPityInterceptor)      this.stdPityInterceptor.setCounter(stats.stdPityCounter ?? 0);
            if (this.featuredPityInterceptor) this.featuredPityInterceptor.setCounter(stats.featuredPityCounter ?? 0);
        }
        return true;
    }

    newProfile(): void {
        this.saveCurrentStats();
        const num = this.profiles.length + 1;
        const profile: RewardProfile = {
            id:               generateProfileId(),
            name:             "Profile " + num,
            nodes:            defaultRewardNodes(),
            pityEnabled:      true,
            pityThreshold:    90,
            pityTargetId:     null,
            nextId:           1,
            stdPityEnabled:   false,
            stdPityThreshold: 10,
            stdPityEntries:   [],
            featuredPityEnabled:    false,
            featuredPityThreshold:  2,
            featuredPityGroupId:    null,
            featuredPityFeaturedId: null,
        };
        this.profiles.push(profile);
        storageSaveProfiles(this.profiles);

        this.activeProfileId = profile.id;
        storageSaveActiveProfileId(profile.id);

        this.totalRolls   = 0;
        this.rewardCounts = new Map();
        this.history      = [];

        this.applyProfile(profile);
        this.rebuildPipeline();
    }

    // Returns true if the active profile was deleted (caller should do a full re-render).
    deleteProfile(id: string): boolean {
        if (this.profiles.length <= 1) return false;
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx === -1) return false;

        storageDeleteStats(id);
        this.profiles.splice(idx, 1);
        storageSaveProfiles(this.profiles);

        if (this.activeProfileId === id) {
            const next = this.profiles[Math.max(0, idx - 1)];
            this.activeProfileId = next.id;
            storageSaveActiveProfileId(next.id);

            this.totalRolls   = 0;
            this.rewardCounts = new Map();
            this.history      = [];

            this.applyProfile(next);
            this.rebuildPipeline();

            const stats = storageLoadStats(next.id);
            if (stats) {
                this.applyStats(stats);
                if (this.pityInterceptor)         this.pityInterceptor.setCounter(stats.pityCounter);
                if (this.stdPityInterceptor)      this.stdPityInterceptor.setCounter(stats.stdPityCounter ?? 0);
                if (this.featuredPityInterceptor) this.featuredPityInterceptor.setCounter(stats.featuredPityCounter ?? 0);
            }
            return true;
        }
        return false;
    }

    renameProfile(name: string): void {
        const idx = this.profiles.findIndex(p => p.id === this.activeProfileId);
        if (idx === -1) return;
        this.profiles[idx].name = name || "Profile";
        storageSaveProfiles(this.profiles);
    }

    private loadState(): void {
        let profiles = storageLoadProfiles();
        let activeId = storageLoadActiveProfileId();

        if (profiles.length === 0) {
            const firstProfile: RewardProfile = {
                id:               generateProfileId(),
                name:             "Default",
                nodes:            defaultRewardNodes(),
                pityEnabled:      true,
                pityThreshold:    90,
                pityTargetId:     null,
                nextId:           1,
                stdPityEnabled:   false,
                stdPityThreshold: 10,
                stdPityEntries:   [],
                featuredPityEnabled:    false,
                featuredPityThreshold:  2,
                featuredPityGroupId:    null,
                featuredPityFeaturedId: null,
            };
            profiles = [firstProfile];
            storageSaveProfiles(profiles);
            activeId = firstProfile.id;
            storageSaveActiveProfileId(activeId);
        }

        this.profiles = profiles;
        const active = profiles.find(p => p.id === activeId) ?? profiles[0];
        this.activeProfileId = active.id;
        storageSaveActiveProfileId(this.activeProfileId);

        this.applyProfile(active);
        this.rebuildPipeline();

        const stats = storageLoadStats(active.id);
        if (stats) {
            this.applyStats(stats);
            if (this.pityInterceptor)         this.pityInterceptor.setCounter(stats.pityCounter);
            if (this.stdPityInterceptor)      this.stdPityInterceptor.setCounter(stats.stdPityCounter ?? 0);
            if (this.featuredPityInterceptor) this.featuredPityInterceptor.setCounter(stats.featuredPityCounter ?? 0);
        }
    }

    private applyProfile(profile: RewardProfile): void {
        this.rewardNodes      = profile.nodes;
        this.pityEnabled      = profile.pityEnabled;
        this.pityThreshold    = profile.pityThreshold;
        this.pityTargetId     = profile.pityTargetId;
        this.nextId           = profile.nextId;
        this.stdPityEnabled   = profile.stdPityEnabled   ?? false;
        this.stdPityThreshold = profile.stdPityThreshold ?? 10;
        this.stdPityEntries   = profile.stdPityEntries   ?? [];
        this.featuredPityEnabled    = profile.featuredPityEnabled    ?? false;
        this.featuredPityThreshold  = profile.featuredPityThreshold  ?? 2;
        this.featuredPityGroupId    = profile.featuredPityGroupId    ?? null;
        this.featuredPityFeaturedId = profile.featuredPityFeaturedId ?? null;
    }

    private applyStats(stats: PersistedStats): void {
        this.totalRolls   = stats.totalRolls;
        this.rewardCounts = new Map(Object.entries(stats.rewardCounts));
        this.history      = stats.history.map(h => ({
            rollNum: h.rollNum,
            reward:  new Reward(h.rewardId, h.rewardName),
        }));
    }
}
