// ===== Spinning Wheel (Orchestrator) =====

/**
 * Orchestrates the drawer, animator, and spinner to present a complete
 * spinning-wheel widget.  This class owns the segment data model and wires
 * the three subcomponents together, but delegates all drawing, animation, and
 * spin-target computation to them.
 */
class SpinningWheel {
    private segments:  WheelSegment[]  = [];
    private segAngles: SegmentAngles[] = [];

    private static readonly MIN_SEG_FRAC = 0.028;   // minimum visual fraction per segment (~10°)

    private readonly drawer:   ISpinningWheelDrawer;
    private readonly animator: ISpinningWheelAnimator;
    private readonly spinner:  IWheelSpinner;

    constructor(
        drawer:   ISpinningWheelDrawer,
        animator: ISpinningWheelAnimator,
        spinner:  IWheelSpinner,
    ) {
        this.drawer   = drawer;
        this.animator = animator;
        this.spinner  = spinner;
        this.redraw();
    }

    // ===== Public API =====

    setSegments(segments: WheelSegment[]): void {
        this.segments  = segments;
        this.segAngles = this.computeAngles(segments);
        if (!this.animator.isSpinning) this.redraw();
    }

    findSegmentIndex(rewardId: string): number {
        const idx = this.segments.findIndex(s => s.id === rewardId);
        return idx >= 0 ? idx : 0;
    }

    spin(targetIndex: number, context: SpinContext): Promise<void> {
        return this.spinner.spin(targetIndex, context, this.segments, this.segAngles, () => this.redraw());
    }

    accelerate(): void { this.spinner.accelerate(); }
    skip():       void { this.spinner.skip(); }

    // ===== Helpers =====

    private redraw(): void {
        this.drawer.draw(this.animator.currentRotation, this.segments, this.segAngles);
    }
    private computeAngles(segs: WheelSegment[]): SegmentAngles[] {
        if (segs.length === 0) return [];

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

        const result: SegmentAngles[] = [];
        let   cum = 0;
        for (let i = 0; i < segs.length; i++) {
            const start = cum * Maths.TAU;
            const sweep = frac[i] * Maths.TAU;
            result.push({ start, mid: start + sweep / 2, sweep });
            cum += frac[i];
        }
        return result;
    }
}
