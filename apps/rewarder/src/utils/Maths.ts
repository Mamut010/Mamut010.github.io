/**
 * Utility class providing mathematical constants and functions.
 */
class Maths {
    /**
     * The mathematical constant τ (tau), equal to 2π, representing a full circle in radians.
     */
    public static readonly TAU = 2 * Math.PI;

    /**
     * The golden ratio φ (phi), approximately 1.61803398875.
     */
    public static readonly PHI = (1 + Math.sqrt(5)) / 2;

    /**
     * The smallest positive number such that 1 + EPSILON !== 1, used to determine the precision of floating-point calculations and to avoid issues with rounding errors in comparisons.
     */
    public static readonly EPSILON = Number.EPSILON;

    /**
     * A right angle, equal to τ/4 (π/2) radians or 90 degrees, representing a quarter of a full circle.
     */
    public static readonly RIGHT_ANGLE = Math.PI / 2;
    
    private constructor() {}

    /**
     * Clamp a number between a minimum and maximum value (inclusive)
     * @param value The number to clamp
     * @param min The minimum allowed value
     * @param max The maximum allowed value
     * @returns The clamped value, guaranteed to be between min and max (inclusive)
     */
    public static clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    /**
     * Normalize an angle to the range [0, 2π)
     * @param angle The angle in radians to normalize
     * @returns The normalized angle, guaranteed to be in the range [0, 2π)
     */
    public static normalizeAngle(angle: number): number {
        return ((angle % Maths.TAU) + Maths.TAU) % Maths.TAU;
    }

    /**
     * Compare two floating-point numbers for equality within a specified tolerance.
     * @param a The first number to compare
     * @param b The second number to compare
     * @param epsilon The tolerance for comparison, defaults to Maths.EPSILON
     * @returns True if the numbers are equal within the specified tolerance, false otherwise
     */
    public static eq(a: number, b: number, epsilon: number = Maths.EPSILON): boolean {
        return Math.abs(a - b) < epsilon;
    }

    /**
     * Compare two floating-point numbers for inequality within a specified tolerance.
     * @param a The first number to compare
     * @param b The second number to compare
     * @param epsilon The tolerance for comparison, defaults to Maths.EPSILON
     * @returns True if the numbers are not equal within the specified tolerance, false otherwise
     */
    public static neq(a: number, b: number, epsilon: number = Maths.EPSILON): boolean {
        return !Maths.eq(a, b, epsilon);
    }

    /**
     * Compare two floating-point numbers to determine if the first is greater than the second within a specified tolerance.
     * @param a The first number to compare
     * @param b The second number to compare
     * @param epsilon The tolerance for comparison, defaults to Maths.EPSILON
     * @returns True if the first number is greater than the second within the specified tolerance, false otherwise
     */
    public static gt(a: number, b: number, epsilon: number = Maths.EPSILON): boolean {
        return a > b && !Maths.eq(a, b, epsilon);
    }

    /**
     * Compare two floating-point numbers to determine if the first is greater than or equal to the second within a specified tolerance.
     * @param a The first number to compare
     * @param b The second number to compare
     * @param epsilon The tolerance for comparison, defaults to Maths.EPSILON
     * @returns True if the first number is greater than or equal to the second within the specified tolerance, false otherwise
     */
    public static gte(a: number, b: number, epsilon: number = Maths.EPSILON): boolean {
        return a > b || Maths.eq(a, b, epsilon);
    }

    /**
     * Compare two floating-point numbers to determine if the first is less than the second within a specified tolerance.
     * @param a The first number to compare
     * @param b The second number to compare
     * @param epsilon The tolerance for comparison, defaults to Maths.EPSILON
     * @returns True if the first number is less than the second within the specified tolerance, false otherwise
     */
    public static lt(a: number, b: number, epsilon: number = Maths.EPSILON): boolean {
        return a < b && !Maths.eq(a, b, epsilon);
    }

    /**
     * Compare two floating-point numbers to determine if the first is less than or equal to the second within a specified tolerance.
     * @param a The first number to compare
     * @param b The second number to compare
     * @param epsilon The tolerance for comparison, defaults to Maths.EPSILON
     * @returns True if the first number is less than or equal to the second within the specified tolerance, false otherwise
     */
    public static lte(a: number, b: number, epsilon: number = Maths.EPSILON): boolean {
        return a < b || Maths.eq(a, b, epsilon);
    }

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
}