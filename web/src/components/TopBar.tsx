import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Camera as CameraIcon,
  Globe,
  HelpCircle,
  Landmark,
  Moon,
  Scale,
  Search,
  Share2,
  Sun,
  X,
} from 'lucide-react';
import { useAppStore, type TopMetricId } from '../store/useAppStore';
import { localizeWonderMetric, useL } from '../i18n';
import { TopMetricPopover } from './TopMetricPopover';
import type { CityRecord, MapLayersData, StateRecord, WorldHexData, WorldMeta } from '../types/world';

interface TopBarProps {
  meta: WorldMeta;
  world: WorldHexData;
  cities: CityRecord[];
  states: StateRecord[];
  layersData: MapLayersData | null;
  onFlyTo: (x: number, y: number, scale: number) => void;
  onResetView: () => void;
  onExportPng: () => void;
  onCopyShareLink: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  meta,
  world,
  cities,
  states,
  layersData,
  onFlyTo,
  onResetView,
  onExportPng,
  onCopyShareLink,
}) => {
  const { locale, L } = useL();
  const {
    theme,
    toggleTheme,
    setLocale,
    mapView,
    setMapView,
    toggleMapView,
    mode,
    openCity,
    openState,
    openAdvisor,
    openShowdown,
    closeSidePanel,
    setAlmanacOpen,
    setHelpOpen,
    activeTopMetric,
    setActiveTopMetric,
    geoScope,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [anchorCenterX, setAnchorCenterX] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const metricZoneRef = useRef<HTMLDivElement>(null);
  const metricBtnRefs = useRef<Partial<Record<TopMetricId, HTMLButtonElement | null>>>({});

  const stateHexMap = useMemo(() => {
    const m = new Map<string, number[]>();
    for (let i = 0; i < world.n; i++) {
      const sf = world.st[i];
      let arr = m.get(sf);
      if (!arr) {
        arr = [];
        m.set(sf, arr);
      }
      arr.push(i);
    }
    return m;
  }, [world]);

  const updateAnchor = (id: TopMetricId) => {
    const el = metricBtnRefs.current[id];
    const rect = el?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      setAnchorCenterX(rect.left + rect.width / 2);
      return;
    }
    const zoneRect = metricZoneRef.current?.getBoundingClientRect();
    if (zoneRect && zoneRect.width > 0) {
      setAnchorCenterX(zoneRect.right - 24);
    }
  };

  const handleToggleMetric = (id: TopMetricId) => {
    if (activeTopMetric === id) {
      setActiveTopMetric(null);
    } else {
      updateAnchor(id);
      setActiveTopMetric(id);
    }
  };

  useEffect(() => {
    if (!activeTopMetric) return;
    updateAnchor(activeTopMetric);
    const onResize = () => updateAnchor(activeTopMetric);
    const onDocDown = (e: MouseEvent) => {
      if (metricZoneRef.current && !metricZoneRef.current.contains(e.target as Node)) {
        setActiveTopMetric(null);
      }
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [activeTopMetric, setActiveTopMetric]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useAppStore.getState();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const isCmdK = (e.metaKey || e.ctrlKey) && !e.altKey && k === 'k';
      const isSlash = !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/';
      if (!isCmdK && !isSlash) return;
      if (st.helpOpen || st.almanacOpen) return;
      if (isSlash) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      }
      e.preventDefault();
      setActiveTopMetric(null);
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveTopMetric]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { kind: 'city' | 'state' | 'wonder'; id: string; title: string; sub: string; x: number; y: number }[] = [];

    for (const s of states) {
      if (s.name.toLowerCase().includes(q) || s.abbr.toLowerCase() === q) {
        out.push({
          kind: 'state',
          id: s.fips,
          title: `${s.name} (${s.abbr})`,
          sub: L(
            `州 · ${(s.pop / 1e6).toFixed(2)}M 人 · GDP $${(s.gdp_musd / 1000).toFixed(0)}B`,
            `State · ${(s.pop / 1e6).toFixed(2)}M pop · GDP $${(s.gdp_musd / 1000).toFixed(0)}B`,
          ),
          x: s.x,
          y: s.y,
        });
      }
    }
    for (const c of cities) {
      if (c.name.toLowerCase().includes(q) || c.short_name.toLowerCase().includes(q)) {
        out.push({
          kind: 'city',
          id: c.id,
          title: c.short_name,
          sub: L(
            `${c.state_abbr} 都会区 · ${(c.pop / 1e6).toFixed(2)}M 人`,
            `${c.state_abbr} Metro · ${(c.pop / 1e6).toFixed(2)}M pop`,
          ),
          x: c.x,
          y: c.y,
        });
      }
      if (out.length >= 14) break;
    }
    if (layersData && out.length < 14) {
      for (const w of layersData.wonders) {
        if (w.name.toLowerCase().includes(q)) {
          out.push({
            kind: 'wonder',
            id: w.id,
            title: w.name,
            sub: `${L('奇观', 'Wonder')} #${w.rank} · ${localizeWonderMetric(w.metric_label, locale)}`,
            x: w.x,
            y: w.y,
          });
        }
        if (out.length >= 16) break;
      }
    }
    return out.slice(0, 12);
  }, [query, cities, states, layersData, locale]);

  const n = meta.nation;
  const advActive = mode === 'advisor' || mode === 'explorer';

  return (
    <header
      className="fixed top-0 left-0 right-0 h-11 z-40 flex items-center gap-1.5 px-2.5 border-b"
      style={{
        background: 'var(--surface-paper)',
        borderColor: 'var(--border-strong)',
        boxShadow: '0 2px 14px rgba(0,0,0,0.35)',
      }}
    >
      {/* Brand Emblem */}
      <button
        onClick={onResetView}
        className="flex items-center gap-2 shrink-0 cursor-pointer group whitespace-nowrap"
        title={L('回到全美全景视图', 'Reset to full U.S. map view')}
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border"
          style={{ background: '#1B3A66', borderColor: 'var(--brass)', color: '#F7E7B8' }}
        >
          ★
        </span>
        <span className="font-display text-sm font-bold tracking-wider uppercase" style={{ color: 'var(--brass-bright)' }}>
          UNITED STATES
        </span>
        <span className="text-[10.5px] opacity-60 hidden 2xl:inline">{L('联邦六角志', 'TERRA AMERICANA')}</span>
      </button>

      {/* National Real Yields Ledger (Each metric independently clickable for detailed breakdown & map-linked ranking) */}
      <div ref={metricZoneRef} className="hidden lg:flex items-center gap-0.5 relative">
        {([
          {
            id: 'population' as const,
            icon: '👥',
            iconClass: 'opacity-75 text-[11px]',
            val: `${(n.population / 1e6).toFixed(0)}M`,
            color: undefined,
            title: L('点击查看全美常住人口详情 (ACS 2025 B01003)', 'Click for U.S. Resident Population breakdown (ACS 2025 B01003)'),
            displayClass: 'inline-flex',
          },
          {
            id: 'food' as const,
            icon: '🌾',
            iconClass: 'text-[11px]',
            val: `${((n.real_yields?.food ?? 1728726) / 1e6).toFixed(1)}M`,
            color: 'var(--y-food)',
            title: L('点击查看粮食产出详情：农林渔牧从业人数 (ACS C24030)', 'Click for Food Yield: Agriculture, Forestry & Fishing workers (ACS C24030)'),
            displayClass: 'inline-flex',
          },
          {
            id: 'production' as const,
            icon: '⚙',
            iconClass: 'text-[11px]',
            val: `${((n.real_yields?.production ?? 27878245) / 1e6).toFixed(1)}M`,
            color: 'var(--y-prod)',
            title: L('点击查看生产力详情：制造、建筑与采矿从业人数 (ACS C24030)', 'Click for Production Yield: Manufacturing, Construction & Mining workers (ACS C24030)'),
            displayClass: 'inline-flex',
          },
          {
            id: 'gold' as const,
            icon: '●',
            iconClass: 'text-[11px]',
            val: `$${(n.gdp_musd / 1e6).toFixed(1)}T`,
            color: 'var(--y-gold)',
            title: L('点击查看金币产出详情：BEA 2024 真实现价 GDP', 'Click for Gold Yield: BEA 2024 Current-Dollar GDP'),
            displayClass: 'inline-flex',
          },
          {
            id: 'science' as const,
            icon: '⚗',
            iconClass: 'text-[11px]',
            val: `${((n.real_yields?.science ?? 17255272) / 1e6).toFixed(1)}M`,
            color: 'var(--y-science)',
            title: L('点击查看科研产出详情：专业科研与信息业从业人数 (ACS C24030)', 'Click for Science Yield: Scientific, Technical & Information workers (ACS C24030)'),
            displayClass: 'inline-flex',
          },
          {
            id: 'culture' as const,
            icon: '🎭',
            iconClass: 'text-[11px]',
            val: `${((n.real_yields?.culture ?? 3791558) / 1e6).toFixed(1)}M`,
            color: 'var(--y-culture)',
            title: L('点击查看文化产出详情：文化艺术与娱乐业从业人数 (ACS C24030)', 'Click for Culture Yield: Arts, Entertainment & Recreation workers (ACS C24030)'),
            displayClass: 'inline-flex',
          },
          {
            id: 'unemployment' as const,
            icon: '💼',
            iconClass: 'text-[11px]',
            val: `${((n.unemployment ?? 0.0488) * 100).toFixed(1)}%`,
            color: undefined,
            title: L('点击查看全美平民失业率详情 (ACS 2025 B23025)', 'Click for U.S. Civilian Unemployment Rate breakdown (ACS 2025 B23025)'),
            displayClass: 'hidden xl:inline-flex',
          },
        ]).map((item) => {
          const active = activeTopMetric === item.id;
          return (
            <button
              key={item.id}
              ref={(el) => {
                metricBtnRefs.current[item.id] = el;
              }}
              type="button"
              onClick={() => handleToggleMetric(item.id)}
              aria-expanded={active}
              aria-haspopup="dialog"
              title={item.title}
              className={`${item.displayClass} items-center gap-1 font-mono-num text-xs font-bold px-1.5 py-1 rounded-md border transition cursor-pointer whitespace-nowrap ${
                active
                  ? 'border-[var(--brass)] bg-[var(--brass-soft)] shadow-sm'
                  : 'border-transparent hover:bg-[var(--surface-paper-hover)] hover:border-[var(--border-hairline)]'
              }`}
              style={item.color ? { color: item.color } : undefined}
            >
              <span className={item.iconClass}>{item.icon}</span>
              <span>{item.val}</span>
            </button>
          );
        })}

        {activeTopMetric && (
          <TopMetricPopover
            metric={activeTopMetric}
            anchorCenterX={anchorCenterX}
            meta={meta}
            cities={cities}
            states={states}
            stateHexMap={stateHexMap}
            onClose={() => setActiveTopMetric(null)}
            onSelectMetric={(m) => {
              updateAnchor(m);
              setActiveTopMetric(m);
            }}
          />
        )}
      </div>

      <div className="flex-1" />

      {/* Fuzzy Global Search */}
      <div className="relative w-36 sm:w-44 2xl:w-56 shrink-0">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs"
          style={{ background: 'var(--surface-paper-subtle)', borderColor: 'var(--border-hairline)' }}
        >
          <Search className="w-3.5 h-3.5 opacity-60 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && searchResults.length > 0) {
                e.preventDefault();
                setSelectedIdx((idx) => (idx + 1) % searchResults.length);
              } else if (e.key === 'ArrowUp' && searchResults.length > 0) {
                e.preventDefault();
                setSelectedIdx((idx) => (idx - 1 + searchResults.length) % searchResults.length);
              } else if (e.key === 'Enter' && searchResults.length > 0) {
                e.preventDefault();
                const item = searchResults[Math.min(selectedIdx, searchResults.length - 1)];
                if (item) {
                  setQuery('');
                  setSearchFocused(false);
                  inputRef.current?.blur();
                  if (mapView === 'global') setMapView('us');
                  if (item.kind === 'city') openCity(item.id);
                  else if (item.kind === 'state') openState(item.id);
                  else onFlyTo(item.x, item.y, 1.45);
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (query) {
                  setQuery('');
                } else {
                  setSearchFocused(false);
                  inputRef.current?.blur();
                }
              }
            }}
            placeholder={L(
              `搜索 ${geoScope === 'conus' ? (n.conus_metros ?? 524) : cities.length} 城、${geoScope === 'conus' ? 49 : states.length} 州、${n.total_wonders} 奇观...`,
              `Search ${geoScope === 'conus' ? (n.conus_metros ?? 524) : cities.length} metros, ${geoScope === 'conus' ? 49 : states.length} states, ${n.total_wonders} wonders...`,
            )}
            className="w-full bg-transparent outline-none text-xs placeholder:opacity-55"
          />
          {query ? (
            <button onClick={() => setQuery('')} className="opacity-60 hover:opacity-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="text-[10px] font-mono-num px-1 rounded border border-[var(--border-hairline)] opacity-60">/</kbd>
          )}
        </div>

        {searchFocused && searchResults.length > 0 && (
          <div role="listbox" className="atlas-panel-brass absolute top-full mt-1.5 left-0 right-0 rounded-lg overflow-hidden py-1 z-50 max-h-80 overflow-y-auto">
            {searchResults.map((item, i) => (
              <button
                key={`${item.kind}-${item.id}`}
                role="option"
                aria-selected={i === selectedIdx}
                onMouseEnter={() => setSelectedIdx(i)}
                onMouseDown={() => {
                  setQuery('');
                  setSearchFocused(false);
                  if (mapView === 'global') setMapView('us');
                  if (item.kind === 'city') openCity(item.id);
                  else if (item.kind === 'state') openState(item.id);
                  else onFlyTo(item.x, item.y, 1.45);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer ${
                  i === selectedIdx ? 'bg-[var(--surface-paper-hover)]' : 'hover:bg-[var(--surface-paper-hover)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{item.title}</div>
                  <div className="text-[10px] opacity-65 truncate">{item.sub}</div>
                </div>
                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[var(--brass-soft)] font-semibold shrink-0" style={{ color: 'var(--brass)' }}>
                  {item.kind === 'city' ? L('都会区', 'Metro') : item.kind === 'state' ? L('州', 'State') : L('奇观', 'Wonder')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Command Buttons */}
      <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
        <button
          onClick={() => {
            if (mapView === 'global') setMapView('us');
            if (advActive && mapView === 'us') closeSidePanel();
            else openAdvisor('council');
          }}
          className={`dock-btn !py-1 !px-2 ${advActive && mapView === 'us' ? 'active' : ''}`}
          style={{ borderColor: advActive && mapView === 'us' ? 'var(--brass)' : 'var(--border-hairline)' }}
          title={L('打开 9 位内阁顾问与全美探索器 (Council & Explorer)', 'Open 9 Cabinet Advisors & Explorer')}
        >
          <Landmark className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brass-bright)' }} />
          <span className="hidden sm:inline">{L('顾问团', 'Advisors')}</span>
        </button>

        <button
          onClick={toggleMapView}
          className={`dock-btn !py-1 !px-2 ${mapView === 'global' ? 'active' : ''}`}
          style={{ borderColor: mapView === 'global' ? 'var(--brass)' : 'var(--border-hairline)' }}
          title={
            mapView === 'global'
              ? L('切回美国本土 25 km 六边形沙盘', 'Switch back to U.S. 25 km Hex Map')
              : L('切换至全球投射海图：各大洲与各大洋 498 座海外美军基地与 49 驻军地', 'Switch to Global Force Projection Chart: 498 overseas U.S. bases & 49 host territories')
          }
        >
          <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: mapView === 'global' ? 'var(--brass-bright)' : '#6FB3E0' }} />
          <span className="hidden sm:inline">{mapView === 'global' ? L('美国六角图', 'U.S. Map') : L('全球基地', 'Global')}</span>
        </button>

        <button
          onClick={() => {
            if (mapView === 'global') setMapView('us');
            if (mode === 'showdown' && mapView === 'us') closeSidePanel();
            else openShowdown('city');
          }}
          className={`dock-btn !py-1 !px-2 ${mode === 'showdown' && mapView === 'us' ? 'active' : ''}`}
          style={{ borderColor: mode === 'showdown' && mapView === 'us' ? 'var(--brass)' : 'var(--border-hairline)' }}
          title={L('双城 / 双州国力 PK 对决', 'City vs. City / State vs. State Showdown')}
        >
          <Scale className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">{L('国力 PK', 'Showdown')}</span>
        </button>

        {/* Bilingual Locale Switcher (中文 / EN) */}
        <div
          role="group"
          aria-label={L('切换语言', 'Switch language')}
          className="inline-flex items-center rounded-md border p-0.5 text-[10.5px] font-bold"
          style={{ borderColor: 'var(--border-hairline)', background: 'var(--surface-paper-subtle)' }}
          title={L('切换界面语言（中文 / English）', 'Switch UI language (中文 / English)')}
        >
          <button
            type="button"
            onClick={() => setLocale('zh')}
            aria-pressed={locale === 'zh'}
            className={`px-1.5 py-0.5 rounded-[4px] leading-none transition cursor-pointer ${
              locale === 'zh' ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-65 hover:opacity-100'
            }`}
          >
            中
          </button>
          <button
            type="button"
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
            className={`px-1.5 py-0.5 rounded-[4px] leading-none transition cursor-pointer ${
              locale === 'en' ? 'bg-[var(--brass)] text-[#141B24]' : 'opacity-65 hover:opacity-100'
            }`}
          >
            EN
          </button>
        </div>

        <button
          onClick={toggleTheme}
          className="dock-btn !p-1.5"
          style={{ borderColor: 'var(--border-hairline)' }}
          title={
            theme === 'midnight'
              ? L('切换为 WPA 日光羊皮纸主题 (T)', 'Switch to WPA Daylight Atlas theme (T)')
              : L('切换为经典暗夜制图主题 (T)', 'Switch to Midnight Cartography theme (T)')
          }
        >
          {theme === 'midnight' ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={onCopyShareLink}
          className="dock-btn !py-1 !px-2 hidden sm:inline-flex"
          style={{ borderColor: 'var(--border-hairline)' }}
          title={L('复制当前视图分享链接', 'Copy shareable link to current view')}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span className="hidden 2xl:inline">{L('分享', 'Share')}</span>
        </button>

        <button
          onClick={onExportPng}
          className="dock-btn !p-1.5 hidden md:inline-flex"
          style={{ borderColor: 'var(--border-hairline)' }}
          title={L('导出高清 PNG 地图海报', 'Export HD PNG map snapshot')}
        >
          <CameraIcon className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setHelpOpen(!useAppStore.getState().helpOpen)}
          className="dock-btn !p-1.5"
          style={{ borderColor: 'var(--border-hairline)' }}
          title={L('快捷键与操作指南 (?)', 'Help (?)')}
          aria-label={L('快捷键与鼠标操作帮助', 'Keyboard and mouse help')}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setAlmanacOpen(true, 'sources')}
          className="dock-btn !py-1 !px-2"
          style={{ borderColor: 'var(--brass)', background: 'var(--brass-soft)', color: 'var(--brass-bright)' }}
          title={L('打开《联邦百科全书》与全部 31 项公开数据源', 'What every number means and where it comes from')}
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{L('百科', 'Almanac')}</span>
        </button>
      </div>
    </header>
  );
};
