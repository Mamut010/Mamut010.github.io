// ===== Spinning Wheel (Orchestrator) =====

/**
 * Orchestrates the drawer, animator, and spinner to present a complete
 * spinning-wheel widget.  This class owns the segment data model and wires
 * the three subcomponents together, but delegates all drawing, animation, and
 * spin-target computation to them.
 */
class SpinningWheel<T> {
    private _segments:  WheelSegment<T>[]  = [];

    private readonly drawer:   ISpinningWheelDrawer<T>;
    private readonly animator: ISpinningWheelAnimator;
    private readonly spinner:  IWheelSpinner<T>;

    constructor(
        drawer:   ISpinningWheelDrawer<T>,
        animator: ISpinningWheelAnimator,
        spinner:  IWheelSpinner<T>,
    ) {
        this.drawer   = drawer;
        this.animator = animator;
        this.spinner  = spinner;
        this.redraw();
    }

    // ===== Public API =====

    get segments(): readonly WheelSegment<T>[] {
        return this._segments;
    }

    setSegments(segments: WheelSegment<T>[]): void {
        this._segments  = segments;
        if (!this.animator.isSpinning) this.redraw();
    }

    spin(targetIndex: number, context: SpinContext): Promise<void> {
        return this.spinner.spin(targetIndex, context, this._segments, () => this.redraw());
    }

    accelerate(): void { this.spinner.accelerate(); }
    skip():       void { this.spinner.skip(); }

    // ===== Helpers =====

    private redraw(): void {
        this.drawer.draw(this.animator.currentRotation, this._segments);
    }
}
