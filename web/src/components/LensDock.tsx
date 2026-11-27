import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronUp,
  DollarSign,
  Gem,
  GraduationCap,
  Layers,
  Map as MapIcon,
  Mountain,
  Users,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { COLOR_RAMPS, formatMetric, LENS_GROUPS, sampleRamp } from '../features/lenses/lensConfig';
import { localizeLensCategory, localizeLensDesc, localizeLensName, useL } from '../i18n';
import type { LayerToggles, LensMeta, WorldHexData } from '../types/world';

interface LensDockProps {
  lenses: LensMeta[];
  world: WorldHexData;
}

const MAP_LAYER_ITEMS: { key: keyof LayerToggles; label: string; labelEn: string; desc: string; descEn: string }[] = [
  { key: 'roads', label: '州际高速公路', labelEn: 'Interstate Highways', desc: '州际高速与主要干道', descEn: 'Interstates & major highways' },
  { key: 'rail', label: '干线铁路网', labelEn: 'Rail Network', desc: '主干与支线铁路网', descEn: 'Main & secondary rail lines' },
  { key: 'hubs', label: '港口与航空枢纽', labelEn: 'Ports & Aviation Hubs', desc: 'USACE 港口与 FAA 机场枢纽', descEn: 'USACE ports & FAA airports' },
  { key: 'military', label: '军事基地与禁区', labelEn: 'Military Bases & Ranges', desc: 'DoD MIRTA 军事设施与靶场', descEn: 'DoD MIRTA installations & ranges' },
  { key: 'wonders', label: '奇观与国家公园', labelEn: 'Wonders & National Parks', desc: '国家公园、顶尖高校与历史地标', descEn: 'Parks, research universities & NHL' },
  { key: 'trade', label: 'FAF5 洲际货运商路', labelEn: 'FAF5 Freight Corridors', desc: '前 40 条州际货运大动脉', descEn: 'Top 40 interstate freight corridors' },
  { key: 'borders', label: '州行政界线与州名', labelEn: 'State Borders & Labels', desc: '州行政疆界与衬线体州名', descEn: 'State borders & antique serif labels' },
  { key: 'banners', label: '524 都会区城市标', labelEn: '524+ Metro City Banners', desc: '州纹章色都会横幅（含 AK/HI 共 530）', descEn: 'State-colored city banners (530 incl. AK/HI)' },
];

export const LensDock: React.FC<LensDockProps> = ({ lenses, world }) => {
  const { locale, isEn, L } = useL();
  const { activeLensId, setLens, bandSlice, setBandSlice, layers, toggleLayer, setAlmanacOpen, mode } = useAppStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const dragStartBinRef = useRef<number | null>(null);
  const [hoverBin, setHoverBin] = useState<number | null>(null);

  const lensById = useMemo(() => new Map(lenses.map((l) => [l.id, l])), [lenses]);
  const activeLens = activeLensId ? lensById.get(activeLensId) ?? null : null;

  const activeMapLayersCount = useMemo(
    () => (['roads', 'rail', 'hubs', 'military', 'wonders', 'trade'] as (keyof LayerToggles)[]).filter((k) => layers[k]).length,
    [layers],
  );

  // Build real 24-bin histogram across all 18,284 hexes for the active continuous lens!
  const histogram = useMemo(() => {
    if (!activeLens || activeLens.categorical) return null;
    const vals = world.lenses[activeLens.id];
    if (!vals) return null;
    const BINS = 24;
    const lo0 = activeLens.p02;
    const hi0 = activeLens.p98;
    const span = Math.max(1e-9, hi0 - lo0);
    const counts = new Array<number>(BINS).fill(0);
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v === null || v === undefined) continue;
      const t = Math.max(0, Math.min(0.9999, (v - lo0) / span));
      counts[Math.floor(t * BINS)]++;
    }
    const maxC = Math.max(1, ...counts);
    return counts.map((count, i) => {
      const rgb = sampleRamp(activeLens.ramp, (i + 0.5) / BINS);
      return {
        idx: i,
        count,
        pctH: Math.max(0.08, count / maxC),
        lo: i === 0 ? activeLens.min : lo0 + (span * i) / BINS,
        hi: i === BINS - 1 ? activeLens.max : lo0 + (span * (i + 1)) / BINS,
        color: `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`,
      };
    });
  }, [activeLens, world]);

  // Hide lens dock cleanly when right-side City/State/Showdown panel would overlap on narrower screens
  const shiftLeft = (mode === 'city' || mode === 'state' || mode === 'showdown') ? 'right-[470px]' : 'right-3';

  return (
    <div className={`fixed bottom-3 ${shiftLeft} z-20 flex flex-col items-end gap-2 max-w-[calc(100vw-24px)] pointer-events-none transition-all duration-200`}>
      {/* Map Layers Popover */}
      {mapMenuOpen && (
        <div className="atlas-panel-brass pointer-events-auto w-72 rounded-xl p-3">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-hairline)]">
            <span className="font-display text-xs font-bold" style={{ color: 'var(--brass-bright)' }}>{L('地图图层开关', 'Map Layers')}</span>
            <button onClick={() => setMapMenuOpen(false)} className="opacity-65 hover:opacity-100 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="space-y-1">
            {MAP_LAYER_ITEMS.map((it) => (
              <label key={it.key} className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer">
                <input type="checkbox" checked={layers[it.key]} onChange={() => toggleLayer(it.key)} className="mt-0.5 accent-[var(--brass)]" />
                <div className="leading-tight">
                  <div className="text-xs font-semibold">{isEn ? it.labelEn : it.label}</div>
                  <div className="text-[10px] opacity-60">{isEn ? it.descEn : it.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Full 19-Lens Grouped Picker Drawer */}
      {pickerOpen && (
        <div className="atlas-panel-brass pointer-events-auto w-[min(660px,calc(100vw-24px))] max-h-[62vh] overflow-y-auto rounded-xl p-3.5">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--border-hairline)]">
            <div>
              <h3 className="font-display text-sm font-bold m-0" style={{ color: 'var(--brass-bright)' }}>{L('全部 19 种真实数据视角', 'All 19 Data Lenses')}</h3>
              <p className="text-[11px] opacity-65 m-0">{L('按快捷键 L 循环切换；悬停或拖拽图例直方图即可切片过滤地图', 'Press L to cycle lenses; hover or drag across the legend histogram to slice the map')}</p>
            </div>
            <button onClick={() => setPickerOpen(false)} className="p-1 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {LENS_GROUPS.map((grp) => {
              const items = lenses.filter((l) => l.group === grp.id);
              if (!items.length) return null;
              return (
                <div key={grp.id} className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 px-1">{isEn ? grp.labelEn : grp.label}</div>
                  {items.map((l) => {
                    const active = l.id === activeLensId;
                    const stops = COLOR_RAMPS[l.ramp];
                    return (
                      <button
                        key={l.id}
                        onClick={() => {
                          setLens(l.id);
                          setPickerOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between gap-2 cursor-pointer border ${
                          active ? 'border-[var(--brass)] bg-[var(--brass-soft)] font-bold' : 'border-transparent hover:bg-[var(--surface-paper-hover)]'
                        }`}
                      >
                        <span className="truncate">{localizeLensName(l, locale)}</span>
                        {stops ? (
                          <span
                            className="w-9 h-2 rounded-sm shrink-0 border border-black/25"
                            style={{ background: `linear-gradient(90deg, ${stops[0]}, ${stops[2]}, ${stops[5]})` }}
                          />
                        ) : (
                          <span className="text-[9.5px] opacity-60">{L('分类', 'Cat.')}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive 24-Bin Histogram Legend Card (Hover OR Drag across bars to slice hexes LIVE!) */}
      {activeLens && (
        <div className="atlas-panel-brass pointer-events-auto rounded-xl p-2.5 w-[min(316px,calc(100vw-24px))]">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <div className="font-display text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--brass-bright)' }}>
                {localizeLensName(activeLens, locale)}
                {!isEn && <span className="text-[10.5px] font-normal opacity-65 font-sans">({activeLens.name_en})</span>}
              </div>
              <p className="text-[10.5px] opacity-75 m-0 mt-0.5 line-clamp-2 leading-snug">{localizeLensDesc(activeLens, locale)}</p>
            </div>
            <button onClick={() => setLens(null)} className="p-1 rounded hover:bg-[var(--surface-paper-hover)] opacity-70 hover:opacity-100 cursor-pointer" title={L('切回立体地形', 'Return to 2.5D terrain')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeLens.categorical && activeLens.categories ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {activeLens.categories.map((cat) => {
                const isSel = bandSlice && bandSlice[0] === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setBandSlice(isSel ? null : [cat.id, cat.id])}
                    onMouseEnter={() => { if (!bandSlice) setHoverBin(cat.id); }}
                    onMouseLeave={() => setHoverBin(null)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] border transition cursor-pointer ${
                      isSel ? 'border-[var(--brass)] font-bold scale-105' : 'border-transparent hover:border-[var(--border-hairline)]'
                    }`}
                    style={{ background: 'var(--surface-paper-subtle)' }}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: cat.color }} />
                    <span>{localizeLensCategory(cat, locale)}</span>
                  </button>
                );
              })}
            </div>
          ) : histogram && (
            <div className="mt-2.5">
              {/* 24-bin draggable/hoverable histogram */}
              <div
                className="flex items-end gap-[2px] h-14 select-none cursor-ew-resize"
                onMouseLeave={() => {
                  setHoverBin(null);
                  if (dragStartBinRef.current !== null) dragStartBinRef.current = null;
                }}
                onMouseUp={() => {
                  dragStartBinRef.current = null;
                }}
              >
                {histogram.map((b) => {
                  const inSlice = !bandSlice || (b.hi >= bandSlice[0] && b.lo <= bandSlice[1]);
                  return (
                    <div
                      key={b.idx}
                      onMouseDown={() => {
                        dragStartBinRef.current = b.idx;
                        setBandSlice([b.lo, b.hi]);
                      }}
                      onMouseEnter={() => {
                        setHoverBin(b.idx);
                        if (dragStartBinRef.current !== null) {
                          const i0 = Math.min(dragStartBinRef.current, b.idx);
                          const i1 = Math.max(dragStartBinRef.current, b.idx);
                          setBandSlice([histogram[i0].lo, histogram[i1].hi]);
                        }
                      }}
                      className="flex-1 rounded-t-[2px] transition-opacity"
                      style={{
                        height: `${Math.round(b.pctH * 100)}%`,
                        background: b.color,
                        opacity: inSlice ? 1 : 0.22,
                      }}
                    />
                  );
                })}
              </div>

              {/* Scale Ticks */}
              <div className="flex justify-between text-[10px] font-mono-num opacity-80 mt-1 border-t border-[var(--border-hairline)] pt-1">
                <span>≤ {formatMetric(activeLens.p02, activeLens.format, locale)}</span>
                <span>{L('中位', 'Med')} {formatMetric(activeLens.median, activeLens.format, locale)}</span>
                <span>≥ {formatMetric(activeLens.p98, activeLens.format, locale)}</span>
              </div>

              {/* Interactive Footer Status */}
              <div className="flex items-center justify-between mt-1.5 text-[10px]">
                <span className={activeLens.higher_is === 'good' ? 'text-emerald-400 font-semibold' : activeLens.higher_is === 'bad' ? 'text-amber-400 font-semibold' : 'opacity-65'}>
                  {hoverBin !== null && histogram[hoverBin]
                    ? L(
                        `当前柱：${formatMetric(histogram[hoverBin].lo, activeLens.format, locale)} – ${formatMetric(histogram[hoverBin].hi, activeLens.format, locale)} (${histogram[hoverBin].count} 格)`,
                        `Bin: ${formatMetric(histogram[hoverBin].lo, activeLens.format, locale)} – ${formatMetric(histogram[hoverBin].hi, activeLens.format, locale)} (${histogram[hoverBin].count} hexes)`,
                      )
                    : activeLens.higher_is === 'good'
                      ? L('▲ 数值越高越优 · 拖拽直方图筛选区间', '▲ Higher is better · Drag bars to slice')
                      : activeLens.higher_is === 'bad'
                        ? L('▼ 数值越低越优 · 拖拽直方图筛选区间', '▼ Lower is better · Drag bars to slice')
                        : L('拖拽直方图即可在地图上仅高亮该区间', 'Drag bars to highlight a range on map')}
                </span>
                {bandSlice ? (
                  <button onClick={() => setBandSlice(null)} className="underline font-bold cursor-pointer" style={{ color: 'var(--brass-bright)' }}>
                    {L('重置', 'Reset')}
                  </button>
                ) : (
                  <button onClick={() => setAlmanacOpen(true, 'sources')} className="underline opacity-65 hover:opacity-100 cursor-pointer">
                    {L('来源', 'Sources')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom-Right Compact Strategy Dock: [Resources] [Map (N)] [Terrain] [Population] [Income] [Degrees] [Lenses ▾] */}
      <div className="atlas-panel-brass pointer-events-auto flex items-center gap-1 p-1 rounded-xl overflow-x-auto">
        <button
          onClick={() => toggleLayer('resources')}
          className={`dock-btn ${layers.resources ? 'active' : 'opacity-70'}`}
          title={L('显隐能源电厂与矿产资源节点 (R)', 'Toggle power plants, mines & shale strata (R)')}
        >
          <Gem className="w-3.5 h-3.5" />
          <span>{L('资源', 'Resources')}</span>
        </button>

        <button
          onClick={() => {
            setMapMenuOpen(!mapMenuOpen);
            setPickerOpen(false);
          }}
          className={`dock-btn ${mapMenuOpen ? 'active' : ''}`}
          title={L('切换道路、铁路、海空枢纽、军事、奇观与货运图层', 'Toggle roads, rail, hubs, military, wonders & freight')}
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>{L('图层', 'Layers')}</span>
          <span
            className="text-[10px] font-mono-num px-1.5 rounded-full font-bold"
            style={{ background: 'var(--brass)', color: '#141B24' }}
          >
            {activeMapLayersCount}
          </span>
        </button>

        <div className="h-5 w-px bg-[var(--border-hairline)] mx-0.5 shrink-0" />

        <button onClick={() => setLens(null)} className={`dock-btn ${activeLensId === null ? 'active' : ''}`}>
          <Mountain className="w-3.5 h-3.5" />
          <span>{L('地形', 'Terrain')}</span>
        </button>

        <button onClick={() => setLens('density')} className={`dock-btn ${activeLensId === 'density' ? 'active' : ''}`}>
          <Users className="w-3.5 h-3.5" />
          <span>{L('人口', 'Density')}</span>
        </button>

        <button onClick={() => setLens('income')} className={`dock-btn ${activeLensId === 'income' ? 'active' : ''}`}>
          <DollarSign className="w-3.5 h-3.5" />
          <span>{L('收入', 'Income')}</span>
        </button>

        <button onClick={() => setLens('bachelors')} className={`dock-btn ${activeLensId === 'bachelors' ? 'active' : ''}`}>
          <GraduationCap className="w-3.5 h-3.5" />
          <span>{L('学历', 'Degrees')}</span>
        </button>

        <button
          onClick={() => {
            setPickerOpen(!pickerOpen);
            setMapMenuOpen(false);
          }}
          className={`dock-btn ${pickerOpen || (activeLensId && !['density', 'income', 'bachelors'].includes(activeLensId)) ? 'active' : ''}`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{L('19 视角', '19 Lenses')}</span>
          <ChevronUp className={`w-3.5 h-3.5 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
};
