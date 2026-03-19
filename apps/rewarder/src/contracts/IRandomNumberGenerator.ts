interface IRandomNumberGenerator {
    seed(value: number): void;
    next(): number;
}