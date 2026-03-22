class Animations {
    private constructor() {}

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