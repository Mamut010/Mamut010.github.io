// ===== Spinning Angle Calculator (Strategy Pattern) =====

/**
 * Describes where the wheel should land after a spin.
 * The `SpinningWheel` converts these into absolute rotations, handling full
 * turns and the pointer-at-top geometry.
 */
interface SpinLandingResult {
    /** The wheel-space angle [0, 2π) that should come to rest under the pointer. */
    landingAngle:   number;
    /** Optional extra forward rotation (radians) for a momentary overshoot before bouncing back. */
    overshootDelta?: number;
}

interface ISpinningAngleCalculator {
    /**
     * Determine the precise landing position for this spin.
     * @param segAngles Geometry of the target segment from `computeAngles()`.
     */
    calculate(segAngles: { start: number; mid: number; sweep: number }): SpinLandingResult;
}

/** Lands at a uniformly random position within the inner 80% of the segment — no bounce. */
class NaturalAngleCalculator implements ISpinningAngleCalculator {
    calculate(segAngles: { start: number; mid: number; sweep: number }): SpinLandingResult {
        const { start, sweep } = segAngles;
        const margin      = sweep * 0.10;
        const landingAngle = start + margin + Math.random() * (sweep - 2 * margin);
        const TAU = 2 * Math.PI;
        return { landingAngle: ((landingAngle % TAU) + TAU) % TAU };
    }
}

/**
 * Lands at a random position within the inner 70% of the segment, then adds a
 * small forward overshoot so the wheel eases back slightly — "almost stopped,
 * then nudged a little further".
 */
class BounceAngleCalculator implements ISpinningAngleCalculator {
    calculate(segAngles: { start: number; mid: number; sweep: number }): SpinLandingResult {
        const { start, sweep } = segAngles;
        // Stay 15% away from each edge so the overshoot can't push us outside the segment.
        const margin       = sweep * 0.15;
        const landingAngle = start + margin + Math.random() * (sweep - 2 * margin);
        // Overshoot: 8–16% of the segment's sweep, minimum 0.04 rad (~2.3°) so it's always visible.
        const overshootDelta = Math.max(0.04, sweep * (0.08 + Math.random() * 0.08));
        const TAU = 2 * Math.PI;
        return {
            landingAngle: ((landingAngle % TAU) + TAU) % TAU,
            overshootDelta,
        };
    }
}
