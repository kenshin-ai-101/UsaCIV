import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore, type MapBubbleSpec } from '../../../store/useAppStore';
import { sampleRamp } from '../../lenses/lensConfig';
import {
  AnnualColumnChart,
  BrushScatter,
  CalloutNote,
  DivergingBarList,
  fmtCount3,
  fmtMoney3,
  fmtSignedPct,
  InteractiveHistogram,
  KpiTiles,
  LinkedBarList,
  MapPickerBar,
  RampLegend,
  Segmented,
  ShareBar,
  SizeLegend,
  SmallMultiplesDonuts,
  SortableTable,
  SourcesFooter,
  StackedBarList,
  SwatchLegend,
  type ScatterPoint,
} from '../AdvisorCharts';
import type { AdvisorViewProps } from './WealthViews';

const SectionTitle: React.FC<{ title: string; kicker?: string; note?: string }> = ({ title, kicker, note }) => (
  <div className="mb-2 pt-1">
    {kicker && <div className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--brass)' }}>{kicker}</div>}
    <h3 className="font-display text-sm font-bold m-0">{title}</h3>
    {note && <p className="text-[11px] opacity-70 m-0 mt-0.5 leading-snug">{note}</p>}
  </div>
);

/* ============================================================================
 * 5. PEOPLE ADVISOR (2021-25 Growth Diverging, Log Density Counties vs People Hist, Age vs Foreign-born Brush Scatter)
 * ============================================================================ */
export const PeopleView: React.FC<AdvisorViewProps> = ({ meta, cities, states, counties, stateHexMap, onFlyTo }) => {
  const { setLens, setBrushed, openCity, openState, setAdvisorVisuals } = useAppStore();
  const [mapMode, setMapMode] = useState('density');
  const [gLevel, setGLevel] = useState<'metros' | 'states'>('metros');
  const [weighted, setWeighted] = useState(false);
  const [pinnedBin, setPinnedBin] = useState<{ idx: number; loVal: number; hiVal: number; count: number; totalPop: number; hexIds: number[] } | null>(null);
  const [brushedIds, setBrushedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    setAdvisorVisuals(null, false);
    setLens(mapMode === 'terrain' ? null : mapMode);
  }, [mapMode, setAdvisorVisuals, setLens]);

  const n = meta.nation;

  const growthLists = useMemo(() => {
    if (gLevel === 'metros') {
      const big = cities.filter((c) => c.pop >= 250000 && c.pop_growth_pct != null);
      const fast = [...big].sort((a, b) => b.pop_growth_pct! - a.pop_growth_pct!).slice(0, 8);
      const slow = [...big].sort((a, b) => a.pop_growth_pct! - b.pop_growth_pct!).slice(0, 8);
      const maxAbs = Math.max(0.05, ...[...fast, ...slow].map((c) => Math.abs(c.pop_growth_pct!)));
      return {
        maxAbs,
        fast: fast.map((c) => ({ id: c.id, label: c.short_name, sublabel: c.state_abbr, value: c.pop_growth_pct!, valueText: fmtSignedPct(c.pop_growth_pct) })),
        slow: slow.map((c) => ({ id: c.id, label: c.short_name, sublabel: c.state_abbr, value: c.pop_growth_pct!, valueText: fmtSignedPct(c.pop_growth_pct) })),
      };
    }
    const valid = states.filter((s) => s.pop_growth_pct != null);
    const fast = [...valid].sort((a, b) => b.pop_growth_pct! - a.pop_growth_pct!).slice(0, 8);
    const slow = [...valid].sort((a, b) => a.pop_growth_pct! - b.pop_growth_pct!).slice(0, 8);
    const maxAbs = Math.max(0.05, ...[...fast, ...slow].map((s) => Math.abs(s.pop_growth_pct!)));
    return {
      maxAbs,
      fast: fast.map((s) => ({ id: s.fips, label: s.name, value: s.pop_growth_pct!, valueText: fmtSignedPct(s.pop_growth_pct) })),
      slow: slow.map((s) => ({ id: s.fips, label: s.name, value: s.pop_growth_pct!, valueText: fmtSignedPct(s.pop_growth_pct) })),
    };
  }, [gLevel, cities, states]);

  const usDensity = useMemo(() => {
    if (!counties) return 38;
    let p = 0, a = 0;
    for (const r of counties.rows) {
      if (r.state === 'AK') continue;
      p += Number(r.pop ?? 0);
      a += Number(r.land_km2 ?? 0);
    }
    return a > 0 ? p / a : 38;
  }, [counties]);

  const ageMedianCounty = useMemo(() => {
    if (!counties) return 41.5;
    const arr = counties.rows.map((r) => r.age).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
    return arr.length ? arr[Math.floor(arr.length / 2)] : 41.5;
  }, [counties]);

  const agePts = useMemo<ScatterPoint[]>(() => {
    if (!counties) return [];
    return counties.rows
      .filter((r) => typeof r.age === 'number' && typeof r.foreign_born === 'number')
      .map((r) => {
        const d = Math.max(0.5, Number(r.density ?? 10));
        const t = (Math.log10(d) - Math.log10(1)) / (Math.log10(2000) - Math.log10(1));
        const rgb = sampleRamp('risk', t);
        return {
          id: r.fips,
          label: r.name,
          sub: r.state,
          x: r.age as number,
          y: r.foreign_born as number,
          r: Number(r.pop ?? 1000),
          color: `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`,
          hexIds: r.hex_ids,
          fly: [r.x, r.y],
          extraTip: `密度 ${d.toFixed(0)}/km²`,
        };
      });
  }, [counties]);

  const topCountyLabels = useMemo(() => new Set((counties?.rows ?? []).slice(0, 6).map((r) => r.fips)), [counties]);

  const brushedSummary = useMemo(() => {
    if (!brushedIds || !counties || brushedIds.size === 0) return null;
    const sel = counties.rows.filter((r) => brushedIds.has(r.fips));
    const pop = sel.reduce((a, r) => a + Number(r.pop ?? 0), 0);
    const top5 = [...sel].sort((a, b) => Number(b.pop ?? 0) - Number(a.pop ?? 0)).slice(0, 4);
    return { count: sel.length, pop, pct: (pop / n.population) * 100, topNames: top5.map((r) => `${r.name.replace(/ County$/, '')}, ${r.state}`).join(' · ') };
  }, [brushedIds, counties, n.population]);

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: '全美常住人口', value: fmtCount3(n.population), sub: 'ACS 2025 1-Yr' },
          { label: '人口增速 2021–25', value: fmtSignedPct(n.growth ?? 0.0292, 2), sub: 'Census PEP 估算', color: '#58C998' },
          { label: '都会与微都会区', value: `${cities.length}`, sub: `${(counties?.rows.length ?? n.conus_counties ?? 3109).toLocaleString()} 个县` },
        ]}
      />

      <MapPickerBar
        value={mapMode}
        options={[
          { value: 'density', label: '人口密度' },
          { value: 'age', label: '中位年龄' },
          { value: 'foreign_born', label: '外国出生' },
          { value: 'terrain', label: '立体地形' },
        ]}
        onChange={setMapMode}
      />

      {/* 1. Growing vs Shrinking */}
      <div className="space-y-2">
        <SectionTitle title="谁在增长，谁在萎缩 · Growing vs Shrinking" note="Census PEP 2021–2025 统一边界人口净变化率（都会区口径为 25 万+ 人口）。" />
        <Segmented
          value={gLevel}
          options={[{ value: 'metros', label: '都会区 (250K+)' }, { value: 'states', label: '各州 (States)' }]}
          onChange={(v) => setGLevel(v as 'metros' | 'states')}
        />
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">增长最快 Top 8 · Fastest Growing</div>
        <DivergingBarList
          rows={growthLists.fast}
          maxAbs={growthLists.maxAbs}
          onHover={(id) => {
            if (!id) { setBrushed(null, null); return; }
            if (gLevel === 'metros') { const c = cities.find((x) => x.id === id); setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name); }
            else setBrushed(new Set(stateHexMap.get(id) ?? []), id);
          }}
          onClick={(id) => (gLevel === 'metros' ? openCity(id) : openState(id))}
        />
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 pt-1">萎缩 / 增长最慢 Top 8 · Shrinking & Slowest</div>
        <DivergingBarList
          rows={growthLists.slow}
          maxAbs={growthLists.maxAbs}
          onHover={(id) => {
            if (!id) { setBrushed(null, null); return; }
            if (gLevel === 'metros') { const c = cities.find((x) => x.id === id); setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name); }
            else setBrushed(new Set(stateHexMap.get(id) ?? []), id);
          }}
          onClick={(id) => (gLevel === 'metros' ? openCity(id) : openState(id))}
        />
      </div>

      {/* 2. How Crowded (Log Density Histogram: Counties vs People weighted!) */}
      {counties && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <SectionTitle title="人口有多拥挤 · How Crowded" note="各县人口密度分布（对数横轴）。切换「按人口加权」可直观看见绝大多数美国人聚集在高密度右尾。" />
          <div className="flex items-center justify-between gap-2">
            <Segmented
              value={weighted ? 'people' : 'counties'}
              options={[{ value: 'counties', label: '按县数 (Counties)' }, { value: 'people', label: '按人口加权 (People)' }]}
              onChange={(v) => setWeighted(v === 'people')}
            />
            <button type="button" onClick={() => setMapMode('density')} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-semibold cursor-pointer">
              密度视角
            </button>
          </div>
          <InteractiveHistogram
            values={counties.rows.filter((r) => typeof r.density === 'number' && (r.density as number) > 0).map((r) => ({ val: r.density as number, weight: Number(r.pop ?? 0), pop: Number(r.pop ?? 0), hexIds: r.hex_ids }))}
            bins={30}
            log
            weighted={weighted}
            domain={[0.3, 30000]}
            marker={{ value: usDensity, label: `本土均值 ${usDensity.toFixed(0)}/km²` }}
            fmt="dec1"
            ramp="risk"
            pinnedIdx={pinnedBin?.idx ?? null}
            onHoverRange={(hids, lbl) => { if (!pinnedBin) setBrushed(hids, lbl); }}
            onPinBin={(b) => {
              setPinnedBin(b);
              setBrushed(b ? new Set(b.hexIds) : null, b ? `${b.count} 县` : null);
            }}
          />
          {pinnedBin && (
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--brass-soft)] border border-[var(--brass)] text-[10.5px]">
              <span>锁定：<b>{pinnedBin.count}</b> 个县 ({pinnedBin.loVal.toFixed(1)}–{pinnedBin.hiVal.toFixed(1)} 人/km²) · {fmtCount3(pinnedBin.totalPop)} 人</span>
              <button type="button" onClick={() => { setPinnedBin(null); setBrushed(null, null); }} className="underline font-bold cursor-pointer">清除</button>
            </div>
          )}
        </div>
      )}

      {/* 3. Age and Immigration Brushable Scatter */}
      {counties && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <SectionTitle title="年龄与移民版图 · Age and Immigration" note="每个点代表一个县（全部县完整入图）：横轴中位年龄，纵轴外国出生占比，气泡大小 = 人口，颜色 = 对数人口密度。拖拽框选同步点亮主地图！" />
          <div className="flex items-center gap-1.5 text-[10.5px]">
            <span className="opacity-65">切换地图着色：</span>
            <button type="button" onClick={() => setMapMode('age')} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 font-semibold cursor-pointer">中位年龄</button>
            <button type="button" onClick={() => setMapMode('foreign_born')} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 font-semibold cursor-pointer">外国出生占比</button>
          </div>
          <BrushScatter
            points={agePts}
            xLabel="中位年龄"
            yLabel="外国出生占比"
            xFmt="dec1"
            yFmt="pct"
            height={235}
            refX={[{ v: ageMedianCounty, label: `中位县 ${ageMedianCounty.toFixed(1)} 岁` }]}
            labelIds={topCountyLabels}
            selectedIds={brushedIds}
            onHoverPoint={(p) => setBrushed(p?.hexIds ? new Set(p.hexIds) : null, p?.label)}
            onClickPoint={(p) => { if (p.fly) onFlyTo(p.fly[0], p.fly[1], 1.4); }}
            onBrush={(set) => {
              setBrushedIds(set);
              if (!set) { setBrushed(null, null); return; }
              const hids = new Set<number>();
              for (const r of counties.rows) if (set.has(r.fips)) for (const h of r.hex_ids) hids.add(h);
              setBrushed(hids, `已框选 ${set.size} 个县`);
            }}
          />
          <RampLegend ramp="risk" title="气泡颜色：人口密度 (人/km²)" minLabel="1" maxLabel="2,000+" />
          {brushedSummary && (
            <div className="p-2 rounded-lg bg-[var(--brass-soft)] border border-[var(--brass)] text-[10.5px] space-y-0.5">
              <div className="flex items-center justify-between">
                <span><b>{brushedSummary.count}</b> 个县 · {fmtCount3(brushedSummary.pop)} 人 ({brushedSummary.pct.toFixed(1)}% 全美)</span>
                <button type="button" onClick={() => { setBrushedIds(null); setBrushed(null, null); }} className="underline font-bold cursor-pointer">清除</button>
              </div>
              <div className="opacity-75 text-[10px] truncate">最大县：{brushedSummary.topNames}</div>
            </div>
          )}
        </div>
      )}

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['acs_1yr', 'pep_population', 'acs_5yr', 'census_gazetteer']}
        notes={[
          '人口增速取自同一版本（Vintage 2025）美国人口普查局 PEP 2021–2025 年估算，采用统一现行行政区划边界。',
          '全国常住人口总量采用 ACS 2025 1-Yr（B01003），与 PEP 属于两套独立官方估算体系，两者相除不会完全吻合。',
          '县级密度、年龄与外国出生占比取自 ACS 5-Yr（五年合并样本），比 1 年期都会区与州级指标略有滞后。',
          '散点图横轴为各县自身中位年龄；一组县的整体中位年龄并不等于各县中位年龄的算术平均。',
        ]}
      />
    </div>
  );
};

/* ============================================================================
 * 6. KNOWLEDGE ADVISOR (Science Yield 17.3M, Degrees vs Income Scatter, Broadband Offline Hist + Table)
 * ============================================================================ */
export const KnowledgeView: React.FC<AdvisorViewProps> = ({ meta, cities, counties, onFlyTo }) => {
  const { setLens, setBrushed, openCity, setAdvisorVisuals } = useAppStore();
  const [mapMode, setMapMode] = useState('bachelors');
  const [sciMode, setSciMode] = useState<'share' | 'abs'>('share');
  const [degLevel, setDegLevel] = useState<'counties' | 'metros'>('counties');
  const [brushedIds, setBrushedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    setAdvisorVisuals(null, false);
    setLens(mapMode === 'terrain' ? null : mapMode);
  }, [mapMode, setAdvisorVisuals, setLens]);

  const n = meta.nation;
  const usSci = n.real_yields?.science ?? 17255272;
  const usEmp = n.employed || 167279529;
  const usSciShare = usSci / usEmp;

  const wavg = (key: 'bachelors' | 'broadband') => {
    if (!counties) return null;
    let a = 0, w = 0;
    for (const r of counties.rows) {
      const v = r[key];
      const p = r.pop;
      if (typeof v === 'number' && typeof p === 'number') { a += v * p; w += p; }
    }
    return w > 0 ? a / w : null;
  };
  const usBach = wavg('bachelors') ?? n.bachelors_pct;
  const usBb = wavg('broadband') ?? 0.903;

  const sciRows = useMemo(() => {
    const src = sciMode === 'abs' ? cities : cities.filter((c) => c.pop >= 250000);
    return src
      .map((c) => {
        const workers = c.yields_workers?.science ?? 0;
        const share = c.employed && c.employed > 0 ? workers / c.employed : 0;
        return { c, workers, share };
      })
      .filter((x) => x.workers > 0)
      .sort((a, b) => (sciMode === 'abs' ? b.workers - a.workers : b.share - a.share))
      .slice(0, 12);
  }, [cities, sciMode]);

  const degPts = useMemo<ScatterPoint[]>(() => {
    if (degLevel === 'counties' && counties) {
      return counties.rows
        .filter((r) => typeof r.bachelors === 'number' && typeof r.income === 'number' && (r.income as number) > 0)
        .map((r) => {
          const bb = Number(r.broadband ?? 0.85);
          const rgb = sampleRamp('knowledge', (bb - 0.68) / 0.28);
          return {
            id: r.fips,
            label: r.name,
            sub: r.state,
            x: r.bachelors as number,
            y: r.income as number,
            r: Number(r.pop ?? 1000),
            color: `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`,
            hexIds: r.hex_ids,
            fly: [r.x, r.y],
            extraTip: `宽带 ${(bb * 100).toFixed(1)}%`,
          };
        });
    }
    return cities
      .filter((c) => c.bachelors_pct != null && (c.median_income ?? 0) > 0)
      .map((c) => {
        const bb = c.broadband_pct ?? 0.88;
        const rgb = sampleRamp('knowledge', (bb - 0.72) / 0.24);
        return {
          id: c.id,
          label: c.short_name,
          sub: c.state_abbr,
          x: c.bachelors_pct!,
          y: c.median_income!,
          r: c.pop,
          color: `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`,
          hexIds: c.hex_ids,
          fly: [c.x, c.y],
          extraTip: `宽带 ${(bb * 100).toFixed(1)}%`,
        };
      });
  }, [degLevel, counties, cities]);

  const degTopLabels = useMemo(
    () => new Set(degLevel === 'counties' ? (counties?.rows ?? []).slice(0, 6).map((r) => r.fips) : cities.slice(0, 6).map((c) => c.id)),
    [degLevel, counties, cities],
  );

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: '科研与信息就业', value: fmtCount3(usSci), sub: `占总就业 ${(usSciShare * 100).toFixed(1)}%`, color: '#4fa3e0' },
          { label: '本科及以上学历', value: `${(usBach * 100).toFixed(1)}%`, sub: '25岁+ 成人 (ACS 5-Yr)' },
          { label: '家庭宽带普及', value: `${(usBb * 100).toFixed(1)}%`, sub: '任意宽带订阅 (ACS 5-Yr)' },
        ]}
      />

      <MapPickerBar
        value={mapMode}
        options={[
          { value: 'bachelors', label: '本科学历' },
          { value: 'broadband', label: '宽带普及' },
          { value: 'terrain', label: '立体地形' },
        ]}
        onChange={setMapMode}
      />

      {/* 1. The Science Yield */}
      <div className="space-y-2">
        <SectionTitle
          title="科研产出排行 · The Science Yield"
          kicker="ACS C24030 · PROFESSIONAL, SCIENTIFIC & INFORMATION"
          note="专业、科研与技术服务及信息业从业人口（占比排行仅含 25 万+ 人口都会区）。"
        />
        <Segmented
          value={sciMode}
          options={[{ value: 'share', label: '就业占比 (Share)' }, { value: 'abs', label: '总人数 (Most workers)' }]}
          onChange={(v) => setSciMode(v as 'share' | 'abs')}
        />
        <LinkedBarList
          compact
          ranked
          rows={sciRows.map(({ c, workers, share }) => ({
            id: c.id,
            label: `${c.short_name}, ${c.state_abbr}`,
            sublabel: sciMode === 'abs' ? `${(share * 100).toFixed(1)}%` : `×${(share / usSciShare).toFixed(2)} 全美`,
            value: sciMode === 'abs' ? workers : share,
            valueText: sciMode === 'abs' ? fmtCount3(workers) : `${(share * 100).toFixed(1)}%`,
            color: '#4fa3e0',
          }))}
          onHover={(id) => { const c = cities.find((x) => x.id === id); setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name); }}
          onClick={(r) => openCity(r.id)}
        />
      </div>

      {/* 2. Degrees and Income Brushable Scatter */}
      {counties && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <SectionTitle title="学历与收入 · Degrees and Income" note="横轴本科及以上学历占比，纵轴家庭中位收入（对数），颜色 = 宽带普及率。拖拽框选同步联动地图！" />
          <Segmented
            value={degLevel}
            options={[{ value: 'counties', label: '县 (Counties)' }, { value: 'metros', label: '都会区 (Metros)' }]}
            onChange={(v) => { setDegLevel(v as 'counties' | 'metros'); setBrushedIds(null); setBrushed(null, null); }}
          />
          <BrushScatter
            points={degPts}
            xLabel="本科及以上学历"
            yLabel="家庭中位收入"
            xFmt="pct"
            yFmt="usd"
            logY
            height={235}
            labelIds={degTopLabels}
            selectedIds={brushedIds}
            onHoverPoint={(p) => setBrushed(p?.hexIds ? new Set(p.hexIds) : null, p?.label)}
            onClickPoint={(p) => (degLevel === 'metros' ? openCity(p.id) : p.fly && onFlyTo(p.fly[0], p.fly[1], 1.4))}
            onBrush={(set) => {
              setBrushedIds(set);
              if (!set) { setBrushed(null, null); return; }
              const hids = new Set<number>();
              for (const p of degPts) if (set.has(p.id) && p.hexIds) for (const h of p.hexIds) hids.add(h);
              setBrushed(hids, `已框选 ${set.size} 个地区`);
            }}
          />
          <RampLegend ramp="knowledge" title="气泡颜色：宽带普及率" minLabel="68%" maxLabel="96%+" />
        </div>
      )}

      {/* 3. Who is Offline (Broadband Histogram + Ascending Table) */}
      {counties && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <SectionTitle title="数字鸿沟：谁仍未接入宽带 · Who is Offline" note="按家庭宽带订阅比例升序排列，悬停直方柱或表格行在地图勾勒对应县区。" />
          <InteractiveHistogram
            values={counties.rows.filter((r) => typeof r.broadband === 'number').map((r) => ({ val: r.broadband as number, pop: Number(r.pop ?? 0), hexIds: r.hex_ids }))}
            bins={30}
            domain={[0.5, 1.0]}
            fmt="pct"
            ramp="knowledge"
            onHoverRange={(hids, lbl) => setBrushed(hids, lbl)}
          />
          <SortableTable
            rows={counties.rows.filter((r) => typeof r.broadband === 'number').map((r) => ({ id: r.fips, row: r, name: r.name, sub: r.state, pop: Number(r.pop ?? 0), bb: r.broadband as number, deg: r.bachelors as number | null }))}
            defaultSort="bb"
            defaultDir="asc"
            searchPlaceholder="搜索宽带覆盖县区..."
            searchText={(r) => `${r.name} ${r.sub}`}
            maxHeight={220}
            columns={[
              { key: 'name', label: '县区', align: 'l', value: (r) => r.name, render: (r) => <span>{r.name} <span className="opacity-50 text-[10px]">{r.sub}</span></span> },
              { key: 'pop', label: '人口', value: (r) => r.pop, render: (r) => fmtCount3(r.pop) },
              { key: 'bb', label: '宽带', value: (r) => r.bb, render: (r) => `${(r.bb * 100).toFixed(1)}%`, barMax: 1, barColor: 'rgba(74,134,214,0.38)' },
              { key: 'deg', label: '本科率', value: (r) => r.deg, render: (r) => r.deg != null ? `${(r.deg * 100).toFixed(1)}%` : '–' },
            ]}
            onHover={(r) => setBrushed(r ? new Set(r.row.hex_ids) : null, r?.name)}
            onClick={(r) => onFlyTo(r.row.x, r.row.y, 1.4)}
          />
        </div>
      )}

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['acs_1yr', 'acs_5yr']}
        notes={[
          '「科研产出」按劳动者居住地统计（ACS 2025 1-Yr C24030），覆盖整个专业科研与信息业（如律所前台计入该行业，而医院里的临床研究员计入医疗业）。',
          '县级本科率与家庭宽带订阅率来自 ACS 5-Yr（B15003 / B28002），都会区与州级数值为成员县按人口加权汇总。',
          '宽带普及率涵盖任何付费宽带订阅（光纤、有线、DSL、卫星或手机流量套餐），衡量家庭接入覆盖而非网速。',
        ]}
      />
    </div>
  );
};

/* ============================================================================
 * 7. LAND ADVISOR (7 NLCD Covers + Dominant Hex Pinning + Table/Donuts Grid + Who Works the Land)
 * ============================================================================ */
const LAND_SPEC = [
  { key: 'forest', idx: 0, label: '森林', color: '#3f7a3a', lens: 'forest' },
  { key: 'crop', idx: 1, label: '耕地', color: '#d2c457', lens: 'farmland' },
  { key: 'pasture', idx: 2, label: '牧草', color: '#93b852', lens: 'farmland' },
  { key: 'grass', idx: 3, label: '草地', color: '#b9b06a', lens: null },
  { key: 'shrub', idx: 4, label: '灌木荒漠', color: '#c9a874', lens: null },
  { key: 'wetland', idx: 5, label: '湿地', color: '#4f9a86', lens: null },
  { key: 'developed', idx: 6, label: '建成区', color: '#9a8f9e', lens: 'developed' },
];

export const LandView: React.FC<AdvisorViewProps> = ({ meta, world, cities, states, stateHexMap }) => {
  const { setLens, setBrushed, openState, openCity, setAdvisorVisuals } = useAppStore();
  const [pinnedCover, setPinnedCover] = useState<string | null>(null);
  const [sortCover, setSortCover] = useState<string>('forest');
  const [shape, setShape] = useState<'table' | 'grid'>('table');
  const [fLevel, setFLevel] = useState<'states' | 'metros'>('states');

  useEffect(() => {
    setAdvisorVisuals(null, false);
    setLens(null);
  }, [setAdvisorVisuals, setLens]);

  const ln = meta.nation.land_national ?? {};
  const domCounts = meta.nation.land_dom_counts ?? {};

  const domHexByKey = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of LAND_SPEC) map.set(s.key, []);
    const dl = world.dom_land;
    if (!dl) return map;
    for (let i = 0; i < world.n; i++) {
      const idx = dl[i];
      if (idx >= 0 && idx < LAND_SPEC.length) map.get(LAND_SPEC[idx].key)!.push(i);
    }
    return map;
  }, [world]);

  const pinCover = (k: string | null) => {
    const next = pinnedCover === k ? null : k;
    setPinnedCover(next);
    if (!next || next === 'other') { setBrushed(null, null); return; }
    setBrushed(new Set(domHexByKey.get(next) ?? []), LAND_SPEC.find((x) => x.key === next)?.label);
  };

  const stateLandRows = useMemo(() => {
    return states
      .filter((s) => s.land_cover && Object.values(s.land_cover).some((v) => v > 0))
      .map((s) => {
        const lc = s.land_cover!;
        const best = LAND_SPEC.reduce((b, cur) => ((lc[cur.key] ?? 0) > (lc[b.key] ?? 0) ? cur : b), LAND_SPEC[0]);
        return {
          id: s.fips,
          abbr: s.abbr,
          name: s.name,
          lc,
          val: lc[sortCover] ?? 0,
          domLabel: best.label,
        };
      })
      .sort((a, b) => b.val - a.val);
  }, [states, sortCover]);

  const foodRows = useMemo(() => {
    if (fLevel === 'states') {
      return states
        .filter((s) => (s.employed ?? 0) > 0 && (s.yields_workers?.food ?? 0) > 0)
        .map((s) => ({
          id: s.fips,
          label: s.name,
          sublabel: `${fmtCount3(s.yields_workers?.food)} 人`,
          value: (s.yields_workers!.food! / s.employed!),
          valueText: `${((s.yields_workers!.food! / s.employed!) * 100).toFixed(1)}%`,
          color: '#7fbf3f',
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
    }
    return cities
      .filter((c) => c.pop >= 100000 && (c.employed ?? 0) > 0 && (c.yields_workers?.food ?? 0) > 0)
      .map((c) => ({
        id: c.id,
        label: `${c.short_name}, ${c.state_abbr}`,
        sublabel: `${fmtCount3(c.yields_workers?.food)} 人`,
        value: c.yields_workers!.food / c.employed!,
        valueText: `${((c.yields_workers!.food / c.employed!) * 100).toFixed(1)}%`,
        color: '#7fbf3f',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [fLevel, states, cities]);

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: '森林覆盖', value: `${((ln.forest ?? 0.255) * 100).toFixed(0)}%`, sub: '美国本土陆地', color: '#58b352' },
          { label: '农田与牧草', value: `${(((ln.crop ?? 0.167) + (ln.pasture ?? 0.064)) * 100).toFixed(0)}%`, sub: '耕地 + 牧场干草', color: '#d2c457' },
          { label: '城镇建成区', value: `${((ln.developed ?? 0.037) * 100).toFixed(1)}%`, sub: '低中高密度开发', color: '#b8aec0' },
        ]}
      />

      {/* 1. What covers the country */}
      <div className="space-y-2">
        <SectionTitle
          title="美国陆地构成 · What Covers the Country"
          kicker="LOWER 48 · NLCD 2021"
          note="悬停任一覆被在主地图点亮以该地类为主导的全部 25 km 六边形；点击锁定该地类。"
        />
        <ShareBar
          showLegend
          activeKey={pinnedCover}
          segments={[
            ...LAND_SPEC.map((s) => ({ key: s.key, label: s.label, value: ln[s.key] ?? 0, color: s.color, valueText: `${((ln[s.key] ?? 0) * 100).toFixed(1)}%` })),
            { key: 'other', label: '其他(裸岩/冰雪)', value: ln.other ?? 0.02, color: '#6c6358', valueText: `${((ln.other ?? 0.02) * 100).toFixed(1)}%` },
          ].sort((a, b) => (a.key === 'other' ? 1 : b.key === 'other' ? -1 : b.value - a.value))}
          onHover={(k) => {
            if (pinnedCover) return;
            if (!k || k === 'other') { setBrushed(null, null); return; }
            setBrushed(new Set(domHexByKey.get(k) ?? []), LAND_SPEC.find((x) => x.key === k)?.label);
          }}
          onSelect={(k) => { if (k !== 'other') pinCover(k); }}
        />
        {pinnedCover && (
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--brass-soft)] border border-[var(--brass)] text-[10.5px]">
            <span>
              <b>{LAND_SPEC.find((x) => x.key === pinnedCover)?.label}</b> 主导全美 <b>{(domCounts[pinnedCover] ?? 0).toLocaleString()}</b> 块本土六边形（陆地占比 {((ln[pinnedCover] ?? 0) * 100).toFixed(1)}%）
            </span>
            <button type="button" onClick={() => pinCover(null)} className="underline font-bold cursor-pointer">清除</button>
          </div>
        )}
        <div className="flex gap-1.5">
          {[['forest', '森林视角'], ['farmland', '农田视角'], ['developed', '建成区视角']].map(([id, lbl]) => (
            <button key={id} type="button" onClick={() => setLens(id)} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-semibold cursor-pointer">
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* 2. States' Make-up (Table vs Small Multiples Donuts Grid!) */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="各州土地配方 · The States' Make-up" note={`按任意地类排序；切换「甜甜圈网格」一览全美 ${stateLandRows.length} 州土地构成。`} />
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <Segmented
            value={sortCover}
            options={LAND_SPEC.map((s) => ({ value: s.key, label: s.label }))}
            onChange={setSortCover}
          />
          <Segmented
            value={shape}
            options={[{ value: 'table', label: '表格' }, { value: 'grid', label: '甜甜圈网格' }]}
            onChange={(v) => setShape(v as 'table' | 'grid')}
          />
        </div>

        {shape === 'table' ? (
          <SortableTable
            key={sortCover}
            rows={stateLandRows}
            defaultSort="val"
            maxHeight={280}
            columns={[
              { key: 'name', label: '州', align: 'l', value: (r) => r.name },
              {
                key: 'bar',
                label: '土地构成',
                align: 'l',
                value: (r) => r.val,
                render: (r) => (
                  <div className="flex h-2.5 w-24 rounded overflow-hidden bg-white/10">
                    {LAND_SPEC.map((s) => {
                      const pct = (r.lc[s.key] ?? 0) * 100;
                      return pct > 0.5 ? <div key={s.key} style={{ width: `${pct}%`, background: s.color }} title={`${s.label} ${pct.toFixed(0)}%`} /> : null;
                    })}
                  </div>
                ),
              },
              {
                key: 'val',
                label: LAND_SPEC.find((x) => x.key === sortCover)?.label ?? '占比',
                value: (r) => r.val,
                render: (r) => `${(r.val * 100).toFixed(0)}%`,
              },
              { key: 'dom', label: '主导', align: 'l', value: (r) => r.domLabel },
            ]}
            onHover={(r) => setBrushed(r ? new Set(stateHexMap.get(r.id) ?? []) : null, r?.name)}
            onClick={(r) => openState(r.id)}
          />
        ) : (
          <SmallMultiplesDonuts
            items={stateLandRows.map((r) => ({
              id: r.id,
              label: r.abbr,
              centerText: `${(r.val * 100).toFixed(0)}%`,
              parts: LAND_SPEC.map((s) => ({ key: s.key, value: r.lc[s.key] ?? 0, color: s.color })),
            }))}
            onHover={(id) => setBrushed(id ? new Set(stateHexMap.get(id) ?? []) : null, id ?? undefined)}
            onClick={(id) => openState(id)}
          />
        )}
      </div>

      {/* 3. Who Works the Land */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="谁在耕作这片土地 · Who Works the Land" kicker="ACS C24030 · FOOD YIELD" note="农林渔牧从业人口占总就业人数比例（都会区口径为 10 万+ 人口）。" />
        <Segmented
          value={fLevel}
          options={[{ value: 'states', label: '各州 (States)' }, { value: 'metros', label: '都会区 (100K+)' }]}
          onChange={(v) => setFLevel(v as 'states' | 'metros')}
        />
        <LinkedBarList
          compact
          ranked
          rows={foodRows}
          onHover={(id) => {
            if (!id) { setBrushed(null, null); return; }
            if (fLevel === 'states') setBrushed(new Set(stateHexMap.get(id) ?? []), id);
            else { const c = cities.find((x) => x.id === id); setBrushed(c ? new Set(c.hex_ids) : null, c?.short_name); }
          }}
          onClick={(r) => (fLevel === 'states' ? openState(r.id) : openCity(r.id))}
        />
        {fLevel === 'metros' && <p className="text-[10.5px] opacity-65 m-0">仅统计常住人口 10 万及以上的都会区。</p>}
      </div>

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['nlcd', 'acs_1yr']}
        notes={[
          '土地覆被数据源自 USGS NLCD 2021，重采样至约 2 km 分辨率并按 25 km 六边形求均值，因此狭长河谷农田或小城镇会与周边地类平滑混合。',
          '「草地」包含 NLCD 21（公园、高尔夫球场与低密草坪等开发开放空间）；「建成区」仅计低/中/高强度城镇建设用地（NLCD 22–24）。',
          '农林渔牧从业人口按居住地统计（ACS 2025 1-Yr C24030），涵盖农业、林业、渔业与狩猎业。',
        ]}
      />
    </div>
  );
};

/* ============================================================================
 * 8. MILITARY ADVISOR (DMDC 1.17M + 741K, OLDCC $607B, MIRTA 789 sites + 30 Ranges + 85 Garrisons + State Detail Card)
 * ============================================================================ */
const EMPTY_MIL: never[] = [];

const COMP_META: Record<string, { label: string; color: string }> = {
  army: { label: '陆军', color: '#7d9a46' },
  navy: { label: '海军', color: '#3f6fc2' },
  air_force: { label: '空军', color: '#6fb3e0' },
  marines: { label: '陆战队', color: '#c24a3e' },
  army_reserve: { label: '陆军预备', color: '#a8bd78' },
  navy_reserve: { label: '海军预备', color: '#8aa6db' },
  air_force_reserve: { label: '空军预备', color: '#a9d3ee' },
  marine_reserve: { label: '陆战预备', color: '#e08f86' },
  army_guard: { label: '陆军警卫队', color: '#d6b04a' },
  air_guard: { label: '空军警卫队', color: '#e6cf86' },
  other: { label: '其他 DoD', color: '#9a9aa8' },
};
const COMP_GROUPS = [
  { id: 'active', label: '现役', ids: ['army', 'navy', 'air_force', 'marines'] },
  { id: 'reserve', label: '预备役', ids: ['army_reserve', 'navy_reserve', 'air_force_reserve', 'marine_reserve'] },
  { id: 'guard', label: '国民警卫队', ids: ['army_guard', 'air_guard'] },
];

export const MilitaryView: React.FC<AdvisorViewProps> = ({ meta, cities, states, allStates, layers, counties, stateHexMap, geoScope, onFlyTo }) => {
  const { setLens, setLayer, setBrushed, setAdvisorVisuals, setHoveredBubbleId, openCity, openState } = useAppStore();
  const [mapMode, setMapMode] = useState<'terrain' | 'veterans'>('terrain');
  const [tier, setTier] = useState<'major' | 'big' | 'all'>('big');
  const [compSet, setCompSet] = useState<Set<string> | null>(null);
  const [selectedStateAbbr, setSelectedStateAbbr] = useState<string | null>(null);
  const [stMetric, setStMetric] = useState<'troops' | 'dollars' | 'perres' | 'gdp'>('troops');
  const [showAllStates, setShowAllStates] = useState(false);
  const [vetLevel, setVetLevel] = useState<'states' | 'metros' | 'counties'>('states');
  const defenseStates = allStates ?? states;

  const allComps = useMemo(() => Object.keys(COMP_META), []);
  const activeComps = useMemo(() => compSet ?? new Set(allComps), [compSet, allComps]);

  const visibleBases = useMemo(() => {
    if (!layers) return EMPTY_MIL;
    return layers.military_bases.filter((b) => {
      if (!activeComps.has(b.component)) return false;
      if (tier === 'major' && b.tier !== 'major') return false;
      if (tier === 'big' && b.tier === 'site') return false;
      if (selectedStateAbbr && b.state !== selectedStateAbbr) return false;
      return true;
    });
  }, [layers, activeComps, tier, selectedStateAbbr]);

  useEffect(() => {
    if (!layers) return;
    setLayer('military', true);
    setLens(mapMode === 'terrain' ? null : 'veterans');
    const AREA_CAP = 3000;
    const bubbles: MapBubbleSpec[] = visibleBases.map((b, i) => ({
      id: b.id ?? `mil_${i}`,
      label: b.name,
      sublabel: `${COMP_META[b.component]?.label ?? b.component}${b.area_km2 ? ` · ${fmtCount3(b.area_km2)} km²` : ''} · ${b.state}`,
      x: b.x,
      y: b.y,
      radiusPx: b.area_km2 ? 2.8 + Math.sqrt(Math.min(AREA_CAP, b.area_km2) / AREA_CAP) * 12 : 2.8,
      color: COMP_META[b.component]?.color ?? '#9a9aa8',
    }));
    setAdvisorVisuals(bubbles, false);
    return () => setHoveredBubbleId(null);
  }, [layers, visibleBases, mapMode, setLayer, setLens, setAdvisorVisuals, setHoveredBubbleId]);

  const milNat = meta.nation.military_national;
  const defNat = meta.nation.defense_national;

  const stateMetricRows = useMemo(() => {
    return defenseStates
      .map((s) => {
        const off = geoScope === 'conus' && (s.abbr === 'AK' || s.abbr === 'HI') ? '非本土' : undefined;
        if (stMetric === 'troops') {
          const a = s.military_active ?? 0, r = s.military_reserve ?? 0, c = s.military_civilian ?? 0;
          const tot = s.military_total ?? (a + r + c);
          return { id: s.abbr, fips: s.fips, label: s.name, sublabel: off, total: tot, totalText: fmtCount3(tot), parts: { active: a, guard: r, civ: c } };
        }
        if (stMetric === 'dollars') {
          const con = s.defense_contracts_musd ?? 0, pay = s.defense_payroll_musd ?? 0, gr = s.defense_grants_musd ?? 0;
          const tot = s.defense_spending_musd ?? (con + pay + gr);
          return { id: s.abbr, fips: s.fips, label: s.name, sublabel: off, total: tot, totalText: fmtMoney3(tot * 1e6), parts: { contracts: con, payroll: pay, grants: gr } };
        }
        if (stMetric === 'perres') {
          const v = s.defense_per_resident ?? 0;
          return { id: s.abbr, fips: s.fips, label: s.name, sublabel: off, total: v, totalText: `$${v.toLocaleString()}`, parts: { v } };
        }
        const g = s.defense_pct_gdp ?? 0;
        return { id: s.abbr, fips: s.fips, label: s.name, sublabel: off, total: g, totalText: `${(g * 100).toFixed(1)}%`, parts: { v: g } };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [defenseStates, stMetric, geoScope]);

  const selectedStateRec = defenseStates.find((s) => s.abbr === selectedStateAbbr) ?? null;

  const garrisons = useMemo(
    () => cities.filter((c) => c.garrison_tier).sort((a, b) => (b.armed_forces_pct ?? 0) - (a.armed_forces_pct ?? 0)),
    [cities],
  );

  const vetRows = useMemo(() => {
    if (vetLevel === 'states') {
      return states.map((s) => ({
        id: s.fips,
        name: s.name,
        sub: '',
        vet: s.veterans ?? 0,
        vetPct: s.veterans_pct ?? 0,
        afPct: s.armed_forces_pct ?? 0,
        hexIds: stateHexMap.get(s.fips) ?? [],
        fly: [s.x, s.y] as [number, number],
      }));
    }
    if (vetLevel === 'metros') {
      return cities.map((c) => ({
        id: c.id,
        name: c.short_name,
        sub: c.state_abbr,
        vet: c.veterans ?? 0,
        vetPct: c.veterans_pct ?? 0,
        afPct: c.armed_forces_pct ?? 0,
        hexIds: c.hex_ids,
        fly: [c.x, c.y] as [number, number],
      }));
    }
    return (counties?.rows ?? [])
      .filter((r) => Number(r.pop ?? 0) >= 10000 && typeof r.veterans === 'number')
      .map((r) => ({
        id: r.fips,
        name: r.name,
        sub: r.state,
        vet: Number(r.veterans_count ?? 0),
        vetPct: Number(r.veterans ?? 0),
        afPct: Number(r.armed_forces_pct ?? 0),
        hexIds: r.hex_ids,
        fly: [r.x, r.y] as [number, number],
      }));
  }, [vetLevel, states, cities, counties, stateHexMap]);

  if (!layers) return null;

  const ranges = layers.military_ranges ?? [];

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: '全美现役兵力', value: fmtCount3(milNat?.active ?? 1172769), sub: `+ ${fmtCount3(milNat?.guard_reserve ?? 741396)} 警卫/预备役`, color: '#a9c3d6' },
          { label: '国防总支出', value: fmtMoney3((defNat?.total_musd ?? 606700) * 1e6), sub: `占 GDP ${((defNat?.pct_gdp ?? 0.0207) * 100).toFixed(1)}% · FY2024` },
          { label: '退伍军人', value: fmtCount3(meta.nation.veterans_total ?? 16185883), sub: '18岁+ 平民 (ACS 5-Yr)' },
        ]}
      />

      <CalloutNote>
        国防部不公开单个军事基地的编制人数，因此地图气泡面积严格按 MIRTA 基地边界的陆地面积缩放（封顶 3,000 km²）。下表兵力统计为 DMDC 州级官方编制数据。
      </CalloutNote>

      <MapPickerBar
        value={mapMode}
        options={[{ value: 'terrain', label: '立体地形' }, { value: 'veterans', label: '退伍军人占比' }]}
        onChange={(v) => setMapMode(v as 'terrain' | 'veterans')}
      />

      {/* 1. Installations */}
      <div className="space-y-2">
        <SectionTitle title="军事基地与设施 · Installations" kicker="DOD MIRTA FY2025" note="筛选军种与基地等级；悬停点亮基地气泡，点击飞镜查看。" />
        <div className="flex flex-wrap gap-1">
          {COMP_GROUPS.map((g) => (
            <button key={g.id} type="button" onClick={() => setCompSet(new Set(g.ids))} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-semibold cursor-pointer">
              {g.label}
            </button>
          ))}
          <button type="button" onClick={() => setCompSet(null)} className="px-2 py-0.5 rounded bg-[var(--brass-soft)] text-[10px] font-semibold cursor-pointer" style={{ color: 'var(--brass-bright)' }}>全选</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {allComps.map((cid) => {
            const cnt = layers.military_bases.filter((b) => b.component === cid).length;
            if (cnt === 0) return null;
            const on = activeComps.has(cid);
            return (
              <button
                key={cid}
                type="button"
                onClick={() => {
                  const next = new Set(activeComps);
                  if (next.has(cid)) next.delete(cid); else next.add(cid);
                  setCompSet(next.size === allComps.length ? null : next);
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] border transition cursor-pointer flex items-center gap-1 ${
                  on ? 'border-white/35 bg-white/10 font-semibold' : 'border-white/10 opacity-35'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: COMP_META[cid].color }} />
                {COMP_META[cid].label} <span className="opacity-60 font-mono-num">{cnt}</span>
              </button>
            );
          })}
        </div>
        <Segmented
          value={tier}
          options={[{ value: 'major', label: '核心 Major' }, { value: 'big', label: '核心 + 基地' }, { value: 'all', label: '全部站点' }]}
          onChange={(v) => setTier(v as 'major' | 'big' | 'all')}
        />
        <SizeLegend caption="圆面积 = 基地边界陆地面积" items={[{ label: '100 km²', r: 5 }, { label: '1,000 km²', r: 9 }, { label: '3,000+ km²', r: 14 }]} />
        <SortableTable
          rows={visibleBases.map((b, i) => ({ id: b.id ?? `mil_${i}`, b }))}
          defaultSort="area"
          searchPlaceholder="搜索基地名称、州..."
          searchText={(r) => `${r.b.name} ${r.b.state} ${COMP_META[r.b.component]?.label ?? ''}`}
          maxHeight={230}
          columns={[
            {
              key: 'name',
              label: '基地',
              align: 'l',
              value: (r) => r.b.name,
              render: (r) => (
                <span className="inline-flex items-center gap-1.5 max-w-[165px] truncate">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COMP_META[r.b.component]?.color ?? '#999' }} />
                  <span className="truncate">{r.b.name}</span>
                </span>
              ),
            },
            { key: 'comp', label: '军种', align: 'l', value: (r) => COMP_META[r.b.component]?.label ?? r.b.component },
            { key: 'state', label: '州', align: 'l', value: (r) => r.b.state },
            { key: 'area', label: '面积', value: (r) => r.b.area_km2 ?? -1, render: (r) => r.b.area_km2 ? `${fmtCount3(r.b.area_km2)} km²` : '–' },
          ]}
          onHover={(r) => {
            setHoveredBubbleId(r ? r.id : null);
            setBrushed(r?.b.cells ? new Set(r.b.cells) : null, r?.b.name);
          }}
          onClick={(r) => onFlyTo(r.b.x, r.b.y, 1.5)}
        />
      </div>

      {/* 2. Troops and Dollars by State + State Detail Card */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="各州驻军与国防支出 · Troops & Dollars by State" note="DMDC 驻地编制 + OLDCC FY2024 国防支出。点击任一州展开军种构成、防务承包商与合同大县。" />
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <Segmented
            value={stMetric}
            options={[{ value: 'troops', label: '兵力' }, { value: 'dollars', label: '防务金额' }, { value: 'perres', label: '人均' }, { value: 'gdp', label: '% GDP' }]}
            onChange={(v) => setStMetric(v as 'troops' | 'dollars' | 'perres' | 'gdp')}
          />
          <button type="button" onClick={() => setShowAllStates((v) => !v)} className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-semibold cursor-pointer">
            {showAllStates ? '仅前 15 州' : `全部 ${stateMetricRows.length} 州`}
          </button>
        </div>
        <StackedBarList
          rows={showAllStates ? stateMetricRows : stateMetricRows.slice(0, 15)}
          activeId={selectedStateAbbr}
          keys={
            stMetric === 'troops'
              ? [{ key: 'active', label: '现役', color: '#6f91ad' }, { key: 'guard', label: '警卫与预备役', color: '#d6b04a' }, { key: 'civ', label: 'DoD 文职', color: '#9a9aa8' }]
              : stMetric === 'dollars'
                ? [{ key: 'contracts', label: '防务合同', color: '#d9a457' }, { key: 'payroll', label: '军民薪资', color: '#6f91ad' }, { key: 'grants', label: '联邦拨款', color: '#8fcbb8' }]
                : [{ key: 'v', label: stMetric === 'perres' ? '人均防务 $' : '占州 GDP %', color: stMetric === 'perres' ? '#d9a457' : '#c46a4f' }]
          }
          onHover={(abbr) => {
            if (!abbr) { setBrushed(null, null); return; }
            const s = states.find((x) => x.abbr === abbr);
            if (s) setBrushed(new Set(stateHexMap.get(s.fips) ?? []), s.name);
          }}
          onClick={(abbr) => setSelectedStateAbbr(selectedStateAbbr === abbr ? null : abbr)}
        />
        {stMetric === 'troops' && <SwatchLegend items={[{ label: '现役', color: '#6f91ad' }, { label: '警卫/预备役', color: '#d6b04a' }, { label: 'DoD 文职', color: '#9a9aa8' }]} />}
        {stMetric === 'dollars' && <SwatchLegend items={[{ label: '防务合同', color: '#d9a457' }, { label: '军民薪资', color: '#6f91ad' }, { label: '联邦拨款', color: '#8fcbb8' }]} />}

        {selectedStateRec && (
          <div className="p-2.5 rounded-lg border border-[var(--brass)] bg-[var(--surface-paper-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-xs">{selectedStateRec.name} · 国防详情</span>
              <button type="button" onClick={() => setSelectedStateAbbr(null)} className="text-[10px] underline cursor-pointer">清除筛选</button>
            </div>
            <KpiTiles
              items={[
                { label: '现役兵力', value: (selectedStateRec.military_active ?? 0).toLocaleString(), sub: `警卫/预备 ${(selectedStateRec.military_reserve ?? 0).toLocaleString()}` },
                { label: '防务总额', value: fmtMoney3((selectedStateRec.defense_spending_musd ?? 0) * 1e6), sub: `${((selectedStateRec.defense_pct_gdp ?? 0) * 100).toFixed(1)}% GDP · $${(selectedStateRec.defense_per_resident ?? 0).toLocaleString()}/人` },
                { label: '基地站点', value: String(layers.military_bases.filter((b) => b.state === selectedStateRec.abbr).length), sub: 'MIRTA 登记' },
              ]}
            />
            <div className="text-[10.5px] opacity-80 leading-relaxed">
              <b>现役各军种：</b>
              {Object.entries(selectedStateRec.military_by_branch).filter(([, v]) => v > 0).map(([k, v]) => `${k.split(' ')[0]} ${v.toLocaleString()}`).join(' · ')}
              ；DoD 文职 {(selectedStateRec.military_civilian ?? 0).toLocaleString()} 人。
            </div>
            <div className="text-[10.5px] opacity-80">
              <b>资金去向：</b>合同 {fmtMoney3((selectedStateRec.defense_contracts_musd ?? 0) * 1e6)} · 薪资 {fmtMoney3((selectedStateRec.defense_payroll_musd ?? 0) * 1e6)} · 拨款 {fmtMoney3((selectedStateRec.defense_grants_musd ?? 0) * 1e6)}
            </div>
            {selectedStateRec.defense_top_vendors && selectedStateRec.defense_top_vendors.length > 0 && (
              <div className="text-[10.5px] opacity-80">
                <b>头部承包商：</b>
                {selectedStateRec.defense_top_vendors.map((v) => `${v.name} (${fmtMoney3(v.contracts_musd * 1e6)})`).join(' · ')}
              </div>
            )}
            {selectedStateRec.defense_top_counties && selectedStateRec.defense_top_counties.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedStateRec.defense_top_counties.map((c) => (
                  <span key={c.name} className="px-1.5 py-0.5 rounded bg-black/30 text-[10px]">
                    {c.name} <b>{fmtMoney3(c.contracts_musd * 1e6)}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Garrison Cities */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title={`驻军都会区 (${garrisons.length}) · Garrison Cities`} note="含现役基地或禁区且现役居民 ≥1%（或 ≥2,000 人且 ≥0.3%）；≥3% 授「要塞 Fortress」，海军/陆战队为主标 ⚓。" />
        <SortableTable
          rows={garrisons.map((c) => ({ id: c.id, c }))}
          defaultSort="share"
          searchPlaceholder="搜索驻军都会区..."
          searchText={(r) => `${r.c.short_name} ${r.c.state_abbr}`}
          maxHeight={220}
          columns={[
            { key: 'name', label: '都会区', align: 'l', value: (r) => r.c.short_name, render: (r) => <span>{r.c.short_name} <span className="opacity-50 text-[10px]">{r.c.state_abbr}</span></span> },
            { key: 'tier', label: '等级', align: 'l', value: (r) => (r.c.garrison_tier === 'fortress' ? 0 : 1), render: (r) => `${r.c.garrison_tier === 'fortress' ? '要塞' : '驻军'}${r.c.garrison_naval ? ' ⚓' : ''}` },
            { key: 'af', label: '现役居民', value: (r) => r.c.armed_forces ?? 0, render: (r) => fmtCount3(r.c.armed_forces) },
            { key: 'share', label: '占比', value: (r) => r.c.armed_forces_pct ?? 0, render: (r) => `${((r.c.armed_forces_pct ?? 0) * 100).toFixed(1)}%`, barMax: Math.max(0.05, garrisons[0]?.armed_forces_pct ?? 0.1), barColor: 'rgba(135,150,171,0.38)' },
          ]}
          onHover={(r) => setBrushed(r ? new Set(r.c.hex_ids) : null, r?.c.short_name)}
          onClick={(r) => openCity(r.id)}
        />
        <p className="text-[10.5px] opacity-65 m-0 leading-snug">
          ⚓ 海军/陆战队标识：都会区内符合条件的海军与陆战队基地权重高于陆军与空军（核心基地计 4 分、普通基地计 1 分）。大型都会区按人数达标须同时满足现役居民 ≥ 2,000 人且占 16 岁+ 居民 ≥ 0.3%。
        </p>
      </div>

      {/* 4. Top 30 Military Ranges */}
      {ranges.length > 0 && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <SectionTitle title="大型军事靶场与禁区 · Ranges & Restricted Ground" note="面积最大的 30 处 DoD 边界（≥400 km²）；悬停在地图高亮对应军事禁区六边形。" />
          <SortableTable
            rows={ranges.map((r) => ({ id: r.id, r }))}
            defaultSort="area"
            maxHeight={210}
            columns={[
              {
                key: 'name',
                label: '禁区名称',
                align: 'l',
                value: (x) => x.r.name,
                render: (x) => (
                  <span className="inline-flex items-center gap-1.5 max-w-[180px] truncate">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COMP_META[x.r.component]?.color ?? '#999' }} />
                    <span className="truncate">{x.r.name}</span>
                  </span>
                ),
              },
              { key: 'state', label: '州', align: 'l', value: (x) => x.r.state },
              { key: 'area', label: '面积', value: (x) => x.r.area_km2, render: (x) => `${fmtCount3(x.r.area_km2)} km²`, barMax: ranges[0]?.area_km2 ?? 1, barColor: 'rgba(194,74,62,0.32)' },
            ]}
            onHover={(x) => setBrushed(x ? new Set(x.r.cells) : null, x?.r.name)}
            onClick={(x) => onFlyTo(x.r.x, x.r.y, 1.1)}
          />
        </div>
      )}

      {/* 5. Veterans & Troops at Home */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
        <SectionTitle title="退伍军人与现役居民 · Veterans & Troops at Home" note="ACS 5-Yr 按居住地统计（县级口径过滤 1 万人以上县）。" />
        <Segmented
          value={vetLevel}
          options={[{ value: 'states', label: '各州' }, { value: 'metros', label: '都会区' }, { value: 'counties', label: '县 (10K+)' }]}
          onChange={(v) => setVetLevel(v as 'states' | 'metros' | 'counties')}
        />
        <SortableTable
          key={vetLevel}
          rows={vetRows}
          defaultSort="vetPct"
          searchPlaceholder="搜索地区..."
          searchText={(r) => `${r.name} ${r.sub}`}
          maxHeight={220}
          columns={[
            { key: 'name', label: '地区', align: 'l', value: (r) => r.name, render: (r) => <span>{r.name} {r.sub && <span className="opacity-50 text-[10px]">{r.sub}</span>}</span> },
            { key: 'vet', label: '退伍军人', value: (r) => r.vet, render: (r) => fmtCount3(r.vet) },
            { key: 'vetPct', label: '退伍占比', value: (r) => r.vetPct, render: (r) => `${(r.vetPct * 100).toFixed(1)}%`, barMax: 0.2, barColor: 'rgba(135,150,171,0.35)' },
            { key: 'afPct', label: '现役占比', value: (r) => r.afPct, render: (r) => `${(r.afPct * 100).toFixed(1)}%` },
          ]}
          onHover={(r) => setBrushed(r ? new Set(r.hexIds) : null, r?.name)}
          onClick={(r) => (vetLevel === 'states' ? openState(r.id) : vetLevel === 'metros' ? openCity(r.id) : onFlyTo(r.fly[0], r.fly[1], 1.4))}
        />
        <p className="text-[10.5px] opacity-65 m-0">县级列表仅统计 1 万人口以上的县（极小人口县的抽样误差较大）。</p>
      </div>

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['mirta', 'dmdc_personnel', 'oldcc_spending', 'acs_5yr']}
        notes={[
          '基地坐标与面积来自 DoD MIRTA FY2025（不含海岸警卫队）；因国防部不公布单基地人数，气泡严格按多边形陆地面积缩放，外加 28 座占地小但地位核心的旗舰基地。',
          '兵力统计按服役驻地州归集（DMDC），不含机密部署与临时外派人员；国防合同按履约发生地归集（OLDCC FY2024），并非基地所在地。',
          '基地等级（核心 Major / 基地 Base / 站点 Site）仅由陆地面积与军种决定，不反映编制人数（大型无人靶场面积大，而五角大楼类总部占地小但人员众多）。',
          '2025 年 6 月陆军恢复原名的 7 座基地（Fort Hood/Polk/Rucker/Gordon/Lee/A.P. Hill/Pickett）已同步更新为现行名称。',
          '阿拉斯加与夏威夷在各州防务总表中完整保留（在本土 48 州口径下标为「非本土」）。',
        ]}
      />
    </div>
  );
};

/* ============================================================================
 * 9. CULTURE ADVISOR (4-Rule Wonders, Faith Tradition ShareBar + States, CDC Amenities Hist + Table, FEMA 6-Type + Recent + NOAA Costliest!)
 * ============================================================================ */
const DIS_COLORS: Record<string, string> = {
  hurricane: '#4f9ad6',
  flood: '#2fa4b8',
  fire: '#e8774a',
  severe_storm: '#9a7bc9',
  winter: '#c9dcef',
  other: '#9a9aa8',
};
const WONDER_RULES = [
  { id: 'national_park', title: '国家公园 Top 15 · National Parks', kind: 'natural', color: '#6aa84f', note: '按 2025 年 NPS 休闲游客量评选全美本土前 15 座国家公园。' },
  { id: 'park_unit', title: '其他公园单元 Top 5 · Other Park Units', kind: 'natural', color: '#6aa84f', note: '排除景观公路/步道/河流后的前 5 游憩区与国家纪念碑（国家广场合并计最高单碑）。' },
  { id: 'research_university', title: 'R1 研究型大学 Top 20 · Research Universities', kind: 'academic', color: '#4a86d6', note: '按 NSF HERD FY2025 研发总支出评选 Carnegie R1 大学前 20（每都会区最多 2 所）。' },
  { id: 'landmark', title: '标志性历史地标 Top 12 · Curated Landmarks', kind: 'heritage', color: '#e0b54c', note: '策展精选 12 处全美标志性国家历史地标与国家纪念地（按字母顺序排列，每都会区最多 1 处，不与公园规则重复）。' },
];

export const CultureView: React.FC<AdvisorViewProps> = ({ meta, states, allStates, layers, counties, stateHexMap, onFlyTo }) => {
  const { setLens, setBrushed, setAdvisorVisuals, setHoveredBubbleId, openState } = useAppStore();
  const [mapMode, setMapMode] = useState('terrain');
  const [wonderKind, setWonderKind] = useState<'all' | 'natural' | 'academic' | 'heritage'>('all');
  const [faithOrder, setFaithOrder] = useState<'most' | 'fewest'>('most');

  useEffect(() => {
    setLens(mapMode === 'terrain' ? null : mapMode);
    if (!layers) return;
    const vis = layers.wonders.filter((w) => wonderKind === 'all' || w.kind === wonderKind);
    const kCol = { natural: '#6aa84f', academic: '#4a86d6', heritage: '#e0b54c' };
    const bubbles: MapBubbleSpec[] = vis.map((w) => ({
      id: w.id,
      label: w.name,
      sublabel: `#${w.rank} · ${w.metric_label}`,
      x: w.x,
      y: w.y,
      radiusPx: 7.5,
      color: kCol[w.kind],
      stroke: '#FFF6D8',
    }));
    setAdvisorVisuals(bubbles, false);
    return () => setHoveredBubbleId(null);
  }, [mapMode, wonderKind, layers, setLens, setAdvisorVisuals, setHoveredBubbleId]);

  const noaa = meta.nation.noaa_national;
  const fema = meta.nation.fema_national;
  const femaTypes = meta.fema_types ?? [];
  const tradLens = meta.lenses.find((l) => l.id === 'faith_tradition');

  const tradPopShares = useMemo(() => {
    if (!counties || !tradLens?.categories) return [];
    const map = new Map<string, { pop: number; hexIds: number[] }>();
    for (const c of tradLens.categories) map.set(c.label, { pop: 0, hexIds: [] });
    for (const r of counties.rows) {
      const lbl = String(r.faith_tradition ?? '');
      const rec = map.get(lbl);
      if (rec) {
        rec.pop += Number(r.pop ?? 0);
        for (const h of r.hex_ids) rec.hexIds.push(h);
      }
    }
    return tradLens.categories.map((c) => ({
      key: c.label,
      label: c.label,
      value: map.get(c.label)?.pop ?? 0,
      color: c.color,
      valueText: fmtCount3(map.get(c.label)?.pop ?? 0),
      hexIds: map.get(c.label)?.hexIds ?? [],
    }));
  }, [counties, tradLens]);

  const faithStateList = useMemo(() => {
    return states
      .filter((s) => s.faith_rate != null)
      .sort((a, b) => (faithOrder === 'most' ? b.faith_rate! - a.faith_rate! : a.faith_rate! - b.faith_rate!))
      .slice(0, 10);
  }, [states, faithOrder]);

  if (!layers) return null;

  const parkCount = layers.wonders.filter((w) => w.kind === 'natural').length;
  const univCount = layers.wonders.filter((w) => w.kind === 'academic').length;
  const lmCount = layers.wonders.filter((w) => w.kind === 'heritage').length;

  return (
    <div className="space-y-4">
      <KpiTiles
        items={[
          { label: '公开规则奇观', value: String(layers.wonders.length), sub: `${parkCount} 公园 · ${univCount} 高校 · ${lmCount} 地标`, color: '#c25b9a' },
          { label: '国家公园年游客', value: fmtCount3(meta.nation.park_visits ?? 323014305), sub: '全美 NPS 2025 总计' },
          { label: '$1B+ 气象灾害', value: String(noaa?.events ?? 403), sub: `${noaa?.years.join('–') ?? '1980–2024'} · ${fmtMoney3((noaa?.cost_busd ?? 2917.6) * 1e9)}` },
        ]}
      />

      <MapPickerBar
        value={mapMode}
        options={[
          { value: 'terrain', label: '地形' },
          { value: 'faith', label: '宗教信徒' },
          { value: 'faith_tradition', label: '主导宗派' },
          { value: 'amenities', label: '健康宜居' },
          { value: 'disasters', label: '灾害频次' },
        ]}
        onChange={setMapMode}
      />

      {/* 1. Wonders by 4 Published Rules */}
      <div className="space-y-2">
        <SectionTitle title="奇观名录 · Wonders by Published Rule" kicker="NPS · NSF HERD · NHL" note="悬停在地图点亮奇观坐标，点击飞镜前往。" />
        <Segmented
          value={wonderKind}
          options={[
            { value: 'all', label: '全部' },
            { value: 'natural', label: '自然公园' },
            { value: 'academic', label: '研究高校' },
            { value: 'heritage', label: '历史地标' },
          ]}
          onChange={(v) => setWonderKind(v as 'all' | 'natural' | 'academic' | 'heritage')}
        />
        {WONDER_RULES.filter((rl) => wonderKind === 'all' || rl.kind === wonderKind).map((rl) => {
          const list = layers.wonders.filter((w) => w.rule_id === rl.id);
          if (list.length === 0) return null;
          return (
            <div key={rl.id} className="space-y-1">
              <div className="text-[11px] font-bold mt-2" style={{ color: rl.color }}>{rl.title}</div>
              <div className="text-[10px] opacity-65">{rl.note}</div>
              <LinkedBarList
                compact
                ranked={rl.id !== 'landmark'}
                rows={list.map((w) => ({
                  id: w.id,
                  label: w.name,
                  sublabel: w.state,
                  value: w.metric,
                  valueText: w.metric_label,
                  color: rl.color,
                }))}
                onHover={(id) => setHoveredBubbleId(id)}
                onClick={(r) => { const w = layers.wonders.find((x) => x.id === r.id); if (w) onFlyTo(w.x, w.y, 1.45); }}
              />
            </div>
          );
        })}
      </div>

      {/* 2. Faith */}
      {counties && tradPopShares.length > 0 && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <SectionTitle title="宗教信仰版图 · Faith" kicker="2020 U.S. RELIGION CENSUS" />
          <CalloutNote>
            宗教普查按教会礼拜堂所在县统计信徒数（非居民户籍地），因此跨县礼拜可使部分县每百人信徒数超过 100；康州因旧县制未匹配而如实留白。
          </CalloutNote>
          <div className="text-[10.5px] font-semibold opacity-80">各宗派居首县的常住人口分布（悬停联动地图）：</div>
          <ShareBar
            showLegend
            segments={tradPopShares}
            onHover={(k) => {
              const found = tradPopShares.find((x) => x.key === k);
              setBrushed(found ? new Set(found.hexIds) : null, k ?? undefined);
            }}
            onSelect={() => setMapMode('faith_tradition')}
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10.5px] opacity-75">各州每百人信徒数 ≈</span>
            <Segmented
              value={faithOrder}
              options={[{ value: 'most', label: '最高 Top 10' }, { value: 'fewest', label: '最低 Top 10' }]}
              onChange={(v) => setFaithOrder(v as 'most' | 'fewest')}
            />
          </div>
          <LinkedBarList
            compact
            ranked
            maxVal={100}
            rows={faithStateList.map((s) => ({
              id: s.fips,
              label: s.name,
              value: Math.min(100, s.faith_rate!),
              valueText: `${s.faith_rate!.toFixed(0)} / 百人`,
              color: '#a87bc7',
            }))}
            onHover={(id) => setBrushed(id ? new Set(stateHexMap.get(id) ?? []) : null, id ?? undefined)}
            onClick={(r) => { setMapMode('faith'); openState(r.id); }}
          />
        </div>
      )}

      {/* 3. Amenities & Wellbeing (CDC PLACES) */}
      {counties && (
        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
          <SectionTitle title="健康宜居度 · Amenities & Wellbeing" kicker="CDC PLACES 2025" note="由 4 项成人身心健康年龄调整率反向合成（100 = 全美均值）。肯塔基与宾夕法尼亚州在本期数据中缺失，严格留白绝不插补。" />
          <InteractiveHistogram
            values={counties.rows.filter((r) => typeof r.amenities === 'number').map((r) => ({ val: r.amenities as number, pop: Number(r.pop ?? 0), hexIds: r.hex_ids }))}
            bins={30}
            domain={[75, 130]}
            marker={{ value: 100, label: '全美均线 100' }}
            fmt="index"
            ramp="amenities"
            onHoverRange={(hids, lbl) => setBrushed(hids, lbl)}
          />
          <SortableTable
            rows={counties.rows.filter((r) => typeof r.amenities === 'number' && Number(r.pop ?? 0) >= 50000).map((r) => ({
              id: r.fips,
              row: r,
              name: r.name,
              sub: r.state,
              amen: r.amenities as number,
              mhlth: r.mhlth as number | null,
              lone: r.loneliness as number | null,
            }))}
            defaultSort="amen"
            searchPlaceholder="搜索 5 万+ 人口县..."
            searchText={(r) => `${r.name} ${r.sub}`}
            maxHeight={220}
            columns={[
              { key: 'name', label: '县区 (50K+)', align: 'l', value: (r) => r.name, render: (r) => <span>{r.name} <span className="opacity-50 text-[10px]">{r.sub}</span></span> },
              { key: 'amen', label: '宜居指数', value: (r) => r.amen, render: (r) => r.amen.toFixed(1), barMax: 130, barColor: 'rgba(126,207,142,0.3)' },
              { key: 'mhlth', label: '心理困扰', value: (r) => r.mhlth, render: (r) => r.mhlth != null ? `${(r.mhlth * 100).toFixed(1)}%` : '–' },
              { key: 'lone', label: '孤独感', value: (r) => r.lone, render: (r) => r.lone != null ? `${(r.lone * 100).toFixed(1)}%` : '–' },
            ]}
            onHover={(r) => setBrushed(r ? new Set(r.row.hex_ids) : null, r?.name)}
            onClick={(r) => onFlyTo(r.row.x, r.row.y, 1.4)}
          />
        </div>
      )}

      {/* 4. Disasters (FEMA 6-Type + State Table + Most-Declared Counties + Recent 12 Mo + NOAA Annual & Costliest!) */}
      <div className="pt-2 border-t border-[var(--border-hairline)] space-y-3">
        <SectionTitle title="联邦灾害记录 · Disasters" kicker="FEMA MAJOR DECLARATIONS · NOAA $1B+ EVENTS" />
        <CalloutNote>
          FEMA 重大灾害声明（DR，排除新冠生物灾害与应急声明）属于启动联邦援助的行政行为，不等同于灾损金额；NOAA 十亿美元级灾害为 CPI 通胀调整后的跨州分摊损失。
        </CalloutNote>

        {fema && (
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-semibold">2000 年以来全美 {fema.total.toLocaleString()} 起独立重大灾害声明（按 6 大类型）：</div>
            <ShareBar
              showLegend
              segments={femaTypes.map((t) => ({
                key: t.id,
                label: t.label,
                value: fema.by_type[t.id] ?? 0,
                color: DIS_COLORS[t.id] ?? '#999',
                valueText: String(fema.by_type[t.id] ?? 0),
              }))}
              onHover={(tid) => {
                if (!tid || !counties) { setBrushed(null, null); return; }
                const hids = new Set<number>();
                for (const r of counties.rows) {
                  if ((r.fema_by_type?.[tid] ?? 0) > 0) for (const h of r.hex_ids) hids.add(h);
                }
                setBrushed(hids, femaTypes.find((x) => x.id === tid)?.label);
              }}
              onSelect={() => setMapMode('disasters')}
            />
          </div>
        )}

        {/* By State: FEMA + NOAA (all 57 states & territories matching reference!) */}
        <div>
          <div className="text-[10.5px] font-semibold mb-1.5">各州及属地灾害频次与 NOAA 十亿美元级损失 · By State</div>
          {(() => {
            const stByAbbr = new Map((allStates ?? states).map((s) => [s.abbr, s]));
            const femaAll = meta.nation.fema_states_all ?? {};
            const abbrs = Array.from(new Set([...states.map((s) => s.abbr), ...Object.keys(femaAll)]));
            const stRows = abbrs.map((abbr) => {
              const s = stByAbbr.get(abbr);
              const onMap = states.some((x) => x.abbr === abbr);
              return {
                id: s?.fips ?? abbr,
                abbr,
                name: s?.name ?? abbr,
                onMap,
                fema: femaAll[abbr]?.total ?? s?.fema_total ?? 0,
                events: s?.noaa_billion_events ?? null,
                cost: s?.noaa_billion_cost_busd ?? null,
              };
            });
            const maxCost = Math.max(100, ...stRows.map((x) => x.cost ?? 0));
            return (
              <SortableTable
                rows={stRows}
                defaultSort="cost"
                searchPlaceholder="搜索州或属地..."
                searchText={(r) => `${r.name} ${r.abbr}`}
                maxHeight={220}
                columns={[
                  { key: 'name', label: '州/属地', align: 'l', value: (r) => r.name, render: (r) => <span>{r.name}{!r.onMap && <span className="opacity-45 text-[9.5px] ml-1">非本土</span>}</span> },
                  { key: 'fema', label: 'FEMA 声明', value: (r) => r.fema },
                  { key: 'events', label: '$1B+ 次数', value: (r) => r.events, render: (r) => (r.events != null ? String(r.events) : '–') },
                  { key: 'cost', label: '分摊损失', value: (r) => r.cost, render: (r) => (r.cost != null ? `$${r.cost.toFixed(1)}B` : '–'), barMax: maxCost, barColor: 'rgba(232,119,74,0.32)' },
                ]}
                onHover={(r) => setBrushed(r && r.onMap ? new Set(stateHexMap.get(r.id) ?? []) : null, r?.name)}
                onClick={(r) => { if (r.onMap) openState(r.id); }}
              />
            );
          })()}
          <p className="text-[10.5px] opacity-65 mt-1 mb-0">
            NOAA 十亿美元级灾害常跨越多个州：表中各州金额为该州分摊的 CPI 调整后损失，切勿将各州损失或次数直接相加（1980–2024 为 NOAA 最终定版系列）。
          </p>
        </div>

        {/* Most-declared Counties */}
        {counties && (
          <div>
            <div className="text-[10.5px] font-semibold mb-1.5">重大灾害声明最多县区 · Most-Declared Counties</div>
            <SortableTable
              rows={counties.rows.filter((r) => Number(r.disasters ?? 0) > 0).map((r) => ({
                id: r.fips,
                row: r,
                name: r.name,
                sub: r.state,
                cnt: Number(r.disasters ?? 0),
                top: femaTypes.find((t) => t.id === r.fema_top_type)?.label.slice(0, 4) ?? '风暴',
                last: String(r.fema_last_date ?? '–'),
              }))}
              defaultSort="cnt"
              searchPlaceholder="搜索灾害县区..."
              searchText={(r) => `${r.name} ${r.sub}`}
              maxHeight={200}
              columns={[
                { key: 'name', label: '县区', align: 'l', value: (r) => r.name, render: (r) => <span>{r.name} <span className="opacity-50 text-[10px]">{r.sub}</span></span> },
                { key: 'cnt', label: '次数', value: (r) => r.cnt, barMax: 45, barColor: 'rgba(207,106,74,0.32)' },
                { key: 'top', label: '主导类型', align: 'l', value: (r) => r.top },
                { key: 'last', label: '最近', align: 'l', value: (r) => r.last },
              ]}
              onHover={(r) => setBrushed(r ? new Set(r.row.hex_ids) : null, r?.name)}
              onClick={(r) => onFlyTo(r.row.x, r.row.y, 1.4)}
            />
          </div>
        )}

        {/* Recent 12 months declarations */}
        {fema && fema.recent.length > 0 && (
          <div>
            <div className="text-[10.5px] font-semibold mb-1.5">近 12 个月最新重大灾害声明（截至 {fema.as_of}）</div>
            <SortableTable
              rows={fema.recent.map((ev) => ({ id: ev.disaster, ev }))}
              defaultSort="date"
              ranked={false}
              maxHeight={190}
              columns={[
                { key: 'date', label: '日期', align: 'l', value: (r) => r.ev.date },
                { key: 'state', label: '州', align: 'l', value: (r) => r.ev.state },
                {
                  key: 'title',
                  label: '灾害事件',
                  align: 'l',
                  value: (r) => r.ev.title,
                  render: (r) => (
                    <span className="inline-flex items-center gap-1 max-w-[165px] truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DIS_COLORS[r.ev.type] ?? '#999' }} />
                      <span className="truncate">{r.ev.title}</span>
                    </span>
                  ),
                },
                { key: 'areas', label: '受灾区', value: (r) => r.ev.areas, render: (r) => (r.ev.statewide ? '全州' : String(r.ev.areas)) },
              ]}
              onHover={(r) => {
                if (!r || !counties) { setBrushed(null, null); return; }
                const hids = new Set<number>();
                if (r.ev.counties.length > 0) {
                  const cs = new Set(r.ev.counties);
                  for (const cr of counties.rows) if (cs.has(cr.fips)) for (const h of cr.hex_ids) hids.add(h);
                } else {
                  const st = states.find((s) => s.abbr === r.ev.state);
                  if (st) for (const h of stateHexMap.get(st.fips) ?? []) hids.add(h);
                }
                setBrushed(hids, r.ev.title);
              }}
            />
          </div>
        )}

        {/* NOAA Annual Timeline + Costliest Events */}
        {noaa && (
          <div className="space-y-2">
            <div className="text-[10.5px] font-semibold">1980–2024 年度十亿美元级气象灾害趋势（NOAA, CPI 调整）</div>
            <AnnualColumnChart items={layers.noaa_timeline} />
            <div className="text-[10.5px] font-semibold pt-1">历史上损失最惨重 Top 10 灾害 · The Costliest</div>
            <ol className="space-y-1 text-[11px] pl-4 list-decimal">
              {noaa.costliest.slice(0, 10).map((e) => (
                <li key={e.name} className="leading-snug">
                  <b>{e.name}</b>{' '}
                  <span className="opacity-65 font-mono-num">
                    ${e.cost_busd.toFixed(1)}B{e.deaths > 0 ? ` · ${e.deaths.toLocaleString()} 人遇难` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <SourcesFooter
        sources={meta.sources}
        sourceIds={['nps_visits', 'herd_rd', 'ipeds', 'nhl_landmarks', 'usrc_2020', 'cdc_places', 'fema_declarations', 'noaa_billions']}
        notes={[
          '国家公园与其他公园单元的游客统计口径不同，因此各自按独立规则排序；12 处历史地标为策展精选，不按数据排名。',
          '高校 R&D 支出包含医学院，部分大学（如 Johns Hopkins、Ohio State、Maryland）与附属医学中心或实验室合并申报。',
          '宗教普查按教会礼拜堂所在县统计信徒数，并非居民户籍地信仰调查；「最大宗派」在信徒比例较低的县可能只是相对多数。',
          'CDC PLACES 健康宜居指数为基于 BRFSS 调查的小区域统计模型估算，并非主观幸福感问卷；KY 与 PA 在本期数据中缺失并严格留白。',
          'FEMA 重大灾害声明属于触发联邦援助的行政决定而非灾损金额；康涅狄格州新规划区承接其覆盖旧县的全部历史声明，可能略有高估。',
          'NOAA 十亿美元级气象灾害按 CPI 通胀调整，跨州事件分摊至各受灾州，不可将各州金额直接求和。',
        ]}
      />
    </div>
  );
};
