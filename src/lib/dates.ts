import { locale } from '../i18n';

/** ISO week number (weeks start on Monday). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** 1 = Monday … 7 = Sunday */
export function weekday(d: Date): number {
  return d.getDay() || 7;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Short weekday names Monday-first in the UI language. */
export function weekdayNames(): string[] {
  const fmt = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
  // 2024-01-01 is a Monday
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)).replace('.', ''));
}

/** Month grid cells, Monday-first: null for blanks before the 1st. */
export function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(weekday(first) - 1).fill(null);
  for (let i = 1; i <= days; i++) cells.push(new Date(year, month, i));
  return cells;
}

export function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale(), opts).format(d);
}
