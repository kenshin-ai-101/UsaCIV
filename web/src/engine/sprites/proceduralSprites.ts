/**
 * Original Procedural Vector Sprite Painters for TERRA AMERICANA
 * Completely original WPA / Architectural Diorama geometric language:
 *  - 10 Isometric District Miniatures (Campus, Foundry, Exchange, Refinery, Harbor, Aero-Hub, Medical, Promenade, Capitol, Bastion)
 *  - Diamond Power Beacons (EIA-860M)
 *  - Faceted Hexagonal Ore Prisms (MSHA / EIA Coal)
 *  - Postage-Stamp Natural Wonders, Laurel Academic Shields, Bronze Heritage Plaques
 *  - Pentagonal Military Star-Forts, Maritime Anchors & Aviation Chevrons
 */
import type { ThemeMode } from '../../types/world';

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

/** 1. Diamond Power Beacon (distinct sharp rhombus silhouette for EIA-860M plants) */
export function drawPowerBeacon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fuel: string,
  theme: ThemeMode,
) {
  const c = FUEL_COLORS[fuel] ?? FUEL_COLORS.other;
  ctx.save();
  ctx.translate(x, y);

  // Crisp drop shadow
  ctx.fillStyle = theme === 'midnight' ? 'rgba(0,0,0,0.62)' : 'rgba(20,30,38,0.28)';
  ctx.beginPath();
  ctx.moveTo(0, -size + 1.5);
  ctx.lineTo(size, 1.5);
  ctx.lineTo(0, size + 1.5);
  ctx.lineTo(-size, 1.5);
  ctx.closePath();
  ctx.fill();

  // Diamond body
  ctx.fillStyle = c.fill;
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Top-right light facet
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  // Inner micro-glyph
  ctx.fillStyle = c.glyph;
  ctx.strokeStyle = c.glyph;
  const g = size * 0.44;
  if (fuel === 'wind') {
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * g * 1.1, Math.sin(a) * g * 1.1);
      ctx.stroke();
    }
  } else if (fuel === 'solar') {
    ctx.beginPath();
    ctx.arc(0, 0, g * 0.58, 0, Math.PI * 2);
    ctx.fill();
  } else if (fuel === 'nuclear') {
    ctx.beginPath();
    ctx.arc(0, 0, g * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, g * 0.82, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Classic crisp lightning bolt
    ctx.beginPath();
    ctx.moveTo(g * 0.18, -g);
    ctx.lineTo(-g * 0.55, g * 0.08);
    ctx.lineTo(g * 0.05, g * 0.08);
    ctx.lineTo(-g * 0.2, g);
    ctx.lineTo(g * 0.55, -g * 0.08);
    ctx.lineTo(-g * 0.05, -g * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 2. Faceted Hexagonal Ore Prism (distinct 3-facet crystal for MSHA / EIA Coal mines) */
export function drawOrePrism(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  commodity: string,
) {
  const c = MINE_COLORS[commodity] ?? MINE_COLORS.other;
  ctx.save();
  ctx.translate(x, y);
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  // Top facet
  ctx.fillStyle = c.top;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(pts[5][0], pts[5][1]);
  ctx.lineTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.closePath();
  ctx.fill();

  // Left facet
  ctx.fillStyle = c.left;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(pts[3][0], pts[3][1]);
  ctx.lineTo(pts[4][0], pts[4][1]);
  ctx.lineTo(pts[5][0], pts[5][1]);
  ctx.closePath();
  ctx.fill();

  // Right dark facet
  ctx.fillStyle = c.right;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.lineTo(pts[3][0], pts[3][1]);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(25,20,16,0.75)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** 3. Three-tier Original Wonder Medallions (Postage Stamp / Academic Shield / Heritage Bronze Plaque) */
export function drawWonderStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: 'natural' | 'academic' | 'heritage',
  scale = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (kind === 'natural') {
    // WPA National Park serrated postage stamp
    ctx.fillStyle = 'rgba(20,24,28,0.32)';
    ctx.fillRect(-11, -8, 22, 18);

    ctx.fillStyle = '#F7F1E2';
    ctx.strokeStyle = '#B08234';
    ctx.lineWidth = 1.6;
    ctx.fillRect(-11.5, -9.5, 23, 19);
    ctx.setLineDash([2.5, 1.5]);
    ctx.strokeRect(-11.5, -9.5, 23, 19);
    ctx.setLineDash([]);

    // Sunset sky + mountain silhouette inside stamp
    ctx.fillStyle = '#D98E5F';
    ctx.fillRect(-8.5, -6.5, 17, 13);
    ctx.fillStyle = '#4B3629';
    ctx.beginPath();
    ctx.moveTo(-8.5, 6.5);
    ctx.lineTo(-2.5, -2.5);
    ctx.lineTo(2.5, 3);
    ctx.lineTo(5.5, -1);
    ctx.lineTo(8.5, 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FAF0CA';
    ctx.beginPath();
    ctx.arc(4.2, -3.4, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'academic') {
    // Ivory & Cobalt Academic Crest Shield
    ctx.fillStyle = '#24588A';
    ctx.strokeStyle = '#E5C068';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-9, -10);
    ctx.lineTo(9, -10);
    ctx.lineTo(9, 1);
    ctx.quadraticCurveTo(9, 9, 0, 12);
    ctx.quadraticCurveTo(-9, 9, -9, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Spire & Book icon
    ctx.fillStyle = '#F7F2E6';
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.5, -1);
    ctx.lineTo(2.5, -1);
    ctx.lineTo(2.5, 6);
    ctx.lineTo(-2.5, 6);
    ctx.lineTo(-2.5, -1);
    ctx.lineTo(-4.5, -1);
    ctx.closePath();
    ctx.fill();
  } else {
    // Burnished Bronze Heritage Landmark Plaque
    ctx.fillStyle = '#7A542E';
    ctx.strokeStyle = '#E8C57B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-10, -8.5, 20, 17, 4);
    ctx.fill();
    ctx.stroke();

    // Classical columns
    ctx.fillStyle = '#F6EBCE';
    ctx.fillRect(-6.5, -4, 13, 1.8);
    ctx.fillRect(-5, -1.5, 2, 5.5);
    ctx.fillRect(-1, -1.5, 2, 5.5);
    ctx.fillRect(3, -1.5, 2, 5.5);
    ctx.fillRect(-6.5, 4.5, 13, 1.6);
  }
  ctx.restore();
}

/** 4. Pentagonal Star-Fort for DoD MIRTA Bases */
export function drawMilitaryFort(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#3F4F5F';
  ctx.strokeStyle = '#E5DEC9';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner brass star dot
  ctx.fillStyle = '#E0B556';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 5. Maritime Harbor & Aero-Hub Badges */
export function drawPortBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#1D6B7D';
  ctx.strokeStyle = '#F3EFE4';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, 3);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#F3EFE4';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.55);
  ctx.lineTo(0, r * 0.55);
  ctx.moveTo(-r * 0.42, -r * 0.2);
  ctx.lineTo(r * 0.42, -r * 0.2);
  ctx.arc(0, r * 0.15, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function drawAirportBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, code?: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#2B5B87';
  ctx.strokeStyle = '#F3EFE4';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Crisp airplane silhouette
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.62);
  ctx.lineTo(r * 0.16, -r * 0.15);
  ctx.lineTo(r * 0.62, r * 0.1);
  ctx.lineTo(r * 0.62, r * 0.25);
  ctx.lineTo(r * 0.14, r * 0.12);
  ctx.lineTo(r * 0.12, r * 0.45);
  ctx.lineTo(r * 0.34, r * 0.58);
  ctx.lineTo(0, r * 0.5);
  ctx.lineTo(-r * 0.34, r * 0.58);
  ctx.lineTo(-r * 0.12, r * 0.45);
  ctx.lineTo(-r * 0.14, r * 0.12);
  ctx.lineTo(-r * 0.62, r * 0.25);
  ctx.lineTo(-r * 0.62, r * 0.1);
  ctx.lineTo(-r * 0.16, -r * 0.15);
  ctx.closePath();
  ctx.fill();

  if (code) {
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1D242B';
    ctx.fillRect(-13, r + 2, 26, 11);
    ctx.fillStyle = '#F7F1E2';
    ctx.fillText(code, 0, r + 10.5);
  }
  ctx.restore();
}

/** 6. 10 Original 2.5D Isometric Architectural District Miniatures (for City View & Zoomed Metro View!) */
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

  // Isometric pedestal plate
  ctx.fillStyle = 'rgba(24, 32, 40, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F6F0E3';
  ctx.strokeStyle = '#B08234';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(16, 4);
  ctx.lineTo(0, -4);
  ctx.lineTo(-16, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (districtId === 'campus') {
    // Observatory dome + academic spire
    ctx.fillStyle = '#29669C';
    ctx.fillRect(-9, -4, 18, 9);
    ctx.fillStyle = '#F7F2E8';
    ctx.strokeStyle = '#29669C';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -4, 9, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#D4A243';
    ctx.beginPath();
    ctx.arc(0, -14, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (districtId === 'foundry') {
    // Sawtooth industrial factory + twin stacks
    ctx.fillStyle = '#B85636';
    ctx.strokeStyle = '#592313';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-11, 5);
    ctx.lineTo(-11, -5);
    ctx.lineTo(-4, -1);
    ctx.lineTo(-4, -5);
    ctx.lineTo(3, -1);
    ctx.lineTo(3, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4B433E';
    ctx.fillRect(5, -13, 3.5, 18);
    ctx.fillRect(10, -9, 3, 14);
  } else if (districtId === 'exchange') {
    // Art-Deco stepped financial skyscraper
    ctx.fillStyle = '#C69128';
    ctx.strokeStyle = '#4D360C';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-8, -5, 16, 11);
    ctx.strokeRect(-8, -5, 16, 11);
    ctx.fillRect(-5.5, -12, 11, 7);
    ctx.strokeRect(-5.5, -12, 11, 7);
    ctx.fillRect(-2.5, -18, 5, 6);
    ctx.fillStyle = '#FFF3C4';
    ctx.fillRect(-4, -10, 2, 3);
    ctx.fillRect(2, -10, 2, 3);
  } else if (districtId === 'refinery') {
    ctx.fillStyle = '#C97528';
    ctx.fillRect(-9, -12, 4, 17);
    ctx.fillRect(-3, -16, 4, 21);
    ctx.fillStyle = '#E8DFCF';
    ctx.strokeStyle = '#6E3C12';
    ctx.beginPath();
    ctx.arc(7, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (districtId === 'harbor') {
    // Maritime gantry crane
    ctx.strokeStyle = '#1D6B7D';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-7, 6);
    ctx.lineTo(-7, -12);
    ctx.lineTo(10, -12);
    ctx.moveTo(-7, -6);
    ctx.lineTo(2, -12);
    ctx.stroke();
    ctx.fillStyle = '#C96A47';
    ctx.fillRect(2, -5, 8, 5);
  } else if (districtId === 'aerohub') {
    // Swept ATC control tower
    ctx.fillStyle = '#3874A8';
    ctx.beginPath();
    ctx.moveTo(-3, 6);
    ctx.lineTo(-2, -8);
    ctx.lineTo(2, -8);
    ctx.lineTo(3, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F7F2E8';
    ctx.strokeStyle = '#24588A';
    ctx.beginPath();
    ctx.moveTo(-9, -8);
    ctx.lineTo(9, -8);
    ctx.lineTo(6, -14);
    ctx.lineTo(-6, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (districtId === 'medical') {
    ctx.fillStyle = '#F7F2E8';
    ctx.strokeStyle = '#317E5E';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-9, -9, 18, 14);
    ctx.strokeRect(-9, -9, 18, 14);
    ctx.fillStyle = '#317E5E';
    ctx.fillRect(-2, -6.5, 4, 9);
    ctx.fillRect(-4.5, -4, 9, 4);
  } else if (districtId === 'promenade') {
    // Deco neon arch spire
    ctx.fillStyle = '#93456E';
    ctx.strokeStyle = '#F6DC88';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 4, 10, Math.PI, 0);
    ctx.lineTo(10, 6);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#F6DC88';
    ctx.beginPath();
    ctx.arc(0, -10, 2.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (districtId === 'capitol') {
    // Classical rotunda dome
    ctx.fillStyle = '#F7F2E6';
    ctx.strokeStyle = '#5C544B';
    ctx.lineWidth = 1.3;
    ctx.fillRect(-10, -2, 20, 8);
    ctx.strokeRect(-10, -2, 20, 8);
    ctx.beginPath();
    ctx.arc(0, -2, 7.5, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-1, -13, 2, 4);
  } else {
    // Military bastion star-fort
    drawMilitaryFort(ctx, 0, -2, 10);
  }

  if (label) {
    ctx.font = '700 10px "Inter", "PingFang SC", sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(22, 29, 36, 0.88)';
    ctx.beginPath();
    ctx.roundRect(-tw / 2 - 6, 13, tw + 12, 16, 4);
    ctx.fill();
    ctx.strokeStyle = '#C89B4B';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#F7F1E3';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 24.5);
  }
  ctx.restore();
}
