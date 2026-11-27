import React from 'react';
import { BookOpen, ExternalLink, Trophy, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  localizeDistrictCatalog,
  localizeLensDesc,
  localizeLensName,
  localizeLensUnit,
  localizeSourceUsedFor,
  SOURCE_CAT_LABELS,
  useL,
} from '../../i18n';
import type { CityRecord, StateRecord, WorldMeta } from '../../types/world';

interface AlmanacModalProps {
  meta: WorldMeta;
}

export const AlmanacModal: React.FC<AlmanacModalProps> = ({ meta }) => {
  const { locale, isEn, L } = useL();
  const { almanacOpen, almanacTab, setAlmanacOpen } = useAppStore();
  if (!almanacOpen) return null;

  const catLabels = SOURCE_CAT_LABELS[locale];
  const tabs = [
    { id: 'about', label: L('玩法与公式', 'Mechanics & Formulas') },
    { id: 'districts', label: L('10 类产业城区', '10 Specialized Districts') },
    { id: 'lenses', label: L('19 种视角口径', '19 Data Lenses') },
    { id: 'sources', label: L(`全部 ${meta.sources.length} 项公开数据源`, `All ${meta.sources.length} Official Sources`) },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-3" onClick={() => setAlmanacOpen(false)}>
      <div
        className="atlas-panel-brass w-[min(920px,96vw)] h-[min(82vh,760px)] rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] flex items-center justify-between bg-[var(--surface-paper-subtle)]/75">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5" style={{ color: 'var(--brass)' }} />
            <div>
              <h2 className="font-display text-base font-bold m-0">
                {L('联邦百科全书 · Federal Almanac', 'Federal Almanac')}
              </h2>
              <p className="text-[11px] opacity-65 m-0">
                {L(
                  '所有策略数值背后均可追溯至美国联邦与学术机构的公开原始数据，绝无虚构与插补',
                  'Every strategy figure traces directly back to open U.S. federal and academic datasets — zero fabrication or interpolation.',
                )}
              </p>
            </div>
          </div>
          <button onClick={() => setAlmanacOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-[var(--border-hairline)] px-4 gap-2 bg-[var(--surface-paper-subtle)]/35 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setAlmanacOpen(true, t.id)}
              className={`px-3 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition cursor-pointer ${
                almanacTab === t.id ? 'border-[var(--brass)]' : 'border-transparent opacity-65 hover:opacity-100'
              }`}
              style={almanacTab === t.id ? { color: 'var(--brass)' } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
          {almanacTab === 'about' && (
            <div className="space-y-4 leading-relaxed">
              <div className="p-4 rounded-xl bg-[var(--brass-soft)] border border-[var(--border-strong)]">
                <h3 className="font-display text-sm font-bold m-0 mb-1.5">
                  {L(
                    '25 km 等面积六边形空间底盘（含阿拉斯加与夏威夷黄铜插图框）',
                    '25 km Equal-Area Hexagonal Grid (with Alaska & Hawaii Brass Insets)',
                  )}
                </h3>
                {isEn ? (
                  <p className="m-0 opacity-90">
                    The contiguous U.S. uses <b>NAD83 / Conus Albers (EPSG:5070)</b>, Alaska uses <b>EPSG:3338</b>, and Hawaii uses <b>Hawaii Albers</b> —
                    tessellated into <b>{meta.hex_count.toLocaleString()}</b> flat equal-area 25 km hexagons (<b>541.3 km²</b> each) with elevation and relief derived from NOAA ETOPO1.
                  </p>
                ) : (
                  <p className="m-0 opacity-90">
                    全美本土采用北美官方等面积投影 <b>NAD83 / Conus Albers (EPSG:5070)</b>，阿拉斯加采用 <b>EPSG:3338</b>，夏威夷采用 <b>Hawaii Albers</b>，
                    统一划分为中心距 25 km（单格面积 <b>541.3 km²</b>）的 <b>{meta.hex_count.toLocaleString()}</b> 块平面等面积正六边形，并依据 NOAA ETOPO1 映射真实海拔与地貌分级。
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    t: L('💰 金币 = 真实 GDP', '💰 Gold = Real GDP'),
                    d: L(
                      '直接源自 BEA CAGDP2 县/都会区真实生产总值；都会区横幅与城市视图中的每 +1 金币等价于 $10 亿美元真实年度 GDP。',
                      'Sourced directly from BEA CAGDP2 county & metro GDP; each +1 Gold on city banners and command cards equals $1 billion in annual current-dollar GDP.',
                    ),
                  },
                  {
                    t: L('🏛️ 特色城区 = 真实产业区位商 (LQ)', '🏛️ Specialized Districts = Industry Location Quotient (LQ)'),
                    d: L(
                      '通过 BLS QCEW 2025 企业岗位计算各产业相对全美的区位商 LQ，自动为 524 座城市在周边真实地块修建学院、汽车城、金融交易所、能源中心等 10 类城区。',
                      'Computed from BLS QCEW 2025 employer payroll jobs relative to the U.S. baseline, automatically placing 10 specialized district archetypes (Campuses, Foundries, Exchanges, Refineries, etc.) onto real hexes.',
                    ),
                  },
                  {
                    t: L('🧑 16 人偶市民 = 真实劳动力结构', '🧑 16-Meeple Citizens = Real Workforce Mix'),
                    d: L(
                      '基于 ACS 1-Year C24010 职业统计，将每座城市劳动力精确映射为 16 枚 Isotype 木棋人偶（例如圣何塞每 4 人有 1 名 STEM 人才，全美均值每 14 人 1 名）。',
                      'Powered by ACS 1-Year C24010 occupation counts, mapping each metro’s workforce into 16 Isotype meeples (e.g. 1 in 4 workers in San Jose are in STEM vs. 1 in 14 nationally).',
                    ),
                  },
                  {
                    t: L('🏛️ 公开规则奇观', '🏛️ Published-Rule Wonders'),
                    d: L(
                      '自然奇观严格按 NPS 2025 游客量排名；学术奇观严格按 NSF HERD FY2025 高校研发支出排名；历史地标全部锚定 NPS National Historic Landmarks GIS 真坐标。',
                      'Natural Wonders rank strictly by NPS 2025 recreation visits; Academic Wonders rank by NSF HERD FY2025 R&D spending; Historic Landmarks anchor to exact NPS NHL GIS coordinates.',
                    ),
                  },
                ].map((c) => (
                  <div key={c.t} className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/45">
                    <div className="font-display font-bold text-sm mb-1">{c.t}</div>
                    <p className="m-0 opacity-80">{c.d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {almanacTab === 'districts' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {meta.district_catalog.map((d) => {
                const loc = localizeDistrictCatalog(d, locale);
                return (
                  <div key={d.id} className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/45">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-3 h-3 rounded-sm" style={{ background: d.color }} />
                      <span className="font-display font-bold text-sm">{loc.name}</span>
                      <span className="text-[10.5px] opacity-60">{loc.sub}</span>
                    </div>
                    <div className="text-[11px] font-semibold opacity-85">{loc.naics}</div>
                    <div className="text-[10.5px] opacity-65 mt-1">{loc.rule}</div>
                  </div>
                );
              })}
            </div>
          )}

          {almanacTab === 'lenses' && (
            <div className="space-y-2">
              {meta.lenses.map((l, idx) => (
                <div key={l.id} className="p-3 rounded-xl border border-[var(--border-hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-xs">
                      {idx + 1}. {localizeLensName(l, locale)}{' '}
                      <span className="opacity-60 font-normal">
                        ({!isEn ? `${l.name_en} · ` : ''}{localizeLensUnit(l.unit, locale)})
                      </span>
                    </div>
                    <div className="text-[11px] opacity-75 mt-0.5">{localizeLensDesc(l, locale)}</div>
                  </div>
                  <span className="text-[10px] font-mono-num px-2 py-0.5 rounded bg-[var(--surface-paper-subtle)] shrink-0 self-start">
                    {L('源：', 'Source: ')}{l.source_id}
                  </span>
                </div>
              ))}
            </div>
          )}

          {almanacTab === 'sources' && (
            <div className="space-y-2.5">
              <div className="text-[11px] opacity-75">
                {isEn ? (
                  <>
                    The offline ETL pipeline independently downloads, parses, and reconciles all <b>{meta.sources.length}</b> official public datasets below (click any link to visit the original portal):
                  </>
                ) : (
                  <>
                    本项目的离线 ETL 管线独立下载、解析并核验了以下全部 <b>{meta.sources.length}</b> 项官方公开数据源（点击直达联邦或学术机构原始门户）：
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {meta.sources.map((s, idx) => (
                  <div key={s.id} className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/40 flex flex-col justify-between gap-1.5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono-num font-bold px-1.5 py-0.5 rounded bg-[var(--brass-soft)]" style={{ color: 'var(--brass)' }}>
                          #{String(idx + 1).padStart(2, '0')} · {catLabels[s.category] ?? s.category}
                        </span>
                        <span className="text-[10px] opacity-60">{s.vintage}</span>
                      </div>
                      <div className="font-bold text-xs mt-1.5">{s.title}</div>
                      <div className="text-[10.5px] opacity-70">{s.publisher}</div>
                      <div className="text-[10.5px] opacity-80 mt-1">{localizeSourceUsedFor(s.id, s.used_for, locale)}</div>
                    </div>
                    <a
                      href={s.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10.5px] font-semibold hover:underline mt-1"
                      style={{ color: 'var(--brass)' }}
                    >
                      {L('官方原始链接', 'Official Portal')} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const YieldReportModal: React.FC<{ cities: CityRecord[]; states: StateRecord[] }> = ({ cities, states }) => {
  const { L } = useL();
  const { yieldReportOpen, setYieldReportOpen, openCity, openState } = useAppStore();
  if (!yieldReportOpen) return null;

  const topGdpCities = [...cities].sort((a, b) => (b.gdp_musd ?? 0) - (a.gdp_musd ?? 0)).slice(0, 15);
  const topStemCities = [...cities].filter((c) => c.pop >= 250000).sort((a, b) => b.workforce.stem_share - a.workforce.stem_share).slice(0, 15);
  const topStates = [...states].sort((a, b) => b.gdp_musd - a.gdp_musd).slice(0, 15);

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-3" onClick={() => setYieldReportOpen(false)}>
      <div className="atlas-panel-brass w-[min(940px,96vw)] max-h-[82vh] rounded-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between bg-[var(--surface-paper-subtle)]/75">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" style={{ color: 'var(--brass)' }} />
            <h2 className="font-display text-base font-bold m-0">{L('联邦国家产出年鉴 · National Yield Ledger', 'National Yield Ledger')}</h2>
          </div>
          <button onClick={() => setYieldReportOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <h3 className="font-display text-xs font-bold mb-2 pb-1 border-b border-[var(--border-hairline)]">
              {L('💰 都会区 GDP Top 15', '💰 Top 15 Metros by GDP')}
            </h3>
            {topGdpCities.map((c, i) => (
              <button
                key={c.id}
                onClick={() => openCity(c.id)}
                className="w-full flex justify-between px-2 py-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer text-left"
              >
                <span className="truncate pr-2"><b className="opacity-50 font-mono-num mr-1">{i + 1}.</b>{c.short_name}, {c.state_abbr}</span>
                <span className="font-mono-num font-bold">${((c.gdp_musd ?? 0) / 1000).toFixed(0)}B</span>
              </button>
            ))}
          </div>
          <div>
            <h3 className="font-display text-xs font-bold mb-2 pb-1 border-b border-[var(--border-hairline)]">
              {L('🔬 科技 STEM 占比 Top 15 (25万+人)', '🔬 Top 15 STEM Share (250K+ Metros)')}
            </h3>
            {topStemCities.map((c, i) => (
              <button
                key={c.id}
                onClick={() => openCity(c.id)}
                className="w-full flex justify-between px-2 py-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer text-left"
              >
                <span className="truncate pr-2"><b className="opacity-50 font-mono-num mr-1">{i + 1}.</b>{c.short_name}, {c.state_abbr}</span>
                <span className="font-mono-num font-bold" style={{ color: 'var(--y-science)' }}>1/{c.workforce.stem_one_in} ({(c.workforce.stem_share * 100).toFixed(1)}%)</span>
              </button>
            ))}
          </div>
          <div>
            <h3 className="font-display text-xs font-bold mb-2 pb-1 border-b border-[var(--border-hairline)]">
              {L('🏛️ 联邦州 GDP Top 15', '🏛️ Top 15 States by GDP')}
            </h3>
            {topStates.map((s, i) => (
              <button
                key={s.fips}
                onClick={() => openState(s.fips)}
                className="w-full flex justify-between px-2 py-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer text-left"
              >
                <span className="truncate pr-2"><b className="opacity-50 font-mono-num mr-1">{i + 1}.</b>{s.name}</span>
                <span className="font-mono-num font-bold">${(s.gdp_musd / 1000).toFixed(0)}B</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const HelpModal: React.FC = () => {
  const { isEn, L } = useL();
  const { helpOpen, setHelpOpen, setAlmanacOpen } = useAppStore();
  if (!helpOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const modKey = isMac ? '⌘ K' : 'Ctrl K';

  const columns: { heading: string; rows: { keys: string[]; desc: string }[] }[] = [
    {
      heading: L('移动与缩放', 'MOVE'),
      rows: [
        { keys: [L('拖拽', 'Drag'), '←↑→↓', 'WASD'], desc: L('平移地图', 'Pan the map') },
        { keys: [L('滚轮', 'Scroll'), '+', '–'], desc: L('放大与缩小', 'Zoom in and out') },
        { keys: [L('双击', 'Double-click')], desc: L('放大该位置', 'Zoom in on a spot') },
        { keys: [L('双指', 'Two fingers')], desc: L('捏合缩放、拖拽平移（触控）', 'Pinch to zoom, drag to pan (touch)') },
        { keys: [L('小地图', 'Minimap')], desc: L('点击或拖拽快速跳转', 'Click or drag to jump') },
      ],
    },
    {
      heading: L('探索与视角', 'EXPLORE'),
      rows: [
        { keys: [L('点击城市', 'Click city')], desc: L('打开都会区指挥视图', 'Open the city screen') },
        { keys: [L('点击陆地', 'Click land')], desc: L('打开所属州总览', 'Open that state') },
        { keys: ['/', modKey], desc: L('搜索城市与州', 'Search cities and states') },
        { keys: ['L', 'Shift L'], desc: L('切换下一个 / 上一个视角', 'Next / previous lens') },
        { keys: [L('图例', 'Legend')], desc: L('悬停或拖拽色阶仅显示该区间', 'Hover or drag the scale to show only that range') },
        { keys: ['R'], desc: L('显示或隐藏资源节点', 'Show or hide resources') },
      ],
    },
    {
      heading: L('面板与弹窗', 'PANELS'),
      rows: [
        { keys: ['?'], desc: L('打开或关闭本帮助', 'This help') },
        { keys: ['Esc'], desc: L('依次关闭帮助、搜索、百科与侧边面板', 'Close help, search, Almanac, then the panel') },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-3"
      onClick={() => setHelpOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="atlas-panel-brass w-[min(740px,94vw)] rounded-2xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 mb-4">
          <h2 id="help-title" className="font-display text-lg font-bold tracking-wider uppercase m-0 flex items-center gap-2.5" style={{ color: 'var(--brass-bright)' }}>
            <span className="font-serif text-xl leading-none opacity-85">?</span>
            <span>{L('快捷键与操作指南', 'CONTROLS')}</span>
          </h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            aria-label={L('关闭帮助', 'Close help')}
            className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-[var(--surface-paper-hover)] transition cursor-pointer"
            style={{ borderColor: 'var(--brass)', color: 'var(--brass-bright)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {columns.map((col) => (
            <section key={col.heading} className="space-y-3">
              <h3
                className="text-[11px] font-bold tracking-[0.12em] uppercase pb-1.5 border-b m-0"
                style={{ color: 'var(--brass)', borderColor: 'var(--border-hairline)' }}
              >
                {col.heading}
              </h3>
              <div className="space-y-2.5">
                {col.rows.map((row) => (
                  <div key={row.keys.join('+')} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.keys.map((k) => (
                        <kbd
                          key={k}
                          className="font-mono-num text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-paper-subtle)] border border-[var(--border-strong)] leading-tight"
                          style={{ color: 'var(--brass-bright)' }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                    <div className="text-[12px] leading-snug opacity-85">{row.desc}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="text-[11.5px] opacity-75 mt-5 pt-3.5 border-t border-[var(--border-hairline)] mb-0 leading-relaxed">
          {isEn ? (
            <>
              Every number traces back to public data: open the{' '}
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(false);
                  setAlmanacOpen(true, 'sources');
                }}
                className="font-bold underline hover:opacity-100 cursor-pointer"
                style={{ color: 'var(--brass-bright)' }}
              >
                Almanac
              </button>{' '}
              for sources. The link in the address bar always reopens this exact view.
            </>
          ) : (
            <>
              所有数值均可追溯至公开数据：打开{' '}
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(false);
                  setAlmanacOpen(true, 'sources');
                }}
                className="font-bold underline hover:opacity-100 cursor-pointer"
                style={{ color: 'var(--brass-bright)' }}
              >
                百科
              </button>{' '}
              查看全部 31 项数据源。地址栏链接可随时复现当前视图。
            </>
          )}
        </p>
      </div>
    </div>
  );
};
