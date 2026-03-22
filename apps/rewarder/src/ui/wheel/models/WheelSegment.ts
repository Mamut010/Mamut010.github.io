class WheelSegment {
    constructor(
        public readonly id: string,
        public name:        string,
        public color:       string,
        public borderColor: string,
        public weight:      number,
        public angle:       WheelSegmentAngle,
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