import React from 'react';
import type { PickedItem } from '../engine/picking';
import { formatMetric } from '../features/lenses/lensConfig';
import {
  BIOME_NAMES_L10N,
  localizeCommodity,
  localizeFuelLabel,
  localizeLensCategory,
  localizeLensName,
  localizeMilComponent,
  localizeMineLabel,
  localizeMineMetric,
  localizeTradeMode,
  localizeWonderExtra,
  localizeWonderMetric,
  localizeWonderRule,
  RELIEF_NAMES_L10N,
  useL,
} from '../i18n';
import { TRADE_MODE_STYLE } from '../engine/sprites/proceduralSprites';
import { useAppStore } from '../store/useAppStore';
import type { CityRecord, CountyRow, LensMeta, MilitaryRangeNode, StateRecord, WorldHexData } from '../types/world';

interface MapTooltipProps {
  x: number;
  y: number;
  picked: PickedItem | null;
  world: WorldHexData;
  activeLens: LensMeta | null;
  countyByFips: Map<string, CountyRow>;
  stateByFips: Map<string, StateRecord>;
  stateByAbbr?: Map<string, StateRecord>;
  cityById?: Map<string, CityRecord>;
  rangeByHexId?: Map<number, MilitaryRangeNode>;
}

function fmtDmsCoord(val: number, posHem: string, negHem: string): string {
  const hem = val >= 0 ? posHem : negHem;
  const abs = Math.abs(val);
  const d = Math.floor(abs);
  const m = Math.round((abs - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}'${hem}`;
}

export const MapTooltip: React.FC<MapTooltipProps> = ({
  x,
  y,
  picked,
  world,
  activeLens,
  countyByFips,
  stateByFips,
  stateByAbbr,
  cityById,
  rangeByHexId,
}) => {
  const { locale, L } = useL();
  const theme = useAppStore((s) => s.theme);
  const isMid = theme === 'midnight';
  if (!picked) return null;

  const isRoute = picked.kind === 'route';
  const isMil = picked.kind === 'military';
  const hexRange = picked.kind === 'hex' ? rangeByHexId?.get(picked.hexId) : undefined;
  const boxW = isMil ? 344 : isRoute ? 296 : hexRange ? 292 : 256;
  const estH = isMil ? 315 : isRoute ? 235 : hexRange ? 265 : 190;
  let left = x + 16;
  if (left + boxW > window.innerWidth - 12) {
    left = Math.max(10, x - boxW - 16);
  }
  const top = Math.max(56, Math.min(window.innerHeight - estH - 12, y + 16));
  const biomeNames = BIOME_NAMES_L10N[locale];
  const reliefNames = RELIEF_NAMES_L10N[locale];

  return (
    <div
      className="atlas-panel-brass fixed z-40 pointer-events-none rounded-xl px-3 py-2.5 text-xs shadow-2xl"
      style={{ left, top, width: boxW }}
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

      {picked.kind === 'military' && (() => {
        const b = picked.base;
        const st = stateByAbbr?.get(b.state);
        const city = b.cbsa ? cityById?.get(b.cbsa) : undefined;
        const hid = b.hex_id;
        const fips = hid != null && hid >= 0 && hid < world.n ? world.fips[hid] : undefined;
        const county = fips ? countyByFips.get(fips) : undefined;
        const lat = hid != null ? world.lat?.[hid] : undefined;
        const lon = hid != null ? world.lon?.[hid] : undefined;
        const elev = hid != null ? world.elev?.[hid] : undefined;
        const areaKm2 = b.area_km2 ?? 0;
        const acres = areaKm2 * 247.105;
        const cellsCount = b.cells?.length ?? 1;
        const tierLabel = b.tier === 'major'
          ? L('★ 核心大型基地', '★ Major Installation')
          : b.tier === 'site'
            ? L('● 军事站点', '● Defense Site')
            : L('◆ 标准基地', '◆ Base');
        const statusLabel = !b.status || b.status === 'act'
          ? L('现役在运', 'Active')
          : b.status === 'inact'
            ? L('非现役 / 封存', 'Inactive')
            : b.status.toUpperCase();
        const compColor = b.component.includes('air')
          ? '#5CB4EC'
          : b.component.includes('navy')
            ? '#387EE0'
            : b.component.includes('marine')
              ? '#D9574B'
              : b.component.includes('guard') || b.component.includes('res')
                ? '#D6B04A'
                : '#7D9A46';

        return (
          <div className="space-y-2">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  <span
                    className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[var(--brass-soft)]"
                    style={{ color: 'var(--brass-bright)' }}
                  >
                    {tierLabel}
                  </span>
                  {b.joint && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        isMid ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-600/15 text-sky-800'
                      }`}
                    >
                      {L('联合基地', 'Joint Base')}
                    </span>
                  )}
                  {b.airfield && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        isMid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-700/15 text-emerald-800'
                      }`}
                    >
                      {L('军用机场', 'Airfield')}
                    </span>
                  )}
                </div>
                <span className="text-[9.5px] font-mono-num opacity-70">{statusLabel}</span>
              </div>
              <div className="font-display text-[13.5px] font-bold leading-snug pt-0.5" style={{ color: 'var(--brass-bright)' }}>
                {b.name}
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: compColor }} />
                <span className="font-semibold">{localizeMilComponent(b.component, locale)}</span>
                <span className="opacity-50">·</span>
                <span>{st ? `${st.name} (${b.state})` : b.state}</span>
              </div>
            </div>

            {/* Physical Footprint, Grid Coverage & Coordinates */}
            <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-[var(--border-hairline)] text-[10px] font-mono-num">
              <div className="p-1.5 rounded-lg bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)]">
                <div className="text-[9px] opacity-60 font-sans">{L('占地面积', 'Footprint')}</div>
                <div className="font-bold text-[11.5px]">
                  {areaKm2 > 0 ? `${areaKm2 >= 100 ? Math.round(areaKm2).toLocaleString() : areaKm2.toFixed(1)} km²` : '–'}
                </div>
                <div className="text-[9px] opacity-60">
                  {acres >= 1000 ? `${(acres / 1000).toFixed(1)}K ac` : acres > 0 ? `${Math.round(acres)} ac` : 'MIRTA'}
                </div>
              </div>
              <div className="p-1.5 rounded-lg bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)]">
                <div className="text-[9px] opacity-60 font-sans">{L('沙盘格覆盖', 'Hex Span')}</div>
                <div className="font-bold text-[11.5px]">
                  {cellsCount} {L('格', 'hex')}
                </div>
                <div className="text-[9px] opacity-60 font-sans">
                  {elev != null ? `${L('海拔', 'Elev')} ${elev}m` : L('本土设施', 'CONUS')}
                </div>
              </div>
              <div className="p-1.5 rounded-lg bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)]">
                <div className="text-[9px] opacity-60 font-sans">{L('所在县域', 'County')}</div>
                <div className="font-bold text-[10.5px] font-sans truncate">
                  {county?.name ?? (fips ? `FIPS ${fips}` : b.state)}
                </div>
                <div className="text-[9px] opacity-60">
                  {lat != null && lon != null ? `${lat.toFixed(2)}°, ${lon.toFixed(2)}°` : 'DoD MIRTA'}
                </div>
              </div>
            </div>

            {lat != null && lon != null && (
              <div className="flex items-center justify-between text-[10px] font-mono-num opacity-75">
                <span className="font-sans opacity-80">{L('精确经纬度：', 'Coordinates:')}</span>
                <span>{fmtDmsCoord(lat, 'N', 'S')}, {fmtDmsCoord(lon, 'E', 'W')}</span>
              </div>
            )}

            {/* Associated Metro Garrison Context */}
            {city && (
              <div className="px-2 py-1 rounded-lg bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)] text-[10px] flex items-center justify-between gap-2">
                <span className="truncate">
                  {L('关联都会区：', 'Metro: ')}<b>{city.short_name}</b>
                  {city.garrison_tier === 'fortress' ? L('（军事要塞城）', ' (Fortress)') : city.garrison_tier === 'garrison' ? L('（驻军城）', ' (Garrison)') : ''}
                </span>
                {city.armed_forces != null && city.armed_forces > 0 && (
                  <span className="font-mono-num shrink-0 opacity-85">
                    {L(`现役 ${city.armed_forces.toLocaleString()}`, `${city.armed_forces.toLocaleString()} active`)}
                  </span>
                )}
              </div>
            )}

            {/* Host State DMDC & OLDCC Defense Context */}
            {st && (st.military_active != null || st.defense_spending_musd != null) && (
              <div className="pt-1.5 border-t border-[var(--border-hairline)] space-y-0.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="opacity-70">{L(`${st.name} 全州国防概览：`, `${st.abbr} State Defense Context:`)}</span>
                  <span className="font-mono-num opacity-80">
                    {st.installations_count != null ? L(`${st.installations_count} 座基地`, `${st.installations_count} sites`) : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono-num">
                  <span>
                    {L('现役', 'Active')} <b>{(st.military_active ?? 0).toLocaleString()}</b> · {L('预备/文职', 'Res/Civ')}{' '}
                    <b>{((st.military_reserve ?? 0) + (st.military_civilian ?? 0)).toLocaleString()}</b>
                  </span>
                  {st.defense_spending_musd != null && (
                    <span style={{ color: '#E8C574' }}>
                      <b>${(st.defense_spending_musd / 1000).toFixed(1)}B</b>{L('/年', '/yr')}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="text-[9.5px] opacity-65 flex items-center justify-between pt-0.5">
              <span>DoD MIRTA · {b.id ?? 'BSR/NTAD'}</span>
              <span style={{ color: 'var(--brass)' }}>{L('点击拉近聚焦基地 →', 'Click to zoom in →')}</span>
            </div>
          </div>
        );
      })()}

      {picked.kind === 'route' && (() => {
        const r = picked.route;
        const valUsd = (r.value_musd || 0) * 1e6;
        const valFmt =
          valUsd >= 1e9
            ? `$${(valUsd / 1e9).toFixed(valUsd >= 1e10 ? 1 : 2)}${L('B', 'B')}`
            : `$${(valUsd / 1e6).toFixed(1)}M`;
        const tons = (r.tons_k || 0) * 1e3;
        const tonsFmt =
          tons >= 1e6
            ? `${(tons / 1e6).toFixed(1)}M`
            : tons >= 1e3
              ? `${Math.round(tons / 1e3)}K`
              : String(Math.round(tons));
        const modeEntries = Object.entries(r.modes || {})
          .filter(([, v]) => v >= 0.05)
          .sort((a, b) => b[1] - a[1]);
        const modeStyle = TRADE_MODE_STYLE[r.top_mode] ?? TRADE_MODE_STYLE.other;

        return (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="font-display text-sm font-bold leading-tight">
                {r.orig_st} <span style={{ color: 'var(--brass-bright)' }}>⇄</span> {r.dest_st}
              </div>
              {r.rank != null && (
                <span
                  className="text-[10px] font-mono-num px-1.5 py-0.5 rounded shrink-0 bg-[var(--brass-soft)] font-semibold"
                  style={{ color: 'var(--brass-bright)' }}
                >
                  {L(`商路 #${r.rank}`, `Route #${r.rank}`)}
                </span>
              )}
            </div>

            {(r.orig_full || r.dest_full) && (
              <div className="text-[10.5px] opacity-70 leading-snug">
                {r.orig_full ?? r.orig_st} ⇄ {r.dest_full ?? r.dest_st}
              </div>
            )}

            <div className="text-[11.5px] leading-snug pt-1 border-t border-[var(--border-hairline)]">
              <b className="font-mono-num" style={{ color: 'var(--brass-bright)' }}>{valFmt}</b>{' '}
              {L('年货运额 · ', 'of freight / yr · ')}
              <b className="font-mono-num">{tonsFmt}</b> {L('短吨', 'short tons')}
              {r.dist_km ? (
                <span className="opacity-65 font-mono-num"> · {Math.round(r.dist_km).toLocaleString()} km</span>
              ) : null}
            </div>

            {modeEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                {modeEntries.map(([mk, share]) => {
                  const ms = TRADE_MODE_STYLE[mk] ?? TRADE_MODE_STYLE.other;
                  return (
                    <span key={mk} className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: ms.color }} />
                      <span>{localizeTradeMode(mk, locale)}</span>
                      <b className="font-mono-num">{Math.round(share * 100)}%</b>
                    </span>
                  );
                })}
              </div>
            )}

            {r.top_commodity && (
              <div className="text-[11px] flex items-center gap-1.5">
                <span className="opacity-70">{L('首要货类：', 'Top commodity:')}</span>
                <b style={{ color: modeStyle.color === '#3c3a38' ? 'var(--brass-bright)' : undefined }}>
                  {localizeCommodity(r.top_commodity, locale)}
                </b>
              </div>
            )}

            <div className="text-[9.5px] opacity-60 leading-snug pt-1 border-t border-[var(--border-hairline)]">
              {L(
                '双向加总（FAF 5.7.1 估算）。弧线连接两货运区核心城市作为示意：FAF 记录起讫地而非实际行驶路线。',
                "Both directions summed (FAF 5.7.1 estimate). Drawn as an arc between each zone's largest city: FAF records origin and destination, not its physical route.",
              )}
            </div>
          </div>
        );
      })()}

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
            {hexRange && (
              <div
                className={`p-2 rounded-lg border space-y-0.5 ${
                  isMid ? 'border-red-400/45 bg-red-950/40' : 'border-red-700/35 bg-red-700/10'
                }`}
              >
                <div
                  className={`flex items-center justify-between gap-2 text-[9.5px] font-bold uppercase tracking-wider ${
                    isMid ? 'text-red-300' : 'text-red-800'
                  }`}
                >
                  <span>{L('DoD 军事禁区 / 靶场', 'DoD Military Range')}</span>
                  <span className="font-mono-num">{hexRange.state}</span>
                </div>
                <div className="font-display font-bold text-xs leading-snug" style={{ color: isMid ? '#FFD8CC' : '#7C1D16' }}>
                  {hexRange.name}
                </div>
                <div className="text-[10px] opacity-85 font-mono-num">
                  {localizeMilComponent(hexRange.component, locale)} · {Math.round(hexRange.area_km2).toLocaleString()} km² ({Math.round(hexRange.area_km2 * 247.105 / 1000).toLocaleString()}K ac) · {hexRange.cells.length} {L('格', 'hex')}
                </div>
              </div>
            )}
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
              <div className="px-2 py-1 rounded-lg bg-[var(--brass-soft)] flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium flex items-center gap-1 min-w-0">
                  <span className="truncate">{localizeLensName(activeLens, locale)}</span>
                  {activeLens.granularity === 'state' && (
                    <span className="text-[9px] px-1 rounded bg-black/25 opacity-80 shrink-0">
                      {L('州级', 'State')}
                    </span>
                  )}
                </span>
                <span className="font-mono-num font-bold text-xs shrink-0">
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
