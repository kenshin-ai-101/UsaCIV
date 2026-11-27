import React, { useMemo, useState } from 'react';
import { ArrowRight, Building2, Compass, Factory, Scale, Users, X, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatMetric } from '../lenses/lensConfig';
import {
  localizeDistrictName,
  localizeDistrictNote,
  localizeFuelLabel,
  localizeIndustry,
  localizeMilComponent,
  localizeMineLabel,
  localizeMineMetric,
  localizeReligion,
  localizeWorkforceGroup,
  useL,
} from '../../i18n';
import type { CityRecord, MapLayersData, WorkforceGroup, WorldMeta } from '../../types/world';

interface CityCommandPanelProps {
  city: CityRecord;
  allCities: CityRecord[];
  meta: WorldMeta;
  layers: MapLayersData | null;
  onFlyTo: (x: number, y: number, scale: number) => void;
}

const ROLE_COLORS: Record<WorkforceGroup['id'], string> = {
  stem: '#29669C',
  biz: '#C69128',
  med: '#317E5E',
  mfg: '#B85636',
  edu: '#8A5D9E',
  trans: '#2D8594',
  srv: '#7A736A',
  agri: '#6D8C4A',
};

const US_AVG_MEEPLES: WorkforceGroup[] = [
  { id: 'stem', label: 'STEM 科技工程', share: 0.071, meeples: 1 },
  { id: 'biz', label: '商管与金融', share: 0.165, meeples: 3 },
  { id: 'med', label: '医疗健康', share: 0.095, meeples: 2 },
  { id: 'mfg', label: '制造与建造', share: 0.175, meeples: 3 },
  { id: 'edu', label: '教育与文创', share: 0.112, meeples: 2 },
  { id: 'trans', label: '交通与物流', share: 0.072, meeples: 1 },
  { id: 'srv', label: '商业销售与服务', share: 0.295, meeples: 4 },
  { id: 'agri', label: '农林渔牧', share: 0.015, meeples: 0 },
];

export const MeepleCohortSvg: React.FC<{ groups: WorkforceGroup[]; compact?: boolean }> = ({ groups, compact }) => {
  const { locale } = useL();
  const tokens: { id: WorkforceGroup['id']; label: string; share: number }[] = [];
  for (const g of groups) {
    for (let k = 0; k < g.meeples; k++) {
      tokens.push({ id: g.id, label: localizeWorkforceGroup(g.id, g.label, locale), share: g.share });
    }
  }
  while (tokens.length < 16) tokens.push({ id: 'srv', label: localizeWorkforceGroup('srv', '商业销售与服务', locale), share: 0 });

  return (
    <div className={`grid grid-cols-4 ${compact ? 'gap-1' : 'gap-1.5'} justify-items-center`}>
      {tokens.slice(0, 16).map((tk, idx) => {
        const col = ROLE_COLORS[tk.id] ?? '#7A736A';
        return (
          <svg
            key={idx}
            width={compact ? 22 : 28}
            height={compact ? 26 : 32}
            viewBox="0 0 26 30"
            className="transition-transform hover:-translate-y-0.5 hover:scale-110"
          >
            <title>{`${tk.label} (${(tk.share * 100).toFixed(1)}%)`}</title>
            <circle cx="13" cy="7" r="4.4" fill={col} />
            <path d="M5,27 C5,17 7.5,13 13,13 C18.5,13 21,17 21,27 Z" fill={col} />
            {tk.id === 'stem' && <rect x="8.5" y="4.7" width="9" height="2.8" rx="1.2" fill="#E8F4FF" stroke="#163554" strokeWidth="0.7" />}
            {tk.id === 'med' && <path d="M13,15.5 v5 M10.5,18 h5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />}
            {tk.id === 'mfg' && <path d="M7.5,6 Q13,1.8 18.5,6 Z" fill="#F2CA52" stroke="#5E2814" strokeWidth="0.7" />}
          </svg>
        );
      })}
    </div>
  );
};

export const CityCommandPanel: React.FC<CityCommandPanelProps> = ({
  city,
  allCities,
  meta,
  layers,
  onFlyTo,
}) => {
  const { locale, isEn, L } = useL();
  const { closeSidePanel, openCity, openShowdown } = useAppStore();
  const [tab, setTab] = useState<'overview' | 'districts' | 'citizens' | 'infra' | 'peers'>('overview');

  const cityById = useMemo(() => new Map(allCities.map((c) => [c.id, c])), [allCities]);
  const peerCities = useMemo(
    () => city.peers.map((id) => cityById.get(id)).filter((c): c is CityRecord => Boolean(c)),
    [city.peers, cityById],
  );

  const localInfra = useMemo(() => {
    if (!layers) return { plants: [], mines: [], ports: [], airports: [], bases: [], totalMw: 0 };
    const hset = new Set(city.hex_ids);
    const plants = layers.power_plants.filter((p) => p.cbsa === city.id || hset.has(p.hex_id));
    const mines = layers.mines.filter((m) => m.cbsa === city.id || hset.has(m.hex_id));
    const ports = layers.ports.filter((p) => p.cbsa === city.id || hset.has(p.hex_id));
    const airports = layers.airports.filter((a) => a.cbsa === city.id || hset.has(a.hex_id));
    const bases = layers.military_bases.filter((b) => b.cbsa === city.id || hset.has(b.hex_id));
    const totalMw = plants.reduce((s, p) => s + p.mw, 0);
    return { plants, mines, ports, airports, bases, totalMw };
  }, [city, layers]);

  const stemRatioVsUs = city.workforce.stem_share / Math.max(0.01, meta.nation.stem_share);

  return (
    <aside className="atlas-panel-brass fixed top-14 right-3 bottom-3 z-30 w-[min(450px,calc(100vw-24px))] rounded-2xl flex flex-col overflow-hidden">
      {/* Header Banner */}
      <div className="px-4 py-3 border-b border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/75">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--brass-soft)]" style={{ color: 'var(--brass)' }}>
                {city.is_metro ? L('大都会区 Metro', 'Metro Area') : L('微都会区 Micro', 'Micro Area')} · {city.state_abbr}
              </span>
              {city.pop_growth_pct != null && (
                <span className={`text-[10.5px] font-mono-num font-bold ${city.pop_growth_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {city.pop_growth_pct >= 0 ? '+' : ''}{(city.pop_growth_pct * 100).toFixed(1)}% (2020-25)
                </span>
              )}
            </div>
            <h2 className="font-display text-lg font-bold mt-1 leading-tight">{city.short_name}</h2>
            <div className="text-[11px] opacity-65 truncate max-w-[330px]">{city.name}</div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => openShowdown('city', city.id, city.peers[0] ?? null)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[var(--brass-soft)] hover:opacity-90 cursor-pointer"
              style={{ color: 'var(--brass)' }}
              title={L('与其他城市进行国力 PK', 'Compare head-to-head with another metro')}
            >
              <Scale className="w-3.5 h-3.5" /> {L('PK', 'VS')}
            </button>
            <button onClick={closeSidePanel} className="p-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer" title={L('退出城市视图 (Esc)', 'Close city view (Esc)')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 6 Civ Yields Strip */}
        <div className="grid grid-cols-6 gap-1.5 mt-3">
          {[
            { k: 'food', lbl: L('粮食', 'Food'), val: city.yields.food, col: 'var(--y-food)' },
            { k: 'prod', lbl: L('产能', 'Prod'), val: city.yields.prod, col: 'var(--y-prod)' },
            { k: 'gold', lbl: L('金币', 'Gold'), val: city.yields.gold, col: 'var(--y-gold)' },
            { k: 'sci', lbl: L('科技', 'Sci'), val: city.yields.sci, col: 'var(--y-science)' },
            { k: 'cul', lbl: L('文化', 'Cul'), val: city.yields.cul, col: 'var(--y-culture)' },
            { k: 'faith', lbl: L('信仰', 'Faith'), val: city.yields.faith, col: 'var(--y-faith)' },
          ].map((y) => (
            <div key={y.k} className="rounded-lg px-1.5 py-1 text-center bg-[var(--surface-paper)] border border-[var(--border-hairline)]">
              <div className="text-[9.5px] opacity-65">{y.lbl}</div>
              <div className="font-mono-num text-xs font-bold" style={{ color: y.col }}>
                +{y.val}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-5 border-b border-[var(--border-hairline)] text-[11px] font-semibold">
        {[
          { id: 'overview', label: L('概览', 'Overview') },
          { id: 'districts', label: L(`城区(${city.districts.length})`, `Districts(${city.districts.length})`) },
          { id: 'citizens', label: L('16 市民', 'Citizens') },
          { id: 'infra', label: L('设施', 'Infra') },
          { id: 'peers', label: L('对标', 'Peers') },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`py-2 border-b-2 transition cursor-pointer ${
              tab === t.id ? 'border-[var(--brass)] font-bold' : 'border-transparent opacity-65 hover:opacity-100'
            }`}
            style={tab === t.id ? { color: 'var(--brass)' } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                { lbl: L('常住人口 (ACS 2025)', 'Population (ACS 2025)'), val: city.pop.toLocaleString('en-US') },
                { lbl: L('真实 GDP (BEA 2024)', 'Real GDP (BEA 2024)'), val: city.gdp_musd ? `$${(city.gdp_musd / 1000).toFixed(1)}B` : '—' },
                { lbl: L('人均 GDP', 'GDP per Capita'), val: formatMetric(city.gdp_per_cap, 'usd', locale) },
                { lbl: L('家庭中位收入', 'Median Income'), val: formatMetric(city.median_income, 'usd', locale) },
                { lbl: L('房价中位数', 'Median Home Value'), val: formatMetric(city.median_home, 'usd', locale) },
                { lbl: L('月租金中位数', 'Median Monthly Rent'), val: formatMetric(city.median_rent, 'usd', locale) },
                { lbl: L('本科及以上学历', 'Bachelor’s+ Degree'), val: formatMetric(city.bachelors_pct, 'pct', locale) },
                { lbl: L('健康宜居度 (100=均值)', 'Wellbeing (100=avg)'), val: formatMetric(city.amenities, 'index', locale) },
                { lbl: L('平均单程通勤', 'Mean Commute'), val: formatMetric(city.commute_min, 'min', locale) },
                { lbl: L('FEMA 重大灾害数', 'FEMA Major Disasters'), val: city.disasters != null ? L(`${city.disasters} 次`, `${city.disasters}`) : '—' },
                { lbl: L('宗教信徒率', 'Religious Adherents'), val: city.faith_rate != null ? L(`${city.faith_rate}/百人`, `${city.faith_rate} / 100`) : L('无数据', 'No data') },
                { lbl: L('第一大宗教传统', 'Largest Tradition'), val: localizeReligion(city.primary_tradition, locale) },
              ].map((m) => (
                <div key={m.lbl} className="p-2.5 rounded-xl bg-[var(--surface-paper-subtle)]/65 border border-[var(--border-hairline)]">
                  <div className="text-[10px] opacity-65">{m.lbl}</div>
                  <div className="font-mono-num text-sm font-bold mt-0.5">{m.val}</div>
                </div>
              ))}
            </div>

            {(city.nat_change != null || city.dom_mig != null) && (
              <div className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/40">
                <div className="font-display font-bold text-xs mb-2">{L('人口增长动力拆解（PEP 2021–2025）', 'Population Change Drivers (PEP 2021–2025)')}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] opacity-65">{L('自然增减', 'Natural Change')}</div>
                    <div className="font-mono-num font-bold">{(city.nat_change ?? 0) >= 0 ? '+' : ''}{(city.nat_change ?? 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] opacity-65">{L('国内净迁入', 'Domestic Mig.')}</div>
                    <div className={`font-mono-num font-bold ${(city.dom_mig ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {(city.dom_mig ?? 0) >= 0 ? '+' : ''}{(city.dom_mig ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] opacity-65">{L('国际净迁入', 'Intl. Mig.')}</div>
                    <div className="font-mono-num font-bold text-sky-600">
                      {(city.intl_mig ?? 0) >= 0 ? '+' : ''}{(city.intl_mig ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl border border-[var(--border-hairline)]">
              <div className="font-display font-bold text-xs mb-2">{L('辖区版图与代表城区', 'Hex Territory & Signature Districts')}</div>
              <div className="text-[11px] opacity-75 mb-2">
                {isEn ? (
                  <>
                    Spans <b className="font-mono-num">{city.hex_ids.length}</b> equal-area 25 km hexes (~
                    <b className="font-mono-num">{(city.hex_ids.length * 541).toLocaleString()} km²</b>).
                  </>
                ) : (
                  <>
                    跨越 <b className="font-mono-num">{city.hex_ids.length}</b> 块 25 km 六边形（约{' '}
                    <b className="font-mono-num">{(city.hex_ids.length * 541).toLocaleString()} km²</b>）。
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {city.districts.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setTab('districts');
                      onFlyTo(d.x, d.y, 1.4);
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[var(--brass-soft)] hover:opacity-90 cursor-pointer"
                    style={{ color: 'var(--brass)' }}
                  >
                    {localizeDistrictName(d.id, d.name, locale)} · LQ {d.lq}×
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'districts' && (
          <div className="space-y-2.5">
            <p className="text-[11px] opacity-70 m-0">
              {isEn ? (
                <>
                  Districts are placed onto real metro hexes from <b>BLS QCEW 2025 industry Location Quotients (LQ)</b> and USACE/FAA/MIRTA hubs. Click any card to fly to its miniature on the map:
                </>
              ) : (
                <>
                  所有城区依据 <b>BLS QCEW 2025 真实企业岗位区位商（Location Quotient）</b> 与 USACE/FAA/MIRTA 实体设施自动落格建成，点击卡片即刻定位地图微缩建筑：
                </>
              )}
            </p>
            {city.districts.map((d) => (
              <button
                key={d.id}
                onClick={() => onFlyTo(d.x, d.y, 1.6)}
                className="w-full text-left p-3 rounded-xl border border-[var(--border-hairline)] hover:border-[var(--brass)] bg-[var(--surface-paper-subtle)]/55 transition cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 shrink-0" style={{ color: 'var(--brass)' }} />
                    <span className="font-display text-sm font-bold">{localizeDistrictName(d.id, d.name, locale)}</span>
                  </div>
                  <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--brass-soft)]" style={{ color: 'var(--brass)' }}>
                    LQ {d.lq.toFixed(2)}×
                  </span>
                </div>
                <div className="text-[11px] opacity-80 mt-1.5">{localizeDistrictNote(d.note, locale)}</div>
                <div className="flex items-center gap-4 mt-2 text-[10.5px] opacity-70 font-mono-num">
                  {d.jobs > 0 && <span>{L('核心岗位：', 'Core jobs: ')}{d.jobs.toLocaleString()}</span>}
                  {d.avg_wage != null && <span>{L('行业年薪：', 'Avg wage: ')}${d.avg_wage.toLocaleString()}</span>}
                  <span className="ml-auto flex items-center gap-0.5" style={{ color: 'var(--brass)' }}>
                    {L('定位地块', 'Locate')} <Compass className="w-3 h-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === 'citizens' && (
          <div className="space-y-3.5">
            {/* Highlight Banner: San Jose 1 in 4 vs US 1 in 14 */}
            <div className="p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--brass-soft)]">
              <div className="flex items-center gap-2 font-display font-bold text-xs">
                <Users className="w-4 h-4" style={{ color: 'var(--brass)' }} />
                {L(
                  `真实市民劳动力画像（总就业 ${city.workforce.total_workers.toLocaleString()} 人）`,
                  `Real Workforce Profile (${city.workforce.total_workers.toLocaleString()} workers)`,
                )}
              </div>
              <p className="text-[11.5px] mt-1.5 mb-0 leading-relaxed">
                {isEn ? (
                  <>
                    In <b>{city.short_name}</b>, <b>1 in <span className="font-mono-num text-sm">{city.workforce.stem_one_in}</span></b> workers is an engineer, developer, or scientist (<b className="font-mono-num">{(city.workforce.stem_share * 100).toFixed(1)}%</b>), compared with <b>1 in <span className="font-mono-num">{meta.nation.stem_one_in}</span></b> nationwide (<b className="font-mono-num">{stemRatioVsUs.toFixed(2)}×</b> U.S. avg).
                  </>
                ) : (
                  <>
                    在 <b>{city.short_name}</b>，每 <b className="font-mono-num text-sm">{city.workforce.stem_one_in}</b> 名劳动者中就有{' '}
                    <b>1 名</b> 工程师、程序员或科学家（占比 <b className="font-mono-num">{(city.workforce.stem_share * 100).toFixed(1)}%</b>），
                    全美平均为每 <b className="font-mono-num">{meta.nation.stem_one_in}</b> 人有 1 名（相当于全美均值的{' '}
                    <b className="font-mono-num">{stemRatioVsUs.toFixed(2)}×</b>）。
                  </>
                )}
              </p>
            </div>

            {/* Side-by-side 16-Meeple Isotype Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-paper-subtle)]/65">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-bold text-[11.5px] truncate">{city.short_name}</span>
                  <span className="font-mono-num text-[10.5px] font-bold" style={{ color: 'var(--y-science)' }}>
                    1/{city.workforce.stem_one_in} STEM
                  </span>
                </div>
                <MeepleCohortSvg groups={city.workforce.groups} compact />
              </div>

              <div className="p-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/45">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-bold text-[11.5px]">{L('全美均值', 'U.S. Average')}</span>
                  <span className="font-mono-num text-[10.5px] opacity-70">1/{meta.nation.stem_one_in} STEM</span>
                </div>
                <MeepleCohortSvg groups={US_AVG_MEEPLES} compact />
              </div>
            </div>

            {/* Occupation Share Bars */}
            <div className="space-y-1.5">
              <div className="font-display font-bold text-xs">{L('职业构成明细（每枚人偶 ≈ 6.25%）', 'Occupation Breakdown (1 meeple ≈ 6.25%)')}</div>
              {city.workforce.groups.map((g) => (
                <div key={g.id} className="space-y-0.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ROLE_COLORS[g.id] }} />
                      {localizeWorkforceGroup(g.id, g.label, locale)}
                    </span>
                    <span className="font-mono-num font-semibold">
                      {(g.share * 100).toFixed(1)}% · {g.meeples} {L('枚', 'fig.')}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--surface-paper-subtle)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, g.share * 100 * 2.2)}%`, background: ROLE_COLORS[g.id] }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Resident Industries (ACS C24030) */}
            {city.workforce.industries.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1">
                <div className="font-display font-bold text-xs mb-1.5">{L('常住居民所属行业分布（ACS C24030）', 'Resident Industry Distribution (ACS C24030)')}</div>
                {city.workforce.industries.map((ind) => (
                  <div key={ind.name} className="flex items-center justify-between text-[11px]">
                    <span className="opacity-80">{localizeIndustry(ind.key ?? ind.name, ind.name, locale)}</span>
                    <span className="font-mono-num font-semibold">{(ind.share * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'infra' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-paper-subtle)]/65 border border-[var(--border-hairline)] flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold"><Zap className="w-4 h-4" style={{ color: 'var(--y-power)' }} /> {L('辖区入榜发电装机', 'Mapped Power Capacity')}</span>
              <span className="font-mono-num font-bold text-sm">{localInfra.totalMw.toLocaleString()} MW</span>
            </div>

            {localInfra.plants.length > 0 && (
              <div>
                <div className="text-[10.5px] font-bold uppercase opacity-65 mb-1">{L('主要发电厂 (EIA-860M)', 'Major Power Plants (EIA-860M)')}</div>
                <div className="space-y-1">
                  {localInfra.plants.slice(0, 8).map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => onFlyTo(p.x, p.y, 1.5)}
                      className="w-full flex justify-between items-center px-2.5 py-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] text-left cursor-pointer"
                    >
                      <span className="truncate pr-2">{p.name} <span className="opacity-60 text-[10px]">({localizeFuelLabel(p.fuel, undefined, locale)})</span></span>
                      <span className="font-mono-num font-bold shrink-0">{p.mw.toLocaleString()} MW</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {localInfra.airports.length > 0 && (
              <div>
                <div className="text-[10.5px] font-bold uppercase opacity-65 mb-1">{L('航空枢纽 (FAA CY2025)', 'Aviation Hubs (FAA CY2025)')}</div>
                {localInfra.airports.map((a) => (
                  <button
                    key={a.code}
                    onClick={() => onFlyTo(a.x, a.y, 1.5)}
                    className="w-full flex justify-between items-center px-2.5 py-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] text-left cursor-pointer"
                  >
                    <span className="truncate pr-2"><b>{a.code}</b> · {a.name}</span>
                    <span className="font-mono-num font-bold shrink-0">{(a.enplanements / 1e6).toFixed(1)}M {L('客', 'pax')}</span>
                  </button>
                ))}
              </div>
            )}

            {localInfra.ports.length > 0 && (
              <div>
                <div className="text-[10.5px] font-bold uppercase opacity-65 mb-1">{L('深水与内河港 (USACE)', 'Maritime & Inland Ports (USACE)')}</div>
                {localInfra.ports.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => onFlyTo(p.x, p.y, 1.5)}
                    className="w-full flex justify-between items-center px-2.5 py-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] text-left cursor-pointer"
                  >
                    <span className="truncate pr-2">{p.name}</span>
                    <span className="font-mono-num font-bold shrink-0">{(p.tons / 1e6).toFixed(1)}M {L('吨', 'tons')}</span>
                  </button>
                ))}
              </div>
            )}

            {localInfra.bases.length > 0 && (
              <div>
                <div className="text-[10.5px] font-bold uppercase opacity-65 mb-1">{L('国防驻军基地 (DoD MIRTA)', 'Military Installations (DoD MIRTA)')}</div>
                {localInfra.bases.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => onFlyTo(b.x, b.y, 1.5)}
                    className="w-full flex justify-between items-center px-2.5 py-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] text-left cursor-pointer"
                  >
                    <span className="truncate pr-2">{b.name}</span>
                    <span className="text-[10.5px] opacity-70 shrink-0">{localizeMilComponent(b.component, locale)}</span>
                  </button>
                ))}
              </div>
            )}

            {localInfra.mines.length > 0 && (
              <div>
                <div className="text-[10.5px] font-bold uppercase opacity-65 mb-1">{L('矿山与资源开采 (MSHA / EIA)', 'Mines & Extraction (MSHA / EIA)')}</div>
                {localInfra.mines.slice(0, 6).map((m, i) => (
                  <div key={i} className="flex justify-between px-2.5 py-1 text-[11px]">
                    <span className="truncate pr-2">{m.name} ({localizeMineLabel(m.commodity, m.label, locale)})</span>
                    <span className="font-mono-num">{localizeMineMetric(m.metric_label, locale)}</span>
                  </div>
                ))}
              </div>
            )}

            {localInfra.plants.length + localInfra.airports.length + localInfra.ports.length + localInfra.bases.length + localInfra.mines.length === 0 && (
              <div className="p-6 text-center opacity-65 flex flex-col items-center gap-2">
                <Factory className="w-6 h-6 opacity-50" />
                <span>{L('该微都会区内无入榜大型能源/港口/航空或军事主节点。', 'No mapped large-scale power, port, aviation, or military nodes in this area.')}</span>
              </div>
            )}
          </div>
        )}

        {tab === 'peers' && (
          <div className="space-y-2.5">
            <p className="text-[11px] opacity-70 m-0">
              {L(
                '按人口与真实 GDP 体量自动匹配全美最相近的 5 座都会区，点击切换飞镜或发起同屏 PK：',
                'Top 5 peer metros matched by population and real GDP scale — click to fly or launch a side-by-side showdown:',
              )}
            </p>
            {peerCities.map((p) => (
              <div key={p.id} className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/50 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => openCity(p.id)}
                    className="font-display text-sm font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {p.short_name}, {p.state_abbr} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openShowdown('city', city.id, p.id)}
                    className="text-[10.5px] px-2 py-0.5 rounded bg-[var(--brass-soft)] font-semibold cursor-pointer"
                    style={{ color: 'var(--brass)' }}
                  >
                    {L('发起 PK', 'Compare')}
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[10.5px] font-mono-num">
                  <div><span className="opacity-60 block text-[9.5px]">{L('人口', 'Pop')}</span>{(p.pop / 1e6).toFixed(2)}M</div>
                  <div><span className="opacity-60 block text-[9.5px]">GDP</span>${((p.gdp_musd ?? 0) / 1000).toFixed(0)}B</div>
                  <div><span className="opacity-60 block text-[9.5px]">{L('收入', 'Income')}</span>{formatMetric(p.median_income, 'usd_k', locale)}</div>
                  <div><span className="opacity-60 block text-[9.5px]">STEM</span>1/{p.workforce.stem_one_in}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
