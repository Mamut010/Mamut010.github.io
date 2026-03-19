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
// ===== Reward Domain =====
const Rarity = {
    SuperRare: "Super Rare",
    Rare: "Rare",
    Common: "Common",
};
const RarityConfig = {
    [Rarity.Common]: { label: "Common", color: "#8b96a5", emoji: "⚪" },
    [Rarity.Rare]: { label: "Rare", color: "#4f8ef7", emoji: "🔵" },
    [Rarity.SuperRare]: { label: "Super Rare", color: "#f0a830", emoji: "⭐" },
};
class Reward {
    constructor(name, rarity) {
        this.name = name;
        this.rarity = rarity;
    }
    static get Empty() {
        return new Reward("", Rarity.Common);
    }
    equals(other) {
        return this.name === other.name;
    }
}
class FixedRateRewardTreeFactory {
    constructor(rates) {
        this.rates = rates;
    }
    async create(executionContext) {
        const commonNode = new RewardTreeNode(new Reward("Common Reward", Rarity.Common));
        const rareNode = new RewardTreeNode(new Reward("Rare Reward", Rarity.Rare));
        const superRareNode = new RewardTreeNode(new Reward("Super Rare Reward", Rarity.SuperRare));
        const rootNode = new RewardTreeNode(Reward.Empty);
        rootNode.connect(commonNode, this.rates.get(Rarity.Common) ?? 0);
        rootNode.connect(rareNode, this.rates.get(Rarity.Rare) ?? 0);
        rootNode.connect(superRareNode, this.rates.get(Rarity.SuperRare) ?? 0);
        return new RewardTree(rootNode);
    }
}
class HardPityInterceptor {
    get counter() { return this._counter; }
    constructor(_threshold) {
        this._threshold = _threshold;
        this._counter = 0;
    }
    async intercept(ctx, next) {
        const edges = ctx.tree.root.outgoingEdges;
        if (edges.length === 0)
            return next(ctx);
        const leastReward = this.getLeastWeightedReward(edges);
        const result = await next(ctx);
        if (result.rewards.some(r => r.equals(leastReward))) {
            this._counter = 0;
            return result;
        }
        if (this._counter + 1 < this._threshold) {
            this._counter++;
            return result;
        }
        this._counter = 0;
        return { rewards: [leastReward], path: result.path };
    }
    getLeastWeightedReward(edges) {
        const valid = edges.filter(e => e.weight > 0 && e.target.reward);
        return valid.reduce((min, e) => e.weight < min.weight ? e : min, valid[0]).target.reward;
    }
}
// ===== Pipeline Factory =====
function buildPipeline(superRarePct, rarePct, pityEnabled, pityThreshold) {
    const commonPct = 100 - superRarePct - rarePct;
    const rates = new Map([
        [Rarity.SuperRare, superRarePct],
        [Rarity.Rare, rarePct],
        [Rarity.Common, commonPct],
    ]);
    const treeFactory = new FixedRateRewardTreeFactory(rates);
    const walker = new WeightedUntilLeafTreeWalker(new BaseEdgeProvider());
    const collector = new SubtreeRewardCollector();
    const resolver = new RewardResolver(walker, collector);
    const pipeline = new RewardPipeline(treeFactory, resolver);
    let pityInterceptor = null;
    if (pityEnabled) {
        pityInterceptor = new HardPityInterceptor(pityThreshold);
        pipeline.setInterceptors([pityInterceptor]);
    }
    return { pipeline, pityInterceptor };
}
class RewarderApp {
    constructor() {
        this.superRarePct = 1.00;
        this.rarePct = 15.00;
        this.pityEnabled = true;
        this.pityThreshold = 90;
        this.totalRolls = 0;
        this.rarityCounts = new Map([
            [Rarity.Common, 0],
            [Rarity.Rare, 0],
            [Rarity.SuperRare, 0],
        ]);
        this.history = [];
        this.pityInterceptor = null;
        this.rng = new MathRandomNumberGenerator();
        this.isRolling = false;
    }
    init() {
        this.rebuildPipeline();
        this.bindEvents();
        this.renderAll();
    }
    rebuildPipeline() {
        const { pipeline, pityInterceptor } = buildPipeline(this.superRarePct, this.rarePct, this.pityEnabled, this.pityThreshold);
        this.pipeline = pipeline;
        this.pityInterceptor = pityInterceptor;
    }
    bindEvents() {
        const srInput = document.getElementById("sr-rate");
        const rareInput = document.getElementById("rare-rate");
        const pityToggle = document.getElementById("pity-toggle");
        const pityThreshInput = document.getElementById("pity-threshold");
        const onRateChange = () => {
            this.superRarePct = parseFloat(srInput.value) || 0;
            this.rarePct = parseFloat(rareInput.value) || 0;
            this.rebuildPipeline();
            this.updateRateDisplay();
            this.renderPityProgress();
        };
        srInput.addEventListener("input", onRateChange);
        srInput.addEventListener("change", onRateChange);
        rareInput.addEventListener("input", onRateChange);
        rareInput.addEventListener("change", onRateChange);
        pityToggle.addEventListener("change", () => {
            this.pityEnabled = pityToggle.checked;
            const row = document.getElementById("pity-config-row");
            if (row)
                row.style.display = this.pityEnabled ? "flex" : "none";
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
    }
    updateRateDisplay() {
        const commonPct = 100 - this.superRarePct - this.rarePct;
        const display = document.getElementById("common-rate-display");
        if (display)
            display.textContent = commonPct.toFixed(2) + "%";
        const invalid = commonPct < 0 || this.superRarePct < 0 || this.rarePct < 0;
        const warning = document.getElementById("rate-warning");
        if (warning)
            warning.style.display = invalid ? "block" : "none";
        const rollIds = ["btn-roll", "btn-roll-10", "btn-roll-100"];
        rollIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn)
                btn.disabled = invalid || this.isRolling;
        });
    }
    async doRolls(count) {
        if (this.isRolling)
            return;
        if (100 - this.superRarePct - this.rarePct < 0)
            return;
        this.isRolling = true;
        this.setRollButtonsDisabled(true);
        const ANIMATED_MAX = 10;
        const animate = count <= ANIMATED_MAX;
        for (let i = 0; i < count; i++) {
            const result = await this.pipeline.invoke({ rng: this.rng });
            const reward = result.rewards[0] ?? new Reward("Unknown", Rarity.Common);
            const rollNum = ++this.totalRolls;
            this.rarityCounts.set(reward.rarity, (this.rarityCounts.get(reward.rarity) ?? 0) + 1);
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
        this.rarityCounts = new Map([
            [Rarity.Common, 0],
            [Rarity.Rare, 0],
            [Rarity.SuperRare, 0],
        ]);
        this.history = [];
        this.rebuildPipeline();
        this.renderAll();
    }
    renderAll() {
        const row = document.getElementById("pity-config-row");
        if (row)
            row.style.display = this.pityEnabled ? "flex" : "none";
        this.updateRateDisplay();
        this.renderLatestResult(null, 0);
        this.renderStats();
        this.renderPityProgress();
        this.renderHistory();
    }
    renderLatestResult(reward, rollNum) {
        const container = document.getElementById("latest-result");
        if (!container)
            return;
        if (!reward) {
            container.innerHTML = `<div class="idle-msg">Roll to get started!</div>`;
            return;
        }
        const cfg = RarityConfig[reward.rarity];
        const key = rarityKey(reward.rarity);
        container.innerHTML = `
            <div class="reward-card rarity-${key}" style="--rarity-color:${cfg.color}">
                <div class="reward-emoji">${cfg.emoji}</div>
                <div class="reward-name">${reward.name}</div>
                <div class="reward-rarity">${reward.rarity}</div>
                <div class="reward-roll-num">Roll #${rollNum}</div>
            </div>
        `;
        const card = container.querySelector(".reward-card");
        if (card) {
            card.classList.remove("pop-in");
            void card.offsetWidth; // force reflow
            card.classList.add("pop-in");
        }
    }
    renderStats() {
        const total = this.totalRolls;
        const totalEl = document.getElementById("stat-total");
        if (totalEl)
            totalEl.textContent = String(total);
        for (const rarity of Object.values(Rarity)) {
            const count = this.rarityCounts.get(rarity) ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const key = rarityKey(rarity);
            const cfg = RarityConfig[rarity];
            const countEl = document.getElementById(`stat-count-${key}`);
            const pctEl = document.getElementById(`stat-pct-${key}`);
            const barEl = document.getElementById(`stat-bar-${key}`);
            if (countEl)
                countEl.textContent = String(count);
            if (pctEl)
                pctEl.textContent = `${pct.toFixed(1)}%`;
            if (barEl) {
                barEl.style.width = `${pct}%`;
                barEl.style.backgroundColor = cfg.color;
            }
        }
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
        const countEl = document.getElementById("pity-count");
        const thresholdEl = document.getElementById("pity-threshold-display");
        const barEl = document.getElementById("pity-bar");
        if (countEl)
            countEl.textContent = String(counter);
        if (thresholdEl)
            thresholdEl.textContent = String(threshold);
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
            const cfg = RarityConfig[entry.reward.rarity];
            const key = rarityKey(entry.reward.rarity);
            return `
                <div class="history-entry history-${key}">
                    <span class="history-num">#${entry.rollNum}</span>
                    <span class="history-icon">${cfg.emoji}</span>
                    <span class="history-reward">${entry.reward.name}</span>
                    <span class="history-rarity" style="color:${cfg.color}">${entry.reward.rarity}</span>
                </div>
            `;
        }).join("");
    }
}
function rarityKey(rarity) {
    return rarity.toLowerCase().replace(" ", "-");
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
document.addEventListener("DOMContentLoaded", () => {
    const app = new RewarderApp();
    app.init();
});
