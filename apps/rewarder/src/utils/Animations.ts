class Animations {
    private constructor() {}

    /**
     * Linearly interpolate between two numbers based on a parameter t in the range [0, 1]
     * @param start The starting value (corresponding to t=0)
     * @param end The ending value (corresponding to t=1)
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 returns start and 1 returns end
     * @returns The interpolated value, calculated as start + t * (end - start)
     */
    public static lerp(start: number, end: number, t: number): number {
        return start + t * (end - start);
    }

    /**
     * Sigmoid-like interpolation function that smoothly transitions from 0 to 1 as x moves from edge0 to edge1,
     * with zero first derivatives at both edges.
     * The function returns 0 when x <= edge0, 1 when x >= edge1, and a smooth S-shaped curve in between.
     * @param edge0 The lower edge of the transition range, where the output starts to increase from 0
     * @param edge1 The upper edge of the transition range, where the output reaches 1
     * @param x The input value to be interpolated, typically in the range [edge0, edge1]
     * @returns The interpolated value, calculated using the smoothstep formula, which ensures a smooth transition between 0 and 1 as x moves from edge0 to edge1
     */
    public static smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Maths.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    /**
     * Smoother interpolation function that provides an even smoother transition than smoothstep, with zero first and second derivatives at the edges.
     * The function returns 0 when x <= edge0, 1 when x >= edge1, and a smooth S-shaped curve in between.
     * @param edge0 The lower edge of the transition range, where the output starts to increase from 0
     * @param edge1 The upper edge of the transition range, where the output reaches 1
     * @param x The input value to be interpolated, typically in the range [edge0, edge1]
     * @returns The interpolated value, calculated using the smootherstep formula, which ensures an even smoother transition between 0 and 1 as x moves from edge0 to edge1
     */
    public static smootherstep(edge0: number, edge1: number, x: number): number {
        const t = Maths.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * Ease-in quart function that provides a smooth acceleration curve, starting slow and speeding up towards the end, creating a natural motion effect in animations.
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 represents the start and 1 represents the end
     * @returns The eased value, calculated using the quart ease-in formula
     */
    public static easeInQuart(t: number): number {
        return Math.pow(Math.min(t, 1), 4);
    }

    /**
     * Ease-out quart function that provides a smooth deceleration curve, starting fast and slowing down towards the end, creating a natural motion effect in animations.
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 represents the start and 1 represents the end
     * @returns The eased value, calculated using the quart ease-out formula
     */
    public static easeOutQuart(t: number): number {
        return 1 - Math.pow(1 - Math.min(t, 1), 4);
    }

    /**
     * Ease-in-out cubic function that provides a smooth acceleration and deceleration curve, commonly used in animations to create natural motion.
     * The function starts with a slow acceleration, speeds up in the middle, and then slows down again towards the end.
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 represents the start and 1 represents the end
     * @returns The eased value, calculated using the cubic ease-in-out formula
     */
    public static easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * Ease-in-out back function that provides a smooth acceleration and deceleration curve with an overshooting effect, creating a dynamic and playful motion in animations.
     * The function starts with a slow acceleration, speeds up in the middle while briefly overshooting the target value, and then slows down again towards the end, creating a unique motion effect.
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 represents the start and 1 represents the end
     * @returns The eased value, calculated using the quart ease-in-out formula
     */
    public static easeInOutQuart(t: number): number {
        return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(1 - 2 * t, 4) / 2;
    }

    /**
     * Ease-in-out sine function that provides a smooth sinusoidal acceleration and deceleration curve, creating a natural and smooth motion effect in animations.
     * The function starts with a slow acceleration, speeds up in the middle, and then slows down again towards the end, following a sine wave pattern.
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 represents the start and 1 represents the end
     * @returns The eased value, calculated using the sine ease-in-out formula
     */
    public static easeInOutSine(t: number): number {
        return -(Math.cos(Math.PI * t) - 1) / 2;
    }

    /**
     * Ease-in-out quint function that provides a smooth acceleration and deceleration curve, similar to cubic but with a steeper curve.
     * The function starts with a slow acceleration, speeds up in the middle, and then slows down again towards the end.
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 represents the start and 1 represents the end
     * @returns The eased value, calculated using the quint ease-in-out formula
     */
    public static easeInOutQuint(t: number): number {
        return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
    }

    /**
     * Ease-in-out circular function that provides a smooth acceleration and deceleration curve, following a circular pattern.
     * The function starts with a slow acceleration, speeds up in the middle, and then slows down again towards the end, creating a natural motion effect in animations.
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 represents the start and 1 represents the end
     * @returns The eased value, calculated using the circular ease-in-out formula
     */
    public static easeInOutCirc(t: number): number {
        return t < 0.5
            ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
            : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
    }

    /**
     * Ease-in-out back function that provides a smooth acceleration and deceleration curve with an overshooting effect, creating a dynamic and playful motion in animations.
     * The function starts with a slow acceleration, speeds up in the middle while briefly overshooting the target value, and then slows down again towards the end, creating a unique motion effect.
     * @param t The interpolation parameter, typically in the range [0, 1], where 0 represents the start and 1 represents the end
     * @returns The eased value, calculated using the back ease-in-out formula
     */
    public static easeInOutBack(t: number): number {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;
        return t < 0.5
            ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
            : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    }
}