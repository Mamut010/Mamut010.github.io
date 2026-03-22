// ===== Wheel Spin Animator =====

/**
 * Parameters that fully describe one spin animation, from any starting position.
 * Timing constants live here so callers can configure them without subclassing.
 */
interface SpinAnimationParams {
    fromRotation:    number;
    finalRotation:   number;
    /** Signed correction blended into the deceleration tail (+ overshoot, - undershoot, null = direct). */
    correctionDelta: number | null;
    normalDuration:  number;   // total ms for a normal spin
    phase1Frac:      number;   // t-fraction [0,1] at which the overshoot/undershoot correction blend begins
    accelCapMs:      number;   // max remaining ms after accelerate() is called
}

interface ISpinningWheelAnimator {
    /** Current interpolated rotation angle (radians). Updated each animation frame. */
    readonly currentRotation: number;
    readonly isSpinning:      boolean;
    /**
     * Begin an animation.  `onFrame` is invoked after every rotation update
     * (including the final frame) so the drawer can react.
     */
    start(params: SpinAnimationParams, onFrame: () => void): Promise<void>;
    /** Rebase the current spin to finish within accelCapMs. */
    accelerate(): void;
    /** Instantly snap to the final position and resolve. */
    skip(): void;
}

/**
 * Unified single-pass animator.
 *
 * When a correctionDelta is present (overshoot / undershoot), the position is
 * computed as a blend of two curves that run simultaneously over the full
 * duration — giving one continuous, smooth deceleration with the
 * overshoot/undershoot baked in near the end rather than as a separate bounce:
 *
 *   basePos(t)    = lerp(from, overshootTarget, easeOutQuart(t))
 *   blendWeight(t) = smoothstep(phase1Frac → 1)          // 0 before tail, 1 at end
 *   position(t)   = lerp(basePos(t), finalRotation, blendWeight(t))
 *
 * The overshootTarget = finalRotation + correctionDelta, so the base curve
 * naturally drifts past (or short of) the target.  The blend weight then
 * smoothly pulls the wheel back to exactly finalRotation by t = 1.
 * Because both curves are active at all times the motion is fully continuous
 * with no abrupt velocity change between "phases".
 */
class TwoPhaseWheelAnimator implements ISpinningWheelAnimator {
    currentRotation = 0;

    get isSpinning(): boolean { return this.rafId !== null; }

    private spinFromRotation   = 0;
    private finalRotation      = 0;
    private overshootTarget:  number | null = null;
    private startTime          = 0;
    private totalDuration      = 0;
    private blendStart         = 0;   // t-fraction where correction blend begins
    private accelCapMs         = 0;

    private rafId:              number | null = null;
    private resolveSpinPromise: (() => void)  | null = null;
    private onFrame:            (() => void)  | null = null;

    start(params: SpinAnimationParams, onFrame: () => void): Promise<void> {
        // Cancel any in-flight animation, resolving the old promise immediately.
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        const oldResolve = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        this.onFrame            = null;
        oldResolve?.();

        this.onFrame          = onFrame;
        this.accelCapMs       = params.accelCapMs;
        this.spinFromRotation = params.fromRotation;
        this.currentRotation  = params.fromRotation;
        this.finalRotation    = params.finalRotation;
        this.totalDuration    = params.normalDuration;

        if (params.correctionDelta != null && params.correctionDelta !== 0) {
            this.overshootTarget = params.finalRotation + params.correctionDelta;
            this.blendStart      = params.phase1Frac;
        } else {
            this.overshootTarget = null;
            this.blendStart      = 1;
        }
        this.startTime = performance.now();

        return new Promise<void>(resolve => {
            this.resolveSpinPromise = resolve;
            this.scheduleFrame();
        });
    }

    accelerate(): void {
        if (this.rafId === null) return;

        const elapsed = performance.now() - this.startTime;
        if (elapsed >= this.totalDuration) return;

        // Rebase from current visual position, dropping correction.
        this.overshootTarget  = null;
        this.blendStart       = 1;
        this.spinFromRotation = this.currentRotation;
        this.startTime        = performance.now();
        this.totalDuration    = this.accelCapMs;
    }

    skip(): void {
        if (this.rafId === null) return;
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.finishSpin();
    }

    // ── Animation loop ────────────────────────────────────────────────────────

    private scheduleFrame(): void {
        this.rafId = requestAnimationFrame(() => this.frame());
    }

    private frame(): void {
        const elapsed = performance.now() - this.startTime;

        if (elapsed >= this.totalDuration) {
            this.finishSpin();
            return;
        }

        const t = elapsed / this.totalDuration;
        this.currentRotation = this.computePosition(t);
        this.onFrame?.();
        this.scheduleFrame();
    }

    /**
     * Single unified position function.
     * - Without correction: pure ease-out-quart from `spinFromRotation` to `finalRotation`.
     * - With correction: ease-out-quart aims at `overshootTarget` while a smoothstep
     *   blend (active only in the tail window [blendStart, 1]) gradually steers the
     *   position back to `finalRotation`.  All in one continuous pass.
     */
    private computePosition(t: number): number {
        const baseTarget = this.overshootTarget ?? this.finalRotation;
        const basePos    = this.spinFromRotation + Animations.easeOutQuart(t) * (baseTarget - this.spinFromRotation);

        if (this.overshootTarget == null) return basePos;

        // Blend weight: 0 before blendStart, smooth 0→1 between blendStart and 1.
        const blend = Animations.smootherstep(this.blendStart, 1, t);
        // Lerp between base (which drifts past/short of final) and exact final.
        return Animations.lerp(basePos, this.finalRotation, blend);
    }

    private finishSpin(): void {
        this.currentRotation   = this.finalRotation;
        this.overshootTarget   = null;
        this.rafId             = null;
        this.onFrame?.();
        this.onFrame           = null;
        const resolve          = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        resolve?.();
    }
}
