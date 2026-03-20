// ===== Spinning Angle Calculator (Strategy Pattern) =====

/** Context passed from the active spin mode into the calculator factory. */
interface SpinContext {
    modeId: IWheelSpinStrategy["id"];
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

interface ISpinningAngleCalculator {
    /**
     * Determine the precise landing position for this spin.
     * @param segAngles Geometry of the target segment from `computeAngles()`.
     */
    calculate(segAngles: { start: number; mid: number; sweep: number }): SpinLandingResult;
}

interface ISpinningAngleCalculatorFactory {
    /** Decide which calculator to use given the current spinning context. */
    create(context: SpinContext): ISpinningAngleCalculator;
}

// ── Concrete calculators ──────────────────────────────────────────────────────

/** Lands at a uniformly random position within the inner 80% of the segment — single phase. */
class NaturalAngleCalculator implements ISpinningAngleCalculator {
    calculate(segAngles: { start: number; mid: number; sweep: number }): SpinLandingResult {
        const { start, sweep } = segAngles;
        const margin       = sweep * 0.10;
        const TAU          = 2 * Math.PI;
        const landingAngle = start + margin + Math.random() * (sweep - 2 * margin);
        return { landingAngle: ((landingAngle % TAU) + TAU) % TAU };
    }
}

/**
 * Lands past the target, then eases back.
 * The wheel appears to overshoot by a small amount then settle.
 */
class OvershootAngleCalculator implements ISpinningAngleCalculator {
    calculate(segAngles: { start: number; mid: number; sweep: number }): SpinLandingResult {
        const { start, sweep } = segAngles;
        // Stay 15% from each edge so the overshoot lands within the same segment.
        const margin         = sweep * 0.15;
        const TAU            = 2 * Math.PI;
        const landingAngle   = start + margin + Math.random() * (sweep - 2 * margin);
        // correctionDelta > 0: forward overshoot, 8–16% of sweep, minimum 0.04 rad.
        const correctionDelta = Math.max(0.04, sweep * (0.08 + Math.random() * 0.08));
        return {
            landingAngle: ((landingAngle % TAU) + TAU) % TAU,
            correctionDelta,
        };
    }
}

/**
 * Stops just short of the target, then nudges forward.
 * The wheel appears to lose momentum right before the target, then creep in.
 */
class UndershootAngleCalculator implements ISpinningAngleCalculator {
    calculate(segAngles: { start: number; mid: number; sweep: number }): SpinLandingResult {
        const { start, sweep } = segAngles;
        // Keep 20% margin from each edge so the undershoot pause stays inside the segment.
        const margin         = sweep * 0.20;
        const TAU            = 2 * Math.PI;
        const landingAngle   = start + margin + Math.random() * (sweep - 2 * margin);
        // correctionDelta < 0: the animation stops this far before landingAngle, then creeps forward.
        const correctionDelta = -Math.max(0.03, sweep * (0.06 + Math.random() * 0.07));
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
        if (context.modeId === "skip") return WeightedRandomCalculatorFactory.NATURAL_ONLY;

        const pool = context.modeId === "accelerate"
            ? WeightedRandomCalculatorFactory.ACCEL_POOL
            : WeightedRandomCalculatorFactory.NORMAL_POOL;

        const items   = pool.map(([calc]) => calc);
        const weights = pool.map(([, w])  => w);
        return Collections.randomItemWeighted(items, weights) ?? WeightedRandomCalculatorFactory.NATURAL_ONLY;
    }
}
