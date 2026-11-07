import { ru, type Key } from './ru';
import { de } from './de';

export type Lang = 'ru' | 'de';

// Dictionaries by language; a missing key falls back to Russian. Russian is the default.
const dicts: Record<Lang, Partial<Record<Key, string>>> = { ru, de };

export const LANGS: { id: Lang; label: string; locale: string }[] = [
  { id: 'ru', label: 'Русский', locale: 'ru-RU' },
  { id: 'de', label: 'Deutsch', locale: 'de-DE' },
];

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
  let s: string = dicts[lang][key] ?? ru[key];
  // Plural forms 'one|few|many|other' are picked by vars.n through Intl.PluralRules
  if (s.includes('|') && typeof vars?.n === 'number') {
    const forms = s.split('|');
    const order = ['one', 'few', 'many', 'other'];
    const cat = new Intl.PluralRules(locale()).select(vars.n);
    s = forms[order.indexOf(cat)] ?? forms[forms.length - 1];
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Number in the UI locale: 62,5 · 1 240 */
export function num(n: number): string {
  return n.toLocaleString(locale(), { maximumFractionDigits: 2 });
}

/** Translates a key built at runtime (e.g. 'eq.' + equipment); unknown keys return the fallback. */
export function tk(key: string, fallback = key): string {
  return dicts[lang][key as Key] ?? (ru as Record<string, string>)[key] ?? fallback;
}

/** Text in the user's language from a per-language map (exercise names etc.). */
export function pick(m: Partial<Record<Lang, string>> & { ru: string }): string {
  return m[lang] ?? m.ru;
}
