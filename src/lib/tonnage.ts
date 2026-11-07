import { t, num } from '../i18n';
import type { Key } from '../i18n/ru';

// Fun comparison for a workout's tonnage: "12 400 kg ≈ 2 elephants".
// Weights are rounded typical values, the UI marks the result as approximate.

export interface TonnageThing {
  id: string; // i18n key suffix: 'ton.<id>'
  kg: number;
  emoji: string;
}

export const THINGS: TonnageThing[] = [
  { id: 'fridge', kg: 70, emoji: '🧊' },
  { id: 'bear', kg: 450, emoji: '🐻‍❄️' },
  { id: 'piano', kg: 500, emoji: '🎹' },
  { id: 'cow', kg: 600, emoji: '🐄' },
  { id: 'giraffe', kg: 1000, emoji: '🦒' },
  { id: 'car', kg: 1500, emoji: '🚗' },
  { id: 'hippo', kg: 1500, emoji: '🦛' },
  { id: 'elephant', kg: 6000, emoji: '🐘' },
  { id: 'trex', kg: 8000, emoji: '🦖' },
  { id: 'bus', kg: 12000, emoji: '🚌' },
  { id: 'boeing', kg: 41000, emoji: '✈️' },
  { id: 'whale', kg: 150000, emoji: '🐋' },
];

export interface Comparison {
  thing: TonnageThing;
  count: number;
}

/** Below 10 rounds to halves (2,5 elephants), above to whole things. */
export function roundCount(x: number): number {
  return x < 10 ? Math.round(x * 2) / 2 : Math.round(x);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Picks a thing that gives a readable count (1..20). The choice is stable per seed
 * (workout id), so reopening a workout shows the same comparison.
 */
export function compareTonnage(kg: number, seed: string): Comparison | null {
  if (kg <= 0) return null;
  // Readable count (1..20) and rounding off by at most 10%; looser fallback if nothing is that close
  const inRange = THINGS.filter((x) => kg / x.kg >= 1 && roundCount(kg / x.kg) <= 20);
  const close = inRange.filter((x) => Math.abs(roundCount(kg / x.kg) - kg / x.kg) / (kg / x.kg) <= 0.1);
  const fits = close.length ? close : inRange;
  if (fits.length === 0) return null;
  const thing = fits[hash(seed) % fits.length];
  return { thing, count: roundCount(kg / thing.kg) };
}

/** "≈ 2 слона 🐘" in the UI language, or '' when nothing fits. */
export function tonnageText(kg: number, seed: string): string {
  const c = compareTonnage(kg, seed);
  if (!c) return '';
  const what = t(('ton.' + c.thing.id) as Key, { n: c.count });
  return `${t('ton.line', { n: num(c.count), what })} ${c.thing.emoji}`;
}
