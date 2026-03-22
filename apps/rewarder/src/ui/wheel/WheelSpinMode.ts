// ===== Wheel Spin Mode (Strategy Pattern) =====

const WheelSpinStrategyCode = {
    Normal: "normal",
    Accelerate: "accelerate",
    Skip: "skip",
} as const;
type WheelSpinStrategyCode = ValueOf<typeof WheelSpinStrategyCode>;

interface IWheelSpinStrategy {
    readonly id:    WheelSpinStrategyCode;
    readonly label: string;
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void>;
}

interface IWheelSpinStrategyFactory {
    create(id: WheelSpinStrategyCode): IWheelSpinStrategy;
    allModes(): ReadonlyArray<IWheelSpinStrategy>;
}

class NormalSpinStrategy implements IWheelSpinStrategy {
    readonly id    = WheelSpinStrategyCode.Normal;
    readonly label = "Normal";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        return wheel.spin(targetIndex, { modeId: this.id });
    }
}

class AccelerateSpinStrategy implements IWheelSpinStrategy {
    readonly id    = WheelSpinStrategyCode.Accelerate;
    readonly label = "Fast";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.accelerate();
        return p;
    }
}

class SkipSpinStrategy implements IWheelSpinStrategy {
    readonly id    = WheelSpinStrategyCode.Skip;
    readonly label = "Skip";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.skip();
        return p;
    }
}

class WheelSpinModeFactory implements IWheelSpinStrategyFactory {
    private readonly registry = new Map<WheelSpinStrategyCode, IWheelSpinStrategy>([
        [WheelSpinStrategyCode.Normal,      new NormalSpinStrategy()],
        [WheelSpinStrategyCode.Accelerate,  new AccelerateSpinStrategy()],
        [WheelSpinStrategyCode.Skip,        new SkipSpinStrategy()],
    ]);

    create(id: WheelSpinStrategyCode): IWheelSpinStrategy {
        const strategy = this.registry.get(id);
        if (!strategy) throw new Error(`Unknown spin mode: ${id}`);
        return strategy;
    }

    allModes(): ReadonlyArray<IWheelSpinStrategy> {
        return [...this.registry.values()];
    }
}
