import { useAppStore } from '../store/useAppStore';
import type { Locale } from '../types/world';

export type { Locale };
export * from './localeUtils';
export * from './dataL10n';

export function pick<T>(locale: Locale, zh: T, en: T): T {
  return locale === 'en' ? en : zh;
}

export function useLocale(): Locale {
  return useAppStore((s) => s.locale);
}

export function useL() {
  const locale = useAppStore((s) => s.locale);
  const isEn = locale === 'en';
  const L = <T,>(zh: T, en: T): T => (isEn ? en : zh);
  return { locale, isEn, L };
}
