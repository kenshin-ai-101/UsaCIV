/**
 * High-DPI Canvas2D Overlay Renderer — Reference-Aligned Imperial Cartography + Daylight Atlas
 * Full visual alignment with reference cartography:
 *  - Seamless world-anchored ocean wave & mottle patterns, fog-of-war neighbors, coastal glow, AK/HI brass insets
 *  - Painterly terrain art (forests, wooded hills, rolling hills, multi-peak snow mountains, Colorado Plateau mesas,
 *    Great Basin ranges, cropland patchwork + High Plains center-pivot circles + barns, marshes, desert cacti/dunes, suburbs)
 *  - Bright fresh cerulean lakes (#4092ca) & bank-cased rivers
 *  - Civ-style inner colored state border ribbons (0.62 terrain / 0.45 lens) + dark state borders + gold national border
 *  - Cased Interstates & sleeper railroads (fading to 0.55 alpha under lenses)
 *  - Soft green dotted protected parks (hidden under lenses) & 45° red-brown hatched military ranges
 *  - Pseudo-isometric 3D city skylines, metro sprawl spill & Washington D.C. domed Capitol
 *  - Detailed ports (containers vs coal barges), airports, branch-specific military forts & 52 custom-motif plinth Wonders
 *  - Bevelled circular metallic resource medallions with 2-per-state national overview decluttering & 5-pip sizing
 *  - Mode-colored parchment-haloed FAF5 trade arcs with midpoint vehicle medallions
 *  - Angled antique serif state labels & bevelled bronze/gold Civ city banners with growth chevrons & zoomed yield bar
 */
import type {
  CityRecord,
  LayerToggles,
  Locale,
  MapLayersData,
  MineNode,
  PowerPlantNode,
  ShaleSiteNode,
  StateRecord,
  ThemeMode,
  TradeRouteNode,
  WorldHexData,
  WorldMeta,
} from '../../types/world';
import type { MapBubbleSpec } from '../../store/useAppStore';
import {
  cssRgb,
  hash01,
  luminance255,
  shadeRgb,
  smoothstep,
  type Rgb255,
} from '../../features/lenses/lensConfig';
import { localizeDistrictName } from '../../i18n';
import type { MapCamera } from '../camera';
import { getWorldTopology, HEX_CORNERS_WORLD, type WorldTopology } from '../hexTopology';
import type { BannerHitBox, PointHitItem, RouteHitItem } from '../picking';
import { HEX_DRAW_SCALE } from '../webgl/HexRenderer';
import { drawCityTilesOverlay, drawPainterlyTerrain } from '../sprites/terrainArt';
import {
  drawAirportSprite,
  drawDistrictMiniature,
  drawMilitaryFortSprite,
  drawPortSprite,
  drawResourceMedallion,
  drawTradeMarkerSprite,
  drawWonderPlinth,
  FUEL_COLORS,
  MINE_COLORS,
  TRADE_MODE_STYLE,
} from '../sprites/proceduralSprites';

export interface OverlayRenderContext {
  camera: MapCamera;
  theme: ThemeMode;
  locale: Locale;
  meta: WorldMeta;
  world: WorldHexData;
  cities: CityRecord[];
  states: StateRecord[];
  layers: MapLayersData | null;
  toggles: LayerToggles;
  hasLens: boolean;
  selectedCity: CityRecord | null;
  hoveredHexId: number;
  hoveredRoute?: TradeRouteNode | null;
  advisorFuelFilters: Set<string> | null;
  advisorBubbles: MapBubbleSpec[] | null;
  hoveredBubbleId: string | null;
  showdownCities?: [CityRecord | null, CityRecord | null];
}

export interface OverlayHitResult {
  banners: BannerHitBox[];
  points: PointHitItem[];
  routes: RouteHitItem[];
}

const TAU = Math.PI * 2;
const SERIF_FONT = '"Palatino Linotype", Palatino, "Fraunces", "Book Antiqua", Georgia, serif';
const SANS_FONT = '"Inter", -apple-system, system-ui, sans-serif';

const DISTRICT_GLYPH_COLORS: Record<string, string> = {
  campus: '#4EA0E8',
  foundry: '#E07D4F',
  exchange: '#E8BC52',
  refinery: '#DF8B3C',
  harbor: '#3DAAC2',
  aerohub: '#6BA9E0',
  medical: '#4EC291',
  promenade: '#CF74AD',
  capitol: '#C8B99B',
  bastion: '#92A5B8',
};

function drawHexOutline(ctx: CanvasRenderingContext2D, sx: number, sy: number, rPx: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const px = sx + Math.cos(a) * rPx;
    const py = sy - Math.sin(a) * rPx;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// --- Cached Seamless Ocean Wave, Mottle & Military 45° Hatch Patterns ---------------------------------------------

let oceanPatterns: {
  theme: ThemeMode;
  waves: CanvasPattern | null;
  mottle: CanvasPattern | null;
} | null = null;

function getOceanPatterns(ctx: CanvasRenderingContext2D, theme: ThemeMode) {
  if (oceanPatterns && oceanPatterns.theme === theme) return oceanPatterns;
  const isMid = theme === 'midnight';

  // 128px seamless wave crest tile (exact water.js makeWaveTile)
  const wSize = 128;
  const wCv = document.createElement('canvas');
  wCv.width = wSize;
  wCv.height = wSize;
  const wg = wCv.getContext('2d')!;
  wg.lineCap = 'round';
  wg.lineJoin = 'round';
  const marks = [];
  for (let k = 0; k < 15; k++) {
    marks.push({
      x: hash01(k, 41) * wSize,
      y: hash01(k, 42) * wSize,
      len: 6 + hash01(k, 43) * 9,
      a: 0.08 + hash01(k, 44) * 0.09,
      kind: hash01(k, 45) < 0.35 ? 2 : hash01(k, 45) < 0.7 ? 1 : 0,
    });
  }
  const crest = (x: number, y: number, len: number) => {
    wg.moveTo(x - len, y + len * 0.12);
    wg.quadraticCurveTo(x, y - len * 0.38, x + len, y + len * 0.12);
  };
  const hump = (x: number, y: number, len: number) => {
    wg.moveTo(x - len, y);
    wg.quadraticCurveTo(x - len / 2, y - len * 0.36, x, y);
    wg.quadraticCurveTo(x + len / 2, y - len * 0.36, x + len, y);
  };
  for (const pass of [0, 1]) {
    for (const m of marks) {
      wg.beginPath();
      for (const ox of [-wSize, 0, wSize]) {
        for (const oy of [-wSize, 0, wSize]) {
          const x = m.x + ox;
          const y = m.y + oy + (pass ? 0 : 1.1);
          if (m.kind === 1) hump(x, y, m.len * 0.75);
          else crest(x, y, m.len * 0.6);
          if (m.kind === 2) crest(x + m.len * 0.35, y + m.len * 0.55, m.len * 0.42);
        }
      }
      wg.strokeStyle = isMid
        ? pass
          ? `rgba(196,230,252,${m.a})`
          : `rgba(4,22,40,${m.a * 0.9})`
        : pass
          ? `rgba(255,255,255,${m.a * 1.4})`
          : `rgba(45,86,112,${m.a})`;
      wg.lineWidth = pass ? 1 : 1.2;
      wg.stroke();
    }
  }

  // 211px seamless water mottle tile
  const mSize = 211;
  const mCv = document.createElement('canvas');
  mCv.width = mSize;
  mCv.height = mSize;
  const mg = mCv.getContext('2d')!;
  for (let k = 0; k < 14; k++) {
    const x = hash01(k, 71) * mSize;
    const y = hash01(k, 72) * mSize;
    const r = 26 + hash01(k, 73) * 46;
    const light = hash01(k, 74) < 0.5;
    const a = 0.03 + hash01(k, 75) * 0.035;
    for (const ox of [-mSize, 0, mSize]) {
      for (const oy of [-mSize, 0, mSize]) {
        const cx = x + ox;
        const cy = y + oy;
        if (cx + r < 0 || cy + r < 0 || cx - r > mSize || cy - r > mSize) continue;
        const gr = mg.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, light ? `rgba(120,190,230,${a})` : `rgba(0,10,25,${a * 1.4})`);
        gr.addColorStop(1, light ? 'rgba(120,190,230,0)' : 'rgba(0,10,25,0)');
        mg.fillStyle = gr;
        mg.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      }
    }
  }

  oceanPatterns = {
    theme,
    waves: ctx.createPattern(wCv, 'repeat'),
    mottle: ctx.createPattern(mCv, 'repeat'),
  };
  return oceanPatterns;
}

let hatchPatternCache: CanvasPattern | null = null;
function getMilitaryHatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (hatchPatternCache) return hatchPatternCache;
  const n = 10;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const g = cv.getContext('2d')!;
  g.strokeStyle = 'rgba(128,32,20,.58)';
  g.lineWidth = 1.6;
  g.lineCap = 'butt';
  for (const o of [-n, 0, n]) {
    g.beginPath();
    g.moveTo(o, n);
    g.lineTo(o + n, 0);
    g.stroke();
  }
  hatchPatternCache = ctx.createPattern(cv, 'repeat');
  return hatchPatternCache;
}

// --- Backdrop Sea Renderer ----------------------------------------------------------------------------------------

export function renderBackdropSea(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  meta: WorldMeta,
  layers: MapLayersData | null,
  theme: ThemeMode,
  locale: Locale = 'zh',
) {
  const { width: w, height: h, scale } = camera;
  const isMid = theme === 'midnight';

  // 1. Deep reference ocean gradient (#0d2a47 -> #1b4266 in midnight)
  const grad = ctx.createRadialGradient(w * 0.48, h * 0.46, 60, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
  if (isMid) {
    grad.addColorStop(0, '#1e4a70');
    grad.addColorStop(0.55, '#153452');
    grad.addColorStop(1, '#0d2a47');
  } else {
    grad.addColorStop(0, '#DAE8EE');
    grad.addColorStop(0.55, '#BFD4DF');
    grad.addColorStop(1, '#9CB9C9');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 2. Seamless world-anchored ocean mottle + wave crests
  ctx.save();
  const pats = getOceanPatterns(ctx, theme);
  const [ox, oy] = camera.worldToScreen(0, 0);
  const patMat = new DOMMatrix([1, 0, 0, 1, ox, oy]);
  if (pats.mottle) {
    pats.mottle.setTransform(patMat);
    ctx.fillStyle = pats.mottle;
    ctx.fillRect(0, 0, w, h);
  }
  if (pats.waves) {
    pats.waves.setTransform(patMat);
    ctx.globalAlpha = scale * 25 < 6 ? 0.6 : scale * 25 < 10 ? 0.78 : 1;
    ctx.fillStyle = pats.waves;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // 3. Darkened fog-of-war neighboring countries (Canada, Mexico, Cuba, Bahamas)
  if (layers?.neighbor_land) {
    ctx.fillStyle = isMid ? 'rgba(54, 68, 66, 0.78)' : 'rgba(176, 186, 178, 0.48)';
    ctx.strokeStyle = isMid ? 'rgba(140, 186, 206, 0.28)' : 'rgba(92, 112, 118, 0.34)';
    ctx.lineWidth = 1.1;
    for (const poly of layers.neighbor_land) {
      ctx.beginPath();
      poly.forEach(([px, py], i) => {
        const [sx, sy] = camera.worldToScreen(px, py);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // 4. Coastal shallow turquoise shelf & gentle surf foam halo around U.S. landmass
  if (layers?.state_borders && isMid) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const path = new Path2D();
    for (const sb of layers.state_borders) {
      sb.pts.forEach(([px, py], i) => {
        const [sx, sy] = camera.worldToScreen(px, py);
        i === 0 ? path.moveTo(sx, sy) : path.lineTo(sx, sy);
      });
    }
    ctx.strokeStyle = 'rgba(38, 128, 182, 0.44)';
    ctx.lineWidth = Math.max(24, scale * 96);
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(78, 178, 224, 0.38)';
    ctx.lineWidth = Math.max(11, scale * 44);
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(218, 242, 252, 0.32)';
    ctx.lineWidth = Math.max(3, scale * 11);
    ctx.stroke(path);
    ctx.restore();
  }

  // 5. Brass-Framed Cartographic Inset Boxes for Alaska & Hawaii
  for (const code of ['AK', 'HI'] as const) {
    const ins = meta.insets?.[code];
    if (!ins) continue;
    const [bx0, by0, bx1, by1] = ins.box;
    const [sx0, sy1] = camera.worldToScreen(bx0, by0);
    const [sx1, sy0] = camera.worldToScreen(bx1, by1);
    const bw = sx1 - sx0;
    const bh = sy1 - sy0;
    if (bw < 24 || bh < 24) continue;

    ctx.fillStyle = isMid ? 'rgba(13, 36, 60, 0.88)' : 'rgba(232, 240, 243, 0.62)';
    ctx.beginPath();
    ctx.roundRect(sx0, sy0, bw, bh, 8);
    ctx.fill();

    ctx.strokeStyle = isMid ? '#C9A252' : '#A87D34';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = isMid ? 'rgba(201,162,82,0.28)' : 'rgba(168,125,52,0.34)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(sx0 + 3.5, sy0 + 3.5, bw - 7, bh - 7);

    const title =
      locale === 'en'
        ? code === 'AK' ? 'ALASKA (0.35×)' : 'HAWAII (1.0×)'
        : code === 'AK' ? 'ALASKA · 阿拉斯加 (0.35×)' : 'HAWAII · 夏威夷 (1.0×)';
    ctx.font = '700 9.5px "Inter", "PingFang SC", sans-serif';
    const tw = ctx.measureText(title).width;
    ctx.fillStyle = isMid ? '#131E2B' : '#F6F1E7';
    ctx.strokeStyle = isMid ? '#C9A252' : '#A87D34';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(sx0 + 8, sy0 - 9, tw + 14, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isMid ? '#E8C574' : '#5A431E';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, sx0 + 15, sy0 - 0.5);
  }
  ctx.restore();
}

// --- National Overview Resource Decluttering (Exact Reference overviewItems Algorithm!) ---------------------------

interface UnifiedResource {
  kind: 'power' | 'mine' | 'shale';
  typeId: string;
  state: string;
  hexId: number;
  x: number;
  y: number;
  val: number;
  norm: number;
  bgColor?: string;
  plant?: PowerPlantNode;
  mine?: MineNode;
  shale?: ShaleSiteNode;
}

const zoneEdgesCache = new WeakMap<MapLayersData, { prot: Float32Array; rest: Float32Array }>();

function getZoneOuterEdges(world: WorldHexData, topo: WorldTopology, layers: MapLayersData) {
  const hit = zoneEdgesCache.get(layers);
  if (hit) return hit;
  const extract = (ids: number[]): Float32Array => {
    const set = new Set<number>(ids);
    const out: number[] = [];
    for (const i of ids) {
      if (i < 0 || i >= world.n) continue;
      const cx = world.x[i];
      const cy = world.y[i];
      const r = world.r[i] * HEX_DRAW_SCALE;
      for (let d = 0; d < 6; d++) {
        const nb = topo.neighbors[i * 6 + d];
        if (nb >= 0 && set.has(nb)) continue;
        const c0 = HEX_CORNERS_WORLD[d];
        const c1 = HEX_CORNERS_WORLD[(d + 1) % 6];
        out.push(cx + c0[0] * r, cy + c0[1] * r, cx + c1[0] * r, cy + c1[1] * r);
      }
    }
    return new Float32Array(out);
  };
  const res = {
    prot: extract(layers.protected_hex_ids),
    rest: extract(layers.restricted_hex_ids),
  };
  zoneEdgesCache.set(layers, res);
  return res;
}

const resourceCache = new WeakMap<MapLayersData, { all: UnifiedResource[]; overview: UnifiedResource[] }>();

function getPreparedResources(layers: MapLayersData): { all: UnifiedResource[]; overview: UnifiedResource[] } {
  const hit = resourceCache.get(layers);
  if (hit) return hit;

  const all: UnifiedResource[] = [];
  const maxByType = new Map<string, number>();

  for (const pl of layers.power_plants) {
    maxByType.set(pl.fuel, Math.max(maxByType.get(pl.fuel) ?? 1, pl.mw));
  }
  for (const m of layers.mines) {
    maxByType.set(m.commodity, Math.max(maxByType.get(m.commodity) ?? 1, m.metric));
  }
  for (const sh of layers.shale_sites ?? []) {
    const t = sh.kind === 'oil' ? 'oil' : 'gas';
    maxByType.set(t, Math.max(maxByType.get(t) ?? 1, sh.area_km2 || 1));
  }

  for (const pl of layers.power_plants) {
    const mx = maxByType.get(pl.fuel) ?? 1;
    all.push({
      kind: 'power',
      typeId: pl.fuel,
      state: pl.state,
      hexId: pl.hex_id,
      x: pl.x,
      y: pl.y,
      val: pl.mw,
      norm: Math.sqrt(Math.max(0, pl.mw) / mx),
      bgColor: FUEL_COLORS[pl.fuel]?.fill,
      plant: pl,
    });
  }
  for (const m of layers.mines) {
    const mx = maxByType.get(m.commodity) ?? 1;
    all.push({
      kind: 'mine',
      typeId: m.commodity,
      state: m.state,
      hexId: m.hex_id,
      x: m.x,
      y: m.y,
      val: m.metric,
      norm: Math.sqrt(Math.max(0, m.metric) / mx),
      bgColor: MINE_COLORS[m.commodity]?.top,
      mine: m,
    });
  }
  for (const sh of layers.shale_sites ?? []) {
    const t = sh.kind === 'oil' ? 'oil' : 'gas';
    const mx = maxByType.get(t) ?? 1;
    all.push({
      kind: 'shale',
      typeId: t,
      state: sh.state,
      hexId: sh.hex_id,
      x: sh.x,
      y: sh.y,
      val: sh.area_km2 || 1,
      norm: Math.sqrt(Math.max(0, sh.area_km2 || 1) / mx),
      shale: sh,
    });
  }

  // Exact reference overviewItems(): per state, best site of each type, then pick up to 2 distinct types
  // discounting types already chosen often elsewhere by 0.8^count so national view shows rich diversity!
  const byState = new Map<string, Map<string, UnifiedResource>>();
  for (const it of all) {
    if (!it.state) continue;
    let stMap = byState.get(it.state);
    if (!stMap) {
      stMap = new Map();
      byState.set(it.state, stMap);
    }
    const prev = stMap.get(it.typeId);
    if (!prev || it.norm > prev.norm) stMap.set(it.typeId, it);
  }

  const usedTypes = new Map<string, number>();
  const usedHex = new Set<number>();
  const overview: UnifiedResource[] = [];
  const stateKeys = [...byState.keys()].sort();
  for (let round = 0; round < 2; round++) {
    for (const st of stateKeys) {
      const m = byState.get(st)!;
      let best: UnifiedResource | null = null;
      let bestScore = 0.02;
      for (const it of m.values()) {
        if (usedHex.has(it.hexId)) continue;
        const sc = it.norm * Math.pow(0.8, usedTypes.get(it.typeId) ?? 0);
        if (sc > bestScore) {
          bestScore = sc;
          best = it;
        }
      }
      if (!best) continue;
      overview.push(best);
      usedHex.add(best.hexId);
      m.delete(best.typeId);
      usedTypes.set(best.typeId, (usedTypes.get(best.typeId) ?? 0) + 1);
    }
  }
  overview.sort((a, b) => b.norm - a.norm);
  all.sort((a, b) => b.norm - a.norm);

  const res = { all, overview };
  resourceCache.set(layers, res);
  return res;
}

// --- Tiny City Banner Helpers (Exact Bevelled Bronze/Gold Frame + Growth Chevron!) --------------------------------

function drawMiniDistrictIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, districtId: string | null) {
  const col = (districtId && DISTRICT_GLYPH_COLORS[districtId]) || '#D4AE5E';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#19140d';
  ctx.strokeStyle = '#c9a45c';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, 7.0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.1;
  if (districtId === 'campus') {
    ctx.beginPath();
    ctx.arc(0, 1.5, 3.5, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-3.5, 1.5, 7, 1.8);
  } else if (districtId === 'foundry') {
    ctx.beginPath();
    ctx.moveTo(-3.8, 2.8); ctx.lineTo(-3.8, -1); ctx.lineTo(-1, 1); ctx.lineTo(-1, -1); ctx.lineTo(1.8, 1); ctx.lineTo(1.8, 2.8);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(2, -3.5, 1.6, 6.3);
  } else if (districtId === 'exchange') {
    ctx.fillRect(-3.4, -1, 6.8, 4);
    ctx.fillRect(-2, -3.5, 4, 2.5);
  } else if (districtId === 'harbor') {
    ctx.beginPath();
    ctx.moveTo(0, -3.4); ctx.lineTo(0, 3);
    ctx.arc(0, 0.8, 2.9, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (districtId === 'aerohub') {
    ctx.beginPath();
    ctx.moveTo(0, -3.6); ctx.lineTo(3.5, 1.3); ctx.lineTo(0, 0.2); ctx.lineTo(-3.5, 1.3); ctx.closePath();
    ctx.fill();
  } else if (districtId === 'medical') {
    ctx.fillRect(-1.1, -3.4, 2.2, 6.8);
    ctx.fillRect(-3.4, -1.1, 6.8, 2.2);
  } else if (districtId === 'bastion') {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (TAU * i) / 5 - Math.PI / 2;
      i === 0 ? ctx.moveTo(Math.cos(a) * 3.6, Math.sin(a) * 3.6) : ctx.lineTo(Math.cos(a) * 3.6, Math.sin(a) * 3.6);
    }
    ctx.closePath(); ctx.fill();
  } else if (districtId === 'promenade') {
    // 5-point cultural star / theater emblem
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (TAU * i) / 10 - Math.PI / 2;
      const rr = i % 2 === 0 ? 3.8 : 1.7;
      i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  } else if (districtId === 'refinery') {
    // Oil derrick / flame emblem
    ctx.beginPath();
    ctx.moveTo(0, -3.7);
    ctx.quadraticCurveTo(3.1, -0.3, 2.5, 2.2);
    ctx.quadraticCurveTo(0, 3.8, -2.5, 2.2);
    ctx.quadraticCurveTo(-3.1, -0.3, 0, -3.7);
    ctx.closePath();
    ctx.fill();
  } else if (districtId === 'capitol') {
    // Capitol dome emblem
    ctx.beginPath();
    ctx.arc(0, 0.5, 3.0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-3.8, 0.8, 7.6, 2.2);
    ctx.fillRect(-0.6, -4.0, 1.2, 2.0);
  } else {
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawGrowthChevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, g: number) {
  const flat = Math.abs(g) < 0.005;
  const fast = Math.abs(g) >= 0.05;
  const up = g >= 0;
  ctx.beginPath();
  if (flat) {
    const d = s * 0.35;
    ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.closePath();
  } else {
    const hw = s * 0.5;
    const h = s * (fast ? 0.42 : 0.6);
    const t = h * 0.55;
    const dir = up ? -1 : 1;
    const one = (oy: number) => {
      const Y = (v: number) => cy + oy + dir * (h * 0.5 - v);
      ctx.moveTo(cx, Y(0));
      ctx.lineTo(cx + hw, Y(h - t));
      ctx.lineTo(cx + hw, Y(h));
      ctx.lineTo(cx, Y(t));
      ctx.lineTo(cx - hw, Y(h));
      ctx.lineTo(cx - hw, Y(h - t));
      ctx.closePath();
    };
    if (fast) { one(-h * 0.52); one(h * 0.52); } else one(0);
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(10,8,4,0.82)';
  ctx.stroke();
  ctx.fillStyle = flat ? '#e8dcb4' : up ? '#8ff07c' : '#ff8a72';
  ctx.fill();
}

function compactNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1000)}K`;
  return String(Math.round(v));
}

// --- Main Foreground Map Overlay Renderer -------------------------------------------------------------------------

export function renderMapOverlay(ctx: CanvasRenderingContext2D, rc: OverlayRenderContext): OverlayHitResult {
  const {
    camera,
    theme,
    world,
    cities,
    states,
    layers,
    toggles,
    hasLens,
    selectedCity,
    hoveredHexId,
    hoveredRoute,
    advisorFuelFilters,
    advisorBubbles,
    hoveredBubbleId,
    showdownCities,
  } = rc;
  const { width: w, height: h, scale } = camera;
  const isMid = theme === 'midnight';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const Rpx = 25 * scale;
  const topo = getWorldTopology(world, states, cities);

  ctx.clearRect(0, 0, w, h);
  const banners: BannerHitBox[] = [];
  const points: PointHitItem[] = [];
  const routeHits: RouteHitItem[] = [];

  const drawPolylineList = (lines: [number, number][][], stroke: string, lw: number, dash?: number[], cap: CanvasLineCap = 'round') => {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineCap = cap;
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (ln.length < 2) continue;
      for (let j = 0; j < ln.length; j++) {
        const [sx, sy] = camera.worldToScreen(ln[j][0], ln[j][1]);
        j === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  // Z-40: Painterly Terrain Sprites (forests, mountains, snow peaks, mesas, hills, cropland, pivots, barns, marshes, cacti, suburbs!)
  if (!hasLens && !advisorBubbles) {
    drawPainterlyTerrain(ctx, camera, world, topo, dpr);
  }

  if (layers) {
    // Z-48: Bright Fresh Cerulean Great Lakes (#4092ca) & Bank-Cased Rivers
    ctx.save();
    const lakePath = new Path2D();
    for (const lk of layers.lakes) {
      lk.pts.forEach(([x, y], i) => {
        const [sx, sy] = camera.worldToScreen(x, y);
        i === 0 ? lakePath.moveTo(sx, sy) : lakePath.lineTo(sx, sy);
      });
      lakePath.closePath();
    }
    ctx.fillStyle = isMid ? '#4092ca' : '#7BAFC9';
    ctx.fill(lakePath);
    if (isMid) {
      const pats = getOceanPatterns(ctx, theme);
      if (pats.waves) {
        ctx.save();
        ctx.clip(lakePath);
        const [ox, oy] = camera.worldToScreen(0, 0);
        pats.waves.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = pats.waves;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
    ctx.strokeStyle = isMid ? 'rgba(190, 232, 250, 0.55)' : 'rgba(72, 114, 140, 0.65)';
    ctx.lineWidth = 1.1;
    ctx.stroke(lakePath);
    ctx.restore();

    // Bank-cased cerulean rivers (dark outer bank + bright blue river + specular center line when zoomed)
    const rivW = Math.max(1.2, Math.min(3.2, scale * 3.8));
    drawPolylineList(layers.rivers, isMid ? 'rgba(14, 36, 56, 0.52)' : 'rgba(34, 72, 98, 0.35)', rivW + 1.3);
    drawPolylineList(layers.rivers, isMid ? '#469ad4' : '#4a8cb8', rivW);
    if (Rpx >= 12) {
      drawPolylineList(layers.rivers, 'rgba(195, 234, 255, 0.42)', Math.max(0.6, rivW * 0.32));
    }

    // Z-50: Civ-Style Inner Colored State Border Ribbons + Dark State Lines + Gold National Border!
    if (toggles.borders) {
      ctx.save();
      const bandAlpha = hasLens ? 0.44 : 0.62;
      for (const [sf, arr] of topo.stateBands) {
        const rgb = topo.stateColorByFips.get(sf);
        if (!rgb) continue;
        ctx.beginPath();
        for (let k = 0; k < arr.length; k += 8) {
          const [x0, y0] = camera.worldToScreen(arr[k], arr[k + 1]);
          const [x1, y1] = camera.worldToScreen(arr[k + 2], arr[k + 3]);
          const [x2, y2] = camera.worldToScreen(arr[k + 4], arr[k + 5]);
          const [x3, y3] = camera.worldToScreen(arr[k + 6], arr[k + 7]);
          if (Math.max(x0, x1, x2, x3) < -20 || Math.min(x0, x1, x2, x3) > w + 20 || Math.max(y0, y1, y2, y3) < -20 || Math.min(y0, y1, y2, y3) > h + 20) continue;
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
        }
        ctx.fillStyle = cssRgb(rgb, bandAlpha);
        ctx.fill();
      }
      // Crisp dark state boundary lines (exact map.js rgba(15,10,5,.55))
      ctx.beginPath();
      const se = topo.stateEdgeLines;
      for (let k = 0; k < se.length; k += 4) {
        const [x0, y0] = camera.worldToScreen(se[k], se[k + 1]);
        const [x1, y1] = camera.worldToScreen(se[k + 2], se[k + 3]);
        if (Math.max(x0, x1) < -10 || Math.min(x0, x1) > w + 10 || Math.max(y0, y1) < -10 || Math.min(y0, y1) > h + 10) continue;
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.strokeStyle = isMid ? 'rgba(15,10,5,0.58)' : 'rgba(42,36,28,0.45)';
      ctx.lineWidth = Math.max(0.85, Math.min(2.1, Rpx * 0.085));
      ctx.lineCap = 'round';
      ctx.stroke();

      // Warm gold outer national/coast border lines
      ctx.beginPath();
      const oe = topo.outerEdgeLines;
      for (let k = 0; k < oe.length; k += 4) {
        const [x0, y0] = camera.worldToScreen(oe[k], oe[k + 1]);
        const [x1, y1] = camera.worldToScreen(oe[k + 2], oe[k + 3]);
        if (Math.max(x0, x1) < -10 || Math.min(x0, x1) > w + 10 || Math.max(y0, y1) < -10 || Math.min(y0, y1) > h + 10) continue;
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.strokeStyle = isMid ? 'rgba(255,232,160,0.68)' : 'rgba(92,72,38,0.52)';
      ctx.lineWidth = Math.max(1.0, Math.min(2.4, Rpx * 0.095));
      ctx.stroke();
      ctx.restore();
    }

    // Z-55/56: Cased Interstates & Sleeper Railroads (auto-faded to 0.55 under any lens!)
    const infraAlpha = hasLens ? 0.55 : 1.0;
    if (toggles.roads && Rpx >= 9.5) {
      ctx.save();
      ctx.globalAlpha = infraAlpha * Math.min(1, (Rpx - 9.5) / 4 + 0.55);
      const interW = Math.max(1.7, Math.min(7.5, Rpx * 0.095));
      if (Rpx >= 17) {
        const majW = Math.max(1.1, Math.min(4.8, Rpx * 0.06));
        drawPolylineList(layers.roads_secondary, 'rgba(74,56,34,0.55)', majW + 1.3);
        drawPolylineList(layers.roads_secondary, '#c9ab78', majW);
      }
      drawPolylineList(layers.roads_primary, 'rgba(52,40,26,0.82)', interW + 2.1);
      drawPolylineList(layers.roads_primary, '#a98f63', interW + 0.7);
      drawPolylineList(layers.roads_primary, '#e6d6ad', interW);
      ctx.restore();
    }
    if (toggles.rail && Rpx >= 9.5) {
      ctx.save();
      ctx.globalAlpha = infraAlpha * Math.min(1, (Rpx - 9.5) / 4 + 0.55);
      const tie = Math.max(2.6, Math.min(7.5, Rpx * 0.1));
      const steel = Math.max(0.9, Math.min(2.2, Rpx * 0.022));
      drawPolylineList(layers.rail_main, Rpx >= 16 ? 'rgba(168,154,132,0.55)' : 'rgba(226,214,190,0.48)', Rpx >= 16 ? tie + 1 : steel + 2.4);
      if (Rpx >= 16) {
        const gap = Math.max(2.2, Math.min(5.5, Rpx * 0.06));
        drawPolylineList(layers.rail_main, '#4a3424', tie, [Math.max(1, gap * 0.45), gap], 'butt');
      }
      drawPolylineList(layers.rail_main, '#2a2522', steel + (Rpx >= 16 ? 0 : 0.4));
      ctx.restore();
    }

    // Z-57: Protected National Parks (hidden under lenses; soft green wash + pale dotted OUTER perimeter!)
    const zoneEdges = getZoneOuterEdges(world, topo, layers);
    if (toggles.wonders && !hasLens && layers.protected_hex_ids.length > 0) {
      ctx.save();
      const protFill = new Path2D();
      for (const hid of layers.protected_hex_ids) {
        const [sx, sy] = camera.worldToScreen(world.x[hid], world.y[hid]);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        const rP = world.r[hid] * scale * HEX_DRAW_SCALE;
        for (let k = 0; k < 6; k++) {
          const a = ((60 * k - 30) * Math.PI) / 180;
          const px = sx + Math.cos(a) * rP;
          const py = sy - Math.sin(a) * rP;
          k === 0 ? protFill.moveTo(px, py) : protFill.lineTo(px, py);
        }
        protFill.closePath();
      }
      ctx.fillStyle = 'rgba(90,170,90,0.15)';
      ctx.fill(protFill);

      const protEdge = new Path2D();
      const pe = zoneEdges.prot;
      for (let i = 0; i < pe.length; i += 4) {
        const [x0, y0] = camera.worldToScreen(pe[i], pe[i + 1]);
        const [x1, y1] = camera.worldToScreen(pe[i + 2], pe[i + 3]);
        if (Math.max(x0, x1) < -20 || Math.min(x0, x1) > w + 20 || Math.max(y0, y1) < -20 || Math.min(y0, y1) > h + 20) continue;
        protEdge.moveTo(x0, y0);
        protEdge.lineTo(x1, y1);
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(10,40,10,0.35)';
      ctx.lineWidth = Math.max(1.4, Math.min(3.0, Rpx * 0.09));
      ctx.stroke(protEdge);
      ctx.strokeStyle = 'rgba(170,230,150,0.9)';
      ctx.lineWidth = Math.max(1.6, Math.min(3.0, Rpx * 0.08));
      ctx.setLineDash([0.3, 4.0]);
      ctx.stroke(protEdge);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Z-58: Restricted Military Ranges (45° diagonal red-brown hatch + dashed OUTER perimeter only!)
    if (toggles.military && layers.restricted_hex_ids.length > 0) {
      ctx.save();
      const restFill = new Path2D();
      for (const hid of layers.restricted_hex_ids) {
        const [sx, sy] = camera.worldToScreen(world.x[hid], world.y[hid]);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        const rP = world.r[hid] * scale * HEX_DRAW_SCALE;
        for (let k = 0; k < 6; k++) {
          const a = ((60 * k - 30) * Math.PI) / 180;
          const px = sx + Math.cos(a) * rP;
          const py = sy - Math.sin(a) * rP;
          k === 0 ? restFill.moveTo(px, py) : restFill.lineTo(px, py);
        }
        restFill.closePath();
      }
      ctx.fillStyle = 'rgba(150,60,40,0.12)';
      ctx.fill(restFill);
      if (Rpx >= 5) {
        const hatch = getMilitaryHatchPattern(ctx);
        if (hatch) {
          ctx.fillStyle = hatch;
          ctx.fill(restFill);
        }
      }

      const restEdge = new Path2D();
      const re = zoneEdges.rest;
      for (let i = 0; i < re.length; i += 4) {
        const [x0, y0] = camera.worldToScreen(re[i], re[i + 1]);
        const [x1, y1] = camera.worldToScreen(re[i + 2], re[i + 3]);
        if (Math.max(x0, x1) < -20 || Math.min(x0, x1) > w + 20 || Math.max(y0, y1) < -20 || Math.min(y0, y1) > h + 20) continue;
        restEdge.moveTo(x0, y0);
        restEdge.lineTo(x1, y1);
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(40,10,6,0.45)';
      ctx.lineWidth = Math.max(1.5, Math.min(3.2, Rpx * 0.095));
      ctx.stroke(restEdge);
      ctx.strokeStyle = 'rgba(214,92,62,0.9)';
      ctx.lineWidth = Math.max(1.0, Math.min(2.1, Rpx * 0.06));
      ctx.setLineDash([5, 3.5]);
      ctx.stroke(restEdge);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Z-60: Pseudo-Isometric 3D City Tiles & Washington D.C. Domed Capitol!
    if (!advisorBubbles) {
      drawCityTilesOverlay(ctx, camera, world, topo, dpr);
    }

    // Z-65: Detailed Maritime Ports & FAA Airports (greedy decluttered!)
    if (toggles.hubs && !advisorBubbles && Rpx >= 9.5) {
      const keptHubs: [number, number, number][] = [];
      const hubFree = (x: number, y: number, r: number) =>
        keptHubs.every(([kx, ky, kr]) => (kx - x) ** 2 + (ky - y) ** 2 >= ((kr + r) * 0.65) ** 2);

      for (const p of layers.ports) {
        const minR = (p.rank ?? 99) <= 12 ? 9.5 : (p.rank ?? 99) <= 50 ? 20 : 38;
        if (Rpx < minR) continue;
        const [sx, sy] = camera.worldToScreen(p.x, p.y);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        const tier = p.tons >= 1e8 ? 0 : p.tons >= 2.5e7 ? 1 : 2;
        const sz = Math.max(14, Math.min([62, 54, 46][tier], Rpx * [1.0, 0.86, 0.74][tier]));
        if (!hubFree(sx, sy, sz * 0.5)) continue;
        keptHubs.push([sx, sy, sz * 0.5]);
        drawPortSprite(ctx, sx, sy, sz, p.tons, p.port_type || 'coastal', dpr);
        points.push({ item: { kind: 'port', port: p }, sx, sy, radiusPx: sz * 0.55 });
      }

      for (const a of layers.airports) {
        const tier = a.hub === 'L' ? 0 : a.hub === 'M' ? 1 : a.hub === 'S' ? 2 : a.hub === 'N' ? 3 : 4;
        const minR = [9.5, 14, 21, 34, 34][tier];
        if (Rpx < minR) continue;
        const [sx, sy] = camera.worldToScreen(a.x, a.y);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        const sz = Math.max(13, Math.min([58, 50, 44, 38, 38][tier], Rpx * [1.0, 0.86, 0.74, 0.64, 0.64][tier]));
        if (!hubFree(sx, sy, sz * 0.5)) continue;
        keptHubs.push([sx, sy, sz * 0.5]);
        drawAirportSprite(ctx, sx, sy, sz, a.hub, Rpx >= 24 ? a.code : undefined, dpr);
        points.push({ item: { kind: 'airport', airport: a }, sx, sy, radiusPx: sz * 0.55 });
      }
    }

    // Z-66: Branch-Specific DoD Military Forts
    if (toggles.military && !advisorBubbles && Rpx >= 7.5) {
      const keptForts: [number, number, number][] = [];
      for (const b of layers.military_bases) {
        const tier = b.tier || 'base';
        const minR = tier === 'major' ? 7.5 : tier === 'base' ? 20 : 38;
        if (Rpx < minR) continue;
        const [sx, sy] = camera.worldToScreen(b.x, b.y);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        const sz = Math.max(13, Math.min(tier === 'major' ? 62 : 48, Rpx * (tier === 'major' ? 1.0 : tier === 'base' ? 0.8 : 0.64)));
        const r = sz * 0.5;
        if (!keptForts.every(([kx, ky, kr]) => (kx - sx) ** 2 + (ky - sy) ** 2 >= ((kr + r) * 0.62) ** 2)) continue;
        keptForts.push([sx, sy, r]);
        drawMilitaryFortSprite(ctx, sx, sy, sz, b.component, {
          tier,
          joint: !!b.joint,
          airfield: !!b.airfield,
          muted: !!b.status && b.status !== 'act',
        }, dpr);
        points.push({ item: { kind: 'military', base: b }, sx, sy, radiusPx: r + 3 });
      }
    }

    // Z-67: All 52 Custom-Motif Wonders on Gold-Rimmed Plinths (visible even at national zoom!)
    if (toggles.wonders && !advisorBubbles && Rpx >= 2.4) {
      const keptW: [number, number, number][] = [];
      const sortedW = [...layers.wonders].sort((a, b) => (a.rank || 99) - (b.rank || 99));
      for (const wd of sortedW) {
        const [sx, sy] = camera.worldToScreen(wd.x, wd.y);
        if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;
        const sz = Math.max(wd.rank <= 5 ? 16 : 14, Math.min(76, Rpx * 1.32));
        const r = sz * 0.5;
        if (!keptW.every(([kx, ky, kr]) => (kx - sx) ** 2 + (ky - sy) ** 2 >= ((kr + r) * 0.64) ** 2)) continue;
        keptW.push([sx, sy, r]);
        drawWonderPlinth(ctx, sx, sy, sz, wd.kind, wd.motif, wd.rank, dpr);
        points.push({ item: { kind: 'wonder', wonder: wd }, sx, sy, radiusPx: r + 3 });
      }
    }

    // Z-80: Bevelled Circular Metallic Resource Medallions (Overview 2-per-state vs Full Zoomed!)
    if (toggles.resources && !advisorBubbles && Rpx >= 2.5) {
      const prep = getPreparedResources(layers);
      const isOverview = Rpx < 11 && !advisorFuelFilters;
      const list = isOverview
        ? prep.overview
        : advisorFuelFilters
          ? prep.all.filter((it) => it.kind === 'power' && advisorFuelFilters.has(it.typeId))
          : prep.all;

      const placedRes: [number, number, number][] = [];
      const gapSq = isOverview ? 1.55 ** 2 : (1.28 - 0.42 * smoothstep(13, 30, Rpx)) ** 2;
      const draws: { it: UnifiedResource; sx: number; sy: number; size: number }[] = [];

      for (const it of list) {
        const [sx, sy] = camera.worldToScreen(it.x, it.y);
        if (sx < -24 || sx > w + 24 || sy < -24 || sy > h + 24) continue;
        const size = isOverview
          ? 12 + 3 * smoothstep(2.5, 11, Rpx) + 3 * smoothstep(0.6, 1, it.norm)
          : Math.max(16, Math.min(24, 16 + (Rpx - 11) * 0.2)) + 5 * smoothstep(0.45, 1, it.norm);
        const r = size * 0.5;
        if (!placedRes.every(([px, py, pr]) => (px - sx) ** 2 + (py - sy) ** 2 > (pr + r) ** 2 * gapSq)) continue;
        placedRes.push([sx, sy, r]);
        draws.push({ it, sx, sy, size });
      }

      // Draw lowest-priority first so flagship medallions sit crisply on top
      for (let k = draws.length - 1; k >= 0; k--) {
        const { it, sx, sy, size } = draws[k];
        const pips = Math.max(1, Math.round(it.norm * 5));
        drawResourceMedallion(ctx, sx, sy, size, it.typeId, pips, dpr, it.bgColor);
        if (it.plant) points.push({ item: { kind: 'power', plant: it.plant }, sx, sy, radiusPx: size * 0.55 + 3 });
        else if (it.mine) points.push({ item: { kind: 'mine', mine: it.mine }, sx, sy, radiusPx: size * 0.55 + 3 });
      }
    }

    // Z-85: Mode-Colored Parchment-Haloed FAF5 Trade Routes + Spaced Vehicle Medallions + Hover Highlight & Hit Boxes!
    if (toggles.trade && layers.trade.routes.length > 0) {
      ctx.save();
      const routes = layers.trade.routes;
      const maxVal = Math.max(1, routes[0].value_musd || 1);
      const anchorSeen = new Map<string, number>();
      const base = Math.max(1.4, Math.min(3.8, 1.3 + Rpx * 0.04));

      const prepared = routes.map((rt, idx) => {
        const [ax0, ay0] = camera.worldToScreen(rt.ox, rt.oy);
        const [bx0, by0] = camera.worldToScreen(rt.dx, rt.dy);
        const [ax, ay, bx, by] = bx0 < ax0 ? [bx0, by0, ax0, ay0] : [ax0, ay0, bx0, by0];
        const kA = `${Math.round(rt.ox)},${Math.round(rt.oy)}`;
        const kB = `${Math.round(rt.dx)},${Math.round(rt.dy)}`;
        const ia = anchorSeen.get(kA) ?? 0;
        const ib = anchorSeen.get(kB) ?? 0;
        anchorSeen.set(kA, ia + 1);
        anchorSeen.set(kB, ib + 1);
        const fanIdx = Math.max(ia, ib);
        const bow = (fanIdx % 2 ? -1 : 1) * Math.min(0.42, 0.14 + 0.07 * Math.ceil(fanIdx / 2));
        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy) || 1;
        const qx = (ax + bx) * 0.5 + (dy / dist) * bow * dist;
        const qy = (ay + by) * 0.5 - (dx / dist) * bow * dist;
        const weight = Math.sqrt((rt.value_musd || 0) / maxVal);
        const top = idx < 10;
        const st = TRADE_MODE_STYLE[rt.top_mode] ?? TRADE_MODE_STYLE.other;
        const wpx = base * (top ? 1.1 + 1.0 * weight : 0.55 + 0.5 * weight);

        // Sample quadratic Bezier into 20 segments for accurate curve picking & multi-medallion spacing
        const SEG = 20;
        const pts: number[] = [];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let arcLen = 0;
        let prevX = ax;
        let prevY = ay;
        for (let s = 0; s <= SEG; s++) {
          const t = s / SEG;
          const u = 1 - t;
          const px = u * u * ax + 2 * u * t * qx + t * t * bx;
          const py = u * u * ay + 2 * u * t * qy + t * t * by;
          pts.push(px, py);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          if (s > 0) arcLen += Math.hypot(px - prevX, py - prevY);
          prevX = px;
          prevY = py;
        }
        const markers: [number, number, number][] = [];
        const markerSz = Math.max(11, Math.min(18, 10 + Rpx * 0.2)) * (top ? 1.02 : 0.78);
        if (Rpx >= 8 || top) {
          const nMk = Math.max(1, Math.min(4, Math.round(arcLen / 240)));
          for (let m = 0; m < nMk; m++) {
            const tm = (m + 0.5) / nMk;
            const um = 1 - tm;
            const mx = um * um * ax + 2 * um * tm * qx + tm * tm * bx;
            const my = um * um * ay + 2 * um * tm * qy + tm * tm * by;
            markers.push([mx, my, markerSz * 0.5]);
          }
        }
        const isHovered = !!hoveredRoute && (hoveredRoute === rt || (hoveredRoute.rank != null && hoveredRoute.rank === rt.rank));
        return { rt, ax, ay, bx, by, qx, qy, weight, top, st, wpx, pts, bbox: [minX, minY, maxX, maxY] as [number, number, number, number], markers, markerSz, isHovered };
      });

      // Register hit boxes in priority order (Top 10 flagship corridors first)
      for (const p of prepared) {
        if (p.bbox[2] < -40 || p.bbox[0] > w + 40 || p.bbox[3] < -40 || p.bbox[1] > h + 40) continue;
        routeHits.push({
          route: p.rt,
          pts: p.pts,
          bbox: p.bbox,
          tolPx: p.wpx * 0.75 + 5,
          markers: p.markers,
        });
      }

      const drawOrder: typeof prepared = [];
      let hoveredPrep: (typeof prepared)[number] | null = null;
      for (let k = prepared.length - 1; k >= 0; k--) {
        if (prepared[k].isHovered) hoveredPrep = prepared[k];
        else drawOrder.push(prepared[k]);
      }
      if (hoveredPrep) drawOrder.push(hoveredPrep);

      const hasHover = hoveredPrep !== null;
      ctx.lineJoin = 'round';
      for (const p of drawOrder) {
        const wpx = p.isHovered ? p.wpx * 1.28 : p.wpx;
        ctx.globalAlpha = hasHover ? (p.isHovered ? 1 : 0.26) : p.top ? 1 : 0.72;
        const path = new Path2D();
        path.moveTo(p.ax, p.ay);
        path.quadraticCurveTo(p.qx, p.qy, p.bx, p.by);

        const halo = wpx * 1.5 + (p.isHovered ? 3.2 : 2);
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        ctx.strokeStyle = p.isHovered ? 'rgba(24,14,4,.58)' : 'rgba(30,20,8,.36)';
        ctx.lineWidth = halo + 1.6;
        ctx.stroke(path);
        ctx.strokeStyle = p.isHovered ? 'rgba(255,236,172,.98)' : 'rgba(250,241,214,.92)';
        ctx.lineWidth = halo;
        ctx.stroke(path);

        ctx.strokeStyle = p.st.color;
        ctx.lineWidth = wpx;
        if (p.st.dash) {
          ctx.lineCap = 'butt';
          ctx.setLineDash(p.st.dash.map((d) => d * wpx));
        }
        ctx.stroke(path);
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
        if (p.st.dots) {
          ctx.strokeStyle = p.st.dots;
          ctx.lineWidth = wpx * 0.55;
          ctx.setLineDash([0.1, wpx * 2.4]);
          ctx.stroke(path);
          ctx.setLineDash([]);
        }
      }
      ctx.globalAlpha = 1;

      // Anchor studs + highlighted endpoint rings when a route is hovered
      ctx.fillStyle = '#f3e6c4';
      ctx.strokeStyle = 'rgba(18,12,6,.82)';
      ctx.lineWidth = 1;
      for (const p of drawOrder) {
        ctx.globalAlpha = hasHover ? (p.isHovered ? 1 : 0.35) : 1;
        const sr = Math.max(2.4, Math.min(4.2, 2 + Rpx * 0.05)) * (p.isHovered ? 1.35 : 1);
        ctx.beginPath(); ctx.arc(p.ax, p.ay, sr, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.bx, p.by, sr, 0, TAU); ctx.fill(); ctx.stroke();
        if (p.isHovered) {
          ctx.save();
          ctx.strokeStyle = '#f6d46b';
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(p.ax, p.ay, sr + 4.5, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(p.bx, p.by, sr + 4.5, 0, TAU); ctx.stroke();
          ctx.restore();
        }
      }
      for (const p of drawOrder) {
        if (p.markers.length === 0) continue;
        ctx.globalAlpha = hasHover ? (p.isHovered ? 1 : 0.28) : p.top ? 1 : 0.78;
        const sz = p.isHovered ? p.markerSz * 1.18 : p.markerSz;
        for (const [mx, my] of p.markers) {
          drawTradeMarkerSprite(ctx, p.st.marker, mx, my, sz, p.isHovered ? '#f6d46b' : p.st.color, dpr);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Z-90: Angled Antique Serif State Names (exact map.js drawStateLabels with PCA tilt & wide tracking!)
    if (toggles.borders && Rpx <= 22) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const spaced = typeof (ctx as unknown as { letterSpacing?: string }).letterSpacing === 'string';
      const orderedLbls = [...topo.stateLabels].sort((a, b) => b.sizeKm - a.sizeKm);
      const placedLbls: [number, number, number, number][] = [];

      for (const lbl of orderedLbls) {
        let px = Math.min(lbl.sizeKm * scale, 105);
        let a = smoothstep(8, 13, px) * (1 - smoothstep(13, 22, Rpx));
        if (a < 0.02) continue;
        const isAbbr = lbl.text.length <= 3;
        if (isAbbr) {
          const extent = Math.sqrt(lbl.cellCount || 1) * Rpx * 1.5;
          px = Math.min(px, 14, extent * 0.44);
          if (px < 8.5) continue;
          a = Math.min(a, smoothstep(8.5, 11, px));
        }
        const [sx, sy] = camera.worldToScreen(lbl.x, lbl.y);
        if (sx < -400 || sx > w + 400 || sy < -150 || sy > h + 150) continue;

        const spacing = isAbbr ? 0.12 : 0.24;
        const tw = px * (lbl.text.length * 0.78 + spacing * (lbl.text.length - 1));
        const th = px * 0.82;
        const c = Math.abs(Math.cos(lbl.angle));
        const sn = Math.abs(Math.sin(lbl.angle));
        const bw = (tw * c + th * sn) * 0.5;
        const bh = (tw * sn + th * c) * 0.5;
        const box: [number, number, number, number] = [sx - bw, sy - bh, sx + bw, sy + bh];
        if (placedLbls.some((p) => box[0] < p[2] && p[0] < box[2] && box[1] < p[3] && p[1] < box[3])) continue;
        placedLbls.push(box);

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(lbl.angle);
        ctx.font = `${isAbbr ? '700 ' : '600 '}${px.toFixed(1)}px ${SERIF_FONT}`;
        ctx.lineWidth = Math.max(isAbbr ? 2.4 : 1.6, px * 0.075);
        ctx.strokeStyle = isMid
          ? `rgba(22,16,8,${(isAbbr ? 0.65 : 0.48) * a})`
          : `rgba(255,250,240,${0.7 * a})`;
        ctx.fillStyle = isMid
          ? `rgba(255,246,222,${(isAbbr ? 0.84 : 0.76) * a})`
          : `rgba(42,48,56,${0.62 * a})`;
        const gap = px * spacing;
        if (spaced) {
          (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${gap.toFixed(1)}px`;
          ctx.strokeText(lbl.text, gap * 0.5, 0);
          ctx.fillText(lbl.text, gap * 0.5, 0);
          (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
        } else {
          ctx.strokeText(lbl.text, 0, 0);
          ctx.fillText(lbl.text, 0, 0);
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  // Z-95: Live Proportional Advisor Bubble Overlays
  if (advisorBubbles && advisorBubbles.length > 0) {
    ctx.save();
    const sortedB = [...advisorBubbles].sort((a, b) => b.radiusPx - a.radiusPx);
    let hoverBubble: MapBubbleSpec | null = null;
    for (const b of sortedB) {
      if (b.id === hoveredBubbleId || b.highlighted) {
        hoverBubble = b;
        continue;
      }
      const [sx, sy] = camera.worldToScreen(b.x, b.y);
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.76;
      ctx.beginPath(); ctx.arc(sx, sy, b.radiusPx, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = b.stroke ?? 'rgba(14, 22, 32, 0.88)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    if (hoverBubble) {
      const [sx, sy] = camera.worldToScreen(hoverBubble.x, hoverBubble.y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hoverBubble.color;
      ctx.beginPath(); ctx.arc(sx, sy, hoverBubble.radiusPx + 2.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#FFF6D6'; ctx.lineWidth = 2.6; ctx.stroke();

      const txt = hoverBubble.sublabel ? `${hoverBubble.label} · ${hoverBubble.sublabel}` : hoverBubble.label;
      ctx.font = `700 11px ${SANS_FONT}`;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(14, 22, 32, 0.94)';
      ctx.strokeStyle = '#E5C068';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(sx - tw / 2 - 8, sy - hoverBubble.radiusPx - 28, tw + 16, 20, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FFF8E6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, sx, sy - hoverBubble.radiusPx - 18);
    }
    ctx.restore();
  }

  // Selected City Territory Glow & Isometric District Miniatures
  if (selectedCity) {
    ctx.save();
    ctx.strokeStyle = isMid ? '#F2C96B' : '#B07D28';
    ctx.lineWidth = Math.max(1.5, scale * 2.2);
    for (const hid of selectedCity.hex_ids) {
      const [sx, sy] = camera.worldToScreen(world.x[hid], world.y[hid]);
      drawHexOutline(ctx, sx, sy, world.r[hid] * scale * HEX_DRAW_SCALE);
      ctx.stroke();
    }
    ctx.restore();
    for (const dist of selectedCity.districts) {
      const [sx, sy] = camera.worldToScreen(dist.x, dist.y);
      drawDistrictMiniature(ctx, sx, sy - 4, dist.id, 1.15, localizeDistrictName(dist.id, dist.name, rc.locale));
    }
  } else if (!advisorBubbles && scale >= 1.25) {
    for (let i = 0; i < Math.min(180, cities.length); i++) {
      const c = cities[i];
      const d = c.districts[0];
      if (!d) continue;
      const [sx, sy] = camera.worldToScreen(d.x, d.y);
      if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
      drawDistrictMiniature(ctx, sx, sy - 14, d.id, 0.8);
    }
  }

  // Showdown A vs B luminous golden arc
  if (showdownCities && showdownCities[0] && showdownCities[1]) {
    const [ca, cb] = showdownCities;
    const [ax, ay] = camera.worldToScreen(ca.x, ca.y);
    const [bx, by] = camera.worldToScreen(cb.x, cb.y);
    ctx.save();
    ctx.strokeStyle = '#F0C75E';
    ctx.lineWidth = 2.8;
    ctx.setLineDash([7, 4]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 75, bx, by);
    ctx.stroke();
    ctx.restore();
  }

  // Hovered Hex Crisp Outline
  if (hoveredHexId >= 0 && hoveredHexId < world.n) {
    const [sx, sy] = camera.worldToScreen(world.x[hoveredHexId], world.y[hoveredHexId]);
    const lw = Math.max(1.5, Math.min(2.4, scale * 2.2));
    const rPx = world.r[hoveredHexId] * scale * HEX_DRAW_SCALE;
    ctx.save();
    ctx.strokeStyle = isMid ? 'rgba(255, 240, 200, 0.92)' : '#1D242B';
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    drawHexOutline(ctx, sx, sy, rPx);
    ctx.stroke();
    ctx.restore();
  }

  // Z-100: Reference Bevelled Bronze/Gold Civ City Banners!
  if (toggles.banners) {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const overlaps = (x0: number, y0: number, x1: number, y1: number) =>
      placed.some((b) => x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0);

    const maxCities = scale < 0.28 ? 46 : scale < 0.45 ? 115 : scale < 0.8 ? 270 : cities.length;
    const fullLayout = Rpx >= 12;
    let yieldTiersLeft = scale >= 0.72 ? 5 : 0;

    const candidates: CityRecord[] = [];
    if (selectedCity) candidates.push(selectedCity);
    for (let i = 0; i < Math.min(maxCities, cities.length); i++) {
      if (!selectedCity || cities[i].id !== selectedCity.id) candidates.push(cities[i]);
    }
    // Always include Anchorage & Honolulu for the brass insets
    for (const pinnedId of ['11260', '26180']) {
      if (!candidates.some((c) => c.id === pinnedId)) {
        const found = cities.find((c) => c.id === pinnedId);
        if (found) candidates.push(found);
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const isSel = selectedCity?.id === c.id;
      const [sx, sy0] = camera.worldToScreen(c.x, c.y);
      if (sx < -120 || sx > w + 120 || sy0 < -50 || sy0 > h + 50) continue;

      // Lift banner neatly above city skyline when zoomed in!
      const sy = Rpx >= 14 ? sy0 - Math.min(36, Rpx * 0.72) : sy0;
      const popTier =
        c.pop >= 10_000_000
          ? `${Math.round(c.pop / 1e6)}M`
          : c.pop >= 1_000_000
            ? `${(c.pop / 1e6).toFixed(1)}M`
            : `${Math.round(c.pop / 1000)}K`;
      const isCap = c.id === '47900';
      const label = (isCap ? '★ ' : '') + c.short_name.toUpperCase();
      const grow = c.pop_growth_pct ?? 0;

      ctx.font = fullLayout ? `600 11px ${SERIF_FONT}` : `600 9.6px ${SERIF_FONT}`;
      const tw = ctx.measureText(label).width;
      const capW = fullLayout ? 44 : 38;
      const bh = fullLayout ? 22 : 19;
      const showYields = (isSel || yieldTiersLeft > 0) && scale >= 0.72 && c.pop >= 500_000;
      const tierH = showYields ? 15 : 0;
      const bw = Math.round(capW + tw + 30);
      const x0 = Math.round(sx - bw * 0.5);
      const y0 = Math.round(sy - bh * 0.5);
      const x1 = x0 + bw;
      const y1 = y0 + bh + tierH;

      if (!isSel && overlaps(x0 - 5, y0 - 4, x1 + 5, y1 + 4)) continue;
      placed.push({ x0, y0, x1, y1 });
      banners.push({ city: c, x0, y0, x1, y1: y0 + bh });
      if (showYields && !isSel) yieldTiersLeft--;

      const stRgb: Rgb255 = topo.stateColorByAbbr.get(c.state_abbr) ?? [78, 148, 130];
      const darkCapTxt = luminance255(stRgb) > 0.36;

      ctx.save();
      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      ctx.beginPath();
      ctx.roundRect(x0 + 1, y0 + 2, bw, bh, 5);
      ctx.fill();

      // Bevelled bronze/gold outer frame (exact banners.js BRONZE / GOLD gradients!)
      const rimG = ctx.createLinearGradient(0, y0, 0, y0 + bh);
      if (isSel || isCap) {
        rimG.addColorStop(0, '#fff4c4');
        rimG.addColorStop(0.5, '#e6bd55');
        rimG.addColorStop(1, '#8d6418');
      } else {
        rimG.addColorStop(0, '#ecd08a');
        rimG.addColorStop(0.5, '#a8833f');
        rimG.addColorStop(1, '#4f3a1b');
      }
      ctx.fillStyle = rimG;
      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, bh, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(6,8,12,0.78)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Dark inner well
      const b = 1.5;
      const wellG = ctx.createLinearGradient(0, y0 + b, 0, y0 + bh - b);
      wellG.addColorStop(0, '#221c15');
      wellG.addColorStop(1, '#12100d');
      ctx.fillStyle = wellG;
      ctx.beginPath();
      ctx.roundRect(x0 + b, y0 + b, bw - b * 2, bh - b * 2, 3.6);
      ctx.fill();

      // Left State-Colored Population Cap
      const capG = ctx.createLinearGradient(0, y0 + b, 0, y0 + bh - b);
      capG.addColorStop(0, cssRgb(shadeRgb(stRgb, 0.22)));
      capG.addColorStop(0.55, cssRgb(stRgb));
      capG.addColorStop(1, cssRgb(shadeRgb(stRgb, -0.32)));
      ctx.fillStyle = capG;
      ctx.beginPath();
      ctx.roundRect(x0 + b, y0 + b, capW, bh - b * 2, [3.6, 2, 2, 3.6]);
      ctx.fill();

      // Population text + crisp vector growth chevron (▲ / ▲▲ / ▼ / ◆)
      ctx.fillStyle = darkCapTxt ? '#17110a' : '#fff8e6';
      ctx.font = fullLayout ? `700 9.5px ${SANS_FONT}` : `700 8.5px ${SANS_FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(popTier, x0 + b + 4.5, y0 + bh * 0.5 + 0.4);
      drawGrowthChevron(ctx, x0 + b + capW - 7.5, y0 + bh * 0.5, fullLayout ? 6.5 : 5.5, grow);

      // Small-caps antique serif City Name with drop shadow
      ctx.font = fullLayout ? `600 11px ${SERIF_FONT}` : `600 9.6px ${SERIF_FONT}`;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(label, x0 + capW + 7, y0 + bh * 0.5 + 1.4);
      ctx.fillStyle = isCap ? '#f6d876' : '#f8f0dc';
      ctx.fillText(label, x0 + capW + 7, y0 + bh * 0.5 + 0.4);

      // Right circular district medallion
      drawMiniDistrictIcon(ctx, x1 - 10, y0 + bh * 0.5, isCap ? 'capitol' : c.primary_district);

      // Zoomed-in lower yield tier (exact Civ yield row!)
      if (showYields) {
        const yTxt = `🌾${compactNum(c.yields_workers?.food ?? c.yields.food)} · ⚙${compactNum(c.yields_workers?.production ?? c.yields.prod)} · 💰$${Math.round((c.gdp_musd ?? 0) / 1000)}B`;
        ctx.font = `600 9px ${SANS_FONT}`;
        const yw = Math.min(bw - 6, ctx.measureText(yTxt).width + 14);
        const yx = sx - yw * 0.5;
        const yy = y0 + bh - 1;
        ctx.fillStyle = 'rgba(18,14,10,0.94)';
        ctx.strokeStyle = '#9e7a3a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(yx, yy, yw, tierH, [0, 0, 4, 4]);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e8dcb4';
        ctx.textAlign = 'center';
        ctx.fillText(yTxt, sx, yy + tierH * 0.5 + 0.4);
      }

      ctx.restore();
    }
  }

  return { banners, points, routes: routeHits };
}
