/**
 * Painterly Terrain & Pseudo-Isometric 3D City Tile Art Engine
 * Aligned with reference cartography (terrain.js + city.js):
 *  - Offscreen-cached sprites per (kind, variant, pxBucket) for smooth 60fps panning & zooming
 *  - World-anchored cropland patchwork, pasture, High Plains center-pivot irrigation, meadows, marshes, ice, mud cracks
 *  - Forests (deciduous / conifer / snow-conifer / mixed clumps), wooded hills, cover-tinted rolling hills,
 *    multi-peak mountains & alpine snow caps (using elev_max), Colorado Plateau red-rock mesas & buttes,
 *    Great Basin fault-block ranges, desert sage/cacti/dunes, red barns, suburban fringe
 *  - Pseudo-isometric 3D city tiles across 5 population tiers + metro sprawl spill + Washington D.C. domed Capitol
 */
import type { CityRecord, WorldHexData } from '../../types/world';
import type { MapCamera } from '../camera';
import type { WorldTopology } from '../hexTopology';
import {
  COVER,
  COVER_RGB,
  cssRgb,
  hash01,
  mixRgb,
  parseHex255,
  shadeRgb,
  type Rgb255,
} from '../../features/lenses/lensConfig';

const TAU = Math.PI * 2;
const WARM: Rgb255 = [255, 241, 196];
const COOL: Rgb255 = [38, 52, 86];
const HAZE: Rgb255 = [150, 170, 190];

// --- Deterministic PRNG & offscreen sprite cache -------------------------------------------------------------------

function rng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SpriteBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface CachedSprite {
  cv: HTMLCanvasElement;
  x0: number;
  y0: number;
  w: number;
  h: number;
}

const spriteCache = new Map<string, CachedSprite>();
const MAX_SPRITES = 900;

function bucketPx(px: number, min = 8, max = 144): number {
  const c = Math.max(min, Math.min(max, px));
  return Math.round(2 ** (Math.round(Math.log2(c) * 2) / 2));
}

function getSprite(
  key: string,
  upx: number,
  box: SpriteBox,
  paint: (g: CanvasRenderingContext2D, upx: number) => void,
): CachedSprite {
  const fullKey = `${key}@${upx}`;
  const hit = spriteCache.get(fullKey);
  if (hit) return hit;

  if (spriteCache.size > MAX_SPRITES) {
    // Evict oldest 1/3 entries
    const cut = Math.floor(MAX_SPRITES / 3);
    let idx = 0;
    for (const k of spriteCache.keys()) {
      spriteCache.delete(k);
      if (++idx >= cut) break;
    }
  }

  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const cw = Math.max(2, Math.ceil(w * upx));
  const ch = Math.max(2, Math.ceil(h * upx));
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext('2d')!;
  g.scale(cw / w, ch / h);
  g.translate(-box.x0, -box.y0);
  paint(g, upx);

  const spr: CachedSprite = { cv, x0: box.x0, y0: box.y0, w, h };
  spriteCache.set(fullKey, spr);
  return spr;
}

function blitSprite(
  ctx: CanvasRenderingContext2D,
  spr: CachedSprite,
  sx: number,
  sy: number,
  unitPx: number,
) {
  ctx.drawImage(
    spr.cv,
    sx + spr.x0 * unitPx,
    sy + spr.y0 * unitPx,
    spr.w * unitPx,
    spr.h * unitPx,
  );
}

// --- Shared drawing helpers (in R-unit space, y-down!) ------------------------------------------------------------

function softShadow(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  a: number,
) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / Math.max(1e-4, rx));
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(12,16,6,${a})`);
  gr.addColorStop(0.55, `rgba(12,16,6,${a * 0.55})`);
  gr.addColorStop(1, 'rgba(12,16,6,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, rx, 0, TAU);
  g.fill();
  g.restore();
}

function hexClip(g: CanvasRenderingContext2D, f: number) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 30) * Math.PI) / 180;
    const x = Math.cos(a) * f;
    const y = Math.sin(a) * f;
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.clip();
}

function polyPath(g: CanvasRenderingContext2D, pts: [number, number][]) {
  g.beginPath();
  for (let k = 0; k < pts.length; k++) {
    k ? g.lineTo(pts[k][0], pts[k][1]) : g.moveTo(pts[k][0], pts[k][1]);
  }
  g.closePath();
}

function blobPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  r: () => number,
  n = 9,
  wob = 0.3,
) {
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const f = 1 - wob / 2 + r() * wob;
    pts.push([x + Math.cos(a) * rx * f, y + Math.sin(a) * ry * f]);
  }
  g.beginPath();
  const mid = (p: [number, number], q: [number, number]): [number, number] => [
    (p[0] + q[0]) / 2,
    (p[1] + q[1]) / 2,
  ];
  const m0 = mid(pts[n - 1], pts[0]);
  g.moveTo(m0[0], m0[1]);
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const m = mid(p, pts[(k + 1) % n]);
    g.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  g.closePath();
}

// --- 1. Trees & Forests -------------------------------------------------------------------------------------------

interface TreePal {
  deep: string;
  dark: string;
  mid: string;
  light: string;
  hi: string;
}

const DECID: TreePal[] = [
  { deep: '#203a17', dark: '#2f5220', mid: '#4f7d2e', light: '#80ab49', hi: '#bcd77d' },
  { deep: '#2a3f16', dark: '#3e5c22', mid: '#678c34', light: '#9bbd55', hi: '#d2e391' },
  { deep: '#1b3416', dark: '#2a4a1f', mid: '#3f6b2c', light: '#6b9a43', hi: '#a6c873' },
  { deep: '#3a3412', dark: '#5c5420', mid: '#8c8132', light: '#bfa54a', hi: '#e7cf82' },
  { deep: '#3c2410', dark: '#6a3c1a', mid: '#a35c2a', light: '#cf8a3e', hi: '#efc27a' },
];
const CONIF: TreePal[] = [
  { deep: '#0d2318', dark: '#163423', mid: '#25523a', light: '#3e7650', hi: '#6e9e6e' },
  { deep: '#10281a', dark: '#1b3a26', mid: '#2f5f3a', light: '#4d8455', hi: '#82b078' },
  { deep: '#0c2420', dark: '#132e28', mid: '#1f4a3f', light: '#356c5a', hi: '#629682' },
];

function decidTree(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  pal: TreePal,
  px: number,
  shadow = true,
) {
  if (shadow) softShadow(g, x + h * 0.24, y - h * 0.01, h * 0.42, h * 0.13, 0.34);
  g.fillStyle = '#4a3622';
  g.fillRect(x - h * 0.035, y - h * 0.42, h * 0.07, h * 0.42);
  g.fillStyle = '#2a1e12';
  g.fillRect(x + h * 0.005, y - h * 0.42, h * 0.03, h * 0.42);
  const r = h * 0.3;
  const cx = x;
  const cy = y - h * 0.64;
  const lobes: [number, number, number][] = [
    [-0.5, 0.18, 0.72],
    [0.52, 0.22, 0.7],
    [0.02, -0.42, 0.78],
    [-0.22, 0.4, 0.66],
    [0.28, 0.42, 0.64],
    [0, 0.02, 0.9],
  ];
  const body = (grow: number) => {
    g.beginPath();
    for (const [dx, dy, f] of lobes) {
      g.moveTo(cx + dx * r + f * r + grow, cy + dy * r);
      g.arc(cx + dx * r, cy + dy * r, f * r + grow, 0, TAU);
    }
  };
  body(px * 1.1);
  g.fillStyle = 'rgba(18,28,10,.8)';
  g.fill();
  body(0);
  g.fillStyle = pal.dark;
  g.fill();
  for (const [dx, dy, f] of [...lobes].sort((p, q) => p[1] - q[1])) {
    const lx = cx + dx * r;
    const ly = cy + dy * r;
    const lr = f * r;
    const gr = g.createRadialGradient(lx - lr * 0.4, ly - lr * 0.45, lr * 0.05, lx, ly, lr * 1.05);
    const lit = dx + dy < -0.2;
    gr.addColorStop(0, lit ? pal.hi : pal.light);
    gr.addColorStop(0.45, lit ? pal.light : pal.mid);
    gr.addColorStop(1, pal.dark);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(lx, ly, lr, 0, TAU);
    g.fill();
  }
  g.save();
  body(0);
  g.clip();
  g.fillStyle = 'rgba(10,25,5,.32)';
  g.beginPath();
  g.ellipse(cx + r * 0.25, cy + r * 1.05, r * 1.1, r * 0.55, 0, 0, TAU);
  g.fill();
  g.restore();
}

function conifTree(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  pal: TreePal,
  px: number,
  shadow = true,
  snow = false,
) {
  if (shadow) softShadow(g, x + h * 0.26, y, h * 0.34, h * 0.1, 0.34);
  g.fillStyle = '#3a2a1a';
  g.fillRect(x - h * 0.025, y - h * 0.16, h * 0.05, h * 0.16);
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const yb = y - h * (0.1 + t * 0.24);
    const ya = t === tiers - 1 ? y - h : yb - h * (0.42 - t * 0.04);
    const wd = h * (0.25 - t * 0.055);
    g.beginPath();
    g.moveTo(x, ya);
    g.quadraticCurveTo(x - wd * 0.3, yb - (yb - ya) * 0.35, x - wd, yb);
    g.lineTo(x - wd * 0.45, yb - h * 0.025);
    g.lineTo(x, yb + h * 0.02);
    g.lineTo(x + wd * 0.45, yb - h * 0.025);
    g.lineTo(x + wd, yb);
    g.quadraticCurveTo(x + wd * 0.3, yb - (yb - ya) * 0.35, x, ya);
    g.closePath();
    g.strokeStyle = pal.deep;
    g.lineWidth = px * 1.5;
    g.stroke();
    const gr = g.createLinearGradient(x - wd, 0, x + wd, 0);
    gr.addColorStop(0, pal.light);
    gr.addColorStop(0.46, pal.mid);
    gr.addColorStop(0.54, pal.dark);
    gr.addColorStop(1, pal.deep);
    g.fillStyle = gr;
    g.fill();
    if (snow) {
      g.fillStyle = 'rgba(245,249,253,.92)';
      g.beginPath();
      g.moveTo(x, ya);
      g.quadraticCurveTo(x - wd * 0.2, ya + (yb - ya) * 0.3, x - wd * 0.55, ya + (yb - ya) * 0.62);
      g.lineTo(x - wd * 0.1, ya + (yb - ya) * 0.45);
      g.lineTo(x + wd * 0.2, ya + (yb - ya) * 0.35);
      g.closePath();
      g.fill();
    }
  }
}

function paintClump(g: CanvasRenderingContext2D, upx: number, v: number, kind: string) {
  const r = rng(v * 7919 + kind.length * 131 + 7);
  const px = 1 / upx;
  const n = 5 + Math.floor(r() * 3);
  const trees: { x: number; y: number; conif: boolean; h: number; pal: TreePal }[] = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * TAU + r() * 0.6;
    const rad = k === 0 ? 0 : 0.6 + r() * 0.4;
    const conif = kind.startsWith('conif') || (kind === 'mixed' && r() < 0.5);
    trees.push({
      x: Math.cos(ang) * 0.3 * rad,
      y: Math.sin(ang) * 0.1 * rad,
      conif,
      h: conif ? 0.44 + r() * 0.14 : 0.36 + r() * 0.1,
      pal: conif ? CONIF[Math.floor(r() * CONIF.length)] : DECID[Math.floor(r() * (kind === 'mixed' ? 5 : 4))],
    });
  }
  trees.sort((p, q) => p.y - q.y);
  softShadow(g, 0.14, 0.03, 0.46, 0.14, 0.3);
  for (const t of trees) softShadow(g, t.x + t.h * 0.24, t.y, t.h * 0.36, t.h * 0.1, 0.22);
  for (const t of trees) {
    if (t.conif) conifTree(g, t.x, t.y, t.h, t.pal, px, false, kind === 'conifsnow');
    else decidTree(g, t.x, t.y, t.h, t.pal, px, false);
  }
}

function paintTree(g: CanvasRenderingContext2D, upx: number, v: number, kind: string) {
  const px = 1 / upx;
  if (kind === 'conif') conifTree(g, 0, 0, 0.5, CONIF[v % CONIF.length], px);
  else decidTree(g, 0, 0, 0.44, DECID[v % 4], px);
}

// --- 2. Mountains, Snow Peaks, Red-Rock Mesas & Rolling Hills -----------------------------------------------------

interface MtnStyleSpec {
  lit: string;
  lit2: string;
  sh: string;
  sh2: string;
  line: string;
  snow: number;
  h: number;
  sage?: boolean;
  strata?: boolean;
  trees?: boolean;
}

const MTN_STYLES: Record<string, MtnStyleSpec> = {
  rock:      { lit: '#b9a990', lit2: '#8d7d68', sh: '#5f5246', sh2: '#43392f', line: '#2a2119', snow: 0, h: 0.95 },
  rocksnow:  { lit: '#aea89f', lit2: '#837c72', sh: '#5b5752', sh2: '#3d3a37', line: '#24211e', snow: 0.42, h: 1.02 },
  peak:      { lit: '#b3aea7', lit2: '#8a847c', sh: '#5c5956', sh2: '#3e3c3a', line: '#211f1d', snow: 0.6, h: 1.24 },
  arid:      { lit: '#c3b296', lit2: '#9a876b', sh: '#6b6052', sh2: '#4a4239', line: '#2b241c', snow: 0, h: 0.84, sage: true },
  desert:    { lit: '#cf9a6c', lit2: '#a8754e', sh: '#7b4c34', sh2: '#583626', line: '#361f13', snow: 0, h: 0.82, strata: true, sage: true },
  green:     { lit: '#a59b85', lit2: '#6c7a4a', sh: '#4f5442', sh2: '#2e3a25', line: '#1d2317', snow: 0, h: 0.9, trees: true },
  greensnow: { lit: '#aaa49a', lit2: '#6f7b52', sh: '#55574d', sh2: '#30392a', line: '#1f2219', snow: 0.36, h: 1.02, trees: true },
};

function drawPeak(
  g: CanvasRenderingContext2D,
  p: { x: number; h: number; wl: number; wr: number; haze: number; y: number; foot?: boolean },
  S: MtnStyleSpec,
  r: () => number,
  px: number,
) {
  const by = p.y;
  const sx = p.x;
  const sy = by - p.h;
  const col = (hex: string) => cssRgb(p.haze ? mixRgb(parseHex255(hex), HAZE, p.haze) : parseHex255(hex));
  const L: [number, number][] = [[sx - p.wl, by]];
  const Rr: [number, number][] = [];
  for (const t of [0.28, 0.52, 0.76]) {
    L.push([sx - p.wl * (1 - t) + (r() - 0.5) * 0.05, by - p.h * t + (r() - 0.5) * p.h * 0.1]);
    Rr.push([sx + p.wr * (1 - t) + (r() - 0.5) * 0.05, by - p.h * t + (r() - 0.5) * p.h * 0.1]);
  }
  Rr.reverse();
  const top: [number, number] = [sx, sy];
  const rEnd = sx + p.wr * (0.15 + r() * 0.15);
  const ridge: [number, number][] = [top];
  for (const t of [0.22, 0.45, 0.7]) ridge.push([sx + (rEnd - sx) * t + (r() - 0.5) * 0.09, sy + p.h * t]);
  ridge.push([rEnd, by]);
  const lit = [...L, top, ...ridge.slice(1)];
  const shd = [top, ...Rr, [sx + p.wr, by] as [number, number], ...ridge.slice(1).reverse()];
  const sil = [...L, top, ...Rr, [sx + p.wr, by] as [number, number]];

  g.beginPath();
  sil.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.strokeStyle = S.line;
  g.globalAlpha = p.haze ? 0.45 : 0.8;
  g.lineWidth = px * 2.1;
  g.stroke();
  g.globalAlpha = 1;

  let gr = g.createLinearGradient(sx - p.wl * 0.4, sy, sx - p.wl * 0.2, by);
  gr.addColorStop(0, col(S.lit));
  gr.addColorStop(1, col(S.lit2));
  polyPath(g, lit);
  g.fillStyle = gr;
  g.fill();

  gr = g.createLinearGradient(sx, sy, sx + p.wr * 0.4, by);
  gr.addColorStop(0, col(S.sh));
  gr.addColorStop(1, col(S.sh2));
  polyPath(g, shd);
  g.fillStyle = gr;
  g.fill();

  if (S.strata) {
    g.save();
    polyPath(g, sil);
    g.clip();
    for (let yy = sy + p.h * 0.3, k = 0; yy < by - 0.04; yy += 0.09 + r() * 0.05, k++) {
      g.beginPath();
      g.moveTo(sx - p.wl - 0.1, yy);
      g.quadraticCurveTo(sx, yy + (r() - 0.5) * 0.05, sx + p.wr + 0.1, yy + 0.02);
      g.strokeStyle = k % 2 ? 'rgba(255,214,160,.14)' : 'rgba(90,36,14,.14)';
      g.lineWidth = 0.014;
      g.stroke();
    }
    g.restore();
  }

  // Faceted gullies
  g.lineWidth = Math.max(px, 0.012);
  for (let k = 1; k < ridge.length - 1; k++) {
    const [rx, ry] = ridge[k];
    g.beginPath();
    g.moveTo(rx, ry);
    g.quadraticCurveTo(rx - 0.06, ry + 0.08, rx - 0.12 - r() * 0.1, ry + 0.16 + r() * 0.1);
    g.strokeStyle = col(S.sh);
    g.globalAlpha = 0.5;
    g.stroke();
    g.globalAlpha = 1;
  }

  // Jagged alpine snow cap
  const snowF = S.snow * (p.foot ? 0 : p.haze ? 0.85 : 1);
  if (snowF > 0) {
    const y0 = sy + p.h * snowF;
    const cap = new Path2D();
    cap.moveTo(sx - p.wl - 0.2, sy - 0.2);
    cap.lineTo(sx + p.wr + 0.2, sy - 0.2);
    cap.lineTo(sx + p.wr + 0.2, y0 - p.h * 0.08);
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const xx = sx + p.wr + 0.1 - ((p.wl + p.wr + 0.2) * k) / n;
      const drip = k % 2 ? p.h * (0.05 + r() * 0.09) : -p.h * (0.02 + r() * 0.04);
      cap.lineTo(xx, y0 + drip - (xx - sx) * 0.12);
    }
    cap.lineTo(sx - p.wl - 0.2, y0);
    cap.closePath();
    for (const [face, hex] of [[lit, '#f6f9fc'], [shd, '#aebfd4']] as [[number, number][], string][]) {
      g.save();
      polyPath(g, face);
      g.clip();
      g.fillStyle = p.haze ? cssRgb(mixRgb(parseHex255(hex), HAZE, p.haze * 0.6)) : hex;
      g.fill(cap);
      g.restore();
    }
  }

  // Sunlit ridge edge
  g.beginPath();
  g.moveTo(L[2][0], L[2][1]);
  g.lineTo(L[3][0], L[3][1]);
  g.lineTo(top[0], top[1]);
  g.strokeStyle = snowF > 0 ? 'rgba(255,255,255,.85)' : 'rgba(255,240,210,.45)';
  g.lineWidth = Math.max(px * 1.2, 0.012);
  g.stroke();
}

function paintMountain(g: CanvasRenderingContext2D, upx: number, v: number, style: string) {
  const S = MTN_STYLES[style] ?? MTN_STYLES.rock;
  const r = rng(v * 104729 + style.length * 977 + 3);
  const px = 1 / upx;
  const H = S.h * (0.9 + r() * 0.16);
  const lean = r() < 0.5 ? -1 : 1;
  const peaks: { x: number; h: number; wl: number; wr: number; haze: number; y: number; foot?: boolean }[] = [];
  if (r() < 0.65) {
    peaks.push({ x: lean * (0.36 + r() * 0.1), h: H * (0.5 + r() * 0.2), wl: 0.34 + r() * 0.06, wr: 0.36 + r() * 0.06, haze: 0.24, y: -0.04 });
  }
  peaks.push({ x: (r() - 0.5) * 0.1, h: H, wl: 0.48 + r() * 0.14, wr: 0.46 + r() * 0.14, haze: 0, y: 0 });
  if (r() < 0.45) {
    peaks.push({ x: -lean * (0.36 + r() * 0.1), h: H * (0.3 + r() * 0.12), wl: 0.26, wr: 0.3, haze: 0, y: 0.07, foot: true });
  }
  softShadow(g, 0.28, 0.04, 0.82, 0.17, 0.38);
  for (const p of peaks) drawPeak(g, p, S, r, px);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, -0.3, 0, 0.1);
  gr.addColorStop(0, 'rgba(30,22,14,0)');
  gr.addColorStop(1, 'rgba(30,22,14,.35)');
  g.fillStyle = gr;
  g.fillRect(-1.3, -0.3, 2.6, 0.6);
  g.restore();

  if (S.sage && upx > 24) {
    for (let k = 0, n = 7 + Math.floor(r() * 5); k < n; k++) {
      const x = (r() - 0.5) * 1.05;
      const y = -0.02 - r() * 0.16 * (1 - Math.abs(x));
      const br = Math.max(px * 1.3, 0.014 + r() * 0.01);
      g.fillStyle = k % 3 ? '#7d8656' : '#5f6b45';
      g.beginPath();
      g.arc(x, y, br, 0, TAU);
      g.fill();
    }
  }
  if (S.trees) {
    const n = 5 + Math.floor(r() * 2);
    const ts: [number, number, number][] = [];
    for (let k = 0; k < n; k++) {
      ts.push([(k / (n - 1) - 0.5) * 1.05 + (r() - 0.5) * 0.1, 0.03 + r() * 0.1, 0.17 + r() * 0.09]);
    }
    ts.sort((p, q) => p[1] - q[1]);
    for (const [tx, ty, th] of ts) {
      conifTree(g, tx, ty, th, CONIF[Math.floor(r() * CONIF.length)], px, true, S.snow > 0 && r() < 0.4);
    }
  }
}

const MESA_STRATA: [string, string][] = [
  ['#efd3a2', '#a88a62'],
  ['#c8693c', '#7c3820'],
  ['#d8975a', '#8a5530'],
  ['#b9583a', '#6e301c'],
];

function paintTable(
  g: CanvasRenderingContext2D,
  f: { x: number; tw: number; h: number; y: number },
  r: () => number,
  px: number,
) {
  const { x, tw, h, y: by } = f;
  const top = by - h;
  const cliffB = by - h * 0.48;
  const out = 0.08 + h * 0.42;
  const lean = Math.min(0.02, tw * 0.08);
  const split = x + tw * 0.38;
  const d = Math.min(0.055, tw * 0.28);
  const line = Math.max(px * 1.4, 0.009);

  // Concave talus skirt
  const talus = new Path2D();
  talus.moveTo(x - tw - 0.004, cliffB - 0.008);
  talus.bezierCurveTo(x - tw - out * 0.25, cliffB + (by - cliffB) * 0.55, x - tw - out * 0.6, by - 0.004, x - tw - out, by);
  talus.lineTo(x + tw + out * 1.2, by);
  talus.bezierCurveTo(x + tw + out * 0.7, by - 0.004, x + tw + out * 0.3, cliffB + (by - cliffB) * 0.55, x + tw + 0.01, cliffB - 0.008);
  talus.closePath();
  let gr = g.createLinearGradient(0, cliffB, 0, by);
  gr.addColorStop(0, '#a85f3a');
  gr.addColorStop(0.6, '#c48a5c');
  gr.addColorStop(1, 'rgba(206,160,112,0)');
  g.fillStyle = gr;
  g.fill(talus);

  const xl = x - tw;
  const xr = x + tw;
  const lip: [number, number][] = [];
  for (let k = 0, n = Math.max(5, Math.round(tw * 28)); k <= n; k++) {
    const t = k / n;
    const lx = xl + lean + (xr - xl - 2 * lean) * t;
    const notch = k > 0 && k < n && r() < 0.22 ? 0.012 + r() * 0.012 : (r() - 0.5) * 0.006;
    lip.push([lx, top + notch]);
  }
  const front: [number, number][] = [[xl + lean, top], ...lip.filter(([lx]) => lx <= split), [split, top], [split + 0.004, cliffB], [xl - 0.004, cliffB]];
  const side: [number, number][] = [[split, top], ...lip.filter(([lx]) => lx > split), [xr - lean, top], [xr + 0.01, cliffB], [split + 0.004, cliffB]];
  const block = new Path2D();
  [[xl + lean, top], ...lip, [xr - lean, top], [xr + 0.01, cliffB], [xl - 0.004, cliffB]].forEach(([qx, qy], k) =>
    k ? block.lineTo(qx, qy) : block.moveTo(qx, qy),
  );
  block.closePath();
  g.strokeStyle = 'rgba(52,22,9,.8)';
  g.lineWidth = line * 1.3;
  g.stroke(block);

  const bands = [0, 0.2 + r() * 0.06, 0.46 + r() * 0.08, 0.74 + r() * 0.06, 1];
  for (let b = 0; b < 4; b++) {
    const y0 = top + (cliffB - top) * bands[b];
    const y1 = top + (cliffB - top) * bands[b + 1] + 0.002;
    const [lit, shd] = MESA_STRATA[b];
    g.save();
    g.beginPath();
    g.rect(xl - 0.05, y0, xr - xl + 0.1, y1 - y0);
    g.clip();
    polyPath(g, front);
    g.fillStyle = lit;
    g.fill();
    polyPath(g, side);
    g.fillStyle = shd;
    g.fill();
    g.restore();
  }

  // Flat caprock top
  const capTop: [number, number][] = [
    [xl + lean, top],
    [xl + lean + d * 0.6, top - d * 0.8],
    [x - tw * 0.1, top - d + (r() - 0.5) * 0.01],
    [xr - lean - d * 0.4, top - d * 0.75],
    [xr - lean, top],
    ...lip.slice().reverse(),
  ];
  polyPath(g, capTop);
  gr = g.createLinearGradient(xl, top - d, xr, top);
  gr.addColorStop(0, '#f3d2a0');
  gr.addColorStop(1, '#d2a06c');
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(52,22,9,.7)';
  g.lineWidth = line;
  g.stroke();
}

function paintMesa(g: CanvasRenderingContext2D, upx: number, v: number, kind: string) {
  const r = rng(v * 331 + kind.length * 17 + 5);
  const px = 1 / upx;
  const butte = kind === 'butte';
  const forms = butte
    ? [{ x: (r() - 0.5) * 0.08, tw: 0.1 + r() * 0.04, h: 0.6 + r() * 0.1, y: 0 }]
    : v % 2
      ? [
          { x: -0.16, tw: 0.27 + r() * 0.07, h: 0.5 + r() * 0.08, y: 0 },
          { x: 0.56, tw: 0.075 + r() * 0.03, h: 0.52 + r() * 0.08, y: 0.07 },
        ]
      : [{ x: (r() - 0.5) * 0.1, tw: 0.3 + r() * 0.08, h: 0.5 + r() * 0.08, y: 0 }];
  softShadow(g, 0.26, 0.05, butte ? 0.42 : 0.72, 0.15, 0.42);
  for (const f of forms) paintTable(g, f, r, px);
}

function paintHill(g: CanvasRenderingContext2D, upx: number, v: number, toneKey: string) {
  const [cvStr, ...rgbStr] = toneKey.split('.');
  const cv = +cvStr;
  const c: Rgb255 = rgbStr.length === 3 ? [+rgbStr[0], +rgbStr[1], +rgbStr[2]] : [140, 145, 95];
  const dry = cv === COVER.SCRUB || cv === COVER.BARREN;
  const ice = cv === COVER.ICE;
  const pull = cv === COVER.NONE ? 0 : 0.38;
  const base = ice ? shadeRgb(c, -0.08) : shadeRgb(mixRgb(c, dry ? [170, 128, 72] : [100, 116, 54], pull), -0.1);
  const T = {
    hi: mixRgb(shadeRgb(base, 0.24), WARM, 0.22),
    light: mixRgb(shadeRgb(base, 0.12), WARM, 0.12),
    base,
    dark: mixRgb(shadeRgb(base, -0.3), COOL, 0.14),
    deep: mixRgb(shadeRgb(base, -0.5), COOL, 0.2),
    dry,
    ice,
  };
  const r = rng(v * 613 + cv * 37 + 11);
  const px = 1 / upx;
  const mounds: { x: number; w: number; h: number; y: number }[] = [];
  if (v % 3 === 0) mounds.push({ x: 0.3 + r() * 0.1, w: 0.3 + r() * 0.06, h: 0.16 + r() * 0.05, y: -0.04 });
  mounds.push({ x: (r() - 0.5) * 0.08, w: 0.46 + r() * 0.1, h: 0.26 + r() * 0.08, y: 0 });
  if (v % 4 === 1) mounds.push({ x: -0.36 - r() * 0.05, w: 0.24, h: 0.11 + r() * 0.04, y: 0.05 });

  for (const m of mounds) softShadow(g, m.x + m.w * 0.35, m.y + 0.02, m.w * 0.95, 0.11, 0.34);
  for (const { x, y, w, h } of mounds) {
    const top = x - w * 0.12 + (r() - 0.5) * 0.08;
    const path = new Path2D();
    path.moveTo(x - w, y);
    path.bezierCurveTo(x - w * 0.62, y - h * 0.78, top - w * 0.28, y - h * 1.02, top, y - h);
    path.bezierCurveTo(top + w * 0.36, y - h * 0.98, x + w * 0.72, y - h * 0.45, x + w, y);
    path.quadraticCurveTo(x, y + h * 0.12, x - w, y);
    path.closePath();
    g.strokeStyle = cssRgb(T.deep, 0.6);
    g.lineWidth = px * 2;
    g.stroke(path);

    let gr = g.createLinearGradient(x - w, y - h, x + w * 0.6, y);
    gr.addColorStop(0, cssRgb(T.light));
    gr.addColorStop(0.45, cssRgb(T.base));
    gr.addColorStop(1, cssRgb(T.dark));
    g.fillStyle = gr;
    g.fill(path);

    g.save();
    g.clip(path);
    gr = g.createLinearGradient(top + w * 0.05, 0, x + w * 0.85, 0);
    gr.addColorStop(0, cssRgb(T.dark, 0));
    gr.addColorStop(0.35, cssRgb(T.dark, 0.55));
    gr.addColorStop(1, cssRgb(T.deep, 0.75));
    g.fillStyle = gr;
    g.fillRect(x - w, y - h * 1.2, w * 2.2, h * 1.4);

    gr = g.createRadialGradient(top - w * 0.25, y - h * 0.85, 0, top - w * 0.2, y - h * 0.7, w * 0.55);
    gr.addColorStop(0, cssRgb(T.hi, 0.7));
    gr.addColorStop(1, cssRgb(T.hi, 0));
    g.fillStyle = gr;
    g.fillRect(x - w, y - h * 1.2, w * 2.2, h * 1.4);
    g.restore();

    g.beginPath();
    g.moveTo(x - w * 0.82, y - h * 0.3);
    g.bezierCurveTo(x - w * 0.6, y - h * 0.78, top - w * 0.28, y - h * 1.0, top + w * 0.1, y - h * 0.99);
    g.strokeStyle = cssRgb(T.hi, 0.8);
    g.lineWidth = Math.max(px * 1.4, 0.014);
    g.stroke();
  }
}

// --- 3. Plains, Cropland, Pivot, Desert, Marsh & Barn Sprites -----------------------------------------------------

function paintTuft(g: CanvasRenderingContext2D, upx: number, v: number, kind: string) {
  const r = rng(v * 97 + kind.length * 13 + 3);
  const px = 1 / upx;
  softShadow(g, 0.05, 0.005, 0.13, 0.035, 0.24);
  const n = 9;
  const tips: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const bx = (r() - 0.5) * 0.13;
    const lean = bx * 0.9 + (r() - 0.5) * 0.1;
    const hh = 0.11 + r() * 0.1;
    const wd = Math.max(0.011, px * 1.2);
    g.beginPath();
    g.moveTo(bx - wd, 0);
    g.quadraticCurveTo(bx + lean * 0.25, -hh * 0.6, bx + lean, -hh);
    g.quadraticCurveTo(bx + lean * 0.25 + wd * 0.6, -hh * 0.55, bx + wd, 0);
    g.closePath();
    g.fillStyle = k < 4 ? '#3f5a22' : k < 7 ? '#6f9238' : '#a8c660';
    g.fill();
    tips.push([bx + lean, -hh]);
  }
  if (kind === 'flowers') {
    const cols = ['#f4dc5c', '#fbf6ea', '#c79ade', '#f0a04a'];
    for (let k = 0; k < 3; k++) {
      const [tx, ty] = tips[n - 1 - k];
      g.fillStyle = cols[(v + k) % cols.length];
      g.beginPath();
      g.arc(tx, ty, Math.max(0.014, px * 1.3), 0, TAU);
      g.fill();
    }
  }
}

function paintSage(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 151 + 9);
  const px = 1 / upx;
  const blobs: [number, number, number][] = [];
  const n = 3 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) blobs.push([(r() - 0.5) * 0.18, -(r() * 0.04), 0.035 + r() * 0.025]);
  blobs.sort((p, q) => p[1] - q[1]);
  for (const [bx, by, br] of blobs) softShadow(g, bx + br * 0.8, by + 0.005, br * 1.4, br * 0.45, 0.28);
  for (const [bx, by, br] of blobs) {
    const cy = by - br * 0.8;
    g.beginPath();
    g.arc(bx, cy, br + px * 1.1, 0, TAU);
    g.fillStyle = 'rgba(48,52,28,.75)';
    g.fill();
    const gr = g.createRadialGradient(bx - br * 0.4, cy - br * 0.45, br * 0.05, bx, cy, br);
    gr.addColorStop(0, '#d2d6a4');
    gr.addColorStop(0.45, '#97a06d');
    gr.addColorStop(1, '#5c6743');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(bx, cy, br, 0, TAU);
    g.fill();
  }
}

function paintCactus(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 173 + 21);
  const px = 1 / upx;
  const H = 0.2 + r() * 0.07;
  const W = 0.04;
  softShadow(g, 0.07, 0.0, 0.12, 0.03, 0.3);
  const stems: [number, number][][] = [[[0, 0], [0, -H]]];
  if (r() < 0.8) {
    const ya = -H * (0.45 + r() * 0.15);
    stems.push([[0, ya], [0.065, ya], [0.065, ya - 0.07]]);
  }
  if (r() < 0.8) {
    const yb = -H * (0.55 + r() * 0.15);
    stems.push([[0, yb], [-0.055, yb], [-0.055, yb - 0.055]]);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const strokeAll = (width: number, style: string | CanvasGradient) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    for (const s of stems) {
      g.beginPath();
      s.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  };
  strokeAll(W + px * 2.2, '#1f3518');
  const gr = g.createLinearGradient(-0.08, 0, 0.09, 0);
  gr.addColorStop(0, '#9cc777');
  gr.addColorStop(0.5, '#5f8f46');
  gr.addColorStop(1, '#365a2b');
  strokeAll(W, gr);
}

function paintRocks(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 199 + 31);
  const px = 1 / upx;
  const n = 2 + Math.floor(r() * 2);
  const rocks: [number, number, number][] = [];
  for (let k = 0; k < n; k++) rocks.push([(r() - 0.5) * 0.2, -r() * 0.04, 0.04 + r() * 0.04]);
  rocks.sort((p, q) => p[1] - q[1]);
  for (const [bx, by, br] of rocks) softShadow(g, bx + br * 0.7, by + 0.005, br * 1.4, br * 0.4, 0.3);
  for (const [bx, by, br] of rocks) {
    const pts: [number, number][] = [];
    for (let k = 0; k < 7; k++) {
      const a = Math.PI + (k / 6) * Math.PI;
      const f = 0.8 + r() * 0.35;
      pts.push([bx + Math.cos(a) * br * f, by + Math.min(0, Math.sin(a) * br * 1.1 * f)]);
    }
    polyPath(g, pts);
    g.strokeStyle = 'rgba(35,28,22,.8)';
    g.lineWidth = px * 2;
    g.stroke();
    g.fillStyle = '#71675a';
    g.fill();
    g.save();
    g.clip();
    polyPath(g, [[bx - br * 1.2, by - br * 1.3], [bx + br * 0.25, by - br * 1.3], [bx - br * 0.1, by - br * 0.3], [bx - br * 1.2, by - br * 0.1]]);
    g.fillStyle = '#b9ad99';
    g.fill();
    g.restore();
  }
}

function paintDune(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 223 + 7);
  const px = 1 / upx;
  const w = 0.32 + r() * 0.08;
  const h = 0.1 + r() * 0.04;
  const cx = (r() - 0.5) * 0.08;
  softShadow(g, 0.1, 0.03, w * 1.1, 0.05, 0.18);
  const body = new Path2D();
  body.moveTo(-w, 0.02);
  body.quadraticCurveTo(cx - w * 0.4, -h * 1.1, cx + 0.04, -h);
  body.quadraticCurveTo(cx + w * 0.5, -h * 0.6, w, 0.03);
  body.quadraticCurveTo(0, 0.07, -w, 0.02);
  let gr = g.createLinearGradient(-w, -h, w * 0.3, 0.05);
  gr.addColorStop(0, '#f2e1b0');
  gr.addColorStop(1, '#d3b37a');
  g.fillStyle = gr;
  g.fill(body);
  const slip = new Path2D();
  slip.moveTo(cx + 0.04, -h);
  slip.quadraticCurveTo(cx + w * 0.5, -h * 0.6, w, 0.03);
  slip.quadraticCurveTo(cx + w * 0.35, 0.02, cx + 0.1, -h * 0.25);
  slip.closePath();
  gr = g.createLinearGradient(cx, -h, w, 0);
  gr.addColorStop(0, '#a27c4a');
  gr.addColorStop(1, '#c29d66');
  g.fillStyle = gr;
  g.fill(slip);
  g.beginPath();
  g.moveTo(-w * 0.6, -h * 0.55);
  g.quadraticCurveTo(cx - w * 0.3, -h * 1.05, cx + 0.04, -h);
  g.quadraticCurveTo(cx + w * 0.5, -h * 0.6, w * 0.9, 0.02);
  g.strokeStyle = 'rgba(255,250,228,.8)';
  g.lineWidth = Math.max(px * 1.2, 0.01);
  g.stroke();
}

function paintBarn(g: CanvasRenderingContext2D, upx: number, v: number) {
  const px = 1 / upx;
  const roofs = ['#4b4a4f', '#5a3b2e', '#3f4b57', '#6b6a66'];
  softShadow(g, 0.1, 0.01, 0.28, 0.07, 0.34);
  const sx = -0.2;
  const sw = 0.055;
  const sh = 0.24;
  let gr = g.createLinearGradient(sx - sw, 0, sx + sw, 0);
  gr.addColorStop(0, '#f2f0e8');
  gr.addColorStop(0.5, '#c9c7bd');
  gr.addColorStop(1, '#86857e');
  g.fillStyle = gr;
  g.fillRect(sx - sw, -0.02 - sh, sw * 2, sh);
  g.beginPath();
  g.ellipse(sx, -0.02 - sh, sw, sw * 0.9, 0, Math.PI, 0);
  g.fillStyle = '#9aa7b3';
  g.fill();
  g.strokeStyle = 'rgba(40,40,40,.6)';
  g.lineWidth = px;
  g.strokeRect(sx - sw, -0.02 - sh, sw * 2, sh);

  const d: [number, number] = [0.15, -0.06];
  const A: [number, number] = [-0.13, 0];
  const B: [number, number] = [0.03, 0];
  const Cc: [number, number] = [0.03, -0.12];
  const P: [number, number] = [-0.05, -0.2];
  const D: [number, number] = [-0.13, -0.12];
  const add = (p: [number, number]): [number, number] => [p[0] + d[0], p[1] + d[1]];
  const outline = (pts: [number, number][]) => {
    polyPath(g, pts);
    g.strokeStyle = 'rgba(30,14,8,.85)';
    g.lineWidth = px * 1.5;
    g.stroke();
  };
  outline([B, add(B), add(Cc), Cc]);
  g.fillStyle = '#7e2a1f';
  g.fill();
  outline([Cc, P, add(P), add(Cc)]);
  g.fillStyle = roofs[v % roofs.length];
  g.fill();
  gr = g.createLinearGradient(-0.13, -0.2, 0.03, 0);
  gr.addColorStop(0, '#d0563c');
  gr.addColorStop(1, '#a63a28');
  outline([A, B, Cc, P, D]);
  g.fillStyle = gr;
  g.fill();
  decidTree(g, 0.22, 0.03, 0.2, DECID[v % 3], px);
}

function paintPivot(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 557 + 19);
  const px = 1 / upx;
  const pr = 0.3;
  const ripe = v % 3 === 2;
  g.beginPath();
  g.arc(0.012, 0.012, pr + Math.max(px, 0.008), 0, TAU);
  g.fillStyle = 'rgba(60,48,20,.35)';
  g.fill();
  const gr = g.createRadialGradient(-pr * 0.35, -pr * 0.35, pr * 0.05, 0, 0, pr);
  gr.addColorStop(0, ripe ? '#e6cd72' : '#a8cc5e');
  gr.addColorStop(1, ripe ? '#c19c45' : '#5f8f35');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, pr, 0, TAU);
  g.fill();
  if (upx * pr > 9) {
    g.strokeStyle = ripe ? 'rgba(110,80,20,.3)' : 'rgba(30,60,10,.3)';
    g.lineWidth = Math.max(px, 0.005);
    for (const f of [0.3, 0.52, 0.74, 0.92]) {
      g.beginPath();
      g.arc(0, 0, pr * f, 0, TAU);
      g.stroke();
    }
    const a = r() * TAU;
    g.strokeStyle = 'rgba(245,245,235,.75)';
    g.lineWidth = Math.max(px * 1.2, 0.007);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * pr, Math.sin(a) * pr);
    g.stroke();
  }
}

function paintCropHex(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 4021 + 17);
  const px = 1 / upx;
  hexClip(g, 0.95);
  const crops = ['#7f9f3c', '#94b04a', '#6c8c36', '#d8b84f', '#e2c86c', '#c9a446', '#d9cc98', '#a97f50', '#b4bf62'];
  g.fillStyle = '#a18f5d';
  g.fillRect(-1, -1.1, 2, 2.2);
  const ang = ((v % 4) - 1.5) * 0.08;
  g.save();
  g.rotate(ang);
  const cols = 3;
  const rows = 3;
  const w = 2.0 / cols;
  const h = 2.0 / rows;
  for (let ix = 0; ix < cols; ix++) {
    for (let iy = 0; iy < rows; iy++) {
      const fx = -1.0 + ix * w + 0.03;
      const fy = -1.0 + iy * h + 0.03;
      const fw = w - 0.06;
      const fh = h - 0.06;
      const col = crops[Math.floor(r() * crops.length)];
      g.fillStyle = col;
      g.fillRect(fx, fy, fw, fh);
      if (upx > 24) {
        g.strokeStyle = 'rgba(40,35,10,0.22)';
        g.lineWidth = Math.max(px, 0.008);
        const step = 0.09;
        g.beginPath();
        if ((ix + iy) % 2 === 0) {
          for (let yy = fy + step; yy < fy + fh; yy += step) {
            g.moveTo(fx, yy);
            g.lineTo(fx + fw, yy);
          }
        } else {
          for (let xx = fx + step; xx < fx + fw; xx += step) {
            g.moveTo(xx, fy);
            g.lineTo(xx, fy + fh);
          }
        }
        g.stroke();
      }
    }
  }
  g.restore();
  // Soft radial feather so adjacent hexes blend smoothly
  g.globalCompositeOperation = 'destination-in';
  const fe = g.createRadialGradient(0, 0, 0.55, 0, 0, 0.98);
  fe.addColorStop(0, 'rgba(0,0,0,0.85)');
  fe.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fe;
  g.fillRect(-1, -1.1, 2, 2.2);
  g.globalCompositeOperation = 'source-over';
}

function paintMarsh(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 211 + 41);
  const px = 1 / upx;
  hexClip(g, 0.94);
  for (let k = 0; k < 6; k++) {
    blobPath(g, (r() - 0.5) * 1.3, (r() - 0.5) * 1.4, 0.16 + r() * 0.12, 0.1 + r() * 0.08, r);
    g.fillStyle = k % 2 ? 'rgba(30,64,34,.28)' : 'rgba(140,170,90,.22)';
    g.fill();
  }
  const pools: [number, number, number, number][] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) pools.push([(r() - 0.5) * 1.05, (r() - 0.5) * 1.1, 0.1 + r() * 0.12, 0.05 + r() * 0.05]);
  for (const [x, y, rx, ry] of pools) {
    const seed = Math.floor(r() * 1e6);
    blobPath(g, x, y, rx, ry, rng(seed), 10, 0.35);
    g.strokeStyle = 'rgba(124,150,96,.55)';
    g.lineWidth = Math.max(px * 2.2, 0.025);
    g.stroke();
    const gr = g.createLinearGradient(0, y - ry, 0, y + ry);
    gr.addColorStop(0, '#2c6170');
    gr.addColorStop(1, '#4a8c98');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'rgba(235,250,255,.7)';
    g.lineWidth = Math.max(px, 0.01);
    g.beginPath();
    g.moveTo(x - rx * 0.45, y - ry * 0.25);
    g.lineTo(x - rx * 0.1, y - ry * 0.25);
    g.stroke();
  }
  for (const [x, y, rx, ry] of pools) {
    const cx = x + rx * 0.7;
    const cy = y + ry * 0.75;
    for (let k = 0; k < 5; k++) {
      const bx = cx + (r() - 0.5) * 0.08;
      const hh = 0.09 + r() * 0.08;
      g.strokeStyle = k % 2 ? '#5c7a36' : '#3c5626';
      g.lineWidth = Math.max(px, 0.009);
      g.beginPath();
      g.moveTo(bx, cy);
      g.lineTo(bx + (r() - 0.5) * 0.04, cy - hh);
      g.stroke();
    }
  }
}

function paintIce(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 541 + 3);
  const px = 1 / upx;
  hexClip(g, 0.94);
  for (let k = 0; k < 7; k++) {
    const x = (r() - 0.5) * 1.4;
    const y = (r() - 0.5) * 1.6;
    const w = 0.25 + r() * 0.25;
    g.beginPath();
    g.moveTo(x - w, y);
    g.quadraticCurveTo(x, y - 0.08, x + w, y);
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.lineWidth = Math.max(px * 1.4, 0.014);
    g.stroke();
    g.beginPath();
    g.moveTo(x - w * 0.9, y + 0.02);
    g.quadraticCurveTo(x, y - 0.05, x + w * 0.9, y + 0.02);
    g.strokeStyle = 'rgba(110,145,190,.35)';
    g.lineWidth = Math.max(px * 1.4, 0.016);
    g.stroke();
  }
}

function paintSuburb(g: CanvasRenderingContext2D, upx: number, v: number) {
  const r = rng(v * 7349 + 11);
  const px = 1 / upx;
  hexClip(g, 0.9);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 0.9);
  gr.addColorStop(0, 'rgba(130,156,92,.65)');
  gr.addColorStop(0.75, 'rgba(118,144,82,.3)');
  gr.addColorStop(1, 'rgba(118,144,82,0)');
  g.fillStyle = gr;
  g.fillRect(-1, -1, 2, 2);

  // Winding collector road + branch
  const ang = (r() - 0.5) * 1.0;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const pts: [number, number][] = [];
  for (let k = -8; k <= 8; k++) {
    const t = k * 0.09;
    const nrm = Math.sin(t * 2.5) * 0.06;
    pts.push([t * ca - nrm * sa, t * sa + nrm * ca]);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.strokeStyle = 'rgba(182,176,160,.8)';
  g.lineWidth = Math.max(px * 2.2, 0.055);
  g.stroke();
  g.strokeStyle = '#5a5856';
  g.lineWidth = Math.max(px * 1.4, 0.038);
  g.stroke();

  // Miniature suburban houses along road
  const roofs = ['#a4473a', '#6b6f7a', '#8a5a3c', '#4f5d6e', '#b36b45'];
  for (let k = 2; k < pts.length - 2; k += 2) {
    const [rx, ry] = pts[k];
    for (const sg of [-1, 1]) {
      const hx = rx - sa * sg * 0.11 + (r() - 0.5) * 0.03;
      const hy = ry + ca * sg * 0.11 + (r() - 0.5) * 0.03;
      if (Math.hypot(hx, hy) > 0.72) continue;
      g.fillStyle = 'rgba(20,16,10,.3)';
      g.fillRect(hx - 0.03, hy - 0.015, 0.08, 0.055);
      g.fillStyle = '#efe6d2';
      g.fillRect(hx - 0.04, hy - 0.04, 0.075, 0.05);
      g.fillStyle = roofs[Math.floor(r() * roofs.length)];
      g.beginPath();
      g.moveTo(hx - 0.045, hy - 0.035);
      g.lineTo(hx - 0.002, hy - 0.07);
      g.lineTo(hx + 0.042, hy - 0.035);
      g.closePath();
      g.fill();
    }
  }
}

// --- 4. Terrain Art Orchestrator ----------------------------------------------------------------------------------

const HEX_BOX: SpriteBox = { x0: -0.96, y0: -1.04, x1: 0.96, y1: 1.04 };
const TERRAIN_BOXES: Record<string, SpriteBox> = {
  clump:  { x0: -0.54, y0: -0.76, x1: 0.7, y1: 0.18 },
  tree:   { x0: -0.2, y0: -0.6, x1: 0.32, y1: 0.1 },
  mtn:    { x0: -1.0, y0: -1.46, x1: 1.12, y1: 0.26 },
  mesa:   { x0: -1.02, y0: -0.8, x1: 1.08, y1: 0.24 },
  hill:   { x0: -0.76, y0: -0.5, x1: 0.94, y1: 0.2 },
  tuft:   { x0: -0.17, y0: -0.26, x1: 0.2, y1: 0.06 },
  sage:   { x0: -0.17, y0: -0.17, x1: 0.26, y1: 0.07 },
  cactus: { x0: -0.1, y0: -0.32, x1: 0.2, y1: 0.06 },
  rocks:  { x0: -0.22, y0: -0.2, x1: 0.32, y1: 0.07 },
  dune:   { x0: -0.46, y0: -0.2, x1: 0.6, y1: 0.12 },
  barn:   { x0: -0.3, y0: -0.36, x1: 0.42, y1: 0.09 },
  pivot:  { x0: -0.38, y0: -0.38, x1: 0.42, y1: 0.4 },
  crop:   HEX_BOX,
  marsh:  HEX_BOX,
  ice:    HEX_BOX,
  suburb: HEX_BOX,
};

function getTerrainSprite(name: string, arg: string, v: number, upx: number): CachedSprite {
  const box = TERRAIN_BOXES[name] ?? HEX_BOX;
  return getSprite(`t:${name}:${arg}:${v}`, upx, box, (g, u) => {
    switch (name) {
      case 'clump':  paintClump(g, u, v, arg); break;
      case 'tree':   paintTree(g, u, v, arg); break;
      case 'mtn':    paintMountain(g, u, v, arg); break;
      case 'mesa':   paintMesa(g, u, v, arg); break;
      case 'hill':   paintHill(g, u, v, arg); break;
      case 'tuft':   paintTuft(g, u, v, arg); break;
      case 'sage':   paintSage(g, u, v); break;
      case 'cactus': paintCactus(g, u, v); break;
      case 'rocks':  paintRocks(g, u, v); break;
      case 'dune':   paintDune(g, u, v); break;
      case 'barn':   paintBarn(g, u, v); break;
      case 'pivot':  paintPivot(g, u, v); break;
      case 'crop':   paintCropHex(g, u, v); break;
      case 'marsh':  paintMarsh(g, u, v); break;
      case 'ice':    paintIce(g, u, v); break;
      case 'suburb': paintSuburb(g, u, v); break;
    }
  });
}

const CLUMPS_LAYOUT: [number, number][][] = [
  [],
  [[0, 0.22]],
  [[-0.3, -0.02], [0.3, 0.32]],
  [[-0.32, -0.18], [0.34, -0.08], [0, 0.44]],
  [[-0.36, -0.28], [0.34, -0.26], [-0.3, 0.32], [0.36, 0.4]],
];

// Bridge offsets in screen R-units (y-down) toward E (dir 0), SE (dir 5), SW (dir 4)
const BRIDGE_DIRS: [number, number, number][] = [
  [0, Math.sqrt(3) / 2, 0],
  [5, Math.sqrt(3) / 4, 0.75],
  [4, -Math.sqrt(3) / 4, 0.75],
];

interface StampDraw {
  spr: CachedSprite;
  sx: number;
  sy: number;
  unitPx: number;
  z: number;
}

export function cityIsDot(pop: number, rPx: number): boolean {
  return rPx < 9 || (rPx < 18 && pop < 250_000) || (rPx < 26 && pop < 100_000);
}

export function cityTileVisible(pop: number, rPx: number): boolean {
  return !(rPx < 9 && pop < (rPx < 6 ? 1_000_000 : 250_000));
}

export function drawPainterlyTerrain(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  world: WorldHexData,
  topo: WorldTopology,
  dpr: number,
) {
  const { width: w, height: h, scale } = camera;
  // Average CONUS hex radius in css px (~25 km * scale)
  const baseRpx = 25 * scale;
  if (baseRpx < 5.5) return;

  const lod: 'far' | 'mid' | 'near' | 'close' =
    baseRpx < 10 ? 'far' : baseRpx < 18 ? 'mid' : baseRpx < 36 ? 'near' : 'close';
  const mid = lod !== 'far';
  const near = lod === 'near' || lod === 'close';
  const close = lod === 'close';

  const ground: StampDraw[] = [];
  const upright: StampDraw[] = [];

  const coverArr = world.cover;
  const emaxArr = world.emax;
  const lonArr = world.lon;
  const latArr = world.lat;
  const forestPctArr = world.pct?.f;

  for (let i = 0; i < world.n; i++) {
    const rPx = world.r[i] * scale;
    if (rPx < 4.5) continue;
    const [sx, sy] = camera.worldToScreen(world.x[i], world.y[i]);
    if (sx < -rPx * 2.2 || sx > w + rPx * 2.2 || sy < -rPx * 2.2 || sy > h + rPx * 2.2) continue;

    // Skip cells covered by a full 3D city tile
    const city = topo.cityByHex.get(i);
    const spill = topo.spillByHex.get(i);
    const tiled =
      (city && !cityIsDot(city.pop, rPx)) ||
      (spill && !cityIsDot(spill.pop, rPx) && !cityIsDot(spill.parent.pop, rPx));
    if (tiled) continue;

    const upx = bucketPx(rPx * dpr, 8, 128);
    const rel = world.rcls[i];
    const elev = world.elev[i];
    const emax = emaxArr ? emaxArr[i] : elev;
    const cv = coverArr ? coverArr[i] : world.biome[i] === 2 ? COVER.EVERGREEN : world.biome[i] === 1 ? COVER.CROP : COVER.GRASS;
    const lon = lonArr ? lonArr[i] : -96;
    const lat = latArr ? latArr[i] : 38;
    const isForest = cv === COVER.DECIDUOUS || cv === COVER.EVERGREEN || cv === COVER.MIXED;
    const forestPct = forestPctArr ? forestPctArr[i] : isForest ? 65 : 0;
    const desert = cv === COVER.SCRUB || cv === COVER.BARREN;
    const snowy = cv === COVER.ICE || rel === 3 || (desert ? elev > 3000 || emax > 3200 : elev > 2400 || emax > 3000);
    const alpine = rel === 3 || (rel === 2 && emax > 3450);

    const onPlateau = elev >= 1400 && elev <= 2400 && lat > 35.8 && lat < 38.6 && lon > -112.6 && lon < -107.8;
    const inGreatBasin = lat > 36.2 && lat < 43.6 && lon > -120.3 && lon < -111.8;
    const pivotCountry = lon < -98;

    const hh = (salt: number) => hash01(i, salt);
    const vary = (salt: number, n: number) => Math.floor(hh(salt) * n) % n;

    const putG = (name: string, arg: string, v: number, px = 0, py = 0, f = 1) => {
      ground.push({
        spr: getTerrainSprite(name, arg, v, upx),
        sx: sx + px * rPx,
        sy: sy + py * rPx,
        unitPx: rPx * f,
        z: sy + py * rPx,
      });
    };
    const putU = (name: string, arg: string, v: number, px: number, py: number, f = 1, zOff = py) => {
      upright.push({
        spr: getTerrainSprite(name, arg, v, upx),
        sx: sx + px * rPx,
        sy: sy + py * rPx,
        unitPx: rPx * f,
        z: sy + zOff * rPx,
      });
    };

    // --- Basin-and-range valleys in Great Basin ---
    if (rel >= 2 && desert && !snowy && !city && inGreatBasin && hh(61) < 0.32) {
      if (mid) {
        const ns = lod === 'mid' ? 2 : near ? 4 : 5;
        for (let k = 0; k < ns; k++) {
          putU(hh(66 + k) < 0.8 ? 'sage' : 'rocks', '', vary(70 + k, 4), (hh(80 + k) - 0.5) * 1.0, (hh(90 + k) - 0.5) * 0.9, 0.85);
        }
      }
      continue;
    }

    // --- Mountains, Alpine Peaks & Colorado Plateau Mesas ---
    if (rel >= 2) {
      const hf = Math.min(1.14, Math.max(0.82, 0.8 + (elev - 1200) / 6000));
      if (desert && !snowy && onPlateau && hh(3) < 0.38) {
        const jx = (hh(1) - 0.5) * 0.4;
        const jy = (hh(2) - 0.5) * 0.16;
        putU('mesa', 'mesa', vary(4, 4), jx, 0.3 + jy, 0.92 + hh(5) * 0.22);
        if (hh(6) < 0.5) {
          putU('mesa', 'butte', vary(7, 4), jx + (hh(8) < 0.5 ? -0.6 : 0.62), 0.52 + (hh(9) - 0.5) * 0.1, 0.64 + hh(10) * 0.18);
        }
      } else {
        const style = alpine
          ? snowy ? 'peak' : 'arid'
          : desert
            ? snowy ? 'rocksnow' : onPlateau ? 'desert' : 'arid'
            : isForest || cv === COVER.GRASS || cv === COVER.PASTURE || cv === COVER.CROP || cv === COVER.WETLAND
              ? snowy ? 'greensnow' : 'green'
              : snowy ? 'rocksnow' : 'rock';
        const basin = desert && !snowy && inGreatBasin;
        const jx = (hh(1) - 0.5) * 0.45;
        const jy = (hh(2) - 0.5) * 0.2;
        const f0 = basin ? 0.65 + hh(5) * 0.5 : 0.82 + hh(5) * 0.28;
        putU('mtn', style, vary(4, 6), jx * (basin ? 0.5 : 1), (basin ? 0.04 : 0.26) + jy, f0 * hf);

        if (mid) {
          const extra = hh(8) < 0.35 ? 0 : hh(8) < 0.8 ? 1 : 2;
          const side = hh(9) < 0.5 ? -1 : 1;
          for (let k = 0; k < extra; k++) {
            const sd = k ? -side : side;
            const ex = basin ? jx * 0.5 + (hh(10 + k) - 0.5) * 0.28 : jx * 0.4 + sd * (0.45 + hh(10 + k) * 0.18);
            const ey = basin ? (k ? -0.4 : 0.5) : k ? 0.48 : 0.04;
            putU('mtn', style, vary(16 + k, 6), ex, ey, (0.5 + hh(14 + k) * 0.22) * hf);
          }
          // Bridge peaks across neighboring mountain hexes so ranges feel continuous!
          for (const [dir, bx, by] of BRIDGE_DIRS) {
            const nb = topo.neighbors[i * 6 + dir];
            if (nb >= 0 && world.rcls[nb] >= 2 && hh(20 + dir) < 0.72) {
              putU('mtn', style, vary(24 + dir, 6), bx + (hh(27 + dir) - 0.5) * 0.18, by + 0.18, 0.56 * hf);
            }
          }
        }
      }
      if (near && !city) {
        if (isForest) {
          const fk = snowy ? 'conifsnow' : cv === COVER.DECIDUOUS ? 'mixed' : 'conif';
          putU('clump', fk, vary(45, 4), (hh(40) - 0.5) * 1.1, 0.62, 0.52);
        } else if (desert) {
          putU('sage', '', vary(45, 4), (hh(40) - 0.5) * 1.1, 0.62, 0.88);
        }
      }
      continue;
    }

    // --- Rolling Hills & Wooded Hills (rcls === 1) ---
    if (rel === 1) {
      const wooded = isForest ? forestPct >= 20 : forestPct >= 40;
      const baseC = (COVER_RGB[cv] ?? [142, 148, 96]) as Rgb255;
      if (wooded) {
        const tone = `${cv}.${mixRgb(baseC, [134, 124, 78], 0.5).map((q) => q | 0).join('.')}`;
        const nM = lod === 'far' ? 1 : hh(8) < 0.45 ? 1 : 2;
        const ang = -0.45 + (hh(7) - 0.5) * 0.35; // SW-NE Appalachian valley-and-ridge trend
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const conif = cv === COVER.EVERGREEN || (!isForest && (cv === COVER.SCRUB || elev > 1500));
        const mixed = cv === COVER.MIXED;
        const mounds: [number, number, number][] = [];
        for (let k = 0; k < nM; k++) {
          const t = nM === 1 ? 0 : (k === 0 ? -0.35 : 0.35);
          const px = ux * t + (hh(17 + k) - 0.5) * 0.1;
          const py = 0.18 + uy * t * 0.65;
          const f = nM === 1 ? 1.05 : 0.85;
          putU('hill', tone, vary(24 + k, 5), px, py, f, py);
          mounds.push([px, py, f]);
        }
        const nT = lod === 'far' ? 3 : lod === 'mid' ? 6 : near ? 9 : 12;
        for (let k = 0; k < nT; k++) {
          const [mx, my, f] = mounds[k % mounds.length];
          const u = (hh(100 + k) - 0.5) * 1.65;
          const mh = 0.25 * f * Math.max(0, 1 - u * u * 0.92);
          const tx = mx + u * 0.44 * f;
          const ty = my - mh * (0.25 + hh(120 + k) * 0.7);
          const tk = conif || (mixed && hh(140 + k) < 0.5) ? 'conif' : 'decid';
          putU('tree', tk, vary(180 + k, 4), tx, ty, (0.48 + hh(160 + k) * 0.14) * f, my + 0.01);
        }
      } else if (desert && onPlateau && hh(3) < 0.34) {
        putU('mesa', 'butte', vary(4, 4), (hh(1) - 0.5) * 0.35, 0.28, 0.72 + hh(5) * 0.22);
      } else {
        const tone = `${cv}.${baseC.map((q) => q | 0).join('.')}`;
        putU('hill', tone, vary(4, 5), (hh(1) - 0.5) * 0.4, 0.22 + (hh(2) - 0.5) * 0.18, 0.88 + hh(5) * 0.24);
        if (mid && hh(8) > 0.4) {
          const sd = hh(9) < 0.5 ? -1 : 1;
          putU('hill', tone, vary(16, 5), sd * 0.46, -0.04, 0.62);
        }
      }
      continue;
    }

    if (city) continue;

    // --- Flat Forests ---
    if (isForest && forestPct >= 20) {
      const d = forestPct / 100;
      const nCl =
        lod === 'far' ? (d >= 0.48 ? 1 : 0) : lod === 'mid' ? (d >= 0.6 ? 3 : 2) : near ? (d >= 0.6 ? 4 : 3) : 4;
      const fkind =
        cv === COVER.DECIDUOUS ? 'decid' : cv === COVER.EVERGREEN ? (elev > 2200 ? 'conifsnow' : 'conif') : 'mixed';
      const layout = CLUMPS_LAYOUT[nCl] ?? [];
      const scl = lod === 'far' ? 1.24 : 1.0;
      layout.forEach(([px, py], k) => {
        putU('clump', fkind, vary(20 + k, 5), px + (hh(30 + k) - 0.5) * 0.1, py + (hh(40 + k) - 0.5) * 0.06, scl * (0.88 + hh(50 + k) * 0.2));
      });
      continue;
    }

    if (!mid) continue;

    // --- Cropland, High Plains Pivots, Barns, Marshes, Suburbs, Desert, Prairie ---
    if (cv === COVER.CROP) {
      putG('crop', '', vary(100, 4));
      if (pivotCountry && hh(105) < (elev > 700 ? 0.52 : 0.32)) {
        const two = hh(106) < 0.35;
        const pts: [number, number][] = two ? [[-0.28, -0.14], [0.28, 0.22]] : [[0, 0.04]];
        pts.forEach(([px, py], k) => putG('pivot', '', vary(107 + k, 4), px + (hh(109 + k) - 0.5) * 0.22, py + (hh(111 + k) - 0.5) * 0.18, 0.9));
      }
      if (near && hh(101) < 0.32) {
        putU('barn', '', vary(102, 4), (hh(103) - 0.5) * 0.65, 0.1 + (hh(104) - 0.5) * 0.45, 0.98);
      }
    } else if (cv === COVER.PASTURE) {
      if (near && hh(111) < 0.28) {
        putU('barn', '', vary(112, 4), (hh(113) - 0.5) * 0.65, 0.1 + (hh(114) - 0.5) * 0.45, 0.9);
      }
    } else if (cv === COVER.WETLAND) {
      putG('marsh', '', vary(120, 4));
    } else if (cv === COVER.URBAN) {
      putG('suburb', '', vary(130, 4));
    } else if (cv === COVER.ICE) {
      putG('ice', '', vary(140, 4));
    } else if (cv === COVER.SCRUB || cv === COVER.BARREN) {
      const low = elev < 800;
      if (low && cv === COVER.SCRUB && hh(190) < 0.35) {
        putU('dune', '', vary(191, 4), (hh(192) - 0.5) * 0.3, 0.28 + (hh(193) - 0.5) * 0.25, 0.98);
      }
      const nSc = lod === 'mid' ? 2 : near ? 4 : 6;
      for (let k = 0; k < nSc; k++) {
        const px = (hh(200 + k) - 0.5) * 1.05;
        const py = (hh(210 + k) - 0.5) * 0.95;
        const t = hh(220 + k);
        const kind = cv === COVER.BARREN ? 'rocks' : low && t < 0.3 ? 'cactus' : t < 0.8 ? 'sage' : 'rocks';
        putU(kind, '', vary(240 + k, 4), px, py, 0.88 + hh(260 + k) * 0.25);
      }
    } else if (cv === COVER.GRASS && near) {
      const nTu = close ? 4 : 2;
      for (let k = 0; k < nTu; k++) {
        const px = (hh(280 + k) - 0.5) * 1.0;
        const py = (hh(290 + k) - 0.5) * 0.9;
        putU('tuft', close && k === 0 ? 'flowers' : '', vary(300 + k, 4), px, py, 0.92);
      }
    }

    // Scattered woodlots on non-forest cells with 20%+ trees
    if (forestPct >= 20 && near) {
      const tk = cv === COVER.SCRUB || elev > 1500 ? 'conif' : 'decid';
      putU('tree', tk, vary(420, 4), (hh(400) - 0.5) * 0.95, (hh(410) - 0.5) * 0.8, 0.85);
    }
  }

  upright.sort((a, b) => a.z - b.z);
  ctx.save();
  for (let i = 0; i < ground.length; i++) {
    const st = ground[i];
    blitSprite(ctx, st.spr, st.sx, st.sy, st.unitPx);
  }
  for (let i = 0; i < upright.length; i++) {
    const st = upright[i];
    blitSprite(ctx, st.spr, st.sx, st.sy, st.unitPx);
  }
  ctx.restore();
}

// --- 5. Pseudo-Isometric 3D City Tiles & Washington D.C. Domed Capitol --------------------------------------------

const CITY_PAL = {
  asphalt: [74, 72, 70] as Rgb255,
  kerb: [182, 176, 160] as Rgb255,
  walk: [196, 190, 174] as Rgb255,
  concrete: [168, 162, 148] as Rgb255,
  lawn: [118, 150, 80] as Rgb255,
  park: [96, 146, 70] as Rgb255,
  plaza: [204, 194, 168] as Rgb255,
  plazaInner: [224, 216, 194] as Rgb255,
  walls: [[236, 226, 204], [242, 238, 228], [218, 200, 164], [226, 214, 190]] as Rgb255[],
  roofs: [[170, 78, 56], [124, 82, 60], [92, 98, 112], [184, 110, 66]] as Rgb255[],
  stone: [[208, 196, 172], [188, 178, 160], [168, 98, 74], [196, 188, 176]] as Rgb255[],
  glass: [[118, 160, 190], [96, 128, 158], [150, 178, 196], [196, 170, 112], [128, 170, 176]] as Rgb255[],
  marble: [240, 236, 224] as Rgb255,
  dome: [246, 244, 236] as Rgb255,
};

const ISO_AX = 0.866;
const ISO_AY = 0.5;
const isoPt = (u: number, v: number): [number, number] => [(u - v) * ISO_AX, (u + v) * ISO_AY];
const hexRhoUnit = (x: number, y: number) => Math.max(Math.abs(x), 0.5 * Math.abs(x) + 0.866 * Math.abs(y)) / 0.866;

function isoFoot(x: number, y: number, a: number, b: number): [number, number][] {
  const [ax, ay] = isoPt(a, 0);
  const [bx, by] = isoPt(0, b);
  return [
    [x - ax - bx, y - ay - by],
    [x + ax - bx, y + ay - by],
    [x + ax + bx, y + ay + by],
    [x - ax + bx, y - ay + by],
  ];
}

function drawIsoBox(
  g: CanvasRenderingContext2D,
  F: [number, number][],
  z0: number,
  h: number,
  base: Rgb255,
  px: number,
  accentCrown?: Rgb255,
  spire = false,
) {
  const up = (p: [number, number], dz: number): [number, number] => [p[0], p[1] - dz];
  const [N, E, S, W] = F.map((p) => up(p, z0));
  const [Nt, Et, St, Wt] = [N, E, S, W].map((p) => up(p, h));

  // SE cast shadow
  g.fillStyle = 'rgba(22,18,12,.26)';
  polyPath(g, [S, E, [E[0] + h * 0.55, E[1] + h * 0.24], [S[0] + h * 0.55, S[1] + h * 0.24]]);
  g.fill();

  // SW half-lit face
  polyPath(g, [W, S, St, Wt]);
  g.fillStyle = cssRgb(base);
  g.fill();

  // SE shaded face
  polyPath(g, [S, E, Et, St]);
  g.fillStyle = cssRgb(shadeRgb(base, -0.35));
  g.fill();

  // Lit roof
  polyPath(g, [Nt, Et, St, Wt]);
  g.fillStyle = cssRgb(shadeRgb(base, 0.2));
  g.fill();

  // State-colored crown band on signature towers
  if (accentCrown) {
    const bh = Math.max(px * 1.2, h * 0.06);
    polyPath(g, [Wt, St, up(St, -bh), up(Wt, -bh)]);
    g.fillStyle = cssRgb(accentCrown);
    g.fill();
    polyPath(g, [St, Et, up(Et, -bh), up(St, -bh)]);
    g.fillStyle = cssRgb(shadeRgb(accentCrown, -0.3));
    g.fill();
  }

  g.strokeStyle = 'rgba(28,22,16,.42)';
  g.lineWidth = px * 0.65;
  polyPath(g, [W, Wt, Nt, Et, E, S]);
  g.stroke();

  if (spire) {
    const cx = (Nt[0] + St[0]) * 0.5;
    const cy = (Nt[1] + St[1]) * 0.5;
    const sh = h * 0.24;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx, cy - sh);
    g.strokeStyle = 'rgba(240,240,235,.95)';
    g.lineWidth = Math.max(px, 0.015);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy - sh, Math.max(px, 0.018), 0, TAU);
    g.fillStyle = '#ffe08a';
    g.fill();
  }
}

function paintCapitolDome(g: CanvasRenderingContext2D, px: number) {
  const q = 0.14;
  // Stone plaza + National Mall lawn
  polyPath(g, isoFoot(0, 0, q * 2.8, q * 2.8));
  g.fillStyle = cssRgb(CITY_PAL.plaza);
  g.fill();
  polyPath(g, isoFoot(0, 0, q * 2.2, q * 2.2));
  g.fillStyle = cssRgb(CITY_PAL.plazaInner);
  g.fill();

  const [mx, my] = isoPt(q * 4.5, 0);
  polyPath(g, isoFoot(mx, my, q * 2.2, q * 0.95));
  g.fillStyle = cssRgb(CITY_PAL.lawn);
  g.fill();

  // Reflecting pool + Washington Monument obelisk
  const [rx, ry] = isoPt(q * 5.2, 0);
  polyPath(g, isoFoot(rx, ry, q * 0.8, q * 0.22));
  g.fillStyle = 'rgba(110,170,210,.95)';
  g.fill();

  const [ox, oy] = isoPt(q * 6.2, 0);
  drawIsoBox(g, isoFoot(ox, oy, q * 0.14, q * 0.14), 0, q * 2.1, CITY_PAL.marble, px);

  // Capitol marble wings + center block
  const wingH = q * 0.6;
  drawIsoBox(g, isoFoot(0, 0, q * 0.95, q * 2.4), 0, wingH, CITY_PAL.marble, px);
  drawIsoBox(g, isoFoot(0, 0, q * 1.05, q * 0.95), 0, wingH * 1.25, CITY_PAL.marble, px);

  // Cylinder drum + ribbed white dome + golden lantern
  const z = wingH * 1.25;
  const drx = q * 0.78;
  const dry = drx * 0.5;
  const dh = q * 0.52;
  const cy = -z;
  const drum = g.createLinearGradient(-drx, 0, drx, 0);
  drum.addColorStop(0, '#f4f2ea');
  drum.addColorStop(0.5, '#dcd9ce');
  drum.addColorStop(1, '#989488');
  g.beginPath();
  g.ellipse(0, cy, drx, dry, 0, 0, Math.PI);
  g.lineTo(-drx, cy - dh);
  g.ellipse(0, cy - dh, drx, dry, 0, Math.PI, TAU);
  g.closePath();
  g.fillStyle = drum;
  g.fill();

  const dy = cy - dh;
  const dhh = q * 1.05;
  const domeG = g.createRadialGradient(-drx * 0.32, dy - dhh * 0.6, drx * 0.05, 0, dy - dhh * 0.3, drx * 1.2);
  domeG.addColorStop(0, '#ffffff');
  domeG.addColorStop(0.5, cssRgb(CITY_PAL.dome));
  domeG.addColorStop(1, cssRgb(shadeRgb(CITY_PAL.dome, -0.4)));
  g.beginPath();
  g.ellipse(0, dy, drx * 0.9, dry * 0.9, 0, 0, Math.PI);
  g.ellipse(0, dy, drx * 0.9, dhh, 0, Math.PI, 0);
  g.closePath();
  g.fillStyle = domeG;
  g.fill();
  g.strokeStyle = 'rgba(60,50,40,.45)';
  g.lineWidth = px * 0.7;
  g.stroke();

  g.beginPath();
  g.arc(0, dy - dhh - q * 0.25, Math.max(px * 1.1, q * 0.14), 0, TAU);
  g.fillStyle = '#e6c46a';
  g.fill();
}

function paintCitySprite(
  g: CanvasRenderingContext2D,
  upx: number,
  tierIdx: number,
  seed: number,
  accent: Rgb255,
  isCapital: boolean,
) {
  const px = 1 / upx;
  const r = rng(seed * 7919 + tierIdx * 131 + 17);

  if (tierIdx === 0) {
    // Village: warm ground, country crossroads, 6 gable houses, white church or water tower
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 0.58);
    gr.addColorStop(0, 'rgba(236,226,186,.26)');
    gr.addColorStop(1, 'rgba(236,226,186,0)');
    g.fillStyle = gr;
    g.fillRect(-0.7, -0.7, 1.4, 1.4);

    const [a0, a1] = [isoPt(-0.62, 0), isoPt(0.62, 0)];
    const [b0, b1] = [isoPt(0, -0.35), isoPt(0, 0.35)];
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(92,84,70,.55)';
    g.lineWidth = Math.max(px * 2.2, 0.055);
    g.beginPath();
    g.moveTo(a0[0], a0[1]);
    g.lineTo(a1[0], a1[1]);
    g.moveTo(b0[0], b0[1]);
    g.lineTo(b1[0], b1[1]);
    g.stroke();
    g.strokeStyle = '#c4baa0';
    g.lineWidth = Math.max(px * 1.2, 0.032);
    g.stroke();

    const hs = 0.055;
    const spots: [number, number][] = [
      [-0.3, -0.14], [0.22, -0.14], [-0.28, 0.14], [0.24, 0.14], [-0.14, -0.28], [0.14, 0.28],
    ];
    for (const [u, v] of spots) {
      const [hx, hy] = isoPt(u, v);
      const wall = CITY_PAL.walls[Math.floor(r() * CITY_PAL.walls.length)];
      const roof = r() < 0.25 ? mixRgb(CITY_PAL.roofs[0], accent, 0.55) : CITY_PAL.roofs[Math.floor(r() * CITY_PAL.roofs.length)];
      drawIsoBox(g, isoFoot(hx, hy, hs, hs * 0.8), 0, 0.05, wall, px);
      const [Nt, Et, St, Wt] = isoFoot(hx, hy - 0.05, hs * 1.05, hs * 0.85);
      polyPath(g, [Wt, St, [(Nt[0] + St[0]) * 0.5, (Nt[1] + St[1]) * 0.5 - 0.045]]);
      g.fillStyle = cssRgb(roof);
      g.fill();
      polyPath(g, [St, Et, [(Nt[0] + St[0]) * 0.5, (Nt[1] + St[1]) * 0.5 - 0.045]]);
      g.fillStyle = cssRgb(shadeRgb(roof, -0.28));
      g.fill();
    }
    // Landmark steeple
    const [cx, cy] = isoPt(0.06, -0.18);
    drawIsoBox(g, isoFoot(cx, cy, 0.045, 0.045), 0, 0.15, [244, 240, 230], px, accent, true);
    return;
  }

  // Town (1), City (2), Metropolis (3), Megalopolis (4)
  const extent = [0, 0.66, 0.8, 0.9, 0.96][tierIdx];
  const lot = [0, 0.22, 0.19, 0.17, 0.155][tierIdx];
  const coreCut = [0, 0.84, 0.62, 0.46, 0.34][tierIdx];
  const midCut = [0, 0.48, 0.28, 0.16, 0.08][tierIdx];
  const maxH = isCapital ? 0.24 : [0, 0.22, 0.44, 0.58, 0.72][tierIdx];

  // Feathered suburban lawn base
  g.save();
  hexClip(g, 0.97);
  const lawn = mixRgb(CITY_PAL.lawn, CITY_PAL.concrete, tierIdx * 0.07);
  const lg = g.createRadialGradient(-0.08, -0.1, 0, 0, 0, 0.97);
  lg.addColorStop(0, cssRgb(shadeRgb(lawn, 0.04)));
  lg.addColorStop(0.55, cssRgb(lawn, 0.95));
  lg.addColorStop(0.88, cssRgb(shadeRgb(lawn, -0.08), 0));
  g.fillStyle = lg;
  g.fillRect(-1, -1, 2, 2);
  g.restore();

  const half = lot * 0.5;
  const bh = half * 0.8;
  const n = Math.ceil(1.1 / lot);
  const lots: { x: number; y: number; u: number; v: number; c: number; kind: string }[] = [];

  for (let u = -n; u <= n; u++) {
    for (let v = -n; v <= n; v++) {
      const [x, y] = isoPt(u * lot, v * lot);
      const rc = hexRhoUnit(x, y);
      if (rc > extent * 0.96) continue;
      if (rc > extent * 0.72 && r() < 0.28) continue;
      const c = Math.max(0, Math.min(1, 1 - rc / extent + (r() - 0.5) * 0.16));
      const reservedCap = isCapital && Math.abs(u * lot) < 0.42 && Math.abs(v * lot) < 0.32;
      const kind = reservedCap
        ? 'cap'
        : c > coreCut && r() < 0.9
          ? 'core'
          : c > midCut
            ? 'mid'
            : r() < 0.12
              ? 'park'
              : 'res';
      lots.push({ x, y, u, v, c, kind });
    }
  }

  // Asphalt street pad + sidewalks
  const pad = new Path2D();
  const walks = new Path2D();
  const parks = new Path2D();
  for (const l of lots) {
    const F = isoFoot(l.x, l.y, half, half);
    F.forEach(([px2, py2], k) => (k ? pad.lineTo(px2, py2) : pad.moveTo(px2, py2)));
    pad.closePath();
    if (l.kind === 'cap') continue;
    const Fb = isoFoot(l.x, l.y, bh, bh);
    const target = l.kind === 'park' ? parks : walks;
    Fb.forEach(([px2, py2], k) => (k ? target.lineTo(px2, py2) : target.moveTo(px2, py2)));
    target.closePath();
  }
  g.fillStyle = cssRgb(CITY_PAL.asphalt);
  g.fill(pad);
  g.fillStyle = cssRgb(CITY_PAL.walk);
  g.fill(walks);
  g.fillStyle = cssRgb(CITY_PAL.park);
  g.fill(parks);

  // Depth-sorted buildings back-to-front
  lots.sort((a, b) => a.y - b.y);
  let tallestIdx = -1;
  let tallestH = -1;
  const heights = lots.map((l, idx) => {
    if (l.kind === 'core') {
      const h = Math.max(0.11, maxH * (0.32 + 0.68 * Math.pow(l.c, 1.35) * (0.58 + 0.42 * r())));
      if (h > tallestH) {
        tallestH = h;
        tallestIdx = idx;
      }
      return h;
    }
    if (l.kind === 'mid') return 0.06 + r() * 0.08 + tierIdx * 0.015;
    return 0.038 + r() * 0.02;
  });

  let capDrawn = false;
  for (let idx = 0; idx < lots.length; idx++) {
    const l = lots[idx];
    if (isCapital && !capDrawn && l.y >= 0) {
      paintCapitolDome(g, px);
      capDrawn = true;
    }
    if (l.kind === 'cap') continue;
    const h = heights[idx];
    if (l.kind === 'core') {
      const glass = r() < 0.65;
      const base = glass
        ? CITY_PAL.glass[Math.floor(r() * CITY_PAL.glass.length)]
        : CITY_PAL.stone[Math.floor(r() * CITY_PAL.stone.length)];
      const isTall = idx === tallestIdx && !isCapital;
      const a = bh * (0.66 + r() * 0.16);
      const b = bh * (0.66 + r() * 0.16);
      if (h > 0.3 && r() < 0.5) {
        const h1 = h * 0.62;
        drawIsoBox(g, isoFoot(l.x, l.y, a, b), 0, h1, base, px);
        drawIsoBox(g, isoFoot(l.x, l.y, a * 0.68, b * 0.68), h1, h - h1, shadeRgb(base, 0.05), px, isTall || r() < 0.45 ? accent : undefined, isTall);
      } else {
        drawIsoBox(g, isoFoot(l.x, l.y, a, b), 0, h, base, px, isTall || r() < 0.4 ? accent : undefined, isTall);
      }
    } else if (l.kind === 'mid') {
      const base = CITY_PAL.stone[Math.floor(r() * CITY_PAL.stone.length)];
      drawIsoBox(g, isoFoot(l.x, l.y, bh * 0.85, bh * 0.85), 0, h, base, px);
    } else if (l.kind === 'park') {
      decidTree(g, l.x - bh * 0.2, l.y, 0.11, DECID[0], px, false);
      decidTree(g, l.x + bh * 0.25, l.y + bh * 0.15, 0.09, DECID[1], px, false);
    } else {
      const wall = CITY_PAL.walls[Math.floor(r() * CITY_PAL.walls.length)];
      drawIsoBox(g, isoFoot(l.x, l.y, bh * 0.52, bh * 0.44), 0, h, wall, px);
    }
  }
  if (isCapital && !capDrawn) paintCapitolDome(g, px);
}

const CITY_BOX: SpriteBox = { x0: -1.12, y0: -1.28, x1: 1.12, y1: 1.08 };

export function drawCityTilesOverlay(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  world: WorldHexData,
  topo: WorldTopology,
  dpr: number,
) {
  const { width: w, height: h, scale } = camera;

  const drawOne = (hexId: number, pop: number, stateAbbr: string, isCap: boolean, seed: number) => {
    const rPx = world.r[hexId] * scale;
    if (!cityTileVisible(pop, rPx)) return;
    const [sx, sy] = camera.worldToScreen(world.x[hexId], world.y[hexId]);
    if (sx < -rPx * 2.5 || sx > w + rPx * 2.5 || sy < -rPx * 2.5 || sy > h + rPx * 2.5) return;

    const stRgb = topo.stateColorByAbbr.get(stateAbbr) ?? [200, 185, 130];

    if (cityIsDot(pop, rPx)) {
      // Crisp Civ strategy city dot when zoomed out
      const rad = pop >= 5_000_000 ? 4.8 : pop >= 1_500_000 ? 3.8 : pop >= 500_000 ? 3.0 : 2.3;
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,4,.65)';
      ctx.beginPath();
      ctx.arc(sx, sy + 0.8, rad + 1.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = isCap ? '#f5d46e' : cssRgb(stRgb);
      ctx.strokeStyle = isCap ? '#fff6d0' : '#f2e6c8';
      ctx.lineWidth = isCap ? 1.5 : 1.0;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    const tierIdx = pop >= 5_000_000 ? 4 : pop >= 1_500_000 ? 3 : pop >= 400_000 ? 2 : pop >= 150_000 ? 1 : 0;
    const upx = bucketPx(rPx * dpr, 16, 144);
    const colKey = `${stRgb[0] | 0}.${stRgb[1] | 0}.${stRgb[2] | 0}`;
    const vSeed = isCap ? 47900 : seed % 24;
    const spr = getSprite(`city:${tierIdx}:${vSeed}:${colKey}:${isCap ? 1 : 0}`, upx, CITY_BOX, (g, u) => {
      paintCitySprite(g, u, tierIdx, vSeed, stRgb as Rgb255, isCap);
    });
    blitSprite(ctx, spr, sx, sy, rPx);
  };

  for (const [hexId, city] of topo.cityByHex) {
    drawOne(hexId, city.pop, city.state_abbr, city.id === '47900', hexId);
  }
  for (const [hexId, spill] of topo.spillByHex) {
    if (cityIsDot(spill.pop, world.r[hexId] * scale)) continue;
    drawOne(hexId, spill.pop, spill.parent.state_abbr, false, hexId);
  }
}
