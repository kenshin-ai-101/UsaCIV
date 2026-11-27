import React, { useEffect, useMemo } from 'react';
import { Crown, Scale, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatMetric } from '../lenses/lensConfig';
import { MeepleCohortSvg } from '../city/CityCommandPanel';
import { localizeDistrictName, useL } from '../../i18n';
import type { CityRecord, StateRecord, YieldSet } from '../../types/world';

interface ShowdownPanelProps {
  cities: CityRecord[];
  states: StateRecord[];
}

const CITY_PRESETS: { label: string; labelEn: string; aMatch: string; bMatch: string }[] = [
  { label: '硅谷 vs 汽车城', labelEn: 'Silicon Valley vs Detroit', aMatch: 'San Jose', bMatch: 'Detroit' },
  { label: '纽约 vs 旧金山', labelEn: 'New York vs San Francisco', aMatch: 'New York', bMatch: 'San Francisco' },
  { label: '休斯顿 vs 西雅图', labelEn: 'Houston vs Seattle', aMatch: 'Houston', bMatch: 'Seattle' },
  { label: '安克雷奇 vs 檀香山', labelEn: 'Anchorage vs Honolulu', aMatch: 'Anchorage', bMatch: 'Honolulu' },
];

const STATE_PRESETS: { label: string; labelEn: string; aFips: string; bFips: string }[] = [
  { label: '加州 vs 德州', labelEn: 'California vs Texas', aFips: '06', bFips: '48' },
  { label: '纽约 vs 佛州', labelEn: 'New York vs Florida', aFips: '36', bFips: '12' },
  { label: '麻省 vs 密歇根', labelEn: 'Massachusetts vs Michigan', aFips: '25', bFips: '26' },
  { label: '阿拉斯加 vs 夏威夷', labelEn: 'Alaska vs Hawaii', aFips: '02', bFips: '15' },
];

const SixYieldRadar: React.FC<{ a: YieldSet; b: YieldSet; nameA: string; nameB: string }> = ({ a, b, nameA, nameB }) => {
  const { L } = useL();
  const keys: { k: keyof YieldSet; lbl: string }[] = [
    { k: 'gold', lbl: L('金币 GDP', 'Gold GDP') },
    { k: 'sci', lbl: L('科技', 'Science') },
    { k: 'prod', lbl: L('产能', 'Prod') },
    { k: 'food', lbl: L('粮食', 'Food') },
    { k: 'cul', lbl: L('文化', 'Culture') },
    { k: 'faith', lbl: L('信仰', 'Faith') },
  ];
  const cx = 110, cy = 96, R = 68;
  const maxes = keys.map(({ k }) => Math.max(10, a[k], b[k]) * 1.12);

  const poly = (vals: YieldSet) =>
    keys
      .map(({ k }, i) => {
        const ang = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const r = (Math.max(0, vals[k]) / maxes[i]) * R;
        return `${(cx + Math.cos(ang) * r).toFixed(1)},${(cy + Math.sin(ang) * r).toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg width="220" height="192" viewBox="0 0 220 192">
        {[0.33, 0.66, 1].map((f) => (
          <polygon
            key={f}
            points={keys
              .map((_, i) => {
                const ang = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                return `${cx + Math.cos(ang) * R * f},${cy + Math.sin(ang) * R * f}`;
              })
              .join(' ')}
            fill="none"
            stroke="var(--border-hairline)"
            strokeWidth="1"
          />
        ))}
        {keys.map((item, i) => {
          const ang = (Math.PI * 2 * i) / 6 - Math.PI / 2;
          const tx = cx + Math.cos(ang) * (R + 18);
          const ty = cy + Math.sin(ang) * (R + 15);
          return (
            <g key={item.k}>
              <line x1={cx} y1={cy} x2={cx + Math.cos(ang) * R} y2={cy + Math.sin(ang) * R} stroke="var(--border-hairline)" />
              <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="9.5" fill="currentColor" opacity="0.78">
                {item.lbl}
              </text>
            </g>
          );
        })}
        <polygon points={poly(a)} fill="rgba(41, 102, 156, 0.28)" stroke="#29669C" strokeWidth="2" />
        <polygon points={poly(b)} fill="rgba(184, 86, 54, 0.26)" stroke="#B85636" strokeWidth="2" />
      </svg>
      <div className="flex items-center gap-4 text-[11px] font-semibold -mt-1">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-[#29669C] inline-block" />{nameA}</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-[#B85636] inline-block" />{nameB}</span>
      </div>
    </div>
  );
};

export const ShowdownPanel: React.FC<ShowdownPanelProps> = ({ cities, states }) => {
  const { locale, isEn, L } = useL();
  const { showdownKind, showdownA, showdownB, setShowdownPair, closeSidePanel } = useAppStore();

  const sj = useMemo(() => cities.find((c) => c.short_name === 'San Jose') ?? cities[0], [cities]);
  const det = useMemo(() => cities.find((c) => c.short_name === 'Detroit') ?? cities[1], [cities]);

  useEffect(() => {
    if (showdownKind === 'city' && (!showdownA || !showdownB) && sj && det) {
      setShowdownPair('city', showdownA ?? sj.id, showdownB ?? det.id);
    } else if (showdownKind === 'state' && (!showdownA || !showdownB)) {
      setShowdownPair('state', showdownA ?? '06', showdownB ?? '48');
    }
  }, [showdownKind, showdownA, showdownB, sj, det, setShowdownPair]);

  const cityA = showdownKind === 'city' ? cities.find((c) => c.id === showdownA) ?? sj : null;
  const cityB = showdownKind === 'city' ? cities.find((c) => c.id === showdownB) ?? det : null;
  const stateA = showdownKind === 'state' ? states.find((s) => s.fips === showdownA) ?? states[0] : null;
  const stateB = showdownKind === 'state' ? states.find((s) => s.fips === showdownB) ?? states[1] : null;

  const CompareRow: React.FC<{ label: string; va: number | null | undefined; vb: number | null | undefined; fmt: string; lowerWins?: boolean }> = ({
    label,
    va,
    vb,
    fmt,
    lowerWins,
  }) => {
    const aNum = va ?? 0;
    const bNum = vb ?? 0;
    const maxV = Math.max(Math.abs(aNum), Math.abs(bNum), 1e-6);
    const aWins = va != null && vb != null && (lowerWins ? aNum < bNum : aNum > bNum);
    const bWins = va != null && vb != null && (lowerWins ? bNum < aNum : bNum > aNum);
    return (
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[11px]">
          <span className={`font-mono-num flex items-center gap-1 ${aWins ? 'font-bold text-[#29669C]' : 'opacity-75'}`}>
            {aWins && <Crown className="w-3 h-3" />} {formatMetric(va, fmt, locale)}
          </span>
          <span className="text-[10.5px] opacity-65 font-medium">{label}</span>
          <span className={`font-mono-num flex items-center gap-1 ${bWins ? 'font-bold text-[#B85636]' : 'opacity-75'}`}>
            {formatMetric(vb, fmt, locale)} {bWins && <Crown className="w-3 h-3" />}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 h-1.5">
          <div className="flex justify-end bg-[var(--surface-paper-subtle)] rounded-l-full overflow-hidden">
            <div className="h-full bg-[#29669C]" style={{ width: `${Math.min(100, (Math.max(0, aNum) / maxV) * 100)}%` }} />
          </div>
          <div className="flex justify-start bg-[var(--surface-paper-subtle)] rounded-r-full overflow-hidden">
            <div className="h-full bg-[#B85636]" style={{ width: `${Math.min(100, (Math.max(0, bNum) / maxV) * 100)}%` }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className="atlas-panel-brass fixed top-14 right-3 bottom-3 z-30 w-[min(470px,calc(100vw-24px))] rounded-2xl flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/75">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4" style={{ color: 'var(--brass)' }} />
            <h2 className="font-display text-base font-bold m-0">{L('双城 / 双州国力 PK 对决', 'Metro / State Showdown')}</h2>
          </div>
          <button onClick={closeSidePanel} className="p-1 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1.5 mt-2.5">
          <button
            onClick={() => setShowdownPair('city', sj?.id ?? null, det?.id ?? null)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              showdownKind === 'city' ? 'text-[#1A1F24]' : 'bg-[var(--surface-paper)] opacity-70'
            }`}
            style={showdownKind === 'city' ? { background: 'var(--brass)' } : undefined}
          >
            {L(`都会区对决 (${cities.length} 城)`, `Metros (${cities.length})`)}
          </button>
          <button
            onClick={() => setShowdownPair('state', '06', '48')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              showdownKind === 'state' ? 'text-[#1A1F24]' : 'bg-[var(--surface-paper)] opacity-70'
            }`}
            style={showdownKind === 'state' ? { background: 'var(--brass)' } : undefined}
          >
            {L(`联邦州对决 (${states.length} 州)`, `States (${states.length})`)}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Curated Quick Matchups */}
        <div className="flex flex-wrap gap-1.5">
          {showdownKind === 'city'
            ? CITY_PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  onClick={() => {
                    const a = cities.find((c) => c.short_name.includes(pr.aMatch) || c.name.includes(pr.aMatch));
                    const b = cities.find((c) => c.short_name.includes(pr.bMatch) || c.name.includes(pr.bMatch));
                    if (a && b) setShowdownPair('city', a.id, b.id);
                  }}
                  className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-[var(--surface-paper-subtle)] hover:bg-[var(--brass-soft)] cursor-pointer"
                >
                  {isEn ? pr.labelEn : pr.label}
                </button>
              ))
            : STATE_PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  onClick={() => setShowdownPair('state', pr.aFips, pr.bFips)}
                  className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-[var(--surface-paper-subtle)] hover:bg-[var(--brass-soft)] cursor-pointer"
                >
                  {isEn ? pr.labelEn : pr.label}
                </button>
              ))}
        </div>

        {/* Selectors */}
        {showdownKind === 'city' && cityA && cityB && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={cityA.id}
                onChange={(e) => setShowdownPair('city', e.target.value, cityB.id)}
                className="p-2 rounded-xl border-2 border-[#29669C] bg-[var(--surface-paper)] text-xs font-bold"
              >
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name}, {c.state_abbr}</option>
                ))}
              </select>
              <select
                value={cityB.id}
                onChange={(e) => setShowdownPair('city', cityA.id, e.target.value)}
                className="p-2 rounded-xl border-2 border-[#B85636] bg-[var(--surface-paper)] text-xs font-bold"
              >
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name}, {c.state_abbr}</option>
                ))}
              </select>
            </div>

            <SixYieldRadar a={cityA.yields} b={cityB.yields} nameA={cityA.short_name} nameB={cityB.short_name} />

            <div className="space-y-2.5 pt-2 border-t border-[var(--border-hairline)]">
              <CompareRow label={L('真实 GDP', 'Real GDP')} va={cityA.gdp_musd} vb={cityB.gdp_musd} fmt="usd_m" />
              <CompareRow label={L('人均 GDP', 'GDP per Capita')} va={cityA.gdp_per_cap} vb={cityB.gdp_per_cap} fmt="usd" />
              <CompareRow label={L('常住人口', 'Population')} va={cityA.pop} vb={cityB.pop} fmt="int" />
              <CompareRow label={L('家庭中位收入', 'Median Income')} va={cityA.median_income} vb={cityB.median_income} fmt="usd" />
              <CompareRow label={L('房价中位数', 'Median Home Value')} va={cityA.median_home} vb={cityB.median_home} fmt="usd" />
              <CompareRow label={L('本科及以上学历', 'Bachelor’s+ Degree')} va={cityA.bachelors_pct} vb={cityB.bachelors_pct} fmt="pct" />
              <CompareRow label={L('STEM 科技劳动力占比', 'STEM Workforce Share')} va={cityA.workforce.stem_share} vb={cityB.workforce.stem_share} fmt="pct" />
              <CompareRow label={L('健康宜居度', 'Wellbeing Index')} va={cityA.amenities} vb={cityB.amenities} fmt="index" />
              <CompareRow label={L('平均单程通勤 (越短越优)', 'Mean Commute (lower wins)')} va={cityA.commute_min} vb={cityB.commute_min} fmt="min" lowerWins />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[var(--border-hairline)]">
              <div className="p-2.5 rounded-xl bg-[var(--surface-paper-subtle)]/55">
                <div className="font-bold text-[11px] mb-1.5 text-[#29669C]">{cityA.short_name} · {L('16 市民', '16 Citizens')}</div>
                <MeepleCohortSvg groups={cityA.workforce.groups} compact />
                <div className="mt-2 flex flex-wrap gap-1">
                  {cityA.districts.slice(0, 3).map((d) => (
                    <span key={d.id} className="text-[9.5px] px-1.5 py-0.5 rounded bg-[var(--surface-paper)] border border-[var(--border-hairline)]">
                      {localizeDistrictName(d.id, d.name, locale)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--surface-paper-subtle)]/55">
                <div className="font-bold text-[11px] mb-1.5 text-[#B85636]">{cityB.short_name} · {L('16 市民', '16 Citizens')}</div>
                <MeepleCohortSvg groups={cityB.workforce.groups} compact />
                <div className="mt-2 flex flex-wrap gap-1">
                  {cityB.districts.slice(0, 3).map((d) => (
                    <span key={d.id} className="text-[9.5px] px-1.5 py-0.5 rounded bg-[var(--surface-paper)] border border-[var(--border-hairline)]">
                      {localizeDistrictName(d.id, d.name, locale)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {showdownKind === 'state' && stateA && stateB && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={stateA.fips}
                onChange={(e) => setShowdownPair('state', e.target.value, stateB.fips)}
                className="p-2 rounded-xl border-2 border-[#29669C] bg-[var(--surface-paper)] text-xs font-bold"
              >
                {states.map((s) => (
                  <option key={s.fips} value={s.fips}>{s.name} ({s.abbr})</option>
                ))}
              </select>
              <select
                value={stateB.fips}
                onChange={(e) => setShowdownPair('state', stateA.fips, e.target.value)}
                className="p-2 rounded-xl border-2 border-[#B85636] bg-[var(--surface-paper)] text-xs font-bold"
              >
                {states.map((s) => (
                  <option key={s.fips} value={s.fips}>{s.name} ({s.abbr})</option>
                ))}
              </select>
            </div>

            <SixYieldRadar a={stateA.yields} b={stateB.yields} nameA={stateA.abbr} nameB={stateB.abbr} />

            <div className="space-y-2.5 pt-2 border-t border-[var(--border-hairline)]">
              <CompareRow label={L('州真实 GDP', 'State Real GDP')} va={stateA.gdp_musd} vb={stateB.gdp_musd} fmt="usd_m" />
              <CompareRow label={L('人均 GDP', 'GDP per Capita')} va={stateA.gdp_per_cap} vb={stateB.gdp_per_cap} fmt="usd" />
              <CompareRow label={L('常住总人口', 'Population')} va={stateA.pop} vb={stateB.pop} fmt="int" />
              <CompareRow label={L('人口增速 (2020-25)', 'Pop Growth (2020-25)')} va={stateA.pop_growth_pct} vb={stateB.pop_growth_pct} fmt="pct" />
              <CompareRow label={L('家庭中位收入', 'Median Income')} va={stateA.median_income} vb={stateB.median_income} fmt="usd" />
              <CompareRow label={L('本科学历占比', 'Bachelor’s+ Share')} va={stateA.bachelors_pct} vb={stateB.bachelors_pct} fmt="pct" />
              <CompareRow label={L('健康宜居指数', 'Wellbeing Index')} va={stateA.amenities} vb={stateB.amenities} fmt="index" />
              <CompareRow label={L('国防支出 (OLDCC)', 'Defense Spend (OLDCC)')} va={stateA.defense_spending_musd} vb={stateB.defense_spending_musd} fmt="usd_m" />
              <CompareRow label={L('现役驻军人数 (DMDC)', 'Active-Duty Troops (DMDC)')} va={stateA.military_active} vb={stateB.military_active} fmt="int" />
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
