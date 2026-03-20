// ===== Spinning Wheel UI =====

interface WheelSegment {
    id:          string;
    name:        string;
    color:       string;       // text / label color
    borderColor: string;       // segment fill color
    weight:      number;       // relative weight (any positive number, will be normalized)
}

class SpinningWheel {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx:    CanvasRenderingContext2D;

    private segments:  WheelSegment[] = [];
    private segAngles: Array<{ start: number; mid: number; sweep: number }> = [];

    // Animation state
    private currentRotation    = 0;
    private spinFromRotation   = 0;
    private finalRotation      = 0;
    private overshootRotation: number | null = null;
    private phase1StartTime    = 0;
    private phase1Duration     = 0;
    private phase2StartTime    = 0;
    private phase2Duration     = 0;
    private inPhase2           = false;

    private rafId:              number | null = null;
    private resolveSpinPromise: (() => void)  | null = null;

    private readonly calculatorFactory: ISpinningAngleCalculatorFactory;

    private static readonly NORMAL_DURATION = 4000;   // ms for a full spin
    private static readonly ACCEL_CAP_MS   = 900;     // max remaining ms after accelerate()
    private static readonly MIN_SPINS      = 6;       // minimum full rotations before stopping
    private static readonly PHASE1_FRAC    = 0.92;    // fraction of total duration for forward spin
    private static readonly MIN_SEG_FRAC   = 0.028;   // minimum visual fraction per segment (~10°)

    constructor(canvas: HTMLCanvasElement, calculatorFactory: ISpinningAngleCalculatorFactory) {
        this.canvas            = canvas;
        this.ctx               = canvas.getContext("2d")!;
        this.calculatorFactory = calculatorFactory;
        this.draw();
    }

    // ===== Public API =====

    setSegments(segments: WheelSegment[]): void {
        this.segments  = segments;
        this.segAngles = this.computeAngles(segments);
        // Only redraw if not currently spinning (avoid interrupting the animation)
        if (this.rafId === null) this.draw();
    }

    findSegmentIndex(rewardId: string): number {
        const idx = this.segments.findIndex(s => s.id === rewardId);
        return idx >= 0 ? idx : 0;
    }

    /** Start spin animation to targetIndex. Returns a Promise that resolves when done. */
    spin(targetIndex: number, context: SpinContext): Promise<void> {
        // Cancel any previous in-flight animation
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        const oldResolve = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        oldResolve?.();

        const TAU       = 2 * Math.PI;
        const angles    = this.segAngles[targetIndex] ?? { start: 0, mid: 0, sweep: TAU };
        const calculator = this.calculatorFactory.create(context);
        const landing   = calculator.calculate(angles);

        // Compute how much to rotate so that landing.landingAngle faces the pointer at top.
        // A wheel-space angle `a` is under the pointer when: a + rot ≡ 0 (mod 2π)  ⟹  rot ≡ -a
        const targetRot   = ((-landing.landingAngle % TAU) + TAU) % TAU;
        const currentNorm = ((this.currentRotation % TAU) + TAU) % TAU;
        let   delta       = targetRot - currentNorm;
        if (delta <= 0) delta += TAU;
        delta += SpinningWheel.MIN_SPINS * TAU;

        this.inPhase2         = false;
        this.spinFromRotation = this.currentRotation;
        this.finalRotation    = this.currentRotation + delta;

        if (landing.correctionDelta != null && landing.correctionDelta !== 0) {
            // positive correctionDelta → overshoot (wheel goes past, phase 2 eases back)
            // negative correctionDelta → undershoot (wheel stops short, phase 2 nudges forward)
            this.overshootRotation = this.finalRotation + landing.correctionDelta;
            this.phase1Duration    = SpinningWheel.NORMAL_DURATION * SpinningWheel.PHASE1_FRAC;
            this.phase2Duration    = SpinningWheel.NORMAL_DURATION * (1 - SpinningWheel.PHASE1_FRAC);
        } else {
            this.overshootRotation = null;
            this.phase1Duration    = SpinningWheel.NORMAL_DURATION;
            this.phase2Duration    = 0;
        }
        this.phase1StartTime = performance.now();

        return new Promise<void>(resolve => {
            this.resolveSpinPromise = resolve;
            this.scheduleFrame();
        });
    }

    /** Speed up the current spin so it finishes within ACCEL_CAP_MS. */
    accelerate(): void {
        if (this.rafId === null) return;
        // If already in the bounce-back phase, just snap to final.
        if (this.inPhase2) { this.finishSpin(); return; }

        const elapsed = performance.now() - this.phase1StartTime;
        if (elapsed >= this.phase1Duration) return;

        // Rebase from the current visual position, targeting finalRotation (droppping bounce).
        const phase1Target = this.overshootRotation ?? this.finalRotation;
        const t            = Math.min(elapsed / this.phase1Duration, 1);
        const curPos       = this.spinFromRotation + this.easeOutQuart(t) * (phase1Target - this.spinFromRotation);

        this.overshootRotation = null;
        this.phase2Duration    = 0;
        this.spinFromRotation  = curPos;
        this.currentRotation   = curPos;
        this.phase1StartTime   = performance.now();
        this.phase1Duration    = SpinningWheel.ACCEL_CAP_MS;
    }

    /** Instantly jump to the final position and resolve the spin promise. */
    skip(): void {
        if (this.rafId === null) return;
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.finishSpin();
    }

    // ===== Drawing =====

    draw(): void {
        const { canvas, ctx } = this;
        const W  = canvas.width;
        const H  = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const r  = Math.min(cx, cy) - 18;   // leave room for the pointer above the wheel

        ctx.clearRect(0, 0, W, H);

        if (this.segments.length === 0) {
            // Draw an empty placeholder ring
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.strokeStyle = "#2a2a5a";
            ctx.lineWidth   = 2;
            ctx.stroke();
            this.drawPointer(cx, cy, r);
            return;
        }

        const rot    = this.currentRotation;
        const offset = -Math.PI / 2;   // rotate so angle 0 points to the top

        // ── Draw filled segments ──────────────────────────────────────────────
        for (let i = 0; i < this.segments.length; i++) {
            const seg    = this.segments[i];
            const angles = this.segAngles[i];
            const startA = angles.start + rot + offset;
            const endA   = startA + angles.sweep;

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
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // ── Draw text labels ──────────────────────────────────────────────────
        for (let i = 0; i < this.segments.length; i++) {
            const seg    = this.segments[i];
            const angles = this.segAngles[i];

            const midA   = angles.mid + rot + offset;
            const txtR   = r * 0.62;
            const arcLen = angles.sweep * txtR;     // arc length at label radius

            // Font adapts to both canvas size and available arc length.
            const fontSize = Math.max(8, Math.min(13, r * 0.09, arcLen * 0.45));
            const maxChars = Math.floor(arcLen / (fontSize * 0.62));
            if (maxChars < 1) continue;

            let label = seg.name;
            if (label.length > maxChars) {
                label = maxChars >= 2 ? label.slice(0, maxChars - 1) + "\u2026" : label.slice(0, 1);
            }

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(midA);
            ctx.translate(txtR, 0);

            ctx.font          = `bold ${fontSize}px "clear sans", Arial, sans-serif`;
            ctx.textAlign     = "center";
            ctx.textBaseline  = "middle";
            ctx.shadowColor   = "rgba(0,0,0,0.8)";
            ctx.shadowBlur    = 4;
            ctx.fillStyle     = "#ffffff";
            ctx.fillText(label, 0, 0);
            ctx.shadowBlur    = 0;
            ctx.restore();
        }

        // ── Outer ring ────────────────────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "#4a4a8a";
        ctx.lineWidth   = 3;
        ctx.stroke();

        // ── Center cap ───────────────────────────────────────────────────────
        const capR = r * 0.10;
        ctx.beginPath();
        ctx.arc(cx, cy, capR, 0, 2 * Math.PI);
        ctx.fillStyle   = "#0f172a";
        ctx.fill();
        ctx.strokeStyle = "#c084fc";
        ctx.lineWidth   = 2;
        ctx.stroke();

        this.drawPointer(cx, cy, r);
    }

    private drawPointer(cx: number, cy: number, r: number): void {
        const ctx   = this.ctx;
        const tipY  = cy - r - 2;          // tip just above the outer ring
        const baseY = tipY - 13;           // base of the triangle

        ctx.beginPath();
        ctx.moveTo(cx,     tipY);
        ctx.lineTo(cx - 9, baseY);
        ctx.lineTo(cx + 9, baseY);
        ctx.closePath();

        ctx.shadowColor = "rgba(192,132,252,0.7)";
        ctx.shadowBlur  = 10;
        ctx.fillStyle   = "#c084fc";
        ctx.fill();
        ctx.shadowBlur  = 0;
    }

    // ===== Animation internals =====

    private scheduleFrame(): void {
        this.rafId = requestAnimationFrame(() => this.frame());
    }

    private frame(): void {
        const now = performance.now();

        if (!this.inPhase2) {
            // Phase 1: forward spin toward overshootRotation (bounce) or finalRotation (no bounce).
            const phase1Target = this.overshootRotation ?? this.finalRotation;
            const elapsed      = now - this.phase1StartTime;
            if (elapsed >= this.phase1Duration) {
                this.currentRotation = phase1Target;
                this.draw();
                if (this.overshootRotation != null) {
                    // Transition to phase 2: ease back to finalRotation.
                    this.inPhase2         = true;
                    this.spinFromRotation = phase1Target;
                    this.phase2StartTime  = now;
                    this.scheduleFrame();
                } else {
                    this.finishSpin();
                }
                return;
            }
            const t = elapsed / this.phase1Duration;
            this.currentRotation = this.spinFromRotation + this.easeOutQuart(t) * (phase1Target - this.spinFromRotation);
        } else {
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

    private finishSpin(): void {
        this.currentRotation    = this.finalRotation;
        this.inPhase2           = false;
        this.overshootRotation  = null;
        this.rafId              = null;
        this.draw();
        const resolve           = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        resolve?.();
    }

    /** Ease-out quart: fast start, dramatic slow-down at the end. */
    private easeOutQuart(t: number): number {
        return 1 - Math.pow(1 - Math.min(t, 1), 4);
    }

    /** Ease-in quad: starts slow then accelerates (used for the bounce-back phase). */
    private easeInQuad(t: number): number {
        return Math.min(t, 1) ** 2;
    }

    // ===== Helpers =====

    private computeAngles(segs: WheelSegment[]): Array<{ start: number; mid: number; sweep: number }> {
        if (segs.length === 0) return [];

        const TAU   = 2 * Math.PI;
        const total = segs.reduce((s, seg) => s + seg.weight, 0) || 1;

        // Compute visual fractions with a minimum floor so tiny segments stay visible.
        // Segments below MIN_SEG_FRAC are boosted; larger ones are scaled down proportionally.
        // Iterate until stable (convergence typically takes 1-2 passes).
        const frac = segs.map(s => s.weight / total);
        const MIN  = SpinningWheel.MIN_SEG_FRAC;
        for (let iter = 0; iter < 8; iter++) {
            const smallIdx = frac.reduce<number[]>((acc, f, i) => { if (f < MIN) acc.push(i); return acc; }, []);
            if (smallIdx.length === 0) break;

            const reserved   = smallIdx.length * MIN;
            if (reserved >= 1) { frac.fill(1 / segs.length); break; }   // pathological: equal split

            const largeTotal = frac.reduce((s, f, i) => s + (frac[i] < MIN ? 0 : f), 0);
            const scale      = (1 - reserved) / largeTotal;
            for (let i = 0; i < frac.length; i++) {
                frac[i] = frac[i] < MIN ? MIN : frac[i] * scale;
            }
        }

        const result: Array<{ start: number; mid: number; sweep: number }> = [];
        let   cum = 0;
        for (let i = 0; i < segs.length; i++) {
            const start = cum * TAU;
            const sweep = frac[i] * TAU;
            result.push({ start, mid: start + sweep / 2, sweep });
            cum += frac[i];
        }
        return result;
    }
}
