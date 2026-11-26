import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore, type MapBubbleSpec } from '../../../store/useAppStore';
import { FUEL_COLORS, MINE_COLORS } from '../../../engine/sprites/proceduralSprites';
import { formatMetric, sampleRamp } from '../../lenses/lensConfig';
import {
  BrushScatter,
  CalloutNote,
  fmtCount3,
  fmtMoney3,
  fmtMw,
  fmtSignedPct,
  InteractiveHistogram,
  KpiTiles,
  LinkedBarList,
  RampLegend,
  Segmented,
  ShareBar,
  SizeLegend,
  SortableTable,
  SourcesFooter,
  StackedBarList,
  SwatchLegend,
  type ScatterPoint,
} from '../AdvisorCharts';
import type {
  CityRecord,
  CountiesDataset,
  MapLayersData,
  StateRecord,
  WorldHexData,
  WorldMeta,
} from '../../../types/world';

export interface AdvisorViewProps {
  meta: WorldMeta;
  world: WorldHexData;
  cities: CityRecord[];
  states: StateRecord[];
  allStates?: StateRecord[];
  layers: MapLayersData | null;
  counties: CountiesDataset | null;
  stateHexMap: Map<string, number[]>;
  geoScope?: 'conus' | 'all';
  onFlyTo: (x: number, y: number, scale: number) => void;
}

const SectionTitle: React.FC<{ title: string; kicker?: string; note?: string }> = ({ title, kicker, note }) => (
  <div className="mb-2 pt-1">
    {kicker && <div className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--brass)' }}>{kicker}</div>}
    <h3 className="font-display text-sm font-bold m-0">{title}</h3>
    {note && <p className="text-[11px] opacity-70 m-0 mt-0.5 leading-snug">{note}</p>}
  </div>
);

/* ============================================================================
 * 1. ENERGY & RESOURCES ADVISOR (Aligned with EIA-860M thresholds, MSHA/EIA mines & shale)
 * ============================================================================ */
const EMPTY_ARR: never[] = [];

const ENERGY_GROUPS = [
  { id: 'thermal', label: '火力与地热', types: ['nuclear', 'coal_plant', 'gas_plant', 'geothermal'] },
  { id: 'water', label: '水电与抽蓄', types: ['hydro', 'pumped_storage'] },
  { id: 'renew', label: '风光与储能', types: ['wind', 'solar', 'battery'] },
  { id: 'mines', label: '大中型矿山', types: ['coal_mine', 'gold', 'copper', 'iron', 'silver', 'platinum', 'molybdenum', 'lead_zinc', 'rare_earths', 'uranium'] },
  { id: 'plays', label: '油气盆地', types: ['oil', 'gas'] },
];

const SHALE_PLAY_META = [
  { id: 'oil' as const, label: '致密油 (页岩)', color: '#c4833d', unit: 'km² 盆地面积', rule: '主要致密油页岩带（Permian、Bakken/Three Forks、Eagle Ford、Niobrara）按 1/4 非相邻网格抽稀落位，不代表产量。' },
  { id: 'gas' as const, label: '页岩气', color: '#7896b8', unit: 'km² 盆地面积', rule: '主要页岩气带（Marcellus、Utica、Haynesville、Barnett、Fayetteville、Woodford、Mancos）按 1/4 非相邻网格抽稀落位。' },
];

export const EnergyView: React.FC<AdvisorViewProps> = ({ meta, world, states, layers, stateHexMap, onFlyTo }) => {
  const { setAdvisorVisuals, setHoveredBubbleId, setLens, setBrushed } = useAppStore();
  const [minMw, setMinMw] = useState(0);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<string> | null>(null); // null = all on
  const [showExplainer, setShowExplainer] = useState(false);

  const fuels = layers?.power_by_fuel ?? EMPTY_ARR;
  const mineCatalog = meta.mine_catalog ?? EMPTY_ARR;
  const shaleSites = layers?.shale_sites ?? EMPTY_ARR;
  const allTypeIds = useMemo(
    () => [...fuels.map((f) => f.fuel), ...mineCatalog.map((m) => m.id), 'oil', 'gas'],
    [fuels, mineCatalog],
  );
  const activeSet = useMemo(() => enabledTypes ?? new Set(allTypeIds), [enabledTypes, allTypeIds]);

  const shaleOilCount = useMemo(() => shaleSites.filter((s) => s.kind === 'oil').length, [shaleSites]);
  const shaleGasCount = useMemo(() => shaleSites.filter((s) => s.kind === 'gas').length, [shaleSites]);

  const visiblePower = useMemo(() => {
    if (!layers) return EMPTY_ARR;
    return layers.power_plants.filter(
      (p) => activeSet.has(p.fuel) && p.mw >= minMw && (!selectedState || p.state === selectedState),
    );
  }, [layers, activeSet, minMw, selectedState]);

  const visibleMines = useMemo(() => {
    if (!layers || minMw > 0) return EMPTY_ARR;
    return layers.mines.filter(
      (m) => activeSet.has(m.commodity) && (!selectedState || m.state === selectedState),
    );
  }, [layers, activeSet, minMw, selectedState]);

  const visibleShale = useMemo(() => {
    if (!layers || minMw > 0) return EMPTY_ARR;
    return shaleSites.filter(
      (s) => activeSet.has(s.kind) && (!selectedState || s.state === selectedState),
    );
  }, [layers, shaleSites, activeSet, minMw, selectedState]);

  const maxSiteMw = useMemo(
    () => Math.max(1, ...(layers ? layers.power_plants.map((p) => p.mw) : [1])),
    [layers],
  );

  // Sync live proportional power bubbles on dimmed terrain!
  useEffect(() => {
    if (!layers) return;
    setLens(null);
    const bubbles: MapBubbleSpec[] = visiblePower.map((p, idx) => ({
      id: `pwr_${p.hex_id}_${p.fuel}_${idx}`,
      label: p.name,
      sublabel: `${fmtMw(p.mw)} · ${p.state}`,
      x: p.x,
      y: p.y,
      radiusPx: 3.5 + Math.sqrt(p.mw / maxSiteMw) * 20,
      color: FUEL_COLORS[p.fuel]?.fill ?? '#d98a2b',
    }));
    setAdvisorVisuals(bubbles, true);
    return () => setHoveredBubbleId(null);
  }, [layers, visiblePower, maxSiteMw, setAdvisorVisuals, setLens, setHoveredBubbleId]);

  const toggleType = (id: string, altKey: boolean) => {
    if (altKey) {
      setEnabledTypes(new Set([id]));
      return;
    }
    const next = new Set(activeSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEnabledTypes(next.size === allTypeIds.length ? null : next);
  };

  const soloPowerType = (fuel: string) => {
    if (enabledTypes && enabledTypes.size === 1 && enabledTypes.has(fuel)) {
      setEnabledTypes(null);
    } else {
      setEnabledTypes(new Set([fuel]));
    }
  };

  const siteRows = useMemo(() => {
    const pRows = visiblePower.map((p, i) => ({
      id: `pwr_${p.hex_id}_${p.fuel}_${i}`,
      name: p.name,
      type: fuels.find((f) => f.fuel === p.fuel)?.label ?? p.fuel,
      color: FUEL_COLORS[p.fuel]?.fill ?? '#d98a2b',
      state: p.state,
      detail: p.detail ?? '',
      mwSort: p.mw,
      sizeText: fmtMw(p.mw),
      x: p.x,
      y: p.y,
      hexId: p.hex_id,
      isPower: true,
    }));
    const mRows = visibleMines.map((m, i) => ({
      id: `mine_${m.hex_id}_${i}`,
      name: m.name,
      type: m.label ?? m.commodity,
      color: MINE_COLORS[m.commodity]?.top ?? '#bfa98e',
      state: m.state,
      detail: '',
      mwSort: -1,
      sizeText: m.metric_label,
      x: m.x,
      y: m.y,
      hexId: m.hex_id,
      isPower: false,
    }));
    const sRows = visibleShale.map((s, i) => ({
      id: `shale_${s.hex_id}_${i}`,
      name: s.name,
      type: s.kind === 'oil' ? '致密油' : '页岩气',
      color: s.kind === 'oil' ? '#c4833d' : '#7896b8',
      state: s.state,
      detail: s.detail,
      mwSort: -2,
      sizeText: `${fmtCount3(s.area_km2)} km²`,
      x: s.x,
      y: s.y,
      hexId: s.hex_id,
      isPower: false,
    }));
    return [...pRows, ...mRows, ...sRows];
  }, [visiblePower, visibleMines, visibleShale, fuels]);

  const statePowerRows = useMemo(() => {
    return states
      .map((s) => {
        const tot = Object.values(s.power_mw_by_fuel).reduce((a, b) => a + b, 0);
        return {
          id: s.abbr,
          fips: s.fips,
          label: s.name,
          total: tot,
          totalText: fmtMw(tot),
          parts: s.power_mw_by_fuel,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [states]);

  const mappedPowerMw = useMemo(() => fuels.reduce((s, f) => s + f.mw, 0), [fuels]);
  const noPowerStates = useMemo(
    () => states.filter((s) => Object.values(s.power_mw_by_fuel).reduce((a, b) => a + b, 0) <= 0).map((s) => s.abbr),
    [states],
  );
  const rawShaleHexCount = useMemo(() => {
    let c = 0;
    for (let i = 0; i < world.n; i++) if (world.shale[i]) c++;
    return c;
  }, [world]);

  if (!layers) return null;

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: '入图大型装机', value: fmtMw(mappedPowerMw || meta.nation.power_mw), sub: `${layers.power_plants.length} 处门槛以上站点`, color: 'var(--y-power)' },
          { label: '大中型矿山', value: layers.mines.length.toLocaleString(), sub: '达到产能/规模门槛' },
          { label: '页岩油气带', value: (shaleSites.length || rawShaleHexCount).toLocaleString(), sub: shaleSites.length ? `${shaleOilCount} 致密油 · ${shaleGasCount} 页岩气格` : `${layers.shale_plays.length} 个油气盆地` },
        ]}
      />

      <CalloutNote>
        仅统计超过各品类入图门槛的大型电厂与区域集群，因此<b>并非</b>全美或各州全部发电装机（全美 EIA-860M 在运+备用 OP/SB 净夏季总装机为 <b>{fmtMw(meta.nation.power_all_mw ?? 1338000)}</b>）。油气盆地按抽稀地质单元展示，面积不可与 MW 相加。
      </CalloutNote>

      {/* 1. National Power Mix */}
      <div>
        <SectionTitle
          title="全美入图发电结构 · National Power Mix"
          kicker="MAPPED SITES ABOVE THRESHOLDS · EIA-860M"
          note="按净夏季装机 (Net Summer MW) 统计全部 9 类电源。点击任一条目可单选聚焦该电源，再点一次恢复全部。"
        />
        <ShareBar
          segments={fuels.map((f) => ({
            key: f.fuel,
            label: f.label,
            value: f.mw,
            color: f.color ?? FUEL_COLORS[f.fuel]?.fill ?? '#888',
            valueText: fmtMw(f.mw),
          }))}
          activeKey={enabledTypes?.size === 1 ? [...enabledTypes][0] : null}
          onSelect={soloPowerType}
        />
        <div className="mt-2">
          <LinkedBarList
            compact
            activeId={enabledTypes?.size === 1 ? [...enabledTypes][0] : null}
            rows={fuels.map((f) => ({
              id: f.fuel,
              label: f.label,
              sublabel: `${f.count} 处`,
              value: f.mw,
              valueText: fmtMw(f.mw),
              color: f.color ?? FUEL_COLORS[f.fuel]?.fill ?? '#d98a2b',
            }))}
            onClick={(r) => soloPowerType(r.id)}
          />
        </div>
      </div>

      {/* 2. Filter the Map */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="地图筛选器 · Filter the Map" note="点击开关资源类别（按住 Alt 点击仅看单一类别）；主地图压暗地形并以圆面积反映装机容量。" />
        <div className="flex flex-wrap gap-1">
          {ENERGY_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setEnabledTypes(new Set(g.types))}
              className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-semibold cursor-pointer"
            >
              {g.label}
            </button>
          ))}
          <button type="button" onClick={() => setEnabledTypes(null)} className="px-2 py-0.5 rounded bg-[var(--brass-soft)] text-[10px] font-semibold cursor-pointer" style={{ color: 'var(--brass-bright)' }}>
            全选
          </button>
          <button type="button" onClick={() => setEnabledTypes(new Set())} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] cursor-pointer">
            清空
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {fuels.map((f) => {
            const on = activeSet.has(f.fuel);
            return (
              <button
                key={f.fuel}
                type="button"
                onClick={(e) => toggleType(f.fuel, e.altKey)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                  on ? 'border-[var(--brass)] bg-[var(--brass-soft)]' : 'border-white/10 opacity-35'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: f.color ?? FUEL_COLORS[f.fuel]?.fill }} />
                {f.label} <span className="opacity-60 font-mono-num">{f.count}</span>
              </button>
            );
          })}
          {mineCatalog.map((m) => {
            const cnt = layers.mines.filter((x) => x.commodity === m.id).length;
            if (cnt === 0) return null;
            const on = activeSet.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={(e) => toggleType(m.id, e.altKey)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                  on ? 'border-white/35 bg-white/10' : 'border-white/10 opacity-35'
                }`}
              >
                <span className="w-2 h-2 rounded-sm" style={{ background: m.color }} />
                {m.label} <span className="opacity-60 font-mono-num">{cnt}</span>
              </button>
            );
          })}
          {SHALE_PLAY_META.map((sp) => {
            const cnt = sp.id === 'oil' ? shaleOilCount : shaleGasCount;
            if (cnt === 0) return null;
            const on = activeSet.has(sp.id);
            return (
              <button
                key={sp.id}
                type="button"
                onClick={(e) => toggleType(sp.id, e.altKey)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                  on ? 'border-white/35 bg-white/10' : 'border-white/10 opacity-35'
                }`}
              >
                <span className="w-2 h-2 rounded-sm" style={{ background: sp.color }} />
                {sp.label} <span className="opacity-60 font-mono-num">{cnt}</span>
              </button>
            );
          })}
        </div>

        {/* Minimum Capacity Slider */}
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-black/20 border border-[var(--border-hairline)]">
          <span className="text-[10.5px] opacity-75 shrink-0">最小装机门槛</span>
          <input
            type="range"
            min={0}
            max={3000}
            step={100}
            value={minMw}
            onChange={(e) => setMinMw(Number(e.target.value))}
            className="flex-1 accent-[var(--brass)] cursor-pointer"
          />
          <span className="font-mono-num text-[11px] font-bold w-20 text-right">
            {minMw > 0 ? `≥ ${minMw.toLocaleString()} MW` : '不限规模'}
          </span>
        </div>
        {minMw > 0 && (
          <p className="text-[10.5px] opacity-65 m-0">
            设置最小装机门槛时，矿山与页岩油气盆地会自动隐藏（其计量单位为员工人数、短吨/年或盆地面积，并非 MW）。
          </p>
        )}

        {selectedState && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-[var(--brass-soft)] border border-[var(--brass)] font-semibold">
              已筛州：{selectedState} · {siteRows.length} 处站点
            </span>
            <button
              type="button"
              onClick={() => { setSelectedState(null); setBrushed(null, null); }}
              className="underline text-[10.5px] cursor-pointer"
              style={{ color: 'var(--brass-bright)' }}
            >
              清除州筛选
            </button>
          </div>
        )}

        <SizeLegend
          caption="圆面积 = 净夏季装机"
          items={[250, 1000, 4000].map((v) => ({
            label: v >= 1000 ? `${v / 1000} GW` : `${v} MW`,
            r: 3.5 + Math.sqrt(v / maxSiteMw) * 14,
          }))}
        />
      </div>

      {/* 3. Searchable Sites Table */}
      <div className="pt-2 border-t border-[var(--border-hairline)]">
        <SectionTitle title="站点明细表 · Sites" note="全部通过筛选的电厂、矿山与页岩油气点位；悬停高亮地图气泡，点击飞镜定位。" />
        <SortableTable
          rows={siteRows}
          defaultSort="mwSort"
          searchPlaceholder="搜索电厂、矿山、油气带、州名..."
          searchText={(r) => `${r.name} ${r.type} ${r.state} ${r.detail}`}
          maxHeight={265}
          columns={[
            {
              key: 'name',
              label: '站点',
              align: 'l',
              value: (r) => r.name,
              render: (r) => (
                <span className="inline-flex items-center gap-1.5 max-w-[165px] truncate" title={r.detail || r.name}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className="truncate">{r.name}</span>
                </span>
              ),
            },
            { key: 'type', label: '类型', align: 'l', value: (r) => r.type },
            { key: 'state', label: '州', align: 'l', value: (r) => r.state },
            { key: 'mwSort', label: '规模', value: (r) => r.mwSort, render: (r) => r.sizeText },
          ]}
          onHover={(r) => {
            setHoveredBubbleId(r && r.isPower ? r.id : null);
            if (r && !r.isPower) setBrushed(new Set([r.hexId]), r.name);
            else if (!r) setBrushed(null, null);
          }}
          onClick={(r) => onFlyTo(r.x, r.y, 1.5)}
        />
      </div>

      {/* 4. Power by State (Stacked by 9 Fuels) */}
      <div className="pt-2 border-t border-[var(--border-hairline)]">
        <SectionTitle title="各州入图装机结构 · Power by State" note="点击任一州即可将整页站点与地图气泡过滤至该州，再次点击清除。" />
        <StackedBarList
          rows={statePowerRows}
          keys={fuels.map((f) => ({ key: f.fuel, label: f.label, color: f.color ?? FUEL_COLORS[f.fuel]?.fill ?? '#888' }))}
          activeId={selectedState}
          onHover={(abbr) => {
            if (!abbr) { setBrushed(null, null); return; }
            const s = states.find((x) => x.abbr === abbr);
            if (s) setBrushed(new Set(stateHexMap.get(s.fips) ?? []), s.name);
          }}
          onClick={(abbr) => setSelectedState(selectedState === abbr ? null : abbr)}
        />
        {noPowerStates.length > 0 && (
          <p className="text-[10.5px] opacity-65 mt-1.5 mb-0">
            无达到入图门槛大型电站的州/特区：{noPowerStates.join('、')}。
          </p>
        )}
      </div>

      {/* 5. What the Symbols Mean */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle title="图例与入图门槛说明 · What the Symbols Mean" note="每类能源、矿山与油气带的入图规模门槛、计量单位与官方数据出处。" />
          <button
            type="button"
            onClick={() => setShowExplainer((v) => !v)}
            className="text-[10.5px] font-bold underline cursor-pointer shrink-0"
            style={{ color: 'var(--brass-bright)' }}
          >
            {showExplainer ? '收起 ▴' : '展开 ▾'}
          </button>
        </div>
        {showExplainer && (
          <div className="space-y-1.5 text-[10.5px] opacity-85">
            {fuels.map((f) => (
              <div key={f.fuel} className="flex items-start gap-2">
                <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: f.color ?? FUEL_COLORS[f.fuel]?.fill }} />
                <div><b>{f.label}</b> <span className="opacity-65 font-mono-num">({f.count} 处 · {fmtMw(f.mw)})</span>：{f.rule}</div>
              </div>
            ))}
            {mineCatalog.map((m) => {
              const mItems = layers.mines.filter((x) => x.commodity === m.id);
              const mSum = mItems.reduce((acc, x) => acc + x.metric, 0);
              return (
                <div key={m.id} className="flex items-start gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm mt-1 shrink-0" style={{ background: m.color }} />
                  <div><b>{m.label}</b> <span className="opacity-65 font-mono-num">({mItems.length} 处 · {fmtCount3(mSum)} {m.unit})</span>：{m.rule}</div>
                </div>
              );
            })}
            {SHALE_PLAY_META.map((sp) => {
              const cnt = sp.id === 'oil' ? shaleOilCount : shaleGasCount;
              return (
                <div key={sp.id} className="flex items-start gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm mt-1 shrink-0" style={{ background: sp.color }} />
                  <div><b>{sp.label}</b> <span className="opacity-65 font-mono-num">({cnt} 格 · 面积不可相加)</span>：{sp.rule}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['eia_860m', 'eia_coal', 'msha_mines', 'eia_shale_plays']}
        notes={[
          '仅统计超过各品类门槛的在运/备用（OP/SB；核电仅计在运 OP 反应堆）大型站点（如燃气 ≥1,500 MW、燃煤 ≥1,000 MW、水电 ≥250 MW、抽蓄 ≥1,000 MW、风/光 ≥500 MW、储能 ≥400 MW、地热 ≥100 MW），因此并非各州或全国总发电装机。',
          '装机口径为净夏季装机容量（Net Summer Capacity MW），不等于实际发电量：同等 1,000 MW 的光伏电站年发电量远低于基荷运行的核电站。',
          '风电、光伏、储能集群与同矿种金属矿按统一等面积 25 km 半径区域（1,624 km²，≥50 MW 公用事业级场站参与风/光/储聚类）汇总，跨州分报的胡佛大坝合并为 1 处，近海风电落至最近美国沿海陆地格。',
          '矿山按员工人数（MSHA）或煤炭年产量（EIA）衡量，油气盆地按 1/4 抽稀地质单元与盆地面积展示，计量单位不同不可与 MW 相加；电站归属按运营方申报州统计。',
        ]}
      />
    </div>
  );
};

/* ============================================================================
 * 2. ECONOMY ADVISOR (All 20 BEA industries, GDP bubbles, Leaders, 20-ind LQ, Growth vs Output)
 * ============================================================================ */
export const EconomyView: React.FC<AdvisorViewProps> = ({ meta, cities, states, stateHexMap }) => {
  const { openCity, setBrushed, setAdvisorVisuals, setHoveredBubbleId, setLens } = useAppStore();
  const [showBubbles, setShowBubbles] = useState(true);
  const [leaderTab, setLeaderTab] = useState<'gdp' | 'gdp_pc' | 'growth'>('gdp');
  const [specInd, setSpecInd] = useState<string>('manufacturing');
  const [scatterColor, setScatterColor] = useState<'lq' | 'unemployment' | 'income' | 'none'>('lq');
  const [scatterAll, setScatterAll] = useState(false);
  const [brushedIds, setBrushedIds] = useState<Set<string> | null>(null);

  const n = meta.nation;
  const gdpSectors = n.gdp_by_industry ?? [];
  const usJobs = n.jobs ?? {};
  const usEmployed = n.employed || 167279529;
  const indLabels = n.industry_labels ?? {};
  const jobIndKeys = useMemo(() => Object.keys(usJobs), [usJobs]);

  const bigCities = useMemo(() => cities.filter((c) => c.pop >= 250000), [cities]);
  const maxCityGdp = useMemo(() => Math.max(1, ...cities.map((c) => c.gdp_musd ?? 0)), [cities]);

  // Sync proportional metro GDP bubbles colored by GDP per person
  useEffect(() => {
    setLens(null);
    if (!showBubbles) {
      setAdvisorVisuals(null, false);
      return;
    }
    const bubbles: MapBubbleSpec[] = cities
      .filter((c) => (c.gdp_musd ?? 0) > 2000)
      .slice(0, 260)
      .map((c) => {
        const pc = c.gdp_per_cap ?? 60000;
        const rgb = sampleRamp('wealth', (pc - 35000) / 90000);
        return {
          id: `econ_${c.id}`,
          label: `${c.short_name}, ${c.state_abbr}`,
          sublabel: `${fmtMoney3((c.gdp_musd ?? 0) * 1e6)} · 人均 ${fmtMoney3(pc)}`,
          x: c.x,
          y: c.y,
          radiusPx: 3.0 + Math.sqrt((c.gdp_musd ?? 0) / maxCityGdp) * 26,
          color: `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`,
          stroke: '#FFF4D4',
        };
      });
    setAdvisorVisuals(bubbles, true);
    return () => setHoveredBubbleId(null);
  }, [showBubbles, cities, maxCityGdp, setAdvisorVisuals, setLens, setHoveredBubbleId]);

  const lqOf = (c: CityRecord, indKey: string): number | null => {
    const usShare = (usJobs[indKey] ?? 0) / usEmployed;
    const emp = c.employed ?? 0;
    const cj = c.jobs?.[indKey] ?? 0;
    if (usShare <= 0 || emp <= 0) return null;
    return (cj / emp) / usShare;
  };

  const specRows = useMemo(() => {
    return bigCities
      .map((c) => {
        const lq = lqOf(c, specInd);
        const workers = c.jobs?.[specInd] ?? 0;
        const share = c.employed && c.employed > 0 ? workers / c.employed : null;
        return { id: c.id, city: c, name: c.short_name, sub: c.state_abbr, share, lq, workers };
      })
      .filter((r) => r.lq !== null)
      .sort((a, b) => (b.lq ?? 0) - (a.lq ?? 0));
  }, [bigCities, specInd, usJobs, usEmployed]);

  const maxSpecLq = useMemo(() => Math.max(2, ...specRows.slice(0, 30).map((r) => r.lq ?? 0)), [specRows]);

  const scatterPts = useMemo<ScatterPoint[]>(() => {
    const list = scatterAll ? cities : bigCities;
    return list
      .filter((c) => (c.gdp_per_cap ?? 0) > 0 && c.pop_growth_pct != null)
      .map((c) => {
        let color = '#e0b54c';
        let extra = '';
        if (scatterColor === 'lq') {
          const lq = lqOf(c, specInd) ?? 1;
          const rgb = sampleRamp('knowledge', (Math.log10(Math.max(0.25, lq)) - Math.log10(0.3)) / (Math.log10(3.2) - Math.log10(0.3)));
          color = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
          extra = `LQ ×${lq.toFixed(2)}`;
        } else if (scatterColor === 'unemployment') {
          const u = c.unemployment ?? 0.048;
          const rgb = sampleRamp('risk', (u - 0.025) / 0.065);
          color = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
          extra = `失业率 ${(u * 100).toFixed(1)}%`;
        } else if (scatterColor === 'income') {
          const inc = c.median_income ?? 75000;
          const rgb = sampleRamp('wealth', (inc - 48000) / 72000);
          color = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
          extra = `收入 ${fmtMoney3(inc)}`;
        }
        return {
          id: c.id,
          label: c.short_name,
          sub: c.state_abbr,
          x: c.gdp_per_cap!,
          y: c.pop_growth_pct!,
          r: c.pop,
          color,
          hexIds: c.hex_ids,
          fly: [c.x, c.y],
          extraTip: extra,
        };
      });
  }, [cities, bigCities, scatterAll, scatterColor, specInd]);

  const topLabelIds = useMemo(() => new Set(cities.slice(0, 8).map((c) => c.id)), [cities]);

  const brushedSummary = useMemo(() => {
    if (!brushedIds || brushedIds.size === 0) return null;
    const sel = cities.filter((c) => brushedIds.has(c.id));
    const pop = sel.reduce((a, c) => a + c.pop, 0);
    const gdp = sel.reduce((a, c) => a + (c.gdp_musd ?? 0), 0);
    return { count: sel.length, pop, gdp, pctUs: (gdp / n.gdp_musd) * 100 };
  }, [brushedIds, cities, n.gdp_musd]);

  const topInd = gdpSectors[0];
  const usSpecShare = (usJobs[specInd] ?? 0) / usEmployed;

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: 'GDP 2024', value: fmtMoney3(n.gdp_musd * 1e6), sub: 'BEA 现价美元', color: 'var(--y-gold)' },
          { label: '全美人均 GDP', value: fmtMoney3(n.gdp_per_cap), sub: 'GDP ÷ 常住人口' },
          { label: '第一大行业', value: topInd?.name ?? '房地产', sub: topInd ? `占 GDP ${((topInd.musd / n.gdp_musd) * 100).toFixed(1)}%` : '' },
        ]}
      />

      {/* 1. All 20 BEA Industries */}
      <div>
        <SectionTitle
          title="各行业增加值 · GDP by Industry"
          kicker="UNITED STATES · BEA CAGDP2 2024 (20 行业全量口径)"
          note="悬停任一行业即可高亮全美该行业 GDP 占比最高的 8 个州；点击直接下钻至下方专业化都会区榜。"
        />
        <LinkedBarList
          compact
          activeId={specInd === 'public_admin' ? 'government' : specInd}
          rows={gdpSectors.map((sec) => ({
            id: sec.key,
            label: sec.name,
            sublabel: `${((sec.musd / n.gdp_musd) * 100).toFixed(1)}%`,
            value: sec.musd,
            valueText: fmtMoney3(sec.musd * 1e6),
            color: '#d4ae5e',
          }))}
          onHover={(key) => {
            if (!key) { setBrushed(null, null); return; }
            const top8 = [...states]
              .map((s) => {
                const sv = s.gdp_by_sector.find((x) => x.key === key)?.musd ?? 0;
                return { fips: s.fips, share: s.gdp_musd > 0 ? sv / s.gdp_musd : 0 };
              })
              .sort((a, b) => b.share - a.share)
              .slice(0, 8);
            const hids = new Set<number>();
            for (const st of top8) for (const h of stateHexMap.get(st.fips) ?? []) hids.add(h);
            setBrushed(hids, indLabels[key] ?? key);
          }}
          onClick={(r) => setSpecInd(r.id === 'government' ? 'public_admin' : r.id)}
        />
      </div>

      {/* 2. Metro GDP Circles Legend */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="地图都会区经济圈 · Metro Economies on the Map" note="圆面积 = 都会区 GDP 总量，颜色 = 人均 GDP；悬停地图气泡查看数值，点击进入城市视图。" />
        <label className="inline-flex items-center gap-2 text-[11px] cursor-pointer">
          <input type="checkbox" checked={showBubbles} onChange={(e) => setShowBubbles(e.target.checked)} className="accent-[var(--brass)]" />
          显示都会区 GDP 比例气泡
        </label>
        <RampLegend ramp="wealth" title="气泡颜色：人均 GDP" minLabel="$35K" maxLabel="$125K+" />
        <SizeLegend
          caption="圆面积 = GDP 总量"
          items={[10e3, 100e3, 1000e3].map((v) => ({
            label: v >= 1e6 ? '$1T' : `$${v / 1000}B`,
            r: 3 + Math.sqrt(v / maxCityGdp) * 16,
          }))}
        />
      </div>

      {/* 3. Leading Metros Table */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="头部都会区 · Leading Metros" note="人均 GDP 与增长排行仅含 25 万+ 人口都会区（规避单一矿场/工厂导致的极值波动）。" />
        <Segmented
          value={leaderTab}
          options={[
            { value: 'gdp', label: 'GDP 总量' },
            { value: 'gdp_pc', label: '人均 GDP (250K+)' },
            { value: 'growth', label: '增长最快 (250K+)' },
          ]}
          onChange={(v) => setLeaderTab(v as 'gdp' | 'gdp_pc' | 'growth')}
        />
        <SortableTable
          key={leaderTab}
          rows={(leaderTab === 'gdp' ? cities : bigCities).map((c) => ({ ...c }))}
          defaultSort={leaderTab === 'gdp' ? 'gdp_musd' : leaderTab === 'gdp_pc' ? 'gdp_per_cap' : 'pop_growth_pct'}
          searchPlaceholder="搜索都会区..."
          searchText={(c) => `${c.short_name} ${c.state_abbr}`}
          maxHeight={240}
          columns={[
            {
              key: 'short_name',
              label: '都会区',
              align: 'l',
              value: (c) => c.short_name,
              render: (c) => <span>{c.short_name} <span className="opacity-50 text-[10px]">{c.state_abbr}</span></span>,
            },
            {
              key: 'gdp_musd',
              label: 'GDP',
              value: (c) => c.gdp_musd,
              render: (c) => fmtMoney3((c.gdp_musd ?? 0) * 1e6),
              barMax: maxCityGdp,
              barColor: 'rgba(224,181,76,0.3)',
            },
            { key: 'gdp_per_cap', label: '人均', value: (c) => c.gdp_per_cap, render: (c) => fmtMoney3(c.gdp_per_cap) },
            {
              key: 'pop_growth_pct',
              label: '增速',
              value: (c) => c.pop_growth_pct,
              render: (c) => (
                <span className={(c.pop_growth_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {fmtSignedPct(c.pop_growth_pct)}
                </span>
              ),
            },
          ]}
          onHover={(c) => {
            setHoveredBubbleId(c ? `econ_${c.id}` : null);
            setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name);
          }}
          onClick={(c) => openCity(c.id)}
        />
      </div>

      {/* 4. Who Specialises in What (All 20 ACS C24030 Industries!) */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle
          title="产业专业化 · Who Specialises in What"
          note="区位商 (LQ) = 都会区该行业就业占比 ÷ 全美占比（×2 表示集中度为全美两倍，25 万+ 人口都会区）。"
        />
        <select
          value={specInd}
          onChange={(e) => setSpecInd(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] outline-none cursor-pointer"
        >
          {jobIndKeys.map((k) => (
            <option key={k} value={k}>{indLabels[k] ?? k}</option>
          ))}
        </select>
        <div className="text-[10.5px] opacity-75">
          全美基准：<b>{(usSpecShare * 100).toFixed(1)}%</b> 就业人口（{fmtCount3(usJobs[specInd])} 人）从事{indLabels[specInd] ?? specInd}。
        </div>
        <SortableTable
          rows={specRows}
          defaultSort="lq"
          maxHeight={230}
          columns={[
            {
              key: 'name',
              label: '都会区',
              align: 'l',
              value: (r) => r.name,
              render: (r) => <span>{r.name} <span className="opacity-50 text-[10px]">{r.sub}</span></span>,
            },
            { key: 'share', label: '占比', value: (r) => r.share, render: (r) => r.share != null ? `${(r.share * 100).toFixed(1)}%` : '–' },
            {
              key: 'lq',
              label: 'LQ',
              value: (r) => r.lq,
              render: (r) => r.lq != null ? `×${r.lq.toFixed(2)}` : '–',
              barMax: maxSpecLq,
              barColor: 'rgba(74,134,214,0.38)',
            },
            { key: 'workers', label: '就业人数', value: (r) => r.workers, render: (r) => fmtCount3(r.workers) },
          ]}
          onHover={(r) => {
            setHoveredBubbleId(r ? `econ_${r.id}` : null);
            setBrushed(r ? new Set(r.city.hex_ids) : null, r?.name);
          }}
          onClick={(r) => openCity(r.id)}
        />
      </div>

      {/* 5. Growth vs Output Brushable Scatter */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="增长 vs 产出 · Growth vs Output" note="横轴人均 GDP（对数），纵轴 2021–2025 人口增速，气泡大小 = 人口。拖拽框选任意都会区群同步高亮地图！" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <select
            value={scatterColor}
            onChange={(e) => setScatterColor(e.target.value as 'lq' | 'unemployment' | 'income' | 'none')}
            className="px-2 py-1 rounded-lg text-[11px] border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)] outline-none cursor-pointer"
          >
            <option value="lq">着色：当前行业专业化 (LQ)</option>
            <option value="unemployment">着色：失业率</option>
            <option value="income">着色：家庭中位收入</option>
            <option value="none">无着色</option>
          </select>
          <Segmented
            value={scatterAll ? 'all' : 'big'}
            options={[{ value: 'big', label: '250K+' }, { value: 'all', label: `全部 ${cities.length} 城` }]}
            onChange={(v) => setScatterAll(v === 'all')}
          />
        </div>
        <BrushScatter
          points={scatterPts}
          xLabel="人均 GDP"
          yLabel="人口增速"
          xFmt="usd"
          yFmt="pct"
          logX
          height={235}
          refY={[{ v: n.growth ?? 0.0292, label: `全美 ${fmtSignedPct(n.growth ?? 0.0292)}` }]}
          labelIds={topLabelIds}
          selectedIds={brushedIds}
          onHoverPoint={(p) => {
            setHoveredBubbleId(p ? `econ_${p.id}` : null);
            setBrushed(p?.hexIds ? new Set(p.hexIds) : null, p?.label);
          }}
          onClickPoint={(p) => openCity(p.id)}
          onBrush={(set) => {
            setBrushedIds(set);
            if (!set) { setBrushed(null, null); return; }
            const hids = new Set<number>();
            for (const c of cities) if (set.has(c.id)) for (const h of c.hex_ids) hids.add(h);
            setBrushed(hids, `已框选 ${set.size} 个都会区`);
          }}
        />
        {brushedSummary && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--brass-soft)] border border-[var(--brass)] text-[10.5px]">
            <span>
              已框选 <b>{brushedSummary.count}</b> 城 · {fmtCount3(brushedSummary.pop)} 人 · GDP {fmtMoney3(brushedSummary.gdp * 1e6)} ({brushedSummary.pctUs.toFixed(1)}% 全美)
            </span>
            <button type="button" onClick={() => { setBrushedIds(null); setBrushed(null, null); }} className="underline font-bold cursor-pointer">
              清除
            </button>
          </div>
        )}
      </div>

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['bea_gdp', 'acs_1yr', 'pep_population', 'cbsa_delineation']}
        notes={[
          'GDP 按工作发生地统计（BEA CAGDP2 2024），而就业与产业专业化（LQ）按劳动者居住地统计（ACS 2025 1-Yr C24030），因此通勤卫星城的居民计入其居住都会区。',
          '人均 GDP 以 BEA 2024 年现价 GDP 除以 ACS 2025 年 1-Yr 常住人口计算，两套官方数据相差一个日历年。',
          '都会区 GDP 为 OMB 2023 边界内全部成员县 GDP 之和；弗吉尼亚州 23 个县+独立市合并统计区（BEA 519xx）已按官方规则完整纳入并按人口分摊跨都会区边界。',
        ]}
      />
    </div>
  );
};

/* ============================================================================
 * 3. PROSPERITY & HOUSING ADVISOR (3x/5x/8x log-log scatter, Affordability table, Poverty, Rent Hi/Lo, Unemployment)
 * ============================================================================ */
export const ProsperityView: React.FC<AdvisorViewProps> = ({ meta, cities, states, counties, stateHexMap, onFlyTo }) => {
  const { setLens, setBrushed, openCity, openState, setAdvisorVisuals } = useAppStore();
  const [affLevel, setAffLevel] = useState<'counties' | 'metros'>('counties');
  const [uLevel, setULevel] = useState<'states' | 'metros'>('states');
  const [brushedIds, setBrushedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    setAdvisorVisuals(null, false);
    setLens('home');
  }, [setAdvisorVisuals, setLens]);

  const n = meta.nation;
  const usHome = n.home_value ?? 371100;
  const usInc = n.median_income || 84780;

  const affItems = useMemo(() => {
    if (affLevel === 'counties' && counties) {
      return counties.rows
        .filter((r) => typeof r.income === 'number' && typeof r.home === 'number' && (r.income as number) > 0 && (r.home as number) > 0)
        .map((r) => {
          const inc = r.income as number;
          const home = r.home as number;
          return {
            id: r.fips,
            name: r.name,
            sub: r.state,
            pop: Number(r.pop ?? 0),
            inc,
            home,
            ratio: home / inc,
            hexIds: r.hex_ids,
            fly: [r.x, r.y] as [number, number],
          };
        });
    }
    return cities
      .filter((c) => (c.median_income ?? 0) > 0 && (c.median_home ?? 0) > 0)
      .map((c) => ({
        id: c.id,
        name: c.short_name,
        sub: c.state_abbr,
        pop: c.pop,
        inc: c.median_income!,
        home: c.median_home!,
        ratio: c.median_home! / c.median_income!,
        hexIds: c.hex_ids,
        fly: [c.x, c.y] as [number, number],
      }));
  }, [affLevel, counties, cities]);

  const ratioColorHex = (ratio: number) => {
    const rgb = sampleRamp('risk', (ratio - 2) / 8);
    return `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
  };

  const affScatterPts = useMemo<ScatterPoint[]>(() => {
    return affItems.map((it) => ({
      id: it.id,
      label: it.name,
      sub: it.sub,
      x: it.inc,
      y: it.home,
      r: it.pop,
      color: ratioColorHex(it.ratio),
      hexIds: it.hexIds,
      fly: it.fly,
      extraTip: `房价收入比 ×${it.ratio.toFixed(1)}`,
    }));
  }, [affItems]);

  const affTopLabels = useMemo(
    () => new Set([...affItems].sort((a, b) => b.pop - a.pop).slice(0, 6).map((x) => x.id)),
    [affItems],
  );

  // Weighted U.S. poverty rate
  const usPov = useMemo(() => {
    if (!counties) return 0.124;
    let a = 0, w = 0;
    for (const r of counties.rows) {
      if (typeof r.poverty === 'number' && typeof r.pop === 'number') {
        a += (r.poverty as number) * (r.pop as number);
        w += r.pop as number;
      }
    }
    return w > 0 ? a / w : 0.124;
  }, [counties]);

  const rentHi = useMemo(
    () => cities.filter((c) => c.pop >= 250000 && c.rent_burden != null).sort((a, b) => (b.rent_burden ?? 0) - (a.rent_burden ?? 0)).slice(0, 10),
    [cities],
  );
  const rentLo = useMemo(
    () => cities.filter((c) => c.pop >= 250000 && c.rent_burden != null).sort((a, b) => (a.rent_burden ?? 0) - (b.rent_burden ?? 0)).slice(0, 5),
    [cities],
  );
  const maxRentB = Math.max(0.32, ...(rentHi.map((c) => c.rent_burden ?? 0)));

  const unempLists = useMemo(() => {
    const usU = n.unemployment ?? 0.0488;
    if (uLevel === 'states') {
      const valid = states.filter((s) => s.unemployment != null);
      const hi = [...valid].sort((a, b) => (b.unemployment ?? 0) - (a.unemployment ?? 0)).slice(0, 8);
      const lo = [...valid].sort((a, b) => (a.unemployment ?? 0) - (b.unemployment ?? 0)).slice(0, 8);
      const max = Math.max(0.08, ...(hi.map((x) => x.unemployment ?? 0)));
      return {
        max,
        hi: hi.map((s) => ({ id: s.fips, label: s.name, value: s.unemployment!, valueText: `${(s.unemployment! * 100).toFixed(1)}%`, color: '#e8774a', tone: s.unemployment! > usU * 1.03 ? ('bad' as const) : undefined })),
        lo: lo.map((s) => ({ id: s.fips, label: s.name, value: s.unemployment!, valueText: `${(s.unemployment! * 100).toFixed(1)}%`, color: '#58c998', tone: s.unemployment! < usU * 0.97 ? ('good' as const) : undefined })),
      };
    }
    const valid = cities.filter((c) => c.pop >= 500000 && c.unemployment != null);
    const hi = [...valid].sort((a, b) => (b.unemployment ?? 0) - (a.unemployment ?? 0)).slice(0, 8);
    const lo = [...valid].sort((a, b) => (a.unemployment ?? 0) - (b.unemployment ?? 0)).slice(0, 8);
    const max = Math.max(0.08, ...(hi.map((x) => x.unemployment ?? 0)));
    return {
      max,
      hi: hi.map((c) => ({ id: c.id, label: c.short_name, sublabel: c.state_abbr, value: c.unemployment!, valueText: `${(c.unemployment! * 100).toFixed(1)}%`, color: '#e8774a', tone: 'bad' as const })),
      lo: lo.map((c) => ({ id: c.id, label: c.short_name, sublabel: c.state_abbr, value: c.unemployment!, valueText: `${(c.unemployment! * 100).toFixed(1)}%`, color: '#58c998', tone: 'good' as const })),
    };
  }, [uLevel, states, cities, n.unemployment]);

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: '家庭中位收入', value: `$${usInc.toLocaleString()}`, sub: 'ACS 2025 1-Yr', color: '#58C998' },
          { label: '房价中位数', value: fmtMoney3(usHome), sub: `${(usHome / usInc).toFixed(1)}× 家庭年收入` },
          { label: '全美失业率', value: `${((n.unemployment ?? 0.0488) * 100).toFixed(1)}%`, sub: 'ACS 2025 B23025' },
        ]}
      />

      {/* 1. What a Home Costs */}
      <div className="space-y-2">
        <SectionTitle
          title="一套房子值几年收入 · What a Home Costs"
          note="双对数散点图：横轴家庭中位收入，纵轴房价中位数；金色虚线标出 3×、5×、8× 收入负担线。支持拖拽框选！"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            value={affLevel}
            options={[{ value: 'counties', label: '县 (Counties)' }, { value: 'metros', label: '都会区 (Metros)' }]}
            onChange={(v) => { setAffLevel(v as 'counties' | 'metros'); setBrushedIds(null); setBrushed(null, null); }}
          />
          <div className="flex gap-1">
            <button type="button" onClick={() => setLens('income')} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-semibold cursor-pointer">收入视角</button>
            <button type="button" onClick={() => setLens('home')} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-semibold cursor-pointer">房价视角</button>
          </div>
        </div>
        <BrushScatter
          points={affScatterPts}
          xLabel="家庭中位收入"
          yLabel="房价中位数"
          xFmt="usd"
          yFmt="usd"
          logX
          logY
          height={240}
          slopeLines={[{ slope: 3, label: '3×' }, { slope: 5, label: '5×' }, { slope: 8, label: '8×' }]}
          labelIds={affTopLabels}
          selectedIds={brushedIds}
          onHoverPoint={(p) => setBrushed(p?.hexIds ? new Set(p.hexIds) : null, p?.label)}
          onClickPoint={(p) => { if (affLevel === 'metros') openCity(p.id); else if (p.fly) onFlyTo(p.fly[0], p.fly[1], 1.4); }}
          onBrush={(set) => {
            setBrushedIds(set);
            if (!set) { setBrushed(null, null); return; }
            const hids = new Set<number>();
            for (const it of affItems) if (set.has(it.id)) for (const h of it.hexIds) hids.add(h);
            setBrushed(hids, `已框选 ${set.size} 个地区`);
          }}
        />
        <RampLegend ramp="risk" title="房价 ÷ 收入倍数" minLabel="×2" maxLabel="×10+" />
        <SortableTable
          rows={brushedIds ? affItems.filter((x) => brushedIds.has(x.id)) : affItems}
          defaultSort="ratio"
          searchPlaceholder="搜索房价负担地区..."
          searchText={(r) => `${r.name} ${r.sub}`}
          maxHeight={220}
          columns={[
            {
              key: 'name',
              label: '地区',
              align: 'l',
              value: (r) => r.name,
              render: (r) => <span>{r.name} <span className="opacity-50 text-[10px]">{r.sub}</span></span>,
            },
            { key: 'inc', label: '收入', value: (r) => r.inc, render: (r) => fmtMoney3(r.inc) },
            { key: 'home', label: '房价', value: (r) => r.home, render: (r) => fmtMoney3(r.home) },
            {
              key: 'ratio',
              label: '倍数',
              value: (r) => r.ratio,
              render: (r) => (
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: ratioColorHex(r.ratio) }} />
                  ×{r.ratio.toFixed(1)}
                </span>
              ),
            },
          ]}
          onHover={(r) => setBrushed(r ? new Set(r.hexIds) : null, r?.name)}
          onClick={(r) => (affLevel === 'metros' ? openCity(r.id) : onFlyTo(r.fly[0], r.fly[1], 1.4))}
        />
      </div>

      {/* 2. Poverty */}
      {counties && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <div className="flex items-start justify-between gap-2">
            <SectionTitle title="贫困率分布 · Poverty" note="各县低于联邦贫困线人口占比；悬停直方柱勾勒对应县区。" />
            <button type="button" onClick={() => setLens('poverty')} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-semibold cursor-pointer shrink-0 mt-1">
              贫困率视角
            </button>
          </div>
          <InteractiveHistogram
            values={counties.rows.filter((r) => typeof r.poverty === 'number').map((r) => ({ val: r.poverty as number, pop: Number(r.pop ?? 0), hexIds: r.hex_ids }))}
            bins={30}
            domain={[0, 0.45]}
            marker={{ value: usPov, label: `全美 ${(usPov * 100).toFixed(1)}%` }}
            fmt="pct"
            ramp="risk"
            onHoverRange={(hids, lbl) => setBrushed(hids, lbl)}
          />
          <SortableTable
            rows={counties.rows.filter((r) => typeof r.poverty === 'number').map((r) => ({ id: r.fips, row: r, name: r.name, sub: r.state, pop: Number(r.pop ?? 0), pov: r.poverty as number, inc: Number(r.income ?? 0) }))}
            defaultSort="pov"
            searchPlaceholder="搜索贫困率县区..."
            searchText={(r) => `${r.name} ${r.sub}`}
            maxHeight={210}
            columns={[
              { key: 'name', label: '县区', align: 'l', value: (r) => r.name, render: (r) => <span>{r.name} <span className="opacity-50 text-[10px]">{r.sub}</span></span> },
              { key: 'pop', label: '人口', value: (r) => r.pop, render: (r) => fmtCount3(r.pop) },
              { key: 'pov', label: '贫困率', value: (r) => r.pov, render: (r) => `${(r.pov * 100).toFixed(1)}%`, barMax: 0.5, barColor: 'rgba(232,119,74,0.35)' },
              { key: 'inc', label: '收入', value: (r) => r.inc, render: (r) => fmtMoney3(r.inc) },
            ]}
            onHover={(r) => setBrushed(r ? new Set(r.row.hex_ids) : null, r?.name)}
            onClick={(r) => onFlyTo(r.row.x, r.row.y, 1.4)}
          />
        </div>
      )}

      {/* 3. Rent Burden (Heaviest 10 + Lightest 5) */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="都会区房租负担 · Rent Burden by Metro" note="月租金中位数 × 12 ÷ 家庭中位年收入（25 万+ 人口都会区）。" />
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">房租负担最重 Top 10 · Heaviest</div>
        <LinkedBarList
          compact
          maxVal={maxRentB}
          rows={rentHi.map((c) => ({
            id: c.id,
            label: `${c.short_name}, ${c.state_abbr}`,
            sublabel: `$${c.median_rent?.toLocaleString()}/月`,
            value: c.rent_burden!,
            valueText: `${(c.rent_burden! * 100).toFixed(1)}%`,
            color: '#e89d54',
          }))}
          onHover={(id) => { const c = cities.find((x) => x.id === id); setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name); }}
          onClick={(r) => openCity(r.id)}
        />
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 pt-1">房租负担最轻 Top 5 · Lightest</div>
        <LinkedBarList
          compact
          maxVal={maxRentB}
          rows={rentLo.map((c) => ({
            id: c.id,
            label: `${c.short_name}, ${c.state_abbr}`,
            sublabel: `$${c.median_rent?.toLocaleString()}/月`,
            value: c.rent_burden!,
            valueText: `${(c.rent_burden! * 100).toFixed(1)}%`,
            color: '#58c998',
          }))}
          onHover={(id) => { const c = cities.find((x) => x.id === id); setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name); }}
          onClick={(r) => openCity(r.id)}
        />
      </div>

      {/* 4. Unemployment (States vs 500K+ Large Metros) */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="失业率排行 · Unemployment" note="失业人数 ÷ 平民劳动力总数（ACS 2025 1-Yr B23025；都会区口径为 50 万+ 人口大都会）。" />
        <Segmented
          value={uLevel}
          options={[{ value: 'states', label: '各州 (States)' }, { value: 'metros', label: '大型都会区 (500K+)' }]}
          onChange={(v) => setULevel(v as 'states' | 'metros')}
        />
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">最高 Top 8 · Highest</div>
        <LinkedBarList
          compact
          maxVal={unempLists.max}
          rows={unempLists.hi}
          onHover={(id) => {
            if (!id) { setBrushed(null, null); return; }
            if (uLevel === 'states') setBrushed(new Set(stateHexMap.get(id) ?? []), id);
            else { const c = cities.find((x) => x.id === id); setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name); }
          }}
          onClick={(r) => (uLevel === 'states' ? openState(r.id) : openCity(r.id))}
        />
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 pt-1">最低 Top 8 · Lowest</div>
        <LinkedBarList
          compact
          maxVal={unempLists.max}
          rows={unempLists.lo}
          onHover={(id) => {
            if (!id) { setBrushed(null, null); return; }
            if (uLevel === 'states') setBrushed(new Set(stateHexMap.get(id) ?? []), id);
            else { const c = cities.find((x) => x.id === id); setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name); }
          }}
          onClick={(r) => (uLevel === 'states' ? openState(r.id) : openCity(r.id))}
        />
      </div>

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['acs_1yr', 'acs_5yr']}
        notes={[
          '全国、州级与都会区指标采用 ACS 2025 1-Yr 最新年度数据；县级指标采用 ACS 5-Yr（五年合并样本），在房价快速上涨地区通常略低于最新 1 年期读数。',
          '房价中位数来自 ACS 自有住房户主对房产市值的自我评估，并非挂牌成交价中位数。',
          '房租收入比（月租中位数 × 12 ÷ 家庭中位收入）属于两个中位数之比：由于租房群体收入通常低于全社会中位家庭，租户实际租金压力高于此比值。',
          '联邦官方贫困线全美统一划定，未根据各地区物价与居住成本进行差异化调整。',
        ]}
      />
    </div>
  );
};

/* ============================================================================
 * 4. COMMERCE ADVISOR (FAF5 $19.8T current $, Mode Filter, Route Detail, State Zones, Stacked Ports, Pax/Cargo Airports)
 * ============================================================================ */
const TRADE_MODE_COLORS: Record<string, string> = {
  truck: '#d9a457',
  rail: '#a3acb8',
  water: '#4f9ad6',
  air: '#c9a0e0',
  multiple: '#8fcbb8',
  pipeline: '#b0703e',
  other: '#9a9aa8',
};
const TRADE_MODE_NAMES: Record<string, string> = {
  truck: '公路货运',
  rail: '铁路',
  water: '水运',
  air: '航空',
  multiple: '多式联运',
  pipeline: '管道',
  other: '其他',
};

export const CommerceView: React.FC<AdvisorViewProps> = ({ meta, cities, layers, stateHexMap, onFlyTo }) => {
  const { setLayer, setLens, setBrushed, setAdvisorVisuals, setHoveredBubbleId } = useAppStore();
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [airTab, setAirTab] = useState<'pax' | 'cargo'>('pax');
  const [mapShow, setMapShow] = useState<'both' | 'ports' | 'air' | 'none'>('both');
  const [showNetwork, setShowNetwork] = useState(false);

  const cityById = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities]);

  useEffect(() => {
    setLens(null);
    setLayer('trade', true);
    setLayer('hubs', true);
  }, [setLens, setLayer]);

  const topPort = layers?.ports[0];
  const topAir = layers?.airports[0];

  // Sync proportional Port (blue) + Airport (gold) bubbles on the map!
  useEffect(() => {
    if (!layers) return;
    if (mapShow === 'none') {
      setAdvisorVisuals(null, false);
      return;
    }
    const bubbles: MapBubbleSpec[] = [];
    if (mapShow === 'both' || mapShow === 'ports') {
      const pMax = Math.max(1, ...layers.ports.map((p) => p.tons));
      for (const p of layers.ports) {
        bubbles.push({
          id: `port_${p.name}`,
          label: p.name,
          sublabel: `${fmtCount3(p.tons)} 吨`,
          x: p.x,
          y: p.y,
          radiusPx: 3 + Math.sqrt(p.tons / pMax) * 16,
          color: '#4f9ad6',
        });
      }
    }
    if (mapShow === 'both' || mapShow === 'air') {
      const hubs = layers.airports.filter((a) => a.enplanements > 500000);
      const aMax = Math.max(1, ...hubs.map((a) => a.enplanements));
      for (const a of hubs) {
        bubbles.push({
          id: `air_${a.code}`,
          label: `${a.code} · ${a.city || a.name}`,
          sublabel: `${fmtCount3(a.enplanements)} 人次`,
          x: a.x,
          y: a.y,
          radiusPx: 3 + Math.sqrt(a.enplanements / aMax) * 14,
          color: '#e6cf86',
        });
      }
    }
    setAdvisorVisuals(bubbles, false);
    return () => setHoveredBubbleId(null);
  }, [layers, mapShow, setAdvisorVisuals, setHoveredBubbleId]);

  if (!layers) return null;

  const routes = layers.trade.routes;
  const isRegional = Boolean(layers.trade.regional);
  const zones = layers.trade.zones ?? [];
  const selectedZone = zones.find((z) => z.fips === selectedZoneId) ?? null;

  // Mode shares across the 40 largest interstate routes (value-weighted)
  const routeModeTotals: Record<string, number> = {};
  for (const r of routes) {
    for (const [m, share] of Object.entries(r.modes ?? {})) {
      routeModeTotals[m] = (routeModeTotals[m] ?? 0) + share * r.value_musd;
    }
  }
  const routeModeSegments = Object.entries(routeModeTotals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([m, v]) => ({
      key: m,
      label: TRADE_MODE_NAMES[m] ?? m,
      value: v,
      color: TRADE_MODE_COLORS[m] ?? '#9a9aa8',
      valueText: fmtMoney3(v * 1e6),
    }));

  const routeKeyOf = (r: (typeof routes)[number]) => `${r.a ?? r.orig_st}-${r.b ?? r.dest_st}`;
  const visibleRoutes = routes.filter(
    (r) =>
      (!modeFilter || r.top_mode === modeFilter) &&
      (!selectedZoneId || r.a === selectedZoneId || r.b === selectedZoneId || r.orig_fips === selectedZoneId || r.dest_fips === selectedZoneId),
  );
  const selectedRoute = routes.find((r) => routeKeyOf(r) === selectedRouteKey) ?? null;

  const zoneHexIds = (z: (typeof zones)[number]): number[] => {
    if (z.cities && z.cities.length > 0) {
      const s = new Set<number>();
      for (const cid of z.cities) {
        const c = cityById.get(cid);
        if (c) for (const h of c.hex_ids) s.add(h);
      }
      if (s.size > 0) return [...s];
    }
    return stateHexMap.get(z.fips) ?? [];
  };

  const airSorted = [...layers.airports]
    .filter((a) => (airTab === 'pax' ? a.enplanements > 0 : a.cargo_lbs > 0))
    .sort((a, b) => (airTab === 'pax' ? b.enplanements - a.enplanements : b.cargo_lbs - a.cargo_lbs))
    .slice(0, 15);

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: '国内货运总额', value: fmtMoney3(layers.trade.total_musd * 1e6), sub: 'FAF5.7.1 2024 现价', color: '#2FA4B8' },
          { label: '全美第一大港', value: topPort ? `${fmtCount3(topPort.tons)} t` : '–', sub: topPort?.name ?? '' },
          { label: '全美第一机场', value: topAir ? fmtCount3(topAir.enplanements) : '–', sub: topAir ? `${topAir.code} · 2025 客流` : '' },
        ]}
      />

      <CalloutNote>
        FAF5 货运额为 2024 年现价模型估算：衡量地区间的商品流通，而非当地 GDP 产出。同期全美外贸进口 <b>{fmtMoney3((layers.trade.import_musd ?? 3134841) * 1e6)}</b>、出口 <b>{fmtMoney3((layers.trade.export_musd ?? 2045950) * 1e6)}</b> 单独统计。
      </CalloutNote>

      {/* 1. Trade Routes & Mode Mix */}
      <div className="space-y-2">
        <SectionTitle
          title="全美州际货运大动脉 · Trade Routes"
          kicker="FAF5.7.1 · 2024 CURRENT DOLLARS"
          note={
            isRegional
              ? '按 2024 现价筛选全美前 40 条跨州货运大动脉（起点与终点 FAF 货运区无共同州、锚点直线距离 ≥ 250 km、跨州都会区如 NY-NJ-CT-PA 已合并计算，双向汇总）。'
              : '按 2024 现价统计全美前 40 条跨州货运双向大动脉；点击运输方式占比条可筛选商路。'
          }
        />
        <div className="text-[10.5px] font-semibold opacity-80">前 {routes.length} 大商路的运输方式结构（按货值加权）：</div>
        <ShareBar
          showLegend
          activeKey={modeFilter}
          segments={routeModeSegments.length > 0 ? routeModeSegments : layers.trade.modes.map((m) => ({
            key: m.id ?? m.mode,
            label: m.mode.split(' ')[0],
            value: m.value_musd,
            color: TRADE_MODE_COLORS[m.id ?? 'other'] ?? '#9a9aa8',
            valueText: fmtMoney3(m.value_musd * 1e6),
          }))}
          onSelect={(k) => setModeFilter(modeFilter === k ? null : k)}
        />
        {(modeFilter || selectedZone) && (
          <div className="flex flex-wrap gap-1.5 text-[10.5px]">
            {modeFilter && (
              <button type="button" onClick={() => setModeFilter(null)} className="px-2 py-0.5 rounded-full bg-[var(--brass-soft)] border border-[var(--brass)] cursor-pointer">
                方式：{TRADE_MODE_NAMES[modeFilter] ?? modeFilter} ✕
              </button>
            )}
            {selectedZone && (
              <button type="button" onClick={() => setSelectedZoneId(null)} className="px-2 py-0.5 rounded-full bg-[var(--brass-soft)] border border-[var(--brass)] cursor-pointer">
                货运区：{selectedZone.name} ({visibleRoutes.length} 条) ✕
              </button>
            )}
          </div>
        )}

        <div className="max-h-60 overflow-y-auto pr-0.5">
          <LinkedBarList
            compact
            ranked={!modeFilter && !selectedZoneId}
            activeId={selectedRouteKey}
            maxVal={routes[0]?.value_musd ?? 1}
            rows={visibleRoutes.map((r) => ({
              id: routeKeyOf(r),
              label: `${r.orig_st} ⇄ ${r.dest_st}`,
              sublabel: `${TRADE_MODE_NAMES[r.top_mode] ?? r.top_mode} · ${r.top_commodity}`,
              value: r.value_musd,
              valueText: fmtMoney3(r.value_musd * 1e6),
              color: TRADE_MODE_COLORS[r.top_mode] ?? '#2FA4B8',
            }))}
            onHover={(id) => {
              const r = routes.find((x) => routeKeyOf(x) === id);
              if (!r) { setBrushed(null, null); return; }
              const za = zones.find((z) => z.fips === (r.a ?? r.orig_fips));
              const zb = zones.find((z) => z.fips === (r.b ?? r.dest_fips));
              const hids = new Set<number>([...(za ? zoneHexIds(za) : []), ...(zb ? zoneHexIds(zb) : [])]);
              setBrushed(hids.size > 0 ? hids : null, `${r.orig_st} ⇄ ${r.dest_st}`);
            }}
            onClick={(row) => {
              const next = selectedRouteKey === row.id ? null : row.id;
              setSelectedRouteKey(next);
              const r = routes.find((x) => routeKeyOf(x) === row.id);
              if (r && next) onFlyTo((r.ox + r.dx) / 2, (r.oy + r.dy) / 2, 0.55);
            }}
          />
        </div>
        <p className="text-[10px] opacity-65 m-0 leading-snug">
          注：FAF 仅公布货物的起点与终点货运区，并不提供实际行驶路线；地图弧线仅作为起讫点连接示意（线宽随货值缩放）。
        </p>

        {selectedRoute && (
          <div className="p-2.5 rounded-lg border border-[var(--brass)] bg-[var(--surface-paper-subtle)] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-xs">#{selectedRoute.rank} {selectedRoute.orig_full ?? selectedRoute.orig_st} ⇄ {selectedRoute.dest_full ?? selectedRoute.dest_st}</span>
              <button type="button" onClick={() => setSelectedRouteKey(null)} className="text-[10px] underline cursor-pointer shrink-0">收起</button>
            </div>
            <KpiTiles
              items={[
                { label: '双向货值', value: fmtMoney3(selectedRoute.value_musd * 1e6), sub: '2024 现价' },
                { label: '货运总量', value: `${fmtCount3(selectedRoute.tons_k * 1000)} t`, sub: '短吨' },
                { label: '距离 / 周转', value: `${selectedRoute.dist_km ?? '–'} km`, sub: selectedRoute.tmiles_m ? `${fmtCount3(selectedRoute.tmiles_m * 1e6)} 吨英里` : '' },
              ]}
            />
            {selectedRoute.modes && (
              <div className="text-[10.5px] opacity-80">
                <b>运力构成：</b>
                {Object.entries(selectedRoute.modes).map(([m, s]) => `${TRADE_MODE_NAMES[m] ?? m} ${(s * 100).toFixed(0)}%`).join(' · ')}
                ；<b>第一大货品：</b>{selectedRoute.top_commodity}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Freight Zones Table (All 115 CONUS FAF Metro & Rest-of-State Zones!) */}
      {zones.length > 0 && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <SectionTitle
            title={`FAF 货运枢纽区 (${zones.length}) · Freight Zones`}
            note="FAF 将全美划分为大都会货运区与各州其余地区；对比区内流通、跨区往来与外贸进出口货值。点击任一货运区筛选商路并查看前 5 贸易伙伴。"
          />
          <SortableTable
            rows={zones.map((z) => ({ id: z.fips, z, foreign: z.import_musd + z.export_musd }))}
            defaultSort="other"
            searchPlaceholder="搜索货运区名称或州..."
            searchText={(r) => `${r.z.name} ${r.z.full_name ?? ''} ${r.z.abbr}`}
            maxHeight={240}
            activeId={selectedZoneId}
            columns={[
              { key: 'name', label: '货运区', align: 'l', value: (r) => r.z.name, render: (r) => <span className="inline-block max-w-[130px] truncate">{r.z.name} <span className="opacity-50 text-[10px]">{r.z.abbr}</span></span> },
              { key: 'within', label: '区内', value: (r) => r.z.within_musd, render: (r) => fmtMoney3(r.z.within_musd * 1e6) },
              { key: 'other', label: '跨区往来', value: (r) => r.z.other_musd, render: (r) => fmtMoney3(r.z.other_musd * 1e6), barMax: zones[0]?.other_musd ?? 1, barColor: 'rgba(47,164,184,0.3)' },
              { key: 'foreign', label: '进出口', value: (r) => r.foreign, render: (r) => fmtMoney3(r.foreign * 1e6) },
            ]}
            onHover={(r) => setBrushed(r ? new Set(zoneHexIds(r.z)) : null, r?.z.name)}
            onClick={(r) => {
              const next = selectedZoneId === r.id ? null : r.id;
              setSelectedZoneId(next);
              if (next && r.z.x && r.z.y) onFlyTo(r.z.x, r.z.y, 1.1);
            }}
          />
          {selectedZone && (
            <div className="p-2.5 rounded-lg border border-[var(--brass)] bg-[var(--surface-paper-subtle)] space-y-1.5">
              <div className="font-display font-bold text-xs">{selectedZone.full_name ?? selectedZone.name} · 前 5 贸易伙伴区</div>
              {selectedZone.cities && selectedZone.cities.length > 0 && (
                <div className="text-[10px] opacity-70">
                  {selectedZone.kind === 'rest_of_state' ? '该州都会区之外的其余地区 · ' : ''}
                  代表城市：{selectedZone.cities.slice(0, 5).map((id) => cityById.get(id)?.short_name ?? id).join('、')}
                </div>
              )}
              <LinkedBarList
                compact
                rows={selectedZone.partners.map(([pname, val, m, pid]) => ({
                  id: pid ?? pname,
                  label: pname,
                  sublabel: TRADE_MODE_NAMES[m] ?? m,
                  value: val,
                  valueText: fmtMoney3(val * 1e6),
                  color: TRADE_MODE_COLORS[m] ?? '#2FA4B8',
                }))}
                onClick={(row) => { if (zones.some((z) => z.fips === row.id)) setSelectedZoneId(row.id); }}
              />
            </div>
          )}
        </div>
      )}

      {/* 3. Ports (Stacked Domestic / Imports / Exports) */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="全美最繁忙港口 Top 15 · Ports" kicker="USACE CY2023" note="按美国陆军工程兵团主要港口总吞吐短吨排行，条形拆分为国内航运、进口与出口三部分。" />
        <StackedBarList
          rows={layers.ports.slice(0, 15).map((p) => ({
            id: p.name,
            label: p.name,
            sublabel: p.state,
            total: p.tons,
            totalText: `${fmtCount3(p.tons)} t`,
            parts: { domestic: p.domestic ?? p.tons, imports: p.imports ?? 0, exports: p.exports ?? 0 },
          }))}
          keys={[
            { key: 'domestic', label: '国内 Domestic', color: '#8fcbb8' },
            { key: 'imports', label: '进口 Imports', color: '#4f9ad6' },
            { key: 'exports', label: '出口 Exports', color: '#d9a457' },
          ]}
          onHover={(id) => setHoveredBubbleId(id ? `port_${id}` : null)}
          onClick={(id) => { const p = layers.ports.find((x) => x.name === id); if (p) onFlyTo(p.x, p.y, 1.5); }}
        />
        <SwatchLegend items={[{ label: '国内航运', color: '#8fcbb8' }, { label: '进口', color: '#4f9ad6' }, { label: '出口', color: '#d9a457' }]} />
        <p className="text-[10.5px] opacity-65 m-0">展示当前范围全部 {layers.ports.length} 座主要港口中的前 15 大港（计量单位：短吨 short tons）。</p>
      </div>

      {/* 4. Airports (Passengers with YoY% vs Cargo) */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="航空枢纽 Top 15 · Airports" kicker="FAA CY2025" note="覆盖全部主要客运机场（大型/中型/小型/非枢纽 ≥1 万人次）与全部全货机枢纽机场。" />
        <Segmented
          value={airTab}
          options={[{ value: 'pax', label: '客运吞吐 (Passengers)' }, { value: 'cargo', label: '全货运 (Cargo lbs)' }]}
          onChange={(v) => setAirTab(v as 'pax' | 'cargo')}
        />
        <LinkedBarList
          compact
          ranked
          rows={airSorted.map((a) => {
            const yoy = airTab === 'pax' && a.enplanements_prev && a.enplanements_prev > 0 ? a.enplanements / a.enplanements_prev - 1 : null;
            return {
              id: a.code,
              label: `${a.code} ${a.city || a.name}`,
              sublabel: airTab === 'pax' ? (yoy != null ? `${fmtSignedPct(yoy)} vs 2024` : a.state) : a.state,
              value: airTab === 'pax' ? a.enplanements : a.cargo_lbs,
              valueText: airTab === 'pax' ? fmtCount3(a.enplanements) : `${fmtCount3(a.cargo_lbs)} lb`,
              color: '#e6cf86',
              tone: yoy != null ? (yoy >= 0 ? 'good' : 'bad') : undefined,
            };
          })}
          onHover={(code) => setHoveredBubbleId(code ? `air_${code}` : null)}
          onClick={(r) => { const a = layers.airports.find((x) => x.code === r.id); if (a) onFlyTo(a.x, a.y, 1.5); }}
        />
        <p className="text-[10.5px] opacity-65 m-0">
          {airTab === 'pax'
            ? `共收录 ${layers.airports.length} 座机场；数值为 CY2025 年度登机旅客人次（Enplanements）及较 2024 年同比变化。`
            : '数值为 FAA 公布的全货机降落总重（All-Cargo Landed Weight，磅），计量的是货机降落全重而非纯载货净重。'}
        </p>
      </div>

      {/* 5. Map Bubble Control */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="地图叠加控制 · On the Map" />
        <Segmented
          value={mapShow}
          options={[
            { value: 'both', label: '港口与机场' },
            { value: 'ports', label: '仅港口' },
            { value: 'air', label: '仅机场' },
            { value: 'none', label: '仅商路' },
          ]}
          onChange={(v) => setMapShow(v as 'both' | 'ports' | 'air' | 'none')}
        />
        <SwatchLegend items={[{ label: '蓝色圆 = 港口吞吐量', color: '#4f9ad6' }, { label: '金色圆 = 机场客流量（枢纽）', color: '#e6cf86' }]} />
      </div>

      {/* 6. Collapsible Roads & Rails */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1.5">
        <button
          type="button"
          onClick={() => setShowNetwork((v) => !v)}
          className="text-[11px] font-bold underline cursor-pointer"
          style={{ color: 'var(--brass-bright)' }}
        >
          {showNetwork ? '收起公路与铁路网图层说明 · Roads & Rails ▴' : '展开公路与铁路网图层说明 · Roads & Rails ▾'}
        </button>
        {showNetwork && (
          <div className="space-y-1.5 text-[10.5px] opacity-75 leading-relaxed">
            <p className="m-0">
              <b>州际高速（Interstate）：</b>{layers.roads_primary.length.toLocaleString()} 段 · <b>主要干道：</b>{layers.roads_secondary.length.toLocaleString()} 段 · <b>主干铁路：</b>{layers.rail_main.length.toLocaleString()} 段。
            </p>
            <p className="m-0">
              公路与铁路底图取自 Natural Earth 1:10m 矢量（仅保留主干路网用于战略海图可视化，不包含运营商归属或实时车流统计；约涵盖美国实际铁路总里程的一半）。可在底部「图层」菜单随时开关。
            </p>
          </div>
        )}
      </div>

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['faf5_freight', 'usace_ports', 'faa_airports', 'natural_earth']}
        notes={[
          'FAF5.7.1 货值为 2024 年现价美元及千短吨模型估算；每个货运区代表整个都会区或一州其余地区，商路代表两大区域间全部货物流动。',
          '前 40 大商路仅计跨州货运（两端货运区无共同州且相距 ≥250 km）；地图连接线为辅助示意，并非实际运输路径。管道运输主要承载原油与天然气。',
          '港口吞吐量为 USACE 2023 日历年数据，较 FAA 2025 航空数据早两年；港口坐标为港务统计区几何质心，长河港位置为近似值。',
          'Natural Earth 公路与铁路属于地图制图底图，而非统计口径数据。',
        ]}
      />
    </div>
  );
};
