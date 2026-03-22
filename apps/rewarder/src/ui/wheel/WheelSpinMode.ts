// ===== Wheel Spin Mode (Strategy Pattern) =====

const WheelSpinStrategyMode = {
    Normal: "normal",
    Accelerate: "accelerate",
    Skip: "skip",
} as const;
type WheelSpinStrategyMode = ValueOf<typeof WheelSpinStrategyMode>;

interface IWheelSpinStrategy<T> {
    execute(wheel: SpinningWheel<T>, targetIndex: number): Promise<void>;
}

interface IWheelSpinStrategyFactory<T> {
    create(mode: WheelSpinStrategyMode): IWheelSpinStrategy<T>;
}

class NormalSpinStrategy<T> implements IWheelSpinStrategy<T> {
    execute(wheel: SpinningWheel<T>, targetIndex: number): Promise<void> {
        return wheel.spin(targetIndex, WheelSpinStrategyMode.Normal);
    }
}

class AccelerateSpinStrategy<T> implements IWheelSpinStrategy<T> {
    execute(wheel: SpinningWheel<T>, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex, WheelSpinStrategyMode.Accelerate);
        wheel.accelerate();
        return p;
    }
}

class SkipSpinStrategy<T> implements IWheelSpinStrategy<T> {
    execute(wheel: SpinningWheel<T>, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex, WheelSpinStrategyMode.Skip);
        wheel.skip();
        return p;
    }
}

class WheelSpinModeFactory<T> implements IWheelSpinStrategyFactory<T> {
    private readonly registry = new Map<WheelSpinStrategyMode, IWheelSpinStrategy<T>>([
        [WheelSpinStrategyMode.Normal,      new NormalSpinStrategy<T>()],
        [WheelSpinStrategyMode.Accelerate,  new AccelerateSpinStrategy<T>()],
        [WheelSpinStrategyMode.Skip,        new SkipSpinStrategy<T>()],
    ]);

    create(mode: WheelSpinStrategyMode): IWheelSpinStrategy<T> {
        const strategy = this.registry.get(mode);
        if (!strategy) throw new Error(`Unknown spin mode: ${mode}`);
        return strategy;
    }
}
