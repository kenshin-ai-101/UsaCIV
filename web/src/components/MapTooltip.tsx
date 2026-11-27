import React from 'react';
import type { PickedItem } from '../engine/picking';
import { formatMetric } from '../features/lenses/lensConfig';
import {
  BIOME_NAMES_L10N,
  localizeFuelLabel,
  localizeLensCategory,
  localizeLensName,
  localizeMilComponent,
  localizeMineLabel,
  localizeMineMetric,
  localizeWonderExtra,
  localizeWonderMetric,
  localizeWonderRule,
  RELIEF_NAMES_L10N,
  useL,
} from '../i18n';
import type { CountyRow, LensMeta, StateRecord, WorldHexData } from '../types/world';

interface MapTooltipProps {
  x: number;
  y: number;
  picked: PickedItem | null;
  world: WorldHexData;
  activeLens: LensMeta | null;
  countyByFips: Map<string, CountyRow>;
  stateByFips: Map<string, StateRecord>;
}

export const MapTooltip: React.FC<MapTooltipProps> = ({
  x,
  y,
  picked,
  world,
  activeLens,
  countyByFips,
  stateByFips,
}) => {
  const { locale, L } = useL();
  if (!picked) return null;

  const left = Math.min(window.innerWidth - 280, x + 16);
  const top = Math.min(window.innerHeight - 190, y + 16);
  const biomeNames = BIOME_NAMES_L10N[locale];
  const reliefNames = RELIEF_NAMES_L10N[locale];

  return (
    <div
      className="atlas-panel-brass fixed z-40 pointer-events-none rounded-xl px-3 py-2.5 w-64 text-xs"
      style={{ left: Math.max(10, left), top: Math.max(60, top) }}
    >
      {picked.kind === 'city' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-sm font-bold">{picked.city.short_name}</span>
            <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-[var(--brass-soft)]" style={{ color: 'var(--brass)' }}>
              {picked.city.state_abbr}
            </span>
          </div>
          <div className="text-[11px] opacity-70">{picked.city.name}</div>
          <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[var(--border-hairline)] text-[11px]">
            <div>{L('人口', 'Pop')} <b className="font-mono-num">{(picked.city.pop / 1e6).toFixed(2)}M</b></div>
            <div>GDP <b className="font-mono-num">${((picked.city.gdp_musd ?? 0) / 1000).toFixed(1)}B</b></div>
            <div>{L('收入', 'Income')} <b className="font-mono-num">{formatMetric(picked.city.median_income, 'usd_k', locale)}</b></div>
            <div>STEM <b className="font-mono-num">1/{picked.city.workforce.stem_one_in}</b></div>
          </div>
          <div className="text-[10px] pt-1 opacity-75" style={{ color: 'var(--brass)' }}>
            {L('点击进入《都会区指挥视图》→', 'Click to open Metro Command View →')}
          </div>
        </div>
      )}

      {picked.kind === 'wonder' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--brass)' }}>
            {picked.wonder.kind === 'natural'
              ? L('自然奇观', 'Natural Wonder')
              : picked.wonder.kind === 'academic'
                ? L('学术科研奇观', 'Academic Wonder')
                : L('国家历史地标', 'Historic Landmark')}{' '}
            · {L('全美', 'U.S.')} #{picked.wonder.rank}
          </div>
          <div className="font-display text-sm font-bold">{picked.wonder.name}</div>
          <div className="font-mono-num text-xs font-bold">{localizeWonderMetric(picked.wonder.metric_label, locale)}</div>
          <div className="text-[10.5px] opacity-75">{localizeWonderExtra(picked.wonder.extra, locale)}</div>
          <div className="text-[10px] opacity-60 pt-1 border-t border-[var(--border-hairline)]">
            {localizeWonderRule(picked.wonder.rule_id, picked.wonder.rule, locale)}
          </div>
        </div>
      )}

      {picked.kind === 'power' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--y-power)' }}>
            {L('EIA-860M 发电厂', 'EIA-860M Power Plant')}
          </div>
          <div className="font-semibold text-xs">{picked.plant.name}</div>
          <div className="flex justify-between text-[11px]">
            <span>{L('能源类型：', 'Fuel: ')}<b>{localizeFuelLabel(picked.plant.fuel, undefined, locale)}</b></span>
            <span className="font-mono-num font-bold">{picked.plant.mw.toLocaleString()} MW</span>
          </div>
        </div>
      )}

      {picked.kind === 'mine' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--y-prod)' }}>
            {L('MSHA / EIA 矿山', 'MSHA / EIA Mine')}
          </div>
          <div className="font-semibold text-xs">{picked.mine.name}</div>
          <div className="flex justify-between text-[11px]">
            <span>{L('矿种：', 'Ore: ')}<b>{localizeMineLabel(picked.mine.commodity, picked.mine.label, locale)}</b> ({picked.mine.state})</span>
            <span className="font-mono-num font-bold">{localizeMineMetric(picked.mine.metric_label, locale)}</span>
          </div>
        </div>
      )}

      {picked.kind === 'port' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: '#267A8C' }}>
            {L('USACE 深水与内河港口', 'USACE Principal Port')}
          </div>
          <div className="font-semibold text-xs">{picked.port.name}</div>
          <div className="font-mono-num text-[11px]">
            {L('年吞吐量：', 'Annual throughput: ')}<b>{(picked.port.tons / 1e6).toFixed(2)}M {L('短吨', 'short tons')}</b>
          </div>
        </div>
      )}

      {picked.kind === 'airport' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--y-science)' }}>
            {L('FAA 航空枢纽', 'FAA Aviation Hub')} ({picked.airport.code})
          </div>
          <div className="font-semibold text-xs">{picked.airport.name}</div>
          <div className="text-[11px] font-mono-num">
            {L('旅客：', 'Pax: ')}<b>{(picked.airport.enplanements / 1e6).toFixed(2)}M</b> · {L('货运：', 'Cargo: ')}<b>{(picked.airport.cargo_lbs / 1e9).toFixed(2)}B lbs</b>
          </div>
        </div>
      )}

      {picked.kind === 'military' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase opacity-75">{L('DoD MIRTA 国防基地', 'DoD MIRTA Installation')}</div>
          <div className="font-semibold text-xs">{picked.base.name}</div>
          <div className="text-[11px] opacity-80">{localizeMilComponent(picked.base.component, locale)} · {picked.base.state}</div>
        </div>
      )}

      {picked.kind === 'hex' && (() => {
        const i = picked.hexId;
        const fips = world.fips[i];
        const county = countyByFips.get(fips);
        const st = stateByFips.get(world.st[i]);
        const lensVal = activeLens ? world.lenses[activeLens.id]?.[i] : null;
        const catObj = activeLens?.categorical && lensVal != null
          ? activeLens.categories?.find((c) => c.id === Math.round(lensVal))
          : null;
        const catLbl = catObj ? localizeLensCategory(catObj, locale) : null;

        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold truncate">{county?.name ?? `FIPS ${fips}`}</span>
              <span className="text-[10px] font-mono-num opacity-70">{st?.abbr ?? ''}</span>
            </div>
            <div className="text-[11px] opacity-75">
              {biomeNames[world.biome[i]]} · {reliefNames[world.rcls[i]]} · {L('海拔', 'Elev.')} <span className="font-mono-num">{world.elev[i]}m</span>
              {world.river[i] === 1 && L(' · 淡水河道', ' · Freshwater River')}
              {world.shale[i] === 1 && L(' · 页岩油气带', ' · Shale Basin')}
            </div>

            {activeLens && (
              <div className="px-2 py-1 rounded-lg bg-[var(--brass-soft)] flex items-center justify-between">
                <span className="text-[11px] font-medium">{localizeLensName(activeLens, locale)}</span>
                <span className="font-mono-num font-bold text-xs">
                  {catLbl ?? formatMetric(lensVal, activeLens.format, locale)}
                </span>
              </div>
            )}

            {/* 6 Civ Yields Micro-Row */}
            <div className="grid grid-cols-6 gap-1 pt-1 border-t border-[var(--border-hairline)] text-center font-mono-num text-[10.5px]">
              <div title={L('粮食', 'Food')}><span style={{ color: 'var(--y-food)' }}>🌾</span>{world.yields.food[i]}</div>
              <div title={L('生产力', 'Production')}><span style={{ color: 'var(--y-prod)' }}>⚙</span>{world.yields.prod[i]}</div>
              <div title={L('金币(GDP)', 'Gold (GDP)')}><span style={{ color: 'var(--y-gold)' }}>●</span>{world.yields.gold[i]}</div>
              <div title={L('科技', 'Science')}><span style={{ color: 'var(--y-science)' }}>▲</span>{world.yields.sci[i]}</div>
              <div title={L('文化', 'Culture')}><span style={{ color: 'var(--y-culture)' }}>◆</span>{world.yields.cul[i]}</div>
              <div title={L('信仰', 'Faith')}><span style={{ color: 'var(--y-faith)' }}>✦</span>{world.yields.faith[i]}</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
