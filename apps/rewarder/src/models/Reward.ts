class Reward {
    public constructor(
        public readonly id: string,
        public readonly name: string,
    ) {}

    public equals(other: Reward): boolean {
        return this.id === other.id;
    }
}