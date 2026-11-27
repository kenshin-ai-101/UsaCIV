/**
 * High-DPI Canvas2D Overlay Renderer — Upgraded to Imperial Midnight Cartography + Daylight Atlas
 * Features:
 *  - Deep engraved ocean with vintage sea-wave strokes + darkened Canada/Mexico neighbor landmass context
 *  - Painterly terrain micro-glyphs right on the 25 km hexes (mountain peaks, hill ridges, pine conifers, crop furrows)
 *  - Antique serif state typography painted cleanly across all 50 states beneath banners
 *  - Crisp golden/brass state borders, glowing rivers & lakes, double-cased Interstates, railroads, FAF5 trade arcs
 *  - Proportional Advisor Bubble Overlays (Energy MW circles, Economy GDP circles, Wonder beacons) with two-way hover glow
 *  - Civ-style Heraldic City Banners: [State-Color Pop Pill + PEP Growth ▴/▾] [★ Name] [Circular Primary District Medallion]
 */
import type {
  CityRecord,
  LayerToggles,
  Locale,
  MapLayersData,
  StateRecord,
  ThemeMode,
  WorldHexData,
  WorldMeta,
} from '../../types/world';
import type { MapBubbleSpec } from '../../store/useAppStore';
import { STATE_HERALDIC_COLORS } from '../../features/lenses/lensConfig';
import { localizeDistrictName } from '../../i18n';
import type { MapCamera } from '../camera';
import type { BannerHitBox, PointHitItem } from '../picking';
import {
  drawAirportBadge,
  drawDistrictMiniature,
  drawMilitaryFort,
  drawOrePrism,
  drawPortBadge,
  drawPowerBeacon,
  drawWonderStamp,
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
  advisorFuelFilters: Set<string> | null;
  advisorBubbles: MapBubbleSpec[] | null;
  hoveredBubbleId: string | null;
  showdownCities?: [CityRecord | null, CityRecord | null];
}

export interface OverlayHitResult {
  banners: BannerHitBox[];
  points: PointHitItem[];
}

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

const STATE_LABEL_SKIP = new Set(['RI', 'DE', 'DC', 'CT', 'NJ', 'MA', 'MD', 'VT', 'NH']);

function drawHexOutline(ctx: CanvasRenderingContext2D, sx: number, sy: number, rPx: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const px = sx + Math.cos(a) * rPx;
    const py = sy + Math.sin(a) * rPx;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Tiny crisp geometric district emblem drawn inside the right medallion of every City Banner */
function drawMiniDistrictIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, districtId: string | null) {
  const col = (districtId && DISTRICT_GLYPH_COLORS[districtId]) || '#D4AE5E';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#151E29';
  ctx.strokeStyle = '#C9A252';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.1;
  if (districtId === 'campus') {
    ctx.beginPath();
    ctx.arc(0, 1.5, 3.6, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-3.6, 1.5, 7.2, 2);
  } else if (districtId === 'foundry') {
    ctx.beginPath();
    ctx.moveTo(-4, 3);
    ctx.lineTo(-4, -1);
    ctx.lineTo(-1, 1);
    ctx.lineTo(-1, -1);
    ctx.lineTo(2, 1);
    ctx.lineTo(2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(2.2, -3.6, 1.6, 6.6);
  } else if (districtId === 'exchange') {
    ctx.fillRect(-3.5, -1, 7, 4.2);
    ctx.fillRect(-2, -3.6, 4, 2.6);
  } else if (districtId === 'harbor') {
    ctx.beginPath();
    ctx.moveTo(0, -3.5);
    ctx.lineTo(0, 3.2);
    ctx.arc(0, 0.8, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (districtId === 'aerohub') {
    ctx.beginPath();
    ctx.moveTo(0, -3.8);
    ctx.lineTo(3.6, 1.4);
    ctx.lineTo(0, 0.2);
    ctx.lineTo(-3.6, 1.4);
    ctx.closePath();
    ctx.fill();
  } else if (districtId === 'medical') {
    ctx.fillRect(-1.2, -3.5, 2.4, 7);
    ctx.fillRect(-3.5, -1.2, 7, 2.4);
  } else if (districtId === 'bastion') {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      i === 0 ? ctx.moveTo(Math.cos(a) * 3.8, Math.sin(a) * 3.8) : ctx.lineTo(Math.cos(a) * 3.8, Math.sin(a) * 3.8);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderBackdropSea(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  meta: WorldMeta,
  layers: MapLayersData | null,
  theme: ThemeMode,
  locale: Locale = 'zh',
) {
  const { width: w, height: h } = camera;
  const isMid = theme === 'midnight';

  // 1. Rich ocean vignette gradient
  const grad = ctx.createRadialGradient(w * 0.48, h * 0.46, 60, w * 0.5, h * 0.5, Math.max(w, h) * 0.82);
  if (isMid) {
    grad.addColorStop(0, '#1B3550');
    grad.addColorStop(0.55, '#13263B');
    grad.addColorStop(1, '#0B1724');
  } else {
    grad.addColorStop(0, '#DAE8EE');
    grad.addColorStop(0.55, '#BFD4DF');
    grad.addColorStop(1, '#9CB9C9');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 2. Vintage engraved ocean wave glyphs (~) & subtle graticule
  ctx.save();
  ctx.strokeStyle = isMid ? 'rgba(130, 185, 224, 0.08)' : 'rgba(42, 74, 96, 0.09)';
  ctx.lineWidth = 1;
  const step = 450;
  const [wx0, wy1] = camera.screenToWorld(0, 0);
  const [wx1, wy0] = camera.screenToWorld(w, h);
  for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) {
    const [sx] = camera.worldToScreen(x, 0);
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
  }
  for (let y = Math.floor(wy0 / step) * step; y <= wy1; y += step) {
    const [, sy] = camera.worldToScreen(0, y);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
  }

  // Delicate engraved ocean wave curls
  ctx.strokeStyle = isMid ? 'rgba(148, 200, 236, 0.14)' : 'rgba(45, 86, 112, 0.15)';
  ctx.lineWidth = 1.1;
  const waveStep = 260;
  for (let gx = Math.floor(wx0 / waveStep) * waveStep; gx <= wx1; gx += waveStep) {
    for (let gy = Math.floor(wy0 / waveStep) * waveStep; gy <= wy1; gy += waveStep) {
      const hash = Math.sin(gx * 0.017 + gy * 0.023);
      if (hash < 0.25) continue;
      const [sx, sy] = camera.worldToScreen(gx + hash * 80, gy);
      ctx.beginPath();
      ctx.moveTo(sx - 10, sy);
      ctx.quadraticCurveTo(sx - 5, sy - 3, sx, sy);
      ctx.quadraticCurveTo(sx + 5, sy + 3, sx + 10, sy);
      ctx.stroke();
    }
  }

  // 3. Darkened fog-of-war neighboring countries (Canada, Mexico, Cuba, Bahamas)
  if (layers?.neighbor_land) {
    ctx.fillStyle = isMid ? 'rgba(42, 56, 56, 0.72)' : 'rgba(176, 186, 178, 0.45)';
    ctx.strokeStyle = isMid ? 'rgba(120, 155, 165, 0.22)' : 'rgba(92, 112, 118, 0.30)';
    ctx.lineWidth = 1;
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

  // 4. Glowing shallow coastal water halo beneath U.S. borders (midnight magic!)
  if (layers?.state_borders && isMid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(72, 164, 206, 0.22)';
    ctx.lineWidth = Math.max(8, camera.scale * 36);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const sb of layers.state_borders) {
      sb.pts.forEach(([px, py], i) => {
        const [sx, sy] = camera.worldToScreen(px, py);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
    }
    ctx.stroke();
    ctx.restore();
  }

  // 5. Brass-Framed Cartographic Inset Boxes for Alaska & Hawaii!
  for (const code of ['AK', 'HI'] as const) {
    const ins = meta.insets?.[code];
    if (!ins) continue;
    const [bx0, by0, bx1, by1] = ins.box;
    const [sx0, sy1] = camera.worldToScreen(bx0, by0);
    const [sx1, sy0] = camera.worldToScreen(bx1, by1);
    const bw = sx1 - sx0;
    const bh = sy1 - sy0;
    if (bw < 24 || bh < 24) continue;

    ctx.fillStyle = isMid ? 'rgba(14, 27, 42, 0.88)' : 'rgba(232, 240, 243, 0.62)';
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
        ? (code === 'AK' ? 'ALASKA (0.35×)' : 'HAWAII (1.0×)')
        : (code === 'AK' ? 'ALASKA · 阿拉斯加 (0.35×)' : 'HAWAII · 夏威夷 (1.0×)');
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
    advisorFuelFilters,
    advisorBubbles,
    hoveredBubbleId,
    showdownCities,
  } = rc;
  const { width: w, height: h, scale } = camera;
  const isMid = theme === 'midnight';

  ctx.clearRect(0, 0, w, h);
  const banners: BannerHitBox[] = [];
  const points: PointHitItem[] = [];

  const drawPolylineList = (lines: [number, number][][], stroke: string, lw: number, dash?: number[]) => {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
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

  // 1. Painterly Terrain Micro-Glyphs RIGHT ON THE 25 KM HEXES (Mountain peaks, Hills, Conifers, Crops!)
  if (!hasLens && !advisorBubbles && scale >= 0.2) {
    ctx.save();
    const rFactor = Math.min(1.5, scale * 2.4);
    for (let i = 0; i < world.n; i++) {
      const [sx, sy] = camera.worldToScreen(world.x[i], world.y[i]);
      if (sx < -24 || sx > w + 24 || sy < -24 || sy > h + 24) continue;
      const rPx = world.r[i] * scale;
      if (rPx < 2.2) continue;

      const rcls = world.rcls[i];
      const biome = world.biome[i];

      if (rcls >= 2) {
        // Crisp twin snow-capped mountain peak chevrons
        const mh = Math.min(8, rPx * 0.62);
        ctx.fillStyle = isMid ? 'rgba(28, 34, 40, 0.34)' : 'rgba(65, 58, 48, 0.28)';
        ctx.beginPath();
        ctx.moveTo(sx - mh * 0.85, sy + mh * 0.35);
        ctx.lineTo(sx - mh * 0.15, sy - mh * 0.72);
        ctx.lineTo(sx + mh * 0.65, sy + mh * 0.35);
        ctx.closePath();
        ctx.fill();

        // Snow cap highlight
        if (rcls === 3) {
          ctx.fillStyle = 'rgba(250, 250, 248, 0.72)';
          ctx.beginPath();
          ctx.moveTo(sx - mh * 0.42, sy - mh * 0.28);
          ctx.lineTo(sx - mh * 0.15, sy - mh * 0.72);
          ctx.lineTo(sx + mh * 0.18, sy - mh * 0.28);
          ctx.closePath();
          ctx.fill();
        }
      } else if (biome === 2 && (i & 1) === 0) {
        // Miniature pine conifer triangle pair
        const th = Math.min(5.5, rPx * 0.45);
        ctx.fillStyle = isMid ? 'rgba(18, 44, 24, 0.45)' : 'rgba(34, 62, 34, 0.32)';
        ctx.beginPath();
        ctx.moveTo(sx - th * 0.65, sy + th * 0.3);
        ctx.lineTo(sx - th * 0.2, sy - th * 0.65);
        ctx.lineTo(sx + th * 0.25, sy + th * 0.3);
        ctx.closePath();
        ctx.fill();
        if (rPx >= 4.5) {
          ctx.beginPath();
          ctx.moveTo(sx + th * 0.05, sy + th * 0.45);
          ctx.lineTo(sx + th * 0.48, sy - th * 0.38);
          ctx.lineTo(sx + th * 0.9, sy + th * 0.45);
          ctx.closePath();
          ctx.fill();
        }
      } else if (rcls === 1 && (i % 3) === 0 && rPx >= 3.2) {
        // Gentle curved hill-ridge arc
        const hr = Math.min(5, rPx * 0.42);
        ctx.strokeStyle = isMid ? 'rgba(25, 32, 24, 0.30)' : 'rgba(84, 72, 50, 0.26)';
        ctx.lineWidth = Math.max(0.8, 0.9 * rFactor);
        ctx.beginPath();
        ctx.arc(sx, sy + hr * 0.4, hr, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else if (biome === 1 && (i % 4) === 0 && rPx >= 4.5) {
        // Subtle plowed crop furrow ticks
        ctx.strokeStyle = isMid ? 'rgba(145, 130, 52, 0.32)' : 'rgba(140, 114, 42, 0.28)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy - 1);
        ctx.lineTo(sx + 3, sy - 1);
        ctx.moveTo(sx - 3, sy + 1.5);
        ctx.lineTo(sx + 3, sy + 1.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 2. Geological Shale Stipple on Oil & Gas Basin Hexes
  if (toggles.resources && !advisorBubbles && scale >= 0.22) {
    ctx.save();
    ctx.fillStyle = isMid ? 'rgba(232, 186, 90, 0.28)' : 'rgba(138, 78, 30, 0.26)';
    for (let i = 0; i < world.n; i++) {
      if (world.shale[i] !== 1) continue;
      const [sx, sy] = camera.worldToScreen(world.x[i], world.y[i]);
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
      const r = Math.max(1.1, world.r[i] * scale * 0.14);
      ctx.beginPath();
      ctx.arc(sx - r * 2, sy - r, r, 0, Math.PI * 2);
      ctx.arc(sx + r * 1.8, sy + r * 1.2, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (layers) {
    // 3. Protected Parks & Restricted Military Ground Hex Tints
    if (toggles.wonders && layers.protected_hex_ids.length > 0) {
      ctx.save();
      ctx.strokeStyle = isMid ? 'rgba(110, 212, 152, 0.55)' : 'rgba(42, 118, 76, 0.55)';
      ctx.fillStyle = isMid ? 'rgba(82, 194, 132, 0.14)' : 'rgba(42, 118, 76, 0.12)';
      ctx.lineWidth = Math.max(0.8, scale * 1.5);
      for (const hid of layers.protected_hex_ids) {
        const [sx, sy] = camera.worldToScreen(world.x[hid], world.y[hid]);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        drawHexOutline(ctx, sx, sy, world.r[hid] * scale * 0.96);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    if (toggles.military && layers.restricted_hex_ids.length > 0) {
      ctx.save();
      ctx.strokeStyle = isMid ? 'rgba(228, 126, 98, 0.58)' : 'rgba(130, 56, 46, 0.52)';
      ctx.fillStyle = isMid ? 'rgba(206, 96, 74, 0.14)' : 'rgba(148, 62, 48, 0.12)';
      ctx.lineWidth = Math.max(0.8, scale * 1.5);
      ctx.setLineDash([3, 2]);
      for (const hid of layers.restricted_hex_ids) {
        const [sx, sy] = camera.worldToScreen(world.x[hid], world.y[hid]);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        drawHexOutline(ctx, sx, sy, world.r[hid] * scale * 0.96);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Great Lakes & Glowing Sky-Cerulean Rivers
    ctx.save();
    ctx.fillStyle = isMid ? '#266596' : '#8EB5CA';
    ctx.strokeStyle = isMid ? '#64B2DE' : '#5E8CA6';
    ctx.lineWidth = 1.1;
    for (const lk of layers.lakes) {
      ctx.beginPath();
      lk.pts.forEach(([x, y], i) => {
        const [sx, sy] = camera.worldToScreen(x, y);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    drawPolylineList(
      layers.rivers,
      isMid ? 'rgba(104, 186, 232, 0.65)' : 'rgba(54, 114, 154, 0.58)',
      Math.max(1.1, Math.min(2.8, scale * 3.6)),
    );

    // 5. Crisp Antique Gold State Borders
    if (toggles.borders) {
      ctx.save();
      ctx.strokeStyle = isMid ? 'rgba(226, 194, 122, 0.42)' : 'rgba(42, 50, 58, 0.36)';
      ctx.lineWidth = Math.max(0.95, Math.min(2.0, scale * 2.4));
      ctx.beginPath();
      for (const sb of layers.state_borders) {
        sb.pts.forEach(([x, y], i) => {
          const [sx, sy] = camera.worldToScreen(x, y);
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
      }
      ctx.stroke();
      ctx.restore();
    }

    // 6. Antique Translucent Serif State Names painted across the continent (under banners!)
    if (toggles.borders && scale >= 0.16 && scale <= 1.15) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontSize = Math.max(9.5, Math.min(18, scale * 44));
      ctx.font = `600 ${fontSize}px "Fraunces", Georgia, serif`;
      for (const st of states) {
        if (STATE_LABEL_SKIP.has(st.abbr)) continue;
        const [sx, sy] = camera.worldToScreen(st.x, st.y);
        if (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) continue;
        const txt = st.name.toUpperCase().split('').join(' ');
        ctx.fillStyle = isMid ? 'rgba(10, 16, 24, 0.58)' : 'rgba(255, 250, 240, 0.62)';
        ctx.fillText(txt, sx + 1, sy + 1);
        ctx.fillStyle = isMid ? 'rgba(244, 234, 206, 0.58)' : 'rgba(42, 48, 56, 0.48)';
        ctx.fillText(txt, sx, sy);
      }
      ctx.restore();
    }

    // 7. Railroads & Interstate Highways
    if (toggles.rail && scale >= 0.34) {
      drawPolylineList(
        layers.rail_main,
        isMid ? 'rgba(195, 188, 174, 0.34)' : 'rgba(72, 66, 58, 0.36)',
        Math.max(0.9, scale * 1.4),
        [3, 4],
      );
    }
    if (toggles.roads && scale >= 0.28) {
      const rw = Math.max(1.5, Math.min(3.6, scale * 3.4));
      drawPolylineList(layers.roads_primary, isMid ? 'rgba(92, 64, 30, 0.72)' : 'rgba(110, 72, 34, 0.62)', rw + 1.4);
      drawPolylineList(layers.roads_primary, isMid ? 'rgba(232, 186, 102, 0.74)' : 'rgba(244, 212, 134, 0.85)', rw);
      if (scale >= 0.72) {
        drawPolylineList(layers.roads_secondary, isMid ? 'rgba(205, 168, 108, 0.35)' : 'rgba(166, 118, 62, 0.38)', 1.1);
      }
    }

    // 8. FAF5 Interstate Freight Trade Route Arcs
    if (toggles.trade && layers.trade.routes.length > 0) {
      ctx.save();
      const maxVal = layers.trade.routes[0].value_musd || 1;
      for (const rt of layers.trade.routes) {
        const [x0, y0] = camera.worldToScreen(rt.ox, rt.oy);
        const [x1, y1] = camera.worldToScreen(rt.dx, rt.dy);
        const mx = (x0 + x1) * 0.5;
        const my = (y0 + y1) * 0.5;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.hypot(dx, dy) || 1;
        const bend = Math.min(95, dist * 0.22);
        const cx = mx - (dy / dist) * bend * 0.5;
        const cy = my - Math.abs(dx / dist) * bend * 0.7 - 16;

        const wNorm = 0.35 + 0.65 * Math.sqrt(rt.value_musd / maxVal);
        ctx.strokeStyle = isMid ? `rgba(88, 214, 224, ${0.38 + wNorm * 0.48})` : `rgba(22, 128, 148, ${0.35 + wNorm * 0.48})`;
        ctx.lineWidth = 1.2 + wNorm * 3.4;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = isMid ? '#7DF0F7' : '#168094';
        ctx.beginPath();
        ctx.arc(x1, y1, 2.5 + wNorm * 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 9. Resources: Diamond Power Beacons & Faceted Ore Prisms (skipped when Advisor proportional bubble layer replaces them)
    if (toggles.resources && !advisorBubbles) {
      const maxPlants = advisorFuelFilters ? 420 : scale < 0.35 ? 68 : scale < 0.7 ? 190 : 520;
      let drawnP = 0;
      for (const pl of layers.power_plants) {
        if (advisorFuelFilters && !advisorFuelFilters.has(pl.fuel)) continue;
        if (drawnP >= maxPlants) break;
        const [sx, sy] = camera.worldToScreen(pl.x, pl.y);
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
        const sz = Math.max(4.5, Math.min(9.5, 4.2 + Math.log10(Math.max(50, pl.mw)) * 1.4));
        drawPowerBeacon(ctx, sx, sy, sz, pl.fuel, theme);
        points.push({ item: { kind: 'power', plant: pl }, sx, sy, radiusPx: sz + 4 });
        drawnP++;
      }

      if (!advisorFuelFilters && scale >= 0.28) {
        const maxMines = scale < 0.65 ? 95 : 300;
        for (let i = 0; i < Math.min(maxMines, layers.mines.length); i++) {
          const m = layers.mines[i];
          const [sx, sy] = camera.worldToScreen(m.x, m.y);
          if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
          const r = scale < 0.65 ? 5.2 : 6.4;
          drawOrePrism(ctx, sx, sy, r, m.commodity);
          points.push({ item: { kind: 'mine', mine: m }, sx, sy, radiusPx: r + 4 });
        }
      }
    }

    // 10. Maritime Ports & FAA Aviation Hubs
    if (toggles.hubs && !advisorBubbles && scale >= 0.3) {
      const maxPorts = scale < 0.7 ? 32 : 95;
      for (let i = 0; i < Math.min(maxPorts, layers.ports.length); i++) {
        const p = layers.ports[i];
        const [sx, sy] = camera.worldToScreen(p.x, p.y);
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
        drawPortBadge(ctx, sx, sy, 6.2);
        points.push({ item: { kind: 'port', port: p }, sx, sy, radiusPx: 10 });
      }
      const maxAir = scale < 0.65 ? 36 : 130;
      for (let i = 0; i < Math.min(maxAir, layers.airports.length); i++) {
        const a = layers.airports[i];
        const [sx, sy] = camera.worldToScreen(a.x, a.y);
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
        drawAirportBadge(ctx, sx, sy, 6.6, scale >= 0.85 ? a.code : undefined);
        points.push({ item: { kind: 'airport', airport: a }, sx, sy, radiusPx: 11 });
      }
    }

    // 11. Military Bases (DoD MIRTA Pentagonal Star-Forts)
    if (toggles.military && !advisorBubbles && scale >= 0.28) {
      const maxMil = scale < 0.65 ? 65 : 220;
      for (let i = 0; i < Math.min(maxMil, layers.military_bases.length); i++) {
        const b = layers.military_bases[i];
        const [sx, sy] = camera.worldToScreen(b.x, b.y);
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
        drawMilitaryFort(ctx, sx, sy, scale < 0.65 ? 6.0 : 7.4);
        points.push({ item: { kind: 'military', base: b }, sx, sy, radiusPx: 10 });
      }
    }

    // 12. Open-Rule Wonders
    if (toggles.wonders && !advisorBubbles) {
      const wScale = scale < 0.35 ? 0.78 : scale < 0.8 ? 0.92 : 1.06;
      for (const wd of layers.wonders) {
        if (scale < 0.3 && wd.rank > 10 && wd.kind !== 'natural') continue;
        const [sx, sy] = camera.worldToScreen(wd.x, wd.y);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        drawWonderStamp(ctx, sx, sy, wd.kind, wScale);
        points.push({ item: { kind: 'wonder', wonder: wd }, sx, sy, radiusPx: 13 * wScale });
      }
    }
  }

  // 13. LIVE PROPORTIONAL ADVISOR BUBBLE OVERLAYS (Energy MW, Economy GDP, Military, Wonders!)
  if (advisorBubbles && advisorBubbles.length > 0) {
    ctx.save();
    // Draw largest bubbles first so small overlapping nodes remain crisp on top; draw hovered bubble last with bright halo
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
      ctx.globalAlpha = 0.74;
      ctx.beginPath();
      ctx.arc(sx, sy, b.radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = b.stroke ?? 'rgba(14, 22, 32, 0.88)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    if (hoverBubble) {
      const [sx, sy] = camera.worldToScreen(hoverBubble.x, hoverBubble.y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hoverBubble.color;
      ctx.beginPath();
      ctx.arc(sx, sy, hoverBubble.radiusPx + 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFF6D6';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // Callout label pill right over hovered bubble
      const txt = hoverBubble.sublabel ? `${hoverBubble.label} · ${hoverBubble.sublabel}` : hoverBubble.label;
      ctx.font = '700 11px "Inter", "PingFang SC", sans-serif';
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(14, 22, 32, 0.94)';
      ctx.strokeStyle = '#E5C068';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(sx - tw / 2 - 8, sy - hoverBubble.radiusPx - 28, tw + 16, 20, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFF8E6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, sx, sy - hoverBubble.radiusPx - 18);
    }
    ctx.restore();
  }

  // 14. Selected City Territory Glow & Placed 2.5D Isometric District Miniatures
  if (selectedCity) {
    ctx.save();
    ctx.strokeStyle = isMid ? '#F2C96B' : '#B07D28';
    ctx.lineWidth = Math.max(1.4, scale * 2.2);
    for (const hid of selectedCity.hex_ids) {
      const [sx, sy] = camera.worldToScreen(world.x[hid], world.y[hid]);
      drawHexOutline(ctx, sx, sy, world.r[hid] * scale * 0.98);
      ctx.stroke();
    }
    ctx.restore();
    for (const dist of selectedCity.districts) {
      const [sx, sy] = camera.worldToScreen(dist.x, dist.y);
      drawDistrictMiniature(ctx, sx, sy - 4, dist.id, 1.15, localizeDistrictName(dist.id, dist.name, rc.locale));
    }
  } else if (!advisorBubbles && scale >= 1.15) {
    for (let i = 0; i < Math.min(180, cities.length); i++) {
      const c = cities[i];
      const d = c.districts[0];
      if (!d) continue;
      const [sx, sy] = camera.worldToScreen(d.x, d.y);
      if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
      drawDistrictMiniature(ctx, sx, sy - 14, d.id, 0.82);
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

  // 15. Hovered Hex Crisp Outline
  if (hoveredHexId >= 0 && hoveredHexId < world.n) {
    const [sx, sy] = camera.worldToScreen(world.x[hoveredHexId], world.y[hoveredHexId]);
    ctx.save();
    ctx.strokeStyle = isMid ? '#FFE28F' : '#1D242B';
    ctx.lineWidth = 2.0;
    drawHexOutline(ctx, sx, sy, world.r[hoveredHexId] * scale);
    ctx.stroke();
    ctx.restore();
  }

  // 16. Upgraded Civ-Style State-Heraldic City Banners ([State-Color Pop + Growth ▴/▾] [★ Name] [District Medallion])
  if (toggles.banners) {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const overlaps = (x0: number, y0: number, x1: number, y1: number) => {
      for (let k = 0; k < placed.length; k++) {
        const b = placed[k];
        if (x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) return true;
      }
      return false;
    };

    const maxCities = scale < 0.28 ? 44 : scale < 0.45 ? 110 : scale < 0.8 ? 260 : cities.length;
    const detailed = scale >= 0.46;

    // Always include Anchorage (AK) & Honolulu (HI) so brass insets showcase their iconic city banners!
    const candidates: CityRecord[] = cities.slice(0, Math.min(maxCities, cities.length));
    for (const pinnedId of ['11260', '26180']) {
      if (!candidates.some((c) => c.id === pinnedId)) {
        const found = cities.find((c) => c.id === pinnedId);
        if (found) candidates.push(found);
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (selectedCity && c.id === selectedCity.id) continue;
      const [sx, sy] = camera.worldToScreen(c.x, c.y);
      if (sx < -120 || sx > w + 120 || sy < -40 || sy > h + 40) continue;

      const popTier =
        c.pop >= 10_000_000
          ? `${Math.round(c.pop / 1e6)}M`
          : c.pop >= 1_000_000
            ? `${(c.pop / 1e6).toFixed(1)}M`
            : `${Math.round(c.pop / 1000)}K`;
      const isCap = c.id === '47900';
      const label = (isCap ? '★ ' : '') + c.short_name.toUpperCase();
      const grow = c.pop_growth_pct ?? 0;

      ctx.font = detailed ? '700 10.5px "Fraunces", Georgia, serif' : '700 9.5px "Fraunces", Georgia, serif';
      const tw = ctx.measureText(label).width;
      const pillW = 39;
      const bh = detailed ? 23 : 20;
      const bw = Math.round(pillW + tw + 26);
      const x0 = Math.round(sx - bw * 0.5);
      const y0 = Math.round(sy - bh * 0.5);
      const x1 = x0 + bw;
      const y1 = y0 + bh;

      if (overlaps(x0 - 4, y0 - 3, x1 + 4, y1 + 3)) continue;
      placed.push({ x0, y0, x1, y1 });
      banners.push({ city: c, x0, y0, x1, y1 });

      const herald = STATE_HERALDIC_COLORS[c.state_abbr] ?? '#4E9482';

      ctx.save();
      // Subtle drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.roundRect(x0 + 1, y0 + 2, bw, bh, 10);
      ctx.fill();

      // Main dark slate banner capsule with antique brass border
      ctx.fillStyle = 'rgba(18, 26, 36, 0.94)';
      ctx.strokeStyle = c.pop >= 2_000_000 ? '#D4AE5E' : 'rgba(202, 170, 100, 0.65)';
      ctx.lineWidth = c.pop >= 2_000_000 ? 1.4 : 1.0;
      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, bh, 10);
      ctx.fill();
      ctx.stroke();

      // Left State-Heraldic Population Pill
      ctx.fillStyle = herald;
      ctx.beginPath();
      ctx.roundRect(x0 + 1.5, y0 + 1.5, pillW, bh - 3, [8.5, 4, 4, 8.5]);
      ctx.fill();

      // Population + PEP Growth Trend Chevron
      ctx.fillStyle = '#0F1822';
      ctx.font = '800 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const arrow = grow > 0.015 ? '▴' : grow < -0.005 ? '▾' : '';
      ctx.fillText(`${popTier}${arrow}`, x0 + 1.5 + pillW * 0.5, y0 + bh * 0.5 + 0.5);

      // Crisp Ivory Serif City Name
      ctx.textAlign = 'left';
      ctx.fillStyle = isCap ? '#F5D576' : '#F6EFE0';
      ctx.font = detailed ? '700 10.5px "Fraunces", Georgia, serif' : '700 9.5px "Fraunces", Georgia, serif';
      ctx.fillText(label, x0 + pillW + 6, y0 + bh * 0.5 + 0.5);

      // Right Circular Primary District Medallion
      drawMiniDistrictIcon(ctx, x1 - 10, y0 + bh * 0.5, c.primary_district);
      ctx.restore();
    }
  }

  return { banners, points };
}
