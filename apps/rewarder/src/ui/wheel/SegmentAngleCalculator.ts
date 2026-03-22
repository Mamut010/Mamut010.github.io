const SegmentAngleStrategy = {
    Uniform: 'uniform',
    WeightBased: 'weight-based'
} as const;
type SegmentAngleStrategy = ValueOf<typeof SegmentAngleStrategy>;

interface ISegmentAngleCalculator {
    /** Calculate the angle at which the wheel should stop to land on the target segment. */
    calculate(weights: number[]): WheelSegmentAngle[];
}

interface ISegmentAngleCalculatorFactory {
    /** Create a segment angle calculator based on the given strategy. */
    create(strategy: SegmentAngleStrategy): ISegmentAngleCalculator;
}

/**
 * Calculates segment angles based on their weights, with a minimum visual fraction to ensure small segments remain visible.
 * This is the default and recommended angle calculator for general use.
 */
class WeightBasedSegmentAngleCalculator implements ISegmentAngleCalculator {
    private static readonly MIN_SEG_FRAC = 0.028;   // minimum visual fraction per segment (~10°)

    calculate(weights: number[]): WheelSegmentAngle[] {
        if (weights.length === 0) return [];

        const fractions = this.calculateSegmentFractions(weights);

        const result: WheelSegmentAngle[] = [];
        let cum = 0;
        for (let i = 0; i < weights.length; i++) {
            const start = cum * Maths.TAU;
            const sweep = fractions[i] * Maths.TAU;
            result.push(new WheelSegmentAngle(start, sweep));
            cum += fractions[i];
        }
        return result;
    }

    /**
     * Compute visual fractions with a minimum floor so tiny segments stay visible.
     * Segments below MIN_SEG_FRAC are boosted; larger ones are scaled down proportionally.
     */
    private calculateSegmentFractions(weights: number[]): number[] {
        const total = weights.reduce((s, w) => s + w, 0) || 1;
        
        // Iterate until stable (convergence typically takes 1-2 passes).
        const frac = weights.map(w => w / total);
        const MIN  = WeightBasedSegmentAngleCalculator.MIN_SEG_FRAC;
        for (let iter = 0; iter < 8; iter++) {
            const smallIdx = frac.reduce<number[]>((acc, f, i) => { if (f < MIN) acc.push(i); return acc; }, []);
            if (smallIdx.length === 0) break;

            const reserved   = smallIdx.length * MIN;
            if (reserved >= 1) { frac.fill(1 / weights.length); break; }   // pathological: equal split

            const largeTotal = frac.reduce((s, f, i) => s + (frac[i] < MIN ? 0 : f), 0);
            const scale      = (1 - reserved) / largeTotal;
            for (let i = 0; i < frac.length; i++) {
                frac[i] = frac[i] < MIN ? MIN : frac[i] * scale;
            }
        }
        return frac;
    }
}

/**
 * Calculates segment angles by splitting the wheel into equal parts, ignoring weights.
 * This is simpler and may be preferable for small wheels with similar weights, but generally less visually informative than the weight-based calculator.
 */
class UniformSegmentAngleCalculator implements ISegmentAngleCalculator {
    calculate(weights: number[]): WheelSegmentAngle[] {
        const count = weights.length;
        if (count === 0) return [];

        const sweep = Maths.TAU / count;
        const result: WheelSegmentAngle[] = [];
        for (let i = 0; i < count; i++) {
            const start = i * sweep;
            result.push(new WheelSegmentAngle(start, sweep));
        }
        return result;
    }
}

class SegmentAngleCalculatorFactory implements ISegmentAngleCalculatorFactory {
    private static readonly CACHE = new Map<SegmentAngleStrategy, ISegmentAngleCalculator>();

    create(strategy: SegmentAngleStrategy): ISegmentAngleCalculator {
        let calculator = SegmentAngleCalculatorFactory.CACHE.get(strategy);
        if (calculator) {
            return calculator;
        }

        switch (strategy) {
            case SegmentAngleStrategy.Uniform:
                calculator = new UniformSegmentAngleCalculator();
                break;
            case SegmentAngleStrategy.WeightBased:
                calculator = new WeightBasedSegmentAngleCalculator();
                break;
            default:
                throw new Error(`Unknown SegmentAngleStrategy: ${strategy}`);
        }

        SegmentAngleCalculatorFactory.CACHE.set(strategy, calculator);
        return calculator;
    }
}