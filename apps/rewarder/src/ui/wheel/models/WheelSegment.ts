class WheelSegment<T> {
    constructor(
        public data:    T,
        public weight:  number,
        public angle:   WheelSegmentAngle,
    ) { }
}

class WheelSegmentAngle {
    constructor(
        public readonly start: number,
        public readonly sweep: number) {
    }

    get mid(): number {
        return this.start + this.sweep / 2;
    }
};