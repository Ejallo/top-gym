import { num, t } from '../i18n';
import { isWork, type Workout } from './db';
import { fmt, isoWeek } from './dates';
import type { Exercise } from './exercises';
import { MUSCLES, type Muscle } from './muscles';
import { addDays, e1rm, weekStartOf } from './stats';
import { setLabel } from '../components/ExerciseProgress';

export interface ExerciseCompare {
  ex: Exercise;
  best: string; // best set this week
  prev?: string; // best set last week
  trend: 'up' | 'down' | 'same' | 'new';
}

export interface WeekReport {
  start: number;
  end: number; // exclusive
  week: number;
  workouts: Workout[];
  goal: number;
  minutes: number;
  volume: number;
  prevVolume: number;
  compare: ExerciseCompare[];
  muscles: { m: Muscle; sets: number }[];
  notes: { date: number; title: string; text: string }[];
  strength: number; // strength workouts (count toward the goal)
  mobility: number; // stretching/yoga sessions
}

/** Score of a set for "best set" comparisons: e1RM for weighted sets, else reps/time/distance. */
function score(s: { weight?: number; reps?: number; time?: number; distance?: number }, type: Exercise['type']): number {
  if (type === 'weight_reps') return s.weight && s.reps ? e1rm(s.weight, s.reps) : 0;
  if (type === 'reps') return s.reps ?? 0;
  if (type === 'time') return s.time ?? 0;
  return s.distance ?? s.time ?? 0;
}

function bestSet(ws: Workout[], ex: Exercise) {
  let best: { s: Workout['entries'][number]['sets'][number]; v: number } | undefined;
  for (const w of ws)
    for (const e of w.entries)
      if (e.exerciseId === ex.id)
        for (const s of e.sets)
          if (isWork(s)) {
            const v = score(s, ex.type);
            if (!best || v > best.v) best = { s, v };
          }
  return best;
}

const volumeOf = (ws: Workout[]) =>
  Math.round(ws.reduce((a, w) => a + w.entries.reduce((b, e) => b + e.sets.reduce((c, s) => c + (isWork(s) ? (s.weight ?? 0) * (s.reps ?? 0) : 0), 0), 0), 0));

/** Collects everything about the week that starts on Monday `start`. */
export function buildReport(all: Workout[], byId: Map<string, Exercise>, start: number, goal: number): WeekReport {
  const end = addDays(start, 7);
  const prevStart = addDays(start, -7);
  const inWeek = all.filter((w) => w.endedAt && w.startedAt >= start && w.startedAt < end).sort((a, b) => a.startedAt - b.startedAt);
  const prevWeek = all.filter((w) => w.endedAt && w.startedAt >= prevStart && w.startedAt < start);

  // Best sets and muscle sets come from strength work; stretching/yoga is listed but not compared
  const strength = inWeek.filter((w) => w.kind !== 'mobility');
  const ids = [...new Set(strength.flatMap((w) => w.entries.filter((e) => e.sets.some(isWork)).map((e) => e.exerciseId)))];
  const compare: ExerciseCompare[] = [];
  for (const id of ids) {
    const ex = byId.get(id);
    if (!ex) continue;
    const now = bestSet(inWeek, ex);
    if (!now) continue;
    const before = bestSet(prevWeek, ex);
    const trend = !before ? 'new' : now.v > before.v * 1.001 ? 'up' : now.v < before.v * 0.999 ? 'down' : 'same';
    compare.push({ ex, best: setLabel(now.s, ex.type), prev: before && setLabel(before.s, ex.type), trend });
  }

  const sets = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const w of strength)
    for (const e of w.entries) {
      const ex = byId.get(e.exerciseId);
      if (ex) ex.muscles.forEach((m) => (sets[m] += e.sets.filter(isWork).length));
    }

  const notes = inWeek.flatMap((w) => [
    ...(w.note ? [{ date: w.startedAt, title: w.title, text: w.note }] : []),
    ...w.entries.filter((e) => e.note).map((e) => ({ date: w.startedAt, title: byId.get(e.exerciseId)?.name ?? '', text: e.note! })),
  ]);

  return {
    start,
    end,
    week: isoWeek(new Date(start)),
    workouts: inWeek,
    goal,
    minutes: Math.round(inWeek.reduce((a, w) => a + ((w.endedAt ?? w.startedAt) - w.startedAt), 0) / 60000),
    volume: volumeOf(inWeek),
    prevVolume: volumeOf(prevWeek),
    compare,
    muscles: MUSCLES.filter((m) => sets[m] > 0)
      .map((m) => ({ m, sets: sets[m] }))
      .sort((a, b) => b.sets - a.sets),
    notes,
    strength: strength.length,
    mobility: inWeek.length - strength.length,
  };
}

export const thisWeekStart = () => weekStartOf(Date.now());

export function volumeChange(r: WeekReport): number | null {
  if (!r.prevVolume || !r.volume) return null;
  return Math.round(((r.volume - r.prevVolume) / r.prevVolume) * 100);
}

export function hoursMinutes(min: number): string {
  const h = Math.floor(min / 60);
  return h ? `${h}:${String(min % 60).padStart(2, '0')}` : `${min} ${t('unit.min')}`;
}

/** Markdown for Claude: the week in detail plus a request for a short review. */
export function reportMarkdown(r: WeekReport, byId: Map<string, Exercise>): string {
  const d = (ms: number, o: Intl.DateTimeFormatOptions) => fmt(new Date(ms), o);
  const range = `${d(r.start, { day: 'numeric', month: 'long' })} – ${d(addDays(r.end, -1), { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const change = volumeChange(r);
  const lines: string[] = [];
  lines.push(`# ${t('report.md.title', { week: r.week, range })}`);
  lines.push(
    t('report.md.summary', {
      done: r.strength,
      goal: r.goal,
      time: hoursMinutes(r.minutes),
      volume: num(r.volume),
      change: change === null ? '' : ` (${change > 0 ? '+' : ''}${change}% ${t('report.md.vsPrev')})`,
    }),
  );
  if (r.mobility) lines.push(t('report.md.mobility', { n: r.mobility }));
  lines.push('', `## ${t('report.md.workouts')}`);
  for (const w of r.workouts) {
    const parts = w.entries
      .map((e) => {
        const ex = byId.get(e.exerciseId);
        const sets = e.sets.filter(isWork).map((s) => setLabel(s, ex?.type ?? 'weight_reps') + (s.effort ? ` @${s.effort}` : '') + (s.comment ? ` «${s.comment}»` : ''));
        return sets.length ? `${ex?.name ?? e.exerciseId}${ex?.side ? ` (${t(`side.${ex.side}`)})` : ''}: ${sets.join(', ')}` : '';
      })
      .filter(Boolean);
    const mins = Math.round(((w.endedAt ?? w.startedAt) - w.startedAt) / 60000);
    lines.push(`- ${d(w.startedAt, { weekday: 'short', day: '2-digit', month: '2-digit' })} «${w.title}», ${mins} ${t('unit.min')}: ${parts.join('; ')}`);
  }
  if (r.workouts.some((w) => w.entries.some((e) => e.sets.some((s) => isWork(s) && s.effort)))) lines.push(t('report.md.effort'));
  if (r.compare.length) {
    lines.push('', `## ${t('report.md.compare')}`);
    for (const c of r.compare) {
      const arrow = { up: '▲', down: '▼', same: '=', new: '★' }[c.trend];
      lines.push(`- ${c.ex.name}: ${c.best}${c.prev ? ` (${t('report.md.was')} ${c.prev})` : ` (${t('report.new')})`} ${arrow}`);
    }
  }
  if (r.muscles.length) {
    lines.push('', `## ${t('report.md.muscles')}`);
    lines.push(r.muscles.map((x) => `${t(`muscle.${x.m}`)} ${x.sets}`).join(', '));
  }
  if (r.notes.length) {
    lines.push('', `## ${t('report.md.notes')}`);
    for (const n of r.notes) lines.push(`- ${d(n.date, { day: '2-digit', month: '2-digit' })} ${n.title}: ${n.text}`);
  }
  lines.push('', t('report.md.ask'));
  return lines.join('\n');
}
