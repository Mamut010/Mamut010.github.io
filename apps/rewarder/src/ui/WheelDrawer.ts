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
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx:    CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d")!;
    }

    draw(rotation: number, segments: WheelSegment[], segAngles: SegmentAngles[]): void {
        const { canvas, ctx } = this;
        const W  = canvas.width;
        const H  = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const r  = Math.min(cx, cy) - 18;   // leave room for the pointer above the wheel

        ctx.clearRect(0, 0, W, H);

        if (segments.length === 0) {
            // Empty placeholder ring
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.strokeStyle = "#2a2a5a";
            ctx.lineWidth   = 2;
            ctx.stroke();
            this.drawPointer(cx, cy, r);
            return;
        }

        const offset = -Math.PI / 2;   // rotate so angle 0 points to the top

        // ── Filled segments ───────────────────────────────────────────────────
        for (let i = 0; i < segments.length; i++) {
            const seg    = segments[i];
            const angles = segAngles[i];
            const startA = angles.start + rotation + offset;
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

            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // ── Text labels ───────────────────────────────────────────────────────
        for (let i = 0; i < segments.length; i++) {
            const seg    = segments[i];
            const angles = segAngles[i];
            const midA   = angles.mid + rotation + offset;
            const txtR   = r * 0.62;
            const arcLen = angles.sweep * txtR;   // arc length at label radius

            // Font size adapts to canvas size and available arc length
            const fontSize = Math.max(8, Math.min(13, r * 0.09, arcLen * 0.45));
            const maxChars = Math.floor(arcLen / (fontSize * 0.62));
            if (maxChars < 1) continue;

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
            ctx.shadowBlur    = 4;
            ctx.fillStyle     = "#ffffff";
            ctx.fillText(label, 0, 0);
            ctx.shadowBlur    = 0;
            ctx.restore();
        }

        // ── Outer ring ────────────────────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "#4a4a8a";
        ctx.lineWidth   = 3;
        ctx.stroke();

        // ── Center cap ────────────────────────────────────────────────────────
        const capR = r * 0.10;
        ctx.beginPath();
        ctx.arc(cx, cy, capR, 0, 2 * Math.PI);
        ctx.fillStyle   = "#0f172a";
        ctx.fill();
        ctx.strokeStyle = "#c084fc";
        ctx.lineWidth   = 2;
        ctx.stroke();

        this.drawPointer(cx, cy, r);
    }

    private drawPointer(cx: number, cy: number, r: number): void {
        const ctx   = this.ctx;
        const tipY  = cy - r - 2;    // tip just above the outer ring
        const baseY = tipY - 13;     // base of the triangle

        ctx.beginPath();
        ctx.moveTo(cx,     tipY);
        ctx.lineTo(cx - 9, baseY);
        ctx.lineTo(cx + 9, baseY);
        ctx.closePath();

        ctx.shadowColor = "rgba(192,132,252,0.7)";
        ctx.shadowBlur  = 10;
        ctx.fillStyle   = "#c084fc";
        ctx.fill();
        ctx.shadowBlur  = 0;
    }
}
