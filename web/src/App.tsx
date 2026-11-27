import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapCamera } from './engine/camera';
import { HexRenderer } from './engine/webgl/HexRenderer';
import { renderBackdropSea, renderMapOverlay } from './engine/overlay/OverlayRenderer';
import {
  computeHexBounds,
  HexSpatialIndex,
  hitTestScreen,
  type BannerHitBox,
  type PickedItem,
  type PointHitItem,
} from './engine/picking';
import { useAppStore } from './store/useAppStore';
import { useL } from './i18n';
import { TopBar } from './components/TopBar';
import { LensDock } from './components/LensDock';
import { MapTooltip } from './components/MapTooltip';
import { Minimap } from './components/Minimap';
import { CityCommandPanel } from './features/city/CityCommandPanel';
import { StatePanel } from './features/city/StatePanel';
import { AdvisorsPanel } from './features/advisors/AdvisorsPanel';
import { CountyExplorerPanel } from './features/explorer/CountyExplorerPanel';
import { ShowdownPanel } from './features/showdown/ShowdownPanel';
import { AlmanacModal, HelpModal, YieldReportModal } from './features/almanac/AlmanacModal';
import type {
  CityRecord,
  CountiesDataset,
  MapLayersData,
  StateRecord,
  WorldHexData,
  WorldMeta,
} from './types/world';

export default function App() {
  const { locale, L } = useL();
  const {
    theme,
    mode,
    activeLensId,
    bandSlice,
    selectedCityId,
    selectedStateFips,
    activeAdvisorId,
    hoveredHexId,
    brushedHexIds,
    advisorFuelFilters,
    advisorBubbles,
    advisorDimTerrain,
    hoveredBubbleId,
    showdownKind,
    showdownA,
    showdownB,
    layers: toggles,
    setLens,
    toggleLayer,
    toggleTheme,
    openCity,
    openState,
    closeSidePanel,
    setHoveredHex,
    setBrushed,
    setHoveredBubbleId,
    setAlmanacOpen,
    setHelpOpen,
    setYieldReportOpen,
    setActiveTopMetric,
  } = useAppStore();

  const [meta, setMeta] = useState<WorldMeta | null>(null);
  const [world, setWorld] = useState<WorldHexData | null>(null);
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [states, setStates] = useState<StateRecord[]>([]);
  const [layersData, setLayersData] = useState<MapLayersData | null>(null);
  const [countiesData, setCountiesData] = useState<CountiesDataset | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; picked: PickedItem | null }>({
    x: 0,
    y: 0,
    picked: null,
  });
  const [camTick, setCamTick] = useState(0);

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);

  const cameraRef = useRef(new MapCamera());
  const rendererRef = useRef<HexRenderer | null>(null);
  const hexIndexRef = useRef<HexSpatialIndex | null>(null);
  const hitStateRef = useRef<{ banners: BannerHitBox[]; points: PointHitItem[] }>({ banners: [], points: [] });
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; moved: boolean }>({
    active: false,
    sx: 0,
    sy: 0,
    moved: false,
  });
  const rafDirtyRef = useRef(true);
  const initialHashRef = useRef(window.location.hash);
  const hashHydratedRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2600);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [mRes, wRes, cRes, sRes] = await Promise.all([
          fetch('/data/meta.json'),
          fetch('/data/world_hex.json'),
          fetch('/data/cities.json'),
          fetch('/data/states.json'),
        ]);
        if (!mRes.ok || !wRes.ok || !cRes.ok || !sRes.ok) {
          throw new Error(
            useAppStore.getState().locale === 'en'
              ? 'Failed to load data files. Verify that the ETL pipeline generated web/public/data/*.json.'
              : '数据文件加载失败，请确认 pipeline 已生成 web/public/data/*.json',
          );
        }
        const [m, w, c, s] = await Promise.all([mRes.json(), wRes.json(), cRes.json(), sRes.json()]);
        if (cancelled) return;
        setMeta(m);
        setWorld(w);
        setCities(c);
        setStates(s);
        hexIndexRef.current = new HexSpatialIndex(w);

        const hash = new URLSearchParams(initialHashRef.current.replace(/^#/, ''));
        if (hash.get('lang') === 'en' || hash.get('lang') === 'zh') {
          useAppStore.getState().setLocale(hash.get('lang') as 'en' | 'zh');
        }
        if (hash.get('theme') === 'daylight') useAppStore.getState().setTheme('daylight');
        if (hash.get('lens')) useAppStore.getState().setLens(hash.get('lens'));
        if (hash.get('city')) useAppStore.getState().openCity(hash.get('city')!);
        else if (hash.get('state')) useAppStore.getState().openState(hash.get('state')!);
        else if (hash.get('advisor')) {
          const adv = hash.get('advisor')!;
          if (adv === 'explorer') useAppStore.getState().openExplorer();
          else useAppStore.getState().openAdvisor(adv);
        } else if (hash.get('mode') === 'explorer') useAppStore.getState().openExplorer();
        else if (hash.get('mode') === 'showdown') useAppStore.getState().openShowdown('city');
        hashHydratedRef.current = true;

        Promise.all([fetch('/data/layers.json'), fetch('/data/counties.json')])
          .then(async ([lr, cr]) => {
            if (cancelled) return;
            if (lr.ok) setLayersData(await lr.json());
            if (cr.ok) setCountiesData(await cr.json());
          })
          .catch((e) => console.warn('Optional layer load warning:', e));
      } catch (err) {
        if (!cancelled) setLoadErr(String(err));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hashHydratedRef.current) return;
    const p = new URLSearchParams();
    if (locale === 'en') p.set('lang', 'en');
    if (theme === 'daylight') p.set('theme', 'daylight');
    if (activeLensId) p.set('lens', activeLensId);
    if (mode === 'city' && selectedCityId) p.set('city', selectedCityId);
    else if (mode === 'state' && selectedStateFips) p.set('state', selectedStateFips);
    else if (mode === 'advisor') p.set('advisor', activeAdvisorId);
    else if (mode === 'explorer') p.set('advisor', 'explorer');
    else if (mode === 'showdown') p.set('mode', 'showdown');
    const s = p.toString();
    window.history.replaceState(null, '', s ? `#${s}` : window.location.pathname);
  }, [locale, theme, activeLensId, mode, selectedCityId, selectedStateFips, activeAdvisorId]);

  const activeLens = useMemo(
    () => (meta && activeLensId ? meta.lenses.find((l) => l.id === activeLensId) ?? null : null),
    [meta, activeLensId],
  );
  const selectedCity = useMemo(
    () => (selectedCityId ? cities.find((c) => c.id === selectedCityId) ?? null : null),
    [cities, selectedCityId],
  );
  const selectedState = useMemo(
    () => (selectedStateFips ? states.find((s) => s.fips === selectedStateFips) ?? null : null),
    [states, selectedStateFips],
  );
  const countyByFips = useMemo(() => {
    const m = new Map<string, NonNullable<typeof countiesData>['rows'][number]>();
    if (countiesData) for (const r of countiesData.rows) m.set(r.fips, r);
    return m;
  }, [countiesData]);
  const stateByFips = useMemo(() => new Map(states.map((s) => [s.fips, s])), [states]);

  const showdownCities = useMemo<[CityRecord | null, CityRecord | null]>(() => {
    if (mode !== 'showdown' || showdownKind !== 'city') return [null, null];
    return [
      cities.find((c) => c.id === showdownA) ?? null,
      cities.find((c) => c.id === showdownB) ?? null,
    ];
  }, [mode, showdownKind, showdownA, showdownB, cities]);

  const highlightHexSet = useMemo<Set<number> | null>(() => {
    if (!world) return null;
    if (selectedCity) return new Set(selectedCity.hex_ids);
    if (selectedState) {
      const s = new Set<number>();
      for (let i = 0; i < world.n; i++) if (world.st[i] === selectedState.fips) s.add(i);
      return s;
    }
    if (mode === 'showdown') {
      const s = new Set<number>();
      if (showdownKind === 'city') {
        showdownCities[0]?.hex_ids.forEach((h) => s.add(h));
        showdownCities[1]?.hex_ids.forEach((h) => s.add(h));
      } else {
        for (let i = 0; i < world.n; i++) if (world.st[i] === showdownA || world.st[i] === showdownB) s.add(i);
      }
      return s.size > 0 ? s : null;
    }
    if (brushedHexIds && brushedHexIds.size > 0) return brushedHexIds;
    return null;
  }, [world, selectedCity, selectedState, mode, showdownKind, showdownA, showdownB, showdownCities, brushedHexIds]);

  const requestDraw = useCallback(() => {
    rafDirtyRef.current = true;
  }, []);

  const flyTo = useCallback(
    (x: number, y: number, scale: number) => {
      cameraRef.current.flyTo(x, y, scale, 500);
      requestDraw();
    },
    [requestDraw],
  );

  const resetView = useCallback(() => {
    if (!meta) return;
    closeSidePanel();
    cameraRef.current.fitBounds(meta.bounds_km, { padTop: 56, padBottom: 74, animate: true });
    requestDraw();
  }, [meta, closeSidePanel, requestDraw]);

  useEffect(() => {
    if (!meta || !world || !glCanvasRef.current) return;
    const renderer = new HexRenderer(glCanvasRef.current);
    renderer.loadWorld(world);
    rendererRef.current = renderer;

    const cam = cameraRef.current;
    cam.setBounds(meta.bounds_km);
    cam.resize(window.innerWidth, window.innerHeight);
    const leftPad = (useAppStore.getState().mode === 'advisor' || useAppStore.getState().mode === 'explorer') && window.innerWidth >= 960 ? 540 : 28;
    cam.fitBounds(meta.bounds_km, { padLeft: leftPad, padRight: 28, padTop: 56, padBottom: 80, animate: false });
    requestDraw();

    const onResize = () => {
      cam.resize(window.innerWidth, window.innerHeight);
      requestDraw();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [meta, world, requestDraw]);

  useEffect(() => {
    if (!world || !rendererRef.current) return;
    rendererRef.current.updateColors(world, activeLens, theme, bandSlice);
    requestDraw();
  }, [world, activeLens, theme, bandSlice, requestDraw]);

  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.updateHighlights(highlightHexSet, hoveredHexId);
    requestDraw();
  }, [highlightHexSet, hoveredHexId, requestDraw]);

  // Smart Camera Auto-Framing: frames U.S. cleanly beside Left Advisor Dock OR zooms cleanly beside Right City/State Dock!
  useEffect(() => {
    if (!world || !meta) return;
    const wide = window.innerWidth >= 960;
    if (selectedCity) {
      const box = computeHexBounds(selectedCity.hex_ids, world);
      cameraRef.current.fitBounds(box, { padLeft: 40, padRight: wide ? 478 : 24, padTop: 64, padBottom: 90, animate: true });
      requestDraw();
    } else if (selectedState) {
      const hids: number[] = [];
      for (let i = 0; i < world.n; i++) if (world.st[i] === selectedState.fips) hids.push(i);
      if (hids.length > 0) {
        const box = computeHexBounds(hids, world);
        cameraRef.current.fitBounds(box, { padLeft: 40, padRight: wide ? 460 : 24, padTop: 64, padBottom: 90, animate: true });
        requestDraw();
      }
    } else if (mode === 'advisor' || mode === 'explorer') {
      cameraRef.current.fitBounds(meta.bounds_km, { padLeft: wide ? 540 : 24, padRight: 24, padTop: 56, padBottom: 82, animate: true });
      requestDraw();
    } else if (mode === 'showdown') {
      cameraRef.current.fitBounds(meta.bounds_km, { padLeft: 24, padRight: wide ? 486 : 24, padTop: 56, padBottom: 76, animate: true });
      requestDraw();
    }
  }, [selectedCity, selectedState, mode, world, meta, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [layersData, toggles, theme, locale, activeLens, advisorFuelFilters, advisorBubbles, advisorDimTerrain, hoveredBubbleId, showdownCities, requestDraw]);

  useEffect(() => {
    if (!meta || !world) return;
    let rafId = 0;
    let tickCounter = 0;

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      const animating = cameraRef.current.step(now);
      if (!animating && !rafDirtyRef.current) return;
      rafDirtyRef.current = false;

      const cam = cameraRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      if (bgCanvasRef.current) {
        const bg = bgCanvasRef.current;
        const pw = Math.round(cam.width * dpr);
        const ph = Math.round(cam.height * dpr);
        if (bg.width !== pw || bg.height !== ph) { bg.width = pw; bg.height = ph; }
        const ctx = bg.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderBackdropSea(ctx, cam, meta, layersData, theme, locale);
        }
      }

      rendererRef.current?.render(cam, theme, dpr, advisorDimTerrain);

      if (fgCanvasRef.current) {
        const fg = fgCanvasRef.current;
        const pw = Math.round(cam.width * dpr);
        const ph = Math.round(cam.height * dpr);
        if (fg.width !== pw || fg.height !== ph) { fg.width = pw; fg.height = ph; }
        const ctx = fg.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          hitStateRef.current = renderMapOverlay(ctx, {
            camera: cam,
            theme,
            locale,
            meta,
            world,
            cities,
            states,
            layers: layersData,
            toggles,
            hasLens: activeLens !== null,
            selectedCity,
            hoveredHexId,
            advisorFuelFilters,
            advisorBubbles,
            hoveredBubbleId,
            showdownCities,
          });
        }
      }

      tickCounter++;
      if (tickCounter % 3 === 0 || !animating) setCamTick((t) => t + 1);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [
    meta, world, cities, states, layersData, toggles, theme, locale, activeLens,
    selectedCity, hoveredHexId, advisorFuelFilters, advisorBubbles, advisorDimTerrain, hoveredBubbleId, showdownCities,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((document.activeElement as HTMLElement)?.tagName === 'INPUT' || (document.activeElement as HTMLElement)?.tagName === 'SELECT') {
        if (e.key === 'Escape') (document.activeElement as HTMLElement).blur();
        return;
      }
      if (e.key === 'Escape') {
        const hadTopMetric = useAppStore.getState().activeTopMetric !== null;
        setAlmanacOpen(false);
        setHelpOpen(false);
        setYieldReportOpen(false);
        setActiveTopMetric(null);
        if (!hadTopMetric && useAppStore.getState().mode !== 'explore') {
          closeSidePanel();
          if (meta) cameraRef.current.fitBounds(meta.bounds_km, { padTop: 56, padBottom: 74, animate: true });
          requestDraw();
        }
      } else if (e.key.toLowerCase() === 'r') {
        toggleLayer('resources');
      } else if (e.key.toLowerCase() === 't') {
        toggleTheme();
      } else if (e.key.toLowerCase() === 'l' && meta) {
        const ids: (string | null)[] = [null, ...meta.lenses.map((l) => l.id)];
        const curIdx = ids.indexOf(useAppStore.getState().activeLensId);
        setLens(ids[(curIdx + 1) % ids.length]);
      } else if (e.key === '?') {
        setAlmanacOpen(true, 'sources');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [meta, closeSidePanel, toggleLayer, toggleTheme, setLens, setAlmanacOpen, setHelpOpen, setYieldReportOpen, setActiveTopMetric, requestDraw]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.sx;
      const dy = e.clientY - dragRef.current.sy;
      if (Math.hypot(dx, dy) > 3) dragRef.current.moved = true;
      dragRef.current.sx = e.clientX;
      dragRef.current.sy = e.clientY;
      cameraRef.current.panByScreen(dx, dy);
      setHoverInfo((h) => (h.picked ? { ...h, picked: null } : h));
      requestDraw();
      return;
    }

    // Check advisor bubble hit first when bubbles are visible
    if (advisorBubbles && advisorBubbles.length > 0) {
      let hitB: string | null = null;
      let bestD2 = Infinity;
      for (const b of advisorBubbles) {
        const [bx, by] = cameraRef.current.worldToScreen(b.x, b.y);
        const d2 = (sx - bx) * (sx - bx) + (sy - by) * (sy - by);
        const rad = Math.max(8, b.radiusPx + 3);
        if (d2 <= rad * rad && d2 < bestD2) {
          bestD2 = d2;
          hitB = b.id;
        }
      }
      if (hitB !== hoveredBubbleId) setHoveredBubbleId(hitB);
      if (hitB) {
        setHoverInfo({ x: e.clientX, y: e.clientY, picked: null });
        return;
      }
    }

    const [wx, wy] = cameraRef.current.screenToWorld(sx, sy);
    const picked = hitTestScreen(
      sx, sy, wx, wy,
      hitStateRef.current.banners,
      hitStateRef.current.points,
      hexIndexRef.current,
    );
    setHoverInfo({ x: e.clientX, y: e.clientY, picked });
    const nextHex = picked?.kind === 'hex' ? picked.hexId : -1;
    if (nextHex !== useAppStore.getState().hoveredHexId) setHoveredHex(nextHex);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;
    if (wasMoved || !world) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = cameraRef.current.screenToWorld(sx, sy);
    const picked = hitTestScreen(
      sx, sy, wx, wy,
      hitStateRef.current.banners,
      hitStateRef.current.points,
      hexIndexRef.current,
    );
    if (!picked) return;

    if (picked.kind === 'city') openCity(picked.city.id);
    else if (picked.kind === 'wonder') flyTo(picked.wonder.x, picked.wonder.y, 1.5);
    else if (picked.kind === 'power') flyTo(picked.plant.x, picked.plant.y, 1.4);
    else if (picked.kind === 'airport') flyTo(picked.airport.x, picked.airport.y, 1.4);
    else if (picked.kind === 'port') flyTo(picked.port.x, picked.port.y, 1.4);
    else if (picked.kind === 'military') flyTo(picked.base.x, picked.base.y, 1.4);
    else if (picked.kind === 'hex') {
      const hid = picked.hexId;
      if (mode === 'explorer') {
        const fips = world.fips[hid];
        const co = countyByFips.get(fips);
        if (co) setBrushed(new Set(co.hex_ids), new Set([fips]));
        return;
      }
      const cbsa = world.cbsa[hid];
      if (cbsa && cities.some((c) => c.id === cbsa)) openCity(cbsa);
      else openState(world.st[hid]);
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    cameraRef.current.zoomAtScreen(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0014));
    requestDraw();
  };

  const exportPng = useCallback(() => {
    const bg = bgCanvasRef.current, gl = glCanvasRef.current, fg = fgCanvasRef.current;
    if (!bg || !gl || !fg) return;
    const out = document.createElement('canvas');
    out.width = bg.width;
    out.height = bg.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(gl, 0, 0);
    ctx.drawImage(fg, 0, 0);
    const a = document.createElement('a');
    a.download = `terra-americana-${activeLens?.id ?? 'terrain'}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
    showToast(L('已导出高清地图 PNG 快照', 'Exported HD map PNG snapshot'));
  }, [activeLens, showToast, locale]);

  const copyShareLink = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    showToast(L('已复制当前视图分享链接', 'Copied share link for current view'));
  }, [showToast, locale]);

  if (loadErr) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-center">
        <div className="atlas-panel-brass max-w-md p-6 rounded-2xl space-y-2">
          <h1 className="font-display text-lg font-bold">{L('数据加载异常', 'Data Load Error')}</h1>
          <p className="text-xs opacity-80">{loadErr}</p>
        </div>
      </div>
    );
  }

  if (!meta || !world) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ background: 'var(--surface-sea-deep)' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-display text-lg font-bold animate-pulse border-2" style={{ background: '#1B3A66', borderColor: 'var(--brass)', color: '#F7E7B8' }}>
          ★
        </div>
        <div className="font-display text-base font-bold" style={{ color: 'var(--brass-bright)' }}>{L('正在测绘联邦版图…', 'Charting the United States…')}</div>
        <div className="text-xs opacity-65">{L('加载 31 项美国真实公开数据 · 18,284 块 25 km 等面积六边形', 'Loading 31 U.S. federal datasets · 18,284 equal-area 25 km hexes')}</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <canvas ref={glCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <canvas
        ref={fgCanvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          dragRef.current.active = false;
          setHoverInfo((h) => ({ ...h, picked: null }));
          setHoveredHex(-1);
          setHoveredBubbleId(null);
        }}
        onWheel={onWheel}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      <TopBar
        meta={meta}
        world={world}
        cities={cities}
        states={states}
        layersData={layersData}
        onFlyTo={flyTo}
        onResetView={resetView}
        onExportPng={exportPng}
        onCopyShareLink={copyShareLink}
      />

      <LensDock lenses={meta.lenses} world={world} />

      <Minimap
        world={world}
        meta={meta}
        activeLens={activeLens}
        cameraRef={cameraRef}
        camTick={camTick}
        onJump={(wx, wy) => flyTo(wx, wy, Math.max(0.55, cameraRef.current.scale))}
      />

      <MapTooltip
        x={hoverInfo.x}
        y={hoverInfo.y}
        picked={hoverInfo.picked}
        world={world}
        activeLens={activeLens}
        countyByFips={countyByFips}
        stateByFips={stateByFips}
      />

      {mode === 'city' && selectedCity && (
        <CityCommandPanel city={selectedCity} allCities={cities} meta={meta} layers={layersData} onFlyTo={flyTo} />
      )}
      {mode === 'state' && selectedState && (
        <StatePanel state={selectedState} cities={cities} />
      )}
      {mode === 'advisor' && (
        <AdvisorsPanel
          meta={meta}
          world={world}
          cities={cities}
          states={states}
          layers={layersData}
          counties={countiesData}
          onFlyTo={flyTo}
        />
      )}
      {mode === 'explorer' && (
        <CountyExplorerPanel
          meta={meta}
          dataset={countiesData}
          cities={cities}
          states={states}
          world={world}
          onFlyTo={flyTo}
        />
      )}
      {mode === 'showdown' && <ShowdownPanel cities={cities} states={states} />}

      <AlmanacModal meta={meta} />
      <YieldReportModal cities={cities} states={states} />
      <HelpModal />

      {toast && (
        <div className="atlas-panel-brass fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-xs font-semibold">
          {toast}
        </div>
      )}
    </div>
  );
}
