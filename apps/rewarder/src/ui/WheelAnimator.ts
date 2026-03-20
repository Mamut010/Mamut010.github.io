// ===== Wheel Spin Animator =====

/**
 * Parameters that fully describe one spin animation, from any starting position.
 * Timing constants live here so callers can configure them without subclassing.
 */
interface SpinAnimationParams {
    fromRotation:    number;
    finalRotation:   number;
    /** Signed correction applied as a second phase (+ overshoot, - undershoot, null = direct). */
    correctionDelta: number | null;
    normalDuration:  number;   // total ms for a normal spin
    phase1Frac:      number;   // fraction of normalDuration used for the main spin phase
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
 * Two-phase easing animator:
 *   Phase 1 — ease-out-quart forward spin (toward corrected position or final).
 *   Phase 2 — ease-in-quad settle (eases back from overshoot or forward from undershoot).
 */
class TwoPhaseWheelAnimator implements ISpinningWheelAnimator {
    currentRotation = 0;

    get isSpinning(): boolean { return this.rafId !== null; }

    private spinFromRotation   = 0;
    private finalRotation      = 0;
    private overshootRotation: number | null = null;
    private phase1StartTime    = 0;
    private phase1Duration     = 0;
    private phase2StartTime    = 0;
    private phase2Duration     = 0;
    private accelCapMs         = 0;
    private inPhase2           = false;

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
        this.inPhase2         = false;
        this.spinFromRotation = params.fromRotation;
        this.currentRotation  = params.fromRotation;
        this.finalRotation    = params.finalRotation;

        if (params.correctionDelta != null && params.correctionDelta !== 0) {
            this.overshootRotation = params.finalRotation + params.correctionDelta;
            this.phase1Duration    = params.normalDuration * params.phase1Frac;
            this.phase2Duration    = params.normalDuration * (1 - params.phase1Frac);
        } else {
            this.overshootRotation = null;
            this.phase1Duration    = params.normalDuration;
            this.phase2Duration    = 0;
        }
        this.phase1StartTime = performance.now();

        return new Promise<void>(resolve => {
            this.resolveSpinPromise = resolve;
            this.scheduleFrame();
        });
    }

    accelerate(): void {
        if (this.rafId === null) return;
        // If already in settle phase, just snap to final.
        if (this.inPhase2) { this.finishSpin(); return; }

        const elapsed = performance.now() - this.phase1StartTime;
        if (elapsed >= this.phase1Duration) return;

        // Rebase from current visual position, dropping correction phase.
        const phase1Target = this.overshootRotation ?? this.finalRotation;
        const t            = Math.min(elapsed / this.phase1Duration, 1);
        const curPos       = this.spinFromRotation + this.easeOutQuart(t) * (phase1Target - this.spinFromRotation);

        this.overshootRotation = null;
        this.phase2Duration    = 0;
        this.spinFromRotation  = curPos;
        this.currentRotation   = curPos;
        this.phase1StartTime   = performance.now();
        this.phase1Duration    = this.accelCapMs;
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
        const now = performance.now();

        if (!this.inPhase2) {
            // Phase 1: ease-out-quart toward phase1Target.
            const phase1Target = this.overshootRotation ?? this.finalRotation;
            const elapsed      = now - this.phase1StartTime;

            if (elapsed >= this.phase1Duration) {
                this.currentRotation = phase1Target;
                this.onFrame?.();
                if (this.overshootRotation != null) {
                    // Transition to phase 2.
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
            // Phase 2: ease-in-quad settle to finalRotation.
            const elapsed = now - this.phase2StartTime;
            if (elapsed >= this.phase2Duration) {
                this.finishSpin();
                return;
            }
            const t = elapsed / this.phase2Duration;
            this.currentRotation = this.spinFromRotation + this.easeInQuad(t) * (this.finalRotation - this.spinFromRotation);
        }

        this.onFrame?.();
        this.scheduleFrame();
    }

    private finishSpin(): void {
        this.currentRotation   = this.finalRotation;
        this.inPhase2          = false;
        this.overshootRotation = null;
        this.rafId             = null;
        this.onFrame?.();
        this.onFrame           = null;
        const resolve          = this.resolveSpinPromise;
        this.resolveSpinPromise = null;
        resolve?.();
    }

    // ── Easing functions ──────────────────────────────────────────────────────

    private easeOutQuart(t: number): number {
        return 1 - Math.pow(1 - Math.min(t, 1), 4);
    }

    private easeInQuad(t: number): number {
        return Math.min(t, 1) ** 2;
    }
}
