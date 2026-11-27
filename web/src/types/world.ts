export type ThemeMode = 'midnight' | 'daylight';

export type Locale = 'zh' | 'en';

export type MapMode = 'explore' | 'city' | 'state' | 'advisor' | 'explorer' | 'showdown';

export interface InsetBox {
  region_id: number;
  code: 'AK' | 'HI';
  scale: number;
  native_min_x: number;
  native_min_y: number;
  origin_x: number;
  origin_y: number;
  box: [number, number, number, number];
}

export interface YieldSet {
  food: number;
  prod: number;
  gold: number;
  sci: number;
  cul: number;
  faith: number;
}

export interface SourceRecord {
  id: string;
  category: string;
  title: string;
  publisher: string;
  homepage: string;
  vintage: string;
  used_for: string;
  files_count: number;
}

export interface LensCategory {
  id: number;
  key: string;
  label: string;
  color: string;
}

export interface LensMeta {
  id: string;
  name: string;
  name_en: string;
  group: 'people' | 'prosperity' | 'knowledge' | 'life' | 'defense' | 'faith' | 'hazards' | 'land';
  unit: string;
  format: 'int' | 'pct' | 'pct_signed' | 'ratio' | 'usd' | 'usd_k' | 'usd_b' | 'dec1' | 'min' | 'index' | 'cat';
  ramp: string;
  scale?: 'linear' | 'log';
  domain?: [number, number];
  granularity?: 'county' | 'state';
  higher_is: 'good' | 'bad' | 'neutral';
  source_id: string;
  description: string;
  p02: number;
  p98: number;
  min: number;
  max: number;
  median: number;
  categorical?: boolean;
  categories?: LensCategory[];
}

export interface DistrictCatalogItem {
  id: string;
  name: string;
  name_en: string;
  color: string;
  rule: string;
  naics_label: string;
}

export interface MineCatalogItem {
  id: string;
  label: string;
  label_en: string;
  color: string;
  unit: string;
  rule: string;
}

export interface FemaRecentEvent {
  disaster: string;
  date: string;
  state: string;
  type: string;
  incident_type: string;
  title: string;
  areas: number;
  statewide: boolean;
  counties: string[];
}

export interface NoaaCostliestEvent {
  name: string;
  type: string;
  begin: string;
  cost_busd: number;
  deaths: number;
}

export interface NationSummary {
  population: number;
  employed?: number;
  unemployment?: number;
  growth?: number;
  growth_years?: [number, number];
  gdp_musd: number;
  gdp_per_cap: number;
  gdp_by_industry?: { key: string; name: string; musd: number }[];
  jobs?: Record<string, number>;
  industry_labels?: Record<string, string>;
  real_yields?: {
    food: number;
    production: number;
    gold: number;
    science: number;
    culture: number;
  };
  power_mw: number;
  power_all_mw?: number;
  power_sites_count?: number;
  clean_power_pct: number;
  median_income: number;
  median_rent?: number;
  home_value?: number;
  rent_burden?: number;
  bachelors_pct: number;
  stem_share: number;
  stem_one_in: number;
  avg_amenities: number;
  park_visits?: number;
  veterans_total?: number;
  military_national?: {
    active: number;
    guard_reserve: number;
    civilian: number;
    total: number;
    active_by_branch: Record<string, number>;
  };
  defense_national?: {
    total_musd: number;
    contracts_musd: number;
    payroll_musd: number;
    grants_musd: number;
    pct_gdp: number;
    per_resident: number;
  };
  noaa_national?: {
    events: number;
    cost_busd: number;
    deaths: number;
    years: [number, number];
    costliest: NoaaCostliestEvent[];
  };
  fema_national?: {
    total: number;
    by_type: Record<string, number>;
    as_of: string;
    recent: FemaRecentEvent[];
  };
  land_national?: Record<string, number>;
  land_dom_counts?: Record<string, number>;
  total_metros: number;
  conus_metros?: number;
  total_counties: number;
  conus_counties?: number;
  total_hexes: number;
  total_wonders: number;
  fema_states_all?: Record<string, { total: number; by_type: Record<string, number> }>;
  yields: YieldSet;
}

export interface WorldMeta {
  bounds_km: [number, number, number, number];
  insets: Record<string, InsetBox>;
  hex_count: number;
  hex_radius_km: number;
  nation: NationSummary;
  sources: SourceRecord[];
  lenses: LensMeta[];
  district_catalog: DistrictCatalogItem[];
  mine_catalog?: MineCatalogItem[];
  fema_types?: { id: string; label: string }[];
}

export interface WorldHexData {
  n: number;
  x: number[];
  y: number[];
  r: number[];
  reg: number[];
  lon?: number[];
  lat?: number[];
  elev: number[];
  emax?: number[];
  rcls: number[];
  biome: number[];
  cover?: number[];
  pct?: {
    f: number[];
    c: number[];
    p: number[];
    g: number[];
    s: number[];
    w: number[];
    d: number[];
  };
  dom_land?: number[];
  river: number[];
  shale: number[];
  fips: string[];
  st: string[];
  cbsa: (string | null)[];
  yields: {
    food: number[];
    prod: number[];
    gold: number[];
    sci: number[];
    cul: number[];
    faith: number[];
  };
  lenses: Record<string, (number | null)[]>;
}

export interface CityDistrict {
  id: string;
  name: string;
  lq: number;
  jobs: number;
  avg_wage: number | null;
  hex_id: number;
  x: number;
  y: number;
  note: string;
}

export interface WorkforceGroup {
  id: 'stem' | 'biz' | 'med' | 'mfg' | 'edu' | 'trans' | 'srv' | 'agri';
  label: string;
  share: number;
  meeples: number;
}

export interface CityRecord {
  id: string;
  name: string;
  short_name: string;
  state_abbr: string;
  states_sub?: string;
  region: number;
  is_metro: boolean;
  x: number;
  y: number;
  pop: number;
  density?: number | null;
  land_km2?: number | null;
  employed?: number;
  unemployment?: number | null;
  pop_growth_pct: number | null;
  nat_change: number | null;
  dom_mig: number | null;
  intl_mig: number | null;
  gdp_musd: number | null;
  gdp_per_cap: number | null;
  median_income: number | null;
  median_home: number | null;
  median_rent: number | null;
  rent_burden?: number | null;
  bachelors_pct: number | null;
  bachelors_1yr?: number | null;
  broadband_pct?: number | null;
  homeownership_pct?: number | null;
  uninsured_pct?: number | null;
  poverty_pct: number | null;
  median_age: number | null;
  median_age_5yr?: number | null;
  foreign_born_pct: number | null;
  foreign_born_1yr?: number | null;
  commute_min: number | null;
  amenities: number | null;
  disasters: number | null;
  faith_rate: number | null;
  primary_tradition: string | null;
  veterans?: number;
  veterans_pct?: number | null;
  armed_forces?: number;
  armed_forces_pct?: number | null;
  garrison_tier?: 'fortress' | 'garrison' | null;
  garrison_naval?: boolean;
  installations_count?: number;
  energy_mw?: number;
  qcew_jobs?: number | null;
  qcew_pay?: number | null;
  n_districts?: number;
  top_lq?: number | null;
  city_type?: string | null;
  citizens_extra?: {
    cz_child?: number | null;
    cz_young?: number | null;
    cz_elder?: number | null;
    cz_drove_alone?: number | null;
    cz_transit?: number | null;
    cz_walk?: number | null;
    cz_home?: number | null;
    cz_graduate?: number | null;
    cz_born_in_state?: number | null;
  };
  yields: YieldSet;
  yields_workers?: { food: number; production: number; science: number; culture: number };
  jobs?: Record<string, number>;
  hex_ids: number[];
  primary_district: string | null;
  districts: CityDistrict[];
  workforce: {
    total_workers: number;
    stem_share: number;
    stem_one_in: number;
    groups: WorkforceGroup[];
    industries: { key?: string; name: string; share: number; workers?: number }[];
  };
  peers: string[];
}

export interface StateRecord {
  fips: string;
  abbr: string;
  name: string;
  region_name: string;
  x: number;
  y: number;
  pop: number;
  density?: number | null;
  land_km2?: number;
  employed?: number | null;
  unemployment?: number | null;
  pop_growth_pct: number | null;
  gdp_musd: number;
  gdp_per_cap: number;
  median_income: number | null;
  median_home: number | null;
  median_rent?: number | null;
  rent_burden?: number | null;
  bachelors_pct: number | null;
  broadband_pct?: number | null;
  poverty_pct?: number | null;
  homeownership_pct?: number | null;
  uninsured_pct?: number | null;
  median_age?: number | null;
  foreign_born_pct?: number | null;
  commute_min?: number | null;
  amenities: number | null;
  disasters: number | null;
  fema_total?: number;
  fema_by_type?: Record<string, number>;
  faith_rate: number | null;
  installations_count?: number;
  veterans?: number;
  veterans_pct: number | null;
  armed_forces?: number;
  armed_forces_pct?: number | null;
  yields: YieldSet;
  yields_workers?: { food?: number; production?: number; science?: number; culture?: number };
  jobs?: Record<string, number>;
  gdp_by_sector: { key?: string; name: string; musd: number }[];
  land_cover?: Record<string, number>;
  power_mw_by_fuel: Record<string, number>;
  defense_spending_musd: number | null;
  defense_contracts_musd?: number | null;
  defense_payroll_musd?: number | null;
  defense_grants_musd?: number | null;
  defense_per_resident?: number | null;
  defense_pct_gdp: number | null;
  defense_top_vendors?: { name: string; contracts_musd: number }[];
  defense_top_counties?: { name: string; contracts_musd: number }[];
  military_active: number | null;
  military_reserve: number | null;
  military_civilian: number | null;
  military_total?: number | null;
  military_by_branch: Record<string, number>;
  noaa_billion_events: number | null;
  noaa_billion_cost_busd: number | null;
  top_cities: string[];
}

export interface PowerPlantNode {
  name: string;
  fuel: string;
  mw: number;
  state: string;
  detail?: string;
  x: number;
  y: number;
  hex_id: number;
  cbsa: string | null;
}

export interface PowerFuelSummary {
  fuel: string;
  label: string;
  label_en?: string;
  color?: string;
  rule?: string;
  mw: number;
  count: number;
}

export interface MineNode {
  name: string;
  commodity: string;
  label?: string;
  state: string;
  metric: number;
  unit?: string;
  metric_label: string;
  x: number;
  y: number;
  hex_id: number;
  cbsa: string | null;
}

export interface PortNode {
  name: string;
  state: string;
  port_type?: 'coastal' | 'great_lakes' | 'inland' | string;
  rank?: number;
  tons: number;
  domestic?: number;
  imports?: number;
  exports?: number;
  x: number;
  y: number;
  hex_id: number;
  cbsa: string | null;
}

export interface AirportNode {
  code: string;
  name: string;
  city: string;
  state: string;
  hub?: string;
  enplanements: number;
  enplanements_prev?: number;
  cargo_lbs: number;
  year?: number;
  x: number;
  y: number;
  hex_id: number;
  cbsa: string | null;
}

export interface MilitaryBaseNode {
  id?: string;
  name: string;
  component: string;
  tier?: 'major' | 'base' | 'site';
  joint?: boolean;
  airfield?: boolean;
  status?: string;
  state: string;
  area_km2?: number | null;
  x: number;
  y: number;
  hex_id: number;
  cells?: number[];
  cbsa: string | null;
}

export interface MilitaryRangeNode {
  id: string;
  name: string;
  state: string;
  component: string;
  area_km2: number;
  cells: number[];
  x: number;
  y: number;
}

export interface WonderNode {
  id: string;
  kind: 'natural' | 'academic' | 'heritage';
  rule_id?: 'national_park' | 'park_unit' | 'research_university' | 'landmark';
  motif?: string;
  rank: number;
  name: string;
  state: string;
  metric: number;
  metric_label: string;
  rule: string;
  extra: string;
  x: number;
  y: number;
  hex_id: number;
  cbsa?: string | null;
}

export interface TradeRouteNode {
  rank?: number;
  a?: string;
  b?: string;
  orig_st: string;
  dest_st: string;
  orig_full?: string;
  dest_full?: string;
  orig_fips?: string;
  dest_fips?: string;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  dist_km?: number;
  value_musd: number;
  tons_k: number;
  tmiles_m?: number;
  top_mode: string;
  modes?: Record<string, number>;
  top_commodity: string;
}

export interface TradeZoneNode {
  fips: string;
  abbr: string;
  name: string;
  full_name?: string;
  kind?: string;
  conus?: boolean;
  cities?: string[];
  x?: number;
  y?: number;
  within_musd: number;
  other_musd: number;
  import_musd: number;
  export_musd: number;
  partners: [string, number, string, string?][];
}

export interface ShaleSiteNode {
  name: string;
  kind: 'oil' | 'gas';
  area_km2: number;
  state: string;
  detail: string;
  x: number;
  y: number;
  hex_id: number;
  cbsa?: string | null;
}

export interface MapLayersData {
  neighbor_land?: [number, number][][];
  state_borders: { fips: string; abbr: string; pts: [number, number][] }[];
  rivers: [number, number][][];
  lakes: { name: string; pts: [number, number][] }[];
  roads_primary: [number, number][][];
  roads_secondary: [number, number][][];
  rail_main: [number, number][][];
  shale_plays: { name: string; hex_count: number }[];
  shale_sites?: ShaleSiteNode[];
  power_plants: PowerPlantNode[];
  power_by_fuel: PowerFuelSummary[];
  mines: MineNode[];
  ports: PortNode[];
  airports: AirportNode[];
  military_bases: MilitaryBaseNode[];
  military_ranges?: MilitaryRangeNode[];
  restricted_hex_ids: number[];
  wonders: WonderNode[];
  protected_hex_ids: number[];
  trade: {
    total_musd: number;
    import_musd?: number;
    export_musd?: number;
    regional?: boolean;
    routes: TradeRouteNode[];
    modes: { id?: string; mode: string; value_musd: number; tons_k: number }[];
    commodities: { name: string; value_musd: number }[];
    zones?: TradeZoneNode[];
  };
  noaa_timeline: { year: number; count: number; cost_busd: number; top_type: string }[];
}

export interface ExplorerColumn {
  key: string;
  label: string;
  unit: string;
  format: 'int' | 'pct' | 'usd' | 'usd_m' | 'dec1' | 'index' | 'text';
  group: string;
  source_id: string;
  numeric: boolean;
}

export interface CountyRow {
  fips: string;
  name: string;
  state: string;
  cbsa?: string | null;
  region_name: string;
  x: number;
  y: number;
  hex_ids: number[];
  fema_by_type?: Record<string, number>;
  [key: string]: string | number | number[] | Record<string, number> | null | undefined;
}

export interface CountiesDataset {
  columns: ExplorerColumn[];
  rows: CountyRow[];
}

export interface LayerToggles {
  roads: boolean;
  rail: boolean;
  hubs: boolean;
  resources: boolean;
  military: boolean;
  wonders: boolean;
  trade: boolean;
  borders: boolean;
  banners: boolean;
}

export interface GlobalBaseRecord {
  id: string;
  name: string;
  country: string;
  country_raw: string;
  city: string;
  component: string;
  branch: 'army' | 'navy' | 'air_force' | 'marines' | 'reserve_guard';
  cocom: string;
  region: string;
  lat: number;
  lon: number;
  prv_musd: number;
  acres: number;
  buildings: number;
  bldgs_owned?: number;
  bldgs_leased?: number;
  sqft?: number;
  approx_coord?: boolean;
  note?: string;
  tier: 'hub' | 'major' | 'site';
}

export interface GlobalCountryRecord {
  name: string;
  iso2: string;
  cocom: string;
  region: string;
  presence_type?: 'base_host' | 'deployed_mission';
  mission_note_zh?: string;
  mission_note_en?: string;
  lat: number | null;
  lon: number | null;
  active: number;
  reserve: number;
  civilian: number;
  total: number;
  by_branch: {
    army: number;
    navy: number;
    marines: number;
    air_force: number;
    space_force: number;
    coast_guard: number;
  };
  base_count: number;
  prv_musd: number;
}

export interface CocomSummary {
  id: string;
  name_zh: string;
  name_en: string;
  hq_zh?: string;
  hq_en?: string;
  subtitle_zh: string;
  subtitle_en: string;
  color: string;
  box: [number, number, number, number];
  label_lon?: number;
  label_lat?: number;
  base_count: number;
  hub_count: number;
  prv_musd: number;
  active_troops: number;
  total_personnel: number;
  country_count: number;
}

export interface NavyFleetRecord {
  id: string;
  name_en: string;
  name_zh: string;
  hq_en: string;
  hq_zh: string;
  cocom: string;
  lon: number;
  lat: number;
}

export interface ChokepointRecord {
  id: string;
  name_en: string;
  name_zh: string;
  lon: number;
  lat: number;
}

export interface OceanLabel {
  id: string;
  name_en: string;
  name_zh: string;
  lon: number;
  lat: number;
  size: 'lg' | 'md' | 'sm';
}

export interface ProjectionArc {
  id: string;
  from_name: string;
  from_lon: number;
  from_lat: number;
  to_name: string;
  to_lon: number;
  to_lat: number;
  cocom: string;
}

export interface WorldLandFeature {
  iso2: string;
  name: string;
  continent: string;
  cocom: string;
  lat: number;
  lon: number;
  is_us: boolean;
  is_host?: boolean;
  active: number;
  base_count: number;
  polys: [number, number][][];
}

export interface GlobalMilitaryDataset {
  summary: {
    total_bases: number;
    missing_coord_bases: number;
    excluded_bases?: number;
    fixed_coord_bases?: number;
    base_countries: number;
    host_countries?: number;
    total_prv_musd: number;
    total_acres: number;
    host_active?: number;
    host_reserve?: number;
    host_civilian?: number;
    overseas_active: number;
    overseas_reserve: number;
    overseas_civilian: number;
    embassy_only_countries?: number;
    embassy_only_active?: number;
    unassigned_active: number;
    unassigned_reserve: number;
    unassigned_civilian: number;
    dmdc_countries?: number;
    as_of_dmdc: string;
    as_of_bsr: string;
  };
  cocoms: CocomSummary[];
  fleets?: NavyFleetRecord[];
  chokepoints?: ChokepointRecord[];
  ocean_labels: OceanLabel[];
  projection_arcs: ProjectionArc[];
  bases: GlobalBaseRecord[];
  countries: GlobalCountryRecord[];
  world_land: WorldLandFeature[];
  world_lakes?: [number, number][][];
}
