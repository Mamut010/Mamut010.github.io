// ===== Wheel Spin Mode (Strategy Pattern) =====

interface IWheelSpinStrategy {
    readonly id:    "normal" | "accelerate" | "skip";
    readonly label: string;
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void>;
}

interface IWheelSpinStrategyFactory {
    create(id: IWheelSpinStrategy["id"]): IWheelSpinStrategy;
    allModes(): ReadonlyArray<IWheelSpinStrategy>;
}

class NormalSpinStrategy implements IWheelSpinStrategy {
    readonly id    = "normal" as const;
    readonly label = "Normal";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        return wheel.spin(targetIndex, { modeId: this.id });
    }
}

class AccelerateSpinStrategy implements IWheelSpinStrategy {
    readonly id    = "accelerate" as const;
    readonly label = "⚡ Fast";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.accelerate();
        return p;
    }
}

class SkipSpinStrategy implements IWheelSpinStrategy {
    readonly id    = "skip" as const;
    readonly label = "⏭ Skip";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex, { modeId: this.id });
        wheel.skip();
        return p;
    }
}

class WheelSpinModeFactory implements IWheelSpinStrategyFactory {
    private readonly registry = new Map<IWheelSpinStrategy["id"], IWheelSpinStrategy>([
        ["normal",      new NormalSpinStrategy()],
        ["accelerate",  new AccelerateSpinStrategy()],
        ["skip",        new SkipSpinStrategy()],
    ]);

    create(id: IWheelSpinStrategy["id"]): IWheelSpinStrategy {
        const strategy = this.registry.get(id);
        if (!strategy) throw new Error(`Unknown spin mode: ${id}`);
        return strategy;
    }

    allModes(): ReadonlyArray<IWheelSpinStrategy> {
        return [...this.registry.values()];
    }
}
