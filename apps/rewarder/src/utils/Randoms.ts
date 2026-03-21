type RngFunc = () => number; // function that returns a random number in the range [0, 1)

class Randoms {
    private constructor() {}

    public static nextInt(min: number, max: number, rng: RngFunc = Math.random): number {
        return Math.floor(rng() * (max - min + 1)) + min;
    }

    public static nextTimestampedString(rng: RngFunc = Math.random): string {
        return Date.now() + "-" + Math.floor(rng() * 10000);
    }

    /**
     * Randomly select an item from the given list based on the given weights
     * @template T
     * @param {T[]} items The list of items
     * @param {number[]} weights The corresponding weights for every item
     * @param {RngFunc} [rng=Math.random] Optional random number generator function that returns a value in the range [0, 1)
     * @returns {T|undefined} The randomly selected item or 'undefined' if the list is empty
     * @throws {Error} If the list's length and number of weights do not match
     */
    public static nextItemWeighted<T>(
        items: readonly T[],
        weights: number[],
        rng: RngFunc = Math.random
        ): T | undefined {
        if (items.length !== weights.length) {
            throw new Error(`Invalid argument: the number of items and number of weights must match`);
        }
        else if (items.length === 0) {
            return undefined;
        }

        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let randomWeight = rng() * totalWeight;
        for (let i = 0; i < items.length; i++) {
            randomWeight -= weights[i];
            if (randomWeight < 0) {
                return items[i];
            }
        }

        return undefined;
    }
}