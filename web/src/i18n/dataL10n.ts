import type {
  DistrictCatalogItem,
  LensCategory,
  LensMeta,
  Locale,
  MineCatalogItem,
  PowerFuelSummary,
  WorkforceGroup,
} from '../types/world';

/* ── Biomes & Relief ──────────────────────────────────────────────────────── */
export const BIOME_NAMES_L10N: Record<Locale, string[]> = {
  zh: ['草原平原', '高产农田', '温带森林', '干旱荒漠', '湿地三角洲', '都市建成区', '高山寒原', '水域滩涂'],
  en: ['Grassland', 'Farmland', 'Temperate Forest', 'Arid Desert', 'Wetland Delta', 'Urban Built-Up', 'Alpine Tundra', 'Water & Marsh'],
};

export const RELIEF_NAMES_L10N: Record<Locale, string[]> = {
  zh: ['平地', '丘陵高地', '山地', '高山雪峰'],
  en: ['Flatlands', 'Hills & Uplands', 'Mountains', 'Alpine Peaks'],
};

/* ── Census Regions ───────────────────────────────────────────────────────── */
const REGION_ZH: Record<string, string> = {
  South: '南部',
  West: '西部',
  Midwest: '中西部',
  Northeast: '东北部',
};

export function localizeRegion(region: string, locale: Locale): string {
  if (locale === 'en') return region;
  return REGION_ZH[region] ?? region;
}

/* ── Lenses (19 lenses: name, unit, description, category labels) ─────────── */
const LENS_UNIT_EN: Record<string, string> = {
  '人 / km²': 'people / km²',
  '美元 / 年': 'USD / yr',
  '美元': 'USD',
  '25岁+成人占比': '% of adults 25+',
  '人口占比': '% of population',
  '岁': 'years',
  '家庭占比': '% of households',
  '分钟 / 单程': 'min / one-way',
  '自住占比': '% owner-occupied',
  '18岁+平民占比': '% of civilians 18+',
  '指数 (100=全美均值)': 'Index (100 = U.S. avg)',
  '独立重大灾害次数': 'major DR declarations',
  '人 / 百名居民': 'per 100 residents',
  '主导宗派': 'Largest tradition',
  '陆地占比': '% of land area',
  '2021–25 累计增速': '2021–25 % change',
  '美元 / 人': 'USD / resident',
  '中位房价 ÷ 年收入': 'Home value ÷ income',
  '16岁+人口占比': '% of residents 16+',
  '占州 GDP 占比': '% of state GDP',
  '现役军人 / 万人': 'active troops / 10k',
  '十亿美元 (1980–2024)': '$B cumulative (1980–2024)',
};

const LENS_DESC_EN: Record<string, string> = {
  density: 'Resident population per square kilometer of land (ACS B01003 allocated by area onto 25 km hexes). Color ramp clipped at 2nd–98th percentiles.',
  income: 'Population-weighted median annual household income across counties overlapping each hex (ACS B19013).',
  home: 'Population-weighted median owner-occupied home value (ACS B25077).',
  bachelors: 'Share of adults age 25+ holding a bachelor’s, master’s, professional, or doctoral degree (ACS B15003).',
  poverty: 'Share of residents living below the federal poverty threshold (ACS B17001).',
  age: 'Median resident age (ACS B01002), highlighting aging corridors and young growth belts.',
  foreign_born: 'Share of residents born outside the United States (ACS B05012).',
  broadband: 'Share of households with any paid broadband internet subscription (ACS B28002).',
  commute: 'Mean one-way travel time to work for commuters age 16+ not working from home (ACS B08013 ÷ B08303).',
  homeownership: 'Share of occupied housing units owned by the occupant (ACS B25003).',
  uninsured: 'Share of the civilian noninstitutionalized population without health insurance coverage (ACS B27010).',
  veterans: 'Share of the civilian population age 18+ who are military veterans (ACS B21001).',
  amenities: 'Inverted Z-score composite of 4 CDC PLACES 2025 adult health indicators (mental distress, depression, poor health, inactivity): 100 = U.S. mean, +10 = 1 SD healthier. Missing states left blank.',
  disasters: 'Cumulative distinct federal Major Disaster Declarations (DR, excluding biological/COVID) by county since 2000 (OpenFEMA v2).',
  faith: 'Total religious adherents per 100 residents across all reporting bodies in the 2020 U.S. Religion Census (ARDA RCMSCY20). Connecticut left blank due to planning-region boundary change.',
  faith_tradition: 'Largest religious tradition by adherents in each county in 2020 (Latter-day Saints broken out separately; ARDA RCMSCY20).',
  forest: 'Share of hex land covered by deciduous, evergreen, and mixed forest (USGS NLCD).',
  farmland: 'Share of hex land covered by cultivated crops and pasture/hay (USGS NLCD 81 + 82).',
  developed: 'Share of hex land in low-, medium-, and high-intensity developed urban cover (USGS NLCD 22–24).',
  pop_growth: 'Cumulative 2021–2025 county population change (Census PEP): burgundy marks decline, teal marks Sun Belt expansion.',
  gdp_per_cap: 'Real current-dollar county GDP per resident (BEA CAGDP2 2024), log scale [$25K, $160K].',
  avg_wage: 'Employer-paid average annual wage across all covered industries (BLS QCEW).',
  affordability: 'Ratio of median owner-occupied home value to median annual household income (ACS B25077 ÷ B19013). Higher means greater housing stress.',
  armed_forces_pct: 'Share of residents age 16+ serving in active-duty U.S. Armed Forces (ACS B23025), log scale highlighting garrison communities.',
  defense_pct_gdp: '[State-level] Total DoD contract and payroll spending as a share of state GDP (DoD OLDCC FY2024).',
  mil_active_density: '[State-level] Active-duty U.S. military personnel per 10,000 state residents (DoD DMDC), log scale [3, 180].',
  noaa_billion_cost: '[State-level] CPI-adjusted cumulative losses from billion-dollar weather & climate disasters, 1980–2024 (NOAA NCEI), log scale [$3B, $260B].',
};

const RELIGION_EN: Record<string, string> = {
  '天主教': 'Catholic',
  '福音派新教': 'Evangelical Protestant',
  '主流新教': 'Mainline Protestant',
  '非裔新教': 'Black Protestant',
  '后期圣徒教会': 'Latter-day Saints',
  '东正教': 'Orthodox',
  '其他宗教传统': 'Other Traditions',
};

export function localizeLensName(lens: Pick<LensMeta, 'name' | 'name_en'>, locale: Locale): string {
  return locale === 'en' ? lens.name_en : lens.name;
}

export function localizeLensUnit(unit: string, locale: Locale): string {
  return locale === 'en' ? (LENS_UNIT_EN[unit] ?? unit) : unit;
}

export function localizeLensDesc(lens: Pick<LensMeta, 'id' | 'description'>, locale: Locale): string {
  return locale === 'en' ? (LENS_DESC_EN[lens.id] ?? lens.description) : lens.description;
}

export function localizeReligion(label: string | null | undefined, locale: Locale): string {
  if (!label) return locale === 'en' ? 'No data' : '无数据';
  return locale === 'en' ? (RELIGION_EN[label] ?? label) : label;
}

export function localizeLensCategory(cat: LensCategory, locale: Locale): string {
  return localizeReligion(cat.label, locale);
}

/* ── Districts (10 catalog + fallback types + dynamic note templates) ─────── */
const DISTRICT_NAME_EN_BY_ID: Record<string, string> = {
  campus: 'Research Campus',
  foundry: 'Auto & Heavy Foundry',
  exchange: 'Financial Exchange',
  refinery: 'Energy Refinery',
  harbor: 'Maritime Harbor',
  aerohub: 'Aviation Hub',
  medical: 'Medical Center',
  promenade: 'Entertainment Promenade',
  capitol: 'Federal / State Capitol',
  bastion: 'Military Bastion',
};

const DISTRICT_NAME_EN_BY_ZH: Record<string, string> = {
  '研究学院': 'Research Campus',
  '汽车与重工城': 'Auto & Heavy Foundry',
  '金融交易所': 'Financial Exchange',
  '能源精炼中心': 'Energy Refinery',
  '航运海港': 'Maritime Harbor',
  '航空枢纽港': 'Aviation Hub',
  '医疗康养院区': 'Medical Center',
  '区域医疗中心': 'Regional Medical Center',
  '商业服务区': 'Commercial Services',
  '娱乐观光长廊': 'Entertainment Promenade',
  '联邦/州府议政厅': 'Federal / State Capitol',
  '军事要塞营地': 'Military Bastion',
};

const DISTRICT_NAICS_EN: Record<string, string> = {
  campus: 'Software, semiconductors, scientific R&D & top research universities',
  foundry: 'Automotive, aerospace & heavy manufacturing',
  exchange: 'Securities, investment banking, insurance & financial HQs',
  refinery: 'Oil & gas extraction, coal & petrochemical refining',
  harbor: 'Maritime shipping & deep-water port throughput',
  aerohub: 'Commercial passenger & major air-cargo aviation hubs',
  medical: 'Flagship hospitals, biopharma R&D & clinical care',
  promenade: 'Film, performing arts, hospitality & tourism',
  capitol: 'Federal & state public administration institutions',
  bastion: 'DoD active-duty installations & defense presence',
};

const DISTRICT_RULE_EN: Record<string, string> = {
  campus: 'BLS QCEW tech & R&D Location Quotient (LQ >= 1.35) or major research university cluster',
  foundry: 'BLS QCEW Auto (3361) / Aerospace (3364) / Heavy Mfg Location Quotient (LQ >= 1.35)',
  exchange: 'BLS QCEW Finance, Securities & Insurance Location Quotient (LQ >= 1.30)',
  refinery: 'BLS QCEW Oil & Gas Extraction (211) / Refining (3241) Location Quotient (LQ >= 1.50)',
  harbor: 'USACE top port tonnage or BLS Water Transportation Location Quotient (LQ >= 1.40)',
  aerohub: 'FAA major passenger/cargo hub or BLS Air Transportation Location Quotient (LQ >= 1.40)',
  medical: 'BLS QCEW Hospitals (622) / Pharmaceuticals (3254) concentration (LQ >= 1.30)',
  promenade: 'BLS QCEW Lodging (721) / Motion Pictures & Arts (512/711) Location Quotient (LQ >= 1.35)',
  capitol: 'BLS QCEW Public Administration (921) / National Security Location Quotient (LQ >= 1.35)',
  bastion: 'DoD MIRTA major active garrison installation or high national-security concentration',
};

export function localizeDistrictName(idOrZh: string, fallbackName: string | undefined, locale: Locale): string {
  const raw = fallbackName ?? idOrZh;
  if (locale === 'zh') return raw;
  return DISTRICT_NAME_EN_BY_ZH[raw] ?? DISTRICT_NAME_EN_BY_ID[idOrZh] ?? raw;
}

export function localizeDistrictCatalog(d: DistrictCatalogItem, locale: Locale) {
  if (locale === 'zh') {
    return { name: d.name, sub: d.name_en, naics: d.naics_label, rule: d.rule };
  }
  return {
    name: d.name_en || DISTRICT_NAME_EN_BY_ID[d.id] || d.name,
    sub: d.id.toUpperCase(),
    naics: DISTRICT_NAICS_EN[d.id] ?? d.naics_label,
    rule: DISTRICT_RULE_EN[d.id] ?? d.rule,
  };
}

export function localizeDistrictNote(note: string, locale: Locale): string {
  if (locale === 'zh' || !note) return note;
  if (note === '区域综合服务中心') return 'Regional Multi-Service Center';

  let m = note.match(/^NAICS\s+([0-9_]+)\s+行业集中度为全美均值的\s+([0-9.]+)×（([0-9,]+)\s+岗位）$/);
  if (m) return `NAICS ${m[1]} employment concentration is ${m[2]}× U.S. average (${m[3]} jobs)`;

  m = note.match(/^FAA 枢纽\s+(\S+)\s+·\s+客流\s+([0-9.]+M)\s+\/\s+货运\s+([0-9.]+B\s+lbs)$/);
  if (m) return `FAA Hub ${m[1]} · ${m[2]} passengers / ${m[3]} cargo`;

  m = note.match(/^USACE 港口吞吐\s+([0-9.]+M)\s+吨\/年\s+\((.+)\)$/);
  if (m) return `USACE port throughput ${m[1]} short tons/yr (${m[2]})`;

  m = note.match(/^核心要塞：(.+)（现役占比\s+([0-9.]+%)）$/);
  if (m) return `Fortress Metro: ${m[1]} (${m[2]} active-duty residents)`;

  m = note.match(/^驻军都会：(.+)（现役占比\s+([0-9.]+%)）$/);
  if (m) return `Garrison Metro: ${m[1]} (${m[2]} active-duty residents)`;

  return note;
}

/* ── Industries & Workforce Groups ────────────────────────────────────────── */
const INDUSTRY_EN_BY_KEY: Record<string, string> = {
  real_estate: 'Real Estate & Leasing',
  government: 'Government & Public Sector',
  public_admin: 'Public Administration',
  manufacturing: 'Manufacturing',
  professional: 'Professional & Scientific Services',
  finance: 'Finance & Insurance',
  health: 'Health Care & Social Assistance',
  retail: 'Retail Trade',
  wholesale: 'Wholesale Trade',
  information: 'Information & Software',
  construction: 'Construction',
  transportation: 'Transportation & Warehousing',
  accommodation: 'Accommodation & Food Services',
  admin: 'Admin & Support Services',
  other: 'Other Services',
  management: 'Management of Companies',
  utilities: 'Utilities',
  mining: 'Mining & Oil/Gas',
  education: 'Educational Services',
  arts: 'Arts, Entertainment & Recreation',
  agriculture: 'Agriculture, Forestry & Fishing',
};

const INDUSTRY_EN_BY_ZH: Record<string, string> = {
  '房地产与租赁': 'Real Estate & Leasing',
  '政府与公共部门': 'Government & Public Sector',
  '公共行政': 'Public Administration',
  '制造业': 'Manufacturing',
  '专业与科研服务': 'Professional & Scientific Services',
  '金融与保险': 'Finance & Insurance',
  '医疗与社会救助': 'Health Care & Social Assistance',
  '零售贸易': 'Retail Trade',
  '批发贸易': 'Wholesale Trade',
  '信息与软件': 'Information & Software',
  '建筑业': 'Construction',
  '交通与仓储': 'Transportation & Warehousing',
  '住宿与餐饮': 'Accommodation & Food Services',
  '行政与支持服务': 'Admin & Support Services',
  '其他服务业': 'Other Services',
  '企业总部管理': 'Management of Companies',
  '公用事业': 'Utilities',
  '采矿与油气': 'Mining & Oil/Gas',
  '教育服务': 'Educational Services',
  '文化艺术娱乐': 'Arts, Entertainment & Recreation',
  '农林渔牧': 'Agriculture, Forestry & Fishing',
};

export function localizeIndustry(keyOrName: string, zhFallback: string | undefined, locale: Locale): string {
  if (locale === 'zh') return zhFallback ?? keyOrName;
  return INDUSTRY_EN_BY_KEY[keyOrName] ?? INDUSTRY_EN_BY_ZH[zhFallback ?? keyOrName] ?? zhFallback ?? keyOrName;
}

const WORKFORCE_GROUP_LABELS: Record<Locale, Record<WorkforceGroup['id'], string>> = {
  zh: {
    stem: 'STEM 科技工程',
    biz: '商管与金融',
    med: '医疗健康',
    mfg: '制造与建造',
    edu: '教育与文创',
    trans: '交通与物流',
    srv: '商业销售与服务',
    agri: '农林渔牧',
  },
  en: {
    stem: 'STEM & Engineering',
    biz: 'Business & Finance',
    med: 'Healthcare',
    mfg: 'Manufacturing & Construction',
    edu: 'Education & Arts',
    trans: 'Transport & Logistics',
    srv: 'Sales & Services',
    agri: 'Agriculture & Forestry',
  },
};

export function localizeWorkforceGroup(id: WorkforceGroup['id'], fallback: string, locale: Locale): string {
  return WORKFORCE_GROUP_LABELS[locale][id] ?? fallback;
}

/* ── Power Fuels & Mines ──────────────────────────────────────────────────── */
const FUEL_LABEL_EN: Record<string, string> = {
  coal_plant: 'Coal Power Plant',
  nuclear: 'Nuclear Plant',
  wind: 'Wind Farms',
  gas_plant: 'Gas Power Plant',
  solar: 'Solar Farms',
  hydro: 'Hydroelectric Dam',
  battery: 'Battery Storage',
  pumped_storage: 'Pumped-Storage Hydro',
  geothermal: 'Geothermal Field',
  gas: 'Natural Gas',
  coal: 'Coal',
  other: 'Other',
};

const FUEL_LABEL_ZH: Record<string, string> = {
  coal_plant: '燃煤电厂',
  nuclear: '核电站',
  wind: '风电场群',
  gas_plant: '燃气电厂',
  solar: '光伏电站群',
  hydro: '大型水电站',
  battery: '电网储能群',
  pumped_storage: '抽水蓄能电站',
  geothermal: '地热发电场',
  gas: '天然气',
  coal: '燃煤',
  other: '其他',
};

const FUEL_RULE_EN: Record<string, string> = {
  coal_plant: '≥ 1,000 MW coal-fired plants (EIA-860M operating/standby net summer capacity, summed by plant)',
  nuclear: 'All U.S. nuclear power stations with operating (OP) reactors (retired or restarting units excluded)',
  wind: '≥ 50 MW wind farms clustered on equal-area 25 km radius hex zones totaling ≥ 500 MW (including offshore landfalls)',
  gas_plant: '≥ 1,500 MW natural gas plants (EIA-860M operating/standby net summer capacity, summed by plant)',
  solar: '≥ 50 MW utility-scale solar farms clustered on 25 km radius hex zones totaling ≥ 500 MW (rooftop excluded)',
  hydro: '≥ 250 MW conventional hydroelectric dams (split-state Hoover Dam AZ/NV merged as 1 site)',
  battery: '≥ 50 MW utility battery installations clustered on 25 km radius hex zones totaling ≥ 400 MW',
  pumped_storage: '≥ 1,000 MW pumped-storage hydroelectric stations (two-reservoir grid batteries)',
  geothermal: 'Operating/standby geothermal units clustered on 25 km radius hex zones totaling ≥ 100 MW',
};

export function localizeFuelLabel(fuel: string, fallback: string | undefined, locale: Locale): string {
  if (locale === 'en') return FUEL_LABEL_EN[fuel] ?? fallback ?? fuel.toUpperCase();
  return FUEL_LABEL_ZH[fuel] ?? fallback ?? fuel;
}

export function localizePowerFuel(f: PowerFuelSummary, locale: Locale): { label: string; rule: string } {
  if (locale === 'zh') return { label: f.label, rule: f.rule ?? '' };
  return {
    label: f.label_en || FUEL_LABEL_EN[f.fuel] || f.label,
    rule: FUEL_RULE_EN[f.fuel] ?? f.rule ?? '',
  };
}

const MINE_LABEL_EN: Record<string, string> = {
  coal_mine: 'Coal Mine',
  gold: 'Gold Mine',
  copper: 'Copper Mine',
  iron: 'Iron Mine',
  silver: 'Silver Mine',
  platinum: 'Platinum-Group Mine',
  molybdenum: 'Molybdenum Mine',
  lead_zinc: 'Lead-Zinc Mine',
  rare_earths: 'Rare-Earth Mine',
  uranium: 'Uranium Mine/Mill',
};

const MINE_RULE_EN: Record<string, string> = {
  coal_mine: 'Active coal mines producing ≥ 2 million short tons/yr (EIA Coal 2025)',
  gold: 'Active surface/underground gold mines with ≥ 100 workers, clustered within 25 km radius (MSHA)',
  copper: 'Active surface/underground copper mines with ≥ 100 workers, clustered within 25 km radius (MSHA)',
  iron: 'Active surface/underground iron mines with ≥ 100 workers, clustered within 25 km radius (MSHA)',
  silver: 'Active surface/underground silver mines with ≥ 100 workers, clustered within 25 km radius (MSHA)',
  platinum: 'Active surface/underground platinum/palladium mines with ≥ 100 workers (MSHA)',
  molybdenum: 'Active surface/underground molybdenum mines with ≥ 100 workers (MSHA)',
  lead_zinc: 'Active surface/underground lead-zinc mines with ≥ 100 workers, clustered within 25 km radius (MSHA)',
  rare_earths: 'Active rare-earth mines and mills with ≥ 10 workers (MSHA)',
  uranium: 'Active uranium mines and mills with ≥ 10 workers (MSHA)',
};

const MINE_UNIT_ZH: Record<string, string> = {
  'short tons/yr': '短吨/年',
  employees: '名员工',
};

export function localizeMineCatalog(m: MineCatalogItem, locale: Locale) {
  if (locale === 'zh') {
    return { label: m.label, unit: MINE_UNIT_ZH[m.unit] ?? m.unit, rule: m.rule };
  }
  return {
    label: m.label_en || MINE_LABEL_EN[m.id] || m.label,
    unit: m.unit,
    rule: MINE_RULE_EN[m.id] ?? m.rule,
  };
}

export function localizeMineLabel(commodity: string, fallback: string | undefined, locale: Locale): string {
  if (locale === 'zh') return fallback ?? commodity;
  return MINE_LABEL_EN[commodity] ?? fallback ?? commodity;
}

export function localizeMineMetric(metricLabel: string, locale: Locale): string {
  if (locale === 'zh' || !metricLabel) return metricLabel;
  let m = metricLabel.match(/^([0-9.]+M)\s*吨\/年$/);
  if (m) return `${m[1]} tons/yr`;
  m = metricLabel.match(/^([0-9,]+)\s*员工$/);
  if (m) return `${m[1]} workers`;
  return metricLabel;
}

/* ── Trade Modes & Commodities ────────────────────────────────────────────── */
const TRADE_MODE_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    truck: '公路货运',
    rail: '铁路',
    water: '水运',
    air: '航空',
    multiple: '多式联运',
    pipeline: '管道',
    other: '其他',
  },
  en: {
    truck: 'Truck',
    rail: 'Rail',
    water: 'Water',
    air: 'Air',
    multiple: 'Multimodal',
    pipeline: 'Pipeline',
    other: 'Other',
  },
};

export function localizeTradeMode(modeKey: string, locale: Locale): string {
  return TRADE_MODE_LABELS[locale][modeKey] ?? modeKey;
}

const COMMODITY_EN: Record<string, string> = {
  '电子与精密仪器': 'Electronics & Precision Instruments',
  '机械设备': 'Machinery',
  '汽车与机动车辆': 'Motor Vehicles',
  '混合货运': 'Mixed Freight',
  '医药制品': 'Pharmaceuticals',
  '汽油与航煤': 'Gasoline & Aviation Fuel',
  '燃料油': 'Fuel Oils',
  '煤炭与石油制品': 'Coal & Petroleum Products',
  '原油': 'Crude Petroleum',
  '塑料与橡胶': 'Plastics & Rubber',
  '基础金属': 'Base Metals',
  '杂项制造': 'Misc. Manufactured Products',
  '其他食品': 'Other Foodstuffs',
  '活畜与水产': 'Live Animals & Fish',
};

export function localizeCommodity(name: string, locale: Locale): string {
  return locale === 'en' ? (COMMODITY_EN[name] ?? name) : name;
}

/* ── Wonders ──────────────────────────────────────────────────────────────── */
const WONDER_RULE_EN_BY_ID: Record<string, string> = {
  national_park: 'Published rule: Top 15 National Parks by 2025 recreation visits (NPS Visitor Use, Lower 48)',
  park_unit: 'Published rule: Top 5 Other National Park Units by 2025 visits (excluding parkways/trails/rivers; National Mall merged to top memorial)',
  research_university: 'Published rule: Top 20 Carnegie R1 research universities by FY2025 NSF HERD R&D spending (max 2 per metro, incl. medical schools)',
  landmark: 'Curated selection: 12 iconic U.S. National Historic Landmarks & memorials (max 1 per metro, alphabetical)',
};

export function localizeWonderMetric(metricLabel: string, locale: Locale): string {
  if (locale === 'zh' || !metricLabel) return metricLabel;
  let m = metricLabel.match(/^([0-9.]+M)\s*游客$/);
  if (m) return `${m[1]} visits`;
  m = metricLabel.match(/^NHL 地标\s*\((\d+)\)$/);
  if (m) return `NHL Landmark (${m[1]})`;
  if (metricLabel === '国家历史地标') return 'National Historic Landmark';
  return metricLabel;
}

export function localizeWonderExtra(extra: string, locale: Locale): string {
  if (locale === 'zh' || !extra) return extra;
  if (extra === '华盛顿国家广场纪念碑群') return 'National Mall & Memorial Parks';
  let m = extra.match(/^(.+)\s*·\s*在校生\s*([0-9,]+)$/);
  if (m) return `${m[1]} · ${m[2]} students`;
  m = extra.match(/^NPS 代码\s+(\S+)\s*·\s*国家公园$/);
  if (m) return `NPS Code ${m[1]} · National Park`;
  m = extra.match(/^NPS 代码\s+(\S+)\s*·\s*(.+)$/);
  if (m) return `NPS Code ${m[1]} · ${m[2]}`;
  m = extra.match(/^NPS 国家纪念地\s*·\s*(.+)$/);
  if (m) return `NPS Memorial · ${m[1]}`;
  return extra;
}

export function localizeWonderRule(ruleId: string | undefined, rule: string, locale: Locale): string {
  if (locale === 'zh') return rule;
  if (ruleId && WONDER_RULE_EN_BY_ID[ruleId]) return WONDER_RULE_EN_BY_ID[ruleId];
  return rule;
}

/* ── FEMA Disaster Types ──────────────────────────────────────────────────── */
const FEMA_LABELS: Record<Locale, Record<string, { full: string; short: string }>> = {
  zh: {
    hurricane: { full: '飓风与热带风暴', short: '飓风' },
    flood: { full: '洪水与滑坡', short: '洪水' },
    fire: { full: '山火', short: '山火' },
    severe_storm: { full: '强风暴与龙卷风', short: '强风暴' },
    winter: { full: '冬季风暴与冰冻', short: '冬暴' },
    other: { full: '其他灾害（地震/海啸等）', short: '其他' },
  },
  en: {
    hurricane: { full: 'Hurricanes & Tropical Storms', short: 'Hurricane' },
    flood: { full: 'Floods & Landslides', short: 'Flood' },
    fire: { full: 'Wildfires', short: 'Fire' },
    severe_storm: { full: 'Severe Storms & Tornadoes', short: 'Storm' },
    winter: { full: 'Winter Storms & Freezes', short: 'Winter' },
    other: { full: 'Other (Earthquakes, etc.)', short: 'Other' },
  },
};

export function localizeFemaType(id: string, fallback: string | undefined, locale: Locale, short = false): string {
  const entry = FEMA_LABELS[locale][id];
  if (entry) return short ? entry.short : entry.full;
  return fallback ?? id;
}

/* ── Military Components ──────────────────────────────────────────────────── */
const MIL_COMP_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    army: '陆军',
    navy: '海军',
    air_force: '空军',
    marines: '陆战队',
    army_reserve: '陆军预备',
    navy_reserve: '海军预备',
    air_force_reserve: '空军预备',
    marine_reserve: '陆战预备',
    army_guard: '陆军警卫队',
    air_guard: '空军警卫队',
    other: '其他 DoD',
  },
  en: {
    army: 'Army',
    navy: 'Navy',
    air_force: 'Air Force',
    marines: 'Marines',
    army_reserve: 'Army Reserve',
    navy_reserve: 'Navy Reserve',
    air_force_reserve: 'Air Force Reserve',
    marine_reserve: 'Marine Reserve',
    army_guard: 'Army Guard',
    air_guard: 'Air Guard',
    other: 'Other DoD',
  },
};

export function localizeMilComponent(comp: string, locale: Locale): string {
  return MIL_COMP_LABELS[locale][comp] ?? comp;
}

/** Handles bilingual DMDC branch keys like "陆军 Army", "太空军 Space Force". */
export function localizeMilBranchKey(key: string, locale: Locale): string {
  const idx = key.indexOf(' ');
  if (idx <= 0) return key;
  return locale === 'en' ? key.slice(idx + 1).trim() : key.slice(0, idx).trim();
}

/* ── Source Categories & Used-For Descriptions ────────────────────────────── */
export const SOURCE_CAT_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    geo: '基础地理与地貌',
    people: '人口、健康与信仰',
    economy: '经济、产业与货运',
    energy: '能源电力与矿产',
    wonders: '科研高校与奇观',
    military: '国防与军事',
    hazards: '气候灾害风险',
  },
  en: {
    geo: 'Geography & Terrain',
    people: 'People, Health & Faith',
    economy: 'Economy, Industry & Freight',
    energy: 'Energy & Minerals',
    wonders: 'Universities & Wonders',
    military: 'Defense & Military',
    hazards: 'Climate Hazards',
  },
};

const SOURCE_USED_FOR_ZH: Record<string, string> = {
  acs_1yr: '524+ 都会/微都会区指标、16 人偶市民职业构成与常住居民行业分布',
  acs_5yr: '12 项六边形数据视角（密度、收入、房价、贫困、年龄、移民、学历、宽带、通勤、自有率、无医保、退伍军人）及全县探索器',
  bea_gdp: '金币产出（真实 GDP）、各县与都会区 GDP 总量及宏观经济顾问 20 大行业构成',
  bls_qcew: '驱动全美 10 类产业特色城区的真实行业区位商 (LQ)',
  cbsa_delineation: '县-都会区 (CBSA) 归属映射，界定全美 524+ 座都会/微都会区六边形疆域',
  cdc_places: '健康宜居度六边形视角与城市身心健康指数（4 项年龄调整成人健康指标）',
  census_boundaries: '县级行政区划至 25 km 六边形空间交集矩阵，以及州/县行政边界（本土、AK、HI）',
  census_gazetteer: '都会区与各县官方陆地/水域面积与内部锚点坐标',
  dmdc_personnel: '各州与各军种现役、预备役/警卫队与文职兵力编制统计（国防顾问）',
  eia_860m: '发电厂菱形灯塔（核电、光伏、风电、水电、燃气、燃煤、储能）及能源顾问',
  eia_coal: '战略煤矿资源节点与年度煤炭产量排行',
  eia_shale_plays: '主要致密油与页岩气盆地地质点阵覆层',
  etopo: '六边形真实海拔、地形起伏分级与 2.5D 物理挤压高度（本土、AK、HI）',
  faa_airports: '航空枢纽图标、旅客吞吐量与全货机货运量（商贸顾问）',
  faf5: '全美州际货运商路大动脉（货值、吨位、运输方式、主力货品）与商贸顾问',
  fema_declarations: '灾害频次六边形视角（2000 年以来各县重大灾害声明数）与 6 大灾种构成',
  herd: '科研产出与按研发总支出公开排名的研究型大学学术奇观',
  ipeds: '研究型高校坐标、在校生规模、研究学院城区与学术奇观落点',
  mirta: '军事要塞/星堡图标、大型靶场禁区地块与驻军城区',
  msha_mines: '六角切面矿石晶体节点（金、铜、铁、银、稀土、铀等）',
  natural_earth: '海岸线、五大湖、主干河流（淡水河道）与邻国陆地背景',
  natural_earth_roads: '州际高速公路与干线/支线铁路网地图艺术图层',
  nhl_landmarks: '历史地标奇观与国家历史地标铭牌坐标',
  nlcd: '地表生物群系、粮食/产能地形产出与森林/农田/建成区视角',
  noaa_billions: '文化与灾害顾问十亿美元级气象灾害年度时间线与各州分摊损失',
  nps_boundaries: '受保护国家公园地块范围与自然奇观坐标',
  nps_visits: '按年度游客量公开排名的自然奇观与文化产出',
  oldcc_spending: '各州国防合同、军民薪资与联邦拨款支出（国防顾问）',
  pep_population: '多年人口净增长与迁徙拆解（自然增减、国内/国际净迁入）',
  usace_ports: '航运海港节点、总吞吐短吨排行与商贸顾问',
  usrc_2020: '信仰产出、宗教信徒率视角、第一大宗教传统视角与文化顾问',
  dod_bsr_overseas: '全球 498 座活跃海外与领地美军基地精确经纬度（含坐标纠偏）、DoD 设施重置估值 ($M)、占地面积与军种（全球基地海图）',
};

/* ── Global Overseas Bases Localization ───────────────────────────────────── */
const GLOBAL_BRANCH_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    army: '陆军',
    navy: '海军',
    air_force: '空军',
    marines: '海军陆战队',
    reserve_guard: '预备役 / 国民警卫队',
  },
  en: {
    army: 'Army',
    navy: 'Navy',
    air_force: 'Air Force',
    marines: 'Marine Corps',
    reserve_guard: 'Reserve / Guard',
  },
};

export function localizeGlobalBranch(branch: string, locale: Locale): string {
  return GLOBAL_BRANCH_LABELS[locale][branch] ?? branch;
}

const GLOBAL_COMPONENT_ZH: Record<string, string> = {
  'Army Active': '陆军现役',
  'Navy Active': '海军现役',
  'Air Force Active': '空军现役',
  'Marine Corps Active': '海军陆战队现役',
  'Army Reserve': '陆军预备役',
  'Navy Reserve': '海军预备役',
  'Army National Guard': '陆军国民警卫队',
};

export function localizeGlobalComponent(comp: string, locale: Locale): string {
  if (locale === 'en') return comp;
  return GLOBAL_COMPONENT_ZH[comp] ?? comp;
}

const GLOBAL_REGION_ZH: Record<string, string> = {
  'Pacific Ocean': '太平洋',
  'Indian Ocean': '印度洋',
  'Pacific & Indian Oceans': '太平洋与印度洋',
  'Indian & Pacific Gateway': '印太咽喉（马六甲）',
  'Indo-Pacific': '印太地区',
  'Europe': '欧洲大陆',
  'Mediterranean / Europe': '地中海与南欧',
  'Atlantic / Europe': '大西洋与西欧',
  'Atlantic / Mediterranean': '大西洋与地中海',
  'Eastern Mediterranean': '东地中海',
  'Mediterranean': '地中海',
  'Black Sea / Europe': '黑海与东欧',
  'Atlantic Ocean': '大西洋',
  'Arctic / North Atlantic': '北极与北大西洋',
  'North Atlantic': '北大西洋',
  'Arctic Ocean': '北冰洋',
  'Persian Gulf': '波斯湾',
  'Middle East': '中东',
  'Middle East & Central Asia': '中东与中亚',
  'Arabian Sea / Indian Ocean': '阿拉伯海与印度洋',
  'Red Sea / Suez': '红海与苏伊士',
  'Horn of Africa / Red Sea': '非洲之角与红海',
  'East Africa / Indian Ocean': '东非与印度洋',
  'West Africa': '西非',
  'Southern Africa': '南部非洲',
  'Africa': '非洲',
  'South Atlantic Ocean': '南大西洋',
  'Caribbean Sea': '加勒比海',
  'Caribbean / Atlantic': '加勒比海与大西洋',
  'Atlantic / Caribbean': '大西洋与加勒比海',
  'Central America': '中美洲',
  'Central America & Caribbean': '中美洲与加勒比',
  'South America': '南美洲',
  'North America / Arctic': '北美与北极',
  'North America': '北美洲',
  'Global': '全球',
};

export function localizeGlobalRegion(region: string, locale: Locale): string {
  if (locale === 'en') return region;
  return GLOBAL_REGION_ZH[region] ?? region;
}

const GLOBAL_COUNTRY_ZH: Record<string, string> = {
  'American Samoa': '美属萨摩亚',
  'Ascension Island (UK)': '阿森松岛（英属）',
  Australia: '澳大利亚',
  Bahrain: '巴林',
  Belgium: '比利时',
  Bulgaria: '保加利亚',
  Canada: '加拿大',
  'Cuba (Guantanamo Bay)': '古巴（关塔那摩）',
  Curacao: '库拉索',
  Cyprus: '塞浦路斯',
  'Diego Garcia (BIOT)': '迪戈加西亚（英属印度洋）',
  Djibouti: '吉布提',
  Egypt: '埃及',
  'El Salvador': '萨尔瓦多',
  Germany: '德国',
  Greece: '希腊',
  Greenland: '格陵兰',
  Guam: '关岛',
  Honduras: '洪都拉斯',
  Hungary: '匈牙利',
  Iceland: '冰岛',
  Israel: '以色列',
  Italy: '意大利',
  Japan: '日本',
  'Johnston Atoll': '约翰斯顿环礁',
  Jordan: '约旦',
  Kenya: '肯尼亚',
  Kuwait: '科威特',
  'Marshall Islands': '马绍尔群岛',
  Netherlands: '荷兰',
  'Northern Mariana Islands': '北马里亚纳群岛',
  Norway: '挪威',
  Oman: '阿曼',
  Peru: '秘鲁',
  Poland: '波兰',
  'Portugal (incl. Azores)': '葡萄牙（含亚速尔）',
  'Puerto Rico': '波多黎各',
  Qatar: '卡塔尔',
  Romania: '罗马尼亚',
  'Saudi Arabia': '沙特阿拉伯',
  Singapore: '新加坡',
  'South Korea': '韩国',
  Spain: '西班牙',
  'The Bahamas': '巴哈马',
  Turkey: '土耳其',
  'U.S. Virgin Islands': '美属维尔京群岛',
  'United Arab Emirates': '阿联酋',
  'United Kingdom': '英国',
  'Wake Island': '威克岛',
};

const GLOBAL_COUNTRY_SHORT_ZH: Record<string, string> = {
  'Ascension Island (UK)': '阿森松岛',
  'Cuba (Guantanamo Bay)': '关塔那摩',
  'Diego Garcia (BIOT)': '迪戈加西亚',
  'Portugal (incl. Azores)': '葡萄牙',
  'Saudi Arabia': '沙特',
  'Northern Mariana Islands': '北马里亚纳',
  'U.S. Virgin Islands': '美属维尔京',
};

const GLOBAL_COUNTRY_SHORT_EN: Record<string, string> = {
  'Ascension Island (UK)': 'Ascension',
  'Cuba (Guantanamo Bay)': 'Guantanamo',
  'Diego Garcia (BIOT)': 'Diego Garcia',
  'Portugal (incl. Azores)': 'Portugal',
  'United Kingdom': 'UK',
  'United Arab Emirates': 'UAE',
  'South Korea': 'S. Korea',
  'Northern Mariana Islands': 'N. Marianas',
  'U.S. Virgin Islands': 'USVI',
};

export function localizeGlobalCountry(name: string, locale: Locale, compact = false): string {
  if (locale === 'en') {
    return compact ? (GLOBAL_COUNTRY_SHORT_EN[name] ?? name) : name;
  }
  if (compact && GLOBAL_COUNTRY_SHORT_ZH[name]) return GLOBAL_COUNTRY_SHORT_ZH[name];
  return GLOBAL_COUNTRY_ZH[name] ?? name;
}

export function localizeSourceUsedFor(id: string, enFallback: string, locale: Locale): string {
  if (locale === 'en') return enFallback;
  return SOURCE_USED_FOR_ZH[id] ?? enFallback;
}
