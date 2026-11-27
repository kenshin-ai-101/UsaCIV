import type { LensMeta, Locale, ThemeMode } from '../../types/world';

export const LENS_GROUPS: { id: LensMeta['group']; label: string; labelEn: string }[] = [
  { id: 'people', label: '人口结构', labelEn: 'People' },
  { id: 'prosperity', label: '繁荣与住房', labelEn: 'Prosperity & Housing' },
  { id: 'knowledge', label: '科技与知识', labelEn: 'Knowledge' },
  { id: 'life', label: '日常生活', labelEn: 'Daily Life' },
  { id: 'faith', label: '宗教信仰', labelEn: 'Faith' },
  { id: 'hazards', label: '灾害风险', labelEn: 'Hazards' },
  { id: 'land', label: '地表覆被', labelEn: 'Land Cover' },
];

export const QUICK_LENS_IDS = ['density', 'income', 'bachelors'];

// Rich, luminous jewel-toned ramps calibrated for Midnight Cartography (and legible in Daylight too!)
export const COLOR_RAMPS: Record<string, string[]> = {
  density:   ['#1B2E45', '#274B6E', '#3A7994', '#6BB39B', '#D4D67B', '#FFF7D6'],
  wealth:    ['#3D200B', '#6E3B10', '#A36216', '#D4942A', '#F0C75E', '#FFF7DC'],
  knowledge: ['#162442', '#234278', '#336BA8', '#529CD6', '#8FC9F2', '#EBF7FF'],
  risk:      ['#222D38', '#4E3936', '#8A4834', '#C45B38', '#E68A4C', '#FDE2A8'],
  forest:    ['#262F28', '#2E4C34', '#3E7043', '#5C9956', '#8BC474', '#D7F0B6'],
  farmland:  ['#2B291E', '#574F27', '#8A7B30', '#BFA83E', '#E3CC65', '#FCF2B6'],
  urban:     ['#1E2430', '#403B52', '#704B6B', '#A85E72', '#DE8676', '#FCE2B6'],
  faith:     ['#1E1B33', '#3D3066', '#664B99', '#946DC4', '#C49BE8', '#F2E6FF'],
  amenities: ['#993832', '#CC6E4B', '#D9B675', '#6DB38E', '#318A72', '#175E54'],
};

// Rich painterly Civ-strategy terrain pigments (Midnight Cartography default — vivid, warm, legible!)
// 0=Grassland, 1=Farmland, 2=Forest, 3=Desert/Shrub, 4=Wetland, 5=Urban, 6=Alpine/Tundra, 7=Water
export const BIOME_COLORS_MIDNIGHT: [number, number, number][] = [
  [0.54, 0.62, 0.34], // 0 Grassland / Prairie olive-green
  [0.68, 0.66, 0.33], // 1 Farmland warm golden-meadow
  [0.27, 0.44, 0.28], // 2 Forest deep pine-emerald
  [0.66, 0.56, 0.40], // 3 Desert / Canyon warm sandstone
  [0.27, 0.48, 0.44], // 4 Wetland lush bayou teal
  [0.54, 0.50, 0.45], // 5 Built-up Urban warm stone
  [0.74, 0.74, 0.72], // 6 Alpine / Snow / Tundra
  [0.22, 0.45, 0.60], // 7 Coastal Marsh / Inland Water
];

// Daylight WPA Poster mineral pigments (optional toggle)
export const BIOME_COLORS_DAY: [number, number, number][] = [
  [0.78, 0.76, 0.54], // 0 Grassland
  [0.85, 0.77, 0.49], // 1 Farmland
  [0.42, 0.56, 0.39], // 2 Forest
  [0.82, 0.62, 0.44], // 3 Desert / Canyon
  [0.48, 0.64, 0.58], // 4 Wetland
  [0.58, 0.54, 0.49], // 5 Built-up Urban
  [0.88, 0.87, 0.84], // 6 Alpine / Snow
  [0.54, 0.71, 0.79], // 7 Open Water / Marsh
];

// Distinct heraldic Civ-style state badge colors (for crisp visual identity on all 529 city banners!)
export const STATE_HERALDIC_COLORS: Record<string, string> = {
  CA: '#2E9E72', TX: '#39A68B', NY: '#3AB0C4', FL: '#9B5CC2', IL: '#6EB043',
  PA: '#D46A42', OH: '#C47B38', GA: '#538ED4', NC: '#46A4BA', MI: '#8D66C4',
  NJ: '#4A96C9', VA: '#9A63B8', WA: '#4B82D4', AZ: '#DB7B48', MA: '#48A2BF',
  TN: '#75A848', IN: '#D4574A', MO: '#8EB346', MD: '#4C9BB5', WI: '#C74F8E',
  CO: '#5FB55B', MN: '#6675D4', SC: '#4FA886', AL: '#C45E4E', LA: '#3D998B',
  KY: '#6AA651', OR: '#C4568B', OK: '#BD8A3B', CT: '#429BC4', UT: '#48A8A8',
  IA: '#A8A842', NV: '#D97B4A', AR: '#7BA84C', MS: '#55966E', KS: '#C4A041',
  NM: '#D46E42', NE: '#44A8AD', ID: '#BD9B46', WV: '#5E8A6E', HI: '#2FA69A',
  NH: '#4A8EC4', ME: '#3B8A72', RI: '#4A98C4', MT: '#6C9456', DE: '#4E8AC4',
  SD: '#B59448', ND: '#8C9E4C', AK: '#3D82B5', DC: '#4CA2B8', VT: '#4D915E',
  WY: '#B8894B',
};

export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function sampleRamp(rampKey: string, t: number): [number, number, number] {
  const stops = COLOR_RAMPS[rampKey] ?? COLOR_RAMPS.wealth;
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(stops.length - 1, i0 + 1);
  const f = scaled - i0;
  const c0 = hexToRgb01(stops[i0]);
  const c1 = hexToRgb01(stops[i1]);
  return [
    c0[0] + (c1[0] - c0[0]) * f,
    c0[1] + (c1[1] - c0[1]) * f,
    c0[2] + (c1[2] - c0[2]) * f,
  ];
}

export function getNullColor(theme: ThemeMode): [number, number, number] {
  return theme === 'daylight' ? [0.80, 0.78, 0.74] : [0.22, 0.25, 0.30];
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
      return '×' + val.toFixed(1);
    case 'usd_k':
      return '$' + (val / 1000).toFixed(val >= 100_000 ? 0 : 1) + 'K';
    case 'usd_m':
      if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(2) + 'T';
      if (val >= 1_000) return '$' + (val / 1_000).toFixed(1) + 'B';
      return '$' + Math.round(val).toLocaleString('en-US') + 'M';
    case 'pct':
      return (val * 100).toFixed(1) + '%';
    case 'min':
      return val.toFixed(1) + (locale === 'en' ? ' min' : ' 分钟');
    case 'dec1':
      return val.toFixed(1);
    case 'index':
      return val.toFixed(1);
    case 'int':
    default:
      return Math.round(val).toLocaleString('en-US');
  }
}
