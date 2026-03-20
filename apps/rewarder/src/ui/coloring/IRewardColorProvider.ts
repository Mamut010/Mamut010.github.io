// ===== IRewardColorProvider =====
// Provides colors for newly created reward nodes.

interface IRewardColorProvider {
    /** Returns the next color string (e.g. "#c084fc") to assign to a new reward node. */
    next(): string;
}
