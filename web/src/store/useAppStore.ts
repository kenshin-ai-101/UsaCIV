import { create } from 'zustand';
import type { LayerToggles, Locale, MapMode, ThemeMode } from '../types/world';
import { applyDocumentLocale, detectInitialLocale, LOCALE_STORAGE_KEY } from '../i18n/localeUtils';

const initialLocale: Locale = detectInitialLocale();
applyDocumentLocale(initialLocale);

export type TopMetricId =
  | 'population'
  | 'food'
  | 'production'
  | 'gold'
  | 'science'
  | 'culture'
  | 'unemployment';

export interface MapBubbleSpec {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  radiusPx: number;
  color: string;
  stroke?: string;
  highlighted?: boolean;
  onClickType?: 'city' | 'state' | 'fly';
  targetId?: string;
}

export interface AppState {
  theme: ThemeMode;
  locale: Locale;
  geoScope: 'conus' | 'all';
  mode: MapMode;
  activeLensId: string | null;
  bandSlice: [number, number] | null;
  selectedCityId: string | null;
  selectedStateFips: string | null;
  activeAdvisorId: string; // 'council' | 'economy' | 'energy' | 'people' | 'prosperity' | 'knowledge' | 'land' | 'military' | 'commerce' | 'culture' | 'explorer'
  hoveredHexId: number;

  // Dual-City / Dual-State Showdown PK state
  showdownKind: 'city' | 'state';
  showdownA: string | null;
  showdownB: string | null;

  // Two-way linked map state from Advisors & Explorer
  brushedHexIds: Set<number> | null;
  brushedFips: Set<string> | null;
  advisorFuelFilters: Set<string> | null; // null = all fuels active
  advisorBubbles: MapBubbleSpec[] | null;
  advisorDimTerrain: boolean;
  hoveredBubbleId: string | null;

  // Modals & Popovers
  almanacOpen: boolean;
  almanacTab: string;
  helpOpen: boolean;
  yieldReportOpen: boolean;
  activeTopMetric: TopMetricId | null;
  minimapOpen: boolean;

  layers: LayerToggles;

  // Actions
  setTheme: (t: ThemeMode) => void;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  setGeoScope: (scope: 'conus' | 'all') => void;
  toggleTheme: () => void;
  setLens: (id: string | null) => void;
  setBandSlice: (slice: [number, number] | null) => void;
  openCity: (cityId: string) => void;
  openState: (fips: string) => void;
  openAdvisor: (advisorId?: string) => void;
  openExplorer: () => void;
  openShowdown: (kind: 'city' | 'state', a?: string | null, b?: string | null) => void;
  setShowdownPair: (kind: 'city' | 'state', a: string | null, b: string | null) => void;
  closeSidePanel: () => void;
  setHoveredHex: (id: number) => void;
  setBrushed: (hexIds: Set<number> | null, fipsOrLabel?: Set<string> | string | null) => void;
  setAdvisorFuelFilters: (fuels: Set<string> | null) => void;
  setAdvisorVisuals: (bubbles: MapBubbleSpec[] | null, dimTerrain?: boolean) => void;
  setHoveredBubbleId: (id: string | null) => void;
  toggleLayer: (key: keyof LayerToggles) => void;
  setLayer: (key: keyof LayerToggles, val: boolean) => void;
  setAlmanacOpen: (open: boolean, tab?: string) => void;
  setHelpOpen: (open: boolean) => void;
  setYieldReportOpen: (open: boolean) => void;
  setActiveTopMetric: (metric: TopMetricId | null) => void;
  toggleMinimap: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'midnight',
  locale: initialLocale,
  geoScope: 'conus',
  mode: 'explore',
  activeLensId: null,
  bandSlice: null,
  selectedCityId: null,
  selectedStateFips: null,
  activeAdvisorId: 'council',
  hoveredHexId: -1,

  showdownKind: 'city',
  showdownA: null,
  showdownB: null,

  brushedHexIds: null,
  brushedFips: null,
  advisorFuelFilters: null,
  advisorBubbles: null,
  advisorDimTerrain: false,
  hoveredBubbleId: null,

  almanacOpen: false,
  almanacTab: 'about',
  helpOpen: false,
  yieldReportOpen: false,
  activeTopMetric: null,
  minimapOpen: true,

  layers: {
    roads: true,
    rail: true,
    hubs: true,
    resources: true,
    military: true,
    wonders: true,
    trade: false,
    borders: true,
    banners: true,
  },

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  setLocale: (locale) => {
    applyDocumentLocale(locale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore storage errors
    }
    set({ locale });
  },
  toggleLocale: () =>
    set((s) => {
      const next: Locale = s.locale === 'zh' ? 'en' : 'zh';
      applyDocumentLocale(next);
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      return { locale: next };
    }),
  setGeoScope: (geoScope) => set({ geoScope }),
  toggleTheme: () =>
    set((s) => {
      const next: ThemeMode = s.theme === 'midnight' ? 'daylight' : 'midnight';
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    }),
  setLens: (id) => set({ activeLensId: id, bandSlice: null }),
  setBandSlice: (bandSlice) => set({ bandSlice }),

  openCity: (cityId) =>
    set({
      mode: 'city',
      selectedCityId: cityId,
      selectedStateFips: null,
      brushedHexIds: null,
      brushedFips: null,
      advisorFuelFilters: null,
      advisorBubbles: null,
      advisorDimTerrain: false,
      yieldReportOpen: false,
      activeTopMetric: null,
    }),

  openState: (fips) =>
    set({
      mode: 'state',
      selectedStateFips: fips,
      selectedCityId: null,
      brushedHexIds: null,
      brushedFips: null,
      advisorFuelFilters: null,
      advisorBubbles: null,
      advisorDimTerrain: false,
      yieldReportOpen: false,
      activeTopMetric: null,
    }),

  openAdvisor: (advisorId) =>
    set((s) => {
      const nextId = advisorId ?? s.activeAdvisorId;
      return {
        mode: nextId === 'explorer' ? 'explorer' : 'advisor',
        activeAdvisorId: nextId,
        selectedCityId: null,
        selectedStateFips: null,
        brushedHexIds: null,
        brushedFips: null,
        advisorBubbles: null,
        advisorDimTerrain: false,
        advisorFuelFilters: null,
        yieldReportOpen: false,
        activeTopMetric: null,
      };
    }),

  openExplorer: () =>
    set({
      mode: 'explorer',
      activeAdvisorId: 'explorer',
      selectedCityId: null,
      selectedStateFips: null,
      advisorFuelFilters: null,
      advisorBubbles: null,
      advisorDimTerrain: false,
      yieldReportOpen: false,
      activeTopMetric: null,
    }),

  openShowdown: (kind, a, b) =>
    set((s) => ({
      mode: 'showdown',
      showdownKind: kind,
      showdownA: a !== undefined ? a : s.showdownA,
      showdownB: b !== undefined ? b : s.showdownB,
      selectedCityId: null,
      selectedStateFips: null,
      advisorFuelFilters: null,
      advisorBubbles: null,
      advisorDimTerrain: false,
      yieldReportOpen: false,
      activeTopMetric: null,
    })),

  setShowdownPair: (kind, a, b) => set({ showdownKind: kind, showdownA: a, showdownB: b }),

  closeSidePanel: () =>
    set({
      mode: 'explore',
      selectedCityId: null,
      selectedStateFips: null,
      brushedHexIds: null,
      brushedFips: null,
      advisorFuelFilters: null,
      advisorBubbles: null,
      advisorDimTerrain: false,
      hoveredBubbleId: null,
    }),

  setHoveredHex: (hoveredHexId) => set({ hoveredHexId }),
  setBrushed: (brushedHexIds, fipsOrLabel = null) =>
    set({
      brushedHexIds,
      brushedFips: fipsOrLabel instanceof Set ? fipsOrLabel : null,
    }),
  setAdvisorFuelFilters: (advisorFuelFilters) => set({ advisorFuelFilters }),
  setAdvisorVisuals: (advisorBubbles, advisorDimTerrain = false) => set({ advisorBubbles, advisorDimTerrain }),
  setHoveredBubbleId: (hoveredBubbleId) => set({ hoveredBubbleId }),

  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setLayer: (key, val) => set((s) => ({ layers: { ...s.layers, [key]: val } })),

  setAlmanacOpen: (open, tab) => set((s) => ({ almanacOpen: open, almanacTab: tab ?? s.almanacTab, activeTopMetric: open ? null : s.activeTopMetric })),
  setHelpOpen: (helpOpen) => set((s) => ({ helpOpen, activeTopMetric: helpOpen ? null : s.activeTopMetric })),
  setYieldReportOpen: (yieldReportOpen) => set((s) => ({ yieldReportOpen, activeTopMetric: yieldReportOpen ? null : s.activeTopMetric })),
  setActiveTopMetric: (activeTopMetric) => set({ activeTopMetric }),
  toggleMinimap: () => set((s) => ({ minimapOpen: !s.minimapOpen })),
}));
