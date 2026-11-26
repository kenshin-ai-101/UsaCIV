import type {
  AirportNode,
  CityRecord,
  MapLayersData,
  MilitaryBaseNode,
  MineNode,
  PortNode,
  PowerPlantNode,
  WonderNode,
  WorldHexData,
} from '../types/world';

export type PickedItem =
  | { kind: 'city'; city: CityRecord }
  | { kind: 'wonder'; wonder: WonderNode }
  | { kind: 'power'; plant: PowerPlantNode }
  | { kind: 'mine'; mine: MineNode }
  | { kind: 'port'; port: PortNode }
  | { kind: 'airport'; airport: AirportNode }
  | { kind: 'military'; base: MilitaryBaseNode }
  | { kind: 'hex'; hexId: number };

export interface BannerHitBox {
  city: CityRecord;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PointHitItem {
  item: PickedItem;
  sx: number;
  sy: number;
  radiusPx: number;
}

/** Spatial hash grid over display km for O(1) hex lookup across CONUS + AK + HI. */
export class HexSpatialIndex {
  private cellSize = 32; // km
  private buckets = new Map<string, number[]>();
  private world: WorldHexData;

  constructor(world: WorldHexData) {
    this.world = world;
    for (let i = 0; i < world.n; i++) {
      const gx = Math.floor(world.x[i] / this.cellSize);
      const gy = Math.floor(world.y[i] / this.cellSize);
      const key = `${gx},${gy}`;
      let arr = this.buckets.get(key);
      if (!arr) {
        arr = [];
        this.buckets.set(key, arr);
      }
      arr.push(i);
    }
  }

  findHexAtWorld(wx: number, wy: number): number {
    const gx = Math.floor(wx / this.cellSize);
    const gy = Math.floor(wy / this.cellSize);
    let best = -1;
    let bestD2 = Infinity;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = this.buckets.get(`${gx + dx},${gy + dy}`);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          const ddx = wx - this.world.x[i];
          const ddy = wy - this.world.y[i];
          const d2 = ddx * ddx + ddy * ddy;
          const r = this.world.r[i] * 1.06;
          if (d2 <= r * r && d2 < bestD2) {
            bestD2 = d2;
            best = i;
          }
        }
      }
    }
    return best;
  }
}

export function hitTestScreen(
  sx: number,
  sy: number,
  wx: number,
  wy: number,
  bannerBoxes: BannerHitBox[],
  pointHits: PointHitItem[],
  hexIndex: HexSpatialIndex | null,
): PickedItem | null {
  // 1. Top priority: City Railway-Plaque Banners
  for (let i = bannerBoxes.length - 1; i >= 0; i--) {
    const b = bannerBoxes[i];
    if (sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1) {
      return { kind: 'city', city: b.city };
    }
  }
  // 2. Wonders, Hubs, Military, Power Plants, Mines
  let bestPt: PointHitItem | null = null;
  let bestD2 = Infinity;
  for (let i = pointHits.length - 1; i >= 0; i--) {
    const p = pointHits[i];
    const d2 = (sx - p.sx) * (sx - p.sx) + (sy - p.sy) * (sy - p.sy);
    if (d2 <= p.radiusPx * p.radiusPx && d2 < bestD2) {
      bestD2 = d2;
      bestPt = p;
    }
  }
  if (bestPt) return bestPt.item;

  // 3. Underlying 25 km Hex Tile
  if (hexIndex) {
    const hid = hexIndex.findHexAtWorld(wx, wy);
    if (hid >= 0) return { kind: 'hex', hexId: hid };
  }
  return null;
}

export function computeHexBounds(hexIds: number[], world: WorldHexData): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of hexIds) {
    const x = world.x[id];
    const y = world.y[id];
    const r = world.r[id] * 1.5;
    if (x - r < minX) minX = x - r;
    if (x + r > maxX) maxX = x + r;
    if (y - r < minY) minY = y - r;
    if (y + r > maxY) maxY = y + r;
  }
  if (!Number.isFinite(minX)) return [-200, 1400, 200, 1700];
  return [minX, minY, maxX, maxY];
}

export function getCitySummaryForHex(hexId: number, world: WorldHexData, layers: MapLayersData | null) {
  return {
    isRestricted: layers?.restricted_hex_ids?.includes(hexId) ?? false,
    isProtected: layers?.protected_hex_ids?.includes(hexId) ?? false,
    hasRiver: world.river[hexId] === 1,
    hasShale: world.shale[hexId] === 1,
  };
}
