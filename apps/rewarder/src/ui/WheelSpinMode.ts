// ===== Wheel Spin Mode (Strategy Pattern) =====

interface IWheelSpinStrategy {
    readonly id:    "normal" | "accelerate" | "skip";
    readonly label: string;
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void>;
}

class NormalSpinStrategy implements IWheelSpinStrategy {
    readonly id    = "normal" as const;
    readonly label = "Normal";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        return wheel.spin(targetIndex);
    }
}

class AccelerateSpinStrategy implements IWheelSpinStrategy {
    readonly id    = "accelerate" as const;
    readonly label = "⚡ Fast";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex);
        wheel.accelerate();
        return p;
    }
}

class SkipSpinStrategy implements IWheelSpinStrategy {
    readonly id    = "skip" as const;
    readonly label = "⏭ Skip";
    execute(wheel: SpinningWheel, targetIndex: number): Promise<void> {
        const p = wheel.spin(targetIndex);
        wheel.skip();
        return p;
    }
}

const SPIN_STRATEGIES: Record<IWheelSpinStrategy["id"], IWheelSpinStrategy> = {
    normal:     new NormalSpinStrategy(),
    accelerate: new AccelerateSpinStrategy(),
    skip:       new SkipSpinStrategy(),
};
