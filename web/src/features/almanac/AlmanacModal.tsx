import React from 'react';
import { BookOpen, ExternalLink, Keyboard, Trophy, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { CityRecord, StateRecord, WorldMeta } from '../../types/world';

interface AlmanacModalProps {
  meta: WorldMeta;
}

const CAT_LABELS: Record<string, string> = {
  geo: '基础地理与地貌',
  people: '人口、健康与信仰',
  economy: '经济、产业与货运',
  energy: '能源电力与矿产',
  wonders: '科研高校与奇观',
  military: '国防与军事',
  hazards: '气候灾害风险',
};

export const AlmanacModal: React.FC<AlmanacModalProps> = ({ meta }) => {
  const { almanacOpen, almanacTab, setAlmanacOpen } = useAppStore();
  if (!almanacOpen) return null;

  const tabs = [
    { id: 'about', label: '玩法与公式' },
    { id: 'districts', label: '10 类产业城区' },
    { id: 'lenses', label: '19 种视角口径' },
    { id: 'sources', label: `全部 ${meta.sources.length} 项公开数据源` },
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
              <h2 className="font-display text-base font-bold m-0">联邦百科全书 · Federal Almanac</h2>
              <p className="text-[11px] opacity-65 m-0">所有策略数值背后均可追溯至美国联邦与学术机构的公开原始数据，绝无虚构与插补</p>
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
                <h3 className="font-display text-sm font-bold m-0 mb-1.5">25 km 等面积六边形空间底盘（含阿拉斯加与夏威夷黄铜插图框）</h3>
                <p className="m-0 opacity-90">
                  全美本土采用北美官方等面积投影 <b>NAD83 / Conus Albers (EPSG:5070)</b>，阿拉斯加采用 <b>EPSG:3338</b>，夏威夷采用 <b>Hawaii Albers</b>，
                  统一划分为中心距 25 km（单格面积 <b>541.3 km²</b>）的 <b>{meta.hex_count.toLocaleString()}</b> 块正六边形，并依据 NOAA ETOPO1 真实海拔进行 2.5D 物理挤压与西北日光晕渲。
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { t: '💰 金币 = 真实 GDP', d: '直接源自 BEA CAGDP2 县/都会区真实生产总值；都会区横幅与城市视图中的每 +1 金币等价于 $10 亿美元真实年度 GDP。' },
                  { t: '🏛️ 特色城区 = 真实产业区位商 (LQ)', d: '通过 BLS QCEW 2025 企业岗位计算各产业相对全美的区位商 LQ，自动为 524 座城市在周边真实地块修建学院、汽车城、金融交易所、能源中心等 10 类城区。' },
                  { t: '🧑 16 人偶市民 = 真实劳动力结构', d: '基于 ACS 1-Year C24010 职业统计，将每座城市劳动力精确映射为 16 枚 Isotype 木棋人偶（例如圣何塞每 4 人有 1 名 STEM 人才，全美均值每 14 人 1 名）。' },
                  { t: '🏛️ 公开规则奇观', d: '自然奇观严格按 NPS 2025 游客量排名；学术奇观严格按 NSF HERD FY2025 高校研发支出排名；历史地标全部锚定 NPS National Historic Landmarks GIS 真坐标。' },
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
              {meta.district_catalog.map((d) => (
                <div key={d.id} className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/45">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: d.color }} />
                    <span className="font-display font-bold text-sm">{d.name}</span>
                    <span className="text-[10.5px] opacity-60">{d.name_en}</span>
                  </div>
                  <div className="text-[11px] font-semibold opacity-85">{d.naics_label}</div>
                  <div className="text-[10.5px] opacity-65 mt-1">{d.rule}</div>
                </div>
              ))}
            </div>
          )}

          {almanacTab === 'lenses' && (
            <div className="space-y-2">
              {meta.lenses.map((l, idx) => (
                <div key={l.id} className="p-3 rounded-xl border border-[var(--border-hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-xs">
                      {idx + 1}. {l.name} <span className="opacity-60 font-normal">({l.name_en} · {l.unit})</span>
                    </div>
                    <div className="text-[11px] opacity-75 mt-0.5">{l.description}</div>
                  </div>
                  <span className="text-[10px] font-mono-num px-2 py-0.5 rounded bg-[var(--surface-paper-subtle)] shrink-0 self-start">
                    源：{l.source_id}
                  </span>
                </div>
              ))}
            </div>
          )}

          {almanacTab === 'sources' && (
            <div className="space-y-2.5">
              <div className="text-[11px] opacity-75">
                本项目的离线 ETL 管线独立下载、解析并核验了以下全部 <b>{meta.sources.length}</b> 项官方公开数据源（点击直达联邦或学术机构原始门户）：
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {meta.sources.map((s, idx) => (
                  <div key={s.id} className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-paper-subtle)]/40 flex flex-col justify-between gap-1.5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono-num font-bold px-1.5 py-0.5 rounded bg-[var(--brass-soft)]" style={{ color: 'var(--brass)' }}>
                          #{String(idx + 1).padStart(2, '0')} · {CAT_LABELS[s.category] ?? s.category}
                        </span>
                        <span className="text-[10px] opacity-60">{s.vintage}</span>
                      </div>
                      <div className="font-bold text-xs mt-1.5">{s.title}</div>
                      <div className="text-[10.5px] opacity-70">{s.publisher}</div>
                      <div className="text-[10.5px] opacity-80 mt-1">{s.used_for}</div>
                    </div>
                    <a
                      href={s.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10.5px] font-semibold hover:underline mt-1"
                      style={{ color: 'var(--brass)' }}
                    >
                      官方原始链接 <ExternalLink className="w-3 h-3" />
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
            <h2 className="font-display text-base font-bold m-0">联邦国家产出年鉴 · National Yield Ledger</h2>
          </div>
          <button onClick={() => setYieldReportOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-paper-hover)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <h3 className="font-display text-xs font-bold mb-2 pb-1 border-b border-[var(--border-hairline)]">💰 都会区 GDP Top 15</h3>
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
            <h3 className="font-display text-xs font-bold mb-2 pb-1 border-b border-[var(--border-hairline)]">🔬 科技 STEM 占比 Top 15 (25万+人)</h3>
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
            <h3 className="font-display text-xs font-bold mb-2 pb-1 border-b border-[var(--border-hairline)]">🏛️ 联邦州 GDP Top 15</h3>
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
  const { helpOpen, setHelpOpen } = useAppStore();
  if (!helpOpen) return null;
  const keys = [
    ['拖拽地图 / 滚轮', '平移与无级缩放 2.5D 六边形沙盘（含阿拉斯加与夏威夷插图框）'],
    ['点击城市横幅 / 地块', '打开《都会区指挥视图》或所属联邦州总览'],
    ['/ 或 ⌘K', '全局模糊搜索 524 座都会区、51 个州与全部奇观'],
    ['L', '顺次循环切换 19 种真实数据视角'],
    ['R', '一键显隐 EIA 发电厂菱形灯塔、MSHA 矿石晶体与页岩油气纹'],
    ['T', '切换 WPA 日光羊皮纸版画 / 战情室黄铜夜色双主题'],
    ['Esc', '关闭当前弹窗或退出城市/顾问/探索器面板并恢复视野'],
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-3" onClick={() => setHelpOpen(false)}>
      <div className="atlas-panel-brass w-[min(460px,94vw)] rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[var(--border-hairline)]">
          <span className="font-display text-sm font-bold flex items-center gap-2">
            <Keyboard className="w-4 h-4" style={{ color: 'var(--brass)' }} /> 快捷键与操作指南
          </span>
          <button onClick={() => setHelpOpen(false)} className="p-1 rounded hover:bg-[var(--surface-paper-hover)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 text-xs">
          {keys.map(([k, desc]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <kbd className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded bg-[var(--surface-paper-subtle)] border border-[var(--border-hairline)] shrink-0">{k}</kbd>
              <span className="opacity-80 text-right">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
