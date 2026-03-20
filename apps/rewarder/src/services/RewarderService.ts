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

    totalRolls   = 0;
    rewardCounts = new Map<string, number>();
    history: RollRecord[] = [];

    private pipeline!: RewardPipeline<Reward>;
    pityInterceptor:    HardPityInterceptor    | null = null;
    stdPityInterceptor: StandardPityInterceptor | null = null;
    private rng = new MathRandomNumberGenerator();

    profiles: RewardProfile[] = [];
    activeProfileId = "";

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
        const { pipeline, pityInterceptor, stdPityInterceptor } = buildPipeline(
            this.rewardNodes,
            this.pityEnabled,
            this.pityThreshold,
            targetConfig,
            this.stdPityEnabled,
            this.stdPityThreshold,
            this.resolvedStdPityNodes(),
        );
        this.pipeline           = pipeline;
        this.pityInterceptor    = pityInterceptor;
        this.stdPityInterceptor = stdPityInterceptor;
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
        this.rewardNodes.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color: "#c084fc", borderColor: "#c084fc", children: [],
        });
        return id;
    }

    addRootGroup(): string {
        const gid = `group-${this.nextId++}`;
        const lid = `leaf-${this.nextId++}`;
        this.rewardNodes.push({
            id: gid, name: "New Group", rate: 0, isGroup: true,
            color: "", borderColor: "",
            children: [{
                id: lid, name: "New Reward", rate: 100, isGroup: false,
                color: "#c084fc", borderColor: "#c084fc", children: [],
            }],
        });
        return gid;
    }

    addChildToGroup(groupId: string): string | null {
        const group = this.findNode(groupId);
        if (!group || !group.isGroup) return null;
        const id = `leaf-${this.nextId++}`;
        group.children.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color: "#c084fc", borderColor: "#c084fc", children: [],
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
                return;
            }
        }
        for (const group of this.rewardNodes) {
            if (!group.isGroup) continue;
            if (group.children.length > 1) {
                const idx = group.children.findIndex(n => n.id === id);
                if (idx !== -1) {
                    group.children.splice(idx, 1);
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
            pityCounter:    this.pityInterceptor?.counter    ?? 0,
            stdPityCounter: this.stdPityInterceptor?.counter ?? 0,
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
            if (this.pityInterceptor)    this.pityInterceptor.setCounter(stats.pityCounter);
            if (this.stdPityInterceptor) this.stdPityInterceptor.setCounter(stats.stdPityCounter ?? 0);
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
                if (this.pityInterceptor) this.pityInterceptor.setCounter(stats.pityCounter);
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
            if (this.pityInterceptor)    this.pityInterceptor.setCounter(stats.pityCounter);
            if (this.stdPityInterceptor) this.stdPityInterceptor.setCounter(stats.stdPityCounter ?? 0);
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
