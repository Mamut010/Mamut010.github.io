class MathRandomNumberGenerator implements IRandomNumberGenerator {
    public seed(value: number): void { }

    public next(): number {
        return Math.random();
    }
}