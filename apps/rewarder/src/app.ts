// ===== Reward Item Config =====

interface RewardItemConfig {
    id: string;
    name: string;
    rate: number;         // percentage (0–100)
    color: string;        // text / foreground color
    borderColor: string;  // card border & accent color
}

function defaultRewardItems(): RewardItemConfig[] {
    return [
        { id: "sr",     name: "Super Rare Reward", rate: 1,  color: "#f0a830", borderColor: "#f0a830" },
        { id: "rare",   name: "Rare Reward",        rate: 15, color: "#4f8ef7", borderColor: "#4f8ef7" },
        { id: "common", name: "Common Reward",      rate: 84, color: "#8b96a5", borderColor: "#444f5a" },
    ];
}

// ===== Reward Domain =====

class Reward {
    public constructor(
        public readonly id: string,
        public readonly name: string,
    ) {}

    public static get Empty(): Reward {
        return new Reward("__empty__", "");
    }

    public equals(other: Reward): boolean {
        return this.id === other.id;
    }
}

class DynamicRewardTreeFactory implements IRewardTreeFactory<Reward> {
    public constructor(public readonly items: readonly RewardItemConfig[]) {}

    public async create(executionContext: RewardExecutionContext): Promise<IRewardTree<Reward>> {
        const rootNode = new RewardTreeNode<Reward>(Reward.Empty);
        for (const item of this.items) {
            const node = new RewardTreeNode(new Reward(item.id, item.name));
            rootNode.connect(node, item.rate);
        }
        return new RewardTree(rootNode);
    }
}

class HardPityInterceptor implements IRewardInterceptor<Reward> {
    private _counter = 0;

    public get counter(): number { return this._counter; }

    public constructor(private _threshold: number) {}

    public async intercept(
        ctx: RewardPipelineContext<Reward>,
        next: RewardNextHandler<Reward>,
    ): Promise<RewardResult<Reward>> {
        const edges = ctx.tree.root.outgoingEdges;
        if (edges.length === 0) return next(ctx);

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

    public getLeastWeightedReward(edges: readonly IRewardTreeEdge<Reward>[]): Reward {
        const valid = edges.filter(e => e.weight > 0 && e.target.reward != null);
        if (valid.length === 0) return Reward.Empty;
        return valid.reduce((min, e) => e.weight < min.weight ? e : min).target.reward!;
    }
}

// ===== Pipeline Factory =====

function buildPipeline(
    items: readonly RewardItemConfig[],
    pityEnabled: boolean,
    pityThreshold: number,
): { pipeline: RewardPipeline<Reward>; pityInterceptor: HardPityInterceptor | null } {
    const treeFactory = new DynamicRewardTreeFactory(items);
    const walker      = new WeightedUntilLeafTreeWalker<Reward>(new BaseEdgeProvider<Reward>());
    const collector   = new SubtreeRewardCollector<Reward>();
    const resolver    = new RewardResolver<Reward>(walker, collector);
    const pipeline    = new RewardPipeline(treeFactory, resolver);

    let pityInterceptor: HardPityInterceptor | null = null;
    if (pityEnabled) {
        pityInterceptor = new HardPityInterceptor(pityThreshold);
        pipeline.setInterceptors([pityInterceptor]);
    }

    return { pipeline, pityInterceptor };
}

// ===== App =====

interface RollRecord {
    rollNum: number;
    reward: Reward;
}

class RewarderApp {
    private rewardItems: RewardItemConfig[] = defaultRewardItems();
    private pityEnabled   = true;
    private pityThreshold = 90;
    private nextItemId    = 1;

    private totalRolls   = 0;
    private rewardCounts = new Map<string, number>();
    private history: RollRecord[] = [];

    private pipeline!: RewardPipeline<Reward>;
    private pityInterceptor: HardPityInterceptor | null = null;
    private rng       = new MathRandomNumberGenerator();
    private isRolling = false;

    public init(): void {
        this.rebuildPipeline();
        this.bindStaticEvents();
        this.renderAll();
    }

    private rebuildPipeline(): void {
        const { pipeline, pityInterceptor } = buildPipeline(
            this.rewardItems,
            this.pityEnabled,
            this.pityThreshold,
        );
        this.pipeline = pipeline;
        this.pityInterceptor = pityInterceptor;
    }

    private configById(id: string): RewardItemConfig | undefined {
        return this.rewardItems.find(item => item.id === id);
    }

    private totalRate(): number {
        return this.rewardItems.reduce((sum, item) => sum + item.rate, 0);
    }

    private isRateValid(): boolean {
        return this.rewardItems.length > 0 && Math.abs(this.totalRate() - 100) < 0.001;
    }

    // ===== Events =====

    private bindStaticEvents(): void {
        const pityToggle      = document.getElementById("pity-toggle")    as HTMLInputElement;
        const pityThreshInput = document.getElementById("pity-threshold") as HTMLInputElement;

        pityToggle.addEventListener("change", () => {
            this.pityEnabled = pityToggle.checked;
            const row = document.getElementById("pity-config-row");
            if (row) row.style.display = this.pityEnabled ? "flex" : "none";
            this.rebuildPipeline();
            this.renderPityProgress();
        });

        pityThreshInput.addEventListener("change", () => {
            this.pityThreshold = Math.max(1, parseInt(pityThreshInput.value) || 1);
            pityThreshInput.value = String(this.pityThreshold);
            this.rebuildPipeline();
            this.renderPityProgress();
        });

        document.getElementById("btn-roll")!.addEventListener("click",    () => this.doRolls(1));
        document.getElementById("btn-roll-10")!.addEventListener("click", () => this.doRolls(10));
        document.getElementById("btn-roll-100")!.addEventListener("click",() => this.doRolls(100));
        document.getElementById("btn-reset")!.addEventListener("click",   () => this.resetStats());
        document.getElementById("btn-add-reward")!.addEventListener("click", () => this.addRewardItem());

        this.bindRewardListEvents();
    }

    private bindRewardListEvents(): void {
        const list = document.getElementById("reward-list");
        if (!list) return;

        list.addEventListener("input", (e) => {
            const target = e.target as HTMLElement;
            const row = target.closest<HTMLElement>(".reward-config-row");
            if (!row) return;
            const item = this.configById(row.dataset.id!);
            if (!item) return;

            if (target.classList.contains("reward-rate-input")) {
                item.rate = parseFloat((target as HTMLInputElement).value) || 0;
                this.updateRateSummary();
                this.rebuildPipeline();
            } else if (target.classList.contains("reward-color-input")) {
                item.color = (target as HTMLInputElement).value;
                this.renderStats();
                this.renderHistory();
            } else if (target.classList.contains("reward-border-input")) {
                item.borderColor = (target as HTMLInputElement).value;
                this.renderStats();
                this.renderHistory();
            }
        });

        list.addEventListener("change", (e) => {
            const target = e.target as HTMLElement;
            const row = target.closest<HTMLElement>(".reward-config-row");
            if (!row) return;
            const item = this.configById(row.dataset.id!);
            if (!item) return;

            if (target.classList.contains("reward-name-input")) {
                item.name = (target as HTMLInputElement).value.trim() || "Reward";
                this.rebuildPipeline();
            }
        });

        list.addEventListener("click", (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>(".btn-delete-reward");
            if (!btn) return;
            const row = btn.closest<HTMLElement>(".reward-config-row");
            if (!row) return;
            this.removeRewardItem(row.dataset.id!);
        });
    }

    private addRewardItem(): void {
        const id = `item-${this.nextItemId++}`;
        this.rewardItems.push({ id, name: "New Reward", rate: 0, color: "#c084fc", borderColor: "#c084fc" });
        this.rebuildPipeline();
        this.renderRewardEditor();
        this.updateRateSummary();
        const input = document.querySelector<HTMLInputElement>(`.reward-config-row[data-id="${id}"] .reward-name-input`);
        input?.focus();
        input?.select();
    }

    private removeRewardItem(id: string): void {
        this.rewardItems = this.rewardItems.filter(item => item.id !== id);
        this.rebuildPipeline();
        this.renderRewardEditor();
        this.updateRateSummary();
    }

    // ===== Rolls =====

    private async doRolls(count: number): Promise<void> {
        if (this.isRolling || !this.isRateValid()) return;

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
            if (this.history.length > 200) this.history.pop();

            if (animate) {
                this.renderLatestResult(reward, rollNum);
                this.renderStats();
                this.renderPityProgress();
                if (i < count - 1) await sleep(130);
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

    private setRollButtonsDisabled(disabled: boolean): void {
        ["btn-roll", "btn-roll-10", "btn-roll-100"].forEach(id => {
            const btn = document.getElementById(id) as HTMLButtonElement | null;
            if (btn) btn.disabled = disabled;
        });
    }

    private resetStats(): void {
        this.totalRolls  = 0;
        this.rewardCounts = new Map();
        this.history     = [];
        this.rebuildPipeline();
        this.renderLatestResult(null, 0);
        this.renderStats();
        this.renderPityProgress();
        this.renderHistory();
    }

    // ===== Renders =====

    private renderAll(): void {
        const row = document.getElementById("pity-config-row");
        if (row) row.style.display = this.pityEnabled ? "flex" : "none";
        this.renderRewardEditor();
        this.updateRateSummary();
        this.renderLatestResult(null, 0);
        this.renderStats();
        this.renderPityProgress();
        this.renderHistory();
    }

    private renderRewardEditor(): void {
        const list = document.getElementById("reward-list");
        if (!list) return;

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

    private updateRateSummary(): void {
        const total = this.totalRate();
        const totalEl = document.getElementById("total-rate");
        if (totalEl) totalEl.textContent = total.toFixed(2);

        const valid = this.isRateValid();
        const warning = document.getElementById("rate-warning");
        if (warning) warning.style.display = valid ? "none" : "inline";

        this.setRollButtonsDisabled(!valid || this.isRolling);
    }

    private renderLatestResult(reward: Reward | null, rollNum: number): void {
        const container = document.getElementById("latest-result");
        if (!container) return;

        if (!reward) {
            container.innerHTML = `<div class="idle-msg">Roll to get started!</div>`;
            return;
        }

        const cfg         = this.configById(reward.id);
        const color       = cfg?.color       ?? "#eee";
        const borderColor = cfg?.borderColor ?? "#444";

        container.innerHTML = `
            <div class="reward-card" style="--rarity-color:${borderColor};--text-color:${color}">
                <div class="reward-name">${escapeHtml(reward.name)}</div>
                <div class="reward-roll-num">Roll #${rollNum}</div>
            </div>
        `;

        const card = container.querySelector<HTMLElement>(".reward-card");
        if (card) {
            void card.offsetWidth;
            card.classList.add("pop-in");
        }
    }

    private renderStats(): void {
        const total = this.totalRolls;
        const totalEl = document.getElementById("stat-total");
        if (totalEl) totalEl.textContent = String(total);

        const container = document.getElementById("stats-rows");
        if (!container) return;

        container.innerHTML = this.rewardItems.map(item => {
            const count = this.rewardCounts.get(item.id) ?? 0;
            const pct   = total > 0 ? (count / total) * 100 : 0;
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

    private renderPityProgress(): void {
        const section = document.getElementById("pity-section");
        if (!section) return;

        if (!this.pityEnabled || !this.pityInterceptor) {
            section.style.display = "none";
            return;
        }
        section.style.display = "block";

        const counter   = this.pityInterceptor.counter;
        const threshold = this.pityThreshold;
        const pct     = Math.min(100, (counter / threshold) * 100);
        const urgency = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";

        const targetName = [...this.rewardItems]
            .filter(i => i.rate > 0)
            .sort((a, b) => a.rate - b.rate)[0]?.name ?? "rarest reward";

        const countEl     = document.getElementById("pity-count");
        const thresholdEl = document.getElementById("pity-threshold-display");
        const targetEl    = document.getElementById("pity-target-name");
        const barEl       = document.getElementById("pity-bar") as HTMLElement | null;

        if (countEl)     countEl.textContent     = String(counter);
        if (thresholdEl) thresholdEl.textContent = String(threshold);
        if (targetEl)    targetEl.textContent    = targetName;
        if (barEl) {
            barEl.style.width           = `${pct}%`;
            barEl.style.backgroundColor = urgency;
        }
    }

    private renderHistory(): void {
        const container = document.getElementById("history-log");
        if (!container) return;

        if (this.history.length === 0) {
            container.innerHTML = `<div class="history-empty">No rolls yet</div>`;
            return;
        }

        container.innerHTML = this.history.slice(0, 60).map(entry => {
            const cfg         = this.configById(entry.reward.id);
            const color       = cfg?.color       ?? "#eee";
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

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener("DOMContentLoaded", () => {
    new RewarderApp().init();
});
