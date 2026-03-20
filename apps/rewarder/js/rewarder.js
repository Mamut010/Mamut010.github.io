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
        if (!config.isGroup) {
            return new RewardTreeNode(new Reward(config.id, config.name));
        }
        const groupNode = new RewardTreeNode();
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
        const pityTree = await new RewardTreeFactory([pityConfig]).create(ctx.exec);
        return ctx.resolver.resolve(pityTree, ctx.exec);
    }
}
function buildPipeline(nodes, pityEnabled, pityThreshold, pityTargetConfig) {
    const treeFactory = new RewardTreeFactory(nodes);
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
// ===== Wheel Spin Mode (Strategy Pattern) =====
class NormalSpinStrategy {
    constructor() {
        this.id = "normal";
        this.label = "Normal";
    }
    execute(wheel, targetIndex) {
        return wheel.spin(targetIndex, { modeId: this.id });
    }
}
class AccelerateSpinStrategy {
    constructor() {
        this.id = "accelerate";
        this.label = "⚡ Fast";
    }
    execute(wheel, targetIndex) {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.accelerate();
        return p;
    }
}
class SkipSpinStrategy {
    constructor() {
        this.id = "skip";
        this.label = "⏭ Skip";
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
            ["normal", new NormalSpinStrategy()],
            ["accelerate", new AccelerateSpinStrategy()],
            ["skip", new SkipSpinStrategy()],
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
    calculate(segAngles) {
        const { start, sweep } = segAngles;
        const margin = sweep * 0.10;
        const TAU = 2 * Math.PI;
        const landingAngle = start + margin + Math.random() * (sweep - 2 * margin);
        return { landingAngle: ((landingAngle % TAU) + TAU) % TAU };
    }
}
/**
 * Lands past the target, then eases back.
 * The wheel appears to overshoot by a small amount then settle.
 */
class OvershootAngleCalculator {
    calculate(segAngles) {
        const { start, sweep } = segAngles;
        // Stay 15% from each edge so the overshoot lands within the same segment.
        const margin = sweep * 0.15;
        const TAU = 2 * Math.PI;
        const landingAngle = start + margin + Math.random() * (sweep - 2 * margin);
        // correctionDelta > 0: forward overshoot, 8–16% of sweep, minimum 0.04 rad.
        const correctionDelta = Math.max(0.04, sweep * (0.08 + Math.random() * 0.08));
        return {
            landingAngle: ((landingAngle % TAU) + TAU) % TAU,
            correctionDelta,
        };
    }
}
/**
 * Stops just short of the target, then nudges forward.
 * The wheel appears to lose momentum right before the target, then creep in.
 */
class UndershootAngleCalculator {
    calculate(segAngles) {
        const { start, sweep } = segAngles;
        // Keep 20% margin from each edge so the undershoot pause stays inside the segment.
        const margin = sweep * 0.20;
        const TAU = 2 * Math.PI;
        const landingAngle = start + margin + Math.random() * (sweep - 2 * margin);
        // correctionDelta < 0: the animation stops this far before landingAngle, then creeps forward.
        const correctionDelta = -Math.max(0.03, sweep * (0.06 + Math.random() * 0.07));
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
        if (context.modeId === "skip")
            return WeightedRandomCalculatorFactory.NATURAL_ONLY;
        const pool = context.modeId === "accelerate"
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
// ===== Spinning Wheel UI =====
class SpinningWheel {
    constructor(canvas, calculatorFactory) {
        this.segments = [];
        this.segAngles = [];
        // Animation state
        this.currentRotation = 0;
        this.spinFromRotation = 0;
        this.finalRotation = 0;
        this.overshootRotation = null;
        this.phase1StartTime = 0;
        this.phase1Duration = 0;
        this.phase2StartTime = 0;
        this.phase2Duration = 0;
        this.inPhase2 = false;
        this.rafId = null;
        this.resolveSpinPromise = null;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.calculatorFactory = calculatorFactory;
        this.draw();
    }
    // ===== Public API =====
    setSegments(segments) {
        this.segments = segments;
        this.segAngles = this.computeAngles(segments);
        // Only redraw if not currently spinning (avoid interrupting the animation)
        if (this.rafId === null)
            this.draw();
    }
    findSegmentIndex(rewardId) {
        const idx = this.segments.findIndex(s => s.id === rewardId);
        return idx >= 0 ? idx : 0;
    }
    /** Start spin animation to targetIndex. Returns a Promise that resolves when done. */
    spin(targetIndex, context) {
        // Cancel any previous in-flight animation
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        const oldResolve = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        oldResolve?.();
        const TAU = 2 * Math.PI;
        const angles = this.segAngles[targetIndex] ?? { start: 0, mid: 0, sweep: TAU };
        const calculator = this.calculatorFactory.create(context);
        const landing = calculator.calculate(angles);
        // Compute how much to rotate so that landing.landingAngle faces the pointer at top.
        // A wheel-space angle `a` is under the pointer when: a + rot ≡ 0 (mod 2π)  ⟹  rot ≡ -a
        const targetRot = ((-landing.landingAngle % TAU) + TAU) % TAU;
        const currentNorm = ((this.currentRotation % TAU) + TAU) % TAU;
        let delta = targetRot - currentNorm;
        if (delta <= 0)
            delta += TAU;
        delta += SpinningWheel.MIN_SPINS * TAU;
        this.inPhase2 = false;
        this.spinFromRotation = this.currentRotation;
        this.finalRotation = this.currentRotation + delta;
        if (landing.correctionDelta != null && landing.correctionDelta !== 0) {
            // positive correctionDelta → overshoot (wheel goes past, phase 2 eases back)
            // negative correctionDelta → undershoot (wheel stops short, phase 2 nudges forward)
            this.overshootRotation = this.finalRotation + landing.correctionDelta;
            this.phase1Duration = SpinningWheel.NORMAL_DURATION * SpinningWheel.PHASE1_FRAC;
            this.phase2Duration = SpinningWheel.NORMAL_DURATION * (1 - SpinningWheel.PHASE1_FRAC);
        }
        else {
            this.overshootRotation = null;
            this.phase1Duration = SpinningWheel.NORMAL_DURATION;
            this.phase2Duration = 0;
        }
        this.phase1StartTime = performance.now();
        return new Promise(resolve => {
            this.resolveSpinPromise = resolve;
            this.scheduleFrame();
        });
    }
    /** Speed up the current spin so it finishes within ACCEL_CAP_MS. */
    accelerate() {
        if (this.rafId === null)
            return;
        // If already in the bounce-back phase, just snap to final.
        if (this.inPhase2) {
            this.finishSpin();
            return;
        }
        const elapsed = performance.now() - this.phase1StartTime;
        if (elapsed >= this.phase1Duration)
            return;
        // Rebase from the current visual position, targeting finalRotation (droppping bounce).
        const phase1Target = this.overshootRotation ?? this.finalRotation;
        const t = Math.min(elapsed / this.phase1Duration, 1);
        const curPos = this.spinFromRotation + this.easeOutQuart(t) * (phase1Target - this.spinFromRotation);
        this.overshootRotation = null;
        this.phase2Duration = 0;
        this.spinFromRotation = curPos;
        this.currentRotation = curPos;
        this.phase1StartTime = performance.now();
        this.phase1Duration = SpinningWheel.ACCEL_CAP_MS;
    }
    /** Instantly jump to the final position and resolve the spin promise. */
    skip() {
        if (this.rafId === null)
            return;
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.finishSpin();
    }
    // ===== Drawing =====
    draw() {
        const { canvas, ctx } = this;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const r = Math.min(cx, cy) - 18; // leave room for the pointer above the wheel
        ctx.clearRect(0, 0, W, H);
        if (this.segments.length === 0) {
            // Draw an empty placeholder ring
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.strokeStyle = "#2a2a5a";
            ctx.lineWidth = 2;
            ctx.stroke();
            this.drawPointer(cx, cy, r);
            return;
        }
        const rot = this.currentRotation;
        const offset = -Math.PI / 2; // rotate so angle 0 points to the top
        // ── Draw filled segments ──────────────────────────────────────────────
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            const angles = this.segAngles[i];
            const startA = angles.start + rot + offset;
            const endA = startA + angles.sweep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startA, endA);
            ctx.closePath();
            ctx.fillStyle = seg.borderColor || "#334155";
            ctx.fill();
            // Subtle light sheen so dark colors remain distinguishable
            ctx.fillStyle = "rgba(255,255,255,0.06)";
            ctx.fill();
            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        // ── Draw text labels ──────────────────────────────────────────────────
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            const angles = this.segAngles[i];
            const midA = angles.mid + rot + offset;
            const txtR = r * 0.62;
            const arcLen = angles.sweep * txtR; // arc length at label radius
            // Font adapts to both canvas size and available arc length.
            const fontSize = Math.max(8, Math.min(13, r * 0.09, arcLen * 0.45));
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
            ctx.shadowBlur = 4;
            ctx.fillStyle = "#ffffff";
            ctx.fillText(label, 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        }
        // ── Outer ring ────────────────────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "#4a4a8a";
        ctx.lineWidth = 3;
        ctx.stroke();
        // ── Center cap ───────────────────────────────────────────────────────
        const capR = r * 0.10;
        ctx.beginPath();
        ctx.arc(cx, cy, capR, 0, 2 * Math.PI);
        ctx.fillStyle = "#0f172a";
        ctx.fill();
        ctx.strokeStyle = "#c084fc";
        ctx.lineWidth = 2;
        ctx.stroke();
        this.drawPointer(cx, cy, r);
    }
    drawPointer(cx, cy, r) {
        const ctx = this.ctx;
        const tipY = cy - r - 2; // tip just above the outer ring
        const baseY = tipY - 13; // base of the triangle
        ctx.beginPath();
        ctx.moveTo(cx, tipY);
        ctx.lineTo(cx - 9, baseY);
        ctx.lineTo(cx + 9, baseY);
        ctx.closePath();
        ctx.shadowColor = "rgba(192,132,252,0.7)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#c084fc";
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    // ===== Animation internals =====
    scheduleFrame() {
        this.rafId = requestAnimationFrame(() => this.frame());
    }
    frame() {
        const now = performance.now();
        if (!this.inPhase2) {
            // Phase 1: forward spin toward overshootRotation (bounce) or finalRotation (no bounce).
            const phase1Target = this.overshootRotation ?? this.finalRotation;
            const elapsed = now - this.phase1StartTime;
            if (elapsed >= this.phase1Duration) {
                this.currentRotation = phase1Target;
                this.draw();
                if (this.overshootRotation != null) {
                    // Transition to phase 2: ease back to finalRotation.
                    this.inPhase2 = true;
                    this.spinFromRotation = phase1Target;
                    this.phase2StartTime = now;
                    this.scheduleFrame();
                }
                else {
                    this.finishSpin();
                }
                return;
            }
            const t = elapsed / this.phase1Duration;
            this.currentRotation = this.spinFromRotation + this.easeOutQuart(t) * (phase1Target - this.spinFromRotation);
        }
        else {
            // Phase 2: gentle ease-back from overshootRotation to finalRotation.
            const elapsed = now - this.phase2StartTime;
            if (elapsed >= this.phase2Duration) {
                this.finishSpin();
                return;
            }
            const t = elapsed / this.phase2Duration;
            this.currentRotation = this.spinFromRotation + this.easeInQuad(t) * (this.finalRotation - this.spinFromRotation);
        }
        this.draw();
        this.scheduleFrame();
    }
    finishSpin() {
        this.currentRotation = this.finalRotation;
        this.inPhase2 = false;
        this.overshootRotation = null;
        this.rafId = null;
        this.draw();
        const resolve = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        resolve?.();
    }
    /** Ease-out quart: fast start, dramatic slow-down at the end. */
    easeOutQuart(t) {
        return 1 - Math.pow(1 - Math.min(t, 1), 4);
    }
    /** Ease-in quad: starts slow then accelerates (used for the bounce-back phase). */
    easeInQuad(t) {
        return Math.min(t, 1) ** 2;
    }
    // ===== Helpers =====
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
SpinningWheel.NORMAL_DURATION = 4000; // ms for a full spin
SpinningWheel.ACCEL_CAP_MS = 900; // max remaining ms after accelerate()
SpinningWheel.MIN_SPINS = 6; // minimum full rotations before stopping
SpinningWheel.PHASE1_FRAC = 0.92; // fraction of total duration for forward spin
SpinningWheel.MIN_SEG_FRAC = 0.028; // minimum visual fraction per segment (~10°)
// ===== Rewarder Service =====
// Owns all application state and business logic. No DOM access.
class RewarderService {
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
        this.profiles = [];
        this.activeProfileId = "";
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
        const { pipeline, pityInterceptor } = buildPipeline(this.rewardNodes, this.pityEnabled, this.pityThreshold, targetConfig);
        this.pipeline = pipeline;
        this.pityInterceptor = pityInterceptor;
        if (this.pityInterceptor) {
            this.pityTargetId = this.pityInterceptor.targetId;
        }
        this.saveProfileConfig();
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
        this.rewardNodes.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color: "#c084fc", borderColor: "#c084fc", children: [],
        });
        return id;
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
        return gid;
    }
    addChildToGroup(groupId) {
        const group = this.findNode(groupId);
        if (!group || !group.isGroup)
            return null;
        const id = `leaf-${this.nextId++}`;
        group.children.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color: "#c084fc", borderColor: "#c084fc", children: [],
        });
        return id;
    }
    removeNode(id) {
        if (this.rewardNodes.length > 1) {
            const idx = this.rewardNodes.findIndex(n => n.id === id);
            if (idx !== -1) {
                this.rewardNodes.splice(idx, 1);
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
        this.spinStrategy = this.spinModeFactory.create("normal");
        this.wheel = new SpinningWheel(document.getElementById("wheel-canvas"), this.calculatorFactory);
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
                target.value = String(node.rate);
                this.updateEffectiveRatesInPlace();
                this.updateRateSummary();
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
            }
        });
        list.addEventListener("click", (e) => {
            const target = e.target;
            if (target.closest(".btn-delete-reward")) {
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
        this.renderHistory();
    }
    updateEffectiveRatesInPlace() {
        for (const node of this.svc.rewardNodes) {
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
        list.innerHTML = this.svc.rewardNodes.map(node => this.renderRootNode(node)).join("");
        this.renderPityTargetPicker();
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
        const rootTotal = this.svc.rootTotalRate();
        const totalEl = document.getElementById("total-rate");
        if (totalEl)
            totalEl.textContent = rootTotal.toFixed(2);
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
            sumEl.textContent = `\u03a3 ${childSum.toFixed(2)}% ${ok ? "\u2713" : "\u26a0"}`;
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
}
document.addEventListener("DOMContentLoaded", () => {
    new RewarderApp().init();
});
