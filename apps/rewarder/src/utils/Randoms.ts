class Randoms {
    private constructor() {}

    public static nextInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    public static nextTimestampedString(): string {
        return Date.now() + "-" + Math.floor(Math.random() * 10000);
    }
}