// ===== CyclingColorProvider =====
// Cycles through a fixed palette of visually distinct colors,
// assigning a new one to each newly created reward node.

class CyclingColorProvider implements IRewardColorProvider {
    private static readonly PALETTE: readonly string[] = [
        "#c084fc", // purple
        "#f472b6", // pink
        "#fb923c", // orange
        "#facc15", // yellow
        "#4ade80", // green
        "#34d399", // emerald
        "#38bdf8", // sky
        "#818cf8", // indigo
        "#f87171", // red
        "#a3e635", // lime
        "#2dd4bf", // teal
        "#e879f9", // fuchsia
    ];

    private _index = 0;

    next(): string {
        const color = CyclingColorProvider.PALETTE[this._index];
        this._index = (this._index + 1) % CyclingColorProvider.PALETTE.length;
        return color;
    }
}
