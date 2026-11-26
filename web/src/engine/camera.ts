export class MapCamera {
  /** World center in display km (y points north) */
  cx = -100;
  cy = 1520;
  /** Pixels per world km */
  scale = 0.24;
  minScale = 0.14;
  maxScale = 5.2;

  width = 1280;
  height = 800;

  private bounds: [number, number, number, number] = [-2500, 50, 2350, 3250];
  private anim: {
    t0: number;
    dur: number;
    x0: number;
    y0: number;
    s0: number;
    x1: number;
    y1: number;
    s1: number;
  } | null = null;

  setBounds(bounds: [number, number, number, number]) {
    this.bounds = bounds;
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    const bw = this.bounds[2] - this.bounds[0];
    const bh = this.bounds[3] - this.bounds[1];
    this.minScale = Math.min(this.width / (bw * 1.18), this.height / (bh * 1.24));
  }

  fitBounds(
    box: [number, number, number, number] = this.bounds,
    opts?: { padLeft?: number; padRight?: number; padTop?: number; padBottom?: number; animate?: boolean },
  ) {
    const padL = opts?.padLeft ?? 24;
    const padR = opts?.padRight ?? 24;
    const padT = opts?.padTop ?? 72;
    const padB = opts?.padBottom ?? 92;
    const availW = Math.max(180, this.width - padL - padR);
    const availH = Math.max(180, this.height - padT - padB);
    const bw = Math.max(100, box[2] - box[0]);
    const bh = Math.max(100, box[3] - box[1]);
    const targetScale = Math.max(this.minScale, Math.min(this.maxScale, Math.min(availW / bw, availH / bh) * 0.94));
    const midX = (box[0] + box[2]) * 0.5;
    const midY = (box[1] + box[3]) * 0.5;
    // Offset center so visual box centers inside the padded safe area
    const shiftScreenX = (padR - padL) * 0.5;
    const shiftScreenY = (padB - padT) * 0.5;
    const tx = midX + shiftScreenX / targetScale;
    const ty = midY - shiftScreenY / targetScale;

    if (opts?.animate) {
      this.flyTo(tx, ty, targetScale, 520);
    } else {
      this.anim = null;
      this.cx = tx;
      this.cy = ty;
      this.scale = targetScale;
      this.clamp();
    }
  }

  flyTo(x: number, y: number, scale: number, dur = 500) {
    this.anim = {
      t0: performance.now(),
      dur,
      x0: this.cx,
      y0: this.cy,
      s0: this.scale,
      x1: x,
      y1: y,
      s1: Math.max(this.minScale, Math.min(this.maxScale, scale)),
    };
  }

  step(now: number): boolean {
    if (!this.anim) return false;
    const t = Math.min(1, (now - this.anim.t0) / this.anim.dur);
    // Smooth cubic ease-out
    const e = 1 - Math.pow(1 - t, 3);
    this.cx = this.anim.x0 + (this.anim.x1 - this.anim.x0) * e;
    this.cy = this.anim.y0 + (this.anim.y1 - this.anim.y0) * e;
    // Log-space zoom interpolation feels completely natural
    this.scale = Math.exp(Math.log(this.anim.s0) + (Math.log(this.anim.s1) - Math.log(this.anim.s0)) * e);
    if (t >= 1) this.anim = null;
    this.clamp();
    return true;
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.cx) * this.scale + this.width * 0.5,
      (this.cy - wy) * this.scale + this.height * 0.5,
    ];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [
      (sx - this.width * 0.5) / this.scale + this.cx,
      this.cy - (sy - this.height * 0.5) / this.scale,
    ];
  }

  panByScreen(dxPx: number, dyPx: number) {
    this.anim = null;
    this.cx -= dxPx / this.scale;
    this.cy += dyPx / this.scale;
    this.clamp();
  }

  zoomAtScreen(sx: number, sy: number, factor: number) {
    this.anim = null;
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    this.cx = wx - (sx - this.width * 0.5) / this.scale;
    this.cy = wy + (sy - this.height * 0.5) / this.scale;
    this.clamp();
  }

  private clamp() {
    const padX = 500;
    const padY = 450;
    this.cx = Math.max(this.bounds[0] - padX, Math.min(this.bounds[2] + padX, this.cx));
    this.cy = Math.max(this.bounds[1] - padY, Math.min(this.bounds[3] + padY, this.cy));
  }
}
