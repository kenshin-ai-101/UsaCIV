import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Eye, Trophy, X } from 'lucide-react';
import { useAppStore, type TopMetricId } from '../store/useAppStore';
import { fmtCount3, fmtMoney3, fmtMw, fmtSignedPct } from '../features/advisors/AdvisorCharts';
import { localizeIndustry, useL } from '../i18n';
import type { CityRecord, StateRecord, WorldMeta } from '../types/world';

interface TopMetricPopoverProps {
  metric: TopMetricId;
  anchorCenterX: number | null;
  meta: WorldMeta;
  cities: CityRecord[];
  states: StateRecord[];
  stateHexMap: Map<string, number[]>;
  onClose: () => void;
  onSelectMetric: (m: TopMetricId) => void;
}

interface MetricPillDef {
  id: TopMetricId;
  icon: string;
  shortLabel: string;
  shortLabelEn: string;
  title: string;
  titleEn: string;
  sourceTag: string;
  sourceTagEn: string;
  accent: string;
  barColor: string;
}

export const TOP_METRIC_ORDER: TopMetricId[] = [
  'population',
  'food',
  'production',
  'gold',
  'science',
  'culture',
  'unemployment',
];

const METRIC_META: Record<TopMetricId, MetricPillDef> = {
  population: {
    id: 'population',
    icon: '👥',
    shortLabel: '人口',
    shortLabelEn: 'Pop',
    title: '全美常住人口',
    titleEn: 'U.S. Resident Population',
    sourceTag: 'ACS 2025 1-Yr · B01003',
    sourceTagEn: 'ACS 2025 1-Yr · B01003',
    accent: 'var(--brass-bright)',
    barColor: '#c9a455',
  },
  food: {
    id: 'food',
    icon: '🌾',
    shortLabel: '粮食',
    shortLabelEn: 'Food',
    title: '粮食产出 · 农林渔牧就业',
    titleEn: 'Food Yield · Agriculture & Forestry',
    sourceTag: 'ACS 2025 1-Yr · C24030',
    sourceTagEn: 'ACS 2025 1-Yr · C24030',
    accent: 'var(--y-food)',
    barColor: '#7fbf3f',
  },
  production: {
    id: 'production',
    icon: '⚙',
    shortLabel: '产能',
    shortLabelEn: 'Prod',
    title: '生产力 · 工业与建造就业',
    titleEn: 'Production Yield · Mfg / Constr / Mining',
    sourceTag: 'ACS 2025 1-Yr · C24030',
    sourceTagEn: 'ACS 2025 1-Yr · C24030',
    accent: 'var(--y-prod)',
    barColor: '#d9823b',
  },
  gold: {
    id: 'gold',
    icon: '●',
    shortLabel: 'GDP',
    shortLabelEn: 'GDP',
    title: '金币产出 · 全美真实 GDP',
    titleEn: 'Gold Yield · Current-Dollar GDP',
    sourceTag: 'BEA CAGDP2 · 2024 现价',
    sourceTagEn: 'BEA CAGDP2 · 2024 Current $',
    accent: 'var(--y-gold)',
    barColor: '#f2c94c',
  },
  science: {
    id: 'science',
    icon: '⚗',
    shortLabel: '科研',
    shortLabelEn: 'Sci',
    title: '科研产出 · 专业科研与信息业',
    titleEn: 'Science Yield · Scientific & Info',
    sourceTag: 'ACS 2025 1-Yr · C24030',
    sourceTagEn: 'ACS 2025 1-Yr · C24030',
    accent: 'var(--y-science)',
    barColor: '#4fa3e0',
  },
  culture: {
    id: 'culture',
    icon: '🎭',
    shortLabel: '文化',
    shortLabelEn: 'Cul',
    title: '文化产出 · 文化艺术与娱乐业',
    titleEn: 'Culture Yield · Arts & Recreation',
    sourceTag: 'ACS 2025 1-Yr · C24030',
    sourceTagEn: 'ACS 2025 1-Yr · C24030',
    accent: 'var(--y-culture)',
    barColor: '#b07ce0',
  },
  unemployment: {
    id: 'unemployment',
    icon: '💼',
    shortLabel: '失业率',
    shortLabelEn: 'Unemp',
    title: '全美平民失业率',
    titleEn: 'Civilian Labor Force Unemployment',
    sourceTag: 'ACS 2025 1-Yr · B23025',
    sourceTagEn: 'ACS 2025 1-Yr · B23025',
    accent: 'var(--brass-bright)',
    barColor: '#e0824a',
  },
};

const REGION_STYLE: Record<string, { label: string; labelEn: string; color: string }> = {
  South: { label: '南部 South', labelEn: 'South', color: '#d98a3b' },
  West: { label: '西部 West', labelEn: 'West', color: '#4fa3e0' },
  Midwest: { label: '中西部 Midwest', labelEn: 'Midwest', color: '#7fbf3f' },
  Northeast: { label: '东北部 Northeast', labelEn: 'Northeast', color: '#b07ce0' },
};

const GDP_SECTOR_COLORS = ['#f2c94c', '#5eb2f5', '#eb9348', '#8c9fe8', '#58c998', '#7f8d9c'];

interface KpiItem {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

interface MetricContent {
  heroValue: string;
  heroUnit: string;
  definition: string;
  kpis: KpiItem[];
  breakdownTitle: string;
  segments: SegmentItem[];
  breakdownNote: string | null;
  levelLabels: [string, string];
  modeLabels: [string, string];
  rankHint: string;
  rows: RankRow[];
  advisorId: string;
  advisorLabel: string;
  lensId: string | null;
  lensLabel?: string;
  secondaryAdvisorId?: string | null;
  secondaryAdvisorLabel?: string;
  showLedgerBtn?: boolean;
}

interface SegmentItem {
  key: string;
  label: string;
  value: number;
  valueText: string;
  subText?: string;
  color: string;
  hexIds?: number[];
}

interface RankRow {
  id: string;
  kind: 'state' | 'city';
  label: string;
  sublabel?: string;
  detail?: string;
  value: number;
  valueText: string;
  tone?: 'good' | 'bad';
  barColor?: string;
  hexIds: number[];
}

export const TopMetricPopover: React.FC<TopMetricPopoverProps> = ({
  metric,
  anchorCenterX,
  meta,
  cities,
  states,
  stateHexMap,
  onClose,
  onSelectMetric,
}) => {
  const { locale, isEn, L } = useL();
  const {
    theme,
    openCity,
    openState,
    openAdvisor,
    setLens,
    setBrushed,
    setAlmanacOpen,
    setYieldReportOpen,
  } = useAppStore();

  const [rankLevel, setRankLevel] = useState<'states' | 'metros'>('states');
  const [rankMode, setRankMode] = useState<'primary' | 'secondary'>('primary');
  const [viewportW, setViewportW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const didBrushRef = useRef(false);

  // Reset secondary mode when switching between metrics
  useEffect(() => {
    setRankMode('primary');
  }, [metric]);

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Clear map brush when closing popover if we set it
  useEffect(() => {
    return () => {
      if (didBrushRef.current) {
        didBrushRef.current = false;
        useAppStore.getState().setBrushed(null, null);
      }
    };
  }, []);

  // ArrowLeft / ArrowRight quick step between metrics
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const idx = TOP_METRIC_ORDER.indexOf(metric);
        const nextIdx = (idx + (e.key === 'ArrowRight' ? 1 : TOP_METRIC_ORDER.length - 1)) % TOP_METRIC_ORDER.length;
        onSelectMetric(TOP_METRIC_ORDER[nextIdx]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [metric, onSelectMetric]);

  const brushHexes = (hexIds: number[] | null, label?: string) => {
    if (!hexIds || hexIds.length === 0) {
      if (didBrushRef.current) {
        didBrushRef.current = false;
        setBrushed(null, null);
      }
      return;
    }
    didBrushRef.current = true;
    setBrushed(new Set(hexIds), label ?? null);
  };

  const n = meta.nation;
  const jobs = n.jobs ?? {};
  const usEmp = n.employed || 167279529;
  const usUnemp = n.unemployment ?? 0.0488;
  const foodW = n.real_yields?.food ?? jobs.agriculture ?? 1728726;
  const prodW = (n.real_yields?.production ?? ((jobs.manufacturing ?? 0) + (jobs.construction ?? 0) + (jobs.mining ?? 0))) || 27878245;
  const sciW = (n.real_yields?.science ?? ((jobs.professional ?? 0) + (jobs.information ?? 0))) || 17255272;
  const culW = n.real_yields?.culture ?? jobs.arts ?? 3791558;

  const gdpByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of n.gdp_by_industry ?? []) m.set(item.key, item.musd);
    return m;
  }, [n.gdp_by_industry]);

  const totals = useMemo(() => {
    const citiesPop = cities.reduce((s, c) => s + c.pop, 0);
    const citiesGdp = cities.reduce((s, c) => s + (c.gdp_musd ?? 0), 0);
    const validUnempStates = states.filter((s) => s.unemployment != null);
    const sortedU = [...validUnempStates].sort((a, b) => (a.unemployment ?? 0) - (b.unemployment ?? 0));
    return {
      citiesPop,
      citiesGdp,
      minStateU: sortedU[0] ?? null,
      maxStateU: sortedU[sortedU.length - 1] ?? null,
    };
  }, [cities, states]);

  const regionHexes = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of states) {
      const r = s.region_name;
      let arr = m.get(r);
      if (!arr) {
        arr = [];
        m.set(r, arr);
      }
      for (const h of stateHexMap.get(s.fips) ?? []) arr.push(h);
    }
    return m;
  }, [states, stateHexMap]);

  const goodCol = theme === 'midnight' ? '#58c998' : '#1f7a53';
  const badCol = theme === 'midnight' ? '#f07668' : '#b83b32';

  // Compute metric-specific card content
  const content = useMemo<MetricContent>(() => {
    const buildRegionSegments = (
      getter: (s: StateRecord) => number,
      formatter: (v: number) => string,
    ): SegmentItem[] => {
      const sums = new Map<string, number>();
      for (const s of states) {
        const r = s.region_name;
        sums.set(r, (sums.get(r) ?? 0) + getter(s));
      }
      const total = [...sums.values()].reduce((a, b) => a + b, 0) || 1;
      return [...sums.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([reg, val]) => ({
          key: reg,
          label: isEn ? (REGION_STYLE[reg]?.labelEn ?? reg) : (REGION_STYLE[reg]?.label ?? reg),
          value: val,
          valueText: formatter(val),
          subText: `${((val / total) * 100).toFixed(1)}%`,
          color: REGION_STYLE[reg]?.color ?? '#8b99a8',
          hexIds: regionHexes.get(reg) ?? [],
        }));
    };

    if (metric === 'population') {
      const metroShare = (totals.citiesPop / n.population) * 100;
      const empRatio = (usEmp / n.population) * 100;
      const kpis = [
        { label: L('2021–25 增速', '2021–25 Growth'), value: fmtSignedPct(n.growth ?? 0.0292, 2), sub: L('Census PEP 估算', 'Census PEP est.'), color: goodCol },
        { label: L('16岁+ 就业人口', 'Employed (16+)'), value: fmtCount3(usEmp), sub: L(`占总人口 ${empRatio.toFixed(1)}%`, `${empRatio.toFixed(1)}% of total pop`) },
        { label: L('都会区集中度', 'Metro Share'), value: `${metroShare.toFixed(1)}%`, sub: L(`${cities.length} 城 · ${n.total_counties.toLocaleString()} 县`, `${cities.length} metros · ${n.total_counties.toLocaleString()} counties`) },
      ];
      const segments = buildRegionSegments((s) => s.pop, (v) => fmtCount3(v));

      let rows: RankRow[] = [];
      let rankHint = '';
      if (rankLevel === 'states') {
        if (rankMode === 'primary') {
          rows = [...states]
            .sort((a, b) => b.pop - a.pop)
            .slice(0, 8)
            .map((s) => ({
              id: s.fips,
              kind: 'state',
              label: s.name,
              sublabel: s.abbr,
              detail: L(`占全美 ${((s.pop / n.population) * 100).toFixed(1)}%`, `${((s.pop / n.population) * 100).toFixed(1)}% of U.S.`),
              value: s.pop,
              valueText: fmtCount3(s.pop),
              hexIds: stateHexMap.get(s.fips) ?? [],
            }));
        } else {
          rows = [...states]
            .filter((s) => s.pop_growth_pct != null)
            .sort((a, b) => (b.pop_growth_pct ?? -9) - (a.pop_growth_pct ?? -9))
            .slice(0, 8)
            .map((s) => ({
              id: s.fips,
              kind: 'state',
              label: s.name,
              sublabel: s.abbr,
              detail: fmtCount3(s.pop),
              value: Math.max(0, s.pop_growth_pct ?? 0),
              valueText: fmtSignedPct(s.pop_growth_pct, 1),
              tone: (s.pop_growth_pct ?? 0) >= 0 ? 'good' : 'bad',
              barColor: goodCol,
              hexIds: stateHexMap.get(s.fips) ?? [],
            }));
        }
      } else {
        if (rankMode === 'primary') {
          rows = [...cities]
            .sort((a, b) => b.pop - a.pop)
            .slice(0, 8)
            .map((c) => ({
              id: c.id,
              kind: 'city',
              label: c.short_name,
              sublabel: c.state_abbr,
              detail: L(`占全美 ${((c.pop / n.population) * 100).toFixed(1)}%`, `${((c.pop / n.population) * 100).toFixed(1)}% of U.S.`),
              value: c.pop,
              valueText: fmtCount3(c.pop),
              hexIds: c.hex_ids,
            }));
        } else {
          rankHint = L('仅计 25 万+ 人口都会区（PEP 2021–2025 净增长率）', 'Metros with 250K+ population only (PEP 2021–2025 net growth)');
          rows = [...cities]
            .filter((c) => c.pop >= 250000 && c.pop_growth_pct != null)
            .sort((a, b) => (b.pop_growth_pct ?? -9) - (a.pop_growth_pct ?? -9))
            .slice(0, 8)
            .map((c) => ({
              id: c.id,
              kind: 'city',
              label: c.short_name,
              sublabel: c.state_abbr,
              detail: fmtCount3(c.pop),
              value: Math.max(0, c.pop_growth_pct ?? 0),
              valueText: fmtSignedPct(c.pop_growth_pct, 1),
              tone: (c.pop_growth_pct ?? 0) >= 0 ? 'good' : 'bad',
              barColor: goodCol,
              hexIds: c.hex_ids,
            }));
        }
      }

      return {
        heroValue: n.population.toLocaleString('en-US'),
        heroUnit: L('人（50 州 + 华盛顿特区）', 'residents (50 states + DC)'),
        definition: L(
          '美国人口普查局 ACS 2025 1-Yr 统计的全美常住总人口；各州加总与全美口径完全一致。',
          'Total U.S. resident population from Census ACS 2025 1-Year estimates; state totals reconcile cleanly to the national figure.',
        ),
        kpis,
        breakdownTitle: L('四大普查区人口分布（悬停高亮地图）', 'Population by Census Region (hover to highlight map)'),
        segments,
        breakdownNote: null as string | null,
        levelLabels: [L('各州 (51)', 'States (51)'), L('都会区', 'Metros')] as [string, string],
        modeLabels: [L('总人口', 'Total Pop'), L('21–25 增速', '21–25 Growth')] as [string, string],
        rankHint,
        rows,
        advisorId: 'people',
        advisorLabel: L('人口与迁徙顾问', 'People Advisor'),
        lensId: 'density',
        lensLabel: L('密度视角', 'Density Lens'),
      };
    }

    if (metric === 'food') {
      const share = (foodW / usEmp) * 100;
      const agriGdp = gdpByKey.get('agriculture') ?? 269686;
      const crop = n.land_national?.crop ?? 0.167;
      const pasture = n.land_national?.pasture ?? 0.064;
      const kpis = [
        { label: L('占全美总就业', 'Share of Jobs'), value: `${share.toFixed(2)}%`, sub: L(`约每 ${Math.round(usEmp / foodW)} 人 1 名`, `~1 in ${Math.round(usEmp / foodW)} workers`), color: 'var(--y-food)' },
        { label: L('农林渔牧 GDP', 'Agri & Forestry GDP'), value: fmtMoney3(agriGdp * 1e6), sub: L(`占全美 GDP ${((agriGdp / n.gdp_musd) * 100).toFixed(2)}%`, `${((agriGdp / n.gdp_musd) * 100).toFixed(2)}% of U.S. GDP`) },
        { label: L('耕地与牧草', 'Crops & Pasture'), value: `${((crop + pasture) * 100).toFixed(1)}%`, sub: L(`耕地 ${(crop * 100).toFixed(1)}% · 牧草 ${(pasture * 100).toFixed(1)}%`, `Crop ${(crop * 100).toFixed(1)}% · Pasture ${(pasture * 100).toFixed(1)}%`) },
      ];
      const segments = buildRegionSegments((s) => s.yields_workers?.food ?? 0, (v) => fmtCount3(v));

      let rows: RankRow[] = [];
      let rankHint = '';
      if (rankLevel === 'states') {
        const valid = states.filter((s) => (s.yields_workers?.food ?? 0) > 0 && (s.employed ?? 0) > 0);
        if (rankMode === 'primary') {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers?.food ?? 0) - (a.yields_workers?.food ?? 0))
            .slice(0, 8)
            .map((s) => {
              const w = s.yields_workers!.food!;
              return {
                id: s.fips,
                kind: 'state',
                label: s.name,
                sublabel: s.abbr,
                detail: L(`占比 ${((w / s.employed!) * 100).toFixed(1)}%`, `${((w / s.employed!) * 100).toFixed(1)}% share`),
                value: w,
                valueText: fmtCount3(w),
                hexIds: stateHexMap.get(s.fips) ?? [],
              };
            });
        } else {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers!.food! / b.employed!) - (a.yields_workers!.food! / a.employed!))
            .slice(0, 8)
            .map((s) => {
              const w = s.yields_workers!.food!;
              const sh = w / s.employed!;
              return {
                id: s.fips,
                kind: 'state',
                label: s.name,
                sublabel: s.abbr,
                detail: L(`${fmtCount3(w)} 人`, `${fmtCount3(w)} workers`),
                value: sh,
                valueText: `${(sh * 100).toFixed(1)}%`,
                hexIds: stateHexMap.get(s.fips) ?? [],
              };
            });
        }
      } else {
        const valid = cities.filter((c) => (c.yields_workers?.food ?? 0) > 0 && (c.employed ?? 0) > 0 && (rankMode === 'primary' || c.pop >= 100000));
        if (rankMode === 'secondary') rankHint = L('就业占比排行仅计 10 万+ 人口都会区（过滤极小样本波动）', 'Job-share ranking includes metros with 100K+ population only');
        if (rankMode === 'primary') {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers?.food ?? 0) - (a.yields_workers?.food ?? 0))
            .slice(0, 8)
            .map((c) => {
              const w = c.yields_workers!.food;
              return {
                id: c.id,
                kind: 'city',
                label: c.short_name,
                sublabel: c.state_abbr,
                detail: L(`占比 ${((w / c.employed!) * 100).toFixed(1)}%`, `${((w / c.employed!) * 100).toFixed(1)}% share`),
                value: w,
                valueText: fmtCount3(w),
                hexIds: c.hex_ids,
              };
            });
        } else {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers!.food / b.employed!) - (a.yields_workers!.food / a.employed!))
            .slice(0, 8)
            .map((c) => {
              const w = c.yields_workers!.food;
              const sh = w / c.employed!;
              return {
                id: c.id,
                kind: 'city',
                label: c.short_name,
                sublabel: c.state_abbr,
                detail: L(`${fmtCount3(w)} 人`, `${fmtCount3(w)} workers`),
                value: sh,
                valueText: `${(sh * 100).toFixed(1)}%`,
                hexIds: c.hex_ids,
              };
            });
        }
      }

      return {
        heroValue: foodW.toLocaleString('en-US'),
        heroUnit: L('名农林渔牧从业者', 'agriculture, forestry & fishing workers'),
        definition: L(
          '农、林、渔、牧与狩猎业（ACS C24030 · NAICS 11）按居住地统计的从业人数，对应沙盘中的国家「粮食」产出。',
          'Employed residents in Agriculture, Forestry, Fishing & Hunting (ACS C24030 · NAICS 11) by place of residence — mapped to the national Food yield.',
        ),
        kpis,
        breakdownTitle: L('四大普查区农林渔牧从业分布（悬停高亮地图）', 'Agri & Forestry Workers by Region (hover to highlight)'),
        segments,
        breakdownNote: L('注：陆地耕地与牧草覆盖率源自 USGS NLCD 2021 美国本土口径。', 'Note: Cropland and pasture land-cover shares are from USGS NLCD 2021 (Lower 48).'),
        levelLabels: [L('各州 (51)', 'States (51)'), L('都会区', 'Metros')] as [string, string],
        modeLabels: [L('从业人数', 'Workers'), L('就业占比', 'Job Share')] as [string, string],
        rankHint,
        rows,
        advisorId: 'land',
        advisorLabel: L('土地与生态顾问', 'Land Advisor'),
        lensId: 'farmland',
        lensLabel: L('农田视角', 'Farmland Lens'),
      };
    }

    if (metric === 'production') {
      const mfgW = jobs.manufacturing ?? 16064394;
      const conW = jobs.construction ?? 11254981;
      const minW = jobs.mining ?? 558870;
      const mfgGdp = gdpByKey.get('manufacturing') ?? 2880724;
      const conGdp = gdpByKey.get('construction') ?? 1305402;
      const minGdp = gdpByKey.get('mining') ?? 404248;
      const prodGdp = mfgGdp + conGdp + minGdp;

      const kpis = [
        { label: L('占全美总就业', 'Share of Jobs'), value: `${((prodW / usEmp) * 100).toFixed(1)}%`, sub: L(`约每 ${Math.round(usEmp / prodW)} 人 1 名`, `~1 in ${Math.round(usEmp / prodW)} workers`), color: 'var(--y-prod)' },
        { label: L('三行业 GDP 合计', '3-Sector GDP'), value: fmtMoney3(prodGdp * 1e6), sub: L(`占全美 GDP ${((prodGdp / n.gdp_musd) * 100).toFixed(1)}%`, `${((prodGdp / n.gdp_musd) * 100).toFixed(1)}% of U.S. GDP`) },
        { label: L('全美发电总装机', 'Total U.S. Power'), value: fmtMw(n.power_all_mw ?? n.power_mw), sub: L(`入图大型 ${fmtMw(n.power_mw)}`, `Mapped large ${fmtMw(n.power_mw)}`) },
      ];
      const segments: SegmentItem[] = [
        { key: 'manufacturing', label: L('制造业 Manufacturing', 'Manufacturing'), value: mfgW, valueText: fmtCount3(mfgW), subText: `${((mfgW / prodW) * 100).toFixed(1)}% · GDP ${fmtMoney3(mfgGdp * 1e6)}`, color: '#d9823b' },
        { key: 'construction', label: L('建筑业 Construction', 'Construction'), value: conW, valueText: fmtCount3(conW), subText: `${((conW / prodW) * 100).toFixed(1)}% · GDP ${fmtMoney3(conGdp * 1e6)}`, color: '#e6b45a' },
        { key: 'mining', label: L('采矿与油气 Mining', 'Mining & Oil/Gas'), value: minW, valueText: fmtCount3(minW), subText: `${((minW / prodW) * 100).toFixed(1)}% · GDP ${fmtMoney3(minGdp * 1e6)}`, color: '#9c7c65' },
      ];

      let rows: RankRow[] = [];
      let rankHint = '';
      if (rankLevel === 'states') {
        const valid = states.filter((s) => (s.yields_workers?.production ?? 0) > 0 && (s.employed ?? 0) > 0);
        if (rankMode === 'primary') {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers?.production ?? 0) - (a.yields_workers?.production ?? 0))
            .slice(0, 8)
            .map((s) => {
              const w = s.yields_workers!.production!;
              return {
                id: s.fips,
                kind: 'state',
                label: s.name,
                sublabel: s.abbr,
                detail: L(`占比 ${((w / s.employed!) * 100).toFixed(1)}%`, `${((w / s.employed!) * 100).toFixed(1)}% share`),
                value: w,
                valueText: fmtCount3(w),
                hexIds: stateHexMap.get(s.fips) ?? [],
              };
            });
        } else {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers!.production! / b.employed!) - (a.yields_workers!.production! / a.employed!))
            .slice(0, 8)
            .map((s) => {
              const w = s.yields_workers!.production!;
              const sh = w / s.employed!;
              return {
                id: s.fips,
                kind: 'state',
                label: s.name,
                sublabel: s.abbr,
                detail: L(`${fmtCount3(w)} 人`, `${fmtCount3(w)} workers`),
                value: sh,
                valueText: `${(sh * 100).toFixed(1)}%`,
                hexIds: stateHexMap.get(s.fips) ?? [],
              };
            });
        }
      } else {
        const valid = cities.filter((c) => (c.yields_workers?.production ?? 0) > 0 && (c.employed ?? 0) > 0 && (rankMode === 'primary' || c.pop >= 250000));
        if (rankMode === 'secondary') rankHint = L('就业占比排行仅计 25 万+ 人口都会区', 'Job-share ranking includes metros with 250K+ population only');
        if (rankMode === 'primary') {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers?.production ?? 0) - (a.yields_workers?.production ?? 0))
            .slice(0, 8)
            .map((c) => {
              const w = c.yields_workers!.production;
              return {
                id: c.id,
                kind: 'city',
                label: c.short_name,
                sublabel: c.state_abbr,
                detail: L(`占比 ${((w / c.employed!) * 100).toFixed(1)}%`, `${((w / c.employed!) * 100).toFixed(1)}% share`),
                value: w,
                valueText: fmtCount3(w),
                hexIds: c.hex_ids,
              };
            });
        } else {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers!.production / b.employed!) - (a.yields_workers!.production / a.employed!))
            .slice(0, 8)
            .map((c) => {
              const w = c.yields_workers!.production;
              const sh = w / c.employed!;
              return {
                id: c.id,
                kind: 'city',
                label: c.short_name,
                sublabel: c.state_abbr,
                detail: L(`${fmtCount3(w)} 人`, `${fmtCount3(w)} workers`),
                value: sh,
                valueText: `${(sh * 100).toFixed(1)}%`,
                hexIds: c.hex_ids,
              };
            });
        }
      }

      return {
        heroValue: prodW.toLocaleString('en-US'),
        heroUnit: L('名实体生产从业者', 'goods-producing workers'),
        definition: L(
          '实体建造与工业产出三大核心行业之和：制造业 + 建筑业 + 采矿与油气业（ACS C24030 居住地就业口径）。',
          'Combined workers across the three physical goods-producing sectors: Manufacturing + Construction + Mining & Oil/Gas (ACS C24030 by residence).',
        ),
        kpis,
        breakdownTitle: L('生产力三行业构成拆解（就业人数与 BEA 增加值）', '3-Sector Production Breakdown (Workers & BEA Value-Added)'),
        segments,
        breakdownNote: null as string | null,
        levelLabels: [L('各州 (51)', 'States (51)'), L('都会区', 'Metros')] as [string, string],
        modeLabels: [L('从业人数', 'Workers'), L('就业占比', 'Job Share')] as [string, string],
        rankHint,
        rows,
        advisorId: 'economy',
        advisorLabel: L('宏观经济顾问', 'Economy Advisor'),
        lensId: null as string | null,
        secondaryAdvisorId: 'energy' as string | null,
        secondaryAdvisorLabel: L('能源与矿产', 'Energy & Mines'),
      };
    }

    if (metric === 'gold') {
      const kpis = [
        { label: L('全美人均 GDP', 'U.S. GDP / Capita'), value: `$${n.gdp_per_cap.toLocaleString('en-US')}`, sub: L('2024 GDP ÷ 2025 人口', '2024 GDP ÷ 2025 Pop'), color: 'var(--y-gold)' },
        { label: L('家庭中位收入', 'Median Income'), value: `$${n.median_income.toLocaleString('en-US')}`, sub: 'ACS 2025 1-Yr' },
        { label: L('都会区贡献', 'Metro Share'), value: `${((totals.citiesGdp / n.gdp_musd) * 100).toFixed(1)}%`, sub: L(`${cities.length} 城合计 ${fmtMoney3(totals.citiesGdp * 1e6)}`, `${cities.length} metros · ${fmtMoney3(totals.citiesGdp * 1e6)}`) },
      ];
      const sectors = n.gdp_by_industry ?? [];
      const top5 = sectors.slice(0, 5);
      const restMusd = sectors.slice(5).reduce((s, x) => s + x.musd, 0);
      const segments: SegmentItem[] = [
        ...top5.map((sec, i) => ({
          key: sec.key,
          label: localizeIndustry(sec.key, sec.name, locale),
          value: sec.musd,
          valueText: fmtMoney3(sec.musd * 1e6),
          subText: `${((sec.musd / n.gdp_musd) * 100).toFixed(1)}%`,
          color: GDP_SECTOR_COLORS[i] ?? '#d4ae5e',
        })),
        ...(restMusd > 0
          ? [{
              key: 'other_15',
              label: L(`其余 ${Math.max(0, sectors.length - 5)} 个行业`, `Other ${Math.max(0, sectors.length - 5)} industries`),
              value: restMusd,
              valueText: fmtMoney3(restMusd * 1e6),
              subText: `${((restMusd / n.gdp_musd) * 100).toFixed(1)}%`,
              color: GDP_SECTOR_COLORS[5],
            }]
          : []),
      ];

      let rows: RankRow[] = [];
      let rankHint = '';
      if (rankLevel === 'states') {
        if (rankMode === 'primary') {
          rows = [...states]
            .sort((a, b) => b.gdp_musd - a.gdp_musd)
            .slice(0, 8)
            .map((s) => ({
              id: s.fips,
              kind: 'state',
              label: s.name,
              sublabel: s.abbr,
              detail: L(`占全美 ${((s.gdp_musd / n.gdp_musd) * 100).toFixed(1)}%`, `${((s.gdp_musd / n.gdp_musd) * 100).toFixed(1)}% of U.S.`),
              value: s.gdp_musd,
              valueText: fmtMoney3(s.gdp_musd * 1e6),
              hexIds: stateHexMap.get(s.fips) ?? [],
            }));
        } else {
          rows = [...states]
            .sort((a, b) => b.gdp_per_cap - a.gdp_per_cap)
            .slice(0, 8)
            .map((s) => ({
              id: s.fips,
              kind: 'state',
              label: s.name,
              sublabel: s.abbr,
              detail: fmtMoney3(s.gdp_musd * 1e6),
              value: s.gdp_per_cap,
              valueText: `$${s.gdp_per_cap.toLocaleString('en-US')}`,
              hexIds: stateHexMap.get(s.fips) ?? [],
            }));
        }
      } else {
        if (rankMode === 'primary') {
          rows = [...cities]
            .filter((c) => (c.gdp_musd ?? 0) > 0)
            .sort((a, b) => (b.gdp_musd ?? 0) - (a.gdp_musd ?? 0))
            .slice(0, 8)
            .map((c) => ({
              id: c.id,
              kind: 'city',
              label: c.short_name,
              sublabel: c.state_abbr,
              detail: L(`人均 ${fmtMoney3(c.gdp_per_cap)}`, `${fmtMoney3(c.gdp_per_cap)}/cap`),
              value: c.gdp_musd ?? 0,
              valueText: fmtMoney3((c.gdp_musd ?? 0) * 1e6),
              hexIds: c.hex_ids,
            }));
        } else {
          rankHint = L('人均 GDP 排行仅计 25 万+ 人口都会区（避免单一油气/矿区极值）', 'GDP per capita ranking includes 250K+ metros only (avoids tiny resource-enclave outliers)');
          rows = [...cities]
            .filter((c) => c.pop >= 250000 && (c.gdp_per_cap ?? 0) > 0)
            .sort((a, b) => (b.gdp_per_cap ?? 0) - (a.gdp_per_cap ?? 0))
            .slice(0, 8)
            .map((c) => ({
              id: c.id,
              kind: 'city',
              label: c.short_name,
              sublabel: c.state_abbr,
              detail: fmtMoney3((c.gdp_musd ?? 0) * 1e6),
              value: c.gdp_per_cap ?? 0,
              valueText: `$${(c.gdp_per_cap ?? 0).toLocaleString('en-US')}`,
              hexIds: c.hex_ids,
            }));
        }
      }

      return {
        heroValue: `$${(n.gdp_musd / 1e6).toFixed(2)}T`,
        heroUnit: L(`($${Math.round(n.gdp_musd).toLocaleString('en-US')}M 现价美元)`, `($${Math.round(n.gdp_musd).toLocaleString('en-US')}M current USD)`),
        definition: L(
          '美国经济分析局 BEA CAGDP2 公布的 2024 年现价国内生产总值，按经济活动发生地统计；沙盘中每 +1 金币对应 $10 亿 GDP。',
          '2024 current-dollar GDP from BEA CAGDP2 by place of production; each +1 Gold on the strategy map equals $1B of annual GDP.',
        ),
        kpis,
        breakdownTitle: L('全美 GDP 前五大支柱行业（BEA 20 行业全量口径）', 'Top 5 GDP Industries (BEA All 20 Sectors)'),
        segments,
        breakdownNote: L(
          '注：50 州 + DC 合计 $29.14T，与全美 $29.30T 的微小差额为联邦海外军事与未分摊产出。',
          'Note: The 50 states + DC sum to $29.14T; the slight gap vs. $29.30T reflects federal overseas military and unallocated output.',
        ),
        levelLabels: [L('各州 (51)', 'States (51)'), L('都会区', 'Metros')] as [string, string],
        modeLabels: [L('GDP 总量', 'Total GDP'), L('人均 GDP', 'GDP / Cap')] as [string, string],
        rankHint,
        rows,
        advisorId: 'economy',
        advisorLabel: L('宏观经济顾问', 'Economy Advisor'),
        lensId: 'income',
        lensLabel: L('收入视角', 'Income Lens'),
        showLedgerBtn: true,
      };
    }

    if (metric === 'science') {
      const profW = jobs.professional ?? 14326698;
      const infoW = jobs.information ?? 2928574;
      const profGdp = gdpByKey.get('professional') ?? 2355069;
      const infoGdp = gdpByKey.get('information') ?? 1592692;
      const sciGdp = profGdp + infoGdp;

      const kpis = [
        { label: L('占全美总就业', 'Share of Jobs'), value: `${((sciW / usEmp) * 100).toFixed(1)}%`, sub: L(`两行业 GDP ${fmtMoney3(sciGdp * 1e6)}`, `2-sector GDP ${fmtMoney3(sciGdp * 1e6)}`), color: 'var(--y-science)' },
        { label: L('本科及以上学历', 'Bachelor’s+'), value: `${(n.bachelors_pct * 100).toFixed(1)}%`, sub: L('25岁+ 成人 · ACS', 'Adults 25+ · ACS') },
        { label: L('STEM 职业密度', 'STEM Density'), value: `1 / ${n.stem_one_in}`, sub: L(`占在职者 ${(n.stem_share * 100).toFixed(1)}%`, `${(n.stem_share * 100).toFixed(1)}% of workers`) },
      ];
      const segments: SegmentItem[] = [
        { key: 'professional', label: L('专业、科研与技术服务', 'Professional & Scientific Services'), value: profW, valueText: fmtCount3(profW), subText: `${((profW / sciW) * 100).toFixed(1)}% · GDP ${fmtMoney3(profGdp * 1e6)}`, color: '#4fa3e0' },
        { key: 'information', label: L('信息与软件业', 'Information & Software'), value: infoW, valueText: fmtCount3(infoW), subText: `${((infoW / sciW) * 100).toFixed(1)}% · GDP ${fmtMoney3(infoGdp * 1e6)}`, color: '#8ac5f4' },
      ];

      let rows: RankRow[] = [];
      let rankHint = '';
      if (rankLevel === 'states') {
        const valid = states.filter((s) => (s.yields_workers?.science ?? 0) > 0 && (s.employed ?? 0) > 0);
        if (rankMode === 'primary') {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers?.science ?? 0) - (a.yields_workers?.science ?? 0))
            .slice(0, 8)
            .map((s) => {
              const w = s.yields_workers!.science!;
              return {
                id: s.fips,
                kind: 'state',
                label: s.name,
                sublabel: s.abbr,
                detail: L(`占比 ${((w / s.employed!) * 100).toFixed(1)}%`, `${((w / s.employed!) * 100).toFixed(1)}% share`),
                value: w,
                valueText: fmtCount3(w),
                hexIds: stateHexMap.get(s.fips) ?? [],
              };
            });
        } else {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers!.science! / b.employed!) - (a.yields_workers!.science! / a.employed!))
            .slice(0, 8)
            .map((s) => {
              const w = s.yields_workers!.science!;
              const sh = w / s.employed!;
              return {
                id: s.fips,
                kind: 'state',
                label: s.name,
                sublabel: s.abbr,
                detail: L(`${fmtCount3(w)} 人`, `${fmtCount3(w)} workers`),
                value: sh,
                valueText: `${(sh * 100).toFixed(1)}%`,
                hexIds: stateHexMap.get(s.fips) ?? [],
              };
            });
        }
      } else {
        const valid = cities.filter((c) => (c.yields_workers?.science ?? 0) > 0 && (c.employed ?? 0) > 0 && (rankMode === 'primary' || c.pop >= 250000));
        if (rankMode === 'secondary') rankHint = L('就业占比排行仅计 25 万+ 人口都会区', 'Job-share ranking includes metros with 250K+ population only');
        if (rankMode === 'primary') {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers?.science ?? 0) - (a.yields_workers?.science ?? 0))
            .slice(0, 8)
            .map((c) => {
              const w = c.yields_workers!.science;
              return {
                id: c.id,
                kind: 'city',
                label: c.short_name,
                sublabel: c.state_abbr,
                detail: L(`占比 ${((w / c.employed!) * 100).toFixed(1)}%`, `${((w / c.employed!) * 100).toFixed(1)}% share`),
                value: w,
                valueText: fmtCount3(w),
                hexIds: c.hex_ids,
              };
            });
        } else {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers!.science / b.employed!) - (a.yields_workers!.science / a.employed!))
            .slice(0, 8)
            .map((c) => {
              const w = c.yields_workers!.science;
              const sh = w / c.employed!;
              return {
                id: c.id,
                kind: 'city',
                label: c.short_name,
                sublabel: c.state_abbr,
                detail: L(`${fmtCount3(w)} 人`, `${fmtCount3(w)} workers`),
                value: sh,
                valueText: `${(sh * 100).toFixed(1)}%`,
                hexIds: c.hex_ids,
              };
            });
        }
      }

      return {
        heroValue: sciW.toLocaleString('en-US'),
        heroUnit: L('名科研与信息从业者', 'scientific & information workers'),
        definition: L(
          '专业、科研与技术服务业（NAICS 54）及信息与软件业（NAICS 51）从业人数之和，按劳动者居住地统计。',
          'Combined employed residents in Professional, Scientific & Technical Services (NAICS 54) and Information (NAICS 51) by residence.',
        ),
        kpis,
        breakdownTitle: L('科研产出双行业构成拆解（就业人数与 BEA 增加值）', '2-Sector Science Breakdown (Workers & BEA Value-Added)'),
        segments,
        breakdownNote: L(
          '注：按行业而非职业统计，因此科技公司行政人员计入其中，医院内的临床研究员则计入医疗业。',
          'Note: Counted by industry rather than occupation, so admin staff at tech firms are included while hospital clinical researchers count under Health Care.',
        ),
        levelLabels: [L('各州 (51)', 'States (51)'), L('都会区', 'Metros')] as [string, string],
        modeLabels: [L('从业人数', 'Workers'), L('就业占比', 'Job Share')] as [string, string],
        rankHint,
        rows,
        advisorId: 'knowledge',
        advisorLabel: L('科研与知识顾问', 'Knowledge Advisor'),
        lensId: 'bachelors',
        lensLabel: L('学历视角', 'Degrees Lens'),
      };
    }

    if (metric === 'culture') {
      const artsGdp = gdpByKey.get('arts') ?? 326765;
      const accW = jobs.accommodation ?? 11019944;
      const accGdp = gdpByKey.get('accommodation') ?? 960356;
      const kpis = [
        { label: L('占全美总就业', 'Share of Jobs'), value: `${((culW / usEmp) * 100).toFixed(2)}%`, sub: L(`约每 ${Math.round(usEmp / culW)} 人 1 名`, `~1 in ${Math.round(usEmp / culW)} workers`), color: 'var(--y-culture)' },
        { label: L('文化艺术 GDP', 'Arts & Rec GDP'), value: fmtMoney3(artsGdp * 1e6), sub: L(`占全美 GDP ${((artsGdp / n.gdp_musd) * 100).toFixed(2)}%`, `${((artsGdp / n.gdp_musd) * 100).toFixed(2)}% of U.S. GDP`) },
        { label: L('国家公园年游客', 'NPS Park Visits'), value: fmtCount3(n.park_visits ?? 323014305), sub: L(`${n.total_wonders} 处公开规则奇观`, `${n.total_wonders} published-rule wonders`) },
      ];
      const segments = buildRegionSegments((s) => s.yields_workers?.culture ?? 0, (v) => fmtCount3(v));

      let rows: RankRow[] = [];
      let rankHint = '';
      if (rankLevel === 'states') {
        const valid = states.filter((s) => (s.yields_workers?.culture ?? 0) > 0 && (s.employed ?? 0) > 0);
        if (rankMode === 'primary') {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers?.culture ?? 0) - (a.yields_workers?.culture ?? 0))
            .slice(0, 8)
            .map((s) => {
              const w = s.yields_workers!.culture!;
              return {
                id: s.fips,
                kind: 'state',
                label: s.name,
                sublabel: s.abbr,
                detail: L(`占比 ${((w / s.employed!) * 100).toFixed(1)}%`, `${((w / s.employed!) * 100).toFixed(1)}% share`),
                value: w,
                valueText: fmtCount3(w),
                hexIds: stateHexMap.get(s.fips) ?? [],
              };
            });
        } else {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers!.culture! / b.employed!) - (a.yields_workers!.culture! / a.employed!))
            .slice(0, 8)
            .map((s) => {
              const w = s.yields_workers!.culture!;
              const sh = w / s.employed!;
              return {
                id: s.fips,
                kind: 'state',
                label: s.name,
                sublabel: s.abbr,
                detail: L(`${fmtCount3(w)} 人`, `${fmtCount3(w)} workers`),
                value: sh,
                valueText: `${(sh * 100).toFixed(1)}%`,
                hexIds: stateHexMap.get(s.fips) ?? [],
              };
            });
        }
      } else {
        const valid = cities.filter((c) => (c.yields_workers?.culture ?? 0) > 0 && (c.employed ?? 0) > 0 && (rankMode === 'primary' || c.pop >= 250000));
        if (rankMode === 'secondary') rankHint = L('就业占比排行仅计 25 万+ 人口都会区', 'Job-share ranking includes metros with 250K+ population only');
        if (rankMode === 'primary') {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers?.culture ?? 0) - (a.yields_workers?.culture ?? 0))
            .slice(0, 8)
            .map((c) => {
              const w = c.yields_workers!.culture;
              return {
                id: c.id,
                kind: 'city',
                label: c.short_name,
                sublabel: c.state_abbr,
                detail: L(`占比 ${((w / c.employed!) * 100).toFixed(1)}%`, `${((w / c.employed!) * 100).toFixed(1)}% share`),
                value: w,
                valueText: fmtCount3(w),
                hexIds: c.hex_ids,
              };
            });
        } else {
          rows = [...valid]
            .sort((a, b) => (b.yields_workers!.culture / b.employed!) - (a.yields_workers!.culture / a.employed!))
            .slice(0, 8)
            .map((c) => {
              const w = c.yields_workers!.culture;
              const sh = w / c.employed!;
              return {
                id: c.id,
                kind: 'city',
                label: c.short_name,
                sublabel: c.state_abbr,
                detail: L(`${fmtCount3(w)} 人`, `${fmtCount3(w)} workers`),
                value: sh,
                valueText: `${(sh * 100).toFixed(1)}%`,
                hexIds: c.hex_ids,
              };
            });
        }
      }

      return {
        heroValue: culW.toLocaleString('en-US'),
        heroUnit: L('名文化艺术与娱乐从业者', 'arts, entertainment & recreation workers'),
        definition: L(
          '文化、表演艺术、博物馆、体育与休闲娱乐业（ACS C24030 · NAICS 71）从业人数，对应沙盘中的国家「文化」产出。',
          'Employed residents in Arts, Entertainment & Recreation (ACS C24030 · NAICS 71) — mapped to the national Culture yield.',
        ),
        kpis,
        breakdownTitle: L('四大普查区文化艺术就业分布（悬停高亮地图）', 'Arts & Culture Workers by Region (hover to highlight)'),
        segments,
        breakdownNote: L(
          `注：不含住宿与餐饮服务业（NAICS 72 另计 ${fmtCount3(accW)} 人 · GDP ${fmtMoney3(accGdp * 1e6)}）。`,
          `Note: Excludes Accommodation & Food Services (NAICS 72 separately accounts for ${fmtCount3(accW)} workers · ${fmtMoney3(accGdp * 1e6)} GDP).`,
        ),
        levelLabels: [L('各州 (51)', 'States (51)'), L('都会区', 'Metros')] as [string, string],
        modeLabels: [L('从业人数', 'Workers'), L('就业占比', 'Job Share')] as [string, string],
        rankHint,
        rows,
        advisorId: 'culture',
        advisorLabel: L('文化与奇观顾问', 'Culture Advisor'),
        lensId: 'amenities',
        lensLabel: L('宜居视角', 'Wellbeing Lens'),
      };
    }

    // unemployment
    const lowBucket: StateRecord[] = [];
    const midBucket: StateRecord[] = [];
    const highBucket: StateRecord[] = [];
    for (const s of states) {
      if (s.unemployment == null) continue;
      if (s.unemployment < 0.035) lowBucket.push(s);
      else if (s.unemployment <= 0.05) midBucket.push(s);
      else highBucket.push(s);
    }
    const hexesOf = (list: StateRecord[]) => {
      const out: number[] = [];
      for (const s of list) for (const h of stateHexMap.get(s.fips) ?? []) out.push(h);
      return out;
    };

    const kpis = [
      { label: L('16岁+ 就业人口', 'Employed (16+)'), value: fmtCount3(usEmp), sub: 'ACS 2025 C24030' },
      {
        label: L('各州极值区间', 'State Range'),
        value: totals.minStateU && totals.maxStateU
          ? `${(totals.minStateU.unemployment! * 100).toFixed(1)}%–${(totals.maxStateU.unemployment! * 100).toFixed(1)}%`
          : '–',
        sub: totals.minStateU && totals.maxStateU
          ? L(`最低 ${totals.minStateU.abbr} · 最高 ${totals.maxStateU.abbr}`, `Low ${totals.minStateU.abbr} · High ${totals.maxStateU.abbr}`)
          : '',
      },
      { label: L('全美房租负担', 'U.S. Rent Burden'), value: `${((n.rent_burden ?? 0.2204) * 100).toFixed(1)}%`, sub: L(`月租中位 $${(n.median_rent ?? 1557).toLocaleString()}`, `Median rent $${(n.median_rent ?? 1557).toLocaleString()}/mo`) },
    ];
    const segments: SegmentItem[] = [
      { key: 'u_low', label: L('<3.5% 就业紧俏', '<3.5% Tight Market'), value: lowBucket.length, valueText: L(`${lowBucket.length} 州`, `${lowBucket.length} states`), subText: `${((lowBucket.length / 51) * 100).toFixed(0)}%`, color: '#58c998', hexIds: hexesOf(lowBucket) },
      { key: 'u_mid', label: L('3.5–5.0% 温和区间', '3.5–5.0% Moderate'), value: midBucket.length, valueText: L(`${midBucket.length} 州`, `${midBucket.length} states`), subText: `${((midBucket.length / 51) * 100).toFixed(0)}%`, color: '#d4ae5e', hexIds: hexesOf(midBucket) },
      { key: 'u_high', label: L('>5.0% 高于均值', '>5.0% Above Avg'), value: highBucket.length, valueText: L(`${highBucket.length} 州`, `${highBucket.length} states`), subText: `${((highBucket.length / 51) * 100).toFixed(0)}%`, color: '#e8774a', hexIds: hexesOf(highBucket) },
    ];

    const fmtDelta = (u: number) => {
      const pp = (u - usUnemp) * 100;
      return `${pp >= 0 ? '+' : '−'}${Math.abs(pp).toFixed(1)}pp`;
    };

    let rows: RankRow[] = [];
    let rankHint = '';
    if (rankLevel === 'states') {
      const valid = states.filter((s) => s.unemployment != null);
      const sorted = [...valid].sort((a, b) =>
        rankMode === 'primary' ? a.unemployment! - b.unemployment! : b.unemployment! - a.unemployment!,
      );
      rows = sorted.slice(0, 8).map((s) => ({
        id: s.fips,
        kind: 'state',
        label: s.name,
        sublabel: s.abbr,
        detail: `${fmtDelta(s.unemployment!)} vs ${L('全美', 'U.S.')}`,
        value: s.unemployment!,
        valueText: `${(s.unemployment! * 100).toFixed(1)}%`,
        tone: rankMode === 'primary' ? 'good' : 'bad',
        barColor: rankMode === 'primary' ? goodCol : badCol,
        hexIds: stateHexMap.get(s.fips) ?? [],
      }));
    } else {
      rankHint = L('仅计 50 万+ 人口大型都会区（ACS 2025 1-Yr B23025）', 'Large metros with 500K+ population only (ACS 2025 1-Yr B23025)');
      const valid = cities.filter((c) => c.pop >= 500000 && c.unemployment != null);
      const sorted = [...valid].sort((a, b) =>
        rankMode === 'primary' ? a.unemployment! - b.unemployment! : b.unemployment! - a.unemployment!,
      );
      rows = sorted.slice(0, 8).map((c) => ({
        id: c.id,
        kind: 'city',
        label: c.short_name,
        sublabel: c.state_abbr,
        detail: `${fmtDelta(c.unemployment!)} vs ${L('全美', 'U.S.')}`,
        value: c.unemployment!,
        valueText: `${(c.unemployment! * 100).toFixed(1)}%`,
        tone: rankMode === 'primary' ? 'good' : 'bad',
        barColor: rankMode === 'primary' ? goodCol : badCol,
        hexIds: c.hex_ids,
      }));
    }

    return {
      heroValue: `${(usUnemp * 100).toFixed(2)}%`,
      heroUnit: L('平民劳动力失业率', 'civilian unemployment rate'),
      definition: L(
        '16 岁及以上平民劳动力中正在求职的失业人数占比（失业人数 ÷ 平民劳动力总数，ACS 2025 1-Yr B23025）。',
        'Share of the civilian labor force age 16+ actively seeking work (unemployed ÷ civilian labor force, ACS 2025 1-Yr B23025).',
      ),
      kpis,
      breakdownTitle: L('全美 51 州/特区失业率区间分布（悬停高亮地图）', '51 States/DC by Unemployment Band (hover to highlight)'),
      segments,
      breakdownNote: L(
        '注：ACS 年度调查失业率与劳工统计局（BLS）月度 CPS 口径存在季节与样本统计差异。',
        'Note: Annual ACS survey unemployment rates differ slightly from monthly BLS CPS figures due to seasonal and sampling methodology.',
      ),
      levelLabels: [L('各州 (51)', 'States (51)'), L('大都会 (50万+)', 'Large Metros (500K+)')] as [string, string],
      modeLabels: [L('最低 Top 8', 'Lowest 8'), L('最高 Top 8', 'Highest 8')] as [string, string],
      rankHint,
      rows,
      advisorId: 'prosperity',
      advisorLabel: L('繁荣与住房顾问', 'Prosperity Advisor'),
      lensId: 'poverty',
      lensLabel: L('贫困率视角', 'Poverty Lens'),
    };
  }, [metric, rankLevel, rankMode, n, jobs, usEmp, usUnemp, foodW, prodW, sciW, culW, gdpByKey, totals, states, cities, stateHexMap, regionHexes, goodCol, badCol, locale]);

  const info = METRIC_META[metric];
  const popoverW = Math.min(416, viewportW - 24);
  const rawLeft = anchorCenterX != null ? anchorCenterX - popoverW / 2 : 168;
  const clampedLeft = Math.max(12, Math.min(viewportW - popoverW - 12, rawLeft));
  const caretOffset = anchorCenterX != null
    ? Math.max(18, Math.min(popoverW - 18, anchorCenterX - clampedLeft))
    : 48;

  const segTotal = content.segments.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  const maxRowVal = metric === 'unemployment'
    ? Math.max(0.08, ...content.rows.map((r) => r.value))
    : Math.max(1e-6, ...content.rows.map((r) => Math.abs(r.value)));

  return (
    <div
      role="dialog"
      aria-label={info.title}
      className="atlas-panel-brass fixed top-[50px] z-50 rounded-xl flex flex-col overflow-visible"
      style={{
        left: clampedLeft,
        width: popoverW,
        maxHeight: 'min(80vh, 650px)',
      }}
    >
      {/* Upward Caret pointing to clicked TopBar metric */}
      <div
        className="absolute -top-[6px] w-3 h-3 rotate-45 border-l border-t pointer-events-none"
        style={{
          left: caretOffset - 6,
          background: 'var(--surface-paper)',
          borderColor: 'var(--border-strong)',
        }}
      />

      {/* Colored top accent strip */}
      <div
        className="h-[2.5px] rounded-t-xl shrink-0"
        style={{ background: `linear-gradient(90deg, ${info.barColor}, var(--brass))` }}
      />

      {/* Header */}
      <div className="px-4 pt-3 pb-2.5 border-b border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/70 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm leading-none" style={{ color: info.accent }}>{info.icon}</span>
              <h3 className="font-display text-sm font-bold m-0 truncate" style={{ color: 'var(--ink-primary)' }}>
                {isEn ? info.titleEn : info.title}
              </h3>
            </div>
            <div className="text-[10px] opacity-65 mt-0.5 truncate">
              {!isEn && <>{info.titleEn} · </>}
              <span className="font-mono-num">{isEn ? info.sourceTagEn : info.sourceTag}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--surface-paper-hover)] opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            title={L('关闭 (Esc)', 'Close (Esc)')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Exact Hero Number */}
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <span className="font-mono-num text-2xl font-bold tracking-tight leading-none" style={{ color: info.accent }}>
            {content.heroValue}
          </span>
          <span className="text-[11px] opacity-70">{content.heroUnit}</span>
        </div>

        {/* Compact 7-metric quick switcher strip (handy for stepping through all 7 metrics & narrow viewports) */}
        <div className="mt-2.5 flex items-center gap-1 overflow-x-auto">
          {TOP_METRIC_ORDER.map((id) => {
            const m = METRIC_META[id];
            const active = id === metric;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectMetric(id)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0 border ${
                  active
                    ? 'border-[var(--brass)] bg-[var(--brass-soft)]'
                    : 'border-transparent opacity-60 hover:opacity-100 hover:bg-[var(--surface-paper-hover)]'
                }`}
                style={active ? { color: theme === 'midnight' ? 'var(--brass-bright)' : 'var(--ink-primary)' } : undefined}
                title={L(`切换至 ${m.title}`, `Switch to ${m.titleEn}`)}
              >
                <span className="text-[10px] leading-none" style={{ color: m.accent }}>{m.icon}</span>
                <span>{isEn ? m.shortLabelEn : m.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
        {/* Definition */}
        <div
          className="px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed border-l-2"
          style={{
            background: 'var(--brass-soft)',
            borderColor: info.barColor,
            color: 'var(--ink-secondary)',
          }}
        >
          {content.definition}
        </div>

        {/* 3 KPI Context Cards */}
        <div className="grid grid-cols-3 gap-1.5">
          {content.kpis.map((k) => (
            <div
              key={k.label}
              className="p-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/65"
            >
              <div className="text-[9.5px] opacity-65 truncate">{k.label}</div>
              <div
                className="font-mono-num text-[13px] font-bold mt-0.5 leading-tight"
                style={k.color ? { color: k.color } : undefined}
              >
                {k.value}
              </div>
              {k.sub && <div className="text-[9.5px] opacity-65 mt-0.5 leading-tight truncate" title={k.sub}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Composition / Distribution Breakdown Bar */}
        <div className="space-y-1.5">
          <div className="text-[10.5px] font-bold opacity-80">{content.breakdownTitle}</div>
          <div
            className="flex h-3 rounded-md overflow-hidden border border-[var(--border-hairline)] gap-[1px]"
            style={{ background: 'var(--surface-paper-subtle)' }}
            onMouseLeave={() => brushHexes(null)}
          >
            {content.segments.map((seg) => {
              const pct = (Math.max(0, seg.value) / segTotal) * 100;
              if (pct < 0.4) return null;
              return (
                <div
                  key={seg.key}
                  onMouseEnter={() => {
                    if (seg.hexIds && seg.hexIds.length > 0) brushHexes(seg.hexIds, seg.label);
                  }}
                  title={`${seg.label}: ${seg.valueText}${seg.subText ? ` (${seg.subText})` : ''}`}
                  className={`h-full transition-opacity hover:brightness-115 ${seg.hexIds && seg.hexIds.length > 0 ? 'cursor-pointer' : ''}`}
                  style={{ width: `${pct}%`, background: seg.color }}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-0.5">
            {content.segments.map((seg) => (
              <div
                key={seg.key}
                onMouseEnter={() => {
                  if (seg.hexIds && seg.hexIds.length > 0) brushHexes(seg.hexIds, seg.label);
                }}
                onMouseLeave={() => brushHexes(null)}
                className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-[10.5px] ${
                  seg.hexIds && seg.hexIds.length > 0 ? 'hover:bg-[var(--surface-paper-hover)] cursor-pointer' : ''
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
                  <span className="truncate opacity-90">{seg.label}</span>
                </span>
                <span className="font-mono-num shrink-0 flex items-center gap-1.5">
                  <b className="font-semibold">{seg.valueText}</b>
                  {seg.subText && <span className="text-[10px] opacity-65">{seg.subText}</span>}
                </span>
              </div>
            ))}
          </div>
          {content.breakdownNote && (
            <p className="text-[10px] opacity-65 m-0 leading-snug">{content.breakdownNote}</p>
          )}
        </div>

        {/* Interactive Map-Linked Top 8 Ranking */}
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex rounded-md border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] p-0.5 gap-0.5">
              {(['states', 'metros'] as const).map((lvl, i) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setRankLevel(lvl)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                    rankLevel === lvl ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {content.levelLabels[i]}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] p-0.5 gap-0.5">
              {(['primary', 'secondary'] as const).map((md, i) => (
                <button
                  key={md}
                  type="button"
                  onClick={() => setRankMode(md)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                    rankMode === md ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {content.modeLabels[i]}
                </button>
              ))}
            </div>
          </div>

          {content.rankHint && (
            <div className="text-[10px] opacity-60 -mt-1">{content.rankHint}</div>
          )}

          <div className="space-y-0.5">
            {content.rows.map((r, idx) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => brushHexes(r.hexIds, r.label)}
                onMouseLeave={() => brushHexes(null)}
                onClick={() => {
                  brushHexes(null);
                  if (r.kind === 'state') openState(r.id);
                  else openCity(r.id);
                }}
                className="w-full text-left px-2 py-1 rounded-lg hover:bg-[var(--surface-paper-hover)] transition cursor-pointer group"
              >
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="truncate font-medium">
                    <span className="font-mono-num opacity-45 mr-1.5 text-[10px]">{idx + 1}</span>
                    <span className="group-hover:underline">{r.label}</span>
                    {r.sublabel && <span className="opacity-55 text-[10px] ml-1">{r.sublabel}</span>}
                    {r.detail && <span className="opacity-55 text-[10px] ml-1.5 font-mono-num">{r.detail}</span>}
                  </span>
                  <span
                    className="font-mono-num font-bold shrink-0"
                    style={r.tone === 'good' ? { color: goodCol } : r.tone === 'bad' ? { color: badCol } : undefined}
                  >
                    {r.valueText}
                  </span>
                </div>
                <div className="h-[3px] rounded-full mt-1 overflow-hidden" style={{ background: 'var(--border-hairline)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(4, (Math.abs(r.value) / maxRowVal) * 100))}%`,
                      background: r.barColor ?? info.barColor,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
          <div className="text-[10px] opacity-55 text-right">{L('悬停条目实时高亮地图 · 点击进入详情面板', 'Hover to highlight on map · Click to open detail panel')}</div>
        </div>
      </div>

      {/* Footer Quick Actions */}
      <div className="px-3.5 py-2.5 border-t border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/75 flex items-center justify-between gap-2 rounded-b-xl shrink-0">
        <button
          type="button"
          onClick={() => openAdvisor(content.advisorId)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer hover:brightness-105"
          style={{ background: 'var(--brass)', color: '#141B24' }}
        >
          <span>{content.advisorLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1.5">
          {content.lensId && content.lensLabel && (
            <button
              type="button"
              onClick={() => {
                setLens(content.lensId!);
                onClose();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold border border-[var(--border-hairline)] hover:bg-[var(--surface-paper-hover)] cursor-pointer"
              title={L(`切换地图至「${content.lensLabel}」`, `Switch map to ${content.lensLabel}`)}
            >
              <Eye className="w-3 h-3 opacity-75" />
              <span>{content.lensLabel}</span>
            </button>
          )}
          {'secondaryAdvisorId' in content && content.secondaryAdvisorId && content.secondaryAdvisorLabel && (
            <button
              type="button"
              onClick={() => openAdvisor(content.secondaryAdvisorId!)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold border border-[var(--border-hairline)] hover:bg-[var(--surface-paper-hover)] cursor-pointer"
            >
              <span>{content.secondaryAdvisorLabel}</span>
            </button>
          )}
          {'showLedgerBtn' in content && content.showLedgerBtn && (
            <button
              type="button"
              onClick={() => setYieldReportOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold border border-[var(--border-hairline)] hover:bg-[var(--surface-paper-hover)] cursor-pointer"
              title={L('打开完整《联邦国家产出年鉴》排行榜', 'Open full National Yield Ledger rankings')}
            >
              <Trophy className="w-3 h-3" style={{ color: 'var(--brass)' }} />
              <span>{L('年鉴总榜', 'Ledger')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setAlmanacOpen(true, 'sources')}
            className="p-1.5 rounded-md border border-[var(--border-hairline)] hover:bg-[var(--surface-paper-hover)] opacity-75 hover:opacity-100 cursor-pointer"
            title={L('在《联邦百科全书》查看全部 31 项数据源', 'Inspect all 31 official data sources in Federal Almanac')}
          >
            <BookOpen className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
