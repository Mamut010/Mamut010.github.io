// ===== Spinning Angle Calculator (Strategy Pattern) =====

/** Context passed from the active spin mode into the calculator factory. */
interface SpinContext {
    modeId: WheelSpinStrategyCode;
}

/**
 * Describes where the wheel should land after a spin.
 * `correctionDelta` is the signed deviation the animation applies before settling:
 *   positive → overshoot (wheel passes target, eases back)
 *   negative → undershoot (wheel stops short, nudges forward)
 *   absent / 0 → lands directly at landingAngle in one phase
 */
interface SpinLandingResult {
    /** The wheel-space angle [0, 2π) that should come to rest under the pointer. */
    landingAngle:    number;
    /** Optional signed correction creating a two-phase settle animation. */
    correctionDelta?: number;
}

/** Full wheel geometry and target index passed to every calculator. */
interface SpinCalculationContext {
    /** Index of the segment the wheel should land on. */
    targetIndex: number;
    /** All wheel segments (model data — weights, colors, labels, …). */
    segments:    WheelSegment[];
    /** Pre-computed angular geometry for every segment. */
    segAngles:   SegmentAngles[];
}

interface ISpinningAngleCalculator {
    /**
     * Determine the precise landing position for this spin.
     * @param context Full wheel geometry and the index of the winning segment.
     */
    calculate(context: SpinCalculationContext): SpinLandingResult;
}

interface ISpinningAngleCalculatorFactory {
    /** Decide which calculator to use given the current spinning context. */
    create(context: SpinContext): ISpinningAngleCalculator;
}

// ── Concrete calculators ──────────────────────────────────────────────────────

/** Lands at a uniformly random position within the inner 80% of the segment — single phase. */
class NaturalAngleCalculator implements ISpinningAngleCalculator {
    calculate({ targetIndex, segAngles }: SpinCalculationContext): SpinLandingResult {
        const { start, sweep } = segAngles[targetIndex];
        const margin       = sweep * 0.10;
        const TAU          = 2 * Math.PI;
        const landingAngle = start + margin + Math.random() * (sweep - 2 * margin);
        return { landingAngle: ((landingAngle % TAU) + TAU) % TAU };
    }
}

/**
 * The wheel spins slightly past the reward section, then eases back in.
 *
 * More rotation → lower wheel-space angle under pointer, so the peak
 * pointer position is landingAngle − correctionDelta.  We intentionally
 * make that cross the trailing edge (start) by a small gap so the pointer
 * briefly visits the neighbouring segment before returning.
 */
class OvershootAngleCalculator implements ISpinningAngleCalculator {
    calculate({ targetIndex, segAngles }: SpinCalculationContext): SpinLandingResult {
        const { start, sweep } = segAngles[targetIndex];
        const TAU = 2 * Math.PI;
        // Landing sits close to the trailing edge (start) so the correction
        // needed to cross it is as small as possible.
        // Cap distInside so large segments don't push correctionDelta too high.
        const distInside     = Math.min(sweep * (0.10 + Math.random() * 0.10), 0.08);
        const landingAngle   = start + distInside;
        // How far past the trailing edge the pointer should briefly appear.
        const extraGap       = Math.min(0.06, Math.max(0.025, sweep * 0.04));
        const correctionDelta = distInside + extraGap;   // always crosses start
        return {
            landingAngle: ((landingAngle % TAU) + TAU) % TAU,
            correctionDelta,
        };
    }
}

/**
 * The wheel stops just before the reward section, then creeps in.
 *
 * correctionDelta is negative, so the peak pointer position is
 * landingAngle + |correctionDelta|, which crosses the leading edge
 * (start + sweep) so the pointer briefly sits in the preceding segment.
 */
class UndershootAngleCalculator implements ISpinningAngleCalculator {
    calculate({ targetIndex, segAngles }: SpinCalculationContext): SpinLandingResult {
        const { start, sweep } = segAngles[targetIndex];
        const TAU = 2 * Math.PI;
        // Landing sits close to the leading edge (start + sweep).
        const distFromLeading = Math.min(sweep * (0.10 + Math.random() * 0.10), 0.08);
        const landingAngle    = start + sweep - distFromLeading;
        // How far past the leading edge the pointer should briefly appear.
        const extraGap        = Math.min(0.06, Math.max(0.025, sweep * 0.04));
        const correctionDelta = -(distFromLeading + extraGap);  // always crosses start+sweep
        return {
            landingAngle: ((landingAngle % TAU) + TAU) % TAU,
            correctionDelta,
        };
    }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Picks a calculator using weighted random selection.
 * - skip mode: always Natural (animation is instant anyway).
 * - accelerate mode: mostly Natural, occasional Overshoot.
 * - normal mode: mix of all three for varied feel.
 */
class WeightedRandomCalculatorFactory implements ISpinningAngleCalculatorFactory {
    private static readonly NORMAL_POOL: [ISpinningAngleCalculator, number][] = [
        [new NaturalAngleCalculator(),    65],
        [new OvershootAngleCalculator(),  20],
        [new UndershootAngleCalculator(), 15],
    ];
    private static readonly ACCEL_POOL: [ISpinningAngleCalculator, number][] = [
        [new NaturalAngleCalculator(),   80],
        [new OvershootAngleCalculator(), 20],
    ];
    private static readonly NATURAL_ONLY = new NaturalAngleCalculator();

    create(context: SpinContext): ISpinningAngleCalculator {
        if (context.modeId === WheelSpinStrategyCode.Skip) return WeightedRandomCalculatorFactory.NATURAL_ONLY;

        const pool = context.modeId === WheelSpinStrategyCode.Accelerate
            ? WeightedRandomCalculatorFactory.ACCEL_POOL
            : WeightedRandomCalculatorFactory.NORMAL_POOL;

        const items   = pool.map(([calc]) => calc);
        const weights = pool.map(([, w])  => w);
        return Collections.randomItemWeighted(items, weights) ?? WeightedRandomCalculatorFactory.NATURAL_ONLY;
    }
}
