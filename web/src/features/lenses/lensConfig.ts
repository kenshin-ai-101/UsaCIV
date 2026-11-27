import type { LensMeta, Locale, ThemeMode } from '../../types/world';

export const LENS_GROUPS: { id: LensMeta['group']; label: string; labelEn: string }[] = [
  { id: 'people', label: '人口结构', labelEn: 'People' },
  { id: 'prosperity', label: '经济与住房', labelEn: 'Economy & Housing' },
  { id: 'knowledge', label: '科技与知识', labelEn: 'Knowledge' },
  { id: 'life', label: '日常生活', labelEn: 'Daily Life' },
  { id: 'defense', label: '国防与军工', labelEn: 'Defense & Military' },
  { id: 'hazards', label: '灾害风险', labelEn: 'Hazards' },
  { id: 'faith', label: '宗教信仰', labelEn: 'Faith' },
  { id: 'land', label: '地表覆被', labelEn: 'Land Cover' },
];

export const QUICK_LENS_IDS = ['density', 'income', 'bachelors'];

export type Rgb255 = [number, number, number];

// Exact 19 Data Lens 6-stop color ramps aligned 1:1 with reference cartography
export const COLOR_RAMPS: Record<string, string[]> = {
  density:       ['#1b1035', '#4b2377', '#9a3b8a', '#e0645e', '#f9b24a', '#fff3a8'],
  income:        ['#3a1c0b', '#7a4413', '#b8781f', '#e3b23c', '#f6e27f', '#fffbe0'],
  home:          ['#0b2a2e', '#165a5c', '#2f8f83', '#7cc29a', '#d4ecb0', '#ffffe0'],
  poverty:       ['#03051a', '#4c1d4b', '#a11a5b', '#e83f3f', '#f69c73', '#faebdd'],
  age:           ['#00224e', '#35456c', '#666970', '#948e77', '#c8b866', '#fee838'],
  foreign_born:  ['#0b0405', '#382a54', '#395d9c', '#3497a9', '#60ceac', '#def5e5'],
  bachelors:     ['#08203e', '#0f4c81', '#2a7fc1', '#5fa8e0', '#a6d1f2', '#eaf5ff'],
  broadband:     ['#1a0a2e', '#3f1d6b', '#6a3fa0', '#9a72c9', '#c9a9e6', '#f3e8ff'],
  commute:       ['#2b0b1e', '#5e1742', '#93275f', '#c84f7c', '#ea8fa8', '#fbd9e1'],
  homeownership: ['#1c1a05', '#45410f', '#76701d', '#a8a033', '#d4ce62', '#f8f6c4'],
  uninsured:     ['#1a0505', '#4a0f0f', '#80201a', '#b8452b', '#e07b54', '#f9c9a8'],
  forest:        ['#0b1f0f', '#14401c', '#1f6b2b', '#3a9443', '#7fc07a', '#d5efcd'],
  farmland:      ['#141d05', '#2f4510', '#557019', '#84a02a', '#b8cf55', '#eef7b8'],
  developed:     ['#121218', '#2c2c3c', '#4b4b66', '#727294', '#a3a3c2', '#e2e2f0'],
  faith:         ['#1a1033', '#3d2466', '#6b3d8f', '#a5649c', '#d99a8f', '#f7dca0'],
  amenities:     ['#3b0a1e', '#7a1f3d', '#b9534f', '#e3a35c', '#c9d97a', '#7ecf8e'],
  disasters:     ['#14161f', '#2e2a4a', '#5b3466', '#93405f', '#cf6a4a', '#f4b860'],
  veterans:           ['#0d1a12', '#1f3d2a', '#3b6340', '#6b8a4e', '#a9b46a', '#ece2a6'],
  // 8 Incremental Lenses (5 county-level + 3 state-level macro)
  pop_growth:         ['#6b102c', '#b93148', '#e37e6c', '#e6e2cf', '#6fc7a5', '#1d8f86', '#0b4f6c'],
  gdp_per_cap:        ['#1c1108', '#542d12', '#9e5318', '#d98a24', '#f4c852', '#fff8cc'],
  avg_wage:           ['#0e1b2e', '#1b4363', '#237487', '#3ea68e', '#9dd680', '#f4f7c5'],
  affordability:      ['#113838', '#276b62', '#7ca362', '#d8b44c', '#df6d3b', '#a81c2e'],
  armed_forces_pct:   ['#0e1522', '#20324f', '#385b82', '#648db3', '#b8b778', '#f5da74'],
  defense_pct_gdp:    ['#141921', '#2b3648', '#4d5d6e', '#82876b', '#c6a452', '#f8dc7c'],
  mil_active_density: ['#0d181a', '#1b3a3e', '#2f6563', '#569478', '#a3c474', '#f0eba0'],
  noaa_billion_cost:  ['#141222', '#3c1e42', '#7d2948', '#c44b3b', '#ec8a3d', '#fce08a'],
  // Legacy aliases for backwards safety
  wealth:        ['#3a1c0b', '#7a4413', '#b8781f', '#e3b23c', '#f6e27f', '#fffbe0'],
  knowledge:     ['#08203e', '#0f4c81', '#2a7fc1', '#5fa8e0', '#a6d1f2', '#eaf5ff'],
  risk:          ['#03051a', '#4c1d4b', '#a11a5b', '#e83f3f', '#f69c73', '#faebdd'],
  urban:         ['#121218', '#2c2c3c', '#4b4b66', '#727294', '#a3a3c2', '#e2e2f0'],
};

// Exact 12-class NLCD Cover IDs & RGB colors (0=none, 1..11)
export const COVER = {
  NONE: 0,
  DECIDUOUS: 1,
  EVERGREEN: 2,
  MIXED: 3,
  SCRUB: 4,
  GRASS: 5,
  PASTURE: 6,
  CROP: 7,
  WETLAND: 8,
  URBAN: 9,
  BARREN: 10,
  ICE: 11,
} as const;

export const COVER_HEX: (string | null)[] = [
  null,
  '#4f7a35', // 1 deciduous forest
  '#2f5f3a', // 2 evergreen forest
  '#436d36', // 3 mixed forest
  '#b8a26a', // 4 scrub & desert
  '#9fb35a', // 5 grassland
  '#a8b862', // 6 pasture & hay
  '#c2b65c', // 7 cropland
  '#4f7f68', // 8 wetland
  '#8c8780', // 9 urban
  '#b9ab94', // 10 barren
  '#e8eef2', // 11 ice & snow
];

export const COVER_RGB: (Rgb255 | null)[] = COVER_HEX.map((h) => (h ? parseHex255(h) : null));

const ELEV_STOPS: [number, Rgb255][] = [
  [-100, '#5d8a39'],
  [250, '#7c9744'],
  [700, '#a39c58'],
  [1400, '#b09366'],
  [2200, '#9a8068'],
  [3000, '#8c8078'],
  [3800, '#d8dde0'],
].map(([e, h]) => [e as number, parseHex255(h as string)]);

export function elevColor255(elev: number): Rgb255 {
  if (elev <= ELEV_STOPS[0][0]) return ELEV_STOPS[0][1];
  for (let k = 1; k < ELEV_STOPS.length; k++) {
    const [e1, c1] = ELEV_STOPS[k];
    if (elev <= e1) {
      const [e0, c0] = ELEV_STOPS[k - 1];
      const t = (elev - e0) / (e1 - e0);
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ];
    }
  }
  return ELEV_STOPS[ELEV_STOPS.length - 1][1];
}

// Exact 12-color Civ-style State Palette (used for state border inner bands, city banner caps & crowns)
export const STATE_PALETTE_HEX: string[] = [
  '#d8483f',
  '#3b7dd8',
  '#e2b23a',
  '#3aa865',
  '#9a58d0',
  '#e57c32',
  '#2fb3b0',
  '#d9549b',
  '#8cb83a',
  '#5b6fd8',
  '#b8653a',
  '#56c1e6',
];
export const STATE_PALETTE_RGB: Rgb255[] = STATE_PALETTE_HEX.map(parseHex255);

// Fallback graph-colored Civ state palette by state abbreviation (neighboring states stay distinct!)
export const STATE_HERALDIC_COLORS: Record<string, string> = {
  WA: '#5b6fd8', OR: '#d9549b', CA: '#3aa865', NV: '#e57c32', ID: '#e2b23a',
  MT: '#3b7dd8', WY: '#2fb3b0', UT: '#2fb3b0', AZ: '#e57c32', CO: '#3aa865',
  NM: '#b8653a', ND: '#8cb83a', SD: '#9a58d0', NE: '#56c1e6', KS: '#e2b23a',
  OK: '#e2b23a', TX: '#3aa865', MN: '#5b6fd8', IA: '#d8483f', MO: '#8cb83a',
  AR: '#2fb3b0', LA: '#9a58d0', WI: '#d9549b', IL: '#3aa865', MI: '#9a58d0',
  IN: '#d8483f', OH: '#e57c32', KY: '#3b7dd8', TN: '#8cb83a', MS: '#5b6fd8',
  AL: '#d8483f', GA: '#5b6fd8', FL: '#9a58d0', SC: '#3aa865', NC: '#56c1e6',
  VA: '#9a58d0', WV: '#b8653a', MD: '#3b7dd8', DE: '#e57c32', PA: '#d8483f',
  NJ: '#e2b23a', NY: '#2fb3b0', CT: '#56c1e6', RI: '#d9549b', MA: '#56c1e6',
  VT: '#8cb83a', NH: '#e2b23a', ME: '#3aa865', DC: '#e2b23a', AK: '#3b7dd8',
  HI: '#2fb3b0',
};

// Legacy biome arrays kept for optional Daylight fallback / backwards compatibility
export const BIOME_COLORS_MIDNIGHT: [number, number, number][] = [
  [0.62, 0.70, 0.35],
  [0.76, 0.71, 0.36],
  [0.26, 0.43, 0.21],
  [0.72, 0.64, 0.42],
  [0.31, 0.50, 0.41],
  [0.55, 0.53, 0.50],
  [0.91, 0.93, 0.95],
  [0.25, 0.57, 0.79],
];

export const BIOME_COLORS_DAY: [number, number, number][] = [
  [0.78, 0.76, 0.54],
  [0.85, 0.77, 0.49],
  [0.42, 0.56, 0.39],
  [0.82, 0.62, 0.44],
  [0.48, 0.64, 0.58],
  [0.58, 0.54, 0.49],
  [0.88, 0.87, 0.84],
  [0.54, 0.71, 0.79],
];

export function parseHex255(hex: string): Rgb255 {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mixRgb(a: Rgb255, b: Rgb255, t: number): Rgb255 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** k > 0 lightens toward white, k < 0 darkens toward black (exact reference color.js shade). */
export function shadeRgb(c: Rgb255, k: number): Rgb255 {
  return k >= 0
    ? [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k]
    : [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)];
}

export function desaturateRgb(c: Rgb255, k: number): Rgb255 {
  const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return [c[0] + (g - c[0]) * k, c[1] + (g - c[1]) * k, c[2] + (g - c[2]) * k];
}

export function cssRgb(c: Rgb255, a = 1): string {
  const r = Math.max(0, Math.min(255, Math.round(c[0])));
  const g = Math.max(0, Math.min(255, Math.round(c[1])));
  const b = Math.max(0, Math.min(255, Math.round(c[2])));
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

export function luminance255(c: Rgb255): number {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Deterministic [0, 1) hash matching reference hex.js hash01. */
export function hash01(i: number, salt = 0): number {
  let x = (Math.imul(i | 0, 374761393) + Math.imul(salt | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const RAMP_RGB_CACHE: Record<string, Rgb255[]> = {};
function getRampRgb(rampKey: string): Rgb255[] {
  if (!RAMP_RGB_CACHE[rampKey]) {
    const stops = COLOR_RAMPS[rampKey] ?? COLOR_RAMPS.income;
    RAMP_RGB_CACHE[rampKey] = stops.map(parseHex255);
  }
  return RAMP_RGB_CACHE[rampKey];
}

export function sampleRamp255(rampKey: string, t: number): Rgb255 {
  const stops = getRampRgb(rampKey);
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(stops.length - 1, i0 + 1);
  const f = scaled - i0;
  const c0 = stops[i0];
  const c1 = stops[i1];
  return [
    c0[0] + (c1[0] - c0[0]) * f,
    c0[1] + (c1[1] - c0[1]) * f,
    c0[2] + (c1[2] - c0[2]) * f,
  ];
}

export function sampleRamp(rampKey: string, t: number): [number, number, number] {
  const c = sampleRamp255(rampKey, t);
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}

/** Exact lens domain [d0, d1] and log/linear normalization matching reference world.js lensScale(). */
export function lensDomain(lens: LensMeta): [number, number] {
  if (lens.domain && lens.domain.length === 2) return lens.domain;
  return [lens.p02, lens.p98];
}

export function lensNorm(lens: LensMeta, v: number): number {
  const [d0, d1] = lensDomain(lens);
  if (lens.scale === 'log') {
    const l0 = Math.log(Math.max(d0, 1e-9));
    const l1 = Math.log(Math.max(d1, 1e-9));
    return (Math.log(Math.max(v, 1e-9)) - l0) / Math.max(1e-9, l1 - l0);
  }
  return (v - d0) / Math.max(1e-9, d1 - d0);
}

export function lensValueAt(lens: LensMeta, t: number): number {
  const [d0, d1] = lensDomain(lens);
  if (lens.scale === 'log') {
    const l0 = Math.log(Math.max(d0, 1e-9));
    const l1 = Math.log(Math.max(d1, 1e-9));
    return Math.exp(l0 + (l1 - l0) * t);
  }
  return d0 + (d1 - d0) * t;
}

export const NO_DATA_RGB255: Rgb255 = parseHex255('#55534d');
export const DIM_SLATE_RGB255: Rgb255 = [36, 42, 52];

export function getNullColor(theme: ThemeMode): [number, number, number] {
  return theme === 'daylight'
    ? [0.76, 0.74, 0.70]
    : [NO_DATA_RGB255[0] / 255, NO_DATA_RGB255[1] / 255, NO_DATA_RGB255[2] / 255];
}

export function formatMetric(val: number | null | undefined, fmt: string, locale: Locale = 'zh'): string {
  if (val === null || val === undefined || Number.isNaN(val)) return locale === 'en' ? 'No data' : '无观测';
  switch (fmt) {
    case 'usd':
      if (Math.abs(val) >= 1_000_000_000_000) return '$' + (val / 1e12).toFixed(2) + 'T';
      if (Math.abs(val) >= 1_000_000_000) return '$' + (val / 1e9).toFixed(1) + 'B';
      if (Math.abs(val) >= 1_000_000) return '$' + (val / 1e6).toFixed(1) + 'M';
      if (Math.abs(val) >= 100_000) return '$' + Math.round(val / 1000) + 'K';
      return '$' + Math.round(val).toLocaleString('en-US');
    case 'ratio':
      return val.toFixed(1) + '×';
    case 'usd_k':
      return '$' + (val / 1000).toFixed(val >= 100_000 ? 0 : 1) + 'K';
    case 'usd_b':
      return '$' + (val >= 100 ? Math.round(val).toLocaleString('en-US') : val.toFixed(1)) + 'B';
    case 'usd_m':
      if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(2) + 'T';
      if (val >= 1_000) return '$' + (val / 1_000).toFixed(1) + 'B';
      return '$' + Math.round(val).toLocaleString('en-US') + 'M';
    case 'pct':
      return (val * 100).toFixed(1) + '%';
    case 'pct_signed': {
      const p = val * 100;
      if (Math.abs(p) < 0.05) return '0.0%';
      return (p > 0 ? '+' : '') + p.toFixed(1) + '%';
    }
    case 'min':
      return val.toFixed(1) + (locale === 'en' ? ' min' : ' 分钟');
    case 'dec1':
      return val >= 100 ? Math.round(val).toLocaleString('en-US') : val.toFixed(1);
    case 'index':
      return val.toFixed(1);
    case 'int':
    default:
      return Math.round(val).toLocaleString('en-US');
  }
}
