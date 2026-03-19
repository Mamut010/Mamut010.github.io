"use strict";
class Collections {
    constructor() { }
    /**
     * Randomly select an item from the given list based on the given weights
     * @template T
     * @param {T[]} items The list of items
     * @param {number[]} weights The corresponding weights for every item
     * @param {() => number} [rng=Math.random] Optional random number generator function that returns a value in the range [0, 1)
     * @returns {T|undefined} The randomly selected item or 'undefined' if the list is empty
     * @throws {Error} If the list's length and number of weights do not match
     */
    static randomItemWeighted(items, weights, rng = Math.random) {
        if (items.length !== weights.length) {
            throw new Error(`Invalid argument: the number of items and number of weights must match`);
        }
        else if (items.length === 0) {
            return undefined;
        }
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let randomWeight = rng() * totalWeight;
        for (let i = 0; i < items.length; i++) {
            randomWeight -= weights[i];
            if (randomWeight < 0) {
                return items[i];
            }
        }
        return undefined;
    }
}
class MathRandomNumberGenerator {
    seed(value) { }
    next() {
        return Math.random();
    }
}
class RewardTreeEdge {
    constructor(source, target, baseWeight, weight) {
        this.source = source;
        this.target = target;
        this.baseWeight = baseWeight;
        this.weight = weight ?? baseWeight;
    }
}
class RewardTreeNode {
    constructor(reward, metadata) {
        this._reward = reward;
        this._outgoingEdges = new Map();
        this._metadata = metadata;
    }
    get reward() {
        return this._reward;
    }
    get metadata() {
        return this._metadata;
    }
    get outgoingEdges() {
        return [...this._outgoingEdges.values()];
    }
    get children() {
        return [...this._outgoingEdges.keys()];
    }
    connect(node, weight) {
        if (this._outgoingEdges.has(node)) {
            return false;
        }
        const edge = new RewardTreeEdge(this, node, weight, weight);
        this._outgoingEdges.set(node, edge);
        return true;
    }
    disconnect(node) {
        return this._outgoingEdges.delete(node);
    }
    getConnection(node) {
        return this._outgoingEdges.get(node);
    }
}
class RewardTree {
    constructor(root) {
        this._root = root;
    }
    get root() {
        return this._root;
    }
}
class BaseEdgeProvider {
    getEdges(node) {
        return node.outgoingEdges;
    }
}
class WeightedUntilLeafTreeWalker {
    constructor(edgeProvider) {
        this.edgeProvider = edgeProvider;
    }
    next(currentNode, executionContext) {
        const edges = this.edgeProvider.getEdges(currentNode);
        if (edges.length === 0) {
            return Promise.resolve(undefined);
        }
        const nextEdge = this.selectEdge(edges, executionContext.rng);
        return Promise.resolve(nextEdge);
    }
    selectEdge(edges, rng) {
        const weights = edges.map(e => e.weight);
        const selectedEdge = Collections.randomItemWeighted(edges, weights, () => rng.next());
        if (!selectedEdge) {
            throw new Error("No edge selected");
        }
        return selectedEdge;
    }
}
class SubtreeRewardCollector {
    collect(node, path, executionContext) {
        const accum = [];
        let currentNodes = [node];
        while (currentNodes.length > 0) {
            const rewards = currentNodes
                .map(n => n.reward)
                .filter(r => r !== undefined);
            accum.push(...rewards);
            currentNodes = currentNodes.flatMap(n => n.children);
        }
        return {
            rewards: accum,
            path,
        };
    }
}
class RewardResolver {
    constructor(walker, collector) {
        this.walker = walker;
        this.collector = collector;
    }
    async resolve(tree, executionContext) {
        let currentNode = tree.root;
        let nextEdge = await this.walker.next(currentNode, executionContext);
        const path = [];
        while (nextEdge) {
            path.push(nextEdge);
            currentNode = nextEdge.target;
            nextEdge = await this.walker.next(currentNode, executionContext);
        }
        const result = this.collector.collect(currentNode, path, executionContext);
        return result;
    }
}
class RewardPipeline {
    constructor(treeFactory, resolver, interceptors = []) {
        this.treeFactory = treeFactory;
        this.resolver = resolver;
        this.interceptors = interceptors;
    }
    setInterceptors(interceptors) {
        this.interceptors = interceptors;
    }
    async invoke(executionContext) {
        const ctx = await this.createExecutionContext(executionContext);
        const next = this.createNextHandler(0);
        return await next(ctx);
    }
    createNextHandler(interceptorIdx) {
        return async (ctx) => {
            if (interceptorIdx < this.interceptors.length) {
                const interceptor = this.interceptors[interceptorIdx];
                const next = this.createNextHandler(interceptorIdx + 1);
                return await interceptor.intercept(ctx, next);
            }
            else {
                return ctx.resolver.resolve(ctx.tree, ctx.exec);
            }
        };
    }
    async createExecutionContext(executionContext) {
        return {
            exec: executionContext,
            tree: await this.treeFactory.create(executionContext),
            resolver: this.resolver,
        };
    }
}
function collectLeaves(nodes) {
    const result = [];
    for (const node of nodes) {
        if (node.isGroup) {
            result.push(...collectLeaves(node.children));
        }
        else {
            result.push(node);
        }
    }
    return result;
}
function collectPityChoices(nodes, indent = "") {
    const result = [];
    for (const node of nodes) {
        if (node.isGroup) {
            result.push({ id: node.id, label: indent + "\u25b6 " + node.name, kind: "group" });
            result.push(...collectPityChoices(node.children, indent + "\u00a0\u00a0"));
        }
        else {
            result.push({ id: node.id, label: indent + node.name, kind: "leaf" });
        }
    }
    return result;
}
function findDefaultPityTarget(nodes, parentProb = 1) {
    const total = nodes.reduce((s, n) => s + n.rate, 0);
    if (total === 0)
        return null;
    let best = null;
    for (const node of nodes) {
        const prob = parentProb * (node.rate / total);
        const candidate = node.isGroup
            ? findDefaultPityTarget(node.children, prob)
            : node;
        const candidateProb = node.isGroup
            ? (node.children.length > 0 ? parentProb * (node.rate / total) * (node.children.reduce((s, n) => s + n.rate, 0) > 0 ? node.children.reduce((min, n) => n.rate < min ? n.rate : min, Infinity) / node.children.reduce((s, n) => s + n.rate, 0) : 0) : 0)
            : prob;
        if (candidate && (!best || prob < best.prob)) {
            best = { config: candidate, prob: candidateProb };
        }
    }
    return best?.config ?? null;
}
function defaultRewardNodes() {
    return [
        {
            id: "rare-group", name: "Rare Tier", rate: 20, isGroup: true,
            color: "", borderColor: "",
            children: [
                { id: "sr", name: "Super Rare", rate: 10, isGroup: false, color: "#f0a830", borderColor: "#f0a830", children: [] },
                { id: "rare", name: "Rare", rate: 90, isGroup: false, color: "#4f8ef7", borderColor: "#4f8ef7", children: [] },
            ],
        },
        { id: "common", name: "Common Reward", rate: 80, isGroup: false, color: "#8b96a5", borderColor: "#444f5a", children: [] },
    ];
}
class Reward {
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }
    static get Empty() {
        return new Reward("__empty__", "");
    }
    equals(other) {
        return this.id === other.id;
    }
}
class DynamicRewardTreeFactory {
    constructor(nodes) {
        this.nodes = nodes;
    }
    async create(executionContext) {
        const root = new RewardTreeNode(Reward.Empty);
        for (const node of this.nodes) {
            root.connect(this.buildNode(node), node.rate);
        }
        return new RewardTree(root);
    }
    buildNode(config) {
        if (!config.isGroup) {
            return new RewardTreeNode(new Reward(config.id, config.name));
        }
        const groupNode = new RewardTreeNode(Reward.Empty);
        for (const child of config.children) {
            groupNode.connect(this.buildNode(child), child.rate);
        }
        return groupNode;
    }
}
class HardPityInterceptor {
    get counter() { return this._counter; }
    setCounter(value) { this._counter = value; }
    get targetName() { return this._target.name; }
    get targetId() { return this._target.id; }
    constructor(_threshold, _target) {
        this._threshold = _threshold;
        this._target = _target;
        this._counter = 0;
    }
    async intercept(ctx, next) {
        const result = await next(ctx);
        if (this._isHit(result)) {
            this._counter = 0;
            return result;
        }
        if (this._counter + 1 < this._threshold) {
            this._counter++;
            return result;
        }
        this._counter = 0;
        return this._forcePity(ctx);
    }
    _isHit(result) {
        const leafIds = new Set(collectLeaves([this._target]).map(l => l.id));
        return result.rewards.some(r => leafIds.has(r.id));
    }
    async _forcePity(ctx) {
        const pityConfig = { ...this._target, rate: 100 };
        const pityTree = await new DynamicRewardTreeFactory([pityConfig]).create(ctx.exec);
        return ctx.resolver.resolve(pityTree, ctx.exec);
    }
}
function buildPipeline(nodes, pityEnabled, pityThreshold, pityTargetConfig) {
    const treeFactory = new DynamicRewardTreeFactory(nodes);
    const walker = new WeightedUntilLeafTreeWalker(new BaseEdgeProvider());
    const collector = new SubtreeRewardCollector();
    const resolver = new RewardResolver(walker, collector);
    const pipeline = new RewardPipeline(treeFactory, resolver);
    let pityInterceptor = null;
    if (pityEnabled) {
        const targetConfig = pityTargetConfig ?? findDefaultPityTarget(nodes);
        if (targetConfig) {
            pityInterceptor = new HardPityInterceptor(pityThreshold, targetConfig);
            pipeline.setInterceptors([pityInterceptor]);
        }
    }
    return { pipeline, pityInterceptor };
}
function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ===== Storage =====
const STORAGE_PREFIX = "REWARDER_";
function storageKey(suffix) {
    return STORAGE_PREFIX + suffix;
}
function storageLoadProfiles() {
    try {
        const raw = localStorage.getItem(storageKey("Profiles"));
        if (raw)
            return JSON.parse(raw);
    }
    catch (_) { /* ignore */ }
    return [];
}
function storageSaveProfiles(profiles) {
    try {
        localStorage.setItem(storageKey("Profiles"), JSON.stringify(profiles));
    }
    catch (_) { /* ignore */ }
}
function storageLoadActiveProfileId() {
    try {
        return localStorage.getItem(storageKey("ActiveProfileId"));
    }
    catch (_) { /* ignore */ }
    return null;
}
function storageSaveActiveProfileId(id) {
    try {
        localStorage.setItem(storageKey("ActiveProfileId"), id);
    }
    catch (_) { /* ignore */ }
}
function storageLoadStats(profileId) {
    try {
        const raw = localStorage.getItem(storageKey("Stats_" + profileId));
        if (raw)
            return JSON.parse(raw);
    }
    catch (_) { /* ignore */ }
    return null;
}
function storageSaveStats(profileId, stats) {
    try {
        localStorage.setItem(storageKey("Stats_" + profileId), JSON.stringify(stats));
    }
    catch (_) { /* ignore */ }
}
function storageDeleteStats(profileId) {
    try {
        localStorage.removeItem(storageKey("Stats_" + profileId));
    }
    catch (_) { /* ignore */ }
}
function generateProfileId() {
    return "profile-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
}
// ===== App =====
class RewarderApp {
    constructor() {
        this.rewardNodes = defaultRewardNodes();
        this.pityEnabled = true;
        this.pityThreshold = 90;
        this.pityTargetId = null;
        this.nextId = 1;
        this.totalRolls = 0;
        this.rewardCounts = new Map();
        this.history = [];
        this.pityInterceptor = null;
        this.rng = new MathRandomNumberGenerator();
        this.isRolling = false;
        this.profiles = [];
        this.activeProfileId = "";
        this._initialized = false;
    }
    init() {
        this.loadState();
        this._initialized = true;
        this.bindStaticEvents();
        this.renderAll();
    }
    rebuildPipeline() {
        // Invalidate stale target id
        if (this.pityTargetId !== null && !this.findNode(this.pityTargetId, this.rewardNodes)) {
            this.pityTargetId = null;
        }
        const targetConfig = this.pityTargetId
            ? (this.findNode(this.pityTargetId, this.rewardNodes) ?? null)
            : null;
        const { pipeline, pityInterceptor } = buildPipeline(this.rewardNodes, this.pityEnabled, this.pityThreshold, targetConfig);
        this.pipeline = pipeline;
        this.pityInterceptor = pityInterceptor;
        // Sync pityTargetId to whatever was actually chosen (handles first run auto-pick)
        if (this.pityInterceptor) {
            this.pityTargetId = this.pityInterceptor.targetId;
        }
        this.saveProfileConfig();
    }
    findNode(id, nodes) {
        for (const node of nodes) {
            if (node.id === id)
                return node;
            if (node.isGroup) {
                const found = this.findNode(id, node.children);
                if (found)
                    return found;
            }
        }
        return undefined;
    }
    validateTree(nodes) {
        if (nodes.length === 0)
            return false;
        const sum = nodes.reduce((s, n) => s + n.rate, 0);
        if (Math.abs(sum - 100) >= 0.001)
            return false;
        for (const n of nodes) {
            if (n.rate < 0)
                return false;
            if (n.isGroup && !this.validateTree(n.children))
                return false;
        }
        return true;
    }
    isRateValid() {
        return this.validateTree(this.rewardNodes);
    }
    rootTotalRate() {
        return this.rewardNodes.reduce((s, n) => s + n.rate, 0);
    }
    // ===== Events =====
    bindStaticEvents() {
        const pityToggle = document.getElementById("pity-toggle");
        const pityThreshInput = document.getElementById("pity-threshold");
        pityToggle.addEventListener("change", () => {
            this.pityEnabled = pityToggle.checked;
            const pityDisplay = this.pityEnabled ? "flex" : "none";
            const row = document.getElementById("pity-config-row");
            if (row)
                row.style.display = pityDisplay;
            const trow = document.getElementById("pity-target-row");
            if (trow)
                trow.style.display = pityDisplay;
            this.rebuildPipeline();
            this.renderPityProgress();
        });
        pityThreshInput.addEventListener("change", () => {
            this.pityThreshold = Math.max(1, parseInt(pityThreshInput.value) || 1);
            pityThreshInput.value = String(this.pityThreshold);
            this.rebuildPipeline();
            this.renderPityProgress();
        });
        document.getElementById("btn-roll").addEventListener("click", () => this.doRolls(1));
        document.getElementById("btn-roll-10").addEventListener("click", () => this.doRolls(10));
        document.getElementById("btn-roll-100").addEventListener("click", () => this.doRolls(100));
        document.getElementById("btn-reset").addEventListener("click", () => this.resetStats());
        document.getElementById("btn-add-leaf").addEventListener("click", () => this.addRootLeaf());
        document.getElementById("btn-add-group").addEventListener("click", () => this.addRootGroup());
        const pityTargetSel = document.getElementById("pity-target");
        if (pityTargetSel) {
            pityTargetSel.addEventListener("change", () => {
                this.pityTargetId = pityTargetSel.value || null;
                this.rebuildPipeline();
                this.renderPityTargetPicker();
                this.renderPityProgress();
            });
        }
        const profileSel = document.getElementById("profile-select");
        if (profileSel) {
            profileSel.addEventListener("change", () => this.switchProfile(profileSel.value));
        }
        document.getElementById("btn-new-profile")?.addEventListener("click", () => this.newProfile());
        document.getElementById("btn-delete-profile")?.addEventListener("click", () => this.deleteProfile(this.activeProfileId));
        const profileNameInput = document.getElementById("profile-name");
        if (profileNameInput) {
            profileNameInput.addEventListener("change", () => this.renameProfile(profileNameInput.value.trim()));
        }
        this.bindRewardListEvents();
    }
    bindRewardListEvents() {
        const list = document.getElementById("reward-list");
        if (!list)
            return;
        list.addEventListener("input", (e) => {
            const target = e.target;
            const treeNode = target.closest(".tree-node");
            if (!treeNode)
                return;
            const node = this.findNode(treeNode.dataset.id, this.rewardNodes);
            if (!node)
                return;
            if (target.classList.contains("reward-rate-input")) {
                const raw = parseFloat(target.value);
                node.rate = isNaN(raw) ? 0 : Math.max(0, raw);
                target.value = String(node.rate);
                this.updateEffectiveRatesInPlace();
                this.updateRateSummary();
                this.rebuildPipeline();
            }
            else if (target.classList.contains("reward-color-input")) {
                node.color = target.value;
                this.saveProfileConfig();
                this.renderStats();
                this.renderHistory();
            }
            else if (target.classList.contains("reward-border-input")) {
                node.borderColor = target.value;
                this.saveProfileConfig();
                this.renderStats();
                this.renderHistory();
            }
        });
        list.addEventListener("change", (e) => {
            const target = e.target;
            const treeNode = target.closest(".tree-node");
            if (!treeNode)
                return;
            const node = this.findNode(treeNode.dataset.id, this.rewardNodes);
            if (!node)
                return;
            if (target.classList.contains("reward-name-input")) {
                node.name = target.value.trim() || (node.isGroup ? "Group" : "Reward");
                this.rebuildPipeline();
            }
        });
        list.addEventListener("click", (e) => {
            const target = e.target;
            if (target.closest(".btn-delete-reward")) {
                const treeNode = target.closest(".tree-node");
                if (treeNode)
                    this.removeNode(treeNode.dataset.id);
            }
            else if (target.closest(".btn-add-child")) {
                const treeNode = target.closest(".tree-node.tree-group");
                if (treeNode)
                    this.addChildToGroup(treeNode.dataset.id);
            }
        });
    }
    addRootLeaf() {
        const id = `leaf-${this.nextId++}`;
        this.rewardNodes.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color: "#c084fc", borderColor: "#c084fc", children: [],
        });
        this.afterEdit(id);
    }
    addRootGroup() {
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
        this.afterEdit(gid);
    }
    addChildToGroup(groupId) {
        const group = this.findNode(groupId, this.rewardNodes);
        if (!group || !group.isGroup)
            return;
        const id = `leaf-${this.nextId++}`;
        group.children.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color: "#c084fc", borderColor: "#c084fc", children: [],
        });
        this.afterEdit(id);
    }
    afterEdit(focusId) {
        this.rebuildPipeline();
        this.renderRewardEditor();
        this.updateRateSummary();
        const input = document.querySelector(`.tree-node[data-id="${focusId}"] .reward-name-input`);
        input?.focus();
        input?.select();
    }
    removeNode(id) {
        if (this.rewardNodes.length > 1) {
            const idx = this.rewardNodes.findIndex(n => n.id === id);
            if (idx !== -1) {
                this.rewardNodes.splice(idx, 1);
                this.rebuildPipeline();
                this.renderRewardEditor();
                this.updateRateSummary();
                return;
            }
        }
        for (const group of this.rewardNodes) {
            if (!group.isGroup)
                continue;
            if (group.children.length > 1) {
                const idx = group.children.findIndex(n => n.id === id);
                if (idx !== -1) {
                    group.children.splice(idx, 1);
                    this.rebuildPipeline();
                    this.renderRewardEditor();
                    this.updateRateSummary();
                    return;
                }
            }
        }
    }
    // ===== Rolls =====
    async doRolls(count) {
        if (this.isRolling || !this.isRateValid())
            return;
        this.isRolling = true;
        this.setRollButtonsDisabled(true);
        const ANIMATED_MAX = 10;
        const animate = count <= ANIMATED_MAX;
        for (let i = 0; i < count; i++) {
            const result = await this.pipeline.invoke({ rng: this.rng });
            const reward = result.rewards[0] ?? new Reward("unknown", "Unknown");
            const rollNum = ++this.totalRolls;
            this.rewardCounts.set(reward.id, (this.rewardCounts.get(reward.id) ?? 0) + 1);
            this.history.unshift({ rollNum, reward });
            if (this.history.length > 200)
                this.history.pop();
            if (animate) {
                this.renderLatestResult(reward, rollNum);
                this.renderStats();
                this.renderPityProgress();
                if (i < count - 1)
                    await sleep(130);
            }
        }
        if (!animate && this.history.length > 0) {
            const last = this.history[0];
            this.renderLatestResult(last.reward, last.rollNum);
            this.renderStats();
            this.renderPityProgress();
        }
        this.renderHistory();
        this.saveCurrentStats();
        this.isRolling = false;
        this.setRollButtonsDisabled(false);
    }
    setRollButtonsDisabled(disabled) {
        ["btn-roll", "btn-roll-10", "btn-roll-100"].forEach(id => {
            const btn = document.getElementById(id);
            if (btn)
                btn.disabled = disabled;
        });
    }
    resetStats() {
        this.totalRolls = 0;
        this.rewardCounts = new Map();
        this.history = [];
        this.rebuildPipeline();
        this.renderLatestResult(null, 0);
        this.renderStats();
        this.renderPityProgress();
        this.renderHistory();
        this.saveCurrentStats();
    }
    // ===== Profiles & Persistence =====
    loadState() {
        let profiles = storageLoadProfiles();
        let activeId = storageLoadActiveProfileId();
        if (profiles.length === 0) {
            const firstProfile = {
                id: generateProfileId(),
                name: "Default",
                nodes: defaultRewardNodes(),
                pityEnabled: true,
                pityThreshold: 90,
                pityTargetId: null,
                nextId: 1,
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
            if (this.pityInterceptor)
                this.pityInterceptor.setCounter(stats.pityCounter);
        }
    }
    applyProfile(profile) {
        this.rewardNodes = profile.nodes;
        this.pityEnabled = profile.pityEnabled;
        this.pityThreshold = profile.pityThreshold;
        this.pityTargetId = profile.pityTargetId;
        this.nextId = profile.nextId;
    }
    applyStats(stats) {
        this.totalRolls = stats.totalRolls;
        this.rewardCounts = new Map(Object.entries(stats.rewardCounts));
        this.history = stats.history.map(h => ({
            rollNum: h.rollNum,
            reward: new Reward(h.rewardId, h.rewardName),
        }));
    }
    saveProfileConfig() {
        const idx = this.profiles.findIndex(p => p.id === this.activeProfileId);
        if (idx === -1)
            return;
        this.profiles[idx] = {
            ...this.profiles[idx],
            nodes: this.rewardNodes,
            pityEnabled: this.pityEnabled,
            pityThreshold: this.pityThreshold,
            pityTargetId: this.pityTargetId,
            nextId: this.nextId,
        };
        storageSaveProfiles(this.profiles);
    }
    saveCurrentStats() {
        const stats = {
            totalRolls: this.totalRolls,
            rewardCounts: Object.fromEntries(this.rewardCounts),
            history: this.history.map(h => ({
                rollNum: h.rollNum,
                rewardId: h.reward.id,
                rewardName: h.reward.name,
            })),
            pityCounter: this.pityInterceptor?.counter ?? 0,
        };
        storageSaveStats(this.activeProfileId, stats);
    }
    switchProfile(id) {
        if (id === this.activeProfileId)
            return;
        const profile = this.profiles.find(p => p.id === id);
        if (!profile)
            return;
        this.saveCurrentStats();
        this.activeProfileId = id;
        storageSaveActiveProfileId(id);
        this.totalRolls = 0;
        this.rewardCounts = new Map();
        this.history = [];
        this.applyProfile(profile);
        this.rebuildPipeline();
        const stats = storageLoadStats(id);
        if (stats) {
            this.applyStats(stats);
            if (this.pityInterceptor)
                this.pityInterceptor.setCounter(stats.pityCounter);
        }
        this.renderAll();
    }
    newProfile() {
        this.saveCurrentStats();
        const num = this.profiles.length + 1;
        const profile = {
            id: generateProfileId(),
            name: "Profile " + num,
            nodes: defaultRewardNodes(),
            pityEnabled: true,
            pityThreshold: 90,
            pityTargetId: null,
            nextId: 1,
        };
        this.profiles.push(profile);
        storageSaveProfiles(this.profiles);
        this.activeProfileId = profile.id;
        storageSaveActiveProfileId(profile.id);
        this.totalRolls = 0;
        this.rewardCounts = new Map();
        this.history = [];
        this.applyProfile(profile);
        this.rebuildPipeline();
        this.renderAll();
    }
    deleteProfile(id) {
        if (this.profiles.length <= 1)
            return;
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx === -1)
            return;
        storageDeleteStats(id);
        this.profiles.splice(idx, 1);
        storageSaveProfiles(this.profiles);
        if (this.activeProfileId === id) {
            const next = this.profiles[Math.max(0, idx - 1)];
            this.activeProfileId = next.id;
            storageSaveActiveProfileId(next.id);
            this.totalRolls = 0;
            this.rewardCounts = new Map();
            this.history = [];
            this.applyProfile(next);
            this.rebuildPipeline();
            const stats = storageLoadStats(next.id);
            if (stats) {
                this.applyStats(stats);
                if (this.pityInterceptor)
                    this.pityInterceptor.setCounter(stats.pityCounter);
            }
            this.renderAll();
        }
        else {
            this.renderProfilePicker();
        }
    }
    renameProfile(name) {
        const idx = this.profiles.findIndex(p => p.id === this.activeProfileId);
        if (idx === -1)
            return;
        this.profiles[idx].name = name || "Profile";
        storageSaveProfiles(this.profiles);
        this.renderProfilePicker();
    }
    renderProfilePicker() {
        const sel = document.getElementById("profile-select");
        if (sel) {
            sel.innerHTML = this.profiles
                .map(p => `<option value="${p.id}"${p.id === this.activeProfileId ? " selected" : ""}>${escapeHtml(p.name)}</option>`)
                .join("");
        }
        const nameInput = document.getElementById("profile-name");
        if (nameInput) {
            const active = this.profiles.find(p => p.id === this.activeProfileId);
            nameInput.value = active?.name ?? "";
        }
        const delBtn = document.getElementById("btn-delete-profile");
        if (delBtn)
            delBtn.disabled = this.profiles.length <= 1;
    }
    // ===== Renders =====
    renderAll() {
        const pityDisplay = this.pityEnabled ? "flex" : "none";
        const row = document.getElementById("pity-config-row");
        if (row)
            row.style.display = pityDisplay;
        const trow = document.getElementById("pity-target-row");
        if (trow)
            trow.style.display = pityDisplay;
        this.renderProfilePicker();
        this.renderRewardEditor();
        this.updateRateSummary();
        this.renderLatestResult(null, 0);
        this.renderStats();
        this.renderPityProgress();
        this.renderHistory();
    }
    updateEffectiveRatesInPlace() {
        for (const node of this.rewardNodes) {
            if (!node.isGroup)
                continue;
            for (const child of node.children) {
                const effEl = document.querySelector(`.tree-node[data-id="${child.id}"] .eff-rate`);
                if (effEl)
                    effEl.textContent = `${(node.rate * child.rate / 100).toFixed(2)}%`;
            }
        }
    }
    renderRewardEditor() {
        const list = document.getElementById("reward-list");
        if (!list)
            return;
        list.innerHTML = this.rewardNodes.map(node => this.renderRootNode(node)).join("");
        this.renderPityTargetPicker();
    }
    renderRootNode(node) {
        const canDelete = this.rewardNodes.length > 1;
        return node.isGroup
            ? this.renderGroupNode(node, canDelete)
            : this.renderLeafNode(node, null, canDelete);
    }
    renderPityTargetPicker() {
        const sel = document.getElementById("pity-target");
        if (!sel)
            return;
        const choices = collectPityChoices(this.rewardNodes);
        sel.innerHTML = choices
            .map(c => `<option value="${c.id}"${c.id === this.pityTargetId ? " selected" : ""}>${escapeHtml(c.label)}</option>`)
            .join("");
    }
    renderGroupNode(group, canDelete) {
        const childrenHtml = group.children
            .map(child => this.renderLeafNode(child, group.id, group.children.length > 1, group.rate))
            .join("");
        const childSum = group.children.reduce((s, c) => s + c.rate, 0);
        const childOk = group.children.length > 0 && Math.abs(childSum - 100) < 0.001;
        return `
            <div class="tree-node tree-group" data-id="${group.id}">
                <div class="reward-config-row group-row">
                    <span class="group-icon">&#x229e;</span>
                    <input type="text" class="reward-name-input" value="${escapeHtml(group.name)}" placeholder="Group name">
                    <div class="reward-rate-group">
                        <input type="number" class="reward-rate-input" value="${group.rate}" min="0" max="100" step="0.01">
                        <span class="rate-unit">%</span>
                    </div>
                    <button class="btn-add-child" title="Add reward to group">+</button>
                    <button class="btn-delete-reward" title="Remove group"${canDelete ? "" : " disabled"}>&#xd7;</button>
                </div>
                <div class="group-children">
                    ${childrenHtml}
                    <div class="group-rate-summary ${childOk ? "rate-ok" : "rate-warn"}">\u03a3 ${childSum.toFixed(2)}% ${childOk ? "\u2713" : "\u26a0"}</div>
                </div>
            </div>`;
    }
    renderLeafNode(leaf, parentId, canDelete, groupRate) {
        const effHtml = groupRate !== undefined
            ? `<span class="eff-rate">${(groupRate * leaf.rate / 100).toFixed(2)}%</span>`
            : "";
        return `
            <div class="tree-node tree-leaf" data-id="${leaf.id}"${parentId ? ` data-parent="${parentId}"` : ""}>
                <div class="reward-config-row leaf-row">
                    <div class="color-swatches">
                        <input type="color" class="color-swatch reward-color-input" value="${leaf.color}" title="Text color">
                        <input type="color" class="color-swatch reward-border-input" value="${leaf.borderColor}" title="Border color">
                    </div>
                    <input type="text" class="reward-name-input" value="${escapeHtml(leaf.name)}" placeholder="Name">
                    <div class="reward-rate-group">
                        <input type="number" class="reward-rate-input" value="${leaf.rate}" min="0" max="100" step="0.01">
                        <span class="rate-unit">%</span>${effHtml}
                    </div>
                    <button class="btn-delete-reward" title="Remove"${canDelete ? "" : " disabled"}>&#xd7;</button>
                </div>
            </div>`;
    }
    updateRateSummary() {
        const rootTotal = this.rootTotalRate();
        const totalEl = document.getElementById("total-rate");
        if (totalEl)
            totalEl.textContent = rootTotal.toFixed(2);
        const valid = this.isRateValid();
        const warning = document.getElementById("rate-warning");
        if (warning)
            warning.style.display = valid ? "none" : "inline";
        for (const group of this.rewardNodes) {
            if (!group.isGroup)
                continue;
            const sumEl = document.querySelector(`.tree-node[data-id="${group.id}"] .group-rate-summary`);
            if (!sumEl)
                continue;
            const childSum = group.children.reduce((s, c) => s + c.rate, 0);
            const ok = group.children.length > 0 && Math.abs(childSum - 100) < 0.001;
            sumEl.textContent = `\u03a3 ${childSum.toFixed(2)}% ${ok ? "\u2713" : "\u26a0"}`;
            sumEl.className = `group-rate-summary ${ok ? "rate-ok" : "rate-warn"}`;
        }
        this.setRollButtonsDisabled(!valid || this.isRolling);
    }
    renderLatestResult(reward, rollNum) {
        const container = document.getElementById("latest-result");
        if (!container)
            return;
        if (!reward) {
            container.innerHTML = `<div class="idle-msg">Roll to get started!</div>`;
            return;
        }
        const cfg = this.findNode(reward.id, this.rewardNodes);
        const color = cfg?.color ?? "#eee";
        const borderColor = cfg?.borderColor ?? "#444";
        container.innerHTML = `
            <div class="reward-card" style="--rarity-color:${borderColor};--text-color:${color}">
                <div class="reward-name">${escapeHtml(reward.name)}</div>
                <div class="reward-roll-num">Roll #${rollNum}</div>
            </div>
        `;
        const card = container.querySelector(".reward-card");
        if (card) {
            void card.offsetWidth;
            card.classList.add("pop-in");
        }
    }
    renderStats() {
        const total = this.totalRolls;
        const totalEl = document.getElementById("stat-total");
        if (totalEl)
            totalEl.textContent = String(total);
        const container = document.getElementById("stats-rows");
        if (!container)
            return;
        container.innerHTML = collectLeaves(this.rewardNodes).map(leaf => {
            const count = this.rewardCounts.get(leaf.id) ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return `
                <div class="stat-row">
                    <div class="stat-label" style="color:${leaf.color}">${escapeHtml(leaf.name)}</div>
                    <div class="stat-bar-track">
                        <div class="stat-bar" style="width:${pct}%;background-color:${leaf.borderColor}"></div>
                    </div>
                    <div class="stat-values">
                        <span class="stat-count">${count}</span>
                        <span class="stat-pct">${pct.toFixed(1)}%</span>
                    </div>
                </div>
            `;
        }).join("");
    }
    renderPityProgress() {
        const section = document.getElementById("pity-section");
        if (!section)
            return;
        if (!this.pityEnabled || !this.pityInterceptor) {
            section.style.display = "none";
            return;
        }
        section.style.display = "block";
        const counter = this.pityInterceptor.counter;
        const threshold = this.pityThreshold;
        const pct = Math.min(100, (counter / threshold) * 100);
        const urgency = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";
        const targetName = this.pityInterceptor?.targetName ?? "—";
        const countEl = document.getElementById("pity-count");
        const thresholdEl = document.getElementById("pity-threshold-display");
        const targetEl = document.getElementById("pity-target-name");
        const barEl = document.getElementById("pity-bar");
        if (countEl)
            countEl.textContent = String(counter);
        if (thresholdEl)
            thresholdEl.textContent = String(threshold);
        if (targetEl)
            targetEl.textContent = targetName;
        if (barEl) {
            barEl.style.width = `${pct}%`;
            barEl.style.backgroundColor = urgency;
        }
    }
    renderHistory() {
        const container = document.getElementById("history-log");
        if (!container)
            return;
        if (this.history.length === 0) {
            container.innerHTML = `<div class="history-empty">No rolls yet</div>`;
            return;
        }
        container.innerHTML = this.history.slice(0, 60).map(entry => {
            const cfg = this.findNode(entry.reward.id, this.rewardNodes);
            const color = cfg?.color ?? "#eee";
            const borderColor = cfg?.borderColor ?? "#555";
            return `
                <div class="history-entry" style="border-left-color:${borderColor}">
                    <span class="history-num">#${entry.rollNum}</span>
                    <span class="history-reward" style="color:${color}">${escapeHtml(entry.reward.name)}</span>
                </div>
            `;
        }).join("");
    }
}
document.addEventListener("DOMContentLoaded", () => {
    new RewarderApp().init();
});
