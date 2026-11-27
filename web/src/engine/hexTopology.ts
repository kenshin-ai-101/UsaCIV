/**
 * Fast O(N) 6-neighbor hex topology, NW hill-shading, Civ-style greedy state colors,
 * inner colored state border ribbons, and angled state label geometry.
 *
 * Coordinate convention: world.x increases EAST, world.y increases NORTH.
 * Neighbor direction indices (matching pointy-top hex corners 0..5):
 *   corners[k] = [cos(60*k - 30°), sin(60*k - 30°)] in world (x-east, y-north):
 *     k=0: SE-lower-right? Wait: -30° = (cos -30°, sin -30°) = (+0.866, -0.5) = SE corner
 *     k=1: +30° = (+0.866, +0.5) = NE corner
 *     k=2: +90° = (0, +1.0)      = N top corner
 *     k=3: +150° = (-0.866, +0.5)= NW corner
 *     k=4: +210° = (-0.866, -0.5)= SW corner
 *     k=5: +270° = (0, -1.0)     = S bottom corner
 *   Edges between corner[d] and corner[(d+1)%6] face:
 *     d=0: E   (angle   0°, dx=+√3*R,   dy=0)
 *     d=1: NE  (angle +60°, dx=+√3/2*R, dy=+1.5*R)
 *     d=2: NW  (angle+120°, dx=-√3/2*R, dy=+1.5*R)
 *     d=3: W   (angle 180°, dx=-√3*R,   dy=0)
 *     d=4: SW  (angle-120°, dx=-√3/2*R, dy=-1.5*R)
 *     d=5: SE  (angle -60°, dx=+√3/2*R, dy=-1.5*R)
 */
import type { CityRecord, StateRecord, WorldHexData } from '../types/world';
import {
  STATE_HERALDIC_COLORS,
  STATE_PALETTE_RGB,
  parseHex255,
  type Rgb255,
} from '../features/lenses/lensConfig';

export const HEX_CORNERS_WORLD: [number, number][] = [0, 1, 2, 3, 4, 5].map((k) => {
  const a = ((60 * k - 30) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
});

const SQRT3 = Math.sqrt(3);

export interface StateLabelGeom {
  fips: string;
  abbr: string;
  text: string;
  x: number;
  y: number;
  angle: number; // screen radians (y-down)
  sizeKm: number;
  cellCount: number;
}

export interface WorldTopology {
  n: number;
  /** Flat Int32Array of length n * 6: neighbors[i*6 + d] = hex index in dir d (0=E,1=NE,2=NW,3=W,4=SW,5=SE) or -1 */
  neighbors: Int32Array;
  /** NW hill-shading factor in [-0.32, +0.32] per hex */
  shadeK: Float32Array;
  /** State FIPS -> RGB255 Civ color (graph-colored so adjacent states never share a color) */
  stateColorByFips: Map<string, Rgb255>;
  /** State abbr -> RGB255 Civ color */
  stateColorByAbbr: Map<string, Rgb255>;
  /** Inner state border colored band quads grouped by FIPS: [x0,y0, x1,y1, ix0,iy0, ix1,iy1, ...] in world km */
  stateBands: Map<string, Float32Array>;
  /** Shared edges between two US states: [x0,y0, x1,y1, ...] in world km */
  stateEdgeLines: Float32Array;
  /** Outer edges of US land (coastlines & international borders): [x0,y0, x1,y1, ...] in world km */
  outerEdgeLines: Float32Array;
  /** Angled antique serif state labels placed at deepest interior hex (BFS pole of inaccessibility + PCA angle) */
  stateLabels: StateLabelGeom[];
  /** Hex index -> primary CityRecord (closest hex of each city) */
  cityByHex: Map<number, CityRecord>;
  /** Metro spill neighbor hexes for 1.5M+ cities -> pseudo-city spec */
  spillByHex: Map<number, { parent: CityRecord; pop: number; hexId: number }>;
}

const topoCache = new WeakMap<WorldHexData, WorldTopology>();

export function getWorldTopology(
  world: WorldHexData,
  states?: StateRecord[],
  cities?: CityRecord[],
): WorldTopology {
  let topo = topoCache.get(world);
  if (topo) {
    if (cities && cities.length > 0 && topo.cityByHex.size === 0) {
      populateCityMapping(topo, world, cities);
    }
    if (states && states.length > 0 && topo.stateLabels.length === 0) {
      topo.stateLabels = computeStateLabels(world, topo.neighbors, states);
      for (const s of states) {
        const c = topo.stateColorByFips.get(s.fips);
        if (c) topo.stateColorByAbbr.set(s.abbr, c);
      }
    }
    return topo;
  }

  const n = world.n;
  const neighbors = new Int32Array(n * 6).fill(-1);

  // Build spatial grid hash per region (0=CONUS, 1=AK, 2=HI)
  const buckets = new Map<string, number[]>();
  const cellKey = (reg: number, bx: number, by: number) => `${reg}:${bx},${by}`;
  for (let i = 0; i < n; i++) {
    const step = Math.max(4, world.r[i] * 2.2);
    const bx = Math.floor(world.x[i] / step);
    const by = Math.floor(world.y[i] / step);
    const k = cellKey(world.reg[i], bx, by);
    let arr = buckets.get(k);
    if (!arr) {
      arr = [];
      buckets.set(k, arr);
    }
    arr.push(i);
  }

  for (let i = 0; i < n; i++) {
    const xi = world.x[i];
    const yi = world.y[i];
    const ri = world.r[i];
    const regi = world.reg[i];
    const step = Math.max(4, ri * 2.2);
    const bx = Math.floor(xi / step);
    const by = Math.floor(yi / step);
    const expectedDist = SQRT3 * ri;
    const minD2 = (expectedDist * 0.72) ** 2;
    const maxD2 = (expectedDist * 1.28) ** 2;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = buckets.get(cellKey(regi, bx + dx, by + dy));
        if (!list) continue;
        for (let m = 0; m < list.length; m++) {
          const j = list[m];
          if (j === i) continue;
          const ddx = world.x[j] - xi;
          const ddy = world.y[j] - yi;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < minD2 || d2 > maxD2) continue;
          // Angle in [0, 2*PI): 0=E, 60=NE, 120=NW, 180=W, 240=SW, 300=SE
          let deg = (Math.atan2(ddy, ddx) * 180) / Math.PI;
          if (deg < 0) deg += 360;
          const dir = Math.round(deg / 60) % 6;
          neighbors[i * 6 + dir] = j;
        }
      }
    }
  }

  // NW hill-shading: sunlit from NW (-x, +y), shaded toward SE (+x, -y)
  const shadeK = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = world.elev[i];
    const r = Math.max(1, world.r[i]);
    const W = SQRT3 * r;
    const eAt = (dir: number) => {
      const j = neighbors[i * 6 + dir];
      return j < 0 ? z : world.elev[j];
    };
    const dzx = eAt(0) - eAt(3); // E - W
    const north = (eAt(1) + eAt(2)) * 0.5; // NE + NW
    const south = (eAt(4) + eAt(5)) * 0.5; // SW + SE
    const illum = dzx / (2 * W) + (south - north) / (3 * r);
    shadeK[i] = Math.max(-0.32, Math.min(0.32, illum * 0.03));
  }

  // Greedy graph coloring of states so neighboring states always get distinct Civ colors
  const stateAdj = new Map<string, Set<string>>();
  for (let i = 0; i < n; i++) {
    const sf = world.st[i];
    if (!sf) continue;
    if (!stateAdj.has(sf)) stateAdj.set(sf, new Set());
    for (let d = 0; d < 3; d++) {
      const j = neighbors[i * 6 + d];
      if (j >= 0 && world.st[j] && world.st[j] !== sf) {
        stateAdj.get(sf)!.add(world.st[j]);
        if (!stateAdj.has(world.st[j])) stateAdj.set(world.st[j], new Set());
        stateAdj.get(world.st[j])!.add(sf);
      }
    }
  }
  const stateColorByFips = new Map<string, Rgb255>();
  const stateColorByAbbr = new Map<string, Rgb255>();
  const orderedStates = [...stateAdj.keys()].sort((a, b) => (stateAdj.get(b)?.size ?? 0) - (stateAdj.get(a)?.size ?? 0));
  orderedStates.forEach((sf, idx) => {
    const used = new Set<Rgb255>();
    for (const nb of stateAdj.get(sf) ?? []) {
      const c = stateColorByFips.get(nb);
      if (c) used.add(c);
    }
    let k = (idx * 5) % STATE_PALETTE_RGB.length;
    for (let m = 0; m < STATE_PALETTE_RGB.length && used.has(STATE_PALETTE_RGB[k]); m++) {
      k = (k + 1) % STATE_PALETTE_RGB.length;
    }
    stateColorByFips.set(sf, STATE_PALETTE_RGB[k]);
  });

  // Precompute Civ-style inner border color bands + state/outer boundary segments
  const bandLists = new Map<string, number[]>();
  const stateLinesArr: number[] = [];
  const outerLinesArr: number[] = [];
  const INSET = 0.17;
  for (let i = 0; i < n; i++) {
    const sf = world.st[i];
    if (!sf) continue;
    const cx = world.x[i];
    const cy = world.y[i];
    const r = world.r[i] * 1.003;
    for (let d = 0; d < 6; d++) {
      const j = neighbors[i * 6 + d];
      const sfj = j >= 0 ? world.st[j] : '';
      if (sfj === sf) continue;
      const c0 = HEX_CORNERS_WORLD[d];
      const c1 = HEX_CORNERS_WORLD[(d + 1) % 6];
      const ax = cx + c0[0] * r;
      const ay = cy + c0[1] * r;
      const bx = cx + c1[0] * r;
      const by = cy + c1[1] * r;
      const iax = cx + c0[0] * r * (1 - INSET);
      const iay = cy + c0[1] * r * (1 - INSET);
      const ibx = cx + c1[0] * r * (1 - INSET);
      const iby = cy + c1[1] * r * (1 - INSET);
      let bl = bandLists.get(sf);
      if (!bl) {
        bl = [];
        bandLists.set(sf, bl);
      }
      bl.push(ax, ay, bx, by, ibx, iby, iax, iay);
      if (j >= 0 && sfj) {
        if (j > i) stateLinesArr.push(ax, ay, bx, by);
      } else {
        outerLinesArr.push(ax, ay, bx, by);
      }
    }
  }
  const stateBands = new Map<string, Float32Array>();
  for (const [sf, arr] of bandLists) stateBands.set(sf, new Float32Array(arr));

  topo = {
    n,
    neighbors,
    shadeK,
    stateColorByFips,
    stateColorByAbbr,
    stateBands,
    stateEdgeLines: new Float32Array(stateLinesArr),
    outerEdgeLines: new Float32Array(outerLinesArr),
    stateLabels: states && states.length > 0 ? computeStateLabels(world, neighbors, states) : [],
    cityByHex: new Map(),
    spillByHex: new Map(),
  };

  if (states) {
    for (const s of states) {
      const c = topo.stateColorByFips.get(s.fips);
      if (c) topo.stateColorByAbbr.set(s.abbr, c);
    }
  }
  for (const [abbr, hex] of Object.entries(STATE_HERALDIC_COLORS)) {
    if (!topo.stateColorByAbbr.has(abbr)) topo.stateColorByAbbr.set(abbr, parseHex255(hex));
  }
  if (cities && cities.length > 0) {
    populateCityMapping(topo, world, cities);
  }

  topoCache.set(world, topo);
  return topo;
}

function populateCityMapping(topo: WorldTopology, world: WorldHexData, cities: CityRecord[]) {
  topo.cityByHex.clear();
  topo.spillByHex.clear();
  // Map each city to its closest hex inside city.hex_ids (highest population wins if two share a hex)
  for (const c of cities) {
    let bestH = -1;
    let bestD2 = Infinity;
    for (const h of c.hex_ids) {
      if (h < 0 || h >= world.n) continue;
      const dx = world.x[h] - c.x;
      const dy = world.y[h] - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestH = h;
      }
    }
    if (bestH >= 0 && !topo.cityByHex.has(bestH)) {
      topo.cityByHex.set(bestH, c);
    }
  }
  // Metro spill: 1.5M+ cities spill mid-rise blocks onto 1-2 most developed urban neighbor hexes
  const devArr = world.pct?.d;
  const coverArr = world.cover;
  for (const [cell, city] of topo.cityByHex) {
    if (city.pop < 1_500_000) continue;
    const cands: [number, number][] = [];
    for (let d = 0; d < 6; d++) {
      const j = topo.neighbors[cell * 6 + d];
      if (j < 0 || topo.cityByHex.has(j) || topo.spillByHex.has(j)) continue;
      const isUrban = coverArr ? coverArr[j] === 9 : world.biome[j] === 5;
      const devPct = devArr ? devArr[j] : isUrban ? 40 : 0;
      if (!isUrban && devPct < 20) continue;
      cands.push([j, devPct]);
    }
    cands.sort((a, b) => b[1] - a[1]);
    const cnt = city.pop >= 5_000_000 ? 2 : 1;
    cands.slice(0, cnt).forEach(([j], k) => {
      topo.spillByHex.set(j, {
        parent: city,
        pop: (city.pop >= 5_000_000 ? 900_000 : 500_000) / (k + 1),
        hexId: j,
      });
    });
  }
}

function computeStateLabels(
  world: WorldHexData,
  neighbors: Int32Array,
  states: StateRecord[],
): StateLabelGeom[] {
  const n = world.n;
  const dist = new Int16Array(n).fill(-1);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  for (let i = 0; i < n; i++) {
    const sf = world.st[i];
    if (!sf) continue;
    for (let d = 0; d < 6; d++) {
      const j = neighbors[i * 6 + d];
      if (j < 0 || world.st[j] !== sf) {
        dist[i] = 0;
        queue[qt++] = i;
        break;
      }
    }
  }
  while (qh < qt) {
    const i = queue[qh++];
    const sf = world.st[i];
    for (let d = 0; d < 6; d++) {
      const j = neighbors[i * 6 + d];
      if (j >= 0 && dist[j] < 0 && world.st[j] === sf) {
        dist[j] = dist[i] + 1;
        queue[qt++] = j;
      }
    }
  }

  const byState = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const sf = world.st[i];
    if (!sf) continue;
    let arr = byState.get(sf);
    if (!arr) {
      arr = [];
      byState.set(sf, arr);
    }
    arr.push(i);
  }

  const smallAbbr = new Set(['RI', 'DE', 'DC', 'CT', 'NJ', 'MA', 'MD', 'VT', 'NH']);
  const out: StateLabelGeom[] = [];

  for (const st of states) {
    const cells = byState.get(st.fips);
    if (!cells || cells.length === 0) continue;
    let cxSum = 0;
    let cySum = 0;
    for (const i of cells) {
      cxSum += world.x[i];
      cySum += world.y[i];
    }
    const mcx = cxSum / cells.length;
    const mcy = cySum / cells.length;

    // Anchor at deepest interior hex (tie-break closest to centroid)
    let best = cells[0];
    let bestScore = -Infinity;
    for (const i of cells) {
      const sc = dist[i] * 1e6 - Math.hypot(world.x[i] - mcx, world.y[i] - mcy);
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    }

    // PCA principal axis of state cells (clamped to ±35°) for antique cartographic tilt
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const i of cells) {
      const dx = world.x[i] - mcx;
      const dy = -(world.y[i] - mcy); // screen y-down!
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const maxTilt = (34 * Math.PI) / 180;
    if (ang > maxTilt) ang = maxTilt;
    if (ang < -maxTilt) ang = -maxTilt;
    // Keep very wide or nearly square states almost horizontal (like KS, CO, WY, TX)
    const ratio = Math.min(sxx, syy) / Math.max(1, Math.max(sxx, syy));
    if (ratio > 0.65 || st.abbr === 'AK' || st.abbr === 'HI') ang *= 0.25;

    const useAbbr = smallAbbr.has(st.abbr) || cells.length < 18;
    const text = useAbbr ? st.abbr : st.name.toUpperCase();

    // Estimate span along label axis so text fits cleanly inside state
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    let minU = Infinity;
    let maxU = -Infinity;
    for (const i of cells) {
      const dx = world.x[i] - world.x[best];
      const dy = -(world.y[i] - world.y[best]);
      const u = dx * ca + dy * sa;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
    }
    const spanKm = Math.max(80, maxU - minU);
    const charUnits = text.length * 0.85 + Math.max(0, text.length - 1) * 0.24;
    const sizeKm = Math.max(24, Math.min(92, (spanKm * 0.72) / Math.max(1, charUnits)));

    out.push({
      fips: st.fips,
      abbr: st.abbr,
      text,
      x: world.x[best],
      y: world.y[best],
      angle: useAbbr ? 0 : ang,
      sizeKm,
      cellCount: cells.length,
    });
  }

  return out;
}
