import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Search } from 'lucide-react';
import { COLOR_RAMPS, formatMetric, sampleRamp } from '../lenses/lensConfig';
import { useL } from '../../i18n';
import type { SourceRecord } from '../../types/world';

/** Compact formatter for counts & money matching editorial 3-sig-fig style */
export function fmtCount3(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const a = Math.abs(n);
  const sig = (d: number, u: string) => (n / d).toFixed(a / d >= 100 ? 0 : a / d >= 10 ? 1 : 2) + u;
  if (a >= 1e12) return sig(1e12, 'T');
  if (a >= 1e9) return sig(1e9, 'B');
  if (a >= 1e6) return sig(1e6, 'M');
  if (a >= 1e4) return sig(1e3, 'K');
  return Math.round(n).toLocaleString();
}

export function fmtMoney3(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '–';
  const a = Math.abs(usd);
  if (a >= 1e12) return `$${(usd / 1e12).toFixed(a >= 10e12 ? 1 : 2)}T`;
  if (a >= 1e9) return `$${(usd / 1e9).toFixed(a >= 100e9 ? 0 : a >= 10e9 ? 1 : 2)}B`;
  if (a >= 1e6) return `$${(usd / 1e6).toFixed(a >= 100e6 ? 0 : 1)}M`;
  if (a >= 1e4) return `$${(usd / 1e3).toFixed(a >= 100e3 ? 0 : 1)}K`;
  return `$${Math.round(usd).toLocaleString()}`;
}

export function fmtMw(mwVal: number | null | undefined): string {
  if (mwVal == null || !Number.isFinite(mwVal)) return '–';
  if (mwVal >= 1000) return `${(mwVal / 1000).toFixed(mwVal >= 100000 ? 0 : 1)} GW`;
  return `${Math.round(mwVal).toLocaleString()} MW`;
}

export function fmtSignedPct(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;
}

/** 1. 3-Column Headline KPI Stat Tiles */
export const KpiTiles: React.FC<{ items: { label: string; value: string; sub?: string; color?: string }[] }> = ({ items }) => (
  <div className={`grid gap-2 ${items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
    {items.map((it) => (
      <div
        key={it.label}
        className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/70"
      >
        <div className="text-[9.5px] uppercase tracking-wider opacity-60">{it.label}</div>
        <div className="font-mono-num text-[15px] font-bold mt-0.5 leading-tight" style={it.color ? { color: it.color } : undefined}>
          {it.value}
        </div>
        {it.sub && <div className="text-[10px] opacity-65 mt-0.5 leading-tight">{it.sub}</div>}
      </div>
    ))}
  </div>
);

/** 2. Methodology Callout Note Box */
export const CalloutNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="px-3 py-2 rounded-lg text-[11px] leading-relaxed border-l-2"
    style={{
      background: 'rgba(212, 174, 94, 0.08)',
      borderColor: 'var(--brass)',
      color: 'var(--ink-secondary)',
    }}
  >
    {children}
  </div>
);

/** 3. Segmented Pill Control */
export const Segmented: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  size?: 'xs' | 'sm';
}> = ({ value, options, onChange, size = 'xs' }) => (
  <div className="inline-flex flex-wrap rounded-lg border border-[var(--border-hairline)] bg-black/25 p-0.5 gap-0.5">
    {options.map((o) => {
      const on = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md font-semibold transition cursor-pointer ${
            size === 'xs' ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-1 text-[11px]'
          } ${on ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-75 hover:opacity-100'}`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

/** 4. In-Panel Map Colour Picker Strip */
export const MapPickerBar: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ value, options, onChange }) => {
  const { L } = useL();
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-black/20">
      <span className="text-[10px] uppercase tracking-wider opacity-60 shrink-0">{L('地图着色', 'Map Color')}</span>
      <div className="flex flex-wrap gap-1 justify-end">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition cursor-pointer ${
              o.value === value
                ? 'bg-[var(--brass)] text-[#141B24]'
                : 'bg-white/5 opacity-75 hover:opacity-100'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/** 5. Horizontal Multi-Segment Proportional Share Bar (with hover & optional legend) */
export const ShareBar: React.FC<{
  segments: { key: string; label: string; value: number; color: string; valueText?: string }[];
  activeKey?: string | null;
  showLegend?: boolean;
  onHover?: (key: string | null) => void;
  onSelect?: (key: string) => void;
}> = ({ segments, activeKey, showLegend = false, onHover, onSelect }) => {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  return (
    <div>
      <div
        className="flex h-4 rounded-md overflow-hidden border border-[var(--border-hairline)] gap-[1px] bg-black/30"
        onMouseLeave={() => onHover?.(null)}
      >
        {segments.map((seg) => {
          const pct = (Math.max(0, seg.value) / total) * 100;
          if (pct < 0.35) return null;
          const dimmed = activeKey && activeKey !== seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              onMouseEnter={() => onHover?.(seg.key)}
              onClick={() => onSelect?.(seg.key)}
              title={`${seg.label}: ${seg.valueText ? `${seg.valueText} (${pct.toFixed(1)}%)` : `${pct.toFixed(1)}%`}`}
              className="h-full transition-opacity cursor-pointer"
              style={{ width: `${pct}%`, background: seg.color, opacity: dimmed ? 0.25 : 1 }}
            />
          );
        })}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10.5px]">
          {segments.filter((s) => s.value > 0).map((seg) => {
            const pct = (seg.value / total) * 100;
            const active = activeKey === seg.key;
            return (
              <button
                key={seg.key}
                type="button"
                onMouseEnter={() => onHover?.(seg.key)}
                onMouseLeave={() => onHover?.(null)}
                onClick={() => onSelect?.(seg.key)}
                className={`flex items-center gap-1 cursor-pointer transition ${
                  active ? 'font-bold underline' : 'opacity-80 hover:opacity-100'
                }`}
              >
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
                <span>{seg.label}</span>
                <span className="font-mono-num opacity-65">{seg.valueText ?? `${pct.toFixed(1)}%`}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** 6. Interactive Linked Horizontal Bar List */
export interface BarRowItem {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
  valueText: string;
  color: string;
  tone?: 'good' | 'bad';
}

export const LinkedBarList: React.FC<{
  rows: BarRowItem[];
  maxVal?: number;
  ranked?: boolean;
  compact?: boolean;
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  onClick?: (row: BarRowItem) => void;
}> = ({ rows, maxVal, ranked = false, compact = false, activeId, onHover, onClick }) => {
  const max = maxVal ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1e-6);
  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      {rows.map((r, idx) => {
        const active = activeId === r.id;
        return (
          <button
            key={r.id}
            type="button"
            onMouseEnter={() => onHover?.(r.id)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => onClick?.(r)}
            className={`w-full text-left px-2 ${compact ? 'py-1' : 'py-1.5'} rounded-lg transition cursor-pointer border ${
              active
                ? 'border-[var(--brass)] bg-[var(--brass-soft)]'
                : 'border-transparent hover:bg-[var(--surface-paper-hover)]'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate font-medium">
                {ranked && <span className="font-mono-num opacity-45 mr-1.5 text-[10px]">{idx + 1}</span>}
                {r.label}
                {r.sublabel && <span className="opacity-55 text-[10px] ml-1.5">{r.sublabel}</span>}
              </span>
              <span
                className={`font-mono-num font-bold shrink-0 ${
                  r.tone === 'good' ? 'text-emerald-400' : r.tone === 'bad' ? 'text-rose-400' : ''
                }`}
              >
                {r.valueText}
              </span>
            </div>
            <div className="h-[3.5px] rounded-full bg-white/10 mt-1 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, (Math.abs(r.value) / max) * 100)}%`, background: r.color }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};

/** 7. Stacked Horizontal Bar List (Power by State, Troops/Dollars by State, Ports Domestic/Import/Export) */
export interface StackedRowItem {
  id: string;
  label: string;
  sublabel?: string;
  total: number;
  totalText: string;
  parts: Record<string, number | undefined>;
}

export const StackedBarList: React.FC<{
  rows: StackedRowItem[];
  keys: { key: string; label: string; color: string }[];
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  onClick?: (id: string) => void;
}> = ({ rows, keys, activeId, onHover, onClick }) => {
  const maxTot = Math.max(1e-6, ...rows.map((r) => r.total));
  return (
    <div className="space-y-1">
      {rows.map((r, idx) => {
        const active = activeId === r.id;
        const barW = Math.min(100, (r.total / maxTot) * 100);
        return (
          <button
            key={r.id}
            type="button"
            onMouseEnter={() => onHover?.(r.id)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => onClick?.(r.id)}
            className={`w-full text-left px-2 py-1 rounded-lg transition cursor-pointer border ${
              active ? 'border-[var(--brass)] bg-[var(--brass-soft)]' : 'border-transparent hover:bg-[var(--surface-paper-hover)]'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate font-medium">
                <span className="font-mono-num opacity-45 mr-1.5 text-[10px]">{idx + 1}</span>
                {r.label}
                {r.sublabel && <span className="opacity-55 text-[10px] ml-1.5">{r.sublabel}</span>}
              </span>
              <span className="font-mono-num font-bold shrink-0">{r.totalText}</span>
            </div>
            <div className="h-[5px] rounded-full bg-white/10 mt-1 overflow-hidden">
              <div className="flex h-full rounded-full overflow-hidden" style={{ width: `${barW}%` }}>
                {keys.map((k) => {
                  const v = r.parts[k.key] ?? 0;
                  if (v <= 0 || r.total <= 0) return null;
                  return (
                    <div
                      key={k.key}
                      style={{ width: `${(v / r.total) * 100}%`, background: k.color }}
                      title={`${k.label}: ${fmtCount3(v)}`}
                    />
                  );
                })}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

/** 8. Diverging Bar Chart */
export const DivergingBarList: React.FC<{
  rows: { id: string; label: string; sublabel?: string; value: number; valueText: string }[];
  maxAbs?: number;
  onHover?: (id: string | null) => void;
  onClick?: (id: string) => void;
}> = ({ rows, maxAbs: maxAbsProp, onHover, onClick }) => {
  const maxAbs = maxAbsProp ?? Math.max(...rows.map((r) => Math.abs(r.value)), 0.01);
  return (
    <div className="space-y-0.5">
      {rows.map((r) => {
        const pos = r.value >= 0;
        const pct = Math.min(100, (Math.abs(r.value) / maxAbs) * 100);
        return (
          <button
            key={r.id}
            type="button"
            onMouseEnter={() => onHover?.(r.id)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => onClick?.(r.id)}
            className="w-full grid grid-cols-[1.4fr_1fr_54px] items-center gap-2 px-2 py-1 rounded hover:bg-[var(--surface-paper-hover)] text-[11px] cursor-pointer text-left"
          >
            <span className="truncate font-medium">
              {r.label}
              {r.sublabel && <span className="opacity-55 text-[10px] ml-1">{r.sublabel}</span>}
            </span>
            <div className="grid grid-cols-2 items-center h-2.5 bg-white/5 rounded overflow-hidden">
              <div className="flex justify-end h-full border-r border-white/15">
                {!pos && <div className="h-full bg-rose-500/85 rounded-l" style={{ width: `${pct}%` }} />}
              </div>
              <div className="flex justify-start h-full">
                {pos && <div className="h-full bg-emerald-400/85 rounded-r" style={{ width: `${pct}%` }} />}
              </div>
            </div>
            <span className={`font-mono-num font-bold text-right ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
              {r.valueText}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/** 9. Interactive Distribution Histogram (supports log, population-weighted, color ramp, marker line, hover & click-pin!) */
export const InteractiveHistogram: React.FC<{
  values: { val: number; weight?: number; hexIds: number[]; pop?: number }[];
  bins?: number;
  log?: boolean;
  weighted?: boolean;
  domain?: [number, number];
  marker?: { value: number; label: string };
  fmt: string;
  ramp?: keyof typeof COLOR_RAMPS;
  color?: string;
  pinnedIdx?: number | null;
  onHoverRange: (hexIds: Set<number> | null, label?: string) => void;
  onPinBin?: (bin: { idx: number; loVal: number; hiVal: number; count: number; totalPop: number; hexIds: number[] } | null) => void;
}> = ({
  values,
  bins = 28,
  log = false,
  weighted = false,
  domain,
  marker,
  fmt,
  ramp,
  color = '#d98a2b',
  pinnedIdx = null,
  onHoverRange,
  onPinBin,
}) => {
  const { locale, L } = useL();
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);

  const hist = useMemo(() => {
    const clean = values.filter((v) => Number.isFinite(v.val) && (!log || v.val > 0));
    if (clean.length === 0) return null;
    const trans = clean.map((v) => ({ ...v, tv: log ? Math.log10(v.val) : v.val }));
    let lo: number, hi: number;
    if (domain) {
      lo = log ? Math.log10(Math.max(1e-6, domain[0])) : domain[0];
      hi = log ? Math.log10(Math.max(1e-5, domain[1])) : domain[1];
    } else {
      const sorted = [...trans].sort((a, b) => a.tv - b.tv);
      lo = sorted[Math.floor(sorted.length * 0.01)].tv;
      hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))].tv;
    }
    const span = Math.max(1e-6, hi - lo);
    const arr = Array.from({ length: bins }, (_, i) => {
      const t = (i + 0.5) / bins;
      let barColor = color;
      if (ramp) {
        const rgb = sampleRamp(ramp, t);
        barColor = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
      }
      return {
        idx: i,
        loVal: log ? Math.pow(10, lo + (span * i) / bins) : lo + (span * i) / bins,
        hiVal: log ? Math.pow(10, lo + (span * (i + 1)) / bins) : lo + (span * (i + 1)) / bins,
        count: 0,
        weightSum: 0,
        totalPop: 0,
        hexIds: [] as number[],
        color: barColor,
      };
    });
    for (const item of trans) {
      const bi = Math.max(0, Math.min(bins - 1, Math.floor(((item.tv - lo) / span) * bins)));
      arr[bi].count++;
      arr[bi].weightSum += weighted ? (item.weight ?? item.pop ?? 1) : 1;
      arr[bi].totalPop += item.pop ?? item.weight ?? 0;
      for (const h of item.hexIds) arr[bi].hexIds.push(h);
    }
    const maxW = Math.max(1e-6, ...arr.map((a) => a.weightSum));
    let markerPct: number | null = null;
    if (marker && Number.isFinite(marker.value) && (!log || marker.value > 0)) {
      const mv = log ? Math.log10(marker.value) : marker.value;
      const mp = ((mv - lo) / span) * 100;
      if (mp >= 0 && mp <= 100) markerPct = mp;
    }
    return {
      bins: arr.map((a) => ({ ...a, pctH: a.weightSum > 0 ? Math.max(0.05, a.weightSum / maxW) : 0 })),
      markerPct,
    };
  }, [values, bins, log, weighted, domain, marker, ramp, color]);

  if (!hist) return null;

  return (
    <div>
      <div
        className="relative flex items-end gap-[1.5px] h-24 px-1.5 pt-4 pb-0.5 rounded-lg bg-black/25 border border-[var(--border-hairline)]"
        onMouseLeave={() => {
          setHoverInfo(null);
          onHoverRange(null);
        }}
      >
        {hist.markerPct !== null && marker && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-amber-300/80 pointer-events-none z-10"
            style={{ left: `${hist.markerPct}%` }}
          >
            <span className="absolute top-0.5 left-1 text-[8.5px] font-mono-num whitespace-nowrap px-1 rounded bg-black/75 text-amber-200">
              {marker.label}
            </span>
          </div>
        )}
        {hist.bins.map((b) => {
          const isPinned = pinnedIdx === b.idx;
          return (
            <div
              key={b.idx}
              onMouseEnter={() => {
                const txt = L(
                  `${formatMetric(b.loVal, fmt, locale)} – ${formatMetric(b.hiVal, fmt, locale)}：${b.count.toLocaleString()} 县${b.totalPop > 0 ? ` · ${fmtCount3(b.totalPop)} 人` : ''}`,
                  `${formatMetric(b.loVal, fmt, locale)} – ${formatMetric(b.hiVal, fmt, locale)}: ${b.count.toLocaleString()} counties${b.totalPop > 0 ? ` · ${fmtCount3(b.totalPop)} pop` : ''}`,
                );
                setHoverInfo(txt);
                onHoverRange(new Set(b.hexIds), txt);
              }}
              onClick={() => onPinBin?.(isPinned ? null : b)}
              className="flex-1 rounded-t-[2px] cursor-pointer hover:brightness-125 transition"
              style={{
                height: `${Math.round(b.pctH * 100)}%`,
                background: b.color,
                opacity: pinnedIdx !== null && !isPinned ? 0.3 : 0.92,
                outline: isPinned ? '1px solid #FFF4D4' : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[9.5px] font-mono-num opacity-70 mt-1 gap-2">
        <span>{formatMetric(hist.bins[0].loVal, fmt, locale)}</span>
        <span className="truncate text-center text-amber-200/90">
          {hoverInfo ?? (onPinBin ? L('悬停高亮 · 点击锁定区间', 'Hover to highlight · Click to pin') : L('悬停直方柱联动地图', 'Hover bars to highlight map'))}
        </span>
        <span>{formatMetric(hist.bins[hist.bins.length - 1].hiVal, fmt, locale)}</span>
      </div>
    </div>
  );
};

/** 10. Full Interactive Drag-to-Brush SVG Scatter Plot (supports log X/Y, ratio slopes, ref lines, labels & brush box!) */
export interface ScatterPoint {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  r: number;
  color: string;
  hexIds?: number[];
  fly?: [number, number];
  extraTip?: string;
}

export const BrushScatter: React.FC<{
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xFmt: string;
  yFmt: string;
  logX?: boolean;
  logY?: boolean;
  height?: number;
  slopeLines?: { slope: number; label: string }[];
  refX?: { v: number; label: string }[];
  refY?: { v: number; label: string }[];
  labelIds?: Set<string>;
  selectedIds?: Set<string> | null;
  onHoverPoint?: (p: ScatterPoint | null) => void;
  onClickPoint?: (p: ScatterPoint) => void;
  onBrush?: (ids: Set<string> | null) => void;
}> = ({
  points,
  xLabel,
  yLabel,
  xFmt,
  yFmt,
  logX = false,
  logY = false,
  height = 240,
  slopeLines,
  refX,
  refY,
  labelIds,
  selectedIds,
  onHoverPoint,
  onClickPoint,
  onBrush,
}) => {
  const { locale, L } = useL();
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [hotPtId, setHotPtId] = useState<string | null>(null);
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const W = 408;
  const H = height;
  const pad = { l: 48, r: 14, t: 14, b: 30 };

  const layout = useMemo(() => {
    const clean = points.filter(
      (p) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        (!logX || p.x > 0) &&
        (!logY || p.y > 0),
    );
    if (clean.length === 0) return null;
    const tx = (v: number) => (logX ? Math.log10(v) : v);
    const ty = (v: number) => (logY ? Math.log10(v) : v);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxR = 1;
    for (const p of clean) {
      const xv = tx(p.x), yv = ty(p.y);
      if (xv < minX) minX = xv;
      if (xv > maxX) maxX = xv;
      if (yv < minY) minY = yv;
      if (yv > maxY) maxY = yv;
      if (p.r > maxR) maxR = p.r;
    }
    const dx = Math.max(1e-6, maxX - minX);
    const dy = Math.max(1e-6, maxY - minY);
    const nonNegX = !logX && minX >= 0;
    const nonNegY = !logY && minY >= 0;
    minX -= dx * 0.04; maxX += dx * 0.04;
    if (nonNegX && minX < 0) minX = 0;
    minY -= dy * 0.05; maxY += dy * 0.06;
    if (nonNegY && minY < 0) minY = 0;
    const sx = Math.max(1e-6, maxX - minX);
    const sy = Math.max(1e-6, maxY - minY);
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    const mapX = (raw: number) => pad.l + ((tx(raw) - minX) / sx) * pw;
    const mapY = (raw: number) => pad.t + ph - ((ty(raw) - minY) / sy) * ph;
    const mapTX = (tv: number) => pad.l + ((tv - minX) / sx) * pw;
    const mapTY = (tv: number) => pad.t + ph - ((tv - minY) / sy) * ph;

    const pts = clean.map((p) => ({
      ...p,
      px: mapX(p.x),
      py: mapY(p.y),
      pr: (clean.length > 600 ? 1.5 : 2.6) + Math.sqrt(Math.max(0, p.r) / maxR) * (clean.length > 600 ? 8.5 : 10.5),
    }));

    return { minX, maxX, minY, maxY, pw, ph, mapX, mapY, mapTX, mapTY, pts };
  }, [points, logX, logY, H]);

  const useCanvas = (layout?.pts.length ?? 0) > 650;

  useEffect(() => {
    if (!useCanvas || !layout || !canvasRef.current) return;
    const cvs = canvasRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const p of layout.pts) {
      const inSel = !selectedIds || selectedIds.has(p.id);
      const isHot = hotPtId === p.id;
      ctx.beginPath();
      ctx.arc(p.px, p.py, isHot ? p.pr + 1.5 : p.pr, 0, Math.PI * 2);
      ctx.globalAlpha = isHot ? 1 : inSel ? 0.68 : 0.12;
      ctx.fillStyle = p.color;
      ctx.fill();
      if (isHot || (selectedIds && inSel)) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#FFF4D4';
        ctx.lineWidth = isHot ? 1.6 : 0.9;
        ctx.stroke();
      } else if (p.pr > 3) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = 'rgba(10,16,24,0.6)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }, [useCanvas, layout, selectedIds, hotPtId, H]);

  const toSvgCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const findNearestPt = (sx: number, sy: number) => {
    if (!layout) return null;
    let best: (typeof layout.pts)[number] | null = null;
    let bestD2 = 144;
    for (const p of layout.pts) {
      const dx = p.px - sx, dy = p.py - sy;
      const d2 = dx * dx + dy * dy;
      const r2 = Math.max(36, (p.pr + 3) * (p.pr + 3));
      if (d2 <= r2 && d2 < bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    return best;
  };

  if (!layout) {
    return <div className="p-4 text-center text-[11px] opacity-60 rounded-lg bg-black/20">{L('当前筛选下无有效散点数据', 'No valid scatter points under current filter')}</div>;
  }

  return (
    <div>
      <div className="relative rounded-lg bg-black/25 border border-[var(--border-hairline)] overflow-hidden">
        {useCanvas && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`relative z-[1] w-full h-auto block select-none ${onBrush ? 'cursor-crosshair' : ''}`}
        onMouseDown={(e) => {
          if (!onBrush) return;
          const pt = toSvgCoords(e);
          dragStartRef.current = pt;
          setBrush({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
        }}
        onMouseMove={(e) => {
          const pt = toSvgCoords(e);
          if (dragStartRef.current) {
            setBrush({ x0: dragStartRef.current.x, y0: dragStartRef.current.y, x1: pt.x, y1: pt.y });
            return;
          }
          if (useCanvas) {
            const hit = findNearestPt(pt.x, pt.y);
            if (hit?.id !== hotPtId) {
              setHotPtId(hit?.id ?? null);
              setTip(hit ? `${hit.label}${hit.sub ? ` (${hit.sub})` : ''} · ${xLabel} ${formatMetric(hit.x, xFmt, locale)} · ${yLabel} ${formatMetric(hit.y, yFmt, locale)}${hit.extraTip ? ` · ${hit.extraTip}` : ''}` : null);
              onHoverPoint?.(hit);
            }
          }
        }}
        onMouseLeave={() => {
          if (useCanvas && hotPtId) {
            setHotPtId(null);
            setTip(null);
            onHoverPoint?.(null);
          }
        }}
        onMouseUp={(e) => {
          if (!dragStartRef.current) return;
          const b = brush;
          dragStartRef.current = null;
          setBrush(null);
          if (!b || !onBrush) return;
          const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
          const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
          if (x1 - x0 < 6 || y1 - y0 < 6) {
            if (useCanvas) {
              const pt = toSvgCoords(e);
              const hit = findNearestPt(pt.x, pt.y);
              if (hit) onClickPoint?.(hit);
            }
            return;
          }
          const hit = new Set<string>();
          for (const p of layout.pts) {
            if (p.px >= x0 && p.px <= x1 && p.py >= y0 && p.py <= y1) hit.add(p.id);
          }
          onBrush(hit.size > 0 ? hit : null);
        }}
      >
        {/* Gridlines & Axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const txv = layout.minX + (layout.maxX - layout.minX) * f;
          const tyv = layout.minY + (layout.maxY - layout.minY) * f;
          const rawX = logX ? Math.pow(10, txv) : txv;
          const rawY = logY ? Math.pow(10, tyv) : tyv;
          const gx = pad.l + layout.pw * f;
          const gy = pad.t + layout.ph * (1 - f);
          return (
            <g key={f}>
              {f > 0 && f < 1 && (
                <>
                  <line x1={gx} y1={pad.t} x2={gx} y2={H - pad.b} stroke="rgba(255,255,255,0.06)" />
                  <line x1={pad.l} y1={gy} x2={W - pad.r} y2={gy} stroke="rgba(255,255,255,0.06)" />
                </>
              )}
              {(f === 0 || f === 0.5 || f === 1) && (
                <>
                  <text x={gx} y={H - pad.b + 11} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fontSize="8.5" fill="currentColor" opacity="0.58">
                    {formatMetric(rawX, xFmt, locale)}
                  </text>
                  <text x={pad.l - 4} y={gy + 3} textAnchor="end" fontSize="8.5" fill="currentColor" opacity="0.58">
                    {formatMetric(rawY, yFmt, locale)}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Vertical Reference Lines (e.g., median county age) */}
        {refX?.map((rx) => {
          if (logX && rx.v <= 0) return null;
          const px = layout.mapX(rx.v);
          if (px < pad.l || px > W - pad.r) return null;
          return (
            <g key={rx.label}>
              <line x1={px} y1={pad.t} x2={px} y2={H - pad.b} stroke="var(--brass)" strokeDasharray="3 3" strokeWidth="1" opacity="0.7" />
              <text x={px + 3} y={pad.t + 9} fontSize="8.5" fill="var(--brass-bright)" opacity="0.88">{rx.label}</text>
            </g>
          );
        })}

        {/* Horizontal Reference Lines (e.g., U.S. +2.9% growth) */}
        {refY?.map((ry) => {
          if (logY && ry.v <= 0) return null;
          const py = layout.mapY(ry.v);
          if (py < pad.t || py > H - pad.b) return null;
          return (
            <g key={ry.label}>
              <line x1={pad.l} y1={py} x2={W - pad.r} y2={py} stroke="var(--brass)" strokeDasharray="3 3" strokeWidth="1" opacity="0.7" />
              <text x={W - pad.r - 3} y={py - 3} textAnchor="end" fontSize="8.5" fill="var(--brass-bright)" opacity="0.88">{ry.label}</text>
            </g>
          );
        })}

        {/* Diagonal Ratio Slope Lines (works cleanly on BOTH linear and log-log scales!) */}
        {slopeLines?.map((sl) => {
          const xMinRaw = logX ? Math.pow(10, layout.minX) : layout.minX;
          const xMaxRaw = logX ? Math.pow(10, layout.maxX) : layout.maxX;
          const yMinRaw = logY ? Math.pow(10, layout.minY) : layout.minY;
          const yMaxRaw = logY ? Math.pow(10, layout.maxY) : layout.maxY;
          const x0 = Math.max(xMinRaw, yMinRaw / sl.slope);
          const x1 = Math.min(xMaxRaw, yMaxRaw / sl.slope);
          if (x1 <= x0) return null;
          const px0 = layout.mapX(x0), py0 = layout.mapY(sl.slope * x0);
          const px1 = layout.mapX(x1), py1 = layout.mapY(sl.slope * x1);
          return (
            <g key={sl.label}>
              <line x1={px0} y1={py0} x2={px1} y2={py1} stroke="var(--brass)" strokeDasharray="4 3" strokeWidth="1" opacity="0.65" />
              <text x={px1 - 3} y={py1 + 10} textAnchor="end" fontSize="9" fill="var(--brass-bright)" opacity="0.9">
                {sl.label}
              </text>
            </g>
          );
        })}

        {/* Data Points (SVG for <=650 pts; dense 3,109-county scatters draw on high-DPI canvas below!) */}
        {!useCanvas && layout.pts.map((p) => {
          const inSel = !selectedIds || selectedIds.has(p.id);
          return (
            <circle
              key={p.id}
              cx={p.px}
              cy={p.py}
              r={p.pr}
              fill={p.color}
              fillOpacity={inSel ? 0.72 : 0.14}
              stroke={selectedIds && inSel ? '#FFF4D4' : 'rgba(10,16,24,0.45)'}
              strokeWidth={selectedIds && inSel ? 1.1 : 0.5}
              className="cursor-pointer hover:stroke-white hover:stroke-2"
              onMouseEnter={() => {
                setTip(`${p.label}${p.sub ? ` (${p.sub})` : ''} · ${xLabel} ${formatMetric(p.x, xFmt, locale)} · ${yLabel} ${formatMetric(p.y, yFmt, locale)}${p.extraTip ? ` · ${p.extraTip}` : ''}`);
                onHoverPoint?.(p);
              }}
              onMouseLeave={() => {
                setTip(null);
                onHoverPoint?.(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onClickPoint?.(p);
              }}
            />
          );
        })}

        {/* Top-N City/County Callout Labels (with greedy AABB de-collision) */}
        {labelIds && (() => {
          const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
          const candidates = layout.pts.filter((p) => labelIds.has(p.id)).sort((a, b) => b.r - a.r);
          return candidates.map((p) => {
            const text = p.label.replace(/ County$| Parish$/, '');
            const tw = text.length * 4.8 + 4;
            const th = 10;
            const tries = [
              { x: p.px + p.pr + 3, y: p.py + 3, anchor: 'start' as const, x0: p.px + p.pr + 3 },
              { x: p.px - p.pr - 3, y: p.py + 3, anchor: 'end' as const, x0: p.px - p.pr - 3 - tw },
              { x: p.px, y: p.py - p.pr - 3, anchor: 'middle' as const, x0: p.px - tw / 2 },
              { x: p.px, y: p.py + p.pr + 10, anchor: 'middle' as const, x0: p.px - tw / 2 },
            ];
            for (const tr of tries) {
              const box = { x0: tr.x0, y0: tr.y - th + 1, x1: tr.x0 + tw, y1: tr.y + 2 };
              if (box.x0 < pad.l || box.x1 > W - pad.r || box.y0 < pad.t || box.y1 > H - pad.b) continue;
              const hit = placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1));
              if (!hit) {
                placed.push(box);
                return (
                  <text
                    key={`lbl-${p.id}`}
                    x={tr.x}
                    y={tr.y}
                    textAnchor={tr.anchor}
                    fontSize="8.5"
                    fontWeight="600"
                    fill="#F6EFE0"
                    stroke="rgba(10,16,24,0.85)"
                    strokeWidth="2.4"
                    paintOrder="stroke"
                    className="pointer-events-none"
                  >
                    {text}
                  </text>
                );
              }
            }
            return null;
          });
        })()}

        {/* Active Drag Brush Box */}
        {brush && (
          <rect
            x={Math.min(brush.x0, brush.x1)}
            y={Math.min(brush.y0, brush.y1)}
            width={Math.abs(brush.x1 - brush.x0)}
            height={Math.abs(brush.y1 - brush.y0)}
            fill="rgba(212, 174, 94, 0.18)"
            stroke="var(--brass-bright)"
            strokeDasharray="3 2"
            strokeWidth="1.2"
          />
        )}

        <text x={pad.l + layout.pw / 2} y={H - 4} textAnchor="middle" fontSize="9.5" fill="currentColor" opacity="0.72">
          {xLabel}{logX ? ' (log)' : ''}
        </text>
        <text x={11} y={pad.t + layout.ph / 2} textAnchor="middle" fontSize="9.5" fill="currentColor" opacity="0.72" transform={`rotate(-90 11 ${pad.t + layout.ph / 2})`}>
          {yLabel}{logY ? ' (log)' : ''}
        </text>
      </svg>
      </div>
      <div className="text-[10px] font-mono-num opacity-75 mt-1 min-h-[15px] truncate">
        {tip ??
          L(
            `共 ${layout.pts.length.toLocaleString()} 个节点 · ${onBrush ? '拖拽框选联动地图 · ' : ''}悬停查看，点击飞镜`,
            `${layout.pts.length.toLocaleString()} points · ${onBrush ? 'Drag to brush map · ' : ''}Hover to inspect, click to fly`,
          )}
      </div>
    </div>
  );
};

/** 11. Compact Searchable & Sortable Advisor Table */
export interface TableColumn<T> {
  key: string;
  label: string;
  align?: 'l' | 'r';
  value: (r: T) => string | number | null | undefined;
  render?: (r: T) => React.ReactNode;
  barMax?: number;
  barColor?: string;
}

export function SortableTable<T extends { id: string }>({
  rows,
  columns,
  defaultSort,
  defaultDir = 'desc',
  searchPlaceholder,
  searchText,
  ranked = true,
  maxHeight = 250,
  activeId,
  onHover,
  onClick,
}: {
  rows: T[];
  columns: TableColumn<T>[];
  defaultSort: string;
  defaultDir?: 'asc' | 'desc';
  searchPlaceholder?: string;
  searchText?: (r: T) => string;
  ranked?: boolean;
  maxHeight?: number;
  activeId?: string | null;
  onHover?: (r: T | null) => void;
  onClick?: (r: T) => void;
}) {
  const { L } = useL();
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState(defaultSort);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollBoxRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = ql
      ? rows.filter((r) => (searchText ? searchText(r) : String(columns[0]?.value(r) ?? '')).toLowerCase().includes(ql))
      : rows;
    const col = columns.find((c) => c.key === sortKey) ?? columns[0];
    if (!col) return list;
    return [...list].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [rows, q, sortKey, sortDir, columns, searchText]);

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(k);
      setSortDir('desc');
    }
    if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = 0;
    setScrollTop(0);
  };

  // True virtual scrolling so ALL 3,109 counties / 524 metros / 671 bases render with zero 120-row cap!
  const ROW_H = 29;
  const OVERSCAN = 10;
  const totalCount = visible.length;
  const useVirt = totalCount > 80;
  const startIdx = useVirt ? Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN) : 0;
  const visRowsCount = Math.ceil(maxHeight / ROW_H) + OVERSCAN * 2;
  const endIdx = useVirt ? Math.min(totalCount, startIdx + visRowsCount) : totalCount;
  const topPad = useVirt ? startIdx * ROW_H : 0;
  const botPad = useVirt ? Math.max(0, (totalCount - endIdx) * ROW_H) : 0;
  const slice = visible.slice(startIdx, endIdx);
  const colSpan = columns.length + (ranked ? 1 : 0);

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] overflow-hidden bg-black/20">
      {searchPlaceholder && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[var(--border-hairline)]"
          style={{ background: 'var(--surface-paper-subtle)' }}
        >
          <Search className="w-3 h-3 opacity-50 shrink-0" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = 0;
              setScrollTop(0);
            }}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent outline-none text-[11px] placeholder:opacity-50"
          />
          <span className="text-[10px] font-mono-num opacity-65 shrink-0">{L(`共 ${totalCount.toLocaleString()} 条`, `${totalCount.toLocaleString()} rows`)}</span>
        </div>
      )}
      <div
        ref={scrollBoxRef}
        onScroll={useVirt ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
        className="overflow-y-auto"
        style={{ maxHeight }}
      >
        <table className="w-full text-[11px] border-collapse">
          <thead
            className="sticky top-0 z-10 border-b border-[var(--border-hairline)]"
            style={{ background: 'var(--surface-paper)' }}
          >
            <tr>
              {ranked && <th className="py-1.5 pl-2 pr-1 text-left opacity-45 font-mono-num w-8">#</th>}
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`py-1.5 px-1.5 font-semibold opacity-75 hover:opacity-100 cursor-pointer select-none whitespace-nowrap ${
                    c.align === 'l' ? 'text-left' : 'text-right'
                  }`}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {c.label}
                    {sortKey === c.key && (sortDir === 'desc' ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && (
              <tr aria-hidden="true">
                <td colSpan={colSpan} style={{ height: topPad, padding: 0, border: 0 }} />
              </tr>
            )}
            {slice.map((r, localIdx) => {
              const idx = startIdx + localIdx;
              const hot = activeId === r.id;
              return (
                <tr
                  key={r.id}
                  style={useVirt ? { height: ROW_H } : undefined}
                  onMouseEnter={() => onHover?.(r)}
                  onMouseLeave={() => onHover?.(null)}
                  onClick={() => onClick?.(r)}
                  className={`border-b border-white/[0.04] cursor-pointer transition ${
                    hot ? 'bg-[var(--brass-soft)]' : 'hover:bg-[var(--surface-paper-hover)]'
                  }`}
                >
                  {ranked && <td className="py-1 pl-2 pr-1 font-mono-num opacity-45 text-[10px]">{idx + 1}</td>}
                  {columns.map((c) => {
                    const raw = c.value(r);
                    const pctBar = c.barMax && typeof raw === 'number' ? Math.min(100, (Math.max(0, raw) / c.barMax) * 100) : 0;
                    return (
                      <td
                        key={c.key}
                        className={`py-1 px-1.5 relative ${c.align === 'l' ? 'text-left' : 'text-right font-mono-num'}`}
                      >
                        {pctBar > 0 && (
                          <span
                            className="absolute inset-y-0.5 right-0 rounded-sm pointer-events-none"
                            style={{ width: `${pctBar}%`, background: c.barColor ?? 'rgba(212,174,94,0.22)' }}
                          />
                        )}
                        <span className="relative z-[1]">{c.render ? c.render(r) : (raw ?? '–')}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {botPad > 0 && (
              <tr aria-hidden="true">
                <td colSpan={colSpan} style={{ height: botPad, padding: 0, border: 0 }} />
              </tr>
            )}
            {totalCount === 0 && (
              <tr>
                <td colSpan={colSpan} className="py-4 text-center opacity-55">
                  {L('无匹配条目', 'No matching entries')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 12. Circle Area Size Legend */
export const SizeLegend: React.FC<{
  items: { label: string; r: number }[];
  caption: string;
  color?: string;
}> = ({ items, caption, color = 'var(--brass)' }) => (
  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/20 border border-[var(--border-hairline)] text-[10px]">
    <span className="opacity-65">{caption}</span>
    <div className="flex items-center gap-3">
      {items.map((it) => {
        const d = Math.max(6, Math.min(26, it.r * 2));
        return (
          <span key={it.label} className="flex items-center gap-1 font-mono-num opacity-85">
            <span
              className="rounded-full border inline-block shrink-0"
              style={{ width: d, height: d, borderColor: color, background: `${color}33` }}
            />
            {it.label}
          </span>
        );
      })}
    </div>
  </div>
);

/** 13. Horizontal Color Ramp Legend */
export const RampLegend: React.FC<{
  ramp: keyof typeof COLOR_RAMPS;
  minLabel: string;
  maxLabel: string;
  title: string;
}> = ({ ramp, minLabel, maxLabel, title }) => {
  const stops = COLOR_RAMPS[ramp] ?? COLOR_RAMPS.wealth;
  return (
    <div className="text-[10px] space-y-1">
      <div className="flex justify-between opacity-75">
        <span>{title}</span>
        <span className="font-mono-num">{minLabel} — {maxLabel}</span>
      </div>
      <div
        className="h-2 rounded-full border border-white/15"
        style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }}
      />
    </div>
  );
};

/** 14. Swatch Legend */
export const SwatchLegend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] opacity-85">
    {items.map((it) => (
      <span key={it.label} className="inline-flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
        {it.label}
      </span>
    ))}
  </div>
);

/** 15. Small Multiples Donut Grid (State Land Cover Recipes!) */
export const SmallMultiplesDonuts: React.FC<{
  items: { id: string; label: string; centerText: string; parts: { key: string; value: number; color: string }[] }[];
  onHover?: (id: string | null) => void;
  onClick?: (id: string) => void;
}> = ({ items, onHover, onClick }) => {
  const R = 22;
  const C = 2 * Math.PI * R;
  return (
    <div className="grid grid-cols-4 gap-1.5 max-h-[340px] overflow-y-auto pr-0.5">
      {items.map((it) => {
        const tot = it.parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
        let offset = 0;
        return (
          <button
            key={it.id}
            type="button"
            onMouseEnter={() => onHover?.(it.id)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => onClick?.(it.id)}
            className="flex flex-col items-center p-1.5 rounded-lg border border-[var(--border-hairline)] hover:border-[var(--brass)] bg-black/20 cursor-pointer transition"
          >
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
              {it.parts.map((p) => {
                const len = (Math.max(0, p.value) / tot) * C;
                const dash = `${len} ${C - len}`;
                const el = (
                  <circle
                    key={p.key}
                    cx="28"
                    cy="28"
                    r={R}
                    fill="none"
                    stroke={p.color}
                    strokeWidth="8"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 28 28)"
                  />
                );
                offset += len;
                return el;
              })}
              <text x="28" y="31" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" className="font-mono-num">
                {it.centerText}
              </text>
            </svg>
            <span className="text-[10px] font-semibold truncate max-w-full mt-0.5">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
};

/** 16. Annual Column Chart (NOAA 1980–2024 Billion-Dollar Events) */
export const AnnualColumnChart: React.FC<{
  items: { year: number; count: number; cost_busd: number }[];
}> = ({ items }) => {
  const { L } = useL();
  const [tip, setTip] = useState<string | null>(null);
  if (items.length === 0) return null;
  const maxC = Math.max(1, ...items.map((x) => x.count));
  const W = 400, H = 96, ml = 4, mr = 4, mt = 10, mb = 16;
  const bw = (W - ml - mr) / items.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-black/25 border border-[var(--border-hairline)]">
        {items.map((it, i) => {
          const h = (it.count / maxC) * (H - mt - mb);
          return (
            <rect
              key={it.year}
              x={ml + i * bw + 0.5}
              y={H - mb - h}
              width={Math.max(1, bw - 1.2)}
              height={h}
              fill="#cf6a4a"
              className="hover:fill-amber-300 cursor-pointer transition-colors"
              onMouseEnter={() =>
                setTip(
                  L(
                    `${it.year} 年：${it.count} 起十亿美元级灾害 · 损失 $${it.cost_busd.toFixed(1)}B`,
                    `${it.year}: ${it.count} billion-dollar events · $${it.cost_busd.toFixed(1)}B loss`,
                  ),
                )
              }
              onMouseLeave={() => setTip(null)}
            />
          );
        })}
        <line x1={ml} x2={W - mr} y1={H - mb + 0.5} y2={H - mb + 0.5} stroke="rgba(255,255,255,0.18)" />
        <text x={ml + 2} y={H - 4} fontSize="8.5" fill="currentColor" opacity="0.65">{items[0].year}</text>
        <text x={W - mr - 2} y={H - 4} textAnchor="end" fontSize="8.5" fill="currentColor" opacity="0.65">{items[items.length - 1].year}</text>
        <text x={ml + 3} y={mt + 2} fontSize="8.5" fill="currentColor" opacity="0.65">{L(`峰值 ${maxC} 起/年`, `Peak ${maxC}/yr`)}</text>
      </svg>
      <div className="text-[10px] font-mono-num opacity-75 mt-1 min-h-[14px]">
        {tip ?? L('悬停任意年份查看十亿美元级灾害次数与通胀调整后损失', 'Hover any year for billion-dollar event count & CPI-adjusted loss')}
      </div>
    </div>
  );
};

/** 17. Editorial Sources & Methodology Caveats Footer (matches reference sourcesHtml on every advisor!) */
export const SourcesFooter: React.FC<{
  sources: SourceRecord[];
  sourceIds: string[];
  notes: string[];
}> = ({ sources, sourceIds, notes }) => {
  const { L } = useL();
  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const list = useMemo(
    () => Array.from(new Set(sourceIds)).map((id) => byId.get(id)).filter((s): s is SourceRecord => Boolean(s)),
    [sourceIds, byId],
  );
  return (
    <div className="pt-3 mt-2 border-t border-[var(--border-hairline)] space-y-2 text-[10.5px] opacity-80">
      <div className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--brass)' }}>
        {L('数据来源与统计口径说明 · SOURCES & NOTES', 'SOURCES & METHODOLOGY NOTES')}
      </div>
      {notes.length > 0 && (
        <ul className="space-y-1 pl-3.5 list-disc leading-relaxed m-0 opacity-85">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {list.map((s) => (
            <a
              key={s.id}
              href={s.homepage}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/15 bg-white/5 hover:border-[var(--brass)] hover:bg-[var(--brass-soft)] text-[9.5px] transition no-underline"
              style={{ color: 'var(--ink-primary)' }}
              title={`${s.publisher} · ${s.vintage}`}
            >
              <span>{s.title}</span>
              <span className="opacity-55">({s.vintage})</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
