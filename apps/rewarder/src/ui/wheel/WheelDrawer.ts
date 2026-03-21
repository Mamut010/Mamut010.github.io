// ===== Wheel Drawer =====

/** Core data model for one wheel segment. */
interface WheelSegment {
    id:          string;
    name:        string;
    color:       string;       // label color (reserved for future use)
    borderColor: string;       // segment fill color
    weight:      number;       // relative weight (any positive number, will be normalised)
}

/** Pre-computed angular geometry for one segment. */
type SegmentAngles = { start: number; mid: number; sweep: number };

interface ISpinningWheelDrawer {
    /** Render the wheel at the given rotation with the given geometry. */
    draw(rotation: number, segments: WheelSegment[], segAngles: SegmentAngles[]): void;
}

/** Canvas 2D implementation of ISpinningWheelDrawer. */
class CanvasWheelDrawer implements ISpinningWheelDrawer {
    private static readonly BASE_OFFSET = -Math.PI / 2; // rotate so angle 0 points to the top

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx:    CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d")!;
    }

    draw(rotation: number, segments: WheelSegment[], segAngles: SegmentAngles[]): void {
        const wheelShape = this.getWheelShape();

        this.clearCanvas();

        if (segments.length === 0) {
            this.drawEmptyPlaceholder(wheelShape);
            return;
        }

        const offset = CanvasWheelDrawer.BASE_OFFSET + rotation;

        this.fillSegments(segments, segAngles, offset, wheelShape);
        this.drawTextLabels(segments, segAngles, offset, wheelShape);
        this.drawOuterRing(wheelShape);
        this.drawCenterCap(wheelShape);
        this.drawPointer(wheelShape);
    }

    private getWheelShape(): Circle {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const r  = Math.min(cx, cy) * 0.88; // leave room for the pointer above the wheel
        return Circle.of(cx, cy, r);
    }

    private clearCanvas(): void {
        const { canvas, ctx } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    private drawEmptyPlaceholder(wheelShape: Circle): void {
        const ctx  = this.ctx;
        const cx = wheelShape.x;
        const cy = wheelShape.y;
        const r = wheelShape.r;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "#2a2a5a";
        ctx.lineWidth   = Math.max(1, r * 0.015);
        ctx.stroke();
        this.drawPointer(wheelShape);
    }

    private fillSegments(segments: WheelSegment[], segAngles: SegmentAngles[], offset: number, wheelShape: Circle): void {
        for (let i = 0; i < segments.length; i++) {
            this.fillSegment(segments[i], segAngles[i], offset, wheelShape);
        }
    }

    private fillSegment(seg: WheelSegment, angles: SegmentAngles, offset: number, wheelShape: Circle): void {
        const ctx    = this.ctx;
        const cx     = wheelShape.x;
        const cy     = wheelShape.y;
        const r      = wheelShape.r;
        const startA = angles.start + offset;
        const endA   = startA + angles.sweep;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startA, endA);
        ctx.closePath();

        ctx.fillStyle = seg.borderColor || "#334155";
        ctx.fill();

        // Subtle sheen so dark colours remain distinguishable
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();

        // const isFullArc = Math.abs(angles.sweep - 2 * Math.PI) < 0.001;
        // // Stroke segment borders except for full circles (to avoid a thin gap in that case)
        // if (!isFullArc) {
        //     this.strokeSegmentBorder(r);
        // }
    }

    private strokeSegmentBorder(radius: number) {
        const ctx = this.ctx;

        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth   = Math.max(1, radius * 0.006);
        ctx.stroke();
    }

    private drawTextLabels(segments: WheelSegment[], segAngles: SegmentAngles[], offset: number, wheelShape: Circle): void {
        for (let i = 0; i < segments.length; i++) {
            this.drawTextLabel(segments[i], segAngles[i], offset, wheelShape);
        }
    }

    private drawTextLabel(seg: WheelSegment, angles: SegmentAngles, offset: number, wheelShape: Circle): void {
        const ctx    = this.ctx;
        const cx     = wheelShape.x;
        const cy     = wheelShape.y;
        const r      = wheelShape.r;
        const midA   = angles.mid + offset;
        const txtR   = r * 0.62;
        const arcLen = angles.sweep * txtR;   // arc length at label radius

        // Font size adapts to canvas size and available arc length
        const fontSize = Math.max(r * 0.05, Math.min(r * 0.098, arcLen * 0.45));
        const maxChars = Math.floor(arcLen / (fontSize * 0.62));
        if (maxChars < 1) return;

        let label = seg.name;
        if (label.length > maxChars) {
            label = maxChars >= 2 ? label.slice(0, maxChars - 1) + "\u2026" : label.slice(0, 1);
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(midA);
        ctx.translate(txtR, 0);

        ctx.font          = `bold ${fontSize}px "clear sans", Arial, sans-serif`;
        ctx.textAlign     = "center";
        ctx.textBaseline  = "middle";
        ctx.shadowColor   = "rgba(0,0,0,0.8)";
        ctx.shadowBlur    = Math.max(2, r * 0.03);
        ctx.fillStyle     = "#ffffff";
        ctx.fillText(label, 0, 0);
        ctx.shadowBlur    = 0;
        ctx.restore();
    }

    private drawOuterRing(wheelShape: Circle): void {
        const ctx = this.ctx;
        const cx = wheelShape.x;
        const cy = wheelShape.y;
        const r = wheelShape.r;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "#4a4a8a";
        ctx.lineWidth   = Math.max(1, r * 0.023);
        ctx.stroke();
    }

    private drawCenterCap(wheelShape: Circle): void {
        const ctx = this.ctx;
        const cx = wheelShape.x;
        const cy = wheelShape.y;
        const r = wheelShape.r;

        const capR = r * 0.10;
        ctx.beginPath();
        ctx.arc(cx, cy, capR, 0, 2 * Math.PI);
        ctx.fillStyle   = "#0f172a";
        ctx.fill();
        ctx.strokeStyle = "#c084fc";
        ctx.lineWidth   = Math.max(1, r * 0.015);
        ctx.stroke();
    }

    private drawPointer(wheelShape: Circle): void {
        const ctx  = this.ctx;
        const cx = wheelShape.x;
        const cy = wheelShape.y;
        const r = wheelShape.r;

        const ph   = Math.max(8,  r * 0.098); // pointer height
        const pw   = Math.max(5,  r * 0.068); // pointer half-width
        const tipY = cy - r - Math.max(1, r * 0.015); // tip just above the outer ring
        const baseY = tipY - ph;

        ctx.beginPath();
        ctx.moveTo(cx,      tipY);
        ctx.lineTo(cx - pw, baseY);
        ctx.lineTo(cx + pw, baseY);
        ctx.closePath();

        ctx.shadowColor = "rgba(192,132,252,0.7)";
        ctx.shadowBlur  = Math.max(4, r * 0.076);
        ctx.fillStyle   = "#c084fc";
        ctx.fill();
        ctx.shadowBlur  = 0;
    }
}
