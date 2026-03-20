"use strict";
// ===== IRewardColorProvider =====
// Provides colors for newly created reward nodes.
// ===== CyclingColorProvider =====
// Cycles through a fixed palette of visually distinct colors,
// assigning a new one to each newly created reward node.
class CyclingColorProvider {
    constructor() {
        this._index = 0;
    }
    next() {
        const color = CyclingColorProvider.PALETTE[this._index];
        this._index = (this._index + 1) % CyclingColorProvider.PALETTE.length;
        return color;
    }
}
CyclingColorProvider.PALETTE = [
    "#c084fc", // purple
    "#f472b6", // pink
    "#fb923c", // orange
    "#facc15", // yellow
    "#4ade80", // green
    "#34d399", // emerald
    "#38bdf8", // sky
    "#818cf8", // indigo
    "#f87171", // red
    "#a3e635", // lime
    "#2dd4bf", // teal
    "#e879f9", // fuchsia
];
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
class RewardUtils {
    constructor() { }
    static containsResultRecursive(nodes, result) {
        const leafIds = new Set(collectLeaves(nodes).map(l => l.id));
        return result.rewards.some(r => leafIds.has(r.id));
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
            return undefined;
        }
        const edge = new RewardTreeEdge(this, node, weight);
        this._outgoingEdges.set(node, edge);
        return edge;
    }
    disconnect(node) {
        return this._outgoingEdges.delete(node);
    }
    disconnectAll() {
        this._outgoingEdges.clear();
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
                return this.resolver.resolve(ctx.tree, ctx.exec);
            }
        };
    }
    async createExecutionContext(executionContext) {
        return {
            exec: executionContext,
            tree: await this.treeFactory.create(executionContext),
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
        { id: "common", name: "Common", rate: 80, isGroup: false, color: "#8b96a5", borderColor: "#444f5a", children: [] },
    ];
}
class Reward {
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }
    equals(other) {
        return this.id === other.id;
    }
}
class RewardTreeFactory {
    constructor(nodes) {
        this.nodes = nodes;
    }
    async create(executionContext) {
        const root = new RewardTreeNode();
        for (const node of this.nodes) {
            root.connect(this.buildNode(node), node.rate);
        }
        return new RewardTree(root);
    }
    buildNode(config) {
        const metadata = { id: config.id };
        if (!config.isGroup) {
            return new RewardTreeNode(new Reward(config.id, config.name), metadata);
        }
        const groupNode = new RewardTreeNode(undefined, metadata);
        for (const child of config.children) {
            groupNode.connect(this.buildNode(child), child.rate);
        }
        return groupNode;
    }
}
function buildPipeline(params) {
    const { nodes, pityEnabled, pityThreshold, pityTargetConfig, stdPityEnabled, stdPityThreshold, stdPityNodes, featuredPityEnabled, featuredPityThreshold, featuredPityGroupConfig, featuredPityFeaturedConfig, } = params;
    const treeFactory = new RewardTreeFactory(nodes);
    const walker = new WeightedUntilLeafTreeWalker(new BaseEdgeProvider());
    const collector = new SubtreeRewardCollector();
    const resolver = new RewardResolver(walker, collector);
    const pipeline = new RewardPipeline(treeFactory, resolver);
    let pityInterceptor = null;
    let stdPityInterceptor = null;
    let featuredPityInterceptor = null;
    if (featuredPityEnabled && featuredPityGroupConfig !== null && featuredPityFeaturedConfig !== null) {
        featuredPityInterceptor = new FeaturedPityInterceptor(featuredPityThreshold, featuredPityGroupConfig, featuredPityFeaturedConfig);
    }
    if (stdPityEnabled && stdPityNodes.length > 0) {
        const stdTotal = stdPityNodes.reduce((s, n) => s + n.rate, 0);
        if (Math.abs(stdTotal - 100) < 0.001) {
            stdPityInterceptor = new StandardPityInterceptor(stdPityThreshold, stdPityNodes);
        }
    }
    if (pityEnabled) {
        const targetConfig = pityTargetConfig ?? findDefaultPityTarget(nodes);
        if (targetConfig) {
            pityInterceptor = new HardPityInterceptor(pityThreshold, targetConfig);
        }
    }
    // Featured first (patches group children), then Standard (may override the whole tree),
    // then Hard (forces a specific node within whatever tree is active).
    const interceptors = [];
    if (featuredPityInterceptor)
        interceptors.push(featuredPityInterceptor);
    if (stdPityInterceptor)
        interceptors.push(stdPityInterceptor);
    if (pityInterceptor)
        interceptors.push(pityInterceptor);
    pipeline.setInterceptors(interceptors);
    return { pipeline, pityInterceptor, stdPityInterceptor, featuredPityInterceptor };
}
// ===== Base Pity Interceptor =====
// Abstract base class that encapsulates the shared pity-trigger logic:
//   - roll counter with public getter / setter (for persistence)
//   - threshold check → force-pity branch
//   - natural-hit auto-reset
//
// Subclasses implement the two template methods:
//   _isHit()       — decides whether a result counts as a natural pity hit
//   _buildPityTree() — constructs the reward tree used for the forced pull
class BaseRollCountingPityInterceptor {
    get counter() { return this._counter; }
    setCounter(value) { this._counter = value; }
    constructor(_threshold) {
        this._threshold = _threshold;
        this._counter = 0;
    }
    async intercept(ctx, next) {
        this._counter++;
        if (this._counter >= this._threshold) {
            this._counter = 0;
            return await this._forcePity(ctx, next);
        }
        const result = await next(ctx);
        if (this._counter > 0 && this._isHit(result)) {
            this._counter = 0;
        }
        return result;
    }
    async _forcePity(ctx, next) {
        ctx.tree = await this._buildPityTree(ctx);
        return await next(ctx);
    }
}
class HardPityInterceptor extends BaseRollCountingPityInterceptor {
    get targetName() { return this._target.name; }
    get targetId() { return this._target.id; }
    constructor(threshold, _target) {
        super(threshold);
        this._target = _target;
    }
    _isHit(result) {
        return RewardUtils.containsResultRecursive([this._target], result);
    }
    async _buildPityTree(ctx) {
        const pityConfig = { ...this._target, rate: 100 };
        return await new RewardTreeFactory([pityConfig]).create(ctx.exec);
    }
}
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
    constructor(threshold, _pityNodes) {
        super(threshold);
        this._pityNodes = _pityNodes;
    }
    // If a reward from the pity pool was obtained naturally, reset the counter.
    _isHit(result) {
        return RewardUtils.containsResultRecursive(this._pityNodes, result);
    }
    async _buildPityTree(ctx) {
        return await new RewardTreeFactory(this._pityNodes).create(ctx.exec);
    }
}
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
class FeaturedPityInterceptor {
    get counter() { return this._counter; }
    setCounter(value) { this._counter = value; }
    get groupId() { return this._group.id; }
    get groupName() { return this._group.name; }
    get featuredId() { return this._featured.id; }
    get featuredName() { return this._featured.name; }
    constructor(_threshold, _group, _featured) {
        this._threshold = _threshold;
        this._group = _group;
        this._featured = _featured;
        this._counter = 0;
    }
    async intercept(ctx, next) {
        const isOwed = this._isOwed();
        if (isOwed) {
            this._applyOverride(ctx);
        }
        const result = await next(ctx);
        const hitFeatured = result.rewards.some(r => r.id === this._featured.id);
        const hitGroup = result.path.some(e => e.target.metadata?.["id"] === this._group.id);
        if (hitFeatured) {
            // Featured reward obtained (naturally or via override) → reset.
            this._counter = 0;
        }
        else if (hitGroup && !isOwed) {
            // Non-featured group entry on a normal (non-owed) roll → accumulate.
            this._counter++;
        }
        // If owed but group was not entered this roll, the guarantee carries over (counter unchanged).
        return result;
    }
    _isOwed() {
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
    _applyOverride(ctx) {
        const groupNode = this._findGroupNode(ctx.tree.root);
        if (!groupNode)
            return;
        groupNode.disconnectAll();
        groupNode.connect(new RewardTreeNode(new Reward(this._featured.id, this._featured.name)), 100);
    }
    /** DFS search for the node whose metadata.id matches the configured group id. */
    _findGroupNode(node) {
        for (const child of node.children) {
            if (child.metadata?.["id"] === this._group.id) {
                return child;
            }
            const found = this._findGroupNode(child);
            if (found)
                return found;
        }
        return undefined;
    }
}
function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** Formats a rate number, showing up to 4 decimal places with trailing zeros stripped. */
function formatRate(n) {
    return parseFloat(n.toFixed(4)).toString();
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
// ===== Wheel Drawer =====
/** Canvas 2D implementation of ISpinningWheelDrawer. */
class CanvasWheelDrawer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }
    draw(rotation, segments, segAngles) {
        const { canvas, ctx } = this;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const r = Math.min(cx, cy) * 0.88; // leave room for the pointer above the wheel
        ctx.clearRect(0, 0, W, H);
        if (segments.length === 0) {
            // Empty placeholder ring
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.strokeStyle = "#2a2a5a";
            ctx.lineWidth = Math.max(1, r * 0.015);
            ctx.stroke();
            this.drawPointer(cx, cy, r);
            return;
        }
        const offset = -Math.PI / 2; // rotate so angle 0 points to the top
        // ── Filled segments ───────────────────────────────────────────────────
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const angles = segAngles[i];
            const startA = angles.start + rotation + offset;
            const endA = startA + angles.sweep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startA, endA);
            ctx.closePath();
            ctx.fillStyle = seg.borderColor || "#334155";
            ctx.fill();
            // Subtle sheen so dark colours remain distinguishable
            ctx.fillStyle = "rgba(255,255,255,0.06)";
            ctx.fill();
            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth = Math.max(1, r * 0.011);
            ctx.stroke();
        }
        // ── Text labels ───────────────────────────────────────────────────────
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const angles = segAngles[i];
            const midA = angles.mid + rotation + offset;
            const txtR = r * 0.62;
            const arcLen = angles.sweep * txtR; // arc length at label radius
            // Font size adapts to canvas size and available arc length
            const fontSize = Math.max(r * 0.05, Math.min(r * 0.098, arcLen * 0.45));
            const maxChars = Math.floor(arcLen / (fontSize * 0.62));
            if (maxChars < 1)
                continue;
            let label = seg.name;
            if (label.length > maxChars) {
                label = maxChars >= 2 ? label.slice(0, maxChars - 1) + "\u2026" : label.slice(0, 1);
            }
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(midA);
            ctx.translate(txtR, 0);
            ctx.font = `bold ${fontSize}px "clear sans", Arial, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = Math.max(2, r * 0.03);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(label, 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        }
        // ── Outer ring ────────────────────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "#4a4a8a";
        ctx.lineWidth = Math.max(1, r * 0.023);
        ctx.stroke();
        // ── Center cap ────────────────────────────────────────────────────────
        const capR = r * 0.10;
        ctx.beginPath();
        ctx.arc(cx, cy, capR, 0, 2 * Math.PI);
        ctx.fillStyle = "#0f172a";
        ctx.fill();
        ctx.strokeStyle = "#c084fc";
        ctx.lineWidth = Math.max(1, r * 0.015);
        ctx.stroke();
        this.drawPointer(cx, cy, r);
    }
    drawPointer(cx, cy, r) {
        const ctx = this.ctx;
        const ph = Math.max(8, r * 0.098); // pointer height
        const pw = Math.max(5, r * 0.068); // pointer half-width
        const tipY = cy - r - Math.max(1, r * 0.015); // tip just above the outer ring
        const baseY = tipY - ph;
        ctx.beginPath();
        ctx.moveTo(cx, tipY);
        ctx.lineTo(cx - pw, baseY);
        ctx.lineTo(cx + pw, baseY);
        ctx.closePath();
        ctx.shadowColor = "rgba(192,132,252,0.7)";
        ctx.shadowBlur = Math.max(4, r * 0.076);
        ctx.fillStyle = "#c084fc";
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}
// ===== Wheel Spin Animator =====
/**
 * Unified single-pass animator.
 *
 * When a correctionDelta is present (overshoot / undershoot), the position is
 * computed as a blend of two curves that run simultaneously over the full
 * duration — giving one continuous, smooth deceleration with the
 * overshoot/undershoot baked in near the end rather than as a separate bounce:
 *
 *   basePos(t)    = lerp(from, overshootTarget, easeOutQuart(t))
 *   blendWeight(t) = smoothstep(phase1Frac → 1)          // 0 before tail, 1 at end
 *   position(t)   = lerp(basePos(t), finalRotation, blendWeight(t))
 *
 * The overshootTarget = finalRotation + correctionDelta, so the base curve
 * naturally drifts past (or short of) the target.  The blend weight then
 * smoothly pulls the wheel back to exactly finalRotation by t = 1.
 * Because both curves are active at all times the motion is fully continuous
 * with no abrupt velocity change between "phases".
 */
class TwoPhaseWheelAnimator {
    constructor() {
        this.currentRotation = 0;
        this.spinFromRotation = 0;
        this.finalRotation = 0;
        this.overshootTarget = null;
        this.startTime = 0;
        this.totalDuration = 0;
        this.blendStart = 0; // t-fraction where correction blend begins
        this.accelCapMs = 0;
        this.rafId = null;
        this.resolveSpinPromise = null;
        this.onFrame = null;
    }
    get isSpinning() { return this.rafId !== null; }
    start(params, onFrame) {
        // Cancel any in-flight animation, resolving the old promise immediately.
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        const oldResolve = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        this.onFrame = null;
        oldResolve?.();
        this.onFrame = onFrame;
        this.accelCapMs = params.accelCapMs;
        this.spinFromRotation = params.fromRotation;
        this.currentRotation = params.fromRotation;
        this.finalRotation = params.finalRotation;
        this.totalDuration = params.normalDuration;
        if (params.correctionDelta != null && params.correctionDelta !== 0) {
            this.overshootTarget = params.finalRotation + params.correctionDelta;
            this.blendStart = params.phase1Frac;
        }
        else {
            this.overshootTarget = null;
            this.blendStart = 1;
        }
        this.startTime = performance.now();
        return new Promise(resolve => {
            this.resolveSpinPromise = resolve;
            this.scheduleFrame();
        });
    }
    accelerate() {
        if (this.rafId === null)
            return;
        const elapsed = performance.now() - this.startTime;
        if (elapsed >= this.totalDuration)
            return;
        // Rebase from current visual position, dropping correction.
        this.overshootTarget = null;
        this.blendStart = 1;
        this.spinFromRotation = this.currentRotation;
        this.startTime = performance.now();
        this.totalDuration = this.accelCapMs;
    }
    skip() {
        if (this.rafId === null)
            return;
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.finishSpin();
    }
    // ── Animation loop ────────────────────────────────────────────────────────
    scheduleFrame() {
        this.rafId = requestAnimationFrame(() => this.frame());
    }
    frame() {
        const elapsed = performance.now() - this.startTime;
        if (elapsed >= this.totalDuration) {
            this.finishSpin();
            return;
        }
        const t = elapsed / this.totalDuration;
        this.currentRotation = this.computePosition(t);
        this.onFrame?.();
        this.scheduleFrame();
    }
    /**
     * Single unified position function.
     * - Without correction: pure ease-out-quart from `spinFromRotation` to `finalRotation`.
     * - With correction: ease-out-quart aims at `overshootTarget` while a smoothstep
     *   blend (active only in the tail window [blendStart, 1]) gradually steers the
     *   position back to `finalRotation`.  All in one continuous pass.
     */
    computePosition(t) {
        const baseTarget = this.overshootTarget ?? this.finalRotation;
        const basePos = this.spinFromRotation + this.easeOutQuart(t) * (baseTarget - this.spinFromRotation);
        if (this.overshootTarget == null)
            return basePos;
        // Blend weight: 0 before blendStart, smooth 0→1 between blendStart and 1.
        const blend = this.smoothstepTail(t, this.blendStart);
        // Lerp between base (which drifts past/short of final) and exact final.
        return basePos + blend * (this.finalRotation - basePos);
    }
    finishSpin() {
        this.currentRotation = this.finalRotation;
        this.overshootTarget = null;
        this.rafId = null;
        this.onFrame?.();
        this.onFrame = null;
        const resolve = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        resolve?.();
    }
    // ── Easing / math helpers ─────────────────────────────────────────────────
    easeOutQuart(t) {
        return 1 - Math.pow(1 - Math.min(t, 1), 4);
    }
    /**
     * Smoothstep that maps [start, 1] → [0, 1] and is 0 for t ≤ start.
     * Used to define the correction blend window.
     */
    smoothstepTail(t, start) {
        if (t <= start)
            return 0;
        const u = (t - start) / (1 - start); // remap to [0, 1]
        return u * u * (3 - 2 * u); // classic smoothstep
    }
}
// ===== Wheel Spin Mode (Strategy Pattern) =====
const WheelSpinStrategyCode = {
    Normal: "normal",
    Accelerate: "accelerate",
    Skip: "skip",
};
class NormalSpinStrategy {
    constructor() {
        this.id = WheelSpinStrategyCode.Normal;
        this.label = "Normal";
    }
    execute(wheel, targetIndex) {
        return wheel.spin(targetIndex, { modeId: this.id });
    }
}
class AccelerateSpinStrategy {
    constructor() {
        this.id = WheelSpinStrategyCode.Accelerate;
        this.label = "Fast";
    }
    execute(wheel, targetIndex) {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.accelerate();
        return p;
    }
}
class SkipSpinStrategy {
    constructor() {
        this.id = WheelSpinStrategyCode.Skip;
        this.label = "Skip";
    }
    execute(wheel, targetIndex) {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.skip();
        return p;
    }
}
class WheelSpinModeFactory {
    constructor() {
        this.registry = new Map([
            [WheelSpinStrategyCode.Normal, new NormalSpinStrategy()],
            [WheelSpinStrategyCode.Accelerate, new AccelerateSpinStrategy()],
            [WheelSpinStrategyCode.Skip, new SkipSpinStrategy()],
        ]);
    }
    create(id) {
        const strategy = this.registry.get(id);
        if (!strategy)
            throw new Error(`Unknown spin mode: ${id}`);
        return strategy;
    }
    allModes() {
        return [...this.registry.values()];
    }
}
// ===== Spinning Angle Calculator (Strategy Pattern) =====
// ── Concrete calculators ──────────────────────────────────────────────────────
/** Lands at a uniformly random position within the inner 80% of the segment — single phase. */
class NaturalAngleCalculator {
    calculate({ targetIndex, segAngles }) {
        const { start, sweep } = segAngles[targetIndex];
        const margin = sweep * 0.10;
        const TAU = 2 * Math.PI;
        const landingAngle = start + margin + Math.random() * (sweep - 2 * margin);
        return { landingAngle: ((landingAngle % TAU) + TAU) % TAU };
    }
}
/**
 * The wheel spins slightly past the reward section, then eases back in.
 *
 * More rotation → lower wheel-space angle under pointer, so the peak
 * pointer position is landingAngle − correctionDelta.  We intentionally
 * make that cross the trailing edge (start) by a small gap so the pointer
 * briefly visits the neighbouring segment before returning.
 */
class OvershootAngleCalculator {
    calculate({ targetIndex, segAngles }) {
        const { start, sweep } = segAngles[targetIndex];
        const TAU = 2 * Math.PI;
        // Landing sits close to the trailing edge (start) so the correction
        // needed to cross it is as small as possible.
        // Cap distInside so large segments don't push correctionDelta too high.
        const distInside = Math.min(sweep * (0.10 + Math.random() * 0.10), 0.08);
        const landingAngle = start + distInside;
        // How far past the trailing edge the pointer should briefly appear.
        const extraGap = Math.min(0.06, Math.max(0.025, sweep * 0.04));
        const correctionDelta = distInside + extraGap; // always crosses start
        return {
            landingAngle: ((landingAngle % TAU) + TAU) % TAU,
            correctionDelta,
        };
    }
}
/**
 * The wheel stops just before the reward section, then creeps in.
 *
 * correctionDelta is negative, so the peak pointer position is
 * landingAngle + |correctionDelta|, which crosses the leading edge
 * (start + sweep) so the pointer briefly sits in the preceding segment.
 */
class UndershootAngleCalculator {
    calculate({ targetIndex, segAngles }) {
        const { start, sweep } = segAngles[targetIndex];
        const TAU = 2 * Math.PI;
        // Landing sits close to the leading edge (start + sweep).
        const distFromLeading = Math.min(sweep * (0.10 + Math.random() * 0.10), 0.08);
        const landingAngle = start + sweep - distFromLeading;
        // How far past the leading edge the pointer should briefly appear.
        const extraGap = Math.min(0.06, Math.max(0.025, sweep * 0.04));
        const correctionDelta = -(distFromLeading + extraGap); // always crosses start+sweep
        return {
            landingAngle: ((landingAngle % TAU) + TAU) % TAU,
            correctionDelta,
        };
    }
}
// ── Factory ───────────────────────────────────────────────────────────────────
/**
 * Picks a calculator using weighted random selection.
 * - skip mode: always Natural (animation is instant anyway).
 * - accelerate mode: mostly Natural, occasional Overshoot.
 * - normal mode: mix of all three for varied feel.
 */
class WeightedRandomCalculatorFactory {
    create(context) {
        if (context.modeId === WheelSpinStrategyCode.Skip)
            return WeightedRandomCalculatorFactory.NATURAL_ONLY;
        const pool = context.modeId === WheelSpinStrategyCode.Accelerate
            ? WeightedRandomCalculatorFactory.ACCEL_POOL
            : WeightedRandomCalculatorFactory.NORMAL_POOL;
        const items = pool.map(([calc]) => calc);
        const weights = pool.map(([, w]) => w);
        return Collections.randomItemWeighted(items, weights) ?? WeightedRandomCalculatorFactory.NATURAL_ONLY;
    }
}
WeightedRandomCalculatorFactory.NORMAL_POOL = [
    [new NaturalAngleCalculator(), 65],
    [new OvershootAngleCalculator(), 20],
    [new UndershootAngleCalculator(), 15],
];
WeightedRandomCalculatorFactory.ACCEL_POOL = [
    [new NaturalAngleCalculator(), 80],
    [new OvershootAngleCalculator(), 20],
];
WeightedRandomCalculatorFactory.NATURAL_ONLY = new NaturalAngleCalculator();
// ===== Wheel Spinner =====
class DefaultWheelSpinner {
    constructor(animator, calculatorFactory) {
        this.animator = animator;
        this.calculatorFactory = calculatorFactory;
    }
    spin(targetIndex, context, segments, segAngles, onFrame) {
        const TAU = 2 * Math.PI;
        const calculator = this.calculatorFactory.create(context);
        const landing = calculator.calculate({ targetIndex, segments, segAngles });
        // Compute how much to rotate so landing.landingAngle faces the pointer at top.
        // A wheel-space angle `a` is under the pointer when: a + rot ≡ 0 (mod 2π) ⟹ rot ≡ -a
        const targetRot = ((-landing.landingAngle % TAU) + TAU) % TAU;
        const currentNorm = ((this.animator.currentRotation % TAU) + TAU) % TAU;
        let delta = targetRot - currentNorm;
        if (delta <= 0)
            delta += TAU;
        delta += DefaultWheelSpinner.MIN_SPINS * TAU;
        const params = {
            fromRotation: this.animator.currentRotation,
            finalRotation: this.animator.currentRotation + delta,
            correctionDelta: landing.correctionDelta ?? null,
            normalDuration: DefaultWheelSpinner.NORMAL_DURATION,
            phase1Frac: DefaultWheelSpinner.PHASE1_FRAC,
            accelCapMs: DefaultWheelSpinner.ACCEL_CAP_MS,
        };
        return this.animator.start(params, onFrame);
    }
    accelerate() { this.animator.accelerate(); }
    skip() { this.animator.skip(); }
}
// ── Timing defaults ────────────────────────────────────────────────────────
DefaultWheelSpinner.NORMAL_DURATION = 4000; // ms for a full normal spin
DefaultWheelSpinner.ACCEL_CAP_MS = 900; // max remaining ms after accelerate()
DefaultWheelSpinner.MIN_SPINS = 6; // minimum full rotations before stopping
DefaultWheelSpinner.PHASE1_FRAC = 0.85; // t-fraction at which the correction blend begins (wider window → slower, more readable settle)
// ===== Spinning Wheel (Orchestrator) =====
/**
 * Orchestrates the drawer, animator, and spinner to present a complete
 * spinning-wheel widget.  This class owns the segment data model and wires
 * the three subcomponents together, but delegates all drawing, animation, and
 * spin-target computation to them.
 */
class SpinningWheel {
    constructor(drawer, animator, spinner) {
        this.segments = [];
        this.segAngles = [];
        this.drawer = drawer;
        this.animator = animator;
        this.spinner = spinner;
        this.redraw();
    }
    // ===== Public API =====
    setSegments(segments) {
        this.segments = segments;
        this.segAngles = this.computeAngles(segments);
        if (!this.animator.isSpinning)
            this.redraw();
    }
    findSegmentIndex(rewardId) {
        const idx = this.segments.findIndex(s => s.id === rewardId);
        return idx >= 0 ? idx : 0;
    }
    spin(targetIndex, context) {
        return this.spinner.spin(targetIndex, context, this.segments, this.segAngles, () => this.redraw());
    }
    accelerate() { this.spinner.accelerate(); }
    skip() { this.spinner.skip(); }
    // ===== Helpers =====
    redraw() {
        this.drawer.draw(this.animator.currentRotation, this.segments, this.segAngles);
    }
    computeAngles(segs) {
        if (segs.length === 0)
            return [];
        const TAU = 2 * Math.PI;
        const total = segs.reduce((s, seg) => s + seg.weight, 0) || 1;
        // Compute visual fractions with a minimum floor so tiny segments stay visible.
        // Segments below MIN_SEG_FRAC are boosted; larger ones are scaled down proportionally.
        // Iterate until stable (convergence typically takes 1-2 passes).
        const frac = segs.map(s => s.weight / total);
        const MIN = SpinningWheel.MIN_SEG_FRAC;
        for (let iter = 0; iter < 8; iter++) {
            const smallIdx = frac.reduce((acc, f, i) => { if (f < MIN)
                acc.push(i); return acc; }, []);
            if (smallIdx.length === 0)
                break;
            const reserved = smallIdx.length * MIN;
            if (reserved >= 1) {
                frac.fill(1 / segs.length);
                break;
            } // pathological: equal split
            const largeTotal = frac.reduce((s, f, i) => s + (frac[i] < MIN ? 0 : f), 0);
            const scale = (1 - reserved) / largeTotal;
            for (let i = 0; i < frac.length; i++) {
                frac[i] = frac[i] < MIN ? MIN : frac[i] * scale;
            }
        }
        const result = [];
        let cum = 0;
        for (let i = 0; i < segs.length; i++) {
            const start = cum * TAU;
            const sweep = frac[i] * TAU;
            result.push({ start, mid: start + sweep / 2, sweep });
            cum += frac[i];
        }
        return result;
    }
}
SpinningWheel.MIN_SEG_FRAC = 0.028; // minimum visual fraction per segment (~10°)
// ===== Rewarder Service =====
// Owns all application state and business logic. No DOM access.
class RewarderService {
    constructor(colorProvider = new CyclingColorProvider()) {
        this.rewardNodes = defaultRewardNodes();
        this.pityEnabled = true;
        this.pityThreshold = 90;
        this.pityTargetId = null;
        this.nextId = 1;
        this.stdPityEnabled = false;
        this.stdPityThreshold = 10;
        this.stdPityEntries = [];
        this.featuredPityEnabled = false;
        this.featuredPityThreshold = 2;
        this.featuredPityGroupId = null;
        this.featuredPityFeaturedId = null;
        this.totalRolls = 0;
        this.rewardCounts = new Map();
        this.history = [];
        this.pityInterceptor = null;
        this.stdPityInterceptor = null;
        this.featuredPityInterceptor = null;
        this.rng = new MathRandomNumberGenerator();
        this.profiles = [];
        this.activeProfileId = "";
        this._colorProvider = colorProvider;
    }
    // ===== Init =====
    init() {
        this.loadState();
    }
    // ===== Pipeline =====
    rebuildPipeline() {
        if (this.pityTargetId !== null && !this.findNode(this.pityTargetId)) {
            this.pityTargetId = null;
        }
        const targetConfig = this.pityTargetId
            ? (this.findNode(this.pityTargetId) ?? null)
            : null;
        const featuredGroup = this.featuredPityGroupId
            ? (this.findNode(this.featuredPityGroupId) ?? null)
            : null;
        const featuredFeatured = this.featuredPityFeaturedId
            ? (this.findNode(this.featuredPityFeaturedId) ?? null)
            : null;
        // Nullify IDs that no longer exist in the tree.
        if (!featuredGroup)
            this.featuredPityGroupId = null;
        if (!featuredFeatured)
            this.featuredPityFeaturedId = null;
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
        this.pipeline = pipeline;
        this.pityInterceptor = pityInterceptor;
        this.stdPityInterceptor = stdPityInterceptor;
        this.featuredPityInterceptor = featuredPityInterceptor;
        if (this.pityInterceptor) {
            this.pityTargetId = this.pityInterceptor.targetId;
        }
        this.saveProfileConfig();
    }
    /** Resolves stdPityEntries into full RewardNodeConfig objects from the active pool. */
    resolvedStdPityNodes() {
        const result = [];
        for (const entry of this.stdPityEntries) {
            const node = this.rewardNodes.find(n => n.id === entry.nodeId);
            if (node)
                result.push({ ...node, rate: entry.rate });
        }
        return result;
    }
    // ===== Node Queries =====
    findNode(id, nodes = this.rewardNodes) {
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
    isRateValid() {
        return this.validateTree(this.rewardNodes);
    }
    rootTotalRate() {
        return this.rewardNodes.reduce((s, n) => s + n.rate, 0);
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
    // ===== Node Mutations =====
    addRootLeaf() {
        const id = `leaf-${this.nextId++}`;
        const color = this._colorProvider.next();
        this.rewardNodes.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color, borderColor: color, children: [],
        });
        return id;
    }
    addRootGroup() {
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
    addChildToGroup(groupId) {
        const group = this.findNode(groupId);
        if (!group || !group.isGroup)
            return null;
        const id = `leaf-${this.nextId++}`;
        const color = this._colorProvider.next();
        group.children.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color, borderColor: color, children: [],
        });
        return id;
    }
    removeNode(id) {
        if (this.rewardNodes.length > 1) {
            const idx = this.rewardNodes.findIndex(n => n.id === id);
            if (idx !== -1) {
                this.rewardNodes.splice(idx, 1);
                // Clean up any std pity entry referencing this root node.
                this.stdPityEntries = this.stdPityEntries.filter(e => e.nodeId !== id);
                // Clean up featured pity if group is removed.
                if (this.featuredPityGroupId === id) {
                    this.featuredPityGroupId = null;
                    this.featuredPityFeaturedId = null;
                }
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
    async roll() {
        const result = await this.pipeline.invoke({ rng: this.rng });
        const reward = result.rewards[0] ?? new Reward("unknown", "Unknown");
        const rollNum = ++this.totalRolls;
        this.rewardCounts.set(reward.id, (this.rewardCounts.get(reward.id) ?? 0) + 1);
        this.history.unshift({ rollNum, reward });
        if (this.history.length > 200)
            this.history.pop();
        return { reward, rollNum };
    }
    resetStats() {
        this.totalRolls = 0;
        this.rewardCounts = new Map();
        this.history = [];
    }
    // ===== Profiles & Persistence =====
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
            stdPityEnabled: this.stdPityEnabled,
            stdPityThreshold: this.stdPityThreshold,
            stdPityEntries: this.stdPityEntries,
            featuredPityEnabled: this.featuredPityEnabled,
            featuredPityThreshold: this.featuredPityThreshold,
            featuredPityGroupId: this.featuredPityGroupId,
            featuredPityFeaturedId: this.featuredPityFeaturedId,
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
            stdPityCounter: this.stdPityInterceptor?.counter ?? 0,
            featuredPityCounter: this.featuredPityInterceptor?.counter ?? 0,
        };
        storageSaveStats(this.activeProfileId, stats);
    }
    // Returns true if the active profile was replaced (caller should do a full re-render).
    switchProfile(id) {
        if (id === this.activeProfileId)
            return false;
        const profile = this.profiles.find(p => p.id === id);
        if (!profile)
            return false;
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
            if (this.stdPityInterceptor)
                this.stdPityInterceptor.setCounter(stats.stdPityCounter ?? 0);
            if (this.featuredPityInterceptor)
                this.featuredPityInterceptor.setCounter(stats.featuredPityCounter ?? 0);
        }
        return true;
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
            stdPityEnabled: false,
            stdPityThreshold: 10,
            stdPityEntries: [],
            featuredPityEnabled: false,
            featuredPityThreshold: 2,
            featuredPityGroupId: null,
            featuredPityFeaturedId: null,
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
    }
    // Returns true if the active profile was deleted (caller should do a full re-render).
    deleteProfile(id) {
        if (this.profiles.length <= 1)
            return false;
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx === -1)
            return false;
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
                if (this.stdPityInterceptor)
                    this.stdPityInterceptor.setCounter(stats.stdPityCounter ?? 0);
                if (this.featuredPityInterceptor)
                    this.featuredPityInterceptor.setCounter(stats.featuredPityCounter ?? 0);
            }
            return true;
        }
        return false;
    }
    renameProfile(name) {
        const idx = this.profiles.findIndex(p => p.id === this.activeProfileId);
        if (idx === -1)
            return;
        this.profiles[idx].name = name || "Profile";
        storageSaveProfiles(this.profiles);
    }
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
                stdPityEnabled: false,
                stdPityThreshold: 10,
                stdPityEntries: [],
                featuredPityEnabled: false,
                featuredPityThreshold: 2,
                featuredPityGroupId: null,
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
            if (this.pityInterceptor)
                this.pityInterceptor.setCounter(stats.pityCounter);
            if (this.stdPityInterceptor)
                this.stdPityInterceptor.setCounter(stats.stdPityCounter ?? 0);
            if (this.featuredPityInterceptor)
                this.featuredPityInterceptor.setCounter(stats.featuredPityCounter ?? 0);
        }
    }
    applyProfile(profile) {
        this.rewardNodes = profile.nodes;
        this.pityEnabled = profile.pityEnabled;
        this.pityThreshold = profile.pityThreshold;
        this.pityTargetId = profile.pityTargetId;
        this.nextId = profile.nextId;
        this.stdPityEnabled = profile.stdPityEnabled ?? false;
        this.stdPityThreshold = profile.stdPityThreshold ?? 10;
        this.stdPityEntries = profile.stdPityEntries ?? [];
        this.featuredPityEnabled = profile.featuredPityEnabled ?? false;
        this.featuredPityThreshold = profile.featuredPityThreshold ?? 2;
        this.featuredPityGroupId = profile.featuredPityGroupId ?? null;
        this.featuredPityFeaturedId = profile.featuredPityFeaturedId ?? null;
    }
    applyStats(stats) {
        this.totalRolls = stats.totalRolls;
        this.rewardCounts = new Map(Object.entries(stats.rewardCounts));
        this.history = stats.history.map(h => ({
            rollNum: h.rollNum,
            reward: new Reward(h.rewardId, h.rewardName),
        }));
    }
}
// ===== App =====
class RewarderApp {
    constructor() {
        this.svc = new RewarderService();
        this.isRolling = false;
        // ── Composition root ─────────────────────────────────────────────────────
        this.spinModeFactory = new WheelSpinModeFactory();
        this.calculatorFactory = new WeightedRandomCalculatorFactory();
    }
    init() {
        this.svc.init();
        this.spinStrategy = this.spinModeFactory.create(WheelSpinStrategyCode.Normal);
        const canvas = document.getElementById("wheel-canvas");
        const drawer = new CanvasWheelDrawer(canvas);
        const animator = new TwoPhaseWheelAnimator();
        const spinner = new DefaultWheelSpinner(animator, this.calculatorFactory);
        this.wheel = new SpinningWheel(drawer, animator, spinner);
        this.bindStaticEvents();
        this.renderAll();
    }
    // ===== Events =====
    bindStaticEvents() {
        const pityToggle = document.getElementById("pity-toggle");
        const pityThreshInput = document.getElementById("pity-threshold");
        pityToggle.addEventListener("change", () => {
            this.svc.pityEnabled = pityToggle.checked;
            const pityDisplay = this.svc.pityEnabled ? "flex" : "none";
            const row = document.getElementById("pity-config-row");
            if (row)
                row.style.display = pityDisplay;
            const trow = document.getElementById("pity-target-row");
            if (trow)
                trow.style.display = pityDisplay;
            this.svc.rebuildPipeline();
            this.renderPityProgress();
        });
        pityThreshInput.addEventListener("change", () => {
            this.svc.pityThreshold = Math.max(1, parseInt(pityThreshInput.value) || 1);
            pityThreshInput.value = String(this.svc.pityThreshold);
            this.svc.rebuildPipeline();
            this.renderPityProgress();
        });
        document.getElementById("btn-roll").addEventListener("click", () => this.doRolls(1));
        document.getElementById("btn-roll-10").addEventListener("click", () => this.doRolls(10));
        document.getElementById("btn-roll-100").addEventListener("click", () => this.doRolls(100));
        document.getElementById("btn-reset").addEventListener("click", () => this.resetStats());
        const modeSel = document.getElementById("wheel-mode-selector");
        if (modeSel) {
            modeSel.addEventListener("click", (e) => {
                const btn = e.target.closest(".btn-mode");
                const mode = btn?.dataset.mode;
                if (!mode)
                    return;
                try {
                    this.spinStrategy = this.spinModeFactory.create(mode);
                }
                catch {
                    return;
                }
                modeSel.querySelectorAll(".btn-mode").forEach(b => b.classList.remove("is-active"));
                btn.classList.add("is-active");
            });
        }
        document.getElementById("btn-add-leaf").addEventListener("click", () => this.addRootLeaf());
        document.getElementById("btn-add-group").addEventListener("click", () => this.addRootGroup());
        const pityTargetSel = document.getElementById("pity-target");
        if (pityTargetSel) {
            pityTargetSel.addEventListener("change", () => {
                this.svc.pityTargetId = pityTargetSel.value || null;
                this.svc.rebuildPipeline();
                this.renderPityTargetPicker();
                this.renderPityProgress();
            });
        }
        const profileSel = document.getElementById("profile-select");
        if (profileSel) {
            profileSel.addEventListener("change", () => {
                if (this.svc.switchProfile(profileSel.value))
                    this.renderAll();
            });
        }
        document.getElementById("btn-new-profile")?.addEventListener("click", () => this.newProfile());
        document.getElementById("btn-delete-profile")?.addEventListener("click", () => this.deleteProfile(this.svc.activeProfileId));
        const profileNameInput = document.getElementById("profile-name");
        if (profileNameInput) {
            profileNameInput.addEventListener("change", () => {
                this.svc.renameProfile(profileNameInput.value.trim());
                this.renderProfilePicker();
            });
        }
        this.bindRewardListEvents();
        this.bindStdPityEvents();
        this.bindFeaturedPityEvents();
        // Tab navigation
        const tabBar = document.getElementById("tab-bar");
        if (tabBar) {
            tabBar.addEventListener("click", (e) => {
                const btn = e.target.closest(".tab-btn");
                if (!btn?.dataset.tab)
                    return;
                tabBar.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("is-active"));
                btn.classList.add("is-active");
                document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("is-hidden"));
                document.getElementById(`tab-${btn.dataset.tab}`)?.classList.remove("is-hidden");
            });
        }
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
            const node = this.svc.findNode(treeNode.dataset.id);
            if (!node)
                return;
            if (target.classList.contains("reward-rate-input")) {
                const raw = parseFloat(target.value);
                node.rate = isNaN(raw) ? 0 : Math.max(0, raw);
                this.updateEffectiveRatesInPlace();
                this.updateRateSummary();
                this.updateWheelSegments();
                this.svc.rebuildPipeline();
            }
            else if (target.classList.contains("reward-color-input")) {
                node.color = target.value;
                this.svc.saveProfileConfig();
                this.updateWheelSegments();
                this.renderStats();
                this.renderHistory();
            }
            else if (target.classList.contains("reward-border-input")) {
                node.borderColor = target.value;
                this.svc.saveProfileConfig();
                this.updateWheelSegments();
                this.renderStats();
                this.renderHistory();
            }
        });
        list.addEventListener("change", (e) => {
            const target = e.target;
            const treeNode = target.closest(".tree-node");
            if (!treeNode)
                return;
            const node = this.svc.findNode(treeNode.dataset.id);
            if (!node)
                return;
            if (target.classList.contains("reward-name-input")) {
                node.name = target.value.trim() || (node.isGroup ? "Group" : "Reward");
                this.svc.rebuildPipeline();
                this.updateWheelSegments();
                this.renderPityTargetPicker();
                this.renderStdPityPoolEditor();
                this.renderFeaturedPityGroupPicker();
                this.renderFeaturedPityFeaturedPicker();
            }
            else if (target.classList.contains("reward-rate-input")) {
                const raw = parseFloat(target.value);
                node.rate = isNaN(raw) ? 0 : Math.max(0, raw);
                target.value = String(node.rate);
                this.updateEffectiveRatesInPlace();
                this.updateRateSummary();
                this.updateWheelSegments();
                this.svc.rebuildPipeline();
            }
        });
        list.addEventListener("click", (e) => {
            const target = e.target;
            if (target.closest(".btn-toggle-group")) {
                const treeNode = target.closest(".tree-node.tree-group");
                if (treeNode)
                    treeNode.classList.toggle("is-collapsed");
            }
            else if (target.closest(".btn-delete-reward")) {
                const treeNode = target.closest(".tree-node");
                if (treeNode) {
                    this.svc.removeNode(treeNode.dataset.id);
                    this.svc.rebuildPipeline();
                    this.renderRewardEditor();
                    this.updateRateSummary();
                }
            }
            else if (target.closest(".btn-add-child")) {
                const treeNode = target.closest(".tree-node.tree-group");
                if (treeNode) {
                    const id = this.svc.addChildToGroup(treeNode.dataset.id);
                    if (id)
                        this.afterEdit(id);
                }
            }
        });
    }
    addRootLeaf() {
        this.afterEdit(this.svc.addRootLeaf());
    }
    addRootGroup() {
        this.afterEdit(this.svc.addRootGroup());
    }
    afterEdit(focusId) {
        this.svc.rebuildPipeline();
        this.renderRewardEditor();
        this.updateRateSummary();
        const input = document.querySelector(`.tree-node[data-id="${focusId}"] .reward-name-input`);
        input?.focus();
        input?.select();
    }
    // ===== Rolls =====
    async doRolls(count) {
        if (this.isRolling || !this.svc.isRateValid())
            return;
        this.isRolling = true;
        this.setRollButtonsDisabled(true);
        for (let i = 0; i < count; i++) {
            const { reward, rollNum } = await this.svc.roll();
            await this.spinStrategy.execute(this.wheel, this.wheel.findSegmentIndex(reward.id));
            this.renderLatestResult(reward, rollNum);
            this.renderStats();
            this.renderPityProgress();
            this.renderStdPityProgress();
            this.renderFeaturedPityProgress();
        }
        this.renderHistory();
        this.svc.saveCurrentStats();
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
        this.svc.resetStats();
        this.svc.rebuildPipeline();
        this.renderLatestResult(null, 0);
        this.renderStats();
        this.renderPityProgress();
        this.renderFeaturedPityProgress();
        this.renderHistory();
        this.svc.saveCurrentStats();
    }
    // ===== Profiles =====
    newProfile() {
        this.svc.newProfile();
        this.renderAll();
    }
    deleteProfile(id) {
        const activeChanged = this.svc.deleteProfile(id);
        if (activeChanged)
            this.renderAll();
        else
            this.renderProfilePicker();
    }
    renderProfilePicker() {
        const sel = document.getElementById("profile-select");
        if (sel) {
            sel.innerHTML = this.svc.profiles
                .map(p => `<option value="${p.id}"${p.id === this.svc.activeProfileId ? " selected" : ""}>${escapeHtml(p.name)}</option>`)
                .join("");
        }
        const nameInput = document.getElementById("profile-name");
        if (nameInput) {
            const active = this.svc.profiles.find(p => p.id === this.svc.activeProfileId);
            nameInput.value = active?.name ?? "";
        }
        const delBtn = document.getElementById("btn-delete-profile");
        if (delBtn)
            delBtn.disabled = this.svc.profiles.length <= 1;
    }
    // ===== Renders =====
    renderAll() {
        const pityDisplay = this.svc.pityEnabled ? "flex" : "none";
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
        this.renderStdPityProgress();
        this.renderFeaturedPityProgress();
        this.renderHistory();
    }
    updateEffectiveRatesInPlace() {
        for (const node of this.svc.rewardNodes) {
            if (!node.isGroup)
                continue;
            for (const child of node.children) {
                const effEl = document.querySelector(`.tree-node[data-id="${child.id}"] .eff-rate`);
                if (effEl)
                    effEl.textContent = `${formatRate(node.rate * child.rate / 100)}%`;
            }
        }
    }
    renderRewardEditor() {
        const list = document.getElementById("reward-list");
        if (!list)
            return;
        list.innerHTML = this.svc.rewardNodes.map(node => this.renderRootNode(node)).join("");
        this.renderPityTargetPicker();
        this.renderStdPityConfig();
        this.renderFeaturedPityConfig();
        this.updateWheelSegments();
    }
    renderRootNode(node) {
        const canDelete = this.svc.rewardNodes.length > 1;
        return node.isGroup
            ? this.renderGroupNode(node, canDelete)
            : this.renderLeafNode(node, null, canDelete);
    }
    renderPityTargetPicker() {
        const sel = document.getElementById("pity-target");
        if (!sel)
            return;
        const choices = collectPityChoices(this.svc.rewardNodes);
        sel.innerHTML = choices
            .map(c => `<option value="${c.id}"${c.id === this.svc.pityTargetId ? " selected" : ""}>${escapeHtml(c.label)}</option>`)
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
                    <button class="btn-toggle-group" title="Collapse group">&#x25BC;</button>
                    <input type="text" class="reward-name-input" value="${escapeHtml(group.name)}" placeholder="Group name">
                    <div class="reward-rate-group">
                        <input type="text" inputmode="decimal" class="reward-rate-input" value="${group.rate}" min="0" max="100" step="any">
                        <span class="rate-unit">%</span>
                    </div>
                    <button class="btn-add-child" title="Add reward to group">+</button>
                    <button class="btn-delete-reward" title="Remove group"${canDelete ? "" : " disabled"}>&#xd7;</button>
                </div>
                <div class="group-children">
                    ${childrenHtml}
                    <div class="group-rate-summary ${childOk ? "rate-ok" : "rate-warn"}">Σ ${formatRate(childSum)}% ${childOk ? "✓" : "⚠"}</div>
                </div>
            </div>`;
    }
    renderLeafNode(leaf, parentId, canDelete, groupRate) {
        const effHtml = groupRate !== undefined
            ? `<span class="eff-rate">${formatRate(groupRate * leaf.rate / 100)}%</span>`
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
                        <input type="text" inputmode="decimal" class="reward-rate-input" value="${leaf.rate}" min="0" max="100" step="any">
                        <span class="rate-unit">%</span>${effHtml}
                    </div>
                    <button class="btn-delete-reward" title="Remove"${canDelete ? "" : " disabled"}>&#xd7;</button>
                </div>
            </div>`;
    }
    updateRateSummary() {
        const rootTotal = this.svc.rootTotalRate();
        const totalEl = document.getElementById("total-rate");
        if (totalEl)
            totalEl.textContent = formatRate(rootTotal);
        const rootOk = Math.abs(rootTotal - 100) < 0.001;
        const valid = this.svc.isRateValid();
        const warning = document.getElementById("rate-warning");
        if (warning)
            warning.style.display = rootOk ? "none" : "inline";
        for (const group of this.svc.rewardNodes) {
            if (!group.isGroup)
                continue;
            const sumEl = document.querySelector(`.tree-node[data-id="${group.id}"] .group-rate-summary`);
            if (!sumEl)
                continue;
            const childSum = group.children.reduce((s, c) => s + c.rate, 0);
            const ok = group.children.length > 0 && Math.abs(childSum - 100) < 0.001;
            sumEl.textContent = `\u03a3 ${formatRate(childSum)}% ${ok ? "\u2713" : "\u26a0"}`;
            sumEl.className = `group-rate-summary ${ok ? "rate-ok" : "rate-warn"}`;
        }
        this.setRollButtonsDisabled(!valid || this.isRolling);
    }
    renderLatestResult(reward, rollNum) {
        const container = document.getElementById("card-view");
        if (!container)
            return;
        if (!reward) {
            container.innerHTML = `<div class="idle-msg">Roll to get started!</div>`;
            return;
        }
        const cfg = this.svc.findNode(reward.id);
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
        const total = this.svc.totalRolls;
        const totalEl = document.getElementById("stat-total");
        if (totalEl)
            totalEl.textContent = String(total);
        const container = document.getElementById("stats-rows");
        if (!container)
            return;
        container.innerHTML = collectLeaves(this.svc.rewardNodes).map(leaf => {
            const count = this.svc.rewardCounts.get(leaf.id) ?? 0;
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
        if (!this.svc.pityEnabled || !this.svc.pityInterceptor) {
            section.style.display = "none";
            return;
        }
        section.style.display = "block";
        const counter = this.svc.pityInterceptor.counter;
        const threshold = this.svc.pityThreshold;
        const pct = Math.min(100, (counter / threshold) * 100);
        const urgency = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";
        const targetName = this.svc.pityInterceptor.targetName ?? "—";
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
        if (this.svc.history.length === 0) {
            container.innerHTML = `<div class="history-empty">No rolls yet</div>`;
            return;
        }
        container.innerHTML = this.svc.history.slice(0, 60).map(entry => {
            const cfg = this.svc.findNode(entry.reward.id);
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
    // ===== Wheel helpers =====
    updateWheelSegments() {
        const leaves = collectLeaves(this.svc.rewardNodes);
        const segments = leaves.map(leaf => ({
            id: leaf.id,
            name: leaf.name,
            color: leaf.color,
            borderColor: leaf.borderColor,
            weight: this.effectiveWeight(leaf.id),
        }));
        this.wheel.setSegments(segments);
    }
    effectiveWeight(leafId, nodes = this.svc.rewardNodes, parentFraction = 1) {
        for (const node of nodes) {
            if (node.isGroup) {
                const w = this.effectiveWeight(leafId, node.children, parentFraction * node.rate / 100);
                if (w >= 0)
                    return w;
            }
            else if (node.id === leafId) {
                return parentFraction * node.rate / 100;
            }
        }
        return -1; // not found
    }
    // ===== Standard Pity =====
    bindStdPityEvents() {
        const toggle = document.getElementById("std-pity-toggle");
        if (toggle) {
            toggle.addEventListener("change", () => {
                this.svc.stdPityEnabled = toggle.checked;
                const display = this.svc.stdPityEnabled ? "flex" : "none";
                const blockDisplay = this.svc.stdPityEnabled ? "block" : "none";
                const cfgRow = document.getElementById("std-pity-config-row");
                const poolRow = document.getElementById("std-pity-pool-row");
                if (cfgRow)
                    cfgRow.style.display = display;
                if (poolRow)
                    poolRow.style.display = blockDisplay;
                this.svc.rebuildPipeline();
                this.renderStdPityProgress();
            });
        }
        const threshInput = document.getElementById("std-pity-threshold");
        if (threshInput) {
            threshInput.addEventListener("change", () => {
                this.svc.stdPityThreshold = Math.max(1, parseInt(threshInput.value) || 1);
                threshInput.value = String(this.svc.stdPityThreshold);
                this.svc.rebuildPipeline();
                this.renderStdPityProgress();
            });
        }
        const poolEditor = document.getElementById("std-pity-pool-editor");
        if (poolEditor) {
            poolEditor.addEventListener("change", (e) => {
                const target = e.target;
                const entryRow = target.closest(".std-pity-entry");
                if (!entryRow)
                    return;
                const nodeId = entryRow.dataset.nodeId;
                if (target.classList.contains("std-pity-entry-check")) {
                    const checked = target.checked;
                    if (checked) {
                        const node = this.svc.rewardNodes.find(n => n.id === nodeId);
                        if (node && !this.svc.stdPityEntries.find(e => e.nodeId === nodeId)) {
                            this.svc.stdPityEntries.push({ nodeId, rate: node.rate });
                        }
                    }
                    else {
                        this.svc.stdPityEntries = this.svc.stdPityEntries.filter(e => e.nodeId !== nodeId);
                    }
                    this.renderStdPityPoolEditor();
                    this.updateStdPityRateSummary();
                    this.svc.rebuildPipeline();
                    this.svc.saveProfileConfig();
                }
            });
            poolEditor.addEventListener("input", (e) => {
                const target = e.target;
                if (!target.classList.contains("std-pity-rate-input"))
                    return;
                const entryRow = target.closest(".std-pity-entry");
                if (!entryRow)
                    return;
                const nodeId = entryRow.dataset.nodeId;
                const raw = parseFloat(target.value);
                const rate = isNaN(raw) ? 0 : Math.max(0, raw);
                const entry = this.svc.stdPityEntries.find(e => e.nodeId === nodeId);
                if (entry) {
                    entry.rate = rate;
                    this.updateStdPityRateSummary();
                    this.svc.rebuildPipeline();
                    this.svc.saveProfileConfig();
                }
            });
            poolEditor.addEventListener("change", (e2) => {
                const target = e2.target;
                if (!target.classList.contains("std-pity-rate-input"))
                    return;
                const entryRow = target.closest(".std-pity-entry");
                if (!entryRow)
                    return;
                const nodeId = entryRow.dataset.nodeId;
                const raw = parseFloat(target.value);
                const rate = isNaN(raw) ? 0 : Math.max(0, raw);
                target.value = String(rate);
                const entry = this.svc.stdPityEntries.find(e => e.nodeId === nodeId);
                if (entry) {
                    entry.rate = rate;
                    this.updateStdPityRateSummary();
                    this.svc.rebuildPipeline();
                    this.svc.saveProfileConfig();
                }
            });
        }
    }
    renderStdPityConfig() {
        const toggle = document.getElementById("std-pity-toggle");
        if (toggle)
            toggle.checked = this.svc.stdPityEnabled;
        const threshInput = document.getElementById("std-pity-threshold");
        if (threshInput)
            threshInput.value = String(this.svc.stdPityThreshold);
        const display = this.svc.stdPityEnabled ? "flex" : "none";
        const blockDisplay = this.svc.stdPityEnabled ? "block" : "none";
        const cfgRow = document.getElementById("std-pity-config-row");
        const poolRow = document.getElementById("std-pity-pool-row");
        if (cfgRow)
            cfgRow.style.display = display;
        if (poolRow)
            poolRow.style.display = blockDisplay;
        this.renderStdPityPoolEditor();
        this.updateStdPityRateSummary();
    }
    renderStdPityPoolEditor() {
        const container = document.getElementById("std-pity-pool-editor");
        if (!container)
            return;
        container.innerHTML = this.svc.rewardNodes.map(node => {
            const entry = this.svc.stdPityEntries.find(e => e.nodeId === node.id);
            const checked = entry !== undefined;
            const rate = entry?.rate ?? node.rate;
            const label = node.isGroup
                ? `&#x25B6; ${escapeHtml(node.name)}`
                : escapeHtml(node.name);
            return `
                <div class="std-pity-entry" data-node-id="${node.id}">
                    <input type="checkbox" class="std-pity-entry-check"${checked ? " checked" : ""}>
                    <span class="std-pity-entry-name">${label}</span>
                    <input type="text" inputmode="decimal" class="std-pity-rate-input" value="${rate}" min="0" max="100" step="any"${checked ? "" : " disabled"}>
                    <span class="rate-unit">%</span>
                </div>`;
        }).join("");
    }
    updateStdPityRateSummary() {
        const total = this.svc.stdPityEntries.reduce((s, e) => s + e.rate, 0);
        const totalEl = document.getElementById("std-pity-total-rate");
        if (totalEl)
            totalEl.textContent = formatRate(total);
        const ok = this.svc.stdPityEntries.length > 0 && Math.abs(total - 100) < 0.001;
        const warning = document.getElementById("std-pity-rate-warning");
        if (warning)
            warning.style.display = (this.svc.stdPityEntries.length > 0 && !ok) ? "inline" : "none";
    }
    renderStdPityProgress() {
        const section = document.getElementById("std-pity-section");
        if (!section)
            return;
        if (!this.svc.stdPityEnabled || !this.svc.stdPityInterceptor) {
            section.style.display = "none";
            return;
        }
        section.style.display = "block";
        const counter = this.svc.stdPityInterceptor.counter;
        const threshold = this.svc.stdPityThreshold;
        const pct = Math.min(100, (counter / threshold) * 100);
        const urgency = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";
        const countEl = document.getElementById("std-pity-count");
        const thresholdEl = document.getElementById("std-pity-threshold-display");
        const barEl = document.getElementById("std-pity-bar");
        if (countEl)
            countEl.textContent = String(counter);
        if (thresholdEl)
            thresholdEl.textContent = String(threshold);
        if (barEl) {
            barEl.style.width = `${pct}%`;
            barEl.style.backgroundColor = urgency;
        }
    }
    // ===== Featured Pity =====
    bindFeaturedPityEvents() {
        const toggle = document.getElementById("feat-pity-toggle");
        if (toggle) {
            toggle.addEventListener("change", () => {
                this.svc.featuredPityEnabled = toggle.checked;
                const display = this.svc.featuredPityEnabled ? "flex" : "none";
                ["feat-pity-config-row", "feat-pity-group-row", "feat-pity-featured-row"].forEach(id => {
                    const el = document.getElementById(id);
                    if (el)
                        el.style.display = display;
                });
                this.svc.rebuildPipeline();
                this.renderFeaturedPityProgress();
            });
        }
        const threshInput = document.getElementById("feat-pity-threshold");
        if (threshInput) {
            threshInput.addEventListener("change", () => {
                this.svc.featuredPityThreshold = Math.max(1, parseInt(threshInput.value) || 1);
                threshInput.value = String(this.svc.featuredPityThreshold);
                this.svc.rebuildPipeline();
                this.renderFeaturedPityProgress();
            });
        }
        const groupSel = document.getElementById("feat-pity-group");
        if (groupSel) {
            groupSel.addEventListener("change", () => {
                this.svc.featuredPityGroupId = groupSel.value || null;
                this.svc.featuredPityFeaturedId = null;
                this.svc.rebuildPipeline();
                this.renderFeaturedPityFeaturedPicker();
                this.renderFeaturedPityProgress();
            });
        }
        const featuredSel = document.getElementById("feat-pity-featured");
        if (featuredSel) {
            featuredSel.addEventListener("change", () => {
                this.svc.featuredPityFeaturedId = featuredSel.value || null;
                this.svc.rebuildPipeline();
                this.renderFeaturedPityProgress();
            });
        }
    }
    renderFeaturedPityConfig() {
        const toggle = document.getElementById("feat-pity-toggle");
        if (toggle)
            toggle.checked = this.svc.featuredPityEnabled;
        const threshInput = document.getElementById("feat-pity-threshold");
        if (threshInput)
            threshInput.value = String(this.svc.featuredPityThreshold);
        const display = this.svc.featuredPityEnabled ? "flex" : "none";
        ["feat-pity-config-row", "feat-pity-group-row", "feat-pity-featured-row"].forEach(id => {
            const el = document.getElementById(id);
            if (el)
                el.style.display = display;
        });
        this.renderFeaturedPityGroupPicker();
        this.renderFeaturedPityFeaturedPicker();
    }
    renderFeaturedPityGroupPicker() {
        const sel = document.getElementById("feat-pity-group");
        if (!sel)
            return;
        const groups = this.svc.rewardNodes.filter(n => n.isGroup && n.children.length >= 2);
        sel.innerHTML = `<option value="">— select group —</option>`
            + groups.map(g => `<option value="${g.id}"${g.id === this.svc.featuredPityGroupId ? " selected" : ""}>${escapeHtml(g.name)}</option>`).join("");
    }
    renderFeaturedPityFeaturedPicker() {
        const sel = document.getElementById("feat-pity-featured");
        if (!sel)
            return;
        const group = this.svc.rewardNodes.find(n => n.id === this.svc.featuredPityGroupId && n.isGroup);
        if (!group) {
            sel.innerHTML = `<option value="">— select group first —</option>`;
            return;
        }
        sel.innerHTML = `<option value="">— select featured reward —</option>`
            + group.children.map(c => `<option value="${c.id}"${c.id === this.svc.featuredPityFeaturedId ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
    }
    renderFeaturedPityProgress() {
        const section = document.getElementById("feat-pity-section");
        if (!section)
            return;
        if (!this.svc.featuredPityEnabled || !this.svc.featuredPityInterceptor) {
            section.style.display = "none";
            return;
        }
        section.style.display = "block";
        const counter = this.svc.featuredPityInterceptor.counter;
        // Progress fills relative to threshold-1 (the point at which next entry is forced).
        const maxMisses = Math.max(1, this.svc.featuredPityThreshold - 1);
        const pct = Math.min(100, (counter / maxMisses) * 100);
        const urgency = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";
        const countEl = document.getElementById("feat-pity-count");
        const maxEl = document.getElementById("feat-pity-max-display");
        const featuredEl = document.getElementById("feat-pity-featured-name");
        const barEl = document.getElementById("feat-pity-bar");
        if (countEl)
            countEl.textContent = String(counter);
        if (maxEl)
            maxEl.textContent = String(maxMisses);
        if (featuredEl)
            featuredEl.textContent =
                `${this.svc.featuredPityInterceptor.featuredName} (${this.svc.featuredPityInterceptor.groupName})`;
        if (barEl) {
            barEl.style.width = `${pct}%`;
            barEl.style.backgroundColor = urgency;
        }
    }
}
document.addEventListener("DOMContentLoaded", () => {
    new RewarderApp().init();
});
