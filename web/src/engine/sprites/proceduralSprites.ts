/**
 * Reference-Aligned Procedural Vector Sprite Painters for TERRA AMERICANA
 *  - Bevelled Circular Metallic Resource Medallions (exact 9 Power, 10 Mine & 2 Shale vector icons + 5 value pips!)
 *  - Detailed Maritime Ports (timber quay, gantry crane / derrick, shipping containers vs inland coal barge)
 *  - Detailed FAA Airports (angled runways with dashes, dual runway for L hubs, blue-glazed terminal + tower, airliner)
 *  - Branch-Specific DoD Military Forts (Army 5-bastion star fort, Navy stone quay + warship, Air hangar + winged roundel + jet, Marines/Guard palisade)
 *  - All 52 Custom-Motif Wonders on Gold-Rimmed Raised Round Plinths (+ Top-3 Gold Star!)
 *  - Mode-Colored Trade Route Midpoint Medallions (cart, rail, boat, plane, barrel)
 *  - 10 Isometric District Miniatures (for City View)
 */
import {
  cssRgb,
  luminance255,
  parseHex255,
  shadeRgb,
  type Rgb255,
} from '../../features/lenses/lensConfig';

const TAU = Math.PI * 2;

// --- Shared sprite cache (power-of-sqrt(2) size bucketing) -------------------------------------------------------

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

const cache = new Map<string, CachedSprite>();

function bucketPx(px: number, min = 6, max = 140): number {
  const c = Math.max(min, Math.min(max, px));
  return Math.round(2 ** (Math.round(Math.log2(c) * 2) / 2));
}

function getSprite(
  key: string,
  upx: number,
  box: SpriteBox,
  paint: (g: CanvasRenderingContext2D, upx: number) => void,
): CachedSprite {
  const full = `${key}@${upx}`;
  const hit = cache.get(full);
  if (hit) return hit;
  if (cache.size > 700) {
    let i = 0;
    for (const k of cache.keys()) {
      cache.delete(k);
      if (++i > 220) break;
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
  cache.set(full, spr);
  return spr;
}

function stampArt(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  sizePx: number,
  dpr: number,
  box: SpriteBox,
  paint: (g: CanvasRenderingContext2D, upx: number) => void,
) {
  const k = sizePx / 2;
  const upx = bucketPx(k * dpr, 5, 130);
  const spr = getSprite(key, upx, box, paint);
  ctx.drawImage(spr.cv, x + spr.x0 * k, y + spr.y0 * k, spr.w * k, spr.h * k);
}

// --- 1. Reference Bevelled Circular Resource Medallions (Exact SVG Vector Glyphs from icons.js!) ------------------

const f = (n: number) => +n.toFixed(2);
const svgCircle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
const svgEllipse = (cx: number, cy: number, rx: number, ry: number, deg = 0) => {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a) * rx;
  const dy = Math.sin(a) * rx;
  return `M${f(cx - dx)} ${f(cy - dy)}A${f(rx)} ${f(ry)} ${f(deg)} 1 0 ${f(cx + dx)} ${f(cy + dy)}A${f(rx)} ${f(ry)} ${f(deg)} 1 0 ${f(cx - dx)} ${f(cy - dy)}Z`;
};
const svgPoly = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
const svgRot = (pts: [number, number][], cx: number, cy: number, deg: number): [number, number][] => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
};
const svgRrect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${f(x + r)} ${f(y)}H${f(x + w - r)}a${r} ${r} 0 0 1 ${r} ${r}V${f(y + h - r)}a${r} ${r} 0 0 1 ${-r} ${r}H${f(x + r)}a${r} ${r} 0 0 1 ${-r} ${-r}V${f(y + r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;

interface GlyphPath {
  d: string;
  stroke?: boolean;
  width?: number;
  tone?: boolean;
  detail?: boolean;
}
const F = (d: string): GlyphPath => ({ d });
const S = (d: string, width = 2.2): GlyphPath => ({ d, stroke: true, width });
const T = (d: string): GlyphPath => ({ d, tone: true });
const TS = (d: string, width = 2.2): GlyphPath => ({ d, stroke: true, width, tone: true });
const D = (d: string, width = 1.1): GlyphPath => ({ d, detail: true, width });

const BOLT = (ox = 0, oy = 0, k = 1) =>
  svgPoly(
    ([[13.2, 7.5], [8.6, 14], [11.6, 14], [10.6, 19], [15.4, 12.2], [12.4, 12.2], [13.2, 7.5]] as [number, number][]).map(
      ([x, y]) => [ox + 12 + (x - 12) * k, oy + 13 + (y - 13) * k],
    ),
  );
const DROP = 'M12 2.2C12 2.2 4.8 10.4 4.8 15.2a7.2 7.2 0 0 0 14.4 0C19.2 10.4 12 2.2 12 2.2Z';
const FLAME = 'M12.6 1.8c.4 3.6 5.9 6.2 5.9 12.4a6.5 6.5 0 0 1-13 0c0-3.2 1.8-5.4 3.1-6.6-.1 2.2.8 3.6 2 4-.6-3.6.3-7.1 2-9.8Z';

const RESOURCE_GLYPHS: Record<string, { bg: string; paths: GlyphPath[] }> = {
  nuclear: {
    bg: '#6b5f14',
    paths: [
      F('M4.4 22.2C6.9 17.2 7.6 13.6 6.8 10.6H17.2C16.4 13.6 17.1 17.2 19.6 22.2Z'),
      T(svgCircle(9.2, 5.6, 2.2)), T(svgCircle(13, 4.2, 2.7)), T(svgCircle(16.6, 5.8, 1.9)),
      D('M7.4 14.2h9.2M7.2 18h9.6', 1),
    ],
  },
  hydro: { bg: '#1f5f86', paths: [F(DROP + BOLT(0, 1.4, 0.95)), D('M7.6 13.4a5 5 0 0 0 1.6 4.6', 1.1)] },
  pumped_storage: {
    bg: '#1f4f7a',
    paths: [F(DROP + svgPoly([[12, 7.6], [15.6, 11.4], [13.2, 11.4], [13.2, 14.8], [15.6, 14.8], [12, 18.6], [8.4, 14.8], [10.8, 14.8], [10.8, 11.4], [8.4, 11.4]]))],
  },
  wind: {
    bg: '#2f6b62',
    paths: [
      T('M11.3 10.4h1.4l1.1 11.6h-3.6Z'),
      ...[0, 120, 240].map((a) => F(svgPoly(svgRot([[-1.3, -0.6], [-0.5, -8.4], [0.6, -8.6], [1.3, -0.6]], 12, 9, a)))),
      F(svgCircle(12, 9, 1.8)),
      D(svgCircle(12, 9, 0.7), 0.9),
    ],
  },
  solar: {
    bg: '#8a6a10',
    paths: [
      T(svgCircle(6, 5.4, 2.6)),
      TS('M6 .9v.9M10.5 5.4h-.9M1.5 5.4h.9M9.2 2.2l-.6.6M2.8 2.2l.6.6', 1.6),
      F(svgPoly([[6.2, 10.2], [19.8, 10.2], [22.4, 18.6], [8.8, 18.6]]) +
        svgPoly([[12.4, 10.2], [13.6, 10.2], [16.2, 18.6], [15, 18.6]]) +
        svgPoly([[7.3, 13.8], [20.9, 13.8], [21.2, 15], [7.7, 15]])),
      F('M14.8 18.6h1.8v3.6h-1.8Z'),
    ],
  },
  coal_plant: {
    bg: '#4b453e',
    paths: [
      F('M1.8 21.8V12.4l5 3v-3l5 3v-3l5 3V7.6h4.4v14.2Z' + 'M4.4 17.4h2v2h-2Z' + 'M9.4 17.4h2v2h-2Z' + 'M14.4 17.4h2v2h-2Z'),
      T(svgCircle(17.4, 4.6, 1.9)), T(svgCircle(20.6, 3, 1.5)), T(svgCircle(14.4, 2.6, 1.4)),
    ],
  },
  gas_plant: { bg: '#8a4a10', paths: [F(FLAME + BOLT(0, 2.2, 0.8))] },
  geothermal: {
    bg: '#7a2a2a',
    paths: [
      F('M1.4 22c2.6-5 6-6.6 10.6-6.6S20 17 22.6 22Z'),
      TS('M8.4 13.4c-1.6-1.6 1.6-3 0-4.6s1.6-3 0-4.6', 1.6),
      S('M12.4 12.6c-1.6-1.6 1.6-3 0-4.6s1.6-3 0-4.6s1.6-1.6 0-2.4', 2.2),
      TS('M16.4 13.4c-1.6-1.6 1.6-3 0-4.6s1.6-3 0-4.6', 1.6),
    ],
  },
  battery: {
    bg: '#2f6b4a',
    paths: [F(svgRrect(1.6, 6.4, 18, 11.2, 1.8) + BOLT(-1.4, -1, 0.8)), T(svgRrect(20.2, 9.6, 2.4, 4.8, 0.6))],
  },
  coal_mine: {
    bg: '#3a332c',
    paths: [
      T('M1.4 22.4l1.2-3.8 3.4-1.9 3.4.9 1.4 2.7-.3 2.1Z'),
      F(svgPoly(svgRot([[-1, -1.4], [1, -1.4], [1, 13.6], [-1, 13.6]], 11, 7.4, -40))),
      F(svgPoly(svgRot([[-9, 0.6], [-4.4, -2.4], [0, -3.4], [4.4, -2.4], [9, 0.6], [4.2, -0.6], [0, -1.2], [-4.2, -0.6]], 11, 7.4, -40))),
    ],
  },
  gold: {
    bg: '#8a6a10',
    paths: [
      F(svgPoly([[3.8, 14.4], [10.2, 14.4], [11.4, 21], [2.6, 21]])),
      F(svgPoly([[13.8, 14.4], [20.2, 14.4], [21.4, 21], [12.6, 21]])),
      F(svgPoly([[8.8, 6.6], [15.2, 6.6], [16.4, 13.2], [7.6, 13.2]])),
      T(svgPoly([[12, 1.4], [12.6, 3.2], [14.4, 3.8], [12.6, 4.4], [12, 6.2], [11.4, 4.4], [9.6, 3.8], [11.4, 3.2]])),
    ],
  },
  silver: {
    bg: '#4f5a66',
    paths: [
      F(svgPoly([[5.6, 9.6], [18.4, 9.6], [21, 19.4], [3, 19.4]]) + svgPoly([[8.2, 11.6], [15.8, 11.6], [16.4, 13.6], [7.6, 13.6]])),
      T(svgPoly([[19, 1.6], [19.7, 4], [22.2, 4.7], [19.7, 5.4], [19, 7.8], [18.3, 5.4], [15.8, 4.7], [18.3, 4]])),
    ],
  },
  copper: {
    bg: '#7a4420',
    paths: [
      F(svgEllipse(5.6, 12, 3.2, 8.4) + svgEllipse(5.6, 12, 1.2, 3.4)),
      F('M5.6 3.6H18.4A3.2 8.4 0 0 1 18.4 20.4H5.6A3.2 8.4 0 0 0 5.6 3.6Z' +
        'M9.2 3.9h1.2v16.2H9.2Z' + 'M12.4 3.9h1.2v16.2h-1.2Z' + 'M15.6 3.9h1.2v16.2h-1.2Z'),
    ],
  },
  iron: { bg: '#5a3020', paths: [F('M3 3.4H21V7H14V17H21V20.6H3V17H10V7H3Z')] },
  platinum: {
    bg: '#3f5266',
    paths: [
      F(svgEllipse(12, 14.6, 8.2, 7) + svgEllipse(12, 14.6, 5.6, 4.6)),
      T(svgPoly([[9, 4.2], [15, 4.2], [17, 6.4], [12, 10], [7, 6.4]])),
    ],
  },
  molybdenum: {
    bg: '#3f4a56',
    paths: [
      T(svgPoly([[12, 4.4], [17.4, 7.4], [12, 10.4], [6.6, 7.4]])),
      F(svgPoly([[12, 1.6], [20.4, 6.4], [20.4, 17.4], [12, 22.4], [3.6, 17.4], [3.6, 6.4]]) +
        svgPoly([[12, 4.4], [17.4, 7.4], [12, 10.4], [6.6, 7.4]])),
    ],
  },
  lead_zinc: {
    bg: '#3f4a56',
    paths: [
      S('M12 1.4V5.6', 1.6),
      F(svgRrect(8.8, 5.2, 6.4, 2.8, 1)),
      F('M6 9H18c0 4.4-2.6 8.6-6 13.4C8.6 17.6 6 13.4 6 9Z'),
    ],
  },
  rare_earths: {
    bg: '#5a2a6b',
    paths: [
      T('M3.2 3.2h5.6v3.8H3.2Z' + 'M15.2 3.2h5.6v3.8h-5.6Z'),
      F('M3 3h6v9a3 3 0 0 0 6 0V3h6v9a9 9 0 0 1-18 0Z' + 'M3 3h6v4.2H3Z' + 'M15 3h6v4.2h-6Z'),
    ],
  },
  uranium: {
    bg: '#3a6b1f',
    paths: [
      T(svgCircle(12, 12, 11) + svgCircle(12, 12, 10.2)),
      F(svgCircle(12, 12, 2)),
      ...[0, 120, 240].map((a) => {
        const r1 = 3.4;
        const r2 = 10.2;
        const h = 30;
        const pt = (rr: number, d: number) => {
          const t = ((a - 90 + d) * Math.PI) / 180;
          return [12 + Math.cos(t) * rr, 12 + Math.sin(t) * rr];
        };
        const [ax, ay] = pt(r1, -h);
        const [bx, by] = pt(r2, -h);
        const [cx2, cy2] = pt(r2, h);
        const [dx, dy] = pt(r1, h);
        return F(`M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}A${r2} ${r2} 0 0 1 ${f(cx2)} ${f(cy2)}L${f(dx)} ${f(dy)}A${r1} ${r1} 0 0 0 ${f(ax)} ${f(ay)}Z`);
      }),
    ],
  },
  oil: {
    bg: '#3a2f24',
    paths: [
      F('M9.4 1.8h5.2l4 18.4h-3l-.6-3H9L8.4 20.2h-3Z' + 'M10.6 4.6h2.8l.9 4.2H9.7Z' + 'M9.4 10.8h5.2l1.1 4.8H8.3Z'),
      T('M2.4 20.4h19.2v2H2.4Z'),
    ],
  },
  gas: {
    bg: '#2f5a7a',
    paths: [F(FLAME + 'M12.2 12.4c.6 2.2 3 2.8 3 5.2a3.2 3.2 0 0 1-6.4 0c0-1.8 2-3 3.4-5.2Z')],
  },
};

const compiledGlyphs = new Map<string, (GlyphPath & { p2d: Path2D })[]>();
function getCompiledGlyph(key: string) {
  let c = compiledGlyphs.get(key);
  if (!c) {
    const def = RESOURCE_GLYPHS[key] ?? RESOURCE_GLYPHS.coal_plant;
    const ordered = [...def.paths].sort((a, b) => (a.tone ? 0 : a.detail ? 2 : 1) - (b.tone ? 0 : b.detail ? 2 : 1));
    c = ordered.map((p) => ({ ...p, p2d: new Path2D(p.d) }));
    compiledGlyphs.set(key, c);
  }
  return c;
}

export const FUEL_COLORS: Record<string, { fill: string; stroke: string; glyph: string }> = {
  coal_plant:     { fill: '#8f7a66', stroke: '#EDE5DC', glyph: '#F5D5B5' },
  nuclear:        { fill: '#e5c158', stroke: '#FFF9DF', glyph: '#FFF6C4' },
  wind:           { fill: '#69c2c9', stroke: '#E9FAFB', glyph: '#FFFFFF' },
  gas_plant:      { fill: '#e0843c', stroke: '#FCEEE6', glyph: '#FFD3A8' },
  solar:          { fill: '#f0b840', stroke: '#FFF7DF', glyph: '#FFF3B0' },
  hydro:          { fill: '#4a92d6', stroke: '#E3F2FD', glyph: '#B3E5FC' },
  battery:        { fill: '#4db88a', stroke: '#E8FAF1', glyph: '#C9F7E1' },
  pumped_storage: { fill: '#6b7fd4', stroke: '#ECEFFD', glyph: '#D4DCFF' },
  geothermal:     { fill: '#d46a6a', stroke: '#FDEBEB', glyph: '#FFC9C9' },
  gas:            { fill: '#e0843c', stroke: '#FCEEE6', glyph: '#FFD3A8' },
  coal:           { fill: '#8f7a66', stroke: '#EDE5DC', glyph: '#F5D5B5' },
  other:          { fill: '#7B746B', stroke: '#F0ECE6', glyph: '#FFFFFF' },
};

export const MINE_COLORS: Record<string, { top: string; left: string; right: string }> = {
  coal_mine:   { top: '#6e655e', left: '#4a433d', right: '#2c2723' },
  gold:        { top: '#F5CE56', left: '#D4A128', right: '#9A6F14' },
  copper:      { top: '#E89B62', left: '#C46C35', right: '#8A4219' },
  iron:        { top: '#B57467', left: '#874D42', right: '#572E26' },
  silver:      { top: '#D2DBE5', left: '#A4B2C2', right: '#738294' },
  platinum:    { top: '#9FB3CE', left: '#748BA8', right: '#4C617C' },
  molybdenum:  { top: '#8BA4B8', left: '#627B8F', right: '#3E5364' },
  lead_zinc:   { top: '#9D9AB8', left: '#73708E', right: '#4E4B66' },
  rare_earths: { top: '#C78CD8', left: '#9A5EAE', right: '#6B387D' },
  uranium:     { top: '#84DB7F', left: '#53B04E', right: '#327B2E' },
  lithium:     { top: '#7FD1C8', left: '#46A69D', right: '#257069' },
  coal:        { top: '#615C58', left: '#3D3936', right: '#211E1C' },
  stone:       { top: '#D9D0C1', left: '#B3A796', right: '#807567' },
  other:       { top: '#BFA98E', left: '#947E65', right: '#665440' },
};

const MEDALLION_BOX: SpriteBox = { x0: -1.16, y0: -1.16, x1: 1.16, y1: 1.24 };

/** Bevelled metallic gold-rimmed circular resource medallion with exact SVG glyph & up to 5 bottom value pips. */
export function drawResourceMedallion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sizePx: number,
  typeId: string,
  pips = 0,
  dpr = 2,
  bgOverride?: string,
) {
  const key = RESOURCE_GLYPHS[typeId] ? typeId : 'coal_plant';
  const def = RESOURCE_GLYPHS[key];
  const bgHex = bgOverride || def.bg;
  const p = Math.max(0, Math.min(5, Math.round(pips)));
  const sBucket = Math.round(sizePx);
  stampArt(ctx, `med:${key}:${bgHex}:${p}:${sBucket < 15 ? 's' : 'l'}`, x, y, sizePx, dpr, MEDALLION_BOX, (g, upx) => {
    const bgRGB = parseHex255(bgHex);
    const face = luminance255(bgRGB) > 0.3 ? shadeRgb(bgRGB, -0.32) : bgRGB;
    const ring: Rgb255 = parseHex255('#c9a45c');
    const small = sBucket < 15;
    const rimW = small ? 0.16 : 0.21;

    // Cast shadow
    g.fillStyle = 'rgba(0,0,0,0.48)';
    g.beginPath();
    g.arc(0, 0.08, 1.0, 0, TAU);
    g.fill();

    // Gold/bronze metal rim
    const rg = g.createLinearGradient(-1, -1, 0.8, 1);
    rg.addColorStop(0, cssRgb(shadeRgb(ring, 0.58)));
    rg.addColorStop(0.45, cssRgb(ring));
    rg.addColorStop(1, cssRgb(shadeRgb(ring, -0.55)));
    g.beginPath();
    g.arc(0, 0, 0.96, 0, TAU);
    g.fillStyle = rg;
    g.fill();

    // Recessed face
    const rf = 0.96 - rimW;
    const fg = g.createRadialGradient(-rf * 0.35, -rf * 0.45, rf * 0.05, 0, 0, rf * 1.08);
    fg.addColorStop(0, cssRgb(shadeRgb(bgRGB, 0.18)));
    fg.addColorStop(0.5, cssRgb(face));
    fg.addColorStop(1, cssRgb(shadeRgb(face, -0.45)));
    g.beginPath();
    g.arc(0, 0, rf, 0, TAU);
    g.fillStyle = fg;
    g.fill();
    g.lineWidth = 0.8 / upx;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.stroke();

    // Paint vector glyph centered in face
    const glyphCol = luminance255(face) > 0.36 ? '#1c1710' : '#f8f0d8';
    const gs = small ? 1.38 : 1.2;
    const paths = getCompiledGlyph(key);
    g.save();
    g.beginPath();
    g.arc(0, 0, rf, 0, TAU);
    g.clip();
    g.translate(-gs / 2, -gs / 2);
    g.scale(gs / 24, gs / 24);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pt of paths) {
      if (pt.detail && small) continue;
      g.globalAlpha = pt.tone ? 0.58 : 1;
      if (pt.detail) {
        g.strokeStyle = cssRgb(shadeRgb(face, -0.35), 0.78);
        g.lineWidth = Math.max(pt.width ?? 1.1, 0.9);
        g.stroke(pt.p2d);
      } else if (pt.stroke) {
        g.strokeStyle = glyphCol;
        g.lineWidth = pt.width ?? 2.2;
        g.stroke(pt.p2d);
      } else {
        g.fillStyle = glyphCol;
        g.fill(pt.p2d, 'evenodd');
      }
    }
    g.globalAlpha = 1;
    g.restore();

    // Upper glass sheen & specular rim glint
    if (!small) {
      g.save();
      g.beginPath();
      g.arc(0, 0, rf, 0, TAU);
      g.clip();
      const sg = g.createLinearGradient(0, -rf, 0, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0.22)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.beginPath();
      g.ellipse(-rf * 0.12, -rf * 0.52, rf * 0.92, rf * 0.58, 0, 0, TAU);
      g.fillStyle = sg;
      g.fill();
      g.restore();

      g.beginPath();
      g.arc(0, 0, 0.96 - rimW * 0.52, Math.PI * 1.1, Math.PI * 1.42);
      g.strokeStyle = 'rgba(255,252,235,0.8)';
      g.lineWidth = 0.065;
      g.lineCap = 'round';
      g.stroke();

      // Up to 5 bottom value pip studs
      if (p > 0) {
        const pr = 0.085;
        const rr = 0.96 - rimW * 0.48;
        for (let i = 0; i < 5; i++) {
          const a = Math.PI / 2 + (i - 2) * 0.36;
          const px2 = -Math.cos(a) * rr;
          const py2 = Math.sin(a) * rr;
          g.beginPath();
          g.arc(px2, py2, pr, 0, TAU);
          g.fillStyle = i < p ? '#fff1b0' : cssRgb(shadeRgb(ring, -0.6));
          g.fill();
          g.lineWidth = 0.038;
          g.strokeStyle = 'rgba(30,20,6,0.85)';
          g.stroke();
        }
      }
    }
  });
}

// --- 2. Detailed Maritime Ports & FAA Airports (from improvements.js) ---------------------------------------------

const SITE_BOX: SpriteBox = { x0: -1.25, y0: -1.25, x1: 1.25, y1: 1.25 };

function ink(g: CanvasRenderingContext2D, upx: number, wPx = 1.1, col = 'rgba(28,20,10,.92)') {
  g.lineWidth = wPx / upx;
  g.strokeStyle = col;
  g.stroke();
}

export function drawPortSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sizePx: number,
  tons: number,
  portType = 'coastal',
  dpr = 2,
) {
  const tier = tons >= 1e8 ? 0 : tons >= 2.5e7 ? 1 : 2;
  const river = portType === 'inland' || portType === 'great_lakes';
  stampArt(ctx, `imp:port:${tier}:${river ? 'r' : 'c'}`, x, y, sizePx, dpr, SITE_BOX, (g, upx) => {
    // Water strip under quay
    g.fillStyle = '#3f7fa6';
    g.beginPath();
    g.moveTo(-1.05, 0.45); g.lineTo(1.05, 0.45); g.lineTo(0.95, 0.95); g.lineTo(-0.95, 0.95); g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(220,240,255,.75)';
    g.lineWidth = 1 / upx;
    g.beginPath();
    g.moveTo(-0.8, 0.72); g.quadraticCurveTo(-0.65, 0.64, -0.5, 0.72);
    g.moveTo(0.1, 0.84); g.quadraticCurveTo(0.25, 0.76, 0.4, 0.84);
    g.stroke();
    // Timber quay + pilings
    g.fillStyle = '#8a6238';
    g.beginPath();
    g.rect(-1.0, 0.28, 2.0, 0.2);
    g.fill();
    ink(g, upx, 1);
    g.strokeStyle = 'rgba(40,24,10,.6)';
    g.lineWidth = 0.8 / upx;
    g.beginPath();
    for (let k = -0.8; k <= 0.85; k += 0.27) { g.moveTo(k, 0.48); g.lineTo(k, 0.6); }
    g.stroke();

    if (river) {
      // River/Great Lakes coal barge
      g.fillStyle = '#5a4a3a';
      g.beginPath();
      g.moveTo(-0.95, 0.56); g.lineTo(0.15, 0.56); g.lineTo(0.05, 0.78); g.lineTo(-0.85, 0.78); g.closePath();
      g.fill();
      ink(g, upx, 1);
      g.fillStyle = '#24211f';
      g.beginPath();
      g.ellipse(-0.6, 0.57, 0.18, 0.12, 0, Math.PI, 0);
      g.ellipse(-0.22, 0.57, 0.18, 0.12, 0, Math.PI, 0);
      g.fill();
    } else {
      const box = (bx: number, by: number, c: string) => {
        g.fillStyle = c;
        g.beginPath();
        g.rect(bx, by, 0.36, 0.2);
        g.fill();
        ink(g, upx, 0.9);
      };
      box(-0.95, 0.08, '#c2553a');
      box(-0.57, 0.08, '#3a78a8');
      if (tier <= 1) { box(-0.76, -0.12, '#d8a23a'); box(-0.19, 0.08, '#4a8a4a'); }
      if (tier === 0) box(-0.38, -0.12, '#c2553a');
    }

    // Orange gantry crane (big) or derrick (small)
    const col = '#d86a2a';
    g.strokeStyle = col;
    if (tier <= 1) {
      const h = tier === 0 ? -0.95 : -0.72;
      g.lineWidth = Math.max(1.6 / upx, 0.09);
      g.beginPath();
      g.moveTo(0.25, 0.3); g.lineTo(0.3, h); g.moveTo(0.75, 0.3); g.lineTo(0.7, h);
      g.stroke();
      g.fillStyle = col;
      g.beginPath();
      g.rect(0.12, h - 0.08, 1.0, 0.14);
      g.fill();
      ink(g, upx, 0.9);
      g.strokeStyle = 'rgba(30,20,10,.8)';
      g.lineWidth = 0.9 / upx;
      g.beginPath();
      g.moveTo(1.0, h + 0.06); g.lineTo(1.0, 0.1);
      g.stroke();
      g.fillStyle = '#3a3a3a';
      g.fillRect(0.93, 0.08, 0.14, 0.08);
    } else {
      g.lineWidth = Math.max(1.4 / upx, 0.08);
      g.beginPath();
      g.moveTo(0.45, 0.3); g.lineTo(0.45, -0.55); g.lineTo(0.95, -0.2);
      g.stroke();
      g.strokeStyle = 'rgba(30,20,10,.8)';
      g.lineWidth = 0.9 / upx;
      g.beginPath();
      g.moveTo(0.95, -0.2); g.lineTo(0.95, 0.2);
      g.stroke();
    }
  });
}

export function drawAirportSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sizePx: number,
  hub?: string,
  code?: string,
  dpr = 2,
) {
  const tier = hub === 'L' ? 0 : hub === 'M' ? 1 : hub === 'S' ? 2 : hub === 'N' ? 3 : 4;
  stampArt(ctx, `imp:air:${tier}`, x, y, sizePx, dpr, SITE_BOX, (g, upx) => {
    g.fillStyle = 'rgba(20,14,6,.22)';
    g.beginPath();
    g.ellipse(0, 0.7, 1.0, 0.26, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(120,140,80,.55)';
    g.beginPath();
    g.ellipse(0, 0.25, 1.08, 0.62, -0.42, 0, TAU);
    g.fill();

    const len = tier <= 1 ? 1.12 : tier <= 3 ? 0.95 : 0.88;
    const wid = tier <= 1 ? 0.2 : 0.15;
    g.save();
    g.translate(0, 0.25);
    g.rotate(-0.42);
    g.fillStyle = '#4a4a4e';
    g.beginPath();
    g.rect(-len, -wid / 2, 2 * len, wid);
    g.fill();
    ink(g, upx, 0.9, 'rgba(20,20,24,.8)');
    g.strokeStyle = '#f2efe4';
    g.lineWidth = Math.max(0.8 / upx, wid * 0.12);
    g.setLineDash([0.12, 0.09]);
    g.beginPath();
    g.moveTo(-len + 0.22, 0); g.lineTo(len - 0.22, 0);
    g.stroke();
    g.setLineDash([]);
    if (tier === 0) {
      g.fillStyle = '#55555a';
      g.beginPath();
      g.rect(-len * 0.7, -0.42, 1.4 * len, wid * 0.8);
      g.fill();
      ink(g, upx, 0.8, 'rgba(20,20,24,.7)');
    }
    g.restore();

    if (tier <= 2) {
      const tw = tier === 0 ? 0.95 : tier === 1 ? 0.75 : 0.5;
      g.fillStyle = '#e7e2d6';
      g.beginPath();
      g.rect(-0.95, -0.55, tw, 0.34);
      g.fill();
      ink(g, upx, 1);
      g.fillStyle = '#4a86b8';
      g.fillRect(-0.9, -0.48, tw - 0.1, 0.1);
      g.fillStyle = '#d9d3c4';
      g.beginPath();
      g.rect(-0.95 + tw + 0.04, -0.95, 0.16, 0.74);
      g.fill();
      ink(g, upx, 1);
      g.fillStyle = '#4a86b8';
      g.beginPath();
      g.moveTo(-0.95 + tw - 0.01, -1.02); g.lineTo(-0.95 + tw + 0.25, -1.02);
      g.lineTo(-0.95 + tw + 0.22, -0.88); g.lineTo(-0.95 + tw + 0.02, -0.88); g.closePath();
      g.fill();
      ink(g, upx, 0.9);
    } else {
      g.fillStyle = tier === 4 ? '#8a8f96' : '#b9a888';
      g.beginPath();
      g.moveTo(-0.95, -0.2); g.lineTo(-0.95, -0.4); g.quadraticCurveTo(-0.65, -0.78, -0.35, -0.4); g.lineTo(-0.35, -0.2);
      g.closePath();
      g.fill();
      ink(g, upx, 1);
    }

    if (tier <= 1 || tier === 4) {
      g.save();
      g.translate(0.55, -0.35);
      g.rotate(0.55);
      const pk = tier === 0 ? 0.48 : 0.4;
      g.scale(pk, pk);
      g.beginPath();
      g.moveTo(0, -1); g.lineTo(0.12, -0.2); g.lineTo(0.95, 0.15); g.lineTo(0.95, 0.32); g.lineTo(0.12, 0.12);
      g.lineTo(0.1, 0.62); g.lineTo(0.38, 0.8); g.lineTo(0.38, 0.92); g.lineTo(0, 0.84);
      g.lineTo(-0.38, 0.92); g.lineTo(-0.38, 0.8); g.lineTo(-0.1, 0.62); g.lineTo(-0.12, 0.12);
      g.lineTo(-0.95, 0.32); g.lineTo(-0.95, 0.15); g.lineTo(-0.12, -0.2); g.closePath();
      g.fillStyle = tier === 4 ? '#d9dee6' : '#f4f1ea';
      g.fill();
      ink(g, upx * pk, 0.9);
      g.restore();
    }
  });

  if (code) {
    ctx.save();
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,16,10,0.88)';
    ctx.fillRect(x - 13, y + sizePx * 0.42, 26, 11);
    ctx.fillStyle = '#f6e7bf';
    ctx.fillText(code, x, y + sizePx * 0.42 + 8.5);
    ctx.restore();
  }
}

// --- 3. Branch-Specific DoD Military Forts (from sites.js) --------------------------------------------------------

const FORT_PALS: Record<string, { wall: string; accent: string; flag: string; pad: string }> = {
  army:      { wall: '#a8966a', accent: '#5f6b3a', flag: '#e0b44a', pad: 'rgba(96,108,58,.72)' },
  navy:      { wall: '#98a4b2', accent: '#22406a', flag: '#e8e2d0', pad: 'rgba(34,64,106,.62)' },
  air:       { wall: '#b2bac4', accent: '#3a6aa8', flag: '#9cc4ec', pad: 'rgba(58,106,168,.55)' },
  marines:   { wall: '#b0946e', accent: '#8a2a2a', flag: '#e2b84a', pad: 'rgba(138,42,42,.6)' },
  guard:     { wall: '#a8a28c', accent: '#6a6a52', flag: '#cfc3a0', pad: 'rgba(110,110,84,.55)' },
  air_guard: { wall: '#aeb0b2', accent: '#5a6a7a', flag: '#b9c8d8', pad: 'rgba(90,106,122,.55)' },
  reserve:   { wall: '#a49e92', accent: '#6a6258', flag: '#d8cfba', pad: 'rgba(106,98,88,.5)' },
  other:     { wall: '#a2a2a2', accent: '#4a4a5a', flag: '#d0d0d0', pad: 'rgba(74,74,90,.5)' },
};

function fortKindFromComp(comp: string): string {
  switch (comp) {
    case 'army': return 'army';
    case 'navy': return 'navy';
    case 'air_force': return 'air';
    case 'marines': return 'marines';
    case 'army_guard': return 'guard';
    case 'air_guard': return 'air_guard';
    case 'army_reserve':
    case 'navy_reserve':
    case 'air_force_reserve':
    case 'marine_reserve':
      return 'reserve';
    default:
      return 'other';
  }
}

function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, n = 5, inner = 0.45) {
  for (let k = 0; k < n * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / n;
    const rr = k % 2 ? r * inner : r;
    k ? g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) : g.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  g.closePath();
}

function drawFlag(g: CanvasRenderingContext2D, upx: number, x: number, y: number, h: number, col: string) {
  g.strokeStyle = '#3a2c1c';
  g.lineWidth = Math.max(1 / upx, 0.05);
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x, y - h);
  g.stroke();
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x, y - h);
  g.quadraticCurveTo(x + 0.22, y - h - 0.05, x + 0.4, y - h + 0.05);
  g.lineTo(x + 0.4, y - h + 0.25);
  g.quadraticCurveTo(x + 0.22, y - h + 0.18, x, y - h + 0.22);
  g.closePath();
  g.fill();
  ink(g, upx, 0.8);
}

const FORT_BOX: SpriteBox = { x0: -1.25, y0: -1.35, x1: 1.25, y1: 1.15 };

export function drawMilitaryFortSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sizePx: number,
  component: string,
  opts: { tier?: string; joint?: boolean; airfield?: boolean; muted?: boolean } = {},
  dpr = 2,
) {
  const kind = fortKindFromComp(component);
  const tier = opts.tier || 'base';
  const air = !!opts.airfield && (kind === 'navy' || kind === 'marines');
  const key = `site:fort:${kind}:${tier}:${opts.joint ? 1 : 0}:${air ? 1 : 0}`;
  stampArt(ctx, key, x, y, sizePx, dpr, FORT_BOX, (g, upx) => {
    const pal = FORT_PALS[kind] ?? FORT_PALS.other;
    const k = tier === 'site' ? 0.72 : 1;
    if (opts.muted) g.globalAlpha = 0.85;
    g.fillStyle = 'rgba(18,12,4,.3)';
    g.beginPath(); g.ellipse(0, 0.62, 1.0 * k, 0.26 * k, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(0, 0.42, 1.04 * k, 0.4 * k, 0, 0, TAU);
    g.fillStyle = pal.pad; g.fill();
    ink(g, upx, 0.9, 'rgba(30,20,10,.55)');
    if (opts.joint) {
      g.beginPath(); g.ellipse(0, 0.45, 1.08 * k, 0.42 * k, 0, 0, TAU);
      g.lineWidth = Math.max(1.5 / upx, 0.1);
      g.strokeStyle = '#e6c46a';
      g.stroke();
    }
    g.save();
    g.scale(k, k);
    const u = upx / k;
    if (air || kind === 'air' || kind === 'air_guard') {
      // Airstrip + arched hangar + winged roundel (+ jet if major)
      g.save();
      g.translate(0, 0.42);
      g.rotate(-0.12);
      g.fillStyle = '#55585c';
      g.beginPath(); g.rect(-1.05, -0.11, 2.1, 0.22); g.fill(); ink(g, u, 0.9);
      g.strokeStyle = '#f2efe4'; g.lineWidth = 0.9 / u; g.setLineDash([0.14, 0.1]);
      g.beginPath(); g.moveTo(-0.85, 0); g.lineTo(0.85, 0); g.stroke(); g.setLineDash([]);
      g.restore();
      g.fillStyle = pal.wall;
      g.beginPath();
      g.moveTo(-0.95, 0.2); g.lineTo(-0.95, -0.05); g.bezierCurveTo(-0.9, -0.52, -0.1, -0.52, -0.05, -0.05); g.lineTo(-0.05, 0.2); g.closePath();
      g.fill(); ink(g, u, 1);
      g.fillStyle = '#3a3c40'; g.fillRect(-0.72, -0.04, 0.44, 0.24);
      g.fillStyle = pal.accent;
      g.beginPath(); g.moveTo(0.05, -0.3); g.lineTo(0.98, -0.42); g.lineTo(0.9, -0.28); g.lineTo(0.55, -0.16); g.lineTo(0.05, -0.16); g.closePath(); g.fill(); ink(g, u, 0.9);
      g.beginPath(); g.arc(0.42, -0.24, 0.24, 0, TAU); g.fillStyle = '#f2ead6'; g.fill(); ink(g, u, 0.9);
      g.beginPath(); starPath(g, 0.42, -0.24, 0.17, 5, 0.42); g.fillStyle = pal.accent; g.fill();
      if (tier === 'major') {
        g.save(); g.translate(0.55, 0.18); g.rotate(-0.2);
        g.fillStyle = '#c8ccd2';
        g.beginPath();
        g.moveTo(0.38, 0); g.lineTo(-0.3, -0.05); g.lineTo(-0.1, -0.3); g.lineTo(-0.2, -0.3); g.lineTo(-0.42, -0.05);
        g.lineTo(-0.56, -0.14); g.lineTo(-0.5, 0); g.lineTo(-0.56, 0.14); g.lineTo(-0.42, 0.05);
        g.lineTo(-0.2, 0.3); g.lineTo(-0.1, 0.3); g.lineTo(-0.3, 0.05); g.closePath();
        g.fill(); ink(g, u, 0.8); g.restore();
      }
    } else if (kind === 'navy') {
      // Stone quay + shed + anchor medallion (+ warship if major)
      g.fillStyle = '#3f7fa6';
      g.beginPath(); g.moveTo(-1.1, 0.5); g.lineTo(1.1, 0.5); g.lineTo(1.0, 0.95); g.lineTo(-1.0, 0.95); g.closePath(); g.fill();
      g.fillStyle = pal.wall;
      g.beginPath(); g.moveTo(-1.0, 0.52); g.lineTo(-0.9, 0.12); g.lineTo(0.9, 0.12); g.lineTo(1.0, 0.52); g.closePath(); g.fill(); ink(g, u, 1);
      g.fillStyle = '#d8d2c4'; g.beginPath(); g.rect(-0.8, -0.28, 0.7, 0.4); g.fill(); ink(g, u, 1);
      g.fillStyle = pal.accent; g.beginPath(); g.moveTo(-0.86, -0.26); g.lineTo(-0.45, -0.56); g.lineTo(-0.04, -0.26); g.closePath(); g.fill(); ink(g, u, 1);
      g.beginPath(); g.arc(0.42, -0.18, 0.34, 0, TAU); g.fillStyle = pal.accent; g.fill(); ink(g, u, 1);
      g.strokeStyle = '#f2ead6'; g.lineWidth = Math.max(1.2 / u, 0.06);
      g.beginPath(); g.moveTo(0.42, -0.4); g.lineTo(0.42, 0.04); g.moveTo(0.3, -0.3); g.lineTo(0.54, -0.3);
      g.moveTo(0.24, -0.08); g.quadraticCurveTo(0.42, 0.12, 0.6, -0.08); g.stroke();
      if (tier === 'major') {
        g.fillStyle = '#6a7480';
        g.beginPath(); g.moveTo(-0.95, 0.6); g.lineTo(0.75, 0.6); g.lineTo(0.95, 0.56); g.lineTo(0.7, 0.8); g.lineTo(-0.85, 0.8); g.closePath(); g.fill(); ink(g, u, 0.9);
        g.fillStyle = '#8a949e'; g.fillRect(-0.35, 0.46, 0.4, 0.14); g.fillRect(-0.2, 0.36, 0.14, 0.1);
        drawFlag(g, u, 0.86, 0.12, 0.6, pal.flag);
      }
    } else if (kind === 'army' || kind === 'other') {
      // 5-bastion Star Fort + parade ground + keep & flag
      g.save(); g.translate(0, 0.25); g.scale(1, 0.62);
      g.beginPath(); starPath(g, 0, 0, 1.0, 5, 0.62); g.fillStyle = '#6f6248'; g.fill(); g.restore();
      g.save(); g.translate(0, 0.12); g.scale(1, 0.62);
      g.beginPath(); starPath(g, 0, 0, 1.0, 5, 0.62); g.fillStyle = pal.wall; g.fill(); ink(g, u / 0.62 * 0.8, 1.1);
      g.beginPath(); starPath(g, 0, 0, 0.6, 5, 0.7); g.fillStyle = '#b9a878'; g.fill(); g.restore();
      g.fillStyle = pal.accent;
      g.fillRect(-0.3, -0.12, 0.26, 0.14); g.fillRect(0.08, 0.04, 0.26, 0.14);
      if (tier === 'major') {
        g.fillStyle = pal.wall; g.beginPath(); g.rect(-0.18, -0.42, 0.36, 0.42); g.fill(); ink(g, u, 1);
        g.fillStyle = '#3a3020';
        for (let c = 0; c < 3; c++) g.fillRect(-0.18 + c * 0.14, -0.5, 0.08, 0.08);
        drawFlag(g, u, 0, -0.5, 0.7, pal.flag);
      } else {
        drawFlag(g, u, 0.05, 0, 0.62, pal.flag);
      }
    } else {
      // Marines / Guard / Reserve: timber palisade + blockhouse + chevron banner or pennant
      g.save(); g.translate(0, 0.25); g.scale(1, 0.5);
      g.beginPath(); g.arc(0, 0, 0.92, 0, TAU); g.fillStyle = '#8a7656'; g.fill(); ink(g, u / 0.5 * 0.7, 1);
      g.beginPath(); g.arc(0, -0.1, 0.72, 0, TAU); g.fillStyle = '#b7a47a'; g.fill(); g.restore();
      g.fillStyle = pal.wall; g.beginPath(); g.rect(-0.32, -0.25, 0.64, 0.42); g.fill(); ink(g, u, 1);
      g.fillStyle = pal.accent; g.beginPath(); g.moveTo(-0.4, -0.22); g.lineTo(0, -0.52); g.lineTo(0.4, -0.22); g.closePath(); g.fill(); ink(g, u, 1);
      drawFlag(g, u, 0.58, 0.15, tier === 'major' ? 0.85 : 0.65, pal.flag);
    }
    g.restore();
    g.globalAlpha = 1;
  });
}

// --- 4. All 52 Custom-Motif Wonders on Gold-Rimmed Plinths (from sites.js!) ---------------------------------------

const WONDER_BOX: SpriteBox = { x0: -1.2, y0: -1.45, x1: 1.2, y1: 1.1 };

function wPoly(g: CanvasRenderingContext2D, pts: number[]) {
  g.beginPath();
  for (let k = 0; k < pts.length; k += 2) k ? g.lineTo(pts[k], pts[k + 1]) : g.moveTo(pts[k], pts[k + 1]);
  g.closePath();
}
function fillInk(g: CanvasRenderingContext2D, upx: number, fill: string | CanvasGradient, w = 1) {
  g.fillStyle = fill;
  g.fill();
  ink(g, upx, w);
}
function wPine(g: CanvasRenderingContext2D, upx: number, x: number, y: number, h: number, col = '#2f5a32') {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x, y - h); g.lineTo(x + h * 0.32, y - h * 0.35); g.lineTo(x + h * 0.18, y - h * 0.35); g.lineTo(x + h * 0.38, y);
  g.lineTo(x - h * 0.38, y); g.lineTo(x - h * 0.18, y - h * 0.35); g.lineTo(x - h * 0.32, y - h * 0.35); g.closePath();
  g.fill();
  ink(g, upx, 0.8);
}
function wWater(g: CanvasRenderingContext2D, upx: number, y0 = 0.2) {
  g.beginPath(); g.ellipse(0, 0.36, 0.96, 0.33, 0, 0, TAU);
  g.save(); g.clip();
  g.fillStyle = '#4f9ccc'; g.fillRect(-1, y0, 2, 1);
  g.strokeStyle = 'rgba(230,245,255,.75)'; g.lineWidth = 0.9 / upx;
  g.beginPath();
  for (const [x, y] of [[-0.6, y0 + 0.14], [0.1, y0 + 0.24], [0.5, y0 + 0.12]]) {
    g.moveTo(x - 0.14, y); g.quadraticCurveTo(x - 0.07, y - 0.05, x, y); g.quadraticCurveTo(x + 0.07, y + 0.05, x + 0.14, y);
  }
  g.stroke(); g.restore();
}

function paintWonderMotif(g: CanvasRenderingContext2D, upx: number, motif: string) {
  switch (motif) {
    case 'canyon': {
      wPoly(g, [-0.2, 0.1, -0.14, -0.86, 0.12, -0.92, 0.18, 0.1]); fillInk(g, upx, '#c98256', 0.9);
      const left = [-0.94, 0.36, -0.94, -0.3, -0.84, -0.44, -0.4, -0.44, -0.3, -0.3, -0.24, -0.1, -0.12, 0.36];
      const right = [0.06, 0.36, 0.16, -0.5, 0.26, -0.66, 0.84, -0.66, 0.94, -0.5, 0.94, 0.36];
      for (const pts of [left, right]) { wPoly(g, pts); fillInk(g, upx, '#b85a34', 1.1); }
      wPoly(g, [-0.12, 0.36, -0.2, -0.05, 0.12, -0.05, 0.06, 0.36]); g.fillStyle = '#6a2e18'; g.fill();
      wPoly(g, [-0.06, 0.36, -0.03, 0.02, 0.02, 0.02, 0.04, 0.36]); g.fillStyle = '#5fa8d8'; g.fill();
      break;
    }
    case 'forest': {
      g.beginPath(); g.moveTo(-0.95, 0.3); g.bezierCurveTo(-0.7, -0.6, -0.35, -0.75, -0.05, -0.45);
      g.bezierCurveTo(0.2, -0.85, 0.65, -0.7, 0.95, 0.1); g.lineTo(0.95, 0.36); g.lineTo(-0.95, 0.36); g.closePath();
      fillInk(g, upx, '#5d7f86', 1);
      g.fillStyle = 'rgba(236,242,246,.55)'; g.beginPath(); g.ellipse(0, -0.12, 0.92, 0.13, 0, 0, TAU); g.fill();
      wPine(g, upx, -0.64, 0.44, 0.62); wPine(g, upx, -0.38, 0.48, 0.5, '#3a6a3a');
      wPine(g, upx, 0.62, 0.42, 0.66); wPine(g, upx, 0.08, 0.5, 0.44, '#2a5230');
      break;
    }
    case 'desert': {
      g.fillStyle = '#f0b04a'; g.beginPath(); g.arc(0.56, -0.86, 0.2, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-0.95, 0.36); g.bezierCurveTo(-0.5, -0.12, 0.5, -0.12, 0.95, 0.36); g.closePath();
      fillInk(g, upx, '#d9b37a', 0.9);
      g.strokeStyle = '#6a4e30'; g.lineCap = 'round'; g.lineWidth = Math.max(1.6 / upx, 0.1);
      g.beginPath(); g.moveTo(-0.18, 0.4); g.lineTo(-0.18, -0.2);
      g.moveTo(-0.18, -0.15); g.quadraticCurveTo(-0.5, -0.2, -0.52, -0.55);
      g.moveTo(-0.18, -0.1); g.quadraticCurveTo(0.2, -0.15, 0.24, -0.45); g.stroke();
      for (const [tx, ty] of [[-0.52, -0.55], [-0.18, -0.4], [0.24, -0.45]]) {
        g.beginPath(); starPath(g, tx, ty, 0.14, 7, 0.4); fillInk(g, upx, '#6f8f3a', 0.7);
      }
      break;
    }
    case 'geyser': {
      g.beginPath(); g.moveTo(-0.92, 0.36); g.bezierCurveTo(-0.6, 0, 0.6, 0, 0.92, 0.36); g.closePath();
      fillInk(g, upx, '#d8ccb4', 0.9);
      g.beginPath(); g.ellipse(-0.42, 0.24, 0.36, 0.1, 0, 0, TAU); g.fillStyle = '#e08a3a'; g.fill();
      g.beginPath(); g.ellipse(-0.42, 0.24, 0.25, 0.065, 0, 0, TAU); g.fillStyle = '#e8d65a'; g.fill();
      g.beginPath(); g.ellipse(-0.42, 0.24, 0.16, 0.045, 0, 0, TAU); g.fillStyle = '#2fa8c4'; g.fill();
      g.beginPath();
      for (const [px, py, r] of [[0.3, 0.06, 0.14], [0.28, -0.2, 0.18], [0.34, -0.48, 0.22], [0.24, -0.78, 0.26], [0.34, -1.06, 0.22]]) {
        g.moveTo(px + r, py); g.arc(px, py, r, 0, TAU);
      }
      g.fillStyle = '#f6f8fa'; g.fill(); ink(g, upx, 0.9, 'rgba(90,100,110,.55)');
      wPine(g, upx, -0.78, 0.42, 0.46); wPine(g, upx, 0.78, 0.44, 0.5);
      break;
    }
    case 'coast': {
      wWater(g, upx, 0.24);
      g.beginPath(); g.moveTo(-0.95, 0.32); g.bezierCurveTo(-0.6, 0.02, 0.1, 0, 0.55, 0.3); g.closePath(); fillInk(g, upx, '#e2cc96', 0.9);
      wPoly(g, [-0.36, 0.14, -0.28, -0.82, -0.04, -0.82, 0.04, 0.14]);
      g.fillStyle = '#f4f1ea'; g.fill();
      g.save(); g.clip(); g.fillStyle = '#b8402e'; g.fillRect(-0.4, -0.58, 0.5, 0.16); g.fillRect(-0.4, -0.22, 0.5, 0.16); g.restore();
      wPoly(g, [-0.36, 0.14, -0.28, -0.82, -0.04, -0.82, 0.04, 0.14]); ink(g, upx, 1);
      g.beginPath(); g.rect(-0.3, -1.02, 0.28, 0.2); fillInk(g, upx, '#f2d27a', 0.9);
      wPoly(g, [-0.36, -1.02, -0.16, -1.22, 0.04, -1.02]); fillInk(g, upx, '#3a3430', 0.9);
      g.fillStyle = 'rgba(255,236,160,.45)'; wPoly(g, [-0.02, -0.96, 0.7, -1.18, 0.7, -0.82]); g.fill();
      break;
    }
    case 'bridge': {
      wWater(g, upx, 0.12);
      wPoly(g, [-0.96, 0.36, -0.96, -0.12, -0.7, -0.2, -0.5, 0.2, -0.5, 0.36]); fillInk(g, upx, '#6f8a4a', 0.9);
      wPoly(g, [0.96, 0.36, 0.96, -0.06, 0.72, -0.14, 0.52, 0.2, 0.52, 0.36]); fillInk(g, upx, '#6f8a4a', 0.9);
      const red = '#c0462e';
      g.strokeStyle = red; g.lineWidth = Math.max(1.2 / upx, 0.05);
      g.beginPath();
      g.moveTo(-0.96, -0.02); g.quadraticCurveTo(-0.66, -0.35, -0.44, -0.92);
      g.quadraticCurveTo(0, 0, 0.44, -0.92); g.quadraticCurveTo(0.66, -0.35, 0.96, -0.02); g.stroke();
      g.beginPath(); g.rect(-0.96, 0.02, 1.92, 0.08); fillInk(g, upx, red, 0.9);
      for (const tx of [-0.44, 0.44]) {
        g.beginPath(); g.rect(tx - 0.08, -1.02, 0.05, 1.24); g.rect(tx + 0.03, -1.02, 0.05, 1.24);
        g.rect(tx - 0.08, -0.98, 0.16, 0.05); g.rect(tx - 0.08, -0.62, 0.16, 0.05); fillInk(g, upx, red, 0.8);
      }
      break;
    }
    case 'dam': {
      wPoly(g, [-0.96, 0.36, -0.96, -0.74, -0.56, -0.8, -0.38, 0.36]); fillInk(g, upx, '#b8683e', 1);
      wPoly(g, [0.96, 0.36, 0.96, -0.74, 0.56, -0.8, 0.38, 0.36]); fillInk(g, upx, '#a85a34', 1);
      g.beginPath(); g.moveTo(-0.6, -0.62); g.quadraticCurveTo(0, -0.74, 0.6, -0.62); g.lineTo(0.6, -0.5); g.lineTo(-0.6, -0.5); g.closePath();
      g.fillStyle = '#3f8cc0'; g.fill();
      g.beginPath(); g.moveTo(-0.6, -0.56); g.quadraticCurveTo(0, -0.36, 0.6, -0.56);
      g.lineTo(0.4, 0.3); g.quadraticCurveTo(0, 0.42, -0.4, 0.3); g.closePath();
      fillInk(g, upx, '#d8d0c0', 1.1);
      g.beginPath(); g.ellipse(0, 0.38, 0.3, 0.07, 0, 0, TAU); g.fillStyle = '#5fa8d8'; g.fill();
      break;
    }
    case 'arch': {
      wPine(g, upx, -0.82, 0.42, 0.34, '#4a7a3a'); wPine(g, upx, 0.82, 0.42, 0.34, '#4a7a3a');
      g.beginPath();
      g.moveTo(-0.72, 0.36); g.bezierCurveTo(-0.62, -0.7, -0.22, -1.32, 0, -1.32);
      g.bezierCurveTo(0.22, -1.32, 0.62, -0.7, 0.72, 0.36); g.lineTo(0.56, 0.36);
      g.bezierCurveTo(0.48, -0.6, 0.18, -1.14, 0, -1.14); g.bezierCurveTo(-0.18, -1.14, -0.48, -0.6, -0.56, 0.36); g.closePath();
      const gr = g.createLinearGradient(-0.7, 0, 0.7, 0);
      gr.addColorStop(0, '#f4f6f8'); gr.addColorStop(0.5, '#b8c0c8'); gr.addColorStop(1, '#7a848e');
      fillInk(g, upx, gr, 1.1);
      break;
    }
    case 'statue': {
      wPoly(g, [-0.42, 0.36, -0.42, 0.06, -0.3, -0.02, 0.3, -0.02, 0.42, 0.06, 0.42, 0.36]); fillInk(g, upx, '#d8ccb0', 1);
      const cu = '#6fae9a';
      wPoly(g, [-0.26, -0.02, -0.18, -0.62, -0.04, -0.76, 0.1, -0.74, 0.2, -0.58, 0.24, -0.02]); fillInk(g, upx, cu, 1);
      wPoly(g, [0.06, -0.72, 0.16, -0.76, 0.26, -1.12, 0.18, -1.14]); fillInk(g, upx, cu, 0.9);
      g.beginPath(); g.moveTo(0.22, -1.14); g.quadraticCurveTo(0.12, -1.3, 0.24, -1.42); g.quadraticCurveTo(0.36, -1.28, 0.26, -1.14); g.closePath();
      fillInk(g, upx, '#f2b63a', 0.8);
      g.beginPath(); g.arc(-0.02, -0.86, 0.1, 0, TAU); fillInk(g, upx, cu, 0.9);
      break;
    }
    case 'mission': {
      g.beginPath();
      g.moveTo(-0.8, 0.36); g.lineTo(-0.8, -0.3); g.lineTo(-0.3, -0.3);
      g.bezierCurveTo(-0.28, -0.6, -0.14, -0.66, -0.12, -0.84); g.quadraticCurveTo(0, -0.96, 0.12, -0.84);
      g.bezierCurveTo(0.14, -0.66, 0.28, -0.6, 0.3, -0.3); g.lineTo(0.8, -0.3); g.lineTo(0.8, 0.36); g.closePath();
      fillInk(g, upx, '#e6d6b2', 1.1);
      g.beginPath(); g.moveTo(-0.16, 0.36); g.lineTo(-0.16, 0); g.arc(0, 0, 0.16, Math.PI, 0); g.lineTo(0.16, 0.36); g.closePath();
      fillInk(g, upx, '#4a3420', 0.9);
      break;
    }
    case 'gantry': {
      wPoly(g, [-0.8, 0.36, -0.7, 0.2, 0.7, 0.2, 0.8, 0.36]); fillInk(g, upx, '#9aa0a6', 0.9);
      g.strokeStyle = '#c04a32'; g.lineWidth = Math.max(1 / upx, 0.045);
      g.beginPath();
      g.moveTo(-0.58, 0.2); g.lineTo(-0.58, -1.12); g.moveTo(-0.3, 0.2); g.lineTo(-0.3, -1.12);
      for (let y = 0.2; y > -1.0; y -= 0.26) { g.moveTo(-0.58, y); g.lineTo(-0.3, y - 0.26); g.moveTo(-0.58, y - 0.26); g.lineTo(-0.3, y); }
      g.stroke();
      g.beginPath(); g.moveTo(0.1, 0.14); g.lineTo(0.1, -0.84); g.quadraticCurveTo(0.1, -1.14, 0.22, -1.3);
      g.quadraticCurveTo(0.34, -1.14, 0.34, -0.84); g.lineTo(0.34, 0.14); g.closePath();
      fillInk(g, upx, '#f4f1ea', 1);
      g.fillStyle = '#2a2e36'; g.fillRect(0.1, -0.5, 0.24, 0.06);
      g.beginPath(); g.arc(0.22, 0.3, 0.16, 0, TAU); g.fillStyle = 'rgba(240,240,236,.9)'; g.fill();
      break;
    }
    case 'mound': {
      wPoly(g, [-0.92, 0.36, -0.52, -0.38, 0.52, -0.38, 0.92, 0.36]); fillInk(g, upx, '#7f9048', 1.1);
      wPoly(g, [-0.1, 0.36, -0.06, -0.38, 0.06, -0.38, 0.1, 0.36]); g.fillStyle = '#b89a62'; g.fill();
      g.beginPath(); g.rect(-0.3, -0.66, 0.6, 0.28); fillInk(g, upx, '#b0844e', 0.9);
      wPoly(g, [-0.42, -0.62, 0, -1.0, 0.42, -0.62]); fillInk(g, upx, '#c9a860', 0.9);
      break;
    }
    case 'adobe': {
      const blocks = [[-0.86, -0.06, 0.7, 0.42], [-0.6, -0.42, 0.62, 0.36], [-0.34, -0.74, 0.5, 0.32], [-0.16, -0.06, 0.6, 0.42], [0.3, -0.34, 0.58, 0.7]];
      for (const [x, y, w, h] of blocks) { g.beginPath(); g.rect(x, y, w, h); fillInk(g, upx, '#c89466', 1); }
      g.fillStyle = '#3a2618';
      for (const [x, y] of [[-0.7, 0.12], [-0.4, -0.26], [0.02, 0.1], [0.5, -0.16], [-0.18, -0.6]]) g.fillRect(x, y, 0.1, 0.14);
      break;
    }
    case 'ballpark': {
      g.beginPath(); g.ellipse(0, 0, 0.92, 0.42, 0, 0, TAU); fillInk(g, upx, '#9a3e2e', 1.1);
      g.beginPath(); g.ellipse(0, 0.02, 0.74, 0.3, 0, 0, TAU); g.fillStyle = '#3f7a3a'; g.fill();
      wPoly(g, [0, 0.26, -0.24, 0.06, 0, -0.08, 0.24, 0.06]); g.fillStyle = '#c89a62'; g.fill();
      g.beginPath(); g.rect(-0.22, -0.68, 0.44, 0.26); fillInk(g, upx, '#2f5a34', 0.9);
      break;
    }
    case 'brickhall': {
      g.beginPath(); g.rect(-0.9, -0.24, 1.8, 0.6); fillInk(g, upx, '#a5503a', 1);
      g.beginPath(); g.rect(-0.18, -0.62, 0.36, 0.98); fillInk(g, upx, '#a5503a', 1);
      g.beginPath(); g.rect(-0.14, -0.9, 0.28, 0.28); fillInk(g, upx, '#f4f1ea', 0.9);
      wPoly(g, [-0.08, -0.9, 0, -1.36, 0.08, -0.9]); fillInk(g, upx, '#f4f1ea', 0.9);
      break;
    }
    case 'rotunda': {
      g.beginPath(); g.rect(-0.72, -0.25, 1.44, 0.6); fillInk(g, upx, '#ece2cc', 1);
      g.fillStyle = '#cfc0a0';
      for (let c = 0; c < 6; c++) g.fillRect(-0.62 + c * 0.24, -0.18, 0.08, 0.5);
      g.beginPath(); g.moveTo(-0.62, -0.25); g.bezierCurveTo(-0.6, -1.0, 0.6, -1.0, 0.62, -0.25); g.closePath();
      fillInk(g, upx, '#e2d6bc', 1);
      break;
    }
    case 'carved': {
      g.beginPath();
      g.moveTo(-0.95, 0.36); g.lineTo(-0.9, -0.3); g.lineTo(-0.7, -0.62); g.lineTo(-0.3, -0.86); g.lineTo(0.1, -0.9);
      g.lineTo(0.5, -0.76); g.lineTo(0.8, -0.5); g.lineTo(0.95, -0.1); g.lineTo(0.95, 0.36); g.closePath();
      fillInk(g, upx, '#8f959c', 1.1);
      for (const [hx, hy, r] of [[-0.54, -0.42, 0.17], [-0.2, -0.5, 0.18], [0.12, -0.48, 0.16], [0.44, -0.4, 0.16]]) {
        g.beginPath(); g.ellipse(hx, hy, r * 0.8, r, 0, 0, TAU); fillInk(g, upx, '#c6c8c8', 0.9);
      }
      wPine(g, upx, -0.72, 0.42, 0.42); wPine(g, upx, 0.68, 0.44, 0.46);
      break;
    }
    case 'quarter': {
      for (const [x, w, top] of [[-0.46, 0.22, -0.86], [0.24, 0.22, -0.86], [-0.12, 0.24, -0.98]]) {
        g.beginPath(); g.rect(x, top, w, -top - 0.22); fillInk(g, upx, '#e4d8c0', 0.9);
        const tip = top - (x === -0.12 ? 0.4 : 0.32);
        wPoly(g, [x - 0.02, top, x + w / 2, tip, x + w + 0.02, top]); fillInk(g, upx, '#4c5866', 0.9);
      }
      for (const [x, col] of [[-0.9, '#e8b96a'], [-0.3, '#8fb8a8'], [0.3, '#d88a7a']] as [number, string][]) {
        g.beginPath(); g.rect(x, -0.3, 0.6, 0.66); fillInk(g, upx, col, 1);
      }
      break;
    }
    case 'flight': {
      g.beginPath(); g.moveTo(-0.95, 0.36); g.bezierCurveTo(-0.5, -0.3, 0.5, -0.3, 0.95, 0.36); g.closePath(); fillInk(g, upx, '#a8b46a', 1);
      wPoly(g, [-0.5, -0.04, -0.46, -0.6, -0.4, -0.66, -0.34, -0.6, -0.3, -0.04]); fillInk(g, upx, '#e4dccc', 1);
      g.save(); g.translate(0.22, -0.86); g.rotate(-0.22);
      g.beginPath(); g.rect(-0.76, 0.02, 1.52, 0.1); fillInk(g, upx, '#e8d9a8', 1);
      g.beginPath(); g.rect(-0.76, -0.24, 1.52, 0.1); fillInk(g, upx, '#f1e6bf', 1);
      g.restore();
      break;
    }
    case 'spike': {
      g.beginPath(); g.moveTo(-0.95, 0.36); g.bezierCurveTo(-0.5, -0.12, 0.5, -0.12, 0.95, 0.36); g.closePath(); fillInk(g, upx, '#c8b27a', 1);
      g.beginPath(); g.rect(-0.84, -0.3, 0.34, 0.32); fillInk(g, upx, '#3a2e2a', 1);
      g.beginPath(); g.rect(-0.52, -0.2, 0.36, 0.22); fillInk(g, upx, '#2a2a30', 1);
      wPoly(g, [0.28, -1.12, 0.44, -1.12, 0.42, -0.98, 0.39, 0.06, 0.36, 0.14, 0.33, 0.06, 0.3, -0.98]);
      fillInk(g, upx, '#f0c848', 1.1);
      break;
    }
    case 'hall':
    case 'redhall':
    case 'spire': {
      const roof = motif === 'redhall' ? '#8a3a2a' : motif === 'spire' ? '#4a7650' : '#3e6a8a';
      g.beginPath(); g.rect(-0.82, -0.2, 1.3, 0.56); fillInk(g, upx, '#e8dcc2', 1);
      g.fillStyle = '#c8b894';
      for (let c = 0; c < 5; c++) g.fillRect(-0.68 + c * 0.24, -0.08, 0.08, 0.42);
      wPoly(g, [-0.9, -0.18, -0.17, -0.52, 0.56, -0.18]); fillInk(g, upx, '#e8dcc2', 1);
      g.beginPath(); g.moveTo(-0.48, -0.42); g.bezierCurveTo(-0.46, -0.95, 0.12, -0.95, 0.14, -0.42); g.closePath();
      fillInk(g, upx, roof, 1);
      g.beginPath(); g.rect(0.52, -0.82, 0.3, 1.18); fillInk(g, upx, '#e8dcc2', 1);
      wPoly(g, [0.48, -0.8, 0.67, -1.22, 0.86, -0.8]); fillInk(g, upx, roof, 1);
      break;
    }
    case 'obelisk': {
      g.beginPath(); g.rect(-0.85, -0.05, 1.7, 0.4); fillInk(g, upx, '#d8ccb0', 0.9);
      wPoly(g, [-0.14, 0.36, -0.09, -0.98, 0, -1.12, 0.09, -0.98, 0.14, 0.36]); fillInk(g, upx, '#ece2cc', 1.1);
      break;
    }
    case 'peak':
    default: {
      wPoly(g, [-0.92, 0.36, -0.3, -0.85, -0.05, -0.45, 0.2, -1.05, 0.92, 0.36]); fillInk(g, upx, '#7a8494', 1.1);
      wPoly(g, [0.2, -1.05, 0.92, 0.36, 0.3, 0.36, 0.35, -0.4]); g.fillStyle = 'rgba(0,0,0,.18)'; g.fill();
      g.fillStyle = '#f4f6fa';
      g.beginPath();
      g.moveTo(0.2, -1.05); g.lineTo(0.42, -0.62); g.lineTo(0.3, -0.68); g.lineTo(0.18, -0.58); g.lineTo(0.06, -0.7); g.closePath();
      g.moveTo(-0.3, -0.85); g.lineTo(-0.16, -0.58); g.lineTo(-0.28, -0.63); g.lineTo(-0.4, -0.62); g.closePath();
      g.fill();
      wPine(g, upx, -0.62, 0.42, 0.52); wPine(g, upx, 0.6, 0.44, 0.5);
      break;
    }
  }
}

export function drawWonderPlinth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sizePx: number,
  kind: 'natural' | 'academic' | 'heritage',
  motif?: string,
  rank = 99,
  dpr = 2,
) {
  const mo = motif || (kind === 'academic' ? 'hall' : kind === 'natural' ? 'peak' : 'obelisk');
  const top = rank <= 3 ? 1 : 0;
  const baseCol = kind === 'natural' ? '#3f6a34' : kind === 'academic' ? '#2c4a78' : '#6a4a1c';
  stampArt(ctx, `site:wonder:${kind}:${mo}:${top}`, x, y, sizePx, dpr, WONDER_BOX, (g, upx) => {
    g.fillStyle = 'rgba(18,12,4,.35)';
    g.beginPath(); g.ellipse(0, 0.66, 1.05, 0.3, 0, 0, TAU); g.fill();
    // Raised drum plinth
    g.fillStyle = '#5a4a32';
    g.beginPath();
    g.ellipse(0, 0.5, 0.98, 0.34, 0, 0, Math.PI);
    g.lineTo(-0.98, 0.36);
    g.ellipse(0, 0.36, 0.98, 0.34, 0, Math.PI, 0, true);
    g.closePath();
    g.fill(); ink(g, upx, 1);

    g.beginPath(); g.ellipse(0, 0.36, 0.98, 0.34, 0, 0, TAU);
    g.fillStyle = baseCol; g.fill();
    g.lineWidth = Math.max(1.6 / upx, top ? 0.09 : 0.06);
    g.strokeStyle = top ? '#f2d27a' : '#c9a45c';
    g.stroke();

    paintWonderMotif(g, upx, mo);

    if (top) {
      g.beginPath(); starPath(g, 0.82, -1.18, 0.2, 5, 0.45);
      g.fillStyle = '#f2d27a'; g.fill(); ink(g, upx, 0.8, 'rgba(60,40,6,.9)');
    }
  });
}

// --- 5. Trade Route Midpoint Vehicle Medallion (from improvements.js!) --------------------------------------------

export const TRADE_MODE_STYLE: Record<string, { color: string; dash: number[] | null; dots?: string; marker: string }> = {
  truck:    { color: '#ee8a1e', dash: [2.4, 1.1], marker: 'cart' },
  rail:     { color: '#d2402f', dash: [3.2, 0.9], marker: 'rail' },
  water:    { color: '#1f8ad2', dash: [2.4, 1.1], marker: 'boat' },
  air:      { color: '#18a99a', dash: [1.4, 1.2], marker: 'plane' },
  multiple: { color: '#9b4fd0', dash: [2.4, 1.1], marker: 'cart' },
  pipeline: { color: '#3a3430', dash: null, dots: '#f0a830', marker: 'barrel' },
  other:    { color: '#7d7466', dash: [1.6, 1.4], marker: 'cart' },
};

export function drawTradeMarkerSprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  sizePx: number,
  ring = '#c9a45c',
  dpr = 2,
) {
  stampArt(ctx, `imp:mk:${kind}:${ring}`, x, y, sizePx, dpr, { x0: -1.2, y0: -1.2, x1: 1.2, y1: 1.3 }, (g, upx) => {
    g.fillStyle = 'rgba(10,6,2,.35)';
    g.beginPath(); g.arc(0, 0.1, 1.02, 0, TAU); g.fill();
    g.fillStyle = '#2a2016';
    g.beginPath(); g.arc(0, 0, 0.98, 0, TAU); g.fill();
    g.lineWidth = Math.max(1.4 / upx, 0.14);
    g.strokeStyle = ring;
    g.stroke();
    g.fillStyle = '#f3e6c4';
    g.strokeStyle = '#f3e6c4';
    g.lineWidth = Math.max(1 / upx, 0.09);
    g.beginPath();
    if (kind === 'boat') {
      g.moveTo(-0.62, 0.05); g.lineTo(0.62, 0.05); g.lineTo(0.42, 0.38); g.lineTo(-0.45, 0.38); g.closePath(); g.fill();
      g.fillRect(-0.38, -0.28, 0.3, 0.3); g.fillRect(-0.04, -0.28, 0.3, 0.3);
    } else if (kind === 'rail') {
      g.fillRect(-0.62, -0.38, 0.7, 0.62); g.fillRect(0.12, -0.18, 0.5, 0.42);
      g.fillStyle = '#2a2016'; g.fillRect(-0.5, -0.26, 0.24, 0.2);
      g.fillStyle = '#f3e6c4';
      for (const cx of [-0.42, 0, 0.42]) { g.beginPath(); g.arc(cx, 0.36, 0.14, 0, TAU); g.fill(); }
    } else if (kind === 'plane') {
      g.moveTo(0.7, 0); g.lineTo(-0.5, -0.12); g.lineTo(-0.2, -0.62); g.lineTo(-0.38, -0.62); g.lineTo(-0.72, -0.1);
      g.lineTo(-0.72, 0.1); g.lineTo(-0.38, 0.62); g.lineTo(-0.2, 0.62); g.lineTo(-0.5, 0.12); g.closePath(); g.fill();
    } else if (kind === 'barrel') {
      g.ellipse(0, -0.42, 0.4, 0.13, 0, 0, TAU);
      g.moveTo(-0.4, -0.42); g.lineTo(-0.4, 0.42); g.ellipse(0, 0.42, 0.4, 0.13, 0, Math.PI, 0, true); g.lineTo(0.4, -0.42); g.fill();
    } else {
      g.moveTo(-0.62, 0.15); g.lineTo(0.5, 0.15); g.lineTo(0.5, -0.1); g.quadraticCurveTo(-0.06, -0.75, -0.62, -0.1); g.closePath(); g.fill();
      for (const cx of [-0.38, 0.3]) { g.beginPath(); g.arc(cx, 0.38, 0.2, 0, TAU); g.fill(); }
    }
  });
}

// --- 6. Isometric Architectural District Miniatures (for City View) -----------------------------------------------

export function drawDistrictMiniature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  districtId: string,
  scale = 1,
  label?: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(24, 32, 40, 0.28)';
  ctx.beginPath(); ctx.ellipse(0, 8, 17, 7, 0, 0, TAU); ctx.fill();

  ctx.fillStyle = '#F6F0E3';
  ctx.strokeStyle = '#B08234';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 12); ctx.lineTo(16, 4); ctx.lineTo(0, -4); ctx.lineTo(-16, 4); ctx.closePath();
  ctx.fill(); ctx.stroke();

  if (districtId === 'campus') {
    ctx.fillStyle = '#29669C'; ctx.fillRect(-9, -4, 18, 9);
    ctx.fillStyle = '#F7F2E8'; ctx.strokeStyle = '#29669C'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, -4, 9, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#D4A243'; ctx.beginPath(); ctx.arc(0, -14, 2.2, 0, TAU); ctx.fill();
  } else if (districtId === 'foundry') {
    ctx.fillStyle = '#B85636'; ctx.strokeStyle = '#592313'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-11, 5); ctx.lineTo(-11, -5); ctx.lineTo(-4, -1); ctx.lineTo(-4, -5); ctx.lineTo(3, -1); ctx.lineTo(3, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4B433E'; ctx.fillRect(5, -13, 3.5, 18); ctx.fillRect(10, -9, 3, 14);
  } else if (districtId === 'exchange') {
    ctx.fillStyle = '#C69128'; ctx.strokeStyle = '#4D360C'; ctx.lineWidth = 1.2;
    ctx.fillRect(-8, -5, 16, 11); ctx.strokeRect(-8, -5, 16, 11);
    ctx.fillRect(-5.5, -12, 11, 7); ctx.strokeRect(-5.5, -12, 11, 7);
    ctx.fillRect(-2.5, -18, 5, 6);
    ctx.fillStyle = '#FFF3C4'; ctx.fillRect(-4, -10, 2, 3); ctx.fillRect(2, -10, 2, 3);
  } else if (districtId === 'refinery') {
    ctx.fillStyle = '#C97528'; ctx.fillRect(-9, -12, 4, 17); ctx.fillRect(-3, -16, 4, 21);
    ctx.fillStyle = '#E8DFCF'; ctx.strokeStyle = '#6E3C12';
    ctx.beginPath(); ctx.arc(7, 0, 5.5, 0, TAU); ctx.fill(); ctx.stroke();
  } else if (districtId === 'harbor') {
    ctx.fillStyle = '#267A8C'; ctx.fillRect(-10, 1, 20, 4.5);
    ctx.strokeStyle = '#C8523A'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, 1); ctx.lineTo(-4, -13); ctx.lineTo(10, -9); ctx.stroke();
    ctx.fillStyle = '#E5B852'; ctx.fillRect(-9, -3, 5, 4);
  } else if (districtId === 'aerohub') {
    ctx.fillStyle = '#4580B0'; ctx.fillRect(-9, -4, 18, 8);
    ctx.fillStyle = '#F7F2E8'; ctx.fillRect(-3, -15, 6, 11);
    ctx.fillStyle = '#29669C'; ctx.fillRect(-6, -18, 12, 4);
  } else if (districtId === 'medical') {
    ctx.fillStyle = '#F7F2E8'; ctx.strokeStyle = '#317E5E'; ctx.lineWidth = 1.4;
    ctx.fillRect(-9, -9, 18, 14); ctx.strokeRect(-9, -9, 18, 14);
    ctx.fillStyle = '#317E5E'; ctx.fillRect(-1.8, -6.5, 3.6, 9); ctx.fillRect(-4.5, -3.8, 9, 3.6);
  } else if (districtId === 'promenade') {
    ctx.fillStyle = '#93456E';
    ctx.beginPath(); ctx.arc(0, -1, 10, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#E5C068'; ctx.lineWidth = 1.5; ctx.stroke();
  } else if (districtId === 'capitol') {
    ctx.fillStyle = '#EAE2D2'; ctx.strokeStyle = '#5F5548'; ctx.lineWidth = 1.2;
    ctx.fillRect(-10, -3, 20, 8); ctx.strokeRect(-10, -3, 20, 8);
    ctx.beginPath(); ctx.arc(0, -3, 6.5, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = '#5B6B7C'; ctx.strokeStyle = '#E5C068'; ctx.lineWidth = 1.2;
    ctx.beginPath(); starPath(ctx, 0, -2, 10, 5, 0.55); ctx.fill(); ctx.stroke();
  }

  if (label) {
    ctx.font = '700 9.5px "Inter", "PingFang SC", sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(20, 16, 10, 0.92)';
    ctx.strokeStyle = '#C9A252';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-tw / 2 - 5, 13, tw + 10, 14, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F6E7BF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 20);
  }
  ctx.restore();
}
