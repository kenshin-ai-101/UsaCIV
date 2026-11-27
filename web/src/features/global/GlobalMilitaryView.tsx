import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Globe,
  Info,
  MapPin,
  RotateCcw,
  Shield,
  Users,
  X,
} from 'lucide-react';
import {
  GLOBAL_BRANCH_COLORS,
  GlobalMapCamera,
  renderGlobalMilitaryChart,
  type GlobalHitResult,
} from '../../engine/globalMap';
import { useAppStore } from '../../store/useAppStore';
import {
  localizeGlobalBranch,
  localizeGlobalComponent,
  localizeGlobalCountry,
  localizeGlobalRegion,
  useL,
} from '../../i18n';
import {
  CalloutNote,
  fmtCount3,
  fmtMoney3,
  KpiTiles,
  Segmented,
  ShareBar,
  SortableTable,
  SourcesFooter,
} from '../advisors/AdvisorCharts';
import type {
  GlobalBaseRecord,
  GlobalCountryRecord,
  GlobalMilitaryDataset,
  NavyFleetRecord,
  WorldMeta,
} from '../../types/world';

interface GlobalMilitaryViewProps {
  meta: WorldMeta;
  dataset: GlobalMilitaryDataset | null;
  loading: boolean;
  error: string | null;
}

const ALL_BRANCHES = ['army', 'navy', 'air_force', 'marines', 'reserve_guard'] as const;

function fmtDms(val: number, posHem: string, negHem: string): string {
  const hem = val >= 0 ? posHem : negHem;
  const abs = Math.abs(val);
  const d = Math.floor(abs);
  const m = Math.round((abs - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}'${hem}`;
}

export const GlobalMilitaryView: React.FC<GlobalMilitaryViewProps> = ({
  meta,
  dataset,
  loading,
  error,
}) => {
  const { locale, isEn, L } = useL();
  const { theme, setMapView, setHelpOpen } = useAppStore();

  const [drawerOpen, setDrawerOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const [tab, setTab] = useState<'bases' | 'countries'>('bases');
  const [activeCocom, setActiveCocom] = useState<string | null>(null);
  const [activeBranches, setActiveBranches] = useState<Set<string>>(() => new Set(ALL_BRANCHES));
  const [showBases, setShowBases] = useState(true);
  const [showTroops, setShowTroops] = useState(true);
  const [showArcs, setShowArcs] = useState(true);
  const [showFleets, setShowFleets] = useState(true);
  const [showStraits, setShowStraits] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedCountryName, setSelectedCountryName] = useState<string | null>(null);
  const [hoveredBaseId, setHoveredBaseId] = useState<string | null>(null);
  const [hoveredCountryName, setHoveredCountryName] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    fromList?: boolean;
    base?: GlobalBaseRecord;
    country?: GlobalCountryRecord;
    fleet?: NavyFleetRecord;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new GlobalMapCamera());
  const hitRef = useRef<GlobalHitResult>({ bases: [], basePlaques: [], countries: [], countryPlaques: [], fleets: [] });
  const dirtyRef = useRef(true);
  const initializedRef = useRef(false);

  const dragRef = useRef<{ active: boolean; sx: number; sy: number; moved: boolean }>({
    active: false,
    sx: 0,
    sy: 0,
    moved: false,
  });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const wasPinchRef = useRef(false);
  const lastTapRef = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });
  const pendingTapRef = useRef<number | null>(null);

  const requestDraw = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const padLeft = drawerOpen && typeof window !== 'undefined' && window.innerWidth >= 960 ? 464 : 20;

  const fitCurrentScope = useCallback(
    (cocomId: string | null, animate = true) => {
      const cam = cameraRef.current;
      const pl = drawerOpen && window.innerWidth >= 960 ? 464 : 20;
      if (cocomId && dataset) {
        const c = dataset.cocoms.find((x) => x.id === cocomId);
        if (c) {
          cam.fitLonLatBox(c.box, { padLeft: pl, padRight: 24, padTop: 52, padBottom: 58, animate });
          requestDraw();
          return;
        }
      }
      cam.fitWorld({ padLeft: pl, padRight: 24, padTop: 52, padBottom: 58, animate });
      requestDraw();
    },
    [dataset, drawerOpen, requestDraw],
  );

  useEffect(() => {
    if (!dataset) return;
    const cam = cameraRef.current;
    const updateSize = () => {
      cam.resize(window.innerWidth, window.innerHeight);
      if (!initializedRef.current) {
        initializedRef.current = true;
        const pl = window.innerWidth >= 960 ? 464 : 20;
        cam.fitWorld({ padLeft: pl, padRight: 24, padTop: 52, padBottom: 58, animate: false });
      }
      requestDraw();
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [dataset, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [
    dataset,
    theme,
    locale,
    activeCocom,
    activeBranches,
    showBases,
    showTroops,
    showArcs,
    showFleets,
    showStraits,
    showLabels,
    hoveredBaseId,
    selectedBaseId,
    hoveredCountryName,
    selectedCountryName,
    drawerOpen,
    requestDraw,
  ]);

  useEffect(() => {
    if (!dataset) return;
    let rafId = 0;
    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      const animating = cameraRef.current.step(now);
      if (!animating && !dirtyRef.current) return;
      dirtyRef.current = false;

      const cv = canvasRef.current;
      if (!cv) return;
      const cam = cameraRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(cam.width * dpr);
      const ph = Math.round(cam.height * dpr);
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
      }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hitRef.current = renderGlobalMilitaryChart(ctx, {
        camera: cam,
        dataset,
        theme,
        locale,
        activeCocom,
        activeBranches,
        showBases,
        showTroops,
        showArcs,
        showFleets,
        showStraits,
        showLabels,
        hoveredBaseId,
        selectedBaseId,
        hoveredCountryName,
        selectedCountryName,
      });
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [
    dataset,
    theme,
    locale,
    activeCocom,
    activeBranches,
    showBases,
    showTroops,
    showArcs,
    showFleets,
    showStraits,
    showLabels,
    hoveredBaseId,
    selectedBaseId,
    hoveredCountryName,
    selectedCountryName,
  ]);

  // Global chart keyboard shortcuts
  useEffect(() => {
    const PAN_SPEED = 750;
    const PAN_KEYS: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      a: [-1, 0],
      ArrowRight: [1, 0],
      d: [1, 0],
      ArrowUp: [0, -1],
      w: [0, -1],
      ArrowDown: [0, 1],
      s: [0, 1],
    };
    const held = new Set<string>();

    const updatePan = () => {
      let x = 0;
      let y = 0;
      for (const k of held) {
        x += PAN_KEYS[k][0];
        y += PAN_KEYS[k][1];
      }
      cameraRef.current.setPanVelocity(Math.sign(x) * PAN_SPEED, Math.sign(y) * PAN_SPEED);
      if (x || y) requestDraw();
    };

    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const st = useAppStore.getState();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (k === 'Escape') {
        if (isTyping(e.target)) {
          (e.target as HTMLElement).blur();
          return;
        }
        if (st.helpOpen) { setHelpOpen(false); return; }
        if (st.almanacOpen) { st.setAlmanacOpen(false); return; }
        if (selectedBaseId || selectedCountryName) {
          setSelectedBaseId(null);
          setSelectedCountryName(null);
          return;
        }
        if (activeCocom) {
          setActiveCocom(null);
          fitCurrentScope(null, true);
          return;
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(!st.helpOpen);
        return;
      }
      if (st.helpOpen || st.almanacOpen) return;

      if (PAN_KEYS[k]) {
        e.preventDefault();
        held.add(k);
        updatePan();
      } else if (k === '+' || k === '=') {
        e.preventDefault();
        const cam = cameraRef.current;
        cam.zoomByAnimated(cam.width * 0.5, cam.height * 0.5, 1.5, 220);
        requestDraw();
      } else if (k === '-' || k === '_') {
        e.preventDefault();
        const cam = cameraRef.current;
        cam.zoomByAnimated(cam.width * 0.5, cam.height * 0.5, 1 / 1.5, 220);
        requestDraw();
      } else if (k === 't') {
        st.toggleTheme();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (held.delete(k)) updatePan();
    };
    const onBlur = () => {
      if (held.size > 0) {
        held.clear();
        updatePan();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      cameraRef.current.setPanVelocity(0, 0);
    };
  }, [activeCocom, selectedBaseId, selectedCountryName, fitCurrentScope, requestDraw, setHelpOpen]);

  const hitTest = (
    sx: number,
    sy: number,
  ): { base?: GlobalBaseRecord; country?: GlobalCountryRecord; fleet?: NavyFleetRecord } | null => {
    // 1. Base icon markers (highest priority)
    let bestB: GlobalBaseRecord | undefined;
    let bestBD2 = Infinity;
    for (let i = hitRef.current.bases.length - 1; i >= 0; i--) {
      const h = hitRef.current.bases[i];
      const d2 = (sx - h.sx) * (sx - h.sx) + (sy - h.sy) * (sy - h.sy);
      if (d2 <= h.r * h.r && d2 < bestBD2) {
        bestBD2 = d2;
        bestB = h.base;
      }
    }
    if (bestB) return { base: bestB };

    // 2. Base nameplate plaques (hovering the base name also reveals full details!)
    for (let i = hitRef.current.basePlaques.length - 1; i >= 0; i--) {
      const p = hitRef.current.basePlaques[i];
      if (sx >= p.x0 - 2 && sx <= p.x1 + 2 && sy >= p.y0 - 2 && sy <= p.y1 + 2) {
        return { base: p.base };
      }
    }

    // 3. Host nation dual-tone plaques
    for (let i = hitRef.current.countryPlaques.length - 1; i >= 0; i--) {
      const p = hitRef.current.countryPlaques[i];
      if (sx >= p.x0 - 2 && sx <= p.x1 + 2 && sy >= p.y0 - 2 && sy <= p.y1 + 2) {
        return { country: p.country };
      }
    }

    // 4. Host nation troop rings
    let bestC: GlobalCountryRecord | undefined;
    let bestCD2 = Infinity;
    for (let i = hitRef.current.countries.length - 1; i >= 0; i--) {
      const h = hitRef.current.countries[i];
      const d2 = (sx - h.sx) * (sx - h.sx) + (sy - h.sy) * (sy - h.sy);
      if (d2 <= h.r * h.r && d2 < bestCD2) {
        bestCD2 = d2;
        bestC = h.country;
      }
    }
    if (bestC) return { country: bestC };

    // 5. U.S. Navy Numbered Fleet medallions
    for (let i = hitRef.current.fleets.length - 1; i >= 0; i--) {
      const h = hitRef.current.fleets[i];
      if (sx >= h.x0 - 3 && sx <= h.x1 + 3 && sy >= h.y0 - 3 && sy <= h.y1 + 3) {
        return { fleet: h.fleet };
      }
      const d2 = (sx - h.sx) * (sx - h.sx) + (sy - h.sy) * (sy - h.sy);
      if (d2 <= h.r * h.r) return { fleet: h.fleet };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    pointersRef.current.set(e.pointerId, { x: sx, y: sy });

    if (pointersRef.current.size === 2) {
      if (pendingTapRef.current !== null) {
        window.clearTimeout(pendingTapRef.current);
        pendingTapRef.current = null;
      }
      dragRef.current.active = false;
      wasPinchRef.current = true;
      const pts = Array.from(pointersRef.current.values());
      pinchRef.current = {
        dist: Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)),
        midX: (pts[0].x + pts[1].x) * 0.5,
        midY: (pts[0].y + pts[1].y) * 0.5,
      };
      setTooltip(null);
      return;
    }

    if (pointersRef.current.size === 1) {
      wasPinchRef.current = false;
      const now = performance.now();
      const prev = lastTapRef.current;
      if (pendingTapRef.current !== null && now - prev.t <= 320 && Math.hypot(sx - prev.x, sy - prev.y) <= 22) {
        window.clearTimeout(pendingTapRef.current);
        pendingTapRef.current = null;
      }
      dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: sx, y: sy });
    }

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const midX = (pts[0].x + pts[1].x) * 0.5;
      const midY = (pts[0].y + pts[1].y) * 0.5;
      cameraRef.current.panByScreen(midX - pinchRef.current.midX, midY - pinchRef.current.midY);
      const ratio = dist / pinchRef.current.dist;
      if (Math.abs(ratio - 1) > 0.002) cameraRef.current.zoomAtScreen(midX, midY, ratio);
      pinchRef.current = { dist, midX, midY };
      setTooltip(null);
      requestDraw();
      return;
    }

    if (dragRef.current.active && !wasPinchRef.current) {
      const dx = e.clientX - dragRef.current.sx;
      const dy = e.clientY - dragRef.current.sy;
      if (Math.hypot(dx, dy) > 3) dragRef.current.moved = true;
      dragRef.current.sx = e.clientX;
      dragRef.current.sy = e.clientY;
      cameraRef.current.panByScreen(dx, dy);
      setTooltip(null);
      requestDraw();
      return;
    }

    const hit = hitTest(sx, sy);
    if (hit?.base) {
      setHoveredBaseId(hit.base.id);
      setHoveredCountryName(null);
      setTooltip({ x: e.clientX, y: e.clientY, base: hit.base });
    } else if (hit?.country) {
      setHoveredBaseId(null);
      setHoveredCountryName(hit.country.name);
      setTooltip({ x: e.clientX, y: e.clientY, country: hit.country });
    } else if (hit?.fleet) {
      setHoveredBaseId(null);
      setHoveredCountryName(null);
      setTooltip({ x: e.clientX, y: e.clientY, fleet: hit.fleet });
    } else {
      if (hoveredBaseId !== null) setHoveredBaseId(null);
      if (hoveredCountryName !== null) setHoveredCountryName(null);
      if (tooltip !== null) setTooltip(null);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (wasPinchRef.current) {
      if (pointersRef.current.size === 0) wasPinchRef.current = false;
      dragRef.current.active = false;
      return;
    }
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;
    if (wasMoved) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const now = performance.now();
    const DOUBLE_MS = 320;
    const prev = lastTapRef.current;

    if (now - prev.t <= DOUBLE_MS && Math.hypot(sx - prev.x, sy - prev.y) <= 22) {
      if (pendingTapRef.current !== null) {
        window.clearTimeout(pendingTapRef.current);
        pendingTapRef.current = null;
      }
      lastTapRef.current = { t: 0, x: 0, y: 0 };
      cameraRef.current.zoomByAnimated(sx, sy, 2.0, 260);
      requestDraw();
      return;
    }

    lastTapRef.current = { t: now, x: sx, y: sy };
    const hit = hitTest(sx, sy);
    if (pendingTapRef.current !== null) window.clearTimeout(pendingTapRef.current);
    pendingTapRef.current = window.setTimeout(() => {
      pendingTapRef.current = null;
      if (hit?.base) {
        setSelectedBaseId(hit.base.id);
        setSelectedCountryName(null);
        setDrawerOpen(true);
        cameraRef.current.flyToLonLat(hit.base.lon, hit.base.lat, Math.max(13, cameraRef.current.scale), padLeft);
        requestDraw();
      } else if (hit?.country) {
        setSelectedCountryName(hit.country.name);
        setSelectedBaseId(null);
        setDrawerOpen(true);
        if (hit.country.lon != null && hit.country.lat != null) {
          cameraRef.current.flyToLonLat(hit.country.lon, hit.country.lat, Math.max(8, cameraRef.current.scale), padLeft);
          requestDraw();
        }
      } else if (hit?.fleet) {
        setActiveCocom(hit.fleet.cocom);
        fitCurrentScope(hit.fleet.cocom, true);
      } else {
        setSelectedBaseId(null);
        setSelectedCountryName(null);
      }
    }, DOUBLE_MS);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    cameraRef.current.zoomAtScreen(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0014));
    requestDraw();
  };

  const filteredBases = useMemo(() => {
    if (!dataset) return [];
    return dataset.bases.filter((b) => {
      if (activeCocom && b.cocom !== activeCocom) return false;
      if (!activeBranches.has(b.branch)) return false;
      return true;
    });
  }, [dataset, activeCocom, activeBranches]);

  const filteredCountries = useMemo(() => {
    if (!dataset) return [];
    return dataset.countries.filter((c) => !activeCocom || c.cocom === activeCocom);
  }, [dataset, activeCocom]);

  const branchCounts = useMemo(() => {
    const m: Record<string, number> = {};
    if (!dataset) return m;
    for (const b of dataset.bases) {
      if (activeCocom && b.cocom !== activeCocom) continue;
      m[b.branch] = (m[b.branch] ?? 0) + 1;
    }
    return m;
  }, [dataset, activeCocom]);

  const selectedBase = useMemo(
    () => (dataset && selectedBaseId ? dataset.bases.find((b) => b.id === selectedBaseId) ?? null : null),
    [dataset, selectedBaseId],
  );

  const selectedCountry = useMemo(
    () => (dataset && selectedCountryName ? dataset.countries.find((c) => c.name === selectedCountryName) ?? null : null),
    [dataset, selectedCountryName],
  );

  const selectedCountryBases = useMemo(
    () => (dataset && selectedCountry ? dataset.bases.filter((b) => b.country === selectedCountry.name) : []),
    [dataset, selectedCountry],
  );

  const countryByName = useMemo(() => {
    const m = new Map<string, GlobalCountryRecord>();
    if (dataset) for (const c of dataset.countries) m.set(c.name, c);
    return m;
  }, [dataset]);

  const baseRankById = useMemo(() => {
    const m = new Map<string, number>();
    if (!dataset) return m;
    const sorted = [...dataset.bases].sort((a, b) => b.prv_musd - a.prv_musd);
    sorted.forEach((b, i) => m.set(b.id, i + 1));
    return m;
  }, [dataset]);

  const topBasesByCountry = useMemo(() => {
    const m = new Map<string, GlobalBaseRecord[]>();
    if (!dataset) return m;
    for (const b of dataset.bases) {
      let arr = m.get(b.country);
      if (!arr) {
        arr = [];
        m.set(b.country, arr);
      }
      arr.push(b);
    }
    for (const arr of m.values()) arr.sort((a, b) => b.prv_musd - a.prv_musd);
    return m;
  }, [dataset]);

  const toggleBranch = (br: string) => {
    setActiveBranches((prev) => {
      const next = new Set(prev);
      if (next.has(br)) {
        if (next.size > 1) next.delete(br);
      } else {
        next.add(br);
      }
      return next;
    });
  };

  if (loading || !dataset) {
    return (
      <div
        className="fixed inset-0 top-11 z-20 flex flex-col items-center justify-center gap-3"
        style={{ background: 'var(--surface-sea-deep)' }}
      >
        <Globe className="w-8 h-8 animate-spin" style={{ color: 'var(--brass-bright)' }} />
        <div className="font-display text-sm font-bold" style={{ color: 'var(--brass-bright)' }}>
          {error
            ? L(`全球军事数据加载失败：${error}`, `Failed to load global military dataset: ${error}`)
            : L('正在测绘全球海外美军基地与各大洋投射海图…', 'Charting global U.S. overseas bases & force projection…')}
        </div>
        <button
          type="button"
          onClick={() => setMapView('us')}
          className="dock-btn mt-2"
          style={{ borderColor: 'var(--brass)' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{L('返回美国六角图', 'Back to U.S. Hex Map')}</span>
        </button>
      </div>
    );
  }

  const s = dataset.summary;
  const maxPrv = Math.max(1000, filteredBases[0]?.prv_musd ?? 25000);
  const maxCountryActive = Math.max(100, filteredCountries[0]?.active ?? 56601);
  const hostActive = s.host_active ?? s.overseas_active;
  const hostCountriesCount = s.host_countries ?? dataset.countries.length;

  return (
    <div className="fixed inset-0 top-11 z-20 overflow-hidden select-none">
      {/* Interactive Global Nautical Chart Canvas */}
      <canvas
        ref={canvasRef}
        data-global-canvas="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointersRef.current.delete(e.pointerId);
          if (pointersRef.current.size < 2) pinchRef.current = null;
          if (pointersRef.current.size === 0) wasPinchRef.current = false;
          dragRef.current.active = false;
        }}
        onPointerLeave={() => {
          if (pointersRef.current.size > 0) return;
          dragRef.current.active = false;
          setHoveredBaseId(null);
          setHoveredCountryName(null);
          setTooltip(null);
        }}
        onDoubleClick={(e) => e.preventDefault()}
        onWheel={onWheel}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Full-Detail Hover Dossier Card (Bases, Host Countries & Navy Fleets) */}
      {tooltip && (tooltip.base || tooltip.country || tooltip.fleet) && (() => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
        const isBaseCard = !!tooltip.base;
        const isCountryCard = !!tooltip.country;
        const cardW = isBaseCard ? 364 : isCountryCard ? 336 : 290;
        const estH = isBaseCard ? 345 : isCountryCard ? 280 : 120;
        let left = tooltip.fromList
          ? Math.min(vw - cardW - 14, (drawerOpen ? 466 : 16))
          : tooltip.x + 18;
        if (!tooltip.fromList && left + cardW > vw - 12) {
          left = Math.max(12, tooltip.x - cardW - 18);
        }
        const top = tooltip.fromList
          ? 58
          : Math.max(54, Math.min(vh - estH - 14, tooltip.y - 24));

        const b = tooltip.base;
        const bHost = b ? countryByName.get(b.country) : undefined;
        const bRank = b ? baseRankById.get(b.id) : undefined;
        const bGlyph = b
          ? (b.branch === 'air_force' ? '▲' : b.branch === 'navy' ? '◆' : b.branch === 'marines' ? '⛨' : b.branch === 'reserve_guard' ? '⬢' : '★')
          : '';
        const bTierLabel = b
          ? (b.tier === 'hub'
              ? L('核心战略枢纽', 'Strategic Hub')
              : b.tier === 'major'
                ? L('主力基地', 'Major Base')
                : L('军事站点', 'Installation'))
          : '';
        const bPrvShare = b && bHost && bHost.prv_musd > 0 && b.prv_musd > 0
          ? `${((b.prv_musd / bHost.prv_musd) * 100).toFixed(1)}%`
          : null;

        const c = tooltip.country;
        const cTopBases = c ? (topBasesByCountry.get(c.name) ?? []).slice(0, 3) : [];

        return (
          <div
            className="atlas-panel-brass fixed z-40 pointer-events-none rounded-xl p-3 text-xs shadow-2xl"
            style={{ left, top, width: cardW }}
          >
            {b ? (
              <div className="space-y-2">
                {/* Header & Badges */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9.5px] font-mono-num font-bold px-1.5 py-0.5 rounded bg-[var(--brass-soft)]" style={{ color: 'var(--brass-bright)' }}>
                        {b.cocom}
                      </span>
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded border border-[var(--border-hairline)] opacity-85">
                        {bTierLabel}
                      </span>
                      {b.approx_coord && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                          {L('近似坐标', 'Approx. Coord')}
                        </span>
                      )}
                    </div>
                    {bRank != null && b.prv_musd > 0 && (
                      <span className="text-[9.5px] font-mono-num opacity-70">
                        {L(`海外估值 #${bRank}/${s.total_bases}`, `Overseas #${bRank}/${s.total_bases}`)}
                      </span>
                    )}
                  </div>
                  <div className="font-display font-bold text-[14px] leading-snug pt-0.5" style={{ color: 'var(--brass-bright)' }}>
                    {b.name}
                  </div>
                  <div className="text-[11px] opacity-85 flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                    <span className="font-semibold">{localizeGlobalCountry(b.country, locale)}</span>
                    {!isEn && localizeGlobalCountry(b.country, locale) !== b.country && (
                      <span className="opacity-55 text-[10px]">({b.country})</span>
                    )}
                    {b.city && <span>· {b.city}</span>}
                    <span className="opacity-70">· {localizeGlobalRegion(b.region, locale)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
                    <span style={{ color: GLOBAL_BRANCH_COLORS[b.branch] ?? '#999' }}>{bGlyph}</span>
                    <span className="font-semibold">{localizeGlobalComponent(b.component, locale)}</span>
                    <span className="opacity-50">·</span>
                    <span className="opacity-75">{localizeGlobalBranch(b.branch, locale)}</span>
                  </div>
                </div>

                {/* 6-Field Complete DoD FY2024 BSR Infrastructure Grid */}
                <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-[var(--border-hairline)] text-[10.5px] font-mono-num">
                  <div className="p-1.5 rounded-lg bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)]">
                    <div className="text-[9px] opacity-60 font-sans">{L('设施重置估值 PRV', 'Plant Value (PRV)')}</div>
                    <div className="font-bold text-[12px]" style={{ color: '#E8C574' }}>
                      {b.prv_musd > 0 ? fmtMoney3(b.prv_musd * 1e6) : '–'}
                    </div>
                    <div className="text-[9px] opacity-60 font-sans">
                      {bPrvShare ? L(`占该地 ${bPrvShare}`, `${bPrvShare} of host`) : 'DoD FY24 BSR'}
                    </div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)]">
                    <div className="text-[9px] opacity-60 font-sans">{L('占地面积', 'Land Area')}</div>
                    <div className="font-bold text-[12px]">
                      {b.acres > 0 ? `${fmtCount3(b.acres)} ac` : '–'}
                    </div>
                    <div className="text-[9px] opacity-60">
                      {b.acres > 0 ? `${(b.acres * 0.004047).toFixed(b.acres >= 250 ? 1 : 2)} km²` : L('未单列/合署', 'Not listed')}
                    </div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)]">
                    <div className="text-[9px] opacity-60 font-sans">{L('建筑规模', 'Buildings')}</div>
                    <div className="font-bold text-[12px]">
                      {b.buildings > 0 ? `${b.buildings.toLocaleString()}${L(' 栋', '')}` : '–'}
                    </div>
                    <div className="text-[9px] opacity-60">
                      {b.sqft && b.sqft > 0
                        ? `${(b.sqft / 1e6).toFixed(2)}M ft²`
                        : L('无建筑面积', 'No sqft')}
                    </div>
                  </div>
                </div>

                {/* Building Ownership, Metric Floor Area & Dual-Format Coordinates */}
                <div className="space-y-1 text-[10px] pt-1 border-t border-[var(--border-hairline)]">
                  <div className="flex items-center justify-between gap-2 font-mono-num">
                    <span className="opacity-70 font-sans">{L('建筑权属与面积：', 'Ownership & Area:')}</span>
                    <span>
                      {L(`自有 ${(b.bldgs_owned ?? 0).toLocaleString()} · 租用 ${(b.bldgs_leased ?? 0).toLocaleString()}`, `Owned ${(b.bldgs_owned ?? 0).toLocaleString()} · Leased ${(b.bldgs_leased ?? 0).toLocaleString()}`)}
                      {b.sqft && b.sqft > 0
                        ? (() => {
                            const sqm = b.sqft * 0.092903;
                            if (!isEn) return ` · ${(sqm / 1e4).toFixed(1)}万 m²`;
                            return sqm >= 1e6 ? ` · ${(sqm / 1e6).toFixed(2)}M m²` : ` · ${Math.round(sqm / 1e3).toLocaleString()}K m²`;
                          })()
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 font-mono-num">
                    <span className="opacity-70 font-sans">{L('地理坐标：', 'Coordinates:')}</span>
                    <span>
                      {fmtDms(b.lat, 'N', 'S')}, {fmtDms(b.lon, 'E', 'W')} ({b.lat.toFixed(3)}, {b.lon.toFixed(3)})
                    </span>
                  </div>
                </div>

                {/* Facility Note / Coordinate Audit Note */}
                {b.note && (
                  <div className="text-[10px] leading-snug px-2 py-1 rounded-md bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)] opacity-85 italic">
                    {L('说明：', 'Note: ')}{b.note}
                  </div>
                )}

                {/* Host Nation DMDC Garrison Context */}
                {bHost && (
                  <div className="space-y-1.5 pt-1.5 border-t border-[var(--border-hairline)]">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold opacity-80">
                        {L(`${localizeGlobalCountry(bHost.name, locale, true)} 整体美军部署（DMDC）`, `${localizeGlobalCountry(bHost.name, locale, true)} Total U.S. Presence`)}
                      </span>
                      <span className="font-mono-num opacity-75">
                        {L(`现役 ${bHost.active.toLocaleString()} · ${bHost.base_count} 座基地`, `${bHost.active.toLocaleString()} active · ${bHost.base_count} bases`)}
                      </span>
                    </div>
                    {bHost.active > 0 && (
                      <ShareBar
                        segments={[
                          { key: 'army', label: L('陆军', 'Army'), value: bHost.by_branch.army, color: '#7D9A46' },
                          { key: 'navy', label: L('海军', 'Navy'), value: bHost.by_branch.navy, color: '#387EE0' },
                          { key: 'marines', label: L('陆战队', 'USMC'), value: bHost.by_branch.marines, color: '#D9574B' },
                          { key: 'air_force', label: L('空军', 'Air Force'), value: bHost.by_branch.air_force, color: '#5CB4EC' },
                          { key: 'space_force', label: L('太空军', 'Space'), value: bHost.by_branch.space_force, color: '#9C82D8' },
                          { key: 'coast_guard', label: L('海警', 'USCG'), value: bHost.by_branch.coast_guard, color: '#D6B04A' },
                        ].filter((seg) => seg.value > 0)}
                      />
                    )}
                    <div className="flex items-center justify-between text-[9.5px] opacity-65 font-mono-num">
                      <span>{L(`文职 ${bHost.civilian.toLocaleString()} · 预备役 ${bHost.reserve.toLocaleString()}`, `Civ ${bHost.civilian.toLocaleString()} · Res ${bHost.reserve.toLocaleString()}`)}</span>
                      <span>{L('点击锁定并飞往基地 →', 'Click to lock & zoom →')}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : c ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-display font-bold text-[13.5px]" style={{ color: 'var(--brass-bright)' }}>
                      {localizeGlobalCountry(c.name, locale)}
                      {!isEn && localizeGlobalCountry(c.name, locale) !== c.name && (
                        <span className="text-[10.5px] font-normal opacity-55 ml-1.5">{c.name}</span>
                      )}
                    </div>
                    <div className="text-[10.5px] opacity-80">
                      {localizeGlobalRegion(c.region, locale)}
                      {c.presence_type === 'deployed_mission'
                        ? ` · ${isEn ? c.mission_note_en : c.mission_note_zh}`
                        : ''}
                    </div>
                  </div>
                  <span className="text-[9.5px] font-mono-num px-1.5 py-0.5 rounded bg-[var(--brass-soft)] shrink-0">
                    {c.cocom}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-[var(--border-hairline)] text-[10px] font-mono-num">
                  <div>
                    <div className="opacity-55 font-sans">{L('现役军人', 'Active Duty')}</div>
                    <div className="font-bold text-[12px] text-[#6FB3E0]">{c.active.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="opacity-55 font-sans">{L('实体基地', 'BSR Bases')}</div>
                    <div className="font-bold text-[12px] text-[#E8C574]">{c.base_count}</div>
                  </div>
                  <div>
                    <div className="opacity-55 font-sans">{L('设施总估值', 'Total PRV')}</div>
                    <div className="font-bold text-[12px] text-[#8DC48B]">{c.prv_musd > 0 ? fmtMoney3(c.prv_musd * 1e6) : '–'}</div>
                  </div>
                </div>
                {c.active > 0 && (
                  <div className="space-y-1">
                    <ShareBar
                      showLegend
                      segments={[
                        { key: 'army', label: L('陆军', 'Army'), value: c.by_branch.army, color: '#7D9A46', valueText: c.by_branch.army.toLocaleString() },
                        { key: 'navy', label: L('海军', 'Navy'), value: c.by_branch.navy, color: '#387EE0', valueText: c.by_branch.navy.toLocaleString() },
                        { key: 'marines', label: L('陆战队', 'USMC'), value: c.by_branch.marines, color: '#D9574B', valueText: c.by_branch.marines.toLocaleString() },
                        { key: 'air_force', label: L('空军', 'Air Force'), value: c.by_branch.air_force, color: '#5CB4EC', valueText: c.by_branch.air_force.toLocaleString() },
                        { key: 'space_force', label: L('太空军', 'Space'), value: c.by_branch.space_force, color: '#9C82D8', valueText: c.by_branch.space_force.toLocaleString() },
                        { key: 'coast_guard', label: L('海警', 'USCG'), value: c.by_branch.coast_guard, color: '#D6B04A', valueText: c.by_branch.coast_guard.toLocaleString() },
                      ].filter((seg) => seg.value > 0)}
                    />
                  </div>
                )}
                {cTopBases.length > 0 && (
                  <div className="pt-1 border-t border-[var(--border-hairline)] space-y-0.5 text-[10px]">
                    <div className="opacity-65">{L('旗舰基地（按 PRV）：', 'Flagship Bases (by PRV):')}</div>
                    {cTopBases.map((tb) => (
                      <div key={tb.id} className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 truncate">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GLOBAL_BRANCH_COLORS[tb.branch] }} />
                          <span className="truncate">{tb.name}</span>
                        </span>
                        <span className="font-mono-num opacity-80 shrink-0">
                          {tb.prv_musd > 0 ? fmtMoney3(tb.prv_musd * 1e6) : '–'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-[9.5px] opacity-60 font-mono-num flex justify-between">
                  <span>{L(`文职 ${c.civilian.toLocaleString()} · 预备役 ${c.reserve.toLocaleString()}`, `Civ ${c.civilian.toLocaleString()} · Res ${c.reserve.toLocaleString()}`)}</span>
                  <span>{L('点击展开全部基地 →', 'Click for full roster →')}</span>
                </div>
              </div>
            ) : tooltip.fleet ? (
              <div className="space-y-1">
                <div className="font-display font-bold text-[12.5px]" style={{ color: '#8DCBFF' }}>
                  ⚓ {isEn ? tooltip.fleet.name_en : tooltip.fleet.name_zh}
                </div>
                <div className="text-[10.5px] opacity-85">
                  {isEn ? tooltip.fleet.hq_en : tooltip.fleet.hq_zh}
                </div>
                <div className="text-[9.5px] opacity-60">
                  {L(`隶属 ${tooltip.fleet.cocom} · 点击聚焦战区`, `${tooltip.fleet.cocom} AOR · Click to zoom theater`)}
                </div>
              </div>
            ) : null}
          </div>
        );
      })()}

      {/* Left Docked Global Command Drawer */}
      {drawerOpen ? (
        <aside className="atlas-panel-brass fixed top-11 bottom-0 left-0 z-30 w-[min(452px,94vw)] flex flex-col border-r shadow-2xl">
          {/* Masthead */}
          <div
            className="px-4 py-3 border-b shrink-0 flex items-center justify-between gap-2"
            style={{ borderColor: 'var(--border-strong)', background: 'var(--surface-paper-subtle)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center border shrink-0"
                style={{ borderColor: 'var(--brass)', background: 'var(--brass-soft)', color: 'var(--brass-bright)' }}
              >
                <Globe className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--brass)' }}>
                  {L('全球战区与海外基地投射', 'GLOBAL FORCE PROJECTION')}
                </div>
                <h2 className="font-display text-sm font-bold m-0 truncate">
                  {L('各大洲与各大洋美军基地图谱', 'U.S. Overseas Military Bases & Troops')}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setMapView('us')}
                className="px-2 py-1 rounded-md text-[10.5px] font-semibold border hover:bg-[var(--surface-paper-hover)] flex items-center gap-1 cursor-pointer"
                style={{ borderColor: 'var(--brass)', color: theme === 'midnight' ? 'var(--brass-bright)' : 'var(--ink)' }}
                title={L('切回美国本土 25 km 六边形沙盘', 'Return to U.S. 25 km Hex Map')}
              >
                <ArrowLeft className="w-3 h-3" />
                <span>{L('美国六角图', 'U.S. Map')}</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-md hover:bg-[var(--surface-paper-hover)] cursor-pointer opacity-75 hover:opacity-100"
                title={L('折叠侧栏查看全屏海图', 'Collapse sidebar for full-screen chart')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4 text-xs">
            <KpiTiles
              items={[
                {
                  label: L('在运海外基地', 'Active Bases'),
                  value: s.total_bases.toLocaleString(),
                  sub: L(`分布 ${s.base_countries} 国/领地 (FY24)`, `Across ${s.base_countries} lands (FY24)`),
                  color: '#E8C574',
                },
                {
                  label: L('实质驻军兵力', 'Stationed Active'),
                  value: fmtCount3(hostActive),
                  sub: L(`${hostCountriesCount} 部署国/领地`, `${hostCountriesCount} host lands`),
                  color: '#6FB3E0',
                },
                {
                  label: L('设施重置估值', 'Facility PRV'),
                  value: fmtMoney3(s.total_prv_musd * 1e6),
                  sub: `${fmtCount3(s.total_acres)} ${L('英亩', 'acres')}`,
                  color: '#8DC48B',
                },
              ]}
            />

            <CalloutNote>
              {L(
                `仅呈现拥有实体基地（${s.base_countries} 国/领地）或常驻军事任务（沙特/埃及/匈牙利）的 ${hostCountriesCount} 个海外部署地（现役 ${hostActive.toLocaleString()} 人）。已严格剔除 DMDC 表中驻 ${s.embassy_only_countries ?? 128} 国大使馆的海军陆战队警卫与武官（共 ${(s.embassy_only_active ?? 2347).toLocaleString()} 人，含中国、俄罗斯、印度、巴西等无驻军国家）及未披露国别/海上机动人员（${s.unassigned_active.toLocaleString()} 人）。`,
                `Maps strictly the ${hostCountriesCount} overseas nations & territories with permanent DoD bases (${s.base_countries}) or deployed military missions (Saudi Arabia, Egypt MFO, Hungary SAC) totaling ${hostActive.toLocaleString()} active-duty troops. Excludes State Department embassy Marine Security Guards & attachés across ${s.embassy_only_countries ?? 128} non-garrison nations (${(s.embassy_only_active ?? 2347).toLocaleString()} personnel, e.g. China, Russia, India, Brazil) and ${s.unassigned_active.toLocaleString()} unassigned/afloat personnel.`,
              )}
            </CalloutNote>

            {/* 6 Official Unified Combatant Commands (UCP) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] opacity-60">
                    {L('DoD 统一司令部计划 (UCP) · 点击直飞战区', 'OFFICIAL DOD UCP AORS · CLICK TO FLY')}
                  </div>
                  <div className="font-display text-xs font-bold" style={{ color: 'var(--brass-bright)' }}>
                    {L('六大战区司令部 · Combatant Commands', 'Combatant Commands (AOR)')}
                  </div>
                </div>
                {activeCocom && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCocom(null);
                      fitCurrentScope(null, true);
                    }}
                    className="text-[10px] underline font-semibold cursor-pointer"
                    style={{ color: 'var(--brass-bright)' }}
                  >
                    {L('显示全球', 'Show All')}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {dataset.cocoms.map((c) => {
                  const on = activeCocom === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        const next = on ? null : c.id;
                        setActiveCocom(next);
                        fitCurrentScope(next, true);
                      }}
                      className={`text-left p-2 rounded-lg border transition cursor-pointer ${
                        on
                          ? 'border-[var(--brass)] bg-[var(--brass-soft)]'
                          : 'border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/60 hover:bg-[var(--surface-paper-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1.5 font-bold text-[11px] truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                          <span>{isEn ? c.name_en : c.name_zh}</span>
                        </span>
                        <span className="font-mono-num text-[10px] font-bold opacity-85">
                          {c.base_count} {L('座', '')}
                        </span>
                      </div>
                      <div className="text-[9.5px] opacity-65 truncate mt-0.5">
                        {isEn ? c.subtitle_en : c.subtitle_zh}
                      </div>
                      <div className="flex items-center justify-between text-[9.5px] font-mono-num opacity-80 mt-1">
                        <span>{fmtCount3(c.active_troops)} {L('现役', 'active')}</span>
                        <span>{fmtMoney3(c.prv_musd * 1e6)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Service Branch Filters with distinct shape badges */}
            <div className="space-y-1.5 pt-2 border-t border-[var(--border-hairline)]">
              <div className="flex items-center justify-between text-[10.5px] font-semibold opacity-80">
                <span>{L('按军种筛选基地（图标按军种区分）', 'Filter Bases by Branch (Distinct Symbols)')}</span>
                {activeBranches.size < ALL_BRANCHES.length && (
                  <button
                    type="button"
                    onClick={() => setActiveBranches(new Set(ALL_BRANCHES))}
                    className="text-[10px] underline cursor-pointer"
                    style={{ color: 'var(--brass-bright)' }}
                  >
                    {L('全选', 'All')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {ALL_BRANCHES.map((br) => {
                  const on = activeBranches.has(br);
                  const cnt = branchCounts[br] ?? 0;
                  const glyph = br === 'air_force' ? '▲' : br === 'navy' ? '◆' : br === 'marines' ? '⛨' : br === 'reserve_guard' ? '⬢' : '★';
                  return (
                    <button
                      key={br}
                      type="button"
                      onClick={() => toggleBranch(br)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition cursor-pointer inline-flex items-center gap-1 ${
                        on ? 'border-white/35 bg-white/10 font-semibold' : 'border-white/10 opacity-35'
                      }`}
                    >
                      <span style={{ color: GLOBAL_BRANCH_COLORS[br] }}>{glyph}</span>
                      <span>{localizeGlobalBranch(br, locale)}</span>
                      <span className="opacity-60 font-mono-num">{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Base Detailed Inspection Card */}
            {selectedBase && (
              <div className="p-3 rounded-xl border border-[var(--brass)] bg-[var(--surface-paper-subtle)] space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--brass)' }}>
                      <span>{selectedBase.cocom} · {localizeGlobalRegion(selectedBase.region, locale)}</span>
                      {selectedBase.approx_coord && (
                        <span className="px-1 rounded bg-amber-500/20 text-amber-300 normal-case">
                          {L('近似坐标', 'Approx. coord')}
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-sm leading-tight mt-0.5">{selectedBase.name}</div>
                    <div className="text-[10.5px] opacity-80 mt-0.5">
                      {localizeGlobalCountry(selectedBase.country, locale)}{selectedBase.city ? ` · ${selectedBase.city}` : ''} · {localizeGlobalComponent(selectedBase.component, locale)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedBaseId(null)}
                    className="p-1 rounded hover:bg-white/10 cursor-pointer"
                    title={L('关闭详情', 'Close details')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <KpiTiles
                  items={[
                    { label: L('设施估值 PRV', 'Plant Value'), value: selectedBase.prv_musd > 0 ? fmtMoney3(selectedBase.prv_musd * 1e6) : '–', sub: 'DoD FY24 BSR' },
                    { label: L('占地面积', 'Footprint'), value: selectedBase.acres > 0 ? `${fmtCount3(selectedBase.acres)} ac` : '–', sub: selectedBase.acres > 0 ? `${(selectedBase.acres * 0.004047).toFixed(1)} km²` : '–' },
                    {
                      label: L('建筑与面积', 'Buildings'),
                      value: selectedBase.buildings > 0 ? selectedBase.buildings.toLocaleString() : '–',
                      sub: selectedBase.sqft && selectedBase.sqft > 0 ? `${(selectedBase.sqft / 1e6).toFixed(2)}M ft²` : `${selectedBase.lat.toFixed(2)}°, ${selectedBase.lon.toFixed(2)}°`,
                    },
                  ]}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] opacity-75 font-mono-num">
                  <span>
                    {L('坐标：', 'Coords: ')}
                    {fmtDms(selectedBase.lat, 'N', 'S')}, {fmtDms(selectedBase.lon, 'E', 'W')} ({selectedBase.lat.toFixed(3)}, {selectedBase.lon.toFixed(3)})
                  </span>
                  {(selectedBase.bldgs_owned || selectedBase.bldgs_leased) ? (
                    <span>
                      {L(`自有 ${selectedBase.bldgs_owned ?? 0} · 租用 ${selectedBase.bldgs_leased ?? 0}`, `Owned ${selectedBase.bldgs_owned ?? 0} · Leased ${selectedBase.bldgs_leased ?? 0}`)}
                    </span>
                  ) : null}
                </div>
                {selectedBase.note && (
                  <div className="text-[10px] opacity-75 italic border-t border-[var(--border-hairline)] pt-1.5">
                    {selectedBase.note}
                  </div>
                )}
              </div>
            )}

            {/* Selected Host Country Detail Card with 6-Branch Stacked ShareBar */}
            {selectedCountry && (
              <div className="p-3 rounded-xl border border-[var(--brass)] bg-[var(--surface-paper-subtle)] space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: 'var(--brass)' }}>
                      {selectedCountry.cocom} · {localizeGlobalRegion(selectedCountry.region, locale)}
                    </div>
                    <div className="font-display font-bold text-sm leading-tight mt-0.5">
                      {localizeGlobalCountry(selectedCountry.name, locale)}
                      {!isEn && localizeGlobalCountry(selectedCountry.name, locale) !== selectedCountry.name && (
                        <span className="text-[11px] font-normal opacity-55 ml-1.5">{selectedCountry.name}</span>
                      )}
                    </div>
                    {selectedCountry.presence_type === 'deployed_mission' && (
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {isEn ? selectedCountry.mission_note_en : selectedCountry.mission_note_zh}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCountryName(null)}
                    className="p-1 rounded hover:bg-white/10 cursor-pointer"
                    title={L('关闭详情', 'Close details')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <KpiTiles
                  items={[
                    { label: L('现役军人', 'Active Duty'), value: selectedCountry.active.toLocaleString(), sub: `${L('预备役', 'Reserve')} ${selectedCountry.reserve.toLocaleString()}` },
                    { label: L('DoD 文职', 'DoD Civilian'), value: selectedCountry.civilian.toLocaleString(), sub: `${L('总计', 'Total')} ${selectedCountry.total.toLocaleString()}` },
                    { label: L('实体基地', 'BSR Bases'), value: String(selectedCountry.base_count), sub: selectedCountry.prv_musd > 0 ? fmtMoney3(selectedCountry.prv_musd * 1e6) : 'DMDC Mission' },
                  ]}
                />
                {selectedCountry.active > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold opacity-75">{L('现役六大军种构成（DMDC）：', 'Active-Duty Service Branch Mix (DMDC):')}</div>
                    <ShareBar
                      showLegend
                      segments={[
                        { key: 'army', label: L('陆军', 'Army'), value: selectedCountry.by_branch.army, color: '#7D9A46', valueText: selectedCountry.by_branch.army.toLocaleString() },
                        { key: 'navy', label: L('海军', 'Navy'), value: selectedCountry.by_branch.navy, color: '#387EE0', valueText: selectedCountry.by_branch.navy.toLocaleString() },
                        { key: 'marines', label: L('陆战队', 'USMC'), value: selectedCountry.by_branch.marines, color: '#D9574B', valueText: selectedCountry.by_branch.marines.toLocaleString() },
                        { key: 'air_force', label: L('空军', 'Air Force'), value: selectedCountry.by_branch.air_force, color: '#5CB4EC', valueText: selectedCountry.by_branch.air_force.toLocaleString() },
                        { key: 'space_force', label: L('太空军', 'Space'), value: selectedCountry.by_branch.space_force, color: '#9C82D8', valueText: selectedCountry.by_branch.space_force.toLocaleString() },
                        { key: 'coast_guard', label: L('海警', 'USCG'), value: selectedCountry.by_branch.coast_guard, color: '#D6B04A', valueText: selectedCountry.by_branch.coast_guard.toLocaleString() },
                      ].filter((seg) => seg.value > 0)}
                    />
                  </div>
                )}
                {selectedCountryBases.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-[var(--border-hairline)]">
                    <div className="text-[10px] font-semibold opacity-70">
                      {L(`该地主要基地 (${selectedCountryBases.length} 座，按估值排序)：`, `Top installations here (${selectedCountryBases.length}, by PRV):`)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedCountryBases.slice(0, 10).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setSelectedBaseId(b.id);
                            setSelectedCountryName(null);
                            cameraRef.current.flyToLonLat(b.lon, b.lat, 16, padLeft);
                            requestDraw();
                          }}
                          className="px-1.5 py-0.5 rounded bg-black/25 hover:bg-[var(--brass-soft)] text-[10px] cursor-pointer transition inline-flex items-center gap-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: GLOBAL_BRANCH_COLORS[b.branch] }} />
                          <span>{b.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Main Directory Tabs */}
            <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2.5">
              <Segmented
                value={tab}
                options={[
                  { value: 'bases', label: L(`海外基地 (${filteredBases.length})`, `Overseas Bases (${filteredBases.length})`) },
                  { value: 'countries', label: L(`驻军部署国 (${filteredCountries.length})`, `Host Nations (${filteredCountries.length})`) },
                ]}
                onChange={(v) => setTab(v as 'bases' | 'countries')}
              />

              {tab === 'bases' ? (
                <SortableTable
                  rows={filteredBases.map((b) => ({ id: b.id, b }))}
                  defaultSort="prv"
                  searchPlaceholder={L('搜索基地名、国家、城市、战区...', 'Search base, country, city, COCOM...')}
                  searchText={(r) => `${r.b.name} ${r.b.country} ${localizeGlobalCountry(r.b.country, 'zh')} ${r.b.city} ${r.b.cocom} ${r.b.region} ${localizeGlobalBranch(r.b.branch, locale)}`}
                  maxHeight={300}
                  activeId={selectedBaseId}
                  columns={[
                    {
                      key: 'name',
                      label: L('基地', 'Base'),
                      align: 'l',
                      value: (r) => r.b.name,
                      render: (r) => (
                        <span className="inline-flex items-center gap-1.5 max-w-[155px] truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: GLOBAL_BRANCH_COLORS[r.b.branch] ?? '#999' }}
                          />
                          <span className="truncate">{r.b.name}</span>
                        </span>
                      ),
                    },
                    {
                      key: 'country',
                      label: L('部署地', 'Location'),
                      align: 'l',
                      value: (r) => localizeGlobalCountry(r.b.country, locale, true),
                      render: (r) => (
                        <span className="inline-block max-w-[92px] truncate opacity-80">
                          {localizeGlobalCountry(r.b.country, locale, true)}
                        </span>
                      ),
                    },
                    {
                      key: 'prv',
                      label: L('估值', 'PRV'),
                      value: (r) => r.b.prv_musd,
                      render: (r) => (r.b.prv_musd > 0 ? fmtMoney3(r.b.prv_musd * 1e6) : '–'),
                      barMax: maxPrv,
                      barColor: 'rgba(218, 175, 86, 0.34)',
                    },
                    {
                      key: 'acres',
                      label: L('英亩', 'Acres'),
                      value: (r) => r.b.acres,
                      render: (r) => (r.b.acres > 0 ? fmtCount3(r.b.acres) : '–'),
                    },
                  ]}
                  onHover={(r) => {
                    setHoveredBaseId(r ? r.id : null);
                    setTooltip(r ? { x: 0, y: 0, fromList: true, base: r.b } : null);
                  }}
                  onClick={(r) => {
                    setSelectedBaseId(r.id);
                    setSelectedCountryName(null);
                    cameraRef.current.flyToLonLat(r.b.lon, r.b.lat, Math.max(14, cameraRef.current.scale), padLeft);
                    requestDraw();
                  }}
                />
              ) : (
                <SortableTable
                  rows={filteredCountries.map((c) => ({ id: c.name, c }))}
                  defaultSort="active"
                  searchPlaceholder={L('搜索部署国家/领地或战区...', 'Search host nation, territory or COCOM...')}
                  searchText={(r) => `${r.c.name} ${localizeGlobalCountry(r.c.name, 'zh')} ${r.c.cocom} ${r.c.region} ${localizeGlobalRegion(r.c.region, locale)}`}
                  maxHeight={300}
                  activeId={selectedCountryName}
                  columns={[
                    {
                      key: 'name',
                      label: L('部署国 / 领地', 'Host Nation / Territory'),
                      align: 'l',
                      value: (r) => localizeGlobalCountry(r.c.name, locale),
                      render: (r) => (
                        <span className="inline-block max-w-[148px] truncate">
                          {localizeGlobalCountry(r.c.name, locale)} <span className="opacity-45 text-[9.5px]">{r.c.cocom.replace('COM', '')}</span>
                        </span>
                      ),
                    },
                    {
                      key: 'active',
                      label: L('现役', 'Active'),
                      value: (r) => r.c.active,
                      render: (r) => r.c.active.toLocaleString(),
                      barMax: maxCountryActive,
                      barColor: 'rgba(111, 179, 224, 0.35)',
                    },
                    {
                      key: 'bases',
                      label: L('基地', 'Bases'),
                      value: (r) => r.c.base_count,
                      render: (r) => (r.c.base_count > 0 ? String(r.c.base_count) : '–'),
                    },
                    {
                      key: 'prv',
                      label: L('资产估值', 'PRV'),
                      value: (r) => r.c.prv_musd,
                      render: (r) => (r.c.prv_musd > 0 ? fmtMoney3(r.c.prv_musd * 1e6) : '–'),
                    },
                  ]}
                  onHover={(r) => {
                    setHoveredCountryName(r ? r.id : null);
                    setTooltip(r ? { x: 0, y: 0, fromList: true, country: r.c } : null);
                  }}
                  onClick={(r) => {
                    setSelectedCountryName(r.id);
                    setSelectedBaseId(null);
                    if (r.c.lon != null && r.c.lat != null) {
                      cameraRef.current.flyToLonLat(r.c.lon, r.c.lat, 8.5, padLeft);
                      requestDraw();
                    }
                  }}
                />
              )}
            </div>

            <SourcesFooter
              sources={meta.sources}
              sourceIds={['dod_bsr_overseas', 'dmdc_personnel', 'natural_earth']}
              notes={
                isEn
                  ? [
                      `Base audit (DoD FY2024 BSR via The US Base Project): ${s.total_bases} active overseas & U.S. territory installations mapped after fixing ${s.fixed_coord_bases ?? 7} source geocoding typos (e.g., Camp Buehring Kuwait swapped lat/lon, White Beach Okinawa, Iwo Jima, Camp Morse, Azores) and excluding ${s.excluded_bases ?? 3} inactive/withdrawn entries (Niger AB 201 withdrawn Aug 2024; two $0M unused historic islet ranges).`,
                      `DMDC reconciliation (${s.as_of_dmdc}): ${s.overseas_active.toLocaleString()} total overseas active-duty = ${hostActive.toLocaleString()} in ${hostCountriesCount} base/mission host lands + ${(s.embassy_only_active ?? 2347).toLocaleString()} diplomatic Embassy Marine Security Guards & attachés across ${s.embassy_only_countries ?? 128} non-garrison nations (excluded from map shading) + ${s.unassigned_active.toLocaleString()} unassigned/afloat ("ZZ-UNKNOWN").`,
                      'Official DoD UCP AORs: Greenland (Pituffik/Thule), Puerto Rico, USVI, Bahamas & Canada are under NORTHCOM; Israel & Egypt are under CENTCOM; Diego Garcia serves INDOPACOM & CENTCOM jointly.',
                    ]
                  : [
                      `基地数据核查（DoD FY2024 BSR / The US Base Project）：经全量逐点空间落国核验，修复 ${s.fixed_coord_bases ?? 7} 处源表坐标笔误（含科威特 Camp Buehring 经纬度写反落入乌克兰、冲绳 White Beach 误标北海道、硫磺岛误标关岛、韩国 Camp Morse 误标西班牙、亚速尔两处漏负号等），并剔除 ${s.excluded_bases ?? 3} 处已撤离/零资产条目（尼日尔阿加德兹基地已于 2024 年 8 月撤军移交，及 2 处零资产废弃无人礁靶场），现保留 ${s.total_bases} 座在运海外与领地基地。`,
                      `DMDC 全美海外口径精确对账（截至 ${s.as_of_dmdc}）：海外现役总计 ${s.overseas_active.toLocaleString()} 人 = ${hostCountriesCount} 个实质基地/驻军部署地 ${hostActive.toLocaleString()} 人 + ${s.embassy_only_countries ?? 128} 个仅驻使馆卫队/武官国家 ${(s.embassy_only_active ?? 2347).toLocaleString()} 人（含中国、俄罗斯、印度、巴西等，地图绝不误标为驻军）+ 未披露国别/海上机动「ZZ-UNKNOWN」${s.unassigned_active.toLocaleString()} 人。`,
                      '战区严格遵循 DoD 最新统一司令部计划（UCP）：格陵兰、波多黎各、美属维尔京、巴哈马与加拿大属 NORTHCOM；以色列与埃及属 CENTCOM；迪戈加西亚为印太/中央双战区枢纽。',
                    ]
              }
            />
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="atlas-panel-brass fixed top-14 left-3 z-30 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xl"
          style={{ color: theme === 'midnight' ? 'var(--brass-bright)' : 'var(--ink)' }}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>{L(`展开全球基地目录 (${filteredBases.length})`, `Global Bases (${filteredBases.length})`)}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Floating Compact Map Legend (Bottom-Left beside drawer) */}
      <div
        className={`fixed bottom-3 z-30 hidden lg:block transition-all duration-200 ${
          drawerOpen ? 'left-[466px]' : 'left-3'
        }`}
      >
        {legendOpen ? (
          <div className="atlas-panel-brass rounded-xl px-3 py-2 text-[10px] space-y-1.5 max-w-[292px] shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-[var(--border-hairline)]">
              <span className="font-display font-bold text-[10.5px]" style={{ color: 'var(--brass-bright)' }}>
                {L('战略海图图例', 'CHART LEGEND')}
              </span>
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                className="opacity-65 hover:opacity-100 cursor-pointer"
                title={L('收起图例', 'Collapse legend')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5"><span style={{ color: GLOBAL_BRANCH_COLORS.air_force }}>▲</span> {L('空军基地', 'Air Force Base')}</span>
              <span className="inline-flex items-center gap-1.5"><span style={{ color: GLOBAL_BRANCH_COLORS.navy }}>◆</span> {L('海军基地', 'Naval Base')}</span>
              <span className="inline-flex items-center gap-1.5"><span style={{ color: GLOBAL_BRANCH_COLORS.army }}>★</span> {L('陆军要塞', 'Army Garrison')}</span>
              <span className="inline-flex items-center gap-1.5"><span style={{ color: GLOBAL_BRANCH_COLORS.marines }}>⛨</span> {L('陆战队基地', 'Marine Corps')}</span>
              <span className="inline-flex items-center gap-1.5"><span style={{ color: '#8DCBFF' }}>⚓</span> {L('海军编号舰队', 'Numbered Fleet')}</span>
              <span className="inline-flex items-center gap-1.5"><span style={{ color: '#E8B85C' }}>⊕</span> {L('海上战略咽喉', 'Chokepoint')}</span>
            </div>
            <div className="text-[9.5px] opacity-70 pt-1 border-t border-[var(--border-hairline)] leading-snug">
              {L(
                '着色国与圆环仅含实质基地/驻军部署地（已剔除使馆警卫与武官）；图元大小按 DoD 设施估值缩放。',
                'Shaded lands & rings show permanent base/mission hosts only (embassy guards excluded); icons scale by PRV.',
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            className="atlas-panel-brass px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" style={{ color: 'var(--brass)' }} />
            <span>{L('图例', 'Legend')}</span>
          </button>
        )}
      </div>

      {/* Bottom-Right Floating Layer Controls Dock */}
      <div className="atlas-panel-brass fixed bottom-3 right-3 z-30 flex flex-wrap items-center gap-1 p-1 rounded-xl shadow-2xl">
        <button
          type="button"
          onClick={() => setShowBases((v) => !v)}
          className={`dock-btn ${showBases ? 'active' : 'opacity-65'}`}
          title={L('显隐 498 座在运海外基地', 'Toggle 498 active overseas bases')}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>{L('基地', 'Bases')}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowTroops((v) => !v)}
          className={`dock-btn ${showTroops ? 'active' : 'opacity-65'}`}
          title={L('显隐实质部署国驻军圆环', 'Toggle host-nation troop rings')}
        >
          <Users className="w-3.5 h-3.5" />
          <span>{L('驻军', 'Troops')}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowFleets((v) => !v)}
          className={`dock-btn ${showFleets ? 'active' : 'opacity-65'}`}
          title={L('显隐美国海军六大编号舰队', 'Toggle 6 U.S. Navy Numbered Fleets')}
        >
          <Anchor className="w-3.5 h-3.5" />
          <span>{L('舰队', 'Fleets')}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowStraits((v) => !v)}
          className={`dock-btn ${showStraits ? 'active' : 'opacity-65'}`}
          title={L('显隐全球八大海上咽喉要道', 'Toggle 8 global maritime chokepoints')}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>{L('海峡', 'Straits')}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowArcs((v) => !v)}
          className={`dock-btn ${showArcs ? 'active' : 'opacity-65'}`}
          title={L('显隐大圆投射航线', 'Toggle great-circle projection arcs')}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>{L('航线', 'Arcs')}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowLabels((v) => !v)}
          className={`dock-btn ${showLabels ? 'active' : 'opacity-65'}`}
          title={L('显隐驻军与核心基地铭牌', 'Toggle host-nation & flagship base plaques')}
        >
          <span>{L('铭牌', 'Labels')}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveCocom(null);
            setSelectedBaseId(null);
            setSelectedCountryName(null);
            fitCurrentScope(null, true);
          }}
          className="dock-btn"
          title={L('重置全球海图视野', 'Reset global chart view')}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{L('全图', 'Reset')}</span>
        </button>
        <button
          type="button"
          onClick={() => setMapView('us')}
          className="dock-btn"
          style={{
            borderColor: 'var(--brass)',
            background: 'var(--brass-soft)',
            color: theme === 'midnight' ? 'var(--brass-bright)' : 'var(--ink)',
          }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{L('返回美国六角图', 'U.S. Hex Map')}</span>
        </button>
      </div>
    </div>
  );
};
