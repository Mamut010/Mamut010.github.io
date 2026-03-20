// ===== App =====

interface RollRecord {
    rollNum: number;
    reward: Reward;
}

class RewarderApp {
    private svc          = new RewarderService();
    private wheel!:      SpinningWheel;
    private isRolling    = false;
    private spinStrategy!: IWheelSpinStrategy;   // assigned in init()

    // ── Composition root ─────────────────────────────────────────────────────
    private readonly spinModeFactory:     IWheelSpinStrategyFactory       = new WheelSpinModeFactory();
    private readonly calculatorFactory:   ISpinningAngleCalculatorFactory  = new WeightedRandomCalculatorFactory();

    public init(): void {
        this.svc.init();
        this.spinStrategy = this.spinModeFactory.create(WheelSpinStrategyCode.Normal);
        const canvas   = document.getElementById("wheel-canvas") as HTMLCanvasElement;
        const drawer   = new CanvasWheelDrawer(canvas);
        const animator = new TwoPhaseWheelAnimator();
        const spinner  = new DefaultWheelSpinner(animator, this.calculatorFactory);
        this.wheel = new SpinningWheel(drawer, animator, spinner);
        this.bindStaticEvents();
        this.renderAll();
    }

    // ===== Events =====

    private bindStaticEvents(): void {
        const pityToggle      = document.getElementById("pity-toggle")    as HTMLInputElement;
        const pityThreshInput = document.getElementById("pity-threshold") as HTMLInputElement;

        pityToggle.addEventListener("change", () => {
            this.svc.pityEnabled = pityToggle.checked;
            const pityDisplay = this.svc.pityEnabled ? "flex" : "none";
            const row = document.getElementById("pity-config-row");
            if (row) row.style.display = pityDisplay;
            const trow = document.getElementById("pity-target-row");
            if (trow) trow.style.display = pityDisplay;
            this.svc.rebuildPipeline();
            this.renderPityProgress();
        });

        pityThreshInput.addEventListener("change", () => {
            this.svc.pityThreshold = Math.max(1, parseInt(pityThreshInput.value) || 1);
            pityThreshInput.value = String(this.svc.pityThreshold);
            this.svc.rebuildPipeline();
            this.renderPityProgress();
        });

        document.getElementById("btn-roll")!.addEventListener("click",    () => this.doRolls(1));
        document.getElementById("btn-roll-10")!.addEventListener("click", () => this.doRolls(10));
        document.getElementById("btn-roll-100")!.addEventListener("click",() => this.doRolls(100));
        document.getElementById("btn-reset")!.addEventListener("click",   () => this.resetStats());
        const modeSel = document.getElementById("wheel-mode-selector");
        if (modeSel) {
            modeSel.addEventListener("click", (e) => {
                const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".btn-mode");
                const mode = btn?.dataset.mode as WheelSpinStrategyCode | undefined;
                if (!mode) return;
                try { this.spinStrategy = this.spinModeFactory.create(mode); } catch { return; }
                modeSel.querySelectorAll(".btn-mode").forEach(b => b.classList.remove("is-active"));
                btn!.classList.add("is-active");
            });
        }
        document.getElementById("btn-add-leaf")!.addEventListener("click",  () => this.addRootLeaf());
        document.getElementById("btn-add-group")!.addEventListener("click", () => this.addRootGroup());

        const pityTargetSel = document.getElementById("pity-target") as HTMLSelectElement | null;
        if (pityTargetSel) {
            pityTargetSel.addEventListener("change", () => {
                this.svc.pityTargetId = pityTargetSel.value || null;
                this.svc.rebuildPipeline();
                this.renderPityTargetPicker();
                this.renderPityProgress();
            });
        }

        const profileSel = document.getElementById("profile-select") as HTMLSelectElement | null;
        if (profileSel) {
            profileSel.addEventListener("change", () => {
                if (this.svc.switchProfile(profileSel.value)) this.renderAll();
            });
        }
        document.getElementById("btn-new-profile")?.addEventListener("click", () => this.newProfile());
        document.getElementById("btn-delete-profile")?.addEventListener("click", () => this.deleteProfile(this.svc.activeProfileId));

        const profileNameInput = document.getElementById("profile-name") as HTMLInputElement | null;
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
                const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".tab-btn");
                if (!btn?.dataset.tab) return;
                tabBar.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("is-active"));
                btn.classList.add("is-active");
                document.querySelectorAll<HTMLElement>(".tab-panel").forEach(p => p.classList.add("is-hidden"));
                document.getElementById(`tab-${btn.dataset.tab}`)?.classList.remove("is-hidden");
            });
        }
    }

    private bindRewardListEvents(): void {
        const list = document.getElementById("reward-list");
        if (!list) return;

        list.addEventListener("input", (e) => {
            const target = e.target as HTMLElement;
            const treeNode = target.closest<HTMLElement>(".tree-node");
            if (!treeNode) return;
            const node = this.svc.findNode(treeNode.dataset.id!);
            if (!node) return;

            if (target.classList.contains("reward-rate-input")) {
                const raw = parseFloat((target as HTMLInputElement).value);
                node.rate = isNaN(raw) ? 0 : Math.max(0, raw);
                this.updateEffectiveRatesInPlace();
                this.updateRateSummary();
                this.updateWheelSegments();
                this.svc.rebuildPipeline();
            } else if (target.classList.contains("reward-color-input")) {
                node.color = (target as HTMLInputElement).value;
                this.svc.saveProfileConfig();
                this.updateWheelSegments();
                this.renderStats();
                this.renderHistory();
            } else if (target.classList.contains("reward-border-input")) {
                node.borderColor = (target as HTMLInputElement).value;
                this.svc.saveProfileConfig();
                this.updateWheelSegments();
                this.renderStats();
                this.renderHistory();
            }
        });

        list.addEventListener("change", (e) => {
            const target = e.target as HTMLElement;
            const treeNode = target.closest<HTMLElement>(".tree-node");
            if (!treeNode) return;
            const node = this.svc.findNode(treeNode.dataset.id!);
            if (!node) return;

            if (target.classList.contains("reward-name-input")) {
                node.name = (target as HTMLInputElement).value.trim() || (node.isGroup ? "Group" : "Reward");
                this.svc.rebuildPipeline();
                this.updateWheelSegments();
                this.renderPityTargetPicker();
                this.renderStdPityPoolEditor();
                this.renderFeaturedPityGroupPicker();
                this.renderFeaturedPityFeaturedPicker();
            } else if (target.classList.contains("reward-rate-input")) {
                const raw = parseFloat((target as HTMLInputElement).value);
                node.rate = isNaN(raw) ? 0 : Math.max(0, raw);
                (target as HTMLInputElement).value = String(node.rate);
                this.updateEffectiveRatesInPlace();
                this.updateRateSummary();
                this.updateWheelSegments();
                this.svc.rebuildPipeline();
            }
        });

        list.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.closest(".btn-toggle-group")) {
                const treeNode = target.closest<HTMLElement>(".tree-node.tree-group");
                if (treeNode) treeNode.classList.toggle("is-collapsed");
            } else if (target.closest(".btn-delete-reward")) {
                const treeNode = target.closest<HTMLElement>(".tree-node");
                if (treeNode) {
                    this.svc.removeNode(treeNode.dataset.id!);
                    this.svc.rebuildPipeline();
                    this.renderRewardEditor();
                    this.updateRateSummary();
                }
            } else if (target.closest(".btn-add-child")) {
                const treeNode = target.closest<HTMLElement>(".tree-node.tree-group");
                if (treeNode) {
                    const id = this.svc.addChildToGroup(treeNode.dataset.id!);
                    if (id) this.afterEdit(id);
                }
            }
        });
    }

    private addRootLeaf(): void {
        this.afterEdit(this.svc.addRootLeaf());
    }

    private addRootGroup(): void {
        this.afterEdit(this.svc.addRootGroup());
    }

    private afterEdit(focusId: string): void {
        this.svc.rebuildPipeline();
        this.renderRewardEditor();
        this.updateRateSummary();
        const input = document.querySelector<HTMLInputElement>(`.tree-node[data-id="${focusId}"] .reward-name-input`);
        input?.focus();
        input?.select();
    }

    // ===== Rolls =====

    private async doRolls(count: number): Promise<void> {
        if (this.isRolling || !this.svc.isRateValid()) return;

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

    private setRollButtonsDisabled(disabled: boolean): void {
        ["btn-roll", "btn-roll-10", "btn-roll-100"].forEach(id => {
            const btn = document.getElementById(id) as HTMLButtonElement | null;
            if (btn) btn.disabled = disabled;
        });
    }

    private resetStats(): void {
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

    private newProfile(): void {
        this.svc.newProfile();
        this.renderAll();
    }

    private deleteProfile(id: string): void {
        const activeChanged = this.svc.deleteProfile(id);
        if (activeChanged) this.renderAll();
        else this.renderProfilePicker();
    }

    private renderProfilePicker(): void {
        const sel = document.getElementById("profile-select") as HTMLSelectElement | null;
        if (sel) {
            sel.innerHTML = this.svc.profiles
                .map(p => `<option value="${p.id}"${p.id === this.svc.activeProfileId ? " selected" : ""}>${escapeHtml(p.name)}</option>`)
                .join("");
        }
        const nameInput = document.getElementById("profile-name") as HTMLInputElement | null;
        if (nameInput) {
            const active = this.svc.profiles.find(p => p.id === this.svc.activeProfileId);
            nameInput.value = active?.name ?? "";
        }
        const delBtn = document.getElementById("btn-delete-profile") as HTMLButtonElement | null;
        if (delBtn) delBtn.disabled = this.svc.profiles.length <= 1;
    }

    // ===== Renders =====

    private renderAll(): void {
        const pityDisplay = this.svc.pityEnabled ? "flex" : "none";
        const row = document.getElementById("pity-config-row");
        if (row) row.style.display = pityDisplay;
        const trow = document.getElementById("pity-target-row");
        if (trow) trow.style.display = pityDisplay;
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

    private updateEffectiveRatesInPlace(): void {
        for (const node of this.svc.rewardNodes) {
            if (!node.isGroup) continue;
            for (const child of node.children) {
                const effEl = document.querySelector<HTMLElement>(`.tree-node[data-id="${child.id}"] .eff-rate`);
                if (effEl) effEl.textContent = `${formatRate(node.rate * child.rate / 100)}%`;
            }
        }
    }

    private renderRewardEditor(): void {
        const list = document.getElementById("reward-list");
        if (!list) return;
        list.innerHTML = this.svc.rewardNodes.map(node => this.renderRootNode(node)).join("");
        this.renderPityTargetPicker();
        this.renderStdPityConfig();
        this.renderFeaturedPityConfig();
        this.updateWheelSegments();
    }

    private renderRootNode(node: RewardNodeConfig): string {
        const canDelete = this.svc.rewardNodes.length > 1;
        return node.isGroup
            ? this.renderGroupNode(node, canDelete)
            : this.renderLeafNode(node, null, canDelete);
    }

    private renderPityTargetPicker(): void {
        const sel = document.getElementById("pity-target") as HTMLSelectElement | null;
        if (!sel) return;
        const choices = collectPityChoices(this.svc.rewardNodes);
        sel.innerHTML = choices
            .map(c => `<option value="${c.id}"${c.id === this.svc.pityTargetId ? " selected" : ""}>${escapeHtml(c.label)}</option>`)
            .join("");
    }

    private renderGroupNode(group: RewardNodeConfig, canDelete: boolean): string {
        const childrenHtml = group.children
            .map(child => this.renderLeafNode(child, group.id, group.children.length > 1, group.rate))
            .join("");
        const childSum = group.children.reduce((s, c) => s + c.rate, 0);
        const childOk  = group.children.length > 0 && Math.abs(childSum - 100) < 0.001;
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

    private renderLeafNode(leaf: RewardNodeConfig, parentId: string | null, canDelete: boolean, groupRate?: number): string {
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

    private updateRateSummary(): void {
        const rootTotal = this.svc.rootTotalRate();
        const totalEl = document.getElementById("total-rate");
        if (totalEl) totalEl.textContent = formatRate(rootTotal);

        const rootOk = Math.abs(rootTotal - 100) < 0.001;
        const valid = this.svc.isRateValid();
        const warning = document.getElementById("rate-warning");
        if (warning) warning.style.display = rootOk ? "none" : "inline";

        for (const group of this.svc.rewardNodes) {
            if (!group.isGroup) continue;
            const sumEl = document.querySelector<HTMLElement>(`.tree-node[data-id="${group.id}"] .group-rate-summary`);
            if (!sumEl) continue;
            const childSum = group.children.reduce((s, c) => s + c.rate, 0);
            const ok = group.children.length > 0 && Math.abs(childSum - 100) < 0.001;
            sumEl.textContent = `\u03a3 ${formatRate(childSum)}% ${ok ? "\u2713" : "\u26a0"}`;
            sumEl.className = `group-rate-summary ${ok ? "rate-ok" : "rate-warn"}`;
        }

        this.setRollButtonsDisabled(!valid || this.isRolling);
    }

    private renderLatestResult(reward: Reward | null, rollNum: number): void {
        const container = document.getElementById("card-view");
        if (!container) return;

        if (!reward) {
            container.innerHTML = `<div class="idle-msg">Roll to get started!</div>`;
            return;
        }

        const cfg         = this.svc.findNode(reward.id);
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
        const total = this.svc.totalRolls;
        const totalEl = document.getElementById("stat-total");
        if (totalEl) totalEl.textContent = String(total);

        const container = document.getElementById("stats-rows");
        if (!container) return;

        container.innerHTML = collectLeaves(this.svc.rewardNodes).map(leaf => {
            const count = this.svc.rewardCounts.get(leaf.id) ?? 0;
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

        if (!this.svc.pityEnabled || !this.svc.pityInterceptor) {
            section.style.display = "none";
            return;
        }
        section.style.display = "block";

        const counter   = this.svc.pityInterceptor.counter;
        const threshold = this.svc.pityThreshold;
        const pct     = Math.min(100, (counter / threshold) * 100);
        const urgency = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";

        const targetName = this.svc.pityInterceptor.targetName ?? "—";

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

        if (this.svc.history.length === 0) {
            container.innerHTML = `<div class="history-empty">No rolls yet</div>`;
            return;
        }

        container.innerHTML = this.svc.history.slice(0, 60).map(entry => {
            const cfg         = this.svc.findNode(entry.reward.id);
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

    // ===== Wheel helpers =====

    private updateWheelSegments(): void {
        const leaves   = collectLeaves(this.svc.rewardNodes);
        const segments: WheelSegment[] = leaves.map(leaf => ({
            id:          leaf.id,
            name:        leaf.name,
            color:       leaf.color,
            borderColor: leaf.borderColor,
            weight:      this.effectiveWeight(leaf.id),
        }));
        this.wheel.setSegments(segments);
    }

    private effectiveWeight(
        leafId:         string,
        nodes:          RewardNodeConfig[] = this.svc.rewardNodes,
        parentFraction: number             = 1,
    ): number {
        for (const node of nodes) {
            if (node.isGroup) {
                const w = this.effectiveWeight(leafId, node.children, parentFraction * node.rate / 100);
                if (w >= 0) return w;
            } else if (node.id === leafId) {
                return parentFraction * node.rate / 100;
            }
        }
        return -1;  // not found
    }

    // ===== Standard Pity =====

    private bindStdPityEvents(): void {
        const toggle = document.getElementById("std-pity-toggle") as HTMLInputElement | null;
        if (toggle) {
            toggle.addEventListener("change", () => {
                this.svc.stdPityEnabled = toggle.checked;
                const display      = this.svc.stdPityEnabled ? "flex"  : "none";
                const blockDisplay = this.svc.stdPityEnabled ? "block" : "none";
                const cfgRow  = document.getElementById("std-pity-config-row");
                const poolRow = document.getElementById("std-pity-pool-row");
                if (cfgRow)  cfgRow.style.display  = display;
                if (poolRow) poolRow.style.display = blockDisplay;
                this.svc.rebuildPipeline();
                this.renderStdPityProgress();
            });
        }

        const threshInput = document.getElementById("std-pity-threshold") as HTMLInputElement | null;
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
                const target   = e.target as HTMLElement;
                const entryRow = target.closest<HTMLElement>(".std-pity-entry");
                if (!entryRow) return;
                const nodeId = entryRow.dataset.nodeId!;
                if (target.classList.contains("std-pity-entry-check")) {
                    const checked = (target as HTMLInputElement).checked;
                    if (checked) {
                        const node = this.svc.rewardNodes.find(n => n.id === nodeId);
                        if (node && !this.svc.stdPityEntries.find(e => e.nodeId === nodeId)) {
                            this.svc.stdPityEntries.push({ nodeId, rate: node.rate });
                        }
                    } else {
                        this.svc.stdPityEntries = this.svc.stdPityEntries.filter(e => e.nodeId !== nodeId);
                    }
                    this.renderStdPityPoolEditor();
                    this.updateStdPityRateSummary();
                    this.svc.rebuildPipeline();
                    this.svc.saveProfileConfig();
                }
            });

            poolEditor.addEventListener("input", (e) => {
                const target = e.target as HTMLElement;
                if (!target.classList.contains("std-pity-rate-input")) return;
                const entryRow = target.closest<HTMLElement>(".std-pity-entry");
                if (!entryRow) return;
                const nodeId = entryRow.dataset.nodeId!;
                const raw  = parseFloat((target as HTMLInputElement).value);
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
                const target = e2.target as HTMLElement;
                if (!target.classList.contains("std-pity-rate-input")) return;
                const entryRow = target.closest<HTMLElement>(".std-pity-entry");
                if (!entryRow) return;
                const nodeId = entryRow.dataset.nodeId!;
                const raw  = parseFloat((target as HTMLInputElement).value);
                const rate = isNaN(raw) ? 0 : Math.max(0, raw);
                (target as HTMLInputElement).value = String(rate);
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

    private renderStdPityConfig(): void {
        const toggle = document.getElementById("std-pity-toggle") as HTMLInputElement | null;
        if (toggle) toggle.checked = this.svc.stdPityEnabled;

        const threshInput = document.getElementById("std-pity-threshold") as HTMLInputElement | null;
        if (threshInput) threshInput.value = String(this.svc.stdPityThreshold);

        const display      = this.svc.stdPityEnabled ? "flex"  : "none";
        const blockDisplay = this.svc.stdPityEnabled ? "block" : "none";
        const cfgRow  = document.getElementById("std-pity-config-row");
        const poolRow = document.getElementById("std-pity-pool-row");
        if (cfgRow)  cfgRow.style.display  = display;
        if (poolRow) poolRow.style.display = blockDisplay;

        this.renderStdPityPoolEditor();
        this.updateStdPityRateSummary();
    }

    private renderStdPityPoolEditor(): void {
        const container = document.getElementById("std-pity-pool-editor");
        if (!container) return;
        container.innerHTML = this.svc.rewardNodes.map(node => {
            const entry   = this.svc.stdPityEntries.find(e => e.nodeId === node.id);
            const checked = entry !== undefined;
            const rate    = entry?.rate ?? node.rate;
            const label   = node.isGroup
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

    private updateStdPityRateSummary(): void {
        const total   = this.svc.stdPityEntries.reduce((s, e) => s + e.rate, 0);
        const totalEl = document.getElementById("std-pity-total-rate");
        if (totalEl) totalEl.textContent = formatRate(total);
        const ok      = this.svc.stdPityEntries.length > 0 && Math.abs(total - 100) < 0.001;
        const warning = document.getElementById("std-pity-rate-warning");
        if (warning) warning.style.display = (this.svc.stdPityEntries.length > 0 && !ok) ? "inline" : "none";
    }

    private renderStdPityProgress(): void {
        const section = document.getElementById("std-pity-section");
        if (!section) return;

        if (!this.svc.stdPityEnabled || !this.svc.stdPityInterceptor) {
            section.style.display = "none";
            return;
        }
        section.style.display = "block";

        const counter   = this.svc.stdPityInterceptor.counter;
        const threshold = this.svc.stdPityThreshold;
        const pct       = Math.min(100, (counter / threshold) * 100);
        const urgency   = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";

        const countEl     = document.getElementById("std-pity-count");
        const thresholdEl = document.getElementById("std-pity-threshold-display");
        const barEl       = document.getElementById("std-pity-bar") as HTMLElement | null;

        if (countEl)     countEl.textContent     = String(counter);
        if (thresholdEl) thresholdEl.textContent = String(threshold);
        if (barEl) {
            barEl.style.width           = `${pct}%`;
            barEl.style.backgroundColor = urgency;
        }
    }

    // ===== Featured Pity =====

    private bindFeaturedPityEvents(): void {
        const toggle = document.getElementById("feat-pity-toggle") as HTMLInputElement | null;
        if (toggle) {
            toggle.addEventListener("change", () => {
                this.svc.featuredPityEnabled = toggle.checked;
                const display = this.svc.featuredPityEnabled ? "flex" : "none";
                ["feat-pity-config-row", "feat-pity-group-row", "feat-pity-featured-row"].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = display;
                });
                this.svc.rebuildPipeline();
                this.renderFeaturedPityProgress();
            });
        }

        const threshInput = document.getElementById("feat-pity-threshold") as HTMLInputElement | null;
        if (threshInput) {
            threshInput.addEventListener("change", () => {
                this.svc.featuredPityThreshold = Math.max(1, parseInt(threshInput.value) || 1);
                threshInput.value = String(this.svc.featuredPityThreshold);
                this.svc.rebuildPipeline();
                this.renderFeaturedPityProgress();
            });
        }

        const groupSel = document.getElementById("feat-pity-group") as HTMLSelectElement | null;
        if (groupSel) {
            groupSel.addEventListener("change", () => {
                this.svc.featuredPityGroupId    = groupSel.value || null;
                this.svc.featuredPityFeaturedId = null;
                this.svc.rebuildPipeline();
                this.renderFeaturedPityFeaturedPicker();
                this.renderFeaturedPityProgress();
            });
        }

        const featuredSel = document.getElementById("feat-pity-featured") as HTMLSelectElement | null;
        if (featuredSel) {
            featuredSel.addEventListener("change", () => {
                this.svc.featuredPityFeaturedId = featuredSel.value || null;
                this.svc.rebuildPipeline();
                this.renderFeaturedPityProgress();
            });
        }
    }

    private renderFeaturedPityConfig(): void {
        const toggle = document.getElementById("feat-pity-toggle") as HTMLInputElement | null;
        if (toggle) toggle.checked = this.svc.featuredPityEnabled;

        const threshInput = document.getElementById("feat-pity-threshold") as HTMLInputElement | null;
        if (threshInput) threshInput.value = String(this.svc.featuredPityThreshold);

        const display = this.svc.featuredPityEnabled ? "flex" : "none";
        ["feat-pity-config-row", "feat-pity-group-row", "feat-pity-featured-row"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = display;
        });

        this.renderFeaturedPityGroupPicker();
        this.renderFeaturedPityFeaturedPicker();
    }

    private renderFeaturedPityGroupPicker(): void {
        const sel = document.getElementById("feat-pity-group") as HTMLSelectElement | null;
        if (!sel) return;
        const groups = this.svc.rewardNodes.filter(n => n.isGroup && n.children.length >= 2);
        sel.innerHTML = `<option value="">— select group —</option>`
            + groups.map(g =>
                `<option value="${g.id}"${g.id === this.svc.featuredPityGroupId ? " selected" : ""}>${escapeHtml(g.name)}</option>`
            ).join("");
    }

    private renderFeaturedPityFeaturedPicker(): void {
        const sel = document.getElementById("feat-pity-featured") as HTMLSelectElement | null;
        if (!sel) return;
        const group = this.svc.rewardNodes.find(n => n.id === this.svc.featuredPityGroupId && n.isGroup);
        if (!group) {
            sel.innerHTML = `<option value="">— select group first —</option>`;
            return;
        }
        sel.innerHTML = `<option value="">— select featured reward —</option>`
            + group.children.map(c =>
                `<option value="${c.id}"${c.id === this.svc.featuredPityFeaturedId ? " selected" : ""}>${escapeHtml(c.name)}</option>`
            ).join("");
    }

    private renderFeaturedPityProgress(): void {
        const section = document.getElementById("feat-pity-section");
        if (!section) return;

        if (!this.svc.featuredPityEnabled || !this.svc.featuredPityInterceptor) {
            section.style.display = "none";
            return;
        }
        section.style.display = "block";

        const counter   = this.svc.featuredPityInterceptor.counter;
        // Progress fills relative to threshold-1 (the point at which next entry is forced).
        const maxMisses = Math.max(1, this.svc.featuredPityThreshold - 1);
        const pct       = Math.min(100, (counter / maxMisses) * 100);
        const urgency   = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";

        const countEl     = document.getElementById("feat-pity-count");
        const maxEl       = document.getElementById("feat-pity-max-display");
        const featuredEl  = document.getElementById("feat-pity-featured-name");
        const barEl       = document.getElementById("feat-pity-bar") as HTMLElement | null;

        if (countEl)    countEl.textContent    = String(counter);
        if (maxEl)      maxEl.textContent      = String(maxMisses);
        if (featuredEl) featuredEl.textContent =
            `${this.svc.featuredPityInterceptor.featuredName} (${this.svc.featuredPityInterceptor.groupName})`;
        if (barEl) {
            barEl.style.width           = `${pct}%`;
            barEl.style.backgroundColor = urgency;
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new RewarderApp().init();
});
