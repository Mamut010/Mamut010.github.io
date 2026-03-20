// ===== Storage =====

const STORAGE_PREFIX = "REWARDER_";

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
}

interface PersistedStats {
    totalRolls: number;
    rewardCounts: Record<string, number>;
    history: Array<{ rollNum: number; rewardId: string; rewardName: string }>;
    pityCounter: number;
    stdPityCounter: number;
}

function storageKey(suffix: string): string {
    return STORAGE_PREFIX + suffix;
}

function storageLoadProfiles(): RewardProfile[] {
    try {
        const raw = localStorage.getItem(storageKey("Profiles"));
        if (raw) return JSON.parse(raw) as RewardProfile[];
    } catch (_) { /* ignore */ }
    return [];
}

function storageSaveProfiles(profiles: RewardProfile[]): void {
    try {
        localStorage.setItem(storageKey("Profiles"), JSON.stringify(profiles));
    } catch (_) { /* ignore */ }
}

function storageLoadActiveProfileId(): string | null {
    try {
        return localStorage.getItem(storageKey("ActiveProfileId"));
    } catch (_) { /* ignore */ }
    return null;
}

function storageSaveActiveProfileId(id: string): void {
    try {
        localStorage.setItem(storageKey("ActiveProfileId"), id);
    } catch (_) { /* ignore */ }
}

function storageLoadStats(profileId: string): PersistedStats | null {
    try {
        const raw = localStorage.getItem(storageKey("Stats_" + profileId));
        if (raw) return JSON.parse(raw) as PersistedStats;
    } catch (_) { /* ignore */ }
    return null;
}

function storageSaveStats(profileId: string, stats: PersistedStats): void {
    try {
        localStorage.setItem(storageKey("Stats_" + profileId), JSON.stringify(stats));
    } catch (_) { /* ignore */ }
}

function storageDeleteStats(profileId: string): void {
    try {
        localStorage.removeItem(storageKey("Stats_" + profileId));
    } catch (_) { /* ignore */ }
}

function generateProfileId(): string {
    return "profile-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
}
