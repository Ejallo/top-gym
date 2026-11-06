import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SetEntry, type Workout } from './db';
import type { Exercise } from './exercises';
import { MUSCLES, type Group, type Muscle } from './muscles';
import { weekday } from './dates';

const DAY = 86400000;

/** Epley one-rep max estimate. */
export const e1rm = (w: number, reps: number) => (reps <= 1 ? w : w * (1 + reps / 30));

export type Metric = 'weight' | 'e1rm' | 'volume' | 'reps' | 'time' | 'distance';

export interface Session {
  workoutId: string;
  date: number;
  sets: SetEntry[]; // done sets only
  weight: number; // heaviest set
  e1rm: number;
  volume: number;
  reps: number; // best reps in a set
  time: number; // best time, seconds
  distance: number; // total km
}

/** Every finished workout where the exercise has done sets, oldest first. */
export function sessionsFor(exerciseId: string, workouts: Workout[]): Session[] {
  const out: Session[] = [];
  for (const w of workouts) {
    if (!w.endedAt) continue;
    const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.done));
    if (!sets.length) continue;
    out.push({
      workoutId: w.id,
      date: w.startedAt,
      sets,
      weight: Math.max(0, ...sets.map((s) => s.weight ?? 0)),
      e1rm: Math.round(Math.max(0, ...sets.map((s) => (s.weight && s.reps ? e1rm(s.weight, s.reps) : 0))) * 10) / 10,
      volume: Math.round(sets.reduce((a, s) => a + (s.weight ?? 0) * (s.reps ?? 0), 0)),
      reps: Math.max(0, ...sets.map((s) => s.reps ?? 0)),
      time: Math.max(0, ...sets.map((s) => s.time ?? 0)),
      distance: Math.round(sets.reduce((a, s) => a + (s.distance ?? 0), 0) * 100) / 100,
    });
  }
  return out.sort((a, b) => a.date - b.date);
}

/** Metrics that make sense for an exercise type; the first is the default. */
export function metricsFor(type: Exercise['type']): Metric[] {
  if (type === 'weight_reps') return ['weight', 'e1rm', 'volume'];
  if (type === 'reps') return ['reps'];
  if (type === 'time') return ['time'];
  return ['distance', 'time'];
}

/**
 * Load per muscle over the last `days`: each done set adds 1 to its primary muscles
 * and 0.5 to secondary ones. Returned normalized to 0..1 by the busiest muscle.
 */
export function muscleLoad(workouts: Workout[], byId: Map<string, Exercise>, days = 7): Record<Muscle, number> {
  const since = Date.now() - days * DAY;
  const raw = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const w of workouts) {
    if (!w.endedAt || w.startedAt < since) continue;
    for (const e of w.entries) {
      const ex = byId.get(e.exerciseId);
      if (!ex) continue;
      const n = e.sets.filter((s) => s.done).length;
      ex.muscles.forEach((m) => (raw[m] += n));
      ex.secondary.forEach((m) => (raw[m] += n / 2));
    }
  }
  const max = Math.max(...Object.values(raw));
  if (max > 0) for (const m of MUSCLES) raw[m] = raw[m] / max;
  return raw;
}

/** Local midnight `n` calendar days after `ms` (DST-safe, unlike adding 24h). */
export function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/** Monday 00:00 of the week containing `ms`. */
export function weekStartOf(ms: number): number {
  return addDays(ms, -(weekday(new Date(ms)) - 1));
}

/** Finished workouts per week for the last `weeks` weeks, oldest first. */
export function weeklyCounts(workouts: Workout[], weeks = 8): { start: number; count: number }[] {
  const now = weekStartOf(Date.now());
  const out = Array.from({ length: weeks }, (_, i) => ({ start: addDays(now, -(weeks - 1 - i) * 7), count: 0 }));
  for (const w of workouts) {
    if (!w.endedAt) continue;
    const ws = weekStartOf(w.startedAt);
    const slot = out.find((o) => o.start === ws);
    if (slot) slot.count++;
  }
  return out;
}

/**
 * Weeks in a row that reached the goal. The current week counts once the goal is met;
 * an unfinished current week doesn't break the streak.
 */
export function weekStreak(workouts: Workout[], goal: number): number {
  const counts = new Map<number, number>();
  for (const w of workouts) if (w.endedAt) counts.set(weekStartOf(w.startedAt), (counts.get(weekStartOf(w.startedAt)) ?? 0) + 1);
  let ws = weekStartOf(Date.now());
  let streak = 0;
  if ((counts.get(ws) ?? 0) >= goal) streak++;
  ws = addDays(ws, -7);
  while ((counts.get(ws) ?? 0) >= goal) {
    streak++;
    ws = addDays(ws, -7);
  }
  return streak;
}

/** Group with the most done sets in a workout: colours its calendar day. */
export function dominantGroup(w: Workout, byId: Map<string, Exercise>): Group | undefined {
  const score = new Map<Group, number>();
  for (const e of w.entries) {
    const ex = byId.get(e.exerciseId);
    if (!ex) continue;
    const n = e.sets.filter((s) => s.done).length || 0.1;
    score.set(ex.group, (score.get(ex.group) ?? 0) + n);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function useFinishedWorkouts(): Workout[] | undefined {
  return useLiveQuery(async () => (await db.workouts.orderBy('startedAt').toArray()).filter((w) => w.endedAt), []);
}

const GOAL_KEY = 'weeklyGoal';
export function useWeeklyGoal(): [number, (n: number) => void] {
  const v = useLiveQuery(() => db.kv.get(GOAL_KEY), []);
  const goal = typeof v?.value === 'number' ? v.value : 3;
  return [goal, (n) => void db.kv.put({ key: GOAL_KEY, value: n })];
}
