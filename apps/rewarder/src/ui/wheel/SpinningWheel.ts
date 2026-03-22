// ===== Spinning Wheel (Orchestrator) =====

/**
 * Orchestrates the drawer, animator, and spinner to present a complete
 * spinning-wheel widget.  This class owns the segment data model and wires
 * the three subcomponents together, but delegates all drawing, animation, and
 * spin-target computation to them.
 */
class SpinningWheel {
    private segments:  WheelSegment[]  = [];

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
        if (!this.animator.isSpinning) this.redraw();
    }

    findSegmentIndex(rewardId: string): number {
        const idx = this.segments.findIndex(s => s.id === rewardId);
        return idx >= 0 ? idx : 0;
    }

    spin(targetIndex: number, context: SpinContext): Promise<void> {
        return this.spinner.spin(targetIndex, context, this.segments, () => this.redraw());
    }

    accelerate(): void { this.spinner.accelerate(); }
    skip():       void { this.spinner.skip(); }

    // ===== Helpers =====

    private redraw(): void {
        this.drawer.draw(this.animator.currentRotation, this.segments);
    }
}
