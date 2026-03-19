// ===== App =====

interface RollRecord {
    rollNum: number;
    reward: Reward;
}

class RewarderApp {
    private rewardNodes: RewardNodeConfig[] = defaultRewardNodes();
    private pityEnabled   = true;
    private pityThreshold = 90;
    private nextId        = 1;

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
            this.rewardNodes,
            this.pityEnabled,
            this.pityThreshold,
        );
        this.pipeline = pipeline;
        this.pityInterceptor = pityInterceptor;
    }

    private findNode(id: string, nodes: RewardNodeConfig[]): RewardNodeConfig | undefined {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.isGroup) {
                const found = this.findNode(id, node.children);
                if (found) return found;
            }
        }
        return undefined;
    }

    private validateTree(nodes: RewardNodeConfig[]): boolean {
        if (nodes.length === 0) return false;
        const sum = nodes.reduce((s, n) => s + n.rate, 0);
        if (Math.abs(sum - 100) >= 0.001) return false;
        for (const n of nodes) {
            if (n.isGroup && !this.validateTree(n.children)) return false;
        }
        return true;
    }

    private isRateValid(): boolean {
        return this.validateTree(this.rewardNodes);
    }

    private rootTotalRate(): number {
        return this.rewardNodes.reduce((s, n) => s + n.rate, 0);
    }

    private findLeastProbableLeaf(
        nodes: readonly RewardNodeConfig[],
        parentProb: number,
    ): { config: RewardNodeConfig; prob: number } | null {
        const total = nodes.reduce((s, n) => s + n.rate, 0);
        if (total === 0) return null;
        let best: { config: RewardNodeConfig; prob: number } | null = null;
        for (const node of nodes) {
            const prob = parentProb * (node.rate / total);
            if (node.isGroup) {
                const child = this.findLeastProbableLeaf(node.children, prob);
                if (child && (!best || child.prob < best.prob)) best = child;
            } else {
                if (!best || prob < best.prob) best = { config: node, prob };
            }
        }
        return best;
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
        document.getElementById("btn-add-leaf")!.addEventListener("click",  () => this.addRootLeaf());
        document.getElementById("btn-add-group")!.addEventListener("click", () => this.addRootGroup());

        this.bindRewardListEvents();
    }

    private bindRewardListEvents(): void {
        const list = document.getElementById("reward-list");
        if (!list) return;

        list.addEventListener("input", (e) => {
            const target = e.target as HTMLElement;
            const treeNode = target.closest<HTMLElement>(".tree-node");
            if (!treeNode) return;
            const node = this.findNode(treeNode.dataset.id!, this.rewardNodes);
            if (!node) return;

            if (target.classList.contains("reward-rate-input")) {
                node.rate = parseFloat((target as HTMLInputElement).value) || 0;
                this.updateRateSummary();
                this.rebuildPipeline();
            } else if (target.classList.contains("reward-color-input")) {
                node.color = (target as HTMLInputElement).value;
                this.renderStats();
                this.renderHistory();
            } else if (target.classList.contains("reward-border-input")) {
                node.borderColor = (target as HTMLInputElement).value;
                this.renderStats();
                this.renderHistory();
            }
        });

        list.addEventListener("change", (e) => {
            const target = e.target as HTMLElement;
            const treeNode = target.closest<HTMLElement>(".tree-node");
            if (!treeNode) return;
            const node = this.findNode(treeNode.dataset.id!, this.rewardNodes);
            if (!node) return;

            if (target.classList.contains("reward-name-input")) {
                node.name = (target as HTMLInputElement).value.trim() || (node.isGroup ? "Group" : "Reward");
                this.rebuildPipeline();
            }
        });

        list.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.closest(".btn-delete-reward")) {
                const treeNode = target.closest<HTMLElement>(".tree-node");
                if (treeNode) this.removeNode(treeNode.dataset.id!);
            } else if (target.closest(".btn-add-child")) {
                const treeNode = target.closest<HTMLElement>(".tree-node.tree-group");
                if (treeNode) this.addChildToGroup(treeNode.dataset.id!);
            }
        });
    }

    private addRootLeaf(): void {
        const id = `leaf-${this.nextId++}`;
        this.rewardNodes.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color: "#c084fc", borderColor: "#c084fc", children: [],
        });
        this.afterEdit(id);
    }

    private addRootGroup(): void {
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

    private addChildToGroup(groupId: string): void {
        const group = this.findNode(groupId, this.rewardNodes);
        if (!group || !group.isGroup) return;
        const id = `leaf-${this.nextId++}`;
        group.children.push({
            id, name: "New Reward", rate: 0, isGroup: false,
            color: "#c084fc", borderColor: "#c084fc", children: [],
        });
        this.afterEdit(id);
    }

    private afterEdit(focusId: string): void {
        this.rebuildPipeline();
        this.renderRewardEditor();
        this.updateRateSummary();
        const input = document.querySelector<HTMLInputElement>(`.tree-node[data-id="${focusId}"] .reward-name-input`);
        input?.focus();
        input?.select();
    }

    private removeNode(id: string): void {
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
            if (!group.isGroup) continue;
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
        list.innerHTML = this.rewardNodes.map(node => this.renderRootNode(node)).join("");
    }

    private renderRootNode(node: RewardNodeConfig): string {
        const canDelete = this.rewardNodes.length > 1;
        return node.isGroup
            ? this.renderGroupNode(node, canDelete)
            : this.renderLeafNode(node, null, canDelete);
    }

    private renderGroupNode(group: RewardNodeConfig, canDelete: boolean): string {
        const childrenHtml = group.children
            .map(child => this.renderLeafNode(child, group.id, group.children.length > 1))
            .join("");
        const childSum = group.children.reduce((s, c) => s + c.rate, 0);
        const childOk  = group.children.length > 0 && Math.abs(childSum - 100) < 0.001;
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

    private renderLeafNode(leaf: RewardNodeConfig, parentId: string | null, canDelete: boolean): string {
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
                        <span class="rate-unit">%</span>
                    </div>
                    <button class="btn-delete-reward" title="Remove"${canDelete ? "" : " disabled"}>&#xd7;</button>
                </div>
            </div>`;
    }

    private updateRateSummary(): void {
        const rootTotal = this.rootTotalRate();
        const totalEl = document.getElementById("total-rate");
        if (totalEl) totalEl.textContent = rootTotal.toFixed(2);

        const valid = this.isRateValid();
        const warning = document.getElementById("rate-warning");
        if (warning) warning.style.display = valid ? "none" : "inline";

        for (const group of this.rewardNodes) {
            if (!group.isGroup) continue;
            const sumEl = document.querySelector<HTMLElement>(`.tree-node[data-id="${group.id}"] .group-rate-summary`);
            if (!sumEl) continue;
            const childSum = group.children.reduce((s, c) => s + c.rate, 0);
            const ok = group.children.length > 0 && Math.abs(childSum - 100) < 0.001;
            sumEl.textContent = `\u03a3 ${childSum.toFixed(2)}% ${ok ? "\u2713" : "\u26a0"}`;
            sumEl.className = `group-rate-summary ${ok ? "rate-ok" : "rate-warn"}`;
        }

        this.setRollButtonsDisabled(!valid || this.isRolling);
    }

    private renderLatestResult(reward: Reward | null, rollNum: number): void {
        const container = document.getElementById("latest-result");
        if (!container) return;

        if (!reward) {
            container.innerHTML = `<div class="idle-msg">Roll to get started!</div>`;
            return;
        }

        const cfg         = this.findNode(reward.id, this.rewardNodes);
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

        container.innerHTML = collectLeaves(this.rewardNodes).map(leaf => {
            const count = this.rewardCounts.get(leaf.id) ?? 0;
            const pct   = total > 0 ? (count / total) * 100 : 0;
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

        const targetName = this.findLeastProbableLeaf(this.rewardNodes, 1)?.config.name ?? "rarest reward";

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
            const cfg         = this.findNode(entry.reward.id, this.rewardNodes);
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

document.addEventListener("DOMContentLoaded", () => {
    new RewarderApp().init();
});
