// ===== Wheel Spin Mode (Strategy Pattern) =====

const WheelSpinStrategyCode = {
    Normal: "normal",
    Accelerate: "accelerate",
    Skip: "skip",
} as const;
type WheelSpinStrategyCode = ValueOf<typeof WheelSpinStrategyCode>;

interface IWheelSpinStrategy<T> {
    readonly id:    WheelSpinStrategyCode;
    readonly label: string;
    execute(wheel: SpinningWheel<T>, targetIndex: number): Promise<void>;
}

interface IWheelSpinStrategyFactory<T> {
    create(id: WheelSpinStrategyCode): IWheelSpinStrategy<T>;
    allModes(): ReadonlyArray<IWheelSpinStrategy<T>>;
}

class NormalSpinStrategy<T> implements IWheelSpinStrategy<T> {
    readonly id    = WheelSpinStrategyCode.Normal;
    readonly label = "Normal";
    execute(wheel: SpinningWheel<T>, targetIndex: number): Promise<void> {
        return wheel.spin(targetIndex, { modeId: this.id });
    }
}

class AccelerateSpinStrategy<T> implements IWheelSpinStrategy<T> {
    readonly id    = WheelSpinStrategyCode.Accelerate;
    readonly label = "Fast";
    execute(wheel: SpinningWheel<T>, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.accelerate();
        return p;
    }
}

class SkipSpinStrategy<T> implements IWheelSpinStrategy<T> {
    readonly id    = WheelSpinStrategyCode.Skip;
    readonly label = "Skip";
    execute(wheel: SpinningWheel<T>, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.skip();
        return p;
    }
}

class WheelSpinModeFactory<T> implements IWheelSpinStrategyFactory<T> {
    private readonly registry = new Map<WheelSpinStrategyCode, IWheelSpinStrategy<T>>([
        [WheelSpinStrategyCode.Normal,      new NormalSpinStrategy<T>()],
        [WheelSpinStrategyCode.Accelerate,  new AccelerateSpinStrategy<T>()],
        [WheelSpinStrategyCode.Skip,        new SkipSpinStrategy<T>()],
    ]);

    create(id: WheelSpinStrategyCode): IWheelSpinStrategy<T> {
        const strategy = this.registry.get(id);
        if (!strategy) throw new Error(`Unknown spin mode: ${id}`);
        return strategy;
    }

    allModes(): ReadonlyArray<IWheelSpinStrategy<T>> {
        return [...this.registry.values()];
    }
}
