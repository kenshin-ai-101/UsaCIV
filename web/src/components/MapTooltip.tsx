import React from 'react';
import type { PickedItem } from '../engine/picking';
import { formatMetric } from '../features/lenses/lensConfig';
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

const BIOME_NAMES = ['草原平原', '高产农田', '温带森林', '干旱荒漠', '湿地三角洲', '都市建成区', '高山寒原', '水域滩涂'];
const RELIEF_NAMES = ['平地', '丘陵高地', '山地', '高山雪峰'];

export const MapTooltip: React.FC<MapTooltipProps> = ({
  x,
  y,
  picked,
  world,
  activeLens,
  countyByFips,
  stateByFips,
}) => {
  if (!picked) return null;

  const left = Math.min(window.innerWidth - 280, x + 16);
  const top = Math.min(window.innerHeight - 190, y + 16);

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
            <div>人口 <b className="font-mono-num">{(picked.city.pop / 1e6).toFixed(2)}M</b></div>
            <div>GDP <b className="font-mono-num">${((picked.city.gdp_musd ?? 0) / 1000).toFixed(1)}B</b></div>
            <div>收入 <b className="font-mono-num">{formatMetric(picked.city.median_income, 'usd_k')}</b></div>
            <div>STEM <b className="font-mono-num">1/{picked.city.workforce.stem_one_in}</b></div>
          </div>
          <div className="text-[10px] pt-1 opacity-75" style={{ color: 'var(--brass)' }}>
            点击进入《都会区指挥视图》→
          </div>
        </div>
      )}

      {picked.kind === 'wonder' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--brass)' }}>
            {picked.wonder.kind === 'natural' ? '自然奇观' : picked.wonder.kind === 'academic' ? '学术科研奇观' : '国家历史地标'} · 全美 #{picked.wonder.rank}
          </div>
          <div className="font-display text-sm font-bold">{picked.wonder.name}</div>
          <div className="font-mono-num text-xs font-bold">{picked.wonder.metric_label}</div>
          <div className="text-[10.5px] opacity-75">{picked.wonder.extra}</div>
          <div className="text-[10px] opacity-60 pt-1 border-t border-[var(--border-hairline)]">{picked.wonder.rule}</div>
        </div>
      )}

      {picked.kind === 'power' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--y-power)' }}>EIA-860M 发电厂</div>
          <div className="font-semibold text-xs">{picked.plant.name}</div>
          <div className="flex justify-between text-[11px]">
            <span>能源类型：<b>{picked.plant.fuel.toUpperCase()}</b></span>
            <span className="font-mono-num font-bold">{picked.plant.mw.toLocaleString()} MW</span>
          </div>
        </div>
      )}

      {picked.kind === 'mine' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--y-prod)' }}>MSHA / EIA 矿山</div>
          <div className="font-semibold text-xs">{picked.mine.name}</div>
          <div className="flex justify-between text-[11px]">
            <span>矿种：<b>{picked.mine.commodity.toUpperCase()}</b> ({picked.mine.state})</span>
            <span className="font-mono-num font-bold">{picked.mine.metric_label}</span>
          </div>
        </div>
      )}

      {picked.kind === 'port' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: '#267A8C' }}>USACE 深水与内河港口</div>
          <div className="font-semibold text-xs">{picked.port.name}</div>
          <div className="font-mono-num text-[11px]">年吞吐量：<b>{(picked.port.tons / 1e6).toFixed(2)}M 短吨</b></div>
        </div>
      )}

      {picked.kind === 'airport' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--y-science)' }}>FAA 航空枢纽 ({picked.airport.code})</div>
          <div className="font-semibold text-xs">{picked.airport.name}</div>
          <div className="text-[11px] font-mono-num">
            旅客：<b>{(picked.airport.enplanements / 1e6).toFixed(2)}M</b> · 货运：<b>{(picked.airport.cargo_lbs / 1e9).toFixed(2)}B lbs</b>
          </div>
        </div>
      )}

      {picked.kind === 'military' && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase opacity-75">DoD MIRTA 国防基地</div>
          <div className="font-semibold text-xs">{picked.base.name}</div>
          <div className="text-[11px] opacity-80">{picked.base.component} · {picked.base.state}</div>
        </div>
      )}

      {picked.kind === 'hex' && (() => {
        const i = picked.hexId;
        const fips = world.fips[i];
        const county = countyByFips.get(fips);
        const st = stateByFips.get(world.st[i]);
        const lensVal = activeLens ? world.lenses[activeLens.id]?.[i] : null;
        const catLbl = activeLens?.categorical && lensVal != null
          ? activeLens.categories?.find((c) => c.id === Math.round(lensVal))?.label
          : null;

        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold truncate">{county?.name ?? `FIPS ${fips}`}</span>
              <span className="text-[10px] font-mono-num opacity-70">{st?.abbr ?? ''}</span>
            </div>
            <div className="text-[11px] opacity-75">
              {BIOME_NAMES[world.biome[i]]} · {RELIEF_NAMES[world.rcls[i]]} · 海拔 <span className="font-mono-num">{world.elev[i]}m</span>
              {world.river[i] === 1 && ' · 淡水河道'}
              {world.shale[i] === 1 && ' · 页岩油气带'}
            </div>

            {activeLens && (
              <div className="px-2 py-1 rounded-lg bg-[var(--brass-soft)] flex items-center justify-between">
                <span className="text-[11px] font-medium">{activeLens.name}</span>
                <span className="font-mono-num font-bold text-xs">
                  {catLbl ?? formatMetric(lensVal, activeLens.format)}
                </span>
              </div>
            )}

            {/* 6 Civ Yields Micro-Row */}
            <div className="grid grid-cols-6 gap-1 pt-1 border-t border-[var(--border-hairline)] text-center font-mono-num text-[10.5px]">
              <div title="粮食"><span style={{ color: 'var(--y-food)' }}>🌾</span>{world.yields.food[i]}</div>
              <div title="生产力"><span style={{ color: 'var(--y-prod)' }}>⚙</span>{world.yields.prod[i]}</div>
              <div title="金币(GDP)"><span style={{ color: 'var(--y-gold)' }}>●</span>{world.yields.gold[i]}</div>
              <div title="科技"><span style={{ color: 'var(--y-science)' }}>▲</span>{world.yields.sci[i]}</div>
              <div title="文化"><span style={{ color: 'var(--y-culture)' }}>◆</span>{world.yields.cul[i]}</div>
              <div title="信仰"><span style={{ color: 'var(--y-faith)' }}>✦</span>{world.yields.faith[i]}</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
