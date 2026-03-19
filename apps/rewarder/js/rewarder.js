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
function defaultRewardItems() {
    return [
        { id: "sr", name: "Super Rare Reward", rate: 1, color: "#f0a830", borderColor: "#f0a830" },
        { id: "rare", name: "Rare Reward", rate: 15, color: "#4f8ef7", borderColor: "#4f8ef7" },
        { id: "common", name: "Common Reward", rate: 84, color: "#8b96a5", borderColor: "#444f5a" },
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
    constructor(items) {
        this.items = items;
    }
    async create(executionContext) {
        const rootNode = new RewardTreeNode(Reward.Empty);
        for (const item of this.items) {
            const node = new RewardTreeNode(new Reward(item.id, item.name));
            rootNode.connect(node, item.rate);
        }
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
        const valid = edges.filter(e => e.weight > 0 && e.target.reward != null);
        if (valid.length === 0)
            return Reward.Empty;
        return valid.reduce((min, e) => e.weight < min.weight ? e : min).target.reward;
    }
}
function buildPipeline(items, pityEnabled, pityThreshold) {
    const treeFactory = new DynamicRewardTreeFactory(items);
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
function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ===== App =====
class RewarderApp {
    constructor() {
        this.rewardItems = defaultRewardItems();
        this.pityEnabled = true;
        this.pityThreshold = 90;
        this.nextItemId = 1;
        this.totalRolls = 0;
        this.rewardCounts = new Map();
        this.history = [];
        this.pityInterceptor = null;
        this.rng = new MathRandomNumberGenerator();
        this.isRolling = false;
    }
    init() {
        this.rebuildPipeline();
        this.bindStaticEvents();
        this.renderAll();
    }
    rebuildPipeline() {
        const { pipeline, pityInterceptor } = buildPipeline(this.rewardItems, this.pityEnabled, this.pityThreshold);
        this.pipeline = pipeline;
        this.pityInterceptor = pityInterceptor;
    }
    configById(id) {
        return this.rewardItems.find(item => item.id === id);
    }
    totalRate() {
        return this.rewardItems.reduce((sum, item) => sum + item.rate, 0);
    }
    isRateValid() {
        return this.rewardItems.length > 0 && Math.abs(this.totalRate() - 100) < 0.001;
    }
    // ===== Events =====
    bindStaticEvents() {
        const pityToggle = document.getElementById("pity-toggle");
        const pityThreshInput = document.getElementById("pity-threshold");
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
        document.getElementById("btn-add-reward").addEventListener("click", () => this.addRewardItem());
        this.bindRewardListEvents();
    }
    bindRewardListEvents() {
        const list = document.getElementById("reward-list");
        if (!list)
            return;
        list.addEventListener("input", (e) => {
            const target = e.target;
            const row = target.closest(".reward-config-row");
            if (!row)
                return;
            const item = this.configById(row.dataset.id);
            if (!item)
                return;
            if (target.classList.contains("reward-rate-input")) {
                item.rate = parseFloat(target.value) || 0;
                this.updateRateSummary();
                this.rebuildPipeline();
            }
            else if (target.classList.contains("reward-color-input")) {
                item.color = target.value;
                this.renderStats();
                this.renderHistory();
            }
            else if (target.classList.contains("reward-border-input")) {
                item.borderColor = target.value;
                this.renderStats();
                this.renderHistory();
            }
        });
        list.addEventListener("change", (e) => {
            const target = e.target;
            const row = target.closest(".reward-config-row");
            if (!row)
                return;
            const item = this.configById(row.dataset.id);
            if (!item)
                return;
            if (target.classList.contains("reward-name-input")) {
                item.name = target.value.trim() || "Reward";
                this.rebuildPipeline();
            }
        });
        list.addEventListener("click", (e) => {
            const btn = e.target.closest(".btn-delete-reward");
            if (!btn)
                return;
            const row = btn.closest(".reward-config-row");
            if (!row)
                return;
            this.removeRewardItem(row.dataset.id);
        });
    }
    addRewardItem() {
        const id = `item-${this.nextItemId++}`;
        this.rewardItems.push({ id, name: "New Reward", rate: 0, color: "#c084fc", borderColor: "#c084fc" });
        this.rebuildPipeline();
        this.renderRewardEditor();
        this.updateRateSummary();
        const input = document.querySelector(`.reward-config-row[data-id="${id}"] .reward-name-input`);
        input?.focus();
        input?.select();
    }
    removeRewardItem(id) {
        this.rewardItems = this.rewardItems.filter(item => item.id !== id);
        this.rebuildPipeline();
        this.renderRewardEditor();
        this.updateRateSummary();
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
    }
    // ===== Renders =====
    renderAll() {
        const row = document.getElementById("pity-config-row");
        if (row)
            row.style.display = this.pityEnabled ? "flex" : "none";
        this.renderRewardEditor();
        this.updateRateSummary();
        this.renderLatestResult(null, 0);
        this.renderStats();
        this.renderPityProgress();
        this.renderHistory();
    }
    renderRewardEditor() {
        const list = document.getElementById("reward-list");
        if (!list)
            return;
        const canDelete = this.rewardItems.length > 1;
        list.innerHTML = this.rewardItems.map(item => `
            <div class="reward-config-row" data-id="${item.id}">
                <div class="color-swatches">
                    <input type="color" class="color-swatch reward-color-input" value="${item.color}" title="Text color">
                    <input type="color" class="color-swatch reward-border-input" value="${item.borderColor}" title="Border color">
                </div>
                <input type="text" class="reward-name-input" value="${escapeHtml(item.name)}" placeholder="Name">
                <div class="reward-rate-group">
                    <input type="number" class="reward-rate-input" value="${item.rate}" min="0" max="100" step="0.01">
                    <span class="rate-unit">%</span>
                </div>
                <button class="btn-delete-reward" title="Remove"${canDelete ? "" : " disabled"}>\u00d7</button>
            </div>
        `).join("");
    }
    updateRateSummary() {
        const total = this.totalRate();
        const totalEl = document.getElementById("total-rate");
        if (totalEl)
            totalEl.textContent = total.toFixed(2);
        const valid = this.isRateValid();
        const warning = document.getElementById("rate-warning");
        if (warning)
            warning.style.display = valid ? "none" : "inline";
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
        const cfg = this.configById(reward.id);
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
        container.innerHTML = this.rewardItems.map(item => {
            const count = this.rewardCounts.get(item.id) ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return `
                <div class="stat-row">
                    <div class="stat-label" style="color:${item.color}">${escapeHtml(item.name)}</div>
                    <div class="stat-bar-track">
                        <div class="stat-bar" style="width:${pct}%;background-color:${item.borderColor}"></div>
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
        const targetName = [...this.rewardItems]
            .filter(i => i.rate > 0)
            .sort((a, b) => a.rate - b.rate)[0]?.name ?? "rarest reward";
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
            const cfg = this.configById(entry.reward.id);
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
