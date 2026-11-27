import React, { useMemo } from 'react';
import {
  Compass,
  GraduationCap,
  Landmark,
  Shield,
  Ship,
  Sparkles,
  Table2,
  Trees,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useL } from '../../i18n';
import { CommerceView, EconomyView, EnergyView, ProsperityView } from './views/WealthViews';
import { CultureView, KnowledgeView, LandView, MilitaryView, PeopleView } from './views/PeopleLandViews';
import type {
  CityRecord,
  CountiesDataset,
  MapLayersData,
  StateRecord,
  WorldHexData,
  WorldMeta,
} from '../../types/world';

interface AdvisorsPanelProps {
  meta: WorldMeta;
  world: WorldHexData;
  cities: CityRecord[];
  states: StateRecord[];
  layers: MapLayersData | null;
  counties: CountiesDataset | null;
  onFlyTo: (x: number, y: number, scale: number) => void;
}

export interface AdvisorMeta {
  id: string;
  name: string;
  nameEn: string;
  title: string;
  group: 'wealth' | 'people' | 'defense' | 'explore';
  color: string;
  blurb: string;
  blurbEn: string;
  icon: React.ReactNode;
}

export const ADVISOR_LIST: AdvisorMeta[] = [
  { id: 'energy', name: '能源与矿产', nameEn: 'Energy & Resources', title: 'MINISTER OF POWER', group: 'wealth', color: '#D98A2B', blurb: '入图大型电站结构（9 类能源）、大中型矿山与页岩油气带。', blurbEn: 'Mapped power grid across 9 fuel types, major mines & shale oil/gas basins.', icon: <Zap className="w-4 h-4" /> },
  { id: 'economy', name: '宏观经济', nameEn: 'Economy', title: 'TREASURER', group: 'wealth', color: '#C9A43A', blurb: 'BEA 20 大行业 GDP、都会区产出气泡、产业专业化 LQ 与增长散点。', blurbEn: 'BEA 20-industry GDP, metro output bubbles, industry specialization (LQ) & growth scatter.', icon: <Wallet className="w-4 h-4" /> },
  { id: 'people', name: '人口与迁徙', nameEn: 'People & Migration', title: 'KEEPER OF THE CENSUS', group: 'people', color: '#C46A4F', blurb: '2021–2025 人口增减榜、对数密度加权分布、年龄与移民版图。', blurbEn: '2021–2025 growth leaders, log-density distributions, median age & immigration map.', icon: <Users className="w-4 h-4" /> },
  { id: 'prosperity', name: '繁荣与住房', nameEn: 'Prosperity & Housing', title: 'STEWARD OF THE HEARTH', group: 'wealth', color: '#3F9C82', blurb: '房价收入 3×/5×/8× 负担线、各县贫困直方图、房租负担与失业率。', blurbEn: '3×/5×/8× home-price-to-income slopes, county poverty histogram, rent burden & unemployment.', icon: <Compass className="w-4 h-4" /> },
  { id: 'knowledge', name: '科研与知识', nameEn: 'Knowledge & Science', title: 'ROYAL SCHOLAR', group: 'people', color: '#4A86D6', blurb: '1,730 万科研信息就业产出、学历-收入散点与宽带离线鸿沟。', blurbEn: '17.3M scientific & info workers, degrees-vs-income scatter & broadband divide.', icon: <GraduationCap className="w-4 h-4" /> },
  { id: 'land', name: '土地与生态', nameEn: 'Land & Ecology', title: 'SURVEYOR GENERAL', group: 'people', color: '#6E9A3C', blurb: 'NLCD 7 类陆地覆被构成、各州土地配方甜甜圈与农林渔牧劳动力。', blurbEn: 'NLCD 7-class land cover, state recipe donut grid & agriculture/forestry workforce.', icon: <Trees className="w-4 h-4" /> },
  { id: 'military', name: '国防与军事', nameEn: 'Defense & Military', title: 'GENERAL', group: 'defense', color: '#8796AB', blurb: 'MIRTA 基地与靶场、DMDC 兵力、OLDCC 防务开支、驻军城与退伍军人。', blurbEn: 'MIRTA bases & ranges, DMDC personnel, OLDCC defense spend, garrison metros & veterans.', icon: <Shield className="w-4 h-4" /> },
  { id: 'commerce', name: '商贸与货运', nameEn: 'Commerce & Freight', title: 'MASTER OF TRADE', group: 'wealth', color: '#2FA4B8', blurb: 'FAF5 $19.8T 州际货运大动脉、货运区、三色堆叠港口与航空枢纽。', blurbEn: 'FAF5 $19.8T freight corridors, trade zones, stacked port tonnage & aviation hubs.', icon: <Ship className="w-4 h-4" /> },
  { id: 'culture', name: '文化、信仰与灾害', nameEn: 'Culture, Faith & Hazards', title: 'KEEPER OF WONDERS', group: 'people', color: '#C25B9A', blurb: '4 条公开规则奇观、宗教普查、CDC 健康宜居度与 FEMA/NOAA 灾害。', blurbEn: '4-rule Wonders, U.S. Religion Census, CDC wellbeing & FEMA/NOAA disasters.', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'explorer', name: '全维数据探索器', nameEn: 'Data Explorer', title: 'CARTOGRAPHER', group: 'explore', color: '#9A7BC9', blurb: '自由选择层级、列、组合筛选器与任意双轴可框选散点图。', blurbEn: 'Custom geography level, columns, compound filters & any-axis brushable scatter.', icon: <Table2 className="w-4 h-4" /> },
];

/** Top circular 10-advisor medallion switcher bar shared across Council, Advisors & Explorer */
export const AdvisorMedallionBar: React.FC<{ activeId: string }> = ({ activeId }) => {
  const { isEn, L } = useL();
  const { openAdvisor, openExplorer, closeSidePanel } = useAppStore();
  return (
    <div className="flex items-center justify-between gap-1 px-2.5 py-2 border-b border-[var(--border-hairline)] bg-black/20 shrink-0">
      <div className="flex items-center gap-1 py-0.5 px-0.5">
        <button
          type="button"
          onClick={() => openAdvisor('council')}
          title={L('内阁议事厅总览 (Council)', 'Cabinet Council Overview')}
          className={`w-7 h-7 rounded-full flex items-center justify-center border transition shrink-0 cursor-pointer ${
            activeId === 'council' ? 'border-[var(--brass-bright)] bg-[var(--brass-soft)] scale-110' : 'border-white/15 bg-white/5 opacity-70 hover:opacity-100'
          }`}
          style={{ color: 'var(--brass-bright)' }}
        >
          <Landmark className="w-3.5 h-3.5" />
        </button>
        {ADVISOR_LIST.map((a) => {
          const active = activeId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => (a.id === 'explorer' ? openExplorer() : openAdvisor(a.id))}
              title={`${isEn ? a.nameEn : a.name} · ${a.title}`}
              className={`w-7 h-7 rounded-full flex items-center justify-center border transition shrink-0 cursor-pointer ${
                active ? 'scale-110 ring-2 ring-amber-200/70' : 'opacity-65 hover:opacity-100 hover:scale-105'
              }`}
              style={{
                background: active ? a.color : `${a.color}33`,
                borderColor: active ? '#FFF4D4' : `${a.color}99`,
                color: '#FFFDF7',
              }}
            >
              <span className="scale-[0.82]">{a.icon}</span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={closeSidePanel} className="p-1 rounded-full border border-white/15 hover:bg-white/10 shrink-0 cursor-pointer" title={L('关闭面板 (Esc)', 'Close panel (Esc)')}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const AdvisorsPanel: React.FC<AdvisorsPanelProps> = ({
  meta,
  world,
  cities,
  states,
  layers,
  counties,
  onFlyTo,
}) => {
  const { isEn, L } = useL();
  const { activeAdvisorId, openAdvisor, openExplorer, geoScope, setGeoScope } = useAppStore();

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

  // Filter geographic datasets by geoScope ('conus' = Lower 48 + DC matching 49/524/3,109 reference exact parity; 'all' = includes AK/HI)
  const scopedCities = useMemo(
    () => (geoScope === 'conus' ? cities.filter((c) => c.state_abbr !== 'AK' && c.state_abbr !== 'HI') : cities),
    [cities, geoScope],
  );
  const scopedStates = useMemo(
    () => (geoScope === 'conus' ? states.filter((s) => s.abbr !== 'AK' && s.abbr !== 'HI') : states),
    [states, geoScope],
  );
  const scopedCounties = useMemo<CountiesDataset | null>(() => {
    if (!counties) return null;
    if (geoScope === 'all') return counties;
    return {
      ...counties,
      rows: counties.rows.filter((r) => r.state !== 'AK' && r.state !== 'HI'),
    };
  }, [counties, geoScope]);
  const scopedLayers = useMemo<MapLayersData | null>(() => {
    if (!layers) return null;
    if (geoScope === 'all') return layers;
    const isL48 = (st: string) => st !== 'AK' && st !== 'HI';
    const power_plants = layers.power_plants.filter((p) => isL48(p.state));
    const fuelMap = new Map<string, { mw: number; count: number }>();
    for (const p of power_plants) {
      const cur = fuelMap.get(p.fuel) ?? { mw: 0, count: 0 };
      cur.mw += p.mw;
      cur.count += 1;
      fuelMap.set(p.fuel, cur);
    }
    const power_by_fuel = layers.power_by_fuel
      .map((f) => {
        const c = fuelMap.get(f.fuel);
        return { ...f, mw: c ? Math.round(c.mw * 10) / 10 : 0, count: c ? c.count : 0 };
      })
      .filter((f) => f.count > 0)
      .sort((a, b) => b.mw - a.mw);
    return {
      ...layers,
      power_plants,
      power_by_fuel,
      mines: layers.mines.filter((m) => isL48(m.state)),
      shale_sites: layers.shale_sites?.filter((s) => isL48(s.state)),
      ports: layers.ports.filter((p) => isL48(p.state)),
      airports: layers.airports.filter((a) => isL48(a.state)),
      military_bases: layers.military_bases.filter((b) => isL48(b.state)),
      trade: {
        ...layers.trade,
        zones: layers.trade.zones?.filter((z) => (z.conus !== undefined ? z.conus : isL48(z.abbr))),
      },
    };
  }, [layers, geoScope]);

  const activeAdv = ADVISOR_LIST.find((a) => a.id === activeAdvisorId);
  const viewProps = {
    meta,
    world,
    cities: scopedCities,
    states: scopedStates,
    allStates: states,
    layers: scopedLayers,
    counties: scopedCounties,
    stateHexMap,
    geoScope,
    onFlyTo,
  };

  return (
    <aside
      className="fixed top-11 left-0 bottom-0 z-30 w-[min(458px,100vw)] flex flex-col border-r overflow-hidden"
      style={{
        background: 'var(--surface-paper)',
        borderColor: 'var(--border-strong)',
        boxShadow: '8px 0 32px rgba(0,0,0,0.45)',
      }}
    >
      <AdvisorMedallionBar activeId={activeAdvisorId} />
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--border-hairline)] bg-black/15 text-[10px] shrink-0">
        <span className="opacity-65">{L('统计范围', 'Scope')}</span>
        <div className="inline-flex rounded-md border border-[var(--border-hairline)] bg-black/25 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setGeoScope('conus')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition ${
              geoScope === 'conus' ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {L(
              `本土 48 州+DC (${states.filter((s) => s.abbr !== 'AK' && s.abbr !== 'HI').length}州·${meta.nation.conus_metros ?? 524}城·${(meta.nation.conus_counties ?? 3109).toLocaleString()}县)`,
              `Lower 48+DC (${states.filter((s) => s.abbr !== 'AK' && s.abbr !== 'HI').length} · ${meta.nation.conus_metros ?? 524} · ${(meta.nation.conus_counties ?? 3109).toLocaleString()})`,
            )}
          </button>
          <button
            type="button"
            onClick={() => setGeoScope('all')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition ${
              geoScope === 'all' ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {L(`含 AK/HI (${states.length}州·${cities.length}城)`, `Incl. AK/HI (${states.length} · ${cities.length})`)}
          </button>
        </div>
      </div>

      {activeAdvisorId === 'council' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">{L('YOUR COUNCIL · 联邦内阁', 'YOUR COUNCIL')}</div>
            <h2 className="font-display text-2xl font-bold mt-0.5 mb-1" style={{ color: 'var(--brass-bright)' }}>{L('ADVISORS · 顾问议事厅', 'ADVISORS')}</h2>
            <p className="text-xs opacity-75 m-0 leading-relaxed">
              {L(
                '每位顾问呈现美国真实经济、能源、人口、科研、国防与文化的一个核心切面。悬停图表任意条目即可实时联动主地图，点击即刻飞镜下钻。',
                'Each advisor presents one core dimension of real U.S. economy, energy, demographics, science, defense, and culture. Hover any row or chart to highlight the map live; click to drill down.',
              )}
            </p>
          </div>

          {[
            { label: L('财富与产业 · WEALTH & WORK', 'WEALTH & WORK'), ids: ['economy', 'prosperity', 'commerce', 'energy'] },
            { label: L('人口与土地 · PEOPLE & LAND', 'PEOPLE & LAND'), ids: ['people', 'knowledge', 'culture', 'land'] },
            { label: L('国防安全 · DEFENSE', 'DEFENSE'), ids: ['military'] },
            { label: L('自由切片探索 · YOUR OWN QUESTIONS', 'YOUR OWN QUESTIONS'), ids: ['explorer'] },
          ].map((grp) => (
            <div key={grp.label} className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-55">{grp.label}</div>
              {grp.ids.map((id) => {
                const a = ADVISOR_LIST.find((x) => x.id === id)!;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => (id === 'explorer' ? openExplorer() : openAdvisor(id))}
                    className="w-full text-left p-3 rounded-xl border border-[var(--border-hairline)] hover:border-[var(--brass)] bg-[var(--surface-paper-subtle)]/55 hover:bg-[var(--surface-paper-hover)] transition flex items-center gap-3.5 cursor-pointer group"
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border-2 shadow-md transition-transform group-hover:scale-105"
                      style={{ background: `radial-gradient(circle at 30% 30%, ${a.color}, #1A222E)`, borderColor: a.color, color: '#FFFDF7' }}
                    >
                      {a.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[9.5px] font-bold uppercase tracking-widest opacity-60">{a.title}</div>
                      <div className="font-display text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{isEn ? a.nameEn : a.name}</div>
                      <div className="text-[11px] opacity-70 mt-0.5 leading-snug">{isEn ? a.blurbEn : a.blurb}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : activeAdv ? (
        <div key={activeAdv.id} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Advisor Hero Masthead */}
          <div className="flex items-center gap-3.5 pb-3 border-b border-[var(--border-hairline)]">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 shadow-lg"
              style={{ background: `radial-gradient(circle at 30% 30%, ${activeAdv.color}, #151E2B)`, borderColor: activeAdv.color, color: '#FFFDF7' }}
            >
              {activeAdv.icon}
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-65">{activeAdv.title}</div>
              <h2 className="font-display text-xl font-bold m-0 leading-tight" style={{ color: 'var(--brass-bright)' }}>
                {isEn ? activeAdv.nameEn : activeAdv.name}
              </h2>
              <p className="text-[11px] opacity-75 m-0 mt-0.5">{isEn ? activeAdv.blurbEn : activeAdv.blurb}</p>
            </div>
          </div>

          {activeAdv.id === 'energy' && <EnergyView {...viewProps} />}
          {activeAdv.id === 'economy' && <EconomyView {...viewProps} />}
          {activeAdv.id === 'people' && <PeopleView {...viewProps} />}
          {activeAdv.id === 'prosperity' && <ProsperityView {...viewProps} />}
          {activeAdv.id === 'knowledge' && <KnowledgeView {...viewProps} />}
          {activeAdv.id === 'land' && <LandView {...viewProps} />}
          {activeAdv.id === 'military' && <MilitaryView {...viewProps} />}
          {activeAdv.id === 'commerce' && <CommerceView {...viewProps} />}
          {activeAdv.id === 'culture' && <CultureView {...viewProps} />}
        </div>
      ) : null}
    </aside>
  );
};
