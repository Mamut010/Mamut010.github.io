// ===== Reward Domain =====

const Rarity = {
    SuperRare: "Super Rare",
    Rare: "Rare",
    Common: "Common",
} as const;
type Rarity = typeof Rarity[keyof typeof Rarity];

const RarityConfig: Record<Rarity, { label: string; color: string; emoji: string }> = {
    [Rarity.Common]:    { label: "Common",     color: "#8b96a5", emoji: "⚪" },
    [Rarity.Rare]:      { label: "Rare",        color: "#4f8ef7", emoji: "🔵" },
    [Rarity.SuperRare]: { label: "Super Rare",  color: "#f0a830", emoji: "⭐" },
};

class Reward {
    public constructor(
        public readonly name: string,
        public readonly rarity: Rarity,
    ) {}

    public static get Empty(): Reward {
        return new Reward("", Rarity.Common);
    }

    public equals(other: Reward): boolean {
        return this.name === other.name;
    }
}

class FixedRateRewardTreeFactory implements IRewardTreeFactory<Reward> {
    public constructor(public readonly rates: ReadonlyMap<Rarity, number>) {}

    public async create(executionContext: RewardExecutionContext): Promise<IRewardTree<Reward>> {
        const commonNode    = new RewardTreeNode(new Reward("Common Reward",     Rarity.Common));
        const rareNode      = new RewardTreeNode(new Reward("Rare Reward",       Rarity.Rare));
        const superRareNode = new RewardTreeNode(new Reward("Super Rare Reward", Rarity.SuperRare));
        const rootNode      = new RewardTreeNode<Reward>(Reward.Empty);

        rootNode.connect(commonNode,    this.rates.get(Rarity.Common)    ?? 0);
        rootNode.connect(rareNode,      this.rates.get(Rarity.Rare)      ?? 0);
        rootNode.connect(superRareNode, this.rates.get(Rarity.SuperRare) ?? 0);

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

    private getLeastWeightedReward(edges: readonly IRewardTreeEdge<Reward>[]): Reward {
        const valid = edges.filter(e => e.weight > 0 && e.target.reward);
        return valid.reduce((min, e) => e.weight < min.weight ? e : min, valid[0]).target.reward!;
    }
}

// ===== Pipeline Factory =====

function buildPipeline(
    superRarePct: number,
    rarePct: number,
    pityEnabled: boolean,
    pityThreshold: number,
): { pipeline: RewardPipeline<Reward>; pityInterceptor: HardPityInterceptor | null } {
    const commonPct = 100 - superRarePct - rarePct;
    const rates = new Map<Rarity, number>([
        [Rarity.SuperRare, superRarePct],
        [Rarity.Rare,      rarePct],
        [Rarity.Common,    commonPct],
    ]);

    const treeFactory = new FixedRateRewardTreeFactory(rates);
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
    private superRarePct = 1.00;
    private rarePct      = 15.00;
    private pityEnabled  = true;
    private pityThreshold = 90;

    private totalRolls = 0;
    private rarityCounts = new Map<Rarity, number>([
        [Rarity.Common,    0],
        [Rarity.Rare,      0],
        [Rarity.SuperRare, 0],
    ]);
    private history: RollRecord[] = [];

    private pipeline!: RewardPipeline<Reward>;
    private pityInterceptor: HardPityInterceptor | null = null;
    private rng = new MathRandomNumberGenerator();
    private isRolling = false;

    public init(): void {
        this.rebuildPipeline();
        this.bindEvents();
        this.renderAll();
    }

    private rebuildPipeline(): void {
        const { pipeline, pityInterceptor } = buildPipeline(
            this.superRarePct,
            this.rarePct,
            this.pityEnabled,
            this.pityThreshold,
        );
        this.pipeline = pipeline;
        this.pityInterceptor = pityInterceptor;
    }

    private bindEvents(): void {
        const srInput         = document.getElementById("sr-rate")        as HTMLInputElement;
        const rareInput       = document.getElementById("rare-rate")      as HTMLInputElement;
        const pityToggle      = document.getElementById("pity-toggle")    as HTMLInputElement;
        const pityThreshInput = document.getElementById("pity-threshold") as HTMLInputElement;

        const onRateChange = () => {
            this.superRarePct = parseFloat(srInput.value)   || 0;
            this.rarePct      = parseFloat(rareInput.value) || 0;
            this.rebuildPipeline();
            this.updateRateDisplay();
            this.renderPityProgress();
        };

        srInput.addEventListener("input",  onRateChange);
        srInput.addEventListener("change", onRateChange);
        rareInput.addEventListener("input",  onRateChange);
        rareInput.addEventListener("change", onRateChange);

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
    }

    private updateRateDisplay(): void {
        const commonPct = 100 - this.superRarePct - this.rarePct;
        const display = document.getElementById("common-rate-display");
        if (display) display.textContent = commonPct.toFixed(2) + "%";

        const invalid = commonPct < 0 || this.superRarePct < 0 || this.rarePct < 0;
        const warning = document.getElementById("rate-warning");
        if (warning) warning.style.display = invalid ? "block" : "none";

        const rollIds = ["btn-roll", "btn-roll-10", "btn-roll-100"];
        rollIds.forEach(id => {
            const btn = document.getElementById(id) as HTMLButtonElement | null;
            if (btn) btn.disabled = invalid || this.isRolling;
        });
    }

    private async doRolls(count: number): Promise<void> {
        if (this.isRolling) return;
        if (100 - this.superRarePct - this.rarePct < 0) return;

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
        this.totalRolls = 0;
        this.rarityCounts = new Map([
            [Rarity.Common,    0],
            [Rarity.Rare,      0],
            [Rarity.SuperRare, 0],
        ]);
        this.history = [];
        this.rebuildPipeline();
        this.renderAll();
    }

    private renderAll(): void {
        const row = document.getElementById("pity-config-row");
        if (row) row.style.display = this.pityEnabled ? "flex" : "none";
        this.updateRateDisplay();
        this.renderLatestResult(null, 0);
        this.renderStats();
        this.renderPityProgress();
        this.renderHistory();
    }

    private renderLatestResult(reward: Reward | null, rollNum: number): void {
        const container = document.getElementById("latest-result");
        if (!container) return;

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

        const card = container.querySelector(".reward-card") as HTMLElement | null;
        if (card) {
            card.classList.remove("pop-in");
            void card.offsetWidth; // force reflow
            card.classList.add("pop-in");
        }
    }

    private renderStats(): void {
        const total = this.totalRolls;
        const totalEl = document.getElementById("stat-total");
        if (totalEl) totalEl.textContent = String(total);

        for (const rarity of Object.values(Rarity)) {
            const count = this.rarityCounts.get(rarity) ?? 0;
            const pct   = total > 0 ? (count / total) * 100 : 0;
            const key   = rarityKey(rarity);
            const cfg   = RarityConfig[rarity];

            const countEl = document.getElementById(`stat-count-${key}`);
            const pctEl   = document.getElementById(`stat-pct-${key}`);
            const barEl   = document.getElementById(`stat-bar-${key}`) as HTMLElement | null;

            if (countEl) countEl.textContent = String(count);
            if (pctEl)   pctEl.textContent   = `${pct.toFixed(1)}%`;
            if (barEl) {
                barEl.style.width           = `${pct}%`;
                barEl.style.backgroundColor = cfg.color;
            }
        }
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

        const countEl     = document.getElementById("pity-count");
        const thresholdEl = document.getElementById("pity-threshold-display");
        const barEl       = document.getElementById("pity-bar") as HTMLElement | null;

        if (countEl)     countEl.textContent     = String(counter);
        if (thresholdEl) thresholdEl.textContent = String(threshold);
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

function rarityKey(rarity: Rarity): string {
    return rarity.toLowerCase().replace(" ", "-");
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener("DOMContentLoaded", () => {
    const app = new RewarderApp();
    app.init();
});
