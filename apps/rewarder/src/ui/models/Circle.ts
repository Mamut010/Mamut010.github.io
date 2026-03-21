class CircleGeometry {
    constructor(public readonly radius: number) { }

    setRadius(radius: number): CircleGeometry {
        if (radius === this.radius) return this;
        return new CircleGeometry(radius);
    }
}

class Circle {
    constructor(
        public readonly center: Point2,
        public readonly geometry: CircleGeometry,
    ) { }

    static fromRadius(center: Point2, radius: number): Circle {
        return new Circle(center, new CircleGeometry(radius));
    }

    static of(x: number, y: number, radius: number): Circle {
        return Circle.fromRadius(new Point2(x, y), radius);
    }

    get x(): number { return this.center.x; }
    get y(): number { return this.center.y; }
    get r(): number { return this.geometry.radius; }
    
    setCenter(center: Point2): Circle {
        if (center === this.center) return this;
        return new Circle(center, this.geometry);
    }

    setGeometry(geometry: CircleGeometry): Circle {
        if (geometry === this.geometry) return this;
        return new Circle(this.center, geometry);
    }
}