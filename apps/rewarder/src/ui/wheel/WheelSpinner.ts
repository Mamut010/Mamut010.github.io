// ===== Wheel Spinner =====

/**
 * Translates a spin request (which segment to land on + spin context) into a
 * concrete `SpinAnimationParams` and delegates execution to `ISpinningWheelAnimator`.
 * Owns the wheel-level timing constants and the minimum-rotations rule.
 */
interface IWheelSpinner<T> {
    spin(
        targetIndex: number,
        context:     SpinContext<T>,
        onFrame:     () => void,
    ): Promise<void>;
    accelerate(): void;
    skip():       void;
}

class DefaultWheelSpinner<T> implements IWheelSpinner<T> {
    // ── Timing defaults ────────────────────────────────────────────────────────
    private static readonly NORMAL_DURATION = 4000;   // ms for a full normal spin
    private static readonly ACCEL_CAP_MS   = 900;     // max remaining ms after accelerate()
    private static readonly MIN_SPINS      = 6;       // minimum full rotations before stopping
    private static readonly PHASE1_FRAC    = 0.85;    // t-fraction at which the correction blend begins (wider window → slower, more readable settle)

    constructor(
        private readonly animator:          ISpinningWheelAnimator,
        private readonly calculatorFactory: ISpinningAngleCalculatorFactory<T>,
    ) {}

    spin(
        targetIndex: number,
        context:     SpinContext<T>,
        onFrame:     () => void,
    ): Promise<void> {
        const TAU        = Maths.TAU;
        const calculator = this.calculatorFactory.create(context);
        const landing    = calculator.calculate(new SpinCalculationContext(targetIndex, context.segments));

        // Compute how much to rotate so landing.landingAngle faces the pointer at top.
        // A wheel-space angle `a` is under the pointer when: a + rot ≡ 0 (mod 2π) ⟹ rot ≡ -a
        const targetRot   = Maths.normalizeAngle(-landing.landingAngle);
        const currentNorm = Maths.normalizeAngle(this.animator.currentRotation);
        let   delta       = targetRot - currentNorm;
        if (delta <= 0) delta += TAU;
        delta += DefaultWheelSpinner.MIN_SPINS * TAU;

        const params: SpinAnimationParams = {
            fromRotation:    this.animator.currentRotation,
            finalRotation:   this.animator.currentRotation + delta,
            correctionDelta: landing.correctionDelta ?? null,
            normalDuration:  DefaultWheelSpinner.NORMAL_DURATION,
            phase1Frac:      DefaultWheelSpinner.PHASE1_FRAC,
            accelCapMs:      DefaultWheelSpinner.ACCEL_CAP_MS,
        };
        return this.animator.start(params, onFrame);
    }

    accelerate(): void { this.animator.accelerate(); }
    skip():       void { this.animator.skip(); }
}
