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
    private currentRotation  = 0;
    private spinFromRotation = 0;
    private targetRotation   = 0;
    private spinStartTime    = 0;
    private spinDuration     = 0;

    private rafId:              number | null = null;
    private resolveSpinPromise: (() => void)  | null = null;

    private static readonly NORMAL_DURATION = 4000;   // ms for a full spin
    private static readonly ACCEL_CAP_MS   = 900;     // max remaining ms after accelerate()
    private static readonly MIN_SPINS      = 6;       // minimum full rotations before stopping

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d")!;
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
    spin(targetIndex: number): Promise<void> {
        // Cancel any previous in-flight animation
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        const oldResolve = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        oldResolve?.();

        const targetMid = this.segAngles[targetIndex]?.mid ?? 0;

        // We want the segment's midpoint to land exactly under the pointer (top, screen angle = -π/2).
        // In draw(), the arc for segment i starts at: segAngles[i].start + rot - π/2
        // Segment i is under the pointer when:
        //   segAngles[i].mid + rot - π/2  ≡  -π/2  (mod 2π)
        //   ⟹  segAngles[i].mid + rot ≡ 0  (mod 2π)
        //   ⟹  rot ≡ -segAngles[i].mid   (mod 2π)
        const targetRot     = ((-targetMid) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const currentNorm   = ((this.currentRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        let   delta         = targetRot - currentNorm;
        if (delta <= 0) delta += 2 * Math.PI;     // always spin at least a tiny bit forward
        delta += SpinningWheel.MIN_SPINS * 2 * Math.PI;

        this.spinFromRotation = this.currentRotation;
        this.targetRotation   = this.currentRotation + delta;
        this.spinStartTime    = performance.now();
        this.spinDuration     = SpinningWheel.NORMAL_DURATION;

        return new Promise<void>(resolve => {
            this.resolveSpinPromise = resolve;
            this.scheduleFrame();
        });
    }

    /** Speed up the current spin so it finishes within ACCEL_CAP_MS. */
    accelerate(): void {
        if (this.rafId === null) return;
        const elapsed = performance.now() - this.spinStartTime;
        if (elapsed >= this.spinDuration) return;

        // Rebase the animation from the current visual position with a shorter duration.
        const t       = Math.min(elapsed / this.spinDuration, 1);
        const curPos  = this.spinFromRotation + this.easeOutQuart(t) * (this.targetRotation - this.spinFromRotation);
        this.spinFromRotation = curPos;
        this.currentRotation  = curPos;
        this.spinStartTime    = performance.now();
        this.spinDuration     = SpinningWheel.ACCEL_CAP_MS;
    }

    /** Instantly jump to the final position and resolve the spin promise. */
    skip(): void {
        if (this.rafId === null) return;
        cancelAnimationFrame(this.rafId);
        this.rafId            = null;
        this.currentRotation  = this.targetRotation;
        this.draw();
        const resolve         = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        resolve?.();
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
            if (angles.sweep < 0.14) continue;     // too narrow to label

            const midA   = angles.mid + rot + offset;
            const txtR   = r * 0.60;
            const arcLen = angles.sweep * txtR;     // arc length at label radius

            const fontSize = Math.max(9, Math.min(13, r * 0.09));
            const maxChars = Math.floor(arcLen / (fontSize * 0.70));
            if (maxChars <= 2) continue;

            let label = seg.name;
            if (label.length > maxChars) label = label.slice(0, maxChars - 1) + "\u2026";

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
        const elapsed = performance.now() - this.spinStartTime;

        if (elapsed >= this.spinDuration) {
            this.currentRotation = this.targetRotation;
            this.draw();
            this.rafId           = null;
            const resolve        = this.resolveSpinPromise;
            this.resolveSpinPromise = null;
            resolve?.();
            return;
        }

        const t = elapsed / this.spinDuration;
        this.currentRotation = this.spinFromRotation + this.easeOutQuart(t) * (this.targetRotation - this.spinFromRotation);
        this.draw();
        this.scheduleFrame();
    }

    /** Ease-out quart: fast start, dramatic slow-down at the end. */
    private easeOutQuart(t: number): number {
        return 1 - Math.pow(1 - Math.min(t, 1), 4);
    }

    // ===== Helpers =====

    private computeAngles(segs: WheelSegment[]): Array<{ start: number; mid: number; sweep: number }> {
        const total  = segs.reduce((s, seg) => s + seg.weight, 0) || 1;
        const result: Array<{ start: number; mid: number; sweep: number }> = [];
        let   cum    = 0;
        for (const seg of segs) {
            const frac  = seg.weight / total;
            const start = cum * 2 * Math.PI;
            const sweep = frac * 2 * Math.PI;
            result.push({ start, mid: start + sweep / 2, sweep });
            cum += frac;
        }
        return result;
    }
}
