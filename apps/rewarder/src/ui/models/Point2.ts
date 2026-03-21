class Point2 {
    constructor(
        public readonly x: number = 0,
        public readonly y: number = 0) {
    }

    distanceTo(other: Point2): number {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    setX(x: number): Point2 {
        if (x === this.x) return this;
        return new Point2(x, this.y);
    }

    setY(y: number): Point2 {
        if (y === this.y) return this;
        return new Point2(this.x, y);
    }

    setCoords(x: number, y: number): Point2 {
        if (x === this.x && y === this.y) return this;
        return new Point2(x, y);
    }
}