import React from 'react';
import { ArrowRight, Scale, Shield, X, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatMetric } from '../lenses/lensConfig';
import { localizeFuelLabel, localizeIndustry, localizeRegion, useL } from '../../i18n';
import type { CityRecord, StateRecord } from '../../types/world';

interface StatePanelProps {
  state: StateRecord;
  cities: CityRecord[];
}

export const StatePanel: React.FC<StatePanelProps> = ({ state, cities }) => {
  const { locale, L } = useL();
  const { closeSidePanel, openCity, openShowdown } = useAppStore();
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const topCities = state.top_cities.map((id) => cityById.get(id)).filter((c): c is CityRecord => Boolean(c));
  const powerEntries = Object.entries(state.power_mw_by_fuel).sort((a, b) => b[1] - a[1]);
  const totMw = powerEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <aside className="atlas-panel-brass fixed top-14 right-3 bottom-3 z-30 w-[min(430px,calc(100vw-24px))] rounded-2xl flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/75 flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--brass)' }}>
            {L('联邦州总览', 'State Overview')} · {localizeRegion(state.region_name, locale)} · {state.abbr}
          </div>
          <h2 className="font-display text-lg font-bold mt-0.5">{state.name}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => openShowdown('state', state.fips, state.fips === '06' ? '48' : '06')}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[var(--brass-soft)] cursor-pointer"
            style={{ color: 'var(--brass)' }}
          >
            <Scale className="w-3.5 h-3.5" /> {L('双州 PK', 'State VS')}
          </button>
          <button onClick={closeSidePanel} className="p-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-2">
          {[
            { l: L('总人口 (PEP 2025)', 'Population (PEP 2025)'), v: state.pop.toLocaleString() },
            { l: L('真实 GDP (BEA 2024)', 'Real GDP (BEA 2024)'), v: `$${(state.gdp_musd / 1000).toFixed(1)}B` },
            { l: L('人均 GDP', 'GDP per Capita'), v: formatMetric(state.gdp_per_cap, 'usd', locale) },
            { l: L('家庭中位收入', 'Median Income'), v: formatMetric(state.median_income, 'usd', locale) },
            { l: L('本科学历占比', 'Bachelor’s+ Share'), v: formatMetric(state.bachelors_pct, 'pct', locale) },
            { l: L('健康宜居指数', 'Wellbeing Index'), v: formatMetric(state.amenities, 'index', locale) },
            { l: L('国防开支 (OLDCC)', 'Defense Spend (OLDCC)'), v: state.defense_spending_musd ? `$${(state.defense_spending_musd / 1000).toFixed(1)}B` : '—' },
            { l: L('十亿级灾难累计损失', '$1B+ Disaster Losses'), v: state.noaa_billion_cost_busd != null ? `$${state.noaa_billion_cost_busd.toFixed(1)}B` : '—' },
          ].map((x) => (
            <div key={x.l} className="p-2.5 rounded-xl bg-[var(--surface-paper-subtle)]/65 border border-[var(--border-hairline)]">
              <div className="text-[10px] opacity-65">{x.l}</div>
              <div className="font-mono-num text-sm font-bold mt-0.5">{x.v}</div>
            </div>
          ))}
        </div>

        {/* Top GDP Sectors */}
        {state.gdp_by_sector.length > 0 && (
          <div className="space-y-1.5">
            <div className="font-display font-bold text-xs">{L('支柱产业 GDP 构成（BEA CAGDP2）', 'Leading GDP Industries (BEA CAGDP2)')}</div>
            {state.gdp_by_sector.slice(0, 6).map((s) => (
              <div key={s.name} className="space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span>{localizeIndustry(s.key ?? s.name, s.name, locale)}</span>
                  <span className="font-mono-num font-semibold">${(s.musd / 1000).toFixed(1)}B</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-paper-subtle)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.musd / state.gdp_musd) * 320)}%`, background: 'var(--y-gold)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Energy Grid */}
        {totMw > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-[var(--border-hairline)]">
            <div className="font-display font-bold text-xs flex items-center justify-between">
              <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5" style={{ color: 'var(--y-power)' }} /> {L('发电装机结构 (EIA-860M)', 'Mapped Power Grid (EIA-860M)')}</span>
              <span className="font-mono-num">{(totMw / 1000).toFixed(1)} GW</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {powerEntries.slice(0, 6).map(([fuel, mw]) => (
                <div key={fuel} className="flex justify-between px-2 py-1 rounded bg-[var(--surface-paper-subtle)]/55 text-[11px]">
                  <span className="opacity-75 truncate pr-1">{localizeFuelLabel(fuel, undefined, locale)}</span>
                  <span className="font-mono-num font-semibold shrink-0">{(mw / 1000).toFixed(1)} GW</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Military Garrison */}
        {state.military_active != null && (
          <div className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/45">
            <div className="font-display font-bold text-xs flex items-center gap-1.5 mb-2">
              <Shield className="w-3.5 h-3.5" style={{ color: 'var(--brass)' }} /> {L('驻军兵力统计 (DMDC)', 'Military Personnel (DMDC)')}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center font-mono-num">
              <div><div className="text-[10px] opacity-65">{L('现役 Active', 'Active')}</div><b>{state.military_active.toLocaleString()}</b></div>
              <div><div className="text-[10px] opacity-65">{L('预备役/警卫', 'Guard / Res.')}</div><b>{(state.military_reserve ?? 0).toLocaleString()}</b></div>
              <div><div className="text-[10px] opacity-65">{L('国防文职', 'DoD Civilian')}</div><b>{(state.military_civilian ?? 0).toLocaleString()}</b></div>
            </div>
          </div>
        )}

        {/* Top Metro Areas in State */}
        {topCities.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-[var(--border-hairline)]">
            <div className="font-display font-bold text-xs">{L('州内核心都会区', 'Major Metros in State')}</div>
            {topCities.map((c) => (
              <button
                key={c.id}
                onClick={() => openCity(c.id)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer"
              >
                <span className="font-semibold flex items-center gap-1">{c.short_name} <ArrowRight className="w-3 h-3 opacity-60" /></span>
                <span className="font-mono-num text-[11px] opacity-80">{(c.pop / 1e6).toFixed(2)}M · ${((c.gdp_musd ?? 0) / 1000).toFixed(0)}B</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
