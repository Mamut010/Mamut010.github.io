class RewardExecutionContext {
    private readonly _rng: IRandomNumberGenerator;
    private _metadata: object;

    public constructor(
        rng: IRandomNumberGenerator,
        metadata?: object,
    ) {
        this._rng = rng;
        this._metadata = metadata ?? {};
    }

    public get rng(): IRandomNumberGenerator {
        return this._rng;
    }

    public metadata<T extends object = Record<string, unknown>>(): T {
        return this._metadata as T;
    }
}