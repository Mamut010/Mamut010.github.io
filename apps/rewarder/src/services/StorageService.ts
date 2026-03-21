// ===== Storage =====

interface RewardProfile {
    id: string;
    name: string;
    nodes: RewardNodeConfig[];
    pityEnabled: boolean;
    pityThreshold: number;
    pityTargetId: string | null;
    nextId: number;
    stdPityEnabled:   boolean;
    stdPityThreshold: number;
    stdPityEntries:   StandardPityEntry[];
    featuredPityEnabled:  boolean;
    featuredPityEntries:  FeaturedPityEntry[];
}

interface RollHistoryEntry {
    rollNum: number;
    rewardId: string;
    rewardName: string;
}

interface PersistedStats {
    totalRolls: number;
    rewardCounts: Record<string, number>;
    history: RollHistoryEntry[];
    pityCounter: number;
    stdPityCounter: number;
    featuredPityCounters: Record<string, number>;
}

interface IStorageService {
    loadProfiles(): RewardProfile[];
    saveProfiles(profiles: RewardProfile[]): void;
    loadActiveProfileId(): string | null;
    saveActiveProfileId(id: string): void;
    loadStats(profileId: string): PersistedStats | null;
    saveStats(profileId: string, stats: PersistedStats): void;
    deleteStats(profileId: string): void;
}

class LocalStorageService implements IStorageService {
    public constructor(public readonly prefix?: string) {}

    public loadProfiles(): RewardProfile[] {
        try {
            const raw = localStorage.getItem(this.storageKey("Profiles"));
            if (raw) return JSON.parse(raw) as RewardProfile[];
        } catch (_) { /* ignore */ }
        return [];
    }

    public saveProfiles(profiles: RewardProfile[]): void {
        try {
            localStorage.setItem(this.storageKey("Profiles"), JSON.stringify(profiles));
        } catch (_) { /* ignore */ }
    }

    public loadActiveProfileId(): string | null {
        try {
            return localStorage.getItem(this.storageKey("ActiveProfileId"));
        } catch (_) { /* ignore */ }
        return null;
    }

    public saveActiveProfileId(id: string): void {
        try {
            localStorage.setItem(this.storageKey("ActiveProfileId"), id);
        } catch (_) { /* ignore */ }
    }

    public loadStats(profileId: string): PersistedStats | null {
        try {
            const raw = localStorage.getItem(this.storageKey("Stats_" + profileId));
            if (raw) return JSON.parse(raw) as PersistedStats;
        } catch (_) { /* ignore */ }
        return null;
    }

    public saveStats(profileId: string, stats: PersistedStats): void {
        try {
            localStorage.setItem(this.storageKey("Stats_" + profileId), JSON.stringify(stats));
        } catch (_) { /* ignore */ }
    }

    public deleteStats(profileId: string): void {
        try {
            localStorage.removeItem(this.storageKey("Stats_" + profileId));
        } catch (_) { /* ignore */ }
    }

    private storageKey(suffix: string): string {
        return this.prefix ? `${this.prefix}${suffix}` : suffix;
    }
}