/**
 * Interactive Global Force Projection Nautical Chart Engine (Miller Cylindrical Projection — V2 High-Detail)
 * Renders crisp 0.09° Natural Earth 1:50m coastlines & 125 world lakes, coastal shelf glow,
 * engraved ocean waves & graticule degree ticks, classical brass compass rose, 6 Navy Numbered Fleets,
 * 8 maritime chokepoints, distinct service-branch military emblems (Air Force wings / Navy anchor /
 * Army star-fort / Marines shield), heraldic host-nation troop plaques, and dateline-aware great-circle arcs.
 */
import type {
  GlobalBaseRecord,
  GlobalCountryRecord,
  GlobalMilitaryDataset,
  Locale,
  NavyFleetRecord,
  ThemeMode,
} from '../types/world';
import { localizeGlobalCountry } from '../i18n/dataL10n';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const MIN_LAT = -58;
const MAX_LAT = 79;

export function lonLatToWorld(lon: number, lat: number): [number, number] {
  const clampedLat = Math.max(MIN_LAT, Math.min(MAX_LAT, lat));
  const phi = clampedLat * DEG2RAD;
  const wy = RAD2DEG * 1.25 * Math.asinh(Math.tan(0.8 * phi));
  return [lon, wy];
}

export function worldToLonLat(wx: number, wy: number): [number, number] {
  const lat = RAD2DEG * (Math.atan(Math.sinh((wy * DEG2RAD) / 1.25)) / 0.8);
  return [wx, lat];
}

export const WORLD_BOUNDS: [number, number, number, number] = [
  -180,
  lonLatToWorld(0, MIN_LAT)[1],
  180,
  lonLatToWorld(0, MAX_LAT)[1],
];

export const GLOBAL_BRANCH_COLORS: Record<string, string> = {
  army: '#7D9A46',
  navy: '#387EE0',
  air_force: '#5CB4EC',
  marines: '#D9574B',
  reserve_guard: '#D6B04A',
};

const CONTINENT_LABELS: { en: string; zh: string; lon: number; lat: number }[] = [
  { en: 'NORTH AMERICA', zh: '北美洲', lon: -104, lat: 52 },
  { en: 'SOUTH AMERICA', zh: '南美洲', lon: -60, lat: -15 },
  { en: 'EUROPE', zh: '欧洲', lon: 22, lat: 54 },
  { en: 'AFRICA', zh: '非洲', lon: 19, lat: 6 },
  { en: 'ASIA', zh: '亚洲', lon: 96, lat: 46 },
  { en: 'OCEANIA', zh: '大洋洲', lon: 134, lat: -25 },
];

export class GlobalMapCamera {
  cx = 10;
  cy = 14;
  scale = 3.5;
  minScale = 1.6;
  maxScale = 76;
  width = 1280;
  height = 800;

  panVelX = 0;
  panVelY = 0;
  private lastStepMs: number | null = null;
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

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    const bw = WORLD_BOUNDS[2] - WORLD_BOUNDS[0];
    const bh = WORLD_BOUNDS[3] - WORLD_BOUNDS[1];
    const availW = Math.max(360, this.width - (this.width >= 960 ? 480 : 32));
    this.minScale = Math.max(1.2, Math.min(availW / (bw * 1.05), this.height / (bh * 1.1)));
  }

  fitLonLatBox(
    box: [number, number, number, number],
    opts?: { padLeft?: number; padRight?: number; padTop?: number; padBottom?: number; animate?: boolean },
  ) {
    const [minLon, minLat, maxLon, maxLat] = box;
    const [x0, y0] = lonLatToWorld(minLon, minLat);
    const [x1, y1] = lonLatToWorld(maxLon, maxLat);
    const padL = opts?.padLeft ?? 24;
    const padR = opts?.padRight ?? 24;
    const padT = opts?.padTop ?? 56;
    const padB = opts?.padBottom ?? 36;
    const availW = Math.max(200, this.width - padL - padR);
    const availH = Math.max(180, this.height - padT - padB);
    const bw = Math.max(10, x1 - x0);
    const bh = Math.max(10, y1 - y0);
    const targetScale = Math.max(this.minScale, Math.min(this.maxScale, Math.min(availW / bw, availH / bh) * 0.96));
    const midX = (x0 + x1) * 0.5;
    const midY = (y0 + y1) * 0.5;
    const tx = midX + ((padR - padL) * 0.5) / targetScale;
    const ty = midY - ((padB - padT) * 0.5) / targetScale;
    if (opts?.animate) {
      this.flyToWorld(tx, ty, targetScale, 520);
    } else {
      this.anim = null;
      this.cx = tx;
      this.cy = ty;
      this.scale = targetScale;
      this.clamp();
    }
  }

  fitWorld(opts?: { padLeft?: number; padRight?: number; padTop?: number; padBottom?: number; animate?: boolean }) {
    this.fitLonLatBox([-175, -48, 178, 74], opts);
  }

  flyToLonLat(lon: number, lat: number, targetScale: number, padLeft = 0, dur = 520) {
    const [wx, wy] = lonLatToWorld(lon, lat);
    const s = Math.max(this.minScale, Math.min(this.maxScale, targetScale));
    const tx = wx - (padLeft * 0.5) / s;
    this.flyToWorld(tx, wy, s, dur);
  }

  flyToWorld(x: number, y: number, scale: number, dur = 500) {
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

  setPanVelocity(vx: number, vy: number) {
    this.panVelX = vx;
    this.panVelY = vy;
    if (vx !== 0 || vy !== 0) this.anim = null;
    else this.lastStepMs = null;
  }

  zoomByAnimated(sx: number, sy: number, factor: number, dur = 220) {
    const baseCx = this.anim ? this.anim.x1 : this.cx;
    const baseCy = this.anim ? this.anim.y1 : this.cy;
    const baseScale = this.anim ? this.anim.s1 : this.scale;
    const wx = (sx - this.width * 0.5) / baseScale + baseCx;
    const wy = baseCy - (sy - this.height * 0.5) / baseScale;
    const nextScale = Math.max(this.minScale, Math.min(this.maxScale, baseScale * factor));
    const nextCx = wx - (sx - this.width * 0.5) / nextScale;
    const nextCy = wy + (sy - this.height * 0.5) / nextScale;
    this.flyToWorld(nextCx, nextCy, nextScale, dur);
  }

  step(now: number): boolean {
    let active = false;
    if (this.panVelX !== 0 || this.panVelY !== 0) {
      const dt = this.lastStepMs === null ? 1 / 60 : Math.min(0.05, Math.max(0.001, (now - this.lastStepMs) / 1000));
      this.lastStepMs = now;
      this.cx += (this.panVelX * dt) / this.scale;
      this.cy -= (this.panVelY * dt) / this.scale;
      this.clamp();
      active = true;
    } else {
      this.lastStepMs = null;
    }

    if (this.anim) {
      const t = Math.min(1, (now - this.anim.t0) / this.anim.dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.cx = this.anim.x0 + (this.anim.x1 - this.anim.x0) * e;
      this.cy = this.anim.y0 + (this.anim.y1 - this.anim.y0) * e;
      this.scale = Math.exp(Math.log(this.anim.s0) + (Math.log(this.anim.s1) - Math.log(this.anim.s0)) * e);
      if (t >= 1) this.anim = null;
      this.clamp();
      active = true;
    }
    return active;
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.cx) * this.scale + this.width * 0.5,
      (this.cy - wy) * this.scale + this.height * 0.5,
    ];
  }

  lonLatToScreen(lon: number, lat: number): [number, number] {
    const [wx, wy] = lonLatToWorld(lon, lat);
    return this.worldToScreen(wx, wy);
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
    this.cx = Math.max(-195, Math.min(195, this.cx));
    this.cy = Math.max(WORLD_BOUNDS[1] - 12, Math.min(WORLD_BOUNDS[3] + 12, this.cy));
  }
}

export interface GlobalHitResult {
  bases: { base: GlobalBaseRecord; sx: number; sy: number; r: number }[];
  basePlaques: { base: GlobalBaseRecord; x0: number; y0: number; x1: number; y1: number }[];
  countries: { country: GlobalCountryRecord; sx: number; sy: number; r: number }[];
  countryPlaques: { country: GlobalCountryRecord; x0: number; y0: number; x1: number; y1: number }[];
  fleets: { fleet: NavyFleetRecord; sx: number; sy: number; r: number; x0: number; y0: number; x1: number; y1: number }[];
}

export interface GlobalRenderOptions {
  camera: GlobalMapCamera;
  dataset: GlobalMilitaryDataset;
  theme: ThemeMode;
  locale: Locale;
  activeCocom: string | null;
  activeBranches: Set<string>;
  showBases: boolean;
  showTroops: boolean;
  showArcs: boolean;
  showFleets: boolean;
  showStraits: boolean;
  showLabels: boolean;
  hoveredBaseId: string | null;
  selectedBaseId: string | null;
  hoveredCountryName: string | null;
  selectedCountryName: string | null;
}

function sampleGreatCircle(lon1: number, lat1: number, lon2: number, lat2: number, steps = 36): [number, number][][] {
  const p1 = lat1 * DEG2RAD;
  const l1 = lon1 * DEG2RAD;
  const p2 = lat2 * DEG2RAD;
  const l2 = lon2 * DEG2RAD;

  const x1 = Math.cos(p1) * Math.cos(l1);
  const y1 = Math.cos(p1) * Math.sin(l1);
  const z1 = Math.sin(p1);
  const x2 = Math.cos(p2) * Math.cos(l2);
  const y2 = Math.cos(p2) * Math.sin(l2);
  const z2 = Math.sin(p2);

  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
  const omega = Math.acos(dot);
  const sinO = Math.sin(omega);

  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  let prevLon: number | null = null;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x: number, y: number, z: number;
    if (sinO < 1e-5) {
      x = x1 + (x2 - x1) * t;
      y = y1 + (y2 - y1) * t;
      z = z1 + (z2 - z1) * t;
    } else {
      const a = Math.sin((1 - t) * omega) / sinO;
      const b = Math.sin(t * omega) / sinO;
      x = a * x1 + b * x2;
      y = a * y1 + b * y2;
      z = a * z1 + b * z2;
    }
    const lat = Math.atan2(z, Math.hypot(x, y)) * RAD2DEG;
    const lon = Math.atan2(y, x) * RAD2DEG;

    if (prevLon !== null && Math.abs(lon - prevLon) > 180) {
      if (cur.length >= 2) segs.push(cur);
      cur = [[lon, lat]];
    } else {
      cur.push([lon, lat]);
    }
    prevLon = lon;
  }
  if (cur.length >= 2) segs.push(cur);
  return segs;
}

function fmtShortK(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Distinct geometric military emblem per service branch */
function drawBranchMarker(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  branch: string,
  fill: string,
  stroke: string,
  highlighted: boolean,
) {
  ctx.save();
  ctx.translate(sx, sy);

  if (highlighted) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 6.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(242, 201, 107, 0.28)';
    ctx.fill();
    ctx.strokeStyle = '#FFE58F';
    ctx.lineWidth = 1.7;
    ctx.stroke();
  }

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = highlighted ? 1.7 : 1.15;

  if (branch === 'air_force') {
    // Swept delta wing / airbase chevron
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 1.05, r * 0.55);
    ctx.lineTo(0, r * 0.15);
    ctx.lineTo(-r * 1.05, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (branch === 'navy') {
    // Crisp maritime diamond with inner anchor dot
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.12);
    ctx.lineTo(r * 1.05, 0);
    ctx.lineTo(0, r * 1.12);
    ctx.lineTo(-r * 1.05, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (r >= 5.5) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
    }
  } else if (branch === 'marines') {
    // Heraldic crimson shield
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, -r * 0.85);
    ctx.lineTo(r * 0.85, -r * 0.85);
    ctx.lineTo(r * 0.85, r * 0.1);
    ctx.quadraticCurveTo(r * 0.6, r * 0.85, 0, r * 1.12);
    ctx.quadraticCurveTo(-r * 0.6, r * 0.85, -r * 0.85, r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (branch === 'reserve_guard') {
    // Hexagon crest
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Army: classic pentagonal star-fort bastion
    ctx.beginPath();
    const spikes = 5;
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? r * 1.08 : r * 0.56;
      const a = (Math.PI * i) / spikes - Math.PI / 2;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Classical brass compass rose in upper-right corner of the global chart */
function drawCompassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number, isMid: boolean) {
  ctx.save();
  ctx.translate(cx, cy);
  const col = isMid ? 'rgba(222, 186, 108, 0.42)' : 'rgba(92, 68, 30, 0.42)';
  const colBright = isMid ? 'rgba(244, 212, 134, 0.72)' : 'rgba(72, 52, 20, 0.68)';

  // Outer brass ring
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 18.5, 0, Math.PI * 2);
  ctx.stroke();

  // 4 minor diagonal points
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  // 4 major cardinal star spikes
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i - Math.PI / 2;
    const leftA = a - 0.22;
    const rightA = a + 0.22;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
    ctx.lineTo(Math.cos(rightA) * 5, Math.sin(rightA) * 5);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? colBright : col;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
    ctx.lineTo(Math.cos(leftA) * 5, Math.sin(leftA) * 5);
    ctx.closePath();
    ctx.strokeStyle = colBright;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  ctx.font = '700 8.5px "Fraunces", Georgia, serif';
  ctx.fillStyle = colBright;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -28);
  ctx.restore();
}

export function renderGlobalMilitaryChart(ctx: CanvasRenderingContext2D, opts: GlobalRenderOptions): GlobalHitResult {
  const {
    camera,
    dataset,
    theme,
    locale,
    activeCocom,
    activeBranches,
    showBases,
    showTroops,
    showArcs,
    showFleets,
    showStraits,
    showLabels,
    hoveredBaseId,
    selectedBaseId,
    hoveredCountryName,
    selectedCountryName,
  } = opts;

  const { width: w, height: h, scale } = camera;
  const isMid = theme === 'midnight';
  const baseHits: GlobalHitResult['bases'] = [];
  const basePlaques: GlobalHitResult['basePlaques'] = [];
  const countryHits: GlobalHitResult['countries'] = [];
  const countryPlaques: GlobalHitResult['countryPlaques'] = [];
  const fleetHits: GlobalHitResult['fleets'] = [];

  // 1. Rich engraved deep-ocean vignette
  const grad = ctx.createRadialGradient(w * 0.58, h * 0.44, 50, w * 0.55, h * 0.5, Math.max(w, h) * 0.86);
  if (isMid) {
    grad.addColorStop(0, '#183552');
    grad.addColorStop(0.52, '#10243A');
    grad.addColorStop(1, '#081421');
  } else {
    grad.addColorStop(0, '#DFEEF3');
    grad.addColorStop(0.55, '#C1D8E3');
    grad.addColorStop(1, '#98B7C8');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 2. Vintage nautical ocean wave strokes (~)
  ctx.save();
  ctx.strokeStyle = isMid ? 'rgba(136, 194, 232, 0.08)' : 'rgba(42, 82, 110, 0.09)';
  ctx.lineWidth = 1;
  const waveStepDeg = scale >= 6 ? 8 : 16;
  for (let lon = -170; lon <= 170; lon += waveStepDeg) {
    for (let lat = -45; lat <= 68; lat += waveStepDeg) {
      const hash = Math.sin(lon * 1.13 + lat * 2.37);
      if (hash < 0.35) continue;
      const [sx, sy] = camera.lonLatToScreen(lon + hash * 4, lat);
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
      ctx.beginPath();
      ctx.moveTo(sx - 8, sy);
      ctx.quadraticCurveTo(sx - 4, sy - 2.4, sx, sy);
      ctx.quadraticCurveTo(sx + 4, sy + 2.4, sx + 8, sy);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 3. Nautical graticules (15°/30° grid + brass Equator / Tropics / Arctic Circle + margin labels)
  ctx.save();
  const lonStep = scale >= 7 ? 15 : 30;
  const latStep = scale >= 7 ? 15 : 30;
  ctx.lineWidth = 0.75;
  ctx.strokeStyle = isMid ? 'rgba(130, 185, 224, 0.10)' : 'rgba(42, 74, 96, 0.12)';
  for (let lon = -180; lon <= 180; lon += lonStep) {
    const [sx, sy0] = camera.lonLatToScreen(lon, MAX_LAT);
    const [, sy1] = camera.lonLatToScreen(lon, MIN_LAT);
    if (sx < -10 || sx > w + 10) continue;
    ctx.beginPath();
    ctx.moveTo(sx, sy0);
    ctx.lineTo(sx, sy1);
    ctx.stroke();
  }
  for (let lat = -45; lat <= 75; lat += latStep) {
    if (lat === 0) continue;
    const [sx0, sy] = camera.lonLatToScreen(-180, lat);
    const [sx1] = camera.lonLatToScreen(180, lat);
    if (sy < -10 || sy > h + 10) continue;
    ctx.beginPath();
    ctx.moveTo(sx0, sy);
    ctx.lineTo(sx1, sy);
    ctx.stroke();
  }

  // Equator, Tropics & Arctic Circle
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = isMid ? 'rgba(218, 182, 102, 0.22)' : 'rgba(148, 108, 40, 0.25)';
  for (const lat of [-23.44, 0, 23.44, 66.56]) {
    const [sx0, sy] = camera.lonLatToScreen(-180, lat);
    const [sx1] = camera.lonLatToScreen(180, lat);
    ctx.lineWidth = lat === 0 ? 1.1 : 0.8;
    ctx.beginPath();
    ctx.moveTo(sx0, sy);
    ctx.lineTo(sx1, sy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Crisp edge degree coordinate ticks
  ctx.font = '600 8.5px "JetBrains Mono", monospace';
  ctx.fillStyle = isMid ? 'rgba(182, 206, 224, 0.42)' : 'rgba(52, 72, 88, 0.50)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const lat of [60, 30, 0, -30]) {
    const [, sy] = camera.lonLatToScreen(0, lat);
    if (sy > 32 && sy < h - 52) {
      const lbl = lat === 0 ? '0° EQ' : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`;
      ctx.fillText(lbl, w - 8, sy);
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const lon of [-120, -60, 0, 60, 120]) {
    const [sx] = camera.lonLatToScreen(lon, 0);
    if (sx > 60 && sx < w - 50) {
      const lbl = lon === 0 ? '0°' : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`;
      ctx.fillText(lbl, sx, 8);
    }
  }
  ctx.restore();

  // 4. Coastal Shelf Shallow-Water Halo beneath Continents (Midnight cartography signature!)
  if (isMid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(66, 158, 204, 0.14)';
    ctx.lineWidth = Math.max(4, Math.min(11, scale * 1.9));
    ctx.lineJoin = 'round';
    for (const feat of dataset.world_land) {
      for (const ring of feat.polys) {
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [sx, sy] = camera.lonLatToScreen(ring[i][0], ring[i][1]);
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 5. Antique italic Ocean & Sea labels
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const oc of dataset.ocean_labels) {
    if (oc.size === 'sm' && scale < 3.4) continue;
    const [sx, sy] = camera.lonLatToScreen(oc.lon, oc.lat);
    if (sx < -120 || sx > w + 120 || sy < -40 || sy > h + 40) continue;
    const basePx = oc.size === 'lg' ? 13 : oc.size === 'md' ? 11 : 9.5;
    const fsz = Math.min(18, Math.max(9, basePx * Math.min(1.25, scale / 3.0)));
    ctx.font = `italic 600 ${fsz}px "Fraunces", Georgia, serif`;
    const txt = locale === 'zh' ? `${oc.name_zh} · ${oc.name_en}` : oc.name_en;
    ctx.fillStyle = isMid ? 'rgba(138, 196, 232, 0.25)' : 'rgba(34, 72, 98, 0.30)';
    ctx.fillText(txt, sx, sy);
  }
  ctx.restore();

  // 6. Crisp 0.09° Natural Earth World Countries — STRICTLY tint ONLY genuine military host nations!
  const cocomColors = new Map(dataset.cocoms.map((c) => [c.id, c.color]));
  ctx.save();
  for (const feat of dataset.world_land) {
    const isSel = feat.name === selectedCountryName || feat.name === hoveredCountryName;
    const matchesCocom = !activeCocom || feat.cocom === activeCocom || feat.is_us;
    const isHost = Boolean(feat.is_host);

    let fill: string;
    if (feat.is_us) {
      fill = isMid ? '#234A74' : '#5882A8';
    } else if (isHost && matchesCocom) {
      const intensity = Math.min(1, Math.log10(Math.max(20, feat.active + feat.base_count * 160)) / 5.0);
      if (isMid) {
        const r = Math.round(52 + intensity * 68);
        const g = Math.round(64 + intensity * 52);
        const b = Math.round(48 + intensity * 18);
        fill = `rgb(${r},${g},${b})`;
      } else {
        const r = Math.round(220 - intensity * 34);
        const g = Math.round(206 - intensity * 46);
        const b = Math.round(170 - intensity * 62);
        fill = `rgb(${r},${g},${b})`;
      }
    } else if (!matchesCocom) {
      fill = isMid ? 'rgba(24, 34, 42, 0.72)' : 'rgba(218, 214, 202, 0.68)';
    } else {
      // Non-garrison nations (China, Russia, India, Brazil, France, etc.) stay cleanly neutral!
      fill = isMid ? '#223037' : '#DFD8C8';
    }

    ctx.fillStyle = fill;
    ctx.strokeStyle = isSel
      ? '#FFE28A'
      : feat.is_us
        ? isMid ? '#E0BC6C' : '#26466B'
        : isHost && matchesCocom
          ? isMid ? 'rgba(226, 192, 114, 0.52)' : 'rgba(138, 98, 34, 0.48)'
          : isMid ? 'rgba(130, 162, 178, 0.22)' : 'rgba(92, 102, 108, 0.28)';
    ctx.lineWidth = isSel ? 1.9 : feat.is_us ? 1.25 : isHost && matchesCocom ? 0.95 : 0.55;

    for (const ring of feat.polys) {
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const [sx, sy] = camera.lonLatToScreen(ring[i][0], ring[i][1]);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();

  // 7. Major World Lakes (Great Lakes, Caspian, Baikal, Victoria, etc.)
  if (dataset.world_lakes && dataset.world_lakes.length > 0) {
    ctx.save();
    ctx.fillStyle = isMid ? '#183C5C' : '#A9C8D9';
    ctx.strokeStyle = isMid ? 'rgba(98, 172, 216, 0.45)' : 'rgba(62, 104, 130, 0.45)';
    ctx.lineWidth = 0.65;
    for (const ring of dataset.world_lakes) {
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const [sx, sy] = camera.lonLatToScreen(ring[i][0], ring[i][1]);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 8. Subtle Antique Serif Continent Names (for crisp orientation at overview zoom)
  if (scale <= 6.2) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fsz = Math.max(9.5, Math.min(13, scale * 3.8));
    ctx.font = `600 ${fsz}px "Fraunces", "PingFang SC", Georgia, serif`;
    ctx.fillStyle = isMid ? 'rgba(232, 224, 200, 0.22)' : 'rgba(54, 48, 38, 0.22)';
    for (const ct of CONTINENT_LABELS) {
      const [sx, sy] = camera.lonLatToScreen(ct.lon, ct.lat);
      if (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) continue;
      ctx.fillText(locale === 'zh' ? ct.zh : ct.en, sx, sy);
    }
    ctx.restore();
  }

  // Subtle U.S. Homeland Emblem
  {
    const [usx, usy] = camera.lonLatToScreen(-98.5, 39.5);
    if (usx > -80 && usx < w + 80 && usy > -30 && usy < h + 30) {
      ctx.save();
      const lbl = locale === 'zh' ? '★ 美国本土 (50州+DC · 1.17M)' : '★ U.S. HOMELAND · 1.17M';
      ctx.font = '700 9.5px "Fraunces", "PingFang SC", serif';
      const tw = ctx.measureText(lbl).width;
      ctx.fillStyle = isMid ? 'rgba(16, 32, 52, 0.88)' : 'rgba(248, 243, 232, 0.92)';
      ctx.strokeStyle = isMid ? '#D8B262' : '#7B5C24';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(usx - tw / 2 - 7, usy - 9, tw + 14, 18, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isMid ? '#F5DE9E' : '#2E2312';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, usx, usy + 0.5);
      ctx.restore();
    }
  }

  // 9. Great-Circle Force Projection Arcs (dateline-safe!)
  if (showArcs) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([5, 4]);
    for (const arc of dataset.projection_arcs) {
      if (activeCocom && arc.cocom !== activeCocom) continue;
      const col = cocomColors.get(arc.cocom) ?? '#5CC4D6';
      ctx.strokeStyle = isMid ? `${col}96` : `${col}CC`;
      ctx.lineWidth = Math.max(1.25, Math.min(2.3, scale * 0.34));
      const segs = sampleGreatCircle(arc.from_lon, arc.from_lat, arc.to_lon, arc.to_lat, 36);
      for (const seg of segs) {
        ctx.beginPath();
        seg.forEach(([lon, lat], i) => {
          const [sx, sy] = camera.lonLatToScreen(lon, lat);
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 10. Strategic Maritime Chokepoints
  if (showStraits && dataset.chokepoints) {
    ctx.save();
    for (const cp of dataset.chokepoints) {
      const [sx, sy] = camera.lonLatToScreen(cp.lon, cp.lat);
      if (sx < 10 || sx > w - 10 || sy < 30 || sy > h - 20) continue;
      ctx.strokeStyle = isMid ? 'rgba(242, 184, 92, 0.72)' : 'rgba(164, 92, 24, 0.78)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy);
      ctx.lineTo(sx + 4, sy);
      ctx.moveTo(sx, sy - 4);
      ctx.lineTo(sx, sy + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.stroke();

      if (scale >= 3.0) {
        const lbl = locale === 'zh' ? cp.name_zh : cp.name_en;
        ctx.font = '600 8.5px "Inter", "PingFang SC", sans-serif';
        ctx.fillStyle = isMid ? 'rgba(245, 206, 132, 0.78)' : 'rgba(122, 66, 14, 0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(lbl, sx, sy + 7);
      }
    }
    ctx.restore();
  }

  // 11. U.S. Navy 6 Numbered Fleet Ocean Medallions (⚓ 2nd–7th Fleet)
  const placedLabels: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const labelOverlaps = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < placedLabels.length; i++) {
      const b = placedLabels[i];
      if (x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) return true;
    }
    return false;
  };

  if (showFleets && dataset.fleets) {
    ctx.save();
    for (const fl of dataset.fleets) {
      if (activeCocom && fl.cocom !== activeCocom) continue;
      const [sx, sy] = camera.lonLatToScreen(fl.lon, fl.lat);
      if (sx < 30 || sx > w - 30 || sy < 30 || sy > h - 30) continue;
      const txt = locale === 'zh' ? `⚓ ${fl.name_zh}` : `⚓ ${fl.name_en}`;
      ctx.font = '700 9px "Inter", "PingFang SC", sans-serif';
      const tw = ctx.measureText(txt).width;
      const bw = tw + 12;
      const bh = 16;
      const x0 = sx - bw / 2;
      const y0 = sy - bh / 2;

      ctx.fillStyle = isMid ? 'rgba(18, 46, 78, 0.82)' : 'rgba(232, 242, 250, 0.88)';
      ctx.strokeStyle = isMid ? 'rgba(92, 178, 236, 0.65)' : 'rgba(38, 102, 158, 0.62)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, bh, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isMid ? '#9CD6FA' : '#184A7A';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, sx, sy + 0.5);

      placedLabels.push({ x0: x0 - 2, y0: y0 - 2, x1: x0 + bw + 2, y1: y0 + bh + 2 });
      fleetHits.push({ fleet: fl, sx, sy, r: Math.max(16, bw * 0.45), x0, y0, x1: x0 + bw, y1: y0 + bh });
    }
    ctx.restore();
  }

  // 12. Genuine Host Nation DMDC Troop Presence Rings (ZERO rings on China/Russia/embassy-only nations!)
  if (showTroops) {
    ctx.save();
    for (const c of dataset.countries) {
      if (c.lat == null || c.lon == null || c.active <= 0) continue;
      if (activeCocom && c.cocom !== activeCocom) continue;
      const [sx, sy] = camera.lonLatToScreen(c.lon, c.lat);
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;
      const rad = Math.max(4.5, Math.min(26, 3.0 + Math.sqrt(c.active / 57000) * 23));
      const isHi = c.name === hoveredCountryName || c.name === selectedCountryName;
      const col = cocomColors.get(c.cocom) ?? '#D4AE5E';

      ctx.beginPath();
      ctx.arc(sx, sy, isHi ? rad + 2.5 : rad, 0, Math.PI * 2);
      ctx.fillStyle = isMid ? `${col}30` : `${col}38`;
      ctx.fill();
      ctx.strokeStyle = isHi ? '#FFE58F' : col;
      ctx.lineWidth = isHi ? 2.2 : 1.3;
      ctx.stroke();

      countryHits.push({ country: c, sx, sy, r: Math.max(8, rad + 2) });
    }
    ctx.restore();
  }

  // 13. Audited FY2024 BSR Overseas Military Bases (498 sites, distinct branch emblems!)
  if (showBases) {
    const visibleBases = dataset.bases.filter((b) => {
      if (activeCocom && b.cocom !== activeCocom) return false;
      if (!activeBranches.has(b.branch)) return false;
      return true;
    });

    const ordered = [...visibleBases].reverse();
    let highlightBase: GlobalBaseRecord | null = null;

    for (const b of ordered) {
      if (b.id === hoveredBaseId || b.id === selectedBaseId) {
        highlightBase = b;
        continue;
      }
      const [sx, sy] = camera.lonLatToScreen(b.lon, b.lat);
      if (sx < -24 || sx > w + 24 || sy < -24 || sy > h + 24) continue;
      const col = GLOBAL_BRANCH_COLORS[b.branch] ?? '#9AA8B8';

      if (b.tier === 'hub') {
        const r = Math.max(5.4, Math.min(9.6, 4.6 + Math.log10(Math.max(100, b.prv_musd)) * 1.1));
        drawBranchMarker(ctx, sx, sy, r, b.branch, col, isMid ? '#FFF4D2' : '#1E252D', false);
        baseHits.push({ base: b, sx, sy, r: r + 4.5 });
      } else if (b.tier === 'major') {
        const r = scale < 5 ? 3.8 : 5.0;
        drawBranchMarker(ctx, sx, sy, r, b.branch, col, isMid ? 'rgba(15, 23, 34, 0.92)' : 'rgba(255,255,255,0.9)', false);
        baseHits.push({ base: b, sx, sy, r: r + 4 });
      } else if (scale >= 3.2 || activeCocom !== null) {
        const r = scale < 7 ? 2.5 : 3.6;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        baseHits.push({ base: b, sx, sy, r: r + 4 });
      }
    }

    // 14. Information-Rich Two-Tier Heraldic Labels with 4-quadrant AABB placement!
    // At overview zoom: crisp Host-Nation Troop + Base KPI Plaques + Iconic Ocean Hub Plaques
    // At regional zoom: Individual Base Plaques with Branch Color + PRV Valuation (highest PRV always wins)
    const findPlaqueSlot = (
      sx: number,
      sy: number,
      bw: number,
      bh: number,
      gap = 9,
      preferLeft = false,
    ): [number, number] | null => {
      const rPos: [number, number] = [Math.round(sx + gap), Math.round(sy - bh / 2)];
      const lPos: [number, number] = [Math.round(sx - gap - bw), Math.round(sy - bh / 2)];
      const tPos: [number, number] = [Math.round(sx - bw / 2), Math.round(sy - gap - bh)];
      const bPos: [number, number] = [Math.round(sx - bw / 2), Math.round(sy + gap)];
      const candidates = preferLeft ? [lPos, tPos, bPos, rPos] : [rPos, lPos, tPos, bPos];
      for (const [x0, y0] of candidates) {
        if (x0 < 10 || x0 + bw > w - 10 || y0 < 24 || y0 + bh > h - 28) continue;
        if (!labelOverlaps(x0 - 2, y0 - 2, x0 + bw + 2, y0 + bh + 2)) {
          placedLabels.push({ x0: x0 - 2, y0: y0 - 2, x1: x0 + bw + 2, y1: y0 + bh + 2 });
          return [x0, y0];
        }
      }
      return null;
    };

    if (showLabels) {
      ctx.save();
      if (scale < 4.8 && showTroops) {
        // Tier A: Major Host Nation Troop Plaques ([56.6K · 73] 日本 / Japan)
        const countriesByTroops = [...dataset.countries].sort((a, b) => b.active - a.active);
        for (const c of countriesByTroops) {
          if (c.lat == null || c.lon == null || c.active < 350) continue;
          if (activeCocom && c.cocom !== activeCocom) continue;
          const [sx, sy] = camera.lonLatToScreen(c.lon, c.lat);
          if (sx < 16 || sx > w - 16 || sy < 28 || sy > h - 30) continue;

          const col = cocomColors.get(c.cocom) ?? '#D4AE5E';
          const badge = c.base_count > 0 ? `${fmtShortK(c.active)} · ${c.base_count}` : fmtShortK(c.active);
          const cname = localizeGlobalCountry(c.name, locale, true);

          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          const bw1 = ctx.measureText(badge).width + 9;
          ctx.font = '700 9px "Inter", "PingFang SC", sans-serif';
          const bw2 = ctx.measureText(cname).width + 10;
          const totalW = bw1 + bw2;
          const bh = 16;
          const preferLeft = c.name === 'United Kingdom' || c.name === 'Spain' || c.name === 'South Korea';
          const slot = findPlaqueSlot(sx, sy, totalW, bh, 8, preferLeft);
          if (!slot) continue;
          const [x0, y0] = slot;
          const isCountryHi = c.name === hoveredCountryName || c.name === selectedCountryName;

          ctx.fillStyle = isMid ? 'rgba(13, 22, 34, 0.90)' : 'rgba(248, 243, 232, 0.94)';
          ctx.strokeStyle = isCountryHi
            ? '#FFE58F'
            : isMid
              ? 'rgba(214, 178, 98, 0.65)'
              : 'rgba(92, 72, 36, 0.50)';
          ctx.lineWidth = isCountryHi ? 1.5 : 0.9;
          ctx.beginPath();
          ctx.roundRect(x0, y0, totalW, bh, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.roundRect(x0 + 0.5, y0 + 0.5, bw1, bh - 1, [3.5, 0, 0, 3.5]);
          ctx.fill();

          ctx.fillStyle = '#0D1520';
          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badge, x0 + bw1 / 2, y0 + bh / 2 + 0.5);

          ctx.fillStyle = isMid ? '#F5E8C8' : '#231E16';
          ctx.font = '700 9px "Inter", "PingFang SC", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(cname, x0 + bw1 + 5, y0 + bh / 2 + 0.5);

          countryPlaques.push({ country: c, x0, y0, x1: x0 + totalW, y1: y0 + bh });
        }
      }

      // Tier B: Flagship Ocean/Theater Base Plaques sorted strictly by PRV DESCENDING so Kadena AB ($25.1B),
      // Andersen AFB ($19.1B), Diego Garcia ($19B), Camp Humphreys ($18.1B), Ramstein ($12.1B) always win!
      const basesByPrv = [...visibleBases].sort((a, b) => b.prv_musd - a.prv_musd);
      ctx.font = '700 9px "Inter", "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const b of basesByPrv) {
        if (b.id === selectedBaseId && b.id !== hoveredBaseId) continue;
        if (scale < 6.0 && b.tier !== 'hub') continue;
        if (scale < 12.0 && b.tier === 'site') continue;
        const [sx, sy] = camera.lonLatToScreen(b.lon, b.lat);
        if (sx < 12 || sx > w - 12 || sy < 26 || sy > h - 30) continue;

        const shortName = b.name
          .replace('NAVSUPPFAC ', '')
          .replace('COMFLEACT ', '')
          .replace('US Army ', '')
          .replace('Royal Australian Air Force Base ', 'RAAF ')
          .replace('Auxiliary Airfield', 'Aux. Field');
        const labelBase = shortName.length > 19 ? `${shortName.slice(0, 18)}…` : shortName;
        const valTag = scale >= 4.0 && b.prv_musd >= 500 ? ` · $${(b.prv_musd / 1000).toFixed(1)}B` : '';
        const txt = `${labelBase}${valTag}`;
        const tw = ctx.measureText(txt).width;
        const bw = tw + 13;
        const bh = 16;
        const slot = findPlaqueSlot(sx, sy, bw, bh, 9, false);
        if (!slot) continue;
        const [x0, y0] = slot;
        const isBaseHi = b.id === hoveredBaseId || b.id === selectedBaseId;

        ctx.fillStyle = isBaseHi
          ? (isMid ? 'rgba(20, 34, 52, 0.96)' : 'rgba(255, 250, 236, 0.98)')
          : (isMid ? 'rgba(12, 22, 34, 0.84)' : 'rgba(248, 243, 232, 0.90)');
        ctx.strokeStyle = isBaseHi
          ? '#F2C96B'
          : (isMid ? 'rgba(209, 173, 94, 0.45)' : 'rgba(92, 74, 42, 0.36)');
        ctx.lineWidth = isBaseHi ? 1.4 : 0.8;
        ctx.beginPath();
        ctx.roundRect(x0, y0, bw, bh, 3.5);
        ctx.fill();
        ctx.stroke();

        // Branch dot inside plaque
        ctx.fillStyle = GLOBAL_BRANCH_COLORS[b.branch] ?? '#D4AE5E';
        ctx.beginPath();
        ctx.arc(x0 + 5.5, y0 + bh / 2, 2.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isBaseHi ? (isMid ? '#FFF4D2' : '#1A140B') : (isMid ? '#F2E7C9' : '#23201A');
        ctx.fillText(txt, x0 + 10, y0 + bh / 2 + 0.5);

        basePlaques.push({ base: b, x0, y0, x1: x0 + bw, y1: y0 + bh });
      }
      ctx.restore();
    }

    // Highlighted / Selected base drawn on top with golden halo (pill shown when selected & not hovered)
    if (highlightBase) {
      const [sx, sy] = camera.lonLatToScreen(highlightBase.lon, highlightBase.lat);
      const col = GLOBAL_BRANCH_COLORS[highlightBase.branch] ?? '#F2C96B';
      drawBranchMarker(ctx, sx, sy, 9.8, highlightBase.branch, col, '#FFF8DC', true);
      baseHits.push({ base: highlightBase, sx, sy, r: 15 });

      if (highlightBase.id === selectedBaseId && highlightBase.id !== hoveredBaseId) {
        const cLoc = localizeGlobalCountry(highlightBase.country, locale, true);
        const sub = highlightBase.prv_musd >= 1000
          ? `$${(highlightBase.prv_musd / 1000).toFixed(1)}B`
          : highlightBase.prv_musd > 0
            ? `$${highlightBase.prv_musd.toFixed(0)}M`
            : cLoc;
        const pill = `${highlightBase.name} · ${cLoc} · ${sub}`;
        ctx.save();
        ctx.font = '700 11px "Inter", "PingFang SC", sans-serif';
        const tw = ctx.measureText(pill).width;
        const px = Math.max(tw / 2 + 12, Math.min(w - tw / 2 - 12, sx));
        const py = Math.max(40, sy - 23);
        ctx.fillStyle = 'rgba(12, 20, 32, 0.96)';
        ctx.strokeStyle = '#F2C96B';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(px - tw / 2 - 10, py - 10.5, tw + 20, 21, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FFF8E2';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pill, px, py + 0.5);
        ctx.restore();
      }
    }
  }

  // 15. Classical Brass Compass Rose in upper-right ocean margin
  drawCompassRose(ctx, w - 42, 46, isMid);

  return { bases: baseHits, basePlaques, countries: countryHits, countryPlaques, fleets: fleetHits };
}
