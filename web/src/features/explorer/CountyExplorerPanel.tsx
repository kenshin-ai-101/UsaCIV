import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Columns, Download, Map as MapIcon, Plus, Search, Table2, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { AdvisorMedallionBar } from '../advisors/AdvisorsPanel';
import {
  BrushScatter,
  fmtCount3,
  fmtMoney3,
  fmtSignedPct,
  RampLegend,
  Segmented,
  SourcesFooter,
  SwatchLegend,
  type ScatterPoint,
} from '../advisors/AdvisorCharts';
import { sampleRamp } from '../lenses/lensConfig';
import type { CityRecord, CountiesDataset, StateRecord, WorldHexData, WorldMeta } from '../../types/world';

interface CountyExplorerPanelProps {
  meta: WorldMeta;
  dataset: CountiesDataset | null;
  cities: CityRecord[];
  states: StateRecord[];
  world: WorldHexData;
  onFlyTo: (x: number, y: number, scale: number) => void;
}

type LevelKey = 'states' | 'metros' | 'counties';
type FieldFmt = 'int' | 'money' | 'usd' | 'pct' | 'signed' | 'dec1' | 'ratio' | 'index' | 'text';

interface FieldSpec {
  key: string;
  label: string;
  short: string;
  group: string;
  format: FieldFmt;
  lens?: string;
  higherBad?: boolean;
  desc: string;
}

interface ActiveFilter {
  id: string;
  key: string;
  op: '>' | '≥' | '<' | '≤' | '=' | 'contains' | '≠';
  value: number | string;
}

interface UnifiedRow {
  id: string;
  name: string;
  sub: string;
  region: string;
  x: number;
  y: number;
  hexIds: number[];
  [k: string]: string | number | number[] | null | undefined;
}

const ALL_FIELDS: FieldSpec[] = [
  { key: 'sub', label: '所属州', short: '州', group: '基础', format: 'text', desc: '行政归属州简称' },
  { key: 'region', label: '地理大区', short: '大区', group: '基础', format: 'text', desc: '美国人口普查局四大地理分区' },
  { key: 'kind', label: '都会层级', short: '层级', group: '基础', format: 'text', desc: '大都会统计区 (Metro, ≥5万核心) 或微都会区 (Micro, 1万–5万核心)' },
  { key: 'land_km2', label: '陆地面积 km²', short: '面积', group: '基础', format: 'int', desc: 'TIGER/Line 陆地面积 (平方公里)' },
  { key: 'pop', label: '总人口', short: '人口', group: '人口', format: 'int', lens: 'density', desc: '常住人口 (Census PEP 2025 / ACS 5-Yr)' },
  { key: 'growth', label: '人口增速 21–25', short: '增速', group: '人口', format: 'signed', desc: 'Census PEP 2021–2025 人口净变化率' },
  { key: 'density', label: '人口密度', short: '密度', group: '人口', format: 'dec1', lens: 'density', desc: '每平方公里陆地常住人口数' },
  { key: 'age', label: '中位年龄', short: '年龄', group: '人口', format: 'dec1', lens: 'age', desc: '居民中位年龄 (岁)' },
  { key: 'foreign_born', label: '外国出生占比', short: '移民', group: '人口', format: 'pct', lens: 'foreign_born', desc: '出生在美国境外的人口占比' },
  { key: 'cz_child', label: '18岁以下占比', short: '少儿', group: '市民结构', format: 'pct', desc: '18岁以下人口占比 (ACS 1-Yr B01001)' },
  { key: 'cz_young', label: '18–34岁占比', short: '青年', group: '市民结构', format: 'pct', desc: '18–34岁青年人口占比 (ACS 1-Yr B01001)' },
  { key: 'cz_elder', label: '65岁以上占比', short: '老年', group: '市民结构', format: 'pct', desc: '65岁以上老年人口占比 (ACS 1-Yr B01001)' },
  { key: 'cz_born_in_state', label: '本州出生占比', short: '本土生', group: '市民结构', format: 'pct', desc: '出生在当前居住州的人口占比 (ACS 1-Yr B05002)' },
  { key: 'cz_drove_alone', label: '独自驾车通勤', short: '独驾', group: '市民结构', format: 'pct', desc: '独自驾车通勤的就业者占比 (ACS 1-Yr C08301)' },
  { key: 'cz_transit', label: '公共交通通勤', short: '公交', group: '市民结构', format: 'pct', desc: '搭乘公共交通通勤的就业者占比 (ACS 1-Yr C08301)' },
  { key: 'cz_walk', label: '步行通勤占比', short: '步行', group: '市民结构', format: 'pct', desc: '步行通勤的就业者占比 (ACS 1-Yr C08301)' },
  { key: 'cz_home', label: '居家办公占比', short: '居家', group: '市民结构', format: 'pct', desc: '居家远程办公的就业者占比 (ACS 1-Yr C08301)' },
  { key: 'cz_graduate', label: '研究生及以上', short: '硕博', group: '市民结构', format: 'pct', desc: '25岁+ 持有研究生或专业学位占比 (ACS 1-Yr C15003)' },
  { key: 'gdp', label: '真实 GDP', short: 'GDP', group: '经济', format: 'money', desc: 'BEA CAGDP2 2024 现价 GDP (含弗吉尼亚独立市县合并拆分)' },
  { key: 'gdp_pc', label: '人均 GDP', short: '人均GDP', group: '经济', format: 'usd', desc: 'BEA GDP ÷ 常住人口' },
  { key: 'city_type', label: '城市原型', short: '原型', group: '经济与城区', format: 'text', desc: '基于 BLS QCEW 就业区位熵识别的都会主导产业原型' },
  { key: 'n_districts', label: '特色城区数', short: '城区数', group: '经济与城区', format: 'int', desc: '满足高区位熵/就业门槛的特色产业城区数量' },
  { key: 'qcew_jobs', label: 'QCEW 私营就业', short: 'QCEW就业', group: '经济与城区', format: 'int', desc: 'BLS QCEW 2024 年度覆盖岗位总数' },
  { key: 'qcew_pay', label: 'QCEW 平均年薪', short: 'QCEW年薪', group: '经济与城区', format: 'usd', desc: 'BLS QCEW 2024 雇员年均薪酬' },
  { key: 'top_lq', label: '最强区位熵 LQ', short: '最强LQ', group: '经济与城区', format: 'ratio', desc: '都会区最强特色城区相对全美均值的就业集中倍数' },
  { key: 'income', label: '家庭中位收入', short: '收入', group: '繁荣与住房', format: 'usd', lens: 'income', desc: '家庭中位年收入 (ACS)' },
  { key: 'home', label: '房价中位数', short: '房价', group: '繁荣与住房', format: 'usd', lens: 'home', desc: '自有住房估值中位数 (ACS)' },
  { key: 'affordability', label: '房价收入比', short: '房价/收入', group: '繁荣与住房', format: 'ratio', higherBad: true, desc: '房价中位数 ÷ 家庭中位收入' },
  { key: 'rent', label: '月租金中位数', short: '月租', group: '繁荣与住房', format: 'usd', desc: '月租金中位数 (ACS 1-Yr)' },
  { key: 'rent_burden', label: '房租收入比', short: '房租比', group: '繁荣与住房', format: 'pct', higherBad: true, desc: '年租金 ÷ 家庭中位收入' },
  { key: 'unemployment', label: '失业率', short: '失业率', group: '繁荣与住房', format: 'pct', higherBad: true, desc: '失业人数 ÷ 平民劳动力 (ACS 2025 B23025)' },
  { key: 'poverty', label: '贫困率', short: '贫困率', group: '繁荣与住房', format: 'pct', lens: 'poverty', higherBad: true, desc: '低于联邦贫困线人口占比' },
  { key: 'homeownership', label: '住房自有率', short: '自有率', group: '繁荣与住房', format: 'pct', lens: 'homeownership', desc: '自住住房占比' },
  { key: 'uninsured', label: '无医保比例', short: '无医保', group: '繁荣与住房', format: 'pct', lens: 'uninsured', higherBad: true, desc: '无医疗保险覆盖人口占比' },
  { key: 'bachelors', label: '本科及以上学历', short: '本科率', group: '知识', format: 'pct', lens: 'bachelors', desc: '25岁+ 成人本科及以上学历占比' },
  { key: 'broadband', label: '宽带普及率', short: '宽带', group: '知识', format: 'pct', lens: 'broadband', desc: '家庭宽带互联网订阅率' },
  { key: 'y_science', label: '科研信息就业', short: '科研就业', group: '产出', format: 'int', desc: '专业科研与信息业就业人数 (ACS C24030)' },
  { key: 'y_food', label: '农林渔牧就业', short: '农业就业', group: '产出', format: 'int', desc: '农林渔牧业就业人数 (ACS C24030)' },
  { key: 'y_prod', label: '制造建筑采矿就业', short: '工业就业', group: '产出', format: 'int', desc: '制造/建筑/采矿业就业人数 (ACS C24030)' },
  { key: 'amenities', label: '健康宜居指数', short: '宜居', group: '生活与灾害', format: 'index', lens: 'amenities', desc: 'CDC PLACES 4 项身心健康反向 Z 指数 (100=均值；KY/PA 缺席)' },
  { key: 'commute', label: '平均通勤(分)', short: '通勤', group: '生活与灾害', format: 'dec1', lens: 'commute', higherBad: true, desc: '单程平均通勤分钟数' },
  { key: 'faith_rate', label: '宗教信徒率', short: '信徒率', group: '生活与灾害', format: 'dec1', lens: 'faith', desc: '每百名居民信徒数 (USRC 2020；康涅狄格州缺席)' },
  { key: 'disasters', label: 'FEMA 灾害数', short: '灾害', group: '生活与灾害', format: 'int', lens: 'disasters', higherBad: true, desc: '2000 年以来独立重大灾害声明数' },
  { key: 'veterans_pct', label: '退伍军人占比', short: '退伍占比', group: '国防', format: 'pct', lens: 'veterans', desc: '18岁+ 平民中退伍军人占比' },
  { key: 'armed_forces_pct', label: '现役居民占比', short: '现役占比', group: '国防', format: 'pct', desc: '16岁+ 居民中现役军人占比' },
  { key: 'installations', label: '军事基地数', short: '基地数', group: '国防', format: 'int', desc: 'DoD MIRTA 2025 入图军事基地与设施数' },
  { key: 'encampment', label: '军营等级', short: '军营', group: '国防', format: 'text', desc: 'Fortress (重镇 ≥5,000 现役) 或 Garrison (驻军 ≥1,000 或 ≥3%)' },
  { key: 'mil_active', label: '现役军人 (DMDC)', short: '现役', group: '国防', format: 'int', desc: 'DoD DMDC 2025 州级驻扎现役人数' },
  { key: 'mil_guard_reserve', label: '国民警卫队/预备役', short: '预备役', group: '国防', format: 'int', desc: 'DoD DMDC 2025 州级国民警卫队与预备役人数' },
  { key: 'mil_civilian', label: '国防部文职', short: '文职', group: '国防', format: 'int', desc: 'DoD DMDC 2025 州级国防部文职人数' },
  { key: 'def_spending', label: '国防支出', short: '防务$', group: '国防', format: 'money', desc: 'OLDCC FY2024 州级国防合同/薪资/拨款总额' },
  { key: 'def_per_resident', label: '人均国防支出', short: '人均防务', group: '国防', format: 'usd', desc: 'OLDCC FY2024 国防支出 ÷ 常住人口' },
  { key: 'def_pct_gdp', label: '防务占 GDP', short: '防务%GDP', group: '国防', format: 'pct', desc: 'OLDCC FY2024 国防支出 ÷ 州级 GDP' },
  { key: 'forest', label: '森林覆被率', short: '森林', group: '土地', format: 'pct', lens: 'forest', desc: 'NLCD 森林覆被占比' },
  { key: 'farmland', label: '农田覆被率', short: '农田', group: '土地', format: 'pct', lens: 'farmland', desc: 'NLCD 耕地与牧场占比' },
  { key: 'developed', label: '建成区占比', short: '建成区', group: '土地', format: 'pct', lens: 'developed', desc: 'NLCD 城镇建设用地占比' },
  { key: 'energy_mw', label: '入图电力 MW', short: '电力MW', group: '土地', format: 'int', desc: '门槛以上入图大型电厂装机 (MW)' },
];

const FIELD_MAP = new Map(ALL_FIELDS.map((f) => [f.key, f]));

const DEFAULT_COLS: Record<LevelKey, string[]> = {
  states: ['pop', 'growth', 'gdp_pc', 'income', 'unemployment'],
  metros: ['pop', 'growth', 'gdp_pc', 'income'],
  counties: ['pop', 'density', 'income', 'poverty'],
};

const DEFAULT_XY: Record<LevelKey, { x: string; y: string; s: string; c: string }> = {
  states: { x: 'income', y: 'growth', s: 'pop', c: 'unemployment' },
  metros: { x: 'gdp_pc', y: 'growth', s: 'pop', c: 'income' },
  counties: { x: 'income', y: 'bachelors', s: 'pop', c: 'density' },
};

const CAT_PALETTE = ['#e0b54c', '#4a86d6', '#3f9c82', '#c46a4f', '#9a7bc9', '#6e9a3c', '#d98a2b', '#5fbfbf', '#c9a0c0', '#a3a3c2'];

function parseFilterVal(raw: string, fmt: FieldFmt): number | null {
  const s = raw.trim().replace(/[$,\s]/g, '').toUpperCase();
  if (!s) return null;
  if (s.endsWith('%')) {
    const n = parseFloat(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const mults: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const last = s[s.length - 1];
  const mult = mults[last] ?? 1;
  const numStr = mult > 1 ? s.slice(0, -1) : s;
  const n = parseFloat(numStr);
  if (!Number.isFinite(n)) return null;
  if ((fmt === 'pct' || fmt === 'signed') && Math.abs(n) > 1.5 && mult === 1) return n / 100;
  return n * mult;
}

function fmtCellVal(v: unknown, fmt: FieldFmt): string {
  if (v == null) return '–';
  if (fmt === 'text') return String(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return '–';
  if (fmt === 'int') return fmtCount3(n);
  if (fmt === 'money') return fmtMoney3(n);
  if (fmt === 'usd') return fmtMoney3(n);
  if (fmt === 'pct') return `${(n * 100).toFixed(1)}%`;
  if (fmt === 'signed') return fmtSignedPct(n);
  if (fmt === 'ratio') return `×${n.toFixed(1)}`;
  if (fmt === 'index') return n.toFixed(1);
  return n >= 1000 ? fmtCount3(n) : n.toFixed(1);
}

const STORE_KEY = 'terra_americana_explorer_v4';
const ROW_H = 29;
const VIEW_H = 280;
const OVERSCAN = 10;

export const CountyExplorerPanel: React.FC<CountyExplorerPanelProps> = ({
  meta,
  dataset,
  cities,
  states,
  world,
  onFlyTo,
}) => {
  const { setBrushed, setLens, activeLensId, openCity, openState, setAdvisorVisuals, geoScope, setGeoScope } = useAppStore();

  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
  }, []);

  const [level, setLevel] = useState<LevelKey>(saved?.level ?? 'metros');
  const [colsByLevel, setColsByLevel] = useState<Record<LevelKey, string[]>>(saved?.cols ?? DEFAULT_COLS);
  const [xyByLevel, setXyByLevel] = useState<Record<LevelKey, { x: string; y: string; s: string; c: string }>>(saved?.xy ?? DEFAULT_XY);
  const [colsOpen, setColsOpen] = useState(false);

  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [fKey, setFKey] = useState('pop');
  const [fOp, setFOp] = useState<ActiveFilter['op']>('>');
  const [fVal, setFVal] = useState('');

  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('pop');
  const [sortAsc, setSortAsc] = useState(false);
  const [logXOverride, setLogXOverride] = useState<boolean | null>(null);
  const [logYOverride, setLogYOverride] = useState<boolean | null>(null);
  const [brushedIds, setBrushedIds] = useState<Set<string> | null>(null);
  const [onlySel, setOnlySel] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    setAdvisorVisuals(null, false);
  }, [setAdvisorVisuals]);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ level, cols: colsByLevel, xy: xyByLevel })); } catch { /* noop */ }
  }, [level, colsByLevel, xyByLevel]);

  const scopedStates = useMemo(
    () => (geoScope === 'conus' ? states.filter((s) => s.abbr !== 'AK' && s.abbr !== 'HI') : states),
    [states, geoScope],
  );
  const scopedCities = useMemo(
    () => (geoScope === 'conus' ? cities.filter((c) => c.state_abbr !== 'AK' && c.state_abbr !== 'HI') : cities),
    [cities, geoScope],
  );
  const scopedCountyRows = useMemo(
    () => (!dataset ? [] : geoScope === 'conus' ? dataset.rows.filter((r) => r.state !== 'AK' && r.state !== 'HI') : dataset.rows),
    [dataset, geoScope],
  );

  const stateHexMap = useMemo(() => {
    const m = new Map<string, number[]>();
    for (let i = 0; i < world.n; i++) {
      const sf = world.st[i];
      let arr = m.get(sf);
      if (!arr) { arr = []; m.set(sf, arr); }
      arr.push(i);
    }
    return m;
  }, [world]);

  // Build unified rows for States (49/51) | Metros & Micros (524/530) | Counties (3,109/3,144)
  const allRows = useMemo<UnifiedRow[]>(() => {
    if (level === 'states') {
      return scopedStates.map((s) => ({
        id: s.fips,
        name: s.name,
        sub: s.abbr,
        region: s.region_name,
        land_km2: s.land_km2 ?? null,
        x: s.x,
        y: s.y,
        hexIds: stateHexMap.get(s.fips) ?? [],
        pop: s.pop,
        growth: s.pop_growth_pct,
        density: s.density ?? null,
        age: s.median_age ?? null,
        foreign_born: s.foreign_born_pct ?? null,
        gdp: s.gdp_musd * 1e6,
        gdp_pc: s.gdp_per_cap,
        income: s.median_income,
        home: s.median_home,
        affordability: s.median_home && s.median_income ? s.median_home / s.median_income : null,
        rent: s.median_rent ?? null,
        rent_burden: s.rent_burden ?? null,
        unemployment: s.unemployment ?? null,
        poverty: s.poverty_pct ?? null,
        homeownership: s.homeownership_pct ?? null,
        uninsured: s.uninsured_pct ?? null,
        bachelors: s.bachelors_pct,
        broadband: s.broadband_pct ?? null,
        y_science: s.yields_workers?.science ?? null,
        y_food: s.yields_workers?.food ?? null,
        y_prod: s.yields_workers?.production ?? null,
        amenities: s.amenities,
        commute: s.commute_min ?? null,
        faith_rate: s.faith_rate,
        disasters: s.fema_total ?? s.disasters,
        veterans_pct: s.veterans_pct,
        armed_forces_pct: s.armed_forces_pct ?? null,
        installations: s.installations_count ?? null,
        mil_active: s.military_active ?? null,
        mil_guard_reserve: s.military_reserve ?? null,
        mil_civilian: s.military_civilian ?? null,
        def_spending: s.defense_spending_musd != null ? s.defense_spending_musd * 1e6 : null,
        def_per_resident: s.defense_per_resident ?? null,
        def_pct_gdp: s.defense_pct_gdp != null ? s.defense_pct_gdp / 100 : null,
        forest: s.land_cover?.forest ?? null,
        farmland: s.land_cover ? (s.land_cover.crop ?? 0) + (s.land_cover.pasture ?? 0) : null,
        developed: s.land_cover?.developed ?? null,
        energy_mw: Object.values(s.power_mw_by_fuel).reduce((a, b) => a + b, 0),
      }));
    }
    if (level === 'metros') {
      return scopedCities.map((c) => ({
        id: c.id,
        name: c.short_name,
        sub: (c.states_sub ?? c.state_abbr).replace(/\s+(Metro|Micro)\s+Area$/i, ''),
        region: ['Northeast', 'Midwest', 'South', 'West'][c.region] ?? 'West',
        kind: c.is_metro ? 'Metro' : 'Micro',
        land_km2: c.land_km2 ?? null,
        x: c.x,
        y: c.y,
        hexIds: c.hex_ids,
        pop: c.pop,
        growth: c.pop_growth_pct,
        density: c.density ?? null,
        age: c.median_age,
        foreign_born: c.foreign_born_pct,
        cz_child: c.citizens_extra?.cz_child ?? null,
        cz_young: c.citizens_extra?.cz_young ?? null,
        cz_elder: c.citizens_extra?.cz_elder ?? null,
        cz_born_in_state: c.citizens_extra?.cz_born_in_state ?? null,
        cz_drove_alone: c.citizens_extra?.cz_drove_alone ?? null,
        cz_transit: c.citizens_extra?.cz_transit ?? null,
        cz_walk: c.citizens_extra?.cz_walk ?? null,
        cz_home: c.citizens_extra?.cz_home ?? null,
        cz_graduate: c.citizens_extra?.cz_graduate ?? null,
        gdp: c.gdp_musd != null ? c.gdp_musd * 1e6 : null,
        gdp_pc: c.gdp_per_cap,
        city_type: c.city_type ?? null,
        n_districts: c.n_districts ?? c.districts.length,
        qcew_jobs: c.qcew_jobs ?? null,
        qcew_pay: c.qcew_pay ?? null,
        top_lq: c.top_lq ?? null,
        income: c.median_income,
        home: c.median_home,
        affordability: c.median_home && c.median_income ? c.median_home / c.median_income : null,
        rent: c.median_rent,
        rent_burden: c.rent_burden ?? null,
        unemployment: c.unemployment ?? null,
        poverty: c.poverty_pct,
        homeownership: c.homeownership_pct ?? null,
        uninsured: c.uninsured_pct ?? null,
        bachelors: c.bachelors_pct,
        broadband: c.broadband_pct ?? null,
        y_science: c.yields_workers?.science ?? null,
        y_food: c.yields_workers?.food ?? null,
        y_prod: c.yields_workers?.production ?? null,
        amenities: c.amenities,
        commute: c.commute_min,
        faith_rate: c.faith_rate,
        disasters: c.disasters,
        veterans_pct: c.veterans_pct ?? null,
        armed_forces_pct: c.armed_forces_pct ?? null,
        installations: c.installations_count ?? 0,
        encampment: c.garrison_tier === 'fortress' ? 'Fortress' : c.garrison_tier === 'garrison' ? 'Garrison' : 'None',
        energy_mw: c.energy_mw ?? null,
      }));
    }
    return scopedCountyRows.map((r) => ({
      id: r.fips,
      name: r.name,
      sub: r.state,
      region: r.region_name,
      x: r.x,
      y: r.y,
      hexIds: r.hex_ids,
      pop: Number(r.pop ?? 0),
      growth: typeof r.pop_growth === 'number' ? r.pop_growth : null,
      density: typeof r.density === 'number' ? r.density : null,
      age: typeof r.age === 'number' ? r.age : null,
      foreign_born: typeof r.foreign_born === 'number' ? r.foreign_born : null,
      gdp: typeof r.gdp_musd === 'number' ? r.gdp_musd * 1e6 : null,
      gdp_pc: typeof r.gdp_per_cap === 'number' ? r.gdp_per_cap : null,
      income: typeof r.income === 'number' ? r.income : null,
      home: typeof r.home === 'number' ? r.home : null,
      affordability: typeof r.affordability === 'number' ? r.affordability : null,
      poverty: typeof r.poverty === 'number' ? r.poverty : null,
      homeownership: typeof r.homeownership === 'number' ? r.homeownership : null,
      uninsured: typeof r.uninsured === 'number' ? r.uninsured : null,
      bachelors: typeof r.bachelors === 'number' ? r.bachelors : null,
      broadband: typeof r.broadband === 'number' ? r.broadband : null,
      amenities: typeof r.amenities === 'number' ? r.amenities : null,
      commute: typeof r.commute === 'number' ? r.commute : null,
      faith_rate: typeof r.faith_rate === 'number' ? r.faith_rate : null,
      disasters: typeof r.disasters === 'number' ? r.disasters : null,
      veterans_pct: typeof r.veterans === 'number' ? r.veterans : null,
      armed_forces_pct: typeof r.armed_forces_pct === 'number' ? r.armed_forces_pct : null,
      forest: typeof r.forest === 'number' ? r.forest : null,
      farmland: typeof r.farmland === 'number' ? r.farmland : null,
      developed: typeof r.developed === 'number' ? r.developed : null,
      energy_mw: typeof r.power_mw === 'number' ? r.power_mw : null,
    }));
  }, [level, scopedStates, scopedCities, scopedCountyRows, stateHexMap]);

  // Fields populated for this level (scan all rows so sparse columns like city_type appear reliably)
  const availableFields = useMemo(() => {
    return ALL_FIELDS.filter((f) => allRows.some((r) => r[f.key] != null));
  }, [allRows]);

  const numericFields = useMemo(() => availableFields.filter((f) => f.format !== 'text'), [availableFields]);
  const activeCols = useMemo(
    () => (colsByLevel[level] ?? DEFAULT_COLS[level]).filter((k) => availableFields.some((f) => f.key === k)),
    [colsByLevel, level, availableFields],
  );
  const xy = xyByLevel[level] ?? DEFAULT_XY[level];

  const passesFilter = (r: UnifiedRow, flt: ActiveFilter) => {
    const fd = FIELD_MAP.get(flt.key);
    const v = r[flt.key];
    if (!fd) return true;
    if (fd.format === 'text') {
      const s = String(v ?? '').toLowerCase();
      const t = String(flt.value).toLowerCase();
      if (flt.op === '=') return s === t;
      if (flt.op === '≠') return s !== t;
      return s.includes(t);
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    const t = Number(flt.value);
    if (flt.op === '>') return v > t;
    if (flt.op === '≥') return v >= t;
    if (flt.op === '<') return v < t;
    if (flt.op === '≤') return v <= t;
    return Math.abs(v - t) <= Math.abs(t) * 0.005 + 1e-9;
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.sub.toLowerCase().includes(q) && !r.id.includes(q)) return false;
      for (const flt of filters) if (!passesFilter(r, flt)) return false;
      return true;
    });
  }, [allRows, search, filters]);

  const tableRows = useMemo(() => {
    const base = onlySel && brushedIds ? filteredRows.filter((r) => brushedIds.has(r.id)) : filteredRows;
    return [...base].sort((a, b) => {
      if (!onlySel && brushedIds && brushedIds.size > 0) {
        const ai = brushedIds.has(a.id) ? 1 : 0;
        const bi = brushedIds.has(b.id) ? 1 : 0;
        if (ai !== bi) return bi - ai;
      }
      const va = a[sortCol], vb = b[sortCol];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [filteredRows, onlySel, brushedIds, sortCol, sortAsc]);

  useEffect(() => {
    setScrollTop(0);
    if (tableRef.current) tableRef.current.scrollTop = 0;
  }, [level, geoScope, search, filters, sortCol, sortAsc, onlySel]);

  const maxSortVal = useMemo(() => {
    let m = 1e-6;
    for (const r of allRows) {
      const v = r[sortCol];
      if (typeof v === 'number' && Math.abs(v) > m) m = Math.abs(v);
    }
    return m;
  }, [allRows, sortCol]);

  // Auto-log detection for >60x positive span
  const autoLog = (k: string) => {
    let mn = Infinity, mx = -Infinity;
    for (const r of filteredRows) {
      const v = r[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (v <= 0) return false;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return mn > 0 && mx / mn > 60;
  };

  const logX = logXOverride ?? autoLog(xy.x);
  const logY = logYOverride ?? autoLog(xy.y);

  const fx = FIELD_MAP.get(xy.x) ?? numericFields[0];
  const fy = FIELD_MAP.get(xy.y) ?? numericFields[1];
  const fs = xy.s ? FIELD_MAP.get(xy.s) ?? null : null;
  const fc = xy.c ? FIELD_MAP.get(xy.c) ?? null : null;

  // Compute Scatter Points + Color Legend (full 3,109 counties plotted via Canvas2D inside BrushScatter!)
  const { scatterPts, colorLegend } = useMemo(() => {
    const src = filteredRows;
    let minC = Infinity, maxC = -Infinity;
    const catMap = new Map<string, string>();
    if (fc) {
      if (fc.format === 'text') {
        const cats = [...new Set(src.map((r) => String(r[fc.key] ?? '–')))].slice(0, 10);
        cats.forEach((c, i) => catMap.set(c, CAT_PALETTE[i % CAT_PALETTE.length]));
      } else {
        const vals = src.map((r) => r[fc.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
        if (vals.length > 0) {
          minC = vals[Math.floor(vals.length * 0.03)];
          maxC = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.97))];
        }
      }
    }

    const rampKey = fc?.higherBad ? 'risk' : 'wealth';
    const pts: ScatterPoint[] = [];
    for (const r of src) {
      const xv = r[fx.key], yv = r[fy.key];
      if (typeof xv !== 'number' || typeof yv !== 'number') continue;
      if (logX && xv <= 0) continue;
      if (logY && yv <= 0) continue;
      const sv = fs && typeof r[fs.key] === 'number' ? Math.max(0, r[fs.key] as number) : 1;
      let col = '#d4ae5e';
      let extra = '';
      if (fc) {
        const cv = r[fc.key];
        if (fc.format === 'text') {
          col = catMap.get(String(cv ?? '–')) ?? '#8b8070';
          extra = `${fc.short}: ${cv ?? '–'}`;
        } else if (typeof cv === 'number') {
          const t = maxC > minC ? (cv - minC) / (maxC - minC) : 0.5;
          const rgb = sampleRamp(rampKey, t);
          col = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
          extra = `${fc.short}: ${fmtCellVal(cv, fc.format)}`;
        }
      }
      pts.push({
        id: r.id,
        label: r.name,
        sub: r.sub,
        x: xv,
        y: yv,
        r: sv,
        color: col,
        hexIds: r.hexIds,
        fly: [r.x, r.y],
        extraTip: extra,
      });
    }

    const legend = fc
      ? fc.format === 'text'
        ? { kind: 'cat' as const, items: [...catMap.entries()].map(([label, color]) => ({ label, color })) }
        : { kind: 'num' as const, ramp: rampKey as 'risk' | 'wealth', minLabel: fmtCellVal(minC, fc.format), maxLabel: fmtCellVal(maxC, fc.format), title: fc.label }
      : null;

    return { scatterPts: pts, colorLegend: legend };
  }, [filteredRows, level, fx, fy, fs, fc, logX, logY]);

  const topLabelIds = useMemo(
    () => new Set([...filteredRows].sort((a, b) => Number(b.pop ?? 0) - Number(a.pop ?? 0)).slice(0, level === 'states' ? 10 : 6).map((r) => r.id)),
    [filteredRows, level],
  );

  const totalFilteredPop = useMemo(() => filteredRows.reduce((s, r) => s + Number(r.pop ?? 0), 0), [filteredRows]);

  const addFilter = () => {
    const fd = FIELD_MAP.get(fKey);
    if (!fd || !fVal.trim()) return;
    const val = fd.format === 'text' ? fVal.trim() : parseFilterVal(fVal, fd.format);
    if (val == null) return;
    setFilters((prev) => [...prev, { id: `${Date.now()}`, key: fd.key, op: fOp, value: val }]);
    setFVal('');
    setBrushedIds(null);
  };

  const applyPreset = (key: string, op: ActiveFilter['op'], value: number) => {
    setFilters((prev) => [...prev.filter((f) => f.key !== key), { id: `${Date.now()}`, key, op, value }]);
    setBrushedIds(null);
  };

  const exportCsv = () => {
    const cols = ['id', 'name', 'sub', ...activeCols];
    const lines = [cols.join(',')];
    for (const r of tableRows) {
      lines.push(cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `terra-americana-${level}-${tableRows.length}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const groupedFields = useMemo(() => {
    const m = new Map<string, FieldSpec[]>();
    for (const f of availableFields) {
      let arr = m.get(f.group);
      if (!arr) { arr = []; m.set(f.group, arr); }
      arr.push(f);
    }
    return [...m.entries()];
  }, [availableFields]);

  const lensFields = useMemo(() => {
    const out: FieldSpec[] = [];
    for (const f of [fc, fy, fx]) {
      if (f?.lens && !out.some((x) => x.lens === f.lens)) out.push(f);
    }
    return out;
  }, [fc, fy, fx]);

  const fSpecSelected = FIELD_MAP.get(fKey);

  const totalH = tableRows.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = Math.min(tableRows.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN);
  const topPad = startIdx * ROW_H;
  const bottomPad = Math.max(0, totalH - endIdx * ROW_H);
  const colSpan = 2 + activeCols.length;
  const conusStateCount = useMemo(() => states.filter((s) => s.abbr !== 'AK' && s.abbr !== 'HI').length, [states]);
  const conusCityCount = useMemo(() => cities.filter((c) => c.state_abbr !== 'AK' && c.state_abbr !== 'HI').length, [cities]);
  const conusCountyCount = useMemo(() => (dataset ? dataset.rows.filter((r) => r.state !== 'AK' && r.state !== 'HI').length : 3109), [dataset]);

  return (
    <aside
      className="fixed top-11 left-0 bottom-0 z-30 w-[min(458px,100vw)] flex flex-col border-r overflow-hidden"
      style={{
        background: 'var(--surface-paper)',
        borderColor: 'var(--border-strong)',
        boxShadow: '8px 0 32px rgba(0,0,0,0.45)',
      }}
    >
      <AdvisorMedallionBar activeId="explorer" />

      {/* Compact Geographic Scope Toggle (Default = Lower 48 + DC for exact 49 / 524 / 3,109 parity) */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--border-hairline)] bg-black/15 shrink-0 text-[10.5px]">
        <span className="opacity-65">统计范围</span>
        <div className="inline-flex rounded-md border border-[var(--border-hairline)] bg-black/25 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setGeoScope('conus')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition ${
              geoScope === 'conus' ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-70 hover:opacity-100'
            }`}
          >
            本土 48 州+DC ({conusStateCount}州·{conusCityCount}城·{conusCountyCount.toLocaleString()}县)
          </button>
          <button
            type="button"
            onClick={() => setGeoScope('all')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition ${
              geoScope === 'all' ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-70 hover:opacity-100'
            }`}
          >
            含 AK/HI ({states.length}州·{cities.length}城)
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* Masthead */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-hairline)]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 shadow-lg"
              style={{ background: 'radial-gradient(circle at 30% 30%, #9A7BC9, #1E1236)', borderColor: '#9A7BC9', color: '#FFFDF7' }}
            >
              <Table2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-widest opacity-60">CARTOGRAPHER · 制图师工作台</div>
              <h2 className="font-display text-lg font-bold m-0 leading-tight" style={{ color: 'var(--brass-bright)' }}>
                EXPLORER · 全维探索器
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="px-2 py-1 rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-paper-hover)] text-[10.5px] flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>

        <p className="text-[11px] opacity-75 leading-relaxed m-0">
          全美 <b>{scopedStates.length} 个州</b>、<b>{scopedCities.length} 座都会/微都会区</b> 与 <b>{scopedCountyRows.length.toLocaleString()} 个县</b> 的原始公开指标全部汇入同一张自由透视台：自定义列、多条件筛选、全量虚拟滚动明细、全量散点图框选联动地图，以及一键 CSV 导出。
        </p>

        {/* 1. Level + Columns Picker + Custom Filter Builder */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Segmented
              value={level}
              options={[
                { value: 'states', label: `州 (${scopedStates.length})` },
                { value: 'metros', label: `都会区 (${scopedCities.length})` },
                { value: 'counties', label: `县 (${scopedCountyRows.length.toLocaleString()})` },
              ]}
              onChange={(v) => {
                const lv = v as LevelKey;
                setLevel(lv);
                setFilters([]);
                setBrushedIds(null);
                setOnlySel(false);
                setLogXOverride(null);
                setLogYOverride(null);
                setBrushed(null, null);
              }}
            />
            <button
              type="button"
              onClick={() => setColsOpen((v) => !v)}
              className={`px-2 py-1 rounded-lg border text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer ${
                colsOpen ? 'border-[var(--brass)] bg-[var(--brass-soft)]' : 'border-[var(--border-hairline)] hover:bg-white/10'
              }`}
            >
              <Columns className="w-3 h-3" /> 列设置 ({activeCols.length})
            </button>
          </div>

          {colsOpen && (
            <div className="p-2.5 rounded-lg border border-[var(--brass)] bg-black/35 space-y-2 max-h-56 overflow-y-auto">
              {groupedFields.map(([grp, list]) => (
                <div key={grp}>
                  <div className="text-[9.5px] font-bold uppercase tracking-wider opacity-60 mb-1">{grp}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((f) => {
                      const on = activeCols.includes(f.key);
                      return (
                        <label
                          key={f.key}
                          className={`px-2 py-0.5 rounded border text-[10.5px] cursor-pointer flex items-center gap-1 ${
                            on ? 'border-[var(--brass)] bg-[var(--brass-soft)] font-semibold' : 'border-white/10 opacity-70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => {
                              const cur = colsByLevel[level] ?? DEFAULT_COLS[level];
                              const next = e.target.checked ? [...cur.filter((k) => k !== f.key), f.key] : cur.filter((k) => k !== f.key);
                              setColsByLevel({ ...colsByLevel, [level]: next });
                            }}
                            className="accent-[var(--brass)]"
                          />
                          {f.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Custom Filter Builder */}
          <div className="flex items-center gap-1">
            <select
              value={fKey}
              onChange={(e) => {
                setFKey(e.target.value);
                const fd = FIELD_MAP.get(e.target.value);
                setFOp(fd?.format === 'text' ? 'contains' : '>');
              }}
              className="flex-1 min-w-0 px-1.5 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] text-[11px] outline-none"
            >
              {availableFields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            <select
              value={fOp}
              onChange={(e) => setFOp(e.target.value as ActiveFilter['op'])}
              className="w-14 px-1 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] text-[11px] outline-none font-mono-num"
            >
              {(fSpecSelected?.format === 'text' ? ['contains', '=', '≠'] : ['>', '≥', '<', '≤', '=']).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <input
              value={fVal}
              onChange={(e) => setFVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addFilter(); }}
              placeholder={fSpecSelected?.format === 'text' ? '如 CA' : '如 1M, 25%'}
              className="w-20 px-2 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] text-[11px] outline-none"
            />
            <button
              type="button"
              onClick={addFilter}
              className="px-2 py-1 rounded-md bg-[var(--brass)] text-[#141B24] font-bold text-[10.5px] flex items-center gap-0.5 cursor-pointer shrink-0"
            >
              <Plus className="w-3 h-3" /> 添加
            </button>
          </div>

          {/* Quick Presets + Active Filter Chips */}
          <div className="flex flex-wrap items-center gap-1">
            {level === 'counties' ? (
              <button type="button" onClick={() => applyPreset('pop', '≥', 100000)} className="px-2 py-0.5 rounded-full bg-white/8 hover:bg-white/15 text-[10px] cursor-pointer">
                10万+ 人口
              </button>
            ) : (
              <>
                <button type="button" onClick={() => applyPreset('pop', '≥', 1000000)} className="px-2 py-0.5 rounded-full bg-white/8 hover:bg-white/15 text-[10px] cursor-pointer">
                  100万+ 人口
                </button>
                <button type="button" onClick={() => applyPreset('pop', '≥', 250000)} className="px-2 py-0.5 rounded-full bg-white/8 hover:bg-white/15 text-[10px] cursor-pointer">
                  25万+
                </button>
              </>
            )}
            {filters.map((flt) => {
              const fd = FIELD_MAP.get(flt.key);
              return (
                <span key={flt.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--brass-soft)] border border-[var(--brass)] text-[10px] font-semibold">
                  {fd?.short ?? flt.key} {flt.op} {fd ? fmtCellVal(flt.value, fd.format) : String(flt.value)}
                  <button type="button" onClick={() => setFilters((p) => p.filter((x) => x.id !== flt.id))} className="cursor-pointer"><X className="w-2.5 h-2.5" /></button>
                </span>
              );
            })}
            {filters.length > 1 && (
              <button type="button" onClick={() => setFilters([])} className="text-[10px] underline opacity-70 cursor-pointer">清空筛选</button>
            )}
          </div>

          <div className="text-[10.5px] font-mono-num opacity-75">
            <b>{filteredRows.length.toLocaleString()}</b> / {allRows.length.toLocaleString()} {level === 'states' ? '个州' : level === 'metros' ? '个都会区' : '个县'} · <b>{fmtCount3(totalFilteredPop)}</b> 人
            {brushedIds && brushedIds.size > 0 && <> · <b style={{ color: 'var(--brass-bright)' }}>已框选 {brushedIds.size} 项</b></>}
          </div>
        </div>

        {/* 2. Dynamic Sortable Table */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-xs font-bold m-0">数据表 · Table</h3>
            {brushedIds && brushedIds.size > 0 && (
              <div className="flex items-center gap-2 text-[10.5px]">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} className="accent-[var(--brass)]" />
                  仅看框选
                </label>
                <button type="button" onClick={() => { setBrushedIds(null); setOnlySel(false); setBrushed(null, null); }} className="underline cursor-pointer" style={{ color: 'var(--brass-bright)' }}>
                  清除
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border-hairline)] overflow-hidden bg-black/20">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[var(--border-hairline)] bg-black/25">
              <Search className="w-3 h-3 opacity-50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`搜索${level === 'states' ? '州名' : level === 'metros' ? '都会区' : '县名/州'}...`}
                className="w-full bg-transparent outline-none text-[11px] placeholder:opacity-50"
              />
              <span className="text-[10px] font-mono-num opacity-65 shrink-0">共 {tableRows.length.toLocaleString()} 条</span>
            </div>
            <div
              ref={tableRef}
              onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
              className="overflow-auto"
              style={{ maxHeight: VIEW_H }}
            >
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 z-10 bg-[#131c28] border-b border-[var(--border-hairline)]">
                  <tr>
                    <th className="py-1.5 pl-2 pr-1 text-left opacity-45 font-mono-num w-8">#</th>
                    <th className="py-1.5 px-1.5 text-left font-semibold opacity-75">名称</th>
                    {activeCols.map((k) => {
                      const f = FIELD_MAP.get(k);
                      if (!f) return null;
                      return (
                        <th
                          key={k}
                          onClick={() => {
                            if (sortCol === k) setSortAsc(!sortAsc);
                            else { setSortCol(k); setSortAsc(false); }
                          }}
                          className={`py-1.5 px-1.5 font-semibold opacity-75 hover:opacity-100 cursor-pointer whitespace-nowrap ${f.format === 'text' ? 'text-left' : 'text-right'}`}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {f.short}
                            {sortCol === k && (sortAsc ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {topPad > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={colSpan} style={{ height: topPad, padding: 0, border: 0 }} />
                    </tr>
                  )}
                  {tableRows.slice(startIdx, endIdx).map((r, i) => {
                    const idx = startIdx + i;
                    const inBrush = brushedIds?.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        style={{ height: ROW_H }}
                        onMouseEnter={() => setBrushed(new Set(r.hexIds), r.name)}
                        onMouseLeave={() => {
                          if (!brushedIds) setBrushed(null, null);
                        }}
                        onClick={() => {
                          if (level === 'metros') openCity(r.id);
                          else if (level === 'states') openState(r.id);
                          else onFlyTo(r.x, r.y, 1.45);
                        }}
                        className={`border-b border-white/[0.04] cursor-pointer transition ${
                          inBrush ? 'bg-[var(--brass-soft)]' : 'hover:bg-[var(--surface-paper-hover)]'
                        }`}
                      >
                        <td className="py-1 pl-2 pr-1 font-mono-num opacity-45 text-[10px]">{idx + 1}</td>
                        <td className="py-1 px-1.5 font-medium max-w-[130px] truncate">
                          {r.name} {level !== 'states' && <span className="opacity-50 text-[10px]">{r.sub}</span>}
                        </td>
                        {activeCols.map((k) => {
                          const f = FIELD_MAP.get(k)!;
                          const v = r[k];
                          const barW = k === sortCol && typeof v === 'number' ? Math.min(100, (Math.abs(v) / maxSortVal) * 100) : 0;
                          return (
                            <td key={k} className={`py-1 px-1.5 relative whitespace-nowrap ${f.format === 'text' ? 'text-left' : 'text-right font-mono-num'}`}>
                              {barW > 0 && <span className="absolute inset-y-0.5 right-0 rounded-sm bg-[#9a7bc9]/30 pointer-events-none" style={{ width: `${barW}%` }} />}
                              <span className="relative z-[1]">{fmtCellVal(v, f.format)}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {bottomPad > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={colSpan} style={{ height: bottomPad, padding: 0, border: 0 }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 3. Interactive Chart Builder (X, Y, Size, Colour + logX/logY + Map Lens bridge!) */}
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <h3 className="font-display text-xs font-bold m-0">交互散点图 · Chart</h3>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[9.5px] opacity-60 block mb-0.5">X 横轴</label>
              <select
                value={xy.x}
                onChange={(e) => { setXyByLevel({ ...xyByLevel, [level]: { ...xy, x: e.target.value } }); setLogXOverride(null); }}
                className="w-full px-1.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] text-[11px]"
              >
                {numericFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9.5px] opacity-60 block mb-0.5">Y 纵轴</label>
              <select
                value={xy.y}
                onChange={(e) => { setXyByLevel({ ...xyByLevel, [level]: { ...xy, y: e.target.value } }); setLogYOverride(null); }}
                className="w-full px-1.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] text-[11px]"
              >
                {numericFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9.5px] opacity-60 block mb-0.5">气泡大小 (Size)</label>
              <select
                value={xy.s}
                onChange={(e) => setXyByLevel({ ...xyByLevel, [level]: { ...xy, s: e.target.value } })}
                className="w-full px-1.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] text-[11px]"
              >
                <option value="">固定大小</option>
                {numericFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9.5px] opacity-60 block mb-0.5">着色列 (Colour)</label>
              <select
                value={xy.c}
                onChange={(e) => setXyByLevel({ ...xyByLevel, [level]: { ...xy, c: e.target.value } })}
                className="w-full px-1.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] text-[11px]"
              >
                <option value="">单色</option>
                {availableFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10.5px]">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={logX} onChange={(e) => setLogXOverride(e.target.checked)} className="accent-[var(--brass)]" />
              对数横轴 (log X)
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={logY} onChange={(e) => setLogYOverride(e.target.checked)} className="accent-[var(--brass)]" />
              对数纵轴 (log Y)
            </label>
          </div>

          <BrushScatter
            points={scatterPts}
            xLabel={fx.label}
            yLabel={fy.label}
            xFmt={fx.format === 'money' ? 'usd' : fx.format === 'signed' ? 'pct' : fx.format}
            yFmt={fy.format === 'money' ? 'usd' : fy.format === 'signed' ? 'pct' : fy.format}
            logX={logX}
            logY={logY}
            height={245}
            labelIds={topLabelIds}
            selectedIds={brushedIds}
            onHoverPoint={(p) => { if (!brushedIds) setBrushed(p?.hexIds ? new Set(p.hexIds) : null, p?.label); }}
            onClickPoint={(p) => {
              if (level === 'metros') openCity(p.id);
              else if (level === 'states') openState(p.id);
              else if (p.fly) onFlyTo(p.fly[0], p.fly[1], 1.45);
            }}
            onBrush={(set) => {
              setBrushedIds(set);
              if (!set) { setBrushed(null, null); return; }
              const hids = new Set<number>();
              for (const r of filteredRows) if (set.has(r.id)) for (const h of r.hexIds) hids.add(h);
              setBrushed(hids, `探索器框选 ${set.size} 项`);
            }}
          />

          {colorLegend?.kind === 'num' && (
            <RampLegend ramp={colorLegend.ramp} title={`着色：${colorLegend.title}`} minLabel={colorLegend.minLabel} maxLabel={colorLegend.maxLabel} />
          )}
          {colorLegend?.kind === 'cat' && <SwatchLegend items={colorLegend.items} />}

          {/* Show plotted column as Map Lens buttons */}
          {lensFields.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {lensFields.map((f) => {
                const on = activeLensId === f.lens;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setLens(on ? null : f.lens!)}
                    className={`px-2 py-1 rounded-lg border text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer ${
                      on ? 'border-[var(--brass)] bg-[var(--brass-soft)]' : 'border-[var(--border-hairline)] hover:bg-white/10'
                    }`}
                  >
                    <MapIcon className="w-3 h-3" />
                    {on ? `正在显示「${f.short}」视角` : `地图着色：${f.short}`}
                  </button>
                );
              })}
            </div>
          )}

          {/* Field Definitions Footer */}
          <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1 text-[10px] opacity-65">
            {[fx, fy, fs, fc].filter((f, i, a): f is FieldSpec => !!f && a.indexOf(f) === i).map((f) => (
              <div key={f.key}><b>{f.label}</b>：{f.desc}</div>
            ))}
          </div>

          <SourcesFooter
            sources={meta.sources}
            sourceIds={['acs_5yr', 'acs_1yr', 'census_pep', 'bea_cagdp2', 'bls_qcew', 'cdc_places', 'usrc_2020', 'fema_disasters', 'dod_mirta', 'dmdc_personnel', 'oldcc_defense', 'nlcd_2024']}
            notes={[
              '地理统计口径：默认聚焦美国本土 48 州 + 华盛顿特区（49 州、524 个都会/微都会区、3,109 个县），可随时切换「含 AK/HI」查看全美 51 州、530 个都会区与 3,144 个县。',
              '全量虚拟滚动与散点绘制：明细表采用窗口虚拟滚动，完整呈现 1 至 3,109 名，不做 120 条截断；县级散点自动切换高 DPI Canvas2D 图层全量渲染全部 3,109 个县并支持拖拽框选联动地图。',
              '缺失值处理遵循官方发布口径：CDC PLACES 未收录肯塔基州与宾夕法尼亚州；USRC 2020 未收录康涅狄格州新规划区县码，均诚实显示为 “–” 而不进行人工插值。',
            ]}
          />
        </div>
      </div>
    </aside>
  );
};
