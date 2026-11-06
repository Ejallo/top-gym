import { ru, type Key } from './ru';

export type Lang = 'ru';

// Dictionaries by language. German ('de') joins later as Partial<Record<Key, string>>,
// missing keys fall back to Russian.
const dicts: Record<Lang, Partial<Record<Key, string>>> = { ru };

export const LANGS: { id: Lang; label: string; locale: string }[] = [{ id: 'ru', label: 'Русский', locale: 'ru-RU' }];

let lang: Lang = (localStorage.getItem('lang') as Lang) || 'ru';
if (!dicts[lang]) lang = 'ru';

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  lang = next;
  localStorage.setItem('lang', next);
  location.reload();
}

/** Locale for Intl date/number formatting. */
export function locale(): string {
  return LANGS.find((l) => l.id === lang)?.locale ?? 'ru-RU';
}

/** Translates a key; {name} placeholders are filled from vars. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? ru[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Translates a key built at runtime (e.g. 'eq.' + equipment); unknown keys return the fallback. */
export function tk(key: string, fallback = key): string {
  return dicts[lang][key as Key] ?? (ru as Record<string, string>)[key] ?? fallback;
}

/** Text in the user's language from a per-language map (exercise names etc.). */
export function pick(m: Partial<Record<Lang, string>> & { ru: string }): string {
  return m[lang] ?? m.ru;
}
