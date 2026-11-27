import type { Locale } from '../types/world';

export const LOCALE_STORAGE_KEY = 'terra_americana_locale';

export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh';
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const fromHash = hash.get('lang');
    if (fromHash === 'en' || fromHash === 'zh') return fromHash;
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // ignore storage/hash errors
  }
  return 'zh';
}

export function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  document.title =
    locale === 'en'
      ? 'TERRA AMERICANA — U.S. 4X Strategy Atlas Powered by 31 Federal Datasets'
      : '联邦六角志 · TERRA AMERICANA — 基于 31 项真实公开数据的美国文明策略沙盘';
  const desc = document.querySelector('meta[name="description"]');
  if (desc) {
    desc.setAttribute(
      'content',
      locale === 'en'
        ? 'An interactive 25 km equal-area hexagonal 4X strategy atlas of the United States powered by 31 official federal and academic datasets: 19 data lenses, 524+ metro command views, 9 advisors, and a 3,100+ county explorer.'
        : '以 31 项美国联邦及学术真实公开数据驱动的 25 km 等面积六边形 4X 策略沙盘：19 种数据视角、524 个都会区城市指挥视图、9 位顾问与 3,100+ 县全维探索器。',
    );
  }
}
