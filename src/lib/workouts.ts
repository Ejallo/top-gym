import { useEffect, useState } from 'react';
import { db, uid, type ExerciseType, type PlanItem, type SetEntry, type Template, type Workout, type WorkoutEntry } from './db';
import type { Exercise } from './exercises';

/** First number of a reps target: '8-12' → 8, '10' → 10. */
export function repsFloor(reps?: string): number | undefined {
  const m = reps?.match(/\d+/);
  return m ? Number(m[0]) : undefined;
}

/** Empty sets for a plan item. Values stay empty: the plan shows as placeholders until the set is ticked. */
export function entryFromPlan(item: PlanItem): WorkoutEntry {
  const n = Math.max(1, Math.min(20, item.sets || 1));
  return {
    exerciseId: item.exerciseId,
    rest: item.rest,
    note: item.note,
    plan: { sets: n, reps: item.reps, weight: item.weight, time: item.time, distance: item.distance },
    sets: Array.from({ length: n }, () => ({ done: false })),
  };
}

export function entryFor(exerciseId: string, rest?: string): WorkoutEntry {
  return { exerciseId, rest, sets: [{ done: false }] };
}

export async function activeWorkout(): Promise<Workout | undefined> {
  // endedAt is undefined for the running one; Dexie can't index undefined, so filter
  return (await db.workouts.orderBy('startedAt').reverse().toArray()).find((w) => !w.endedAt);
}

export async function startWorkout(title: string, template?: Template): Promise<Workout> {
  const running = await activeWorkout();
  if (running) return running;
  const w: Workout = {
    id: uid('w_'),
    title,
    templateId: template?.id,
    startedAt: Date.now(),
    entries: template ? template.items.map(entryFromPlan) : [],
  };
  await db.workouts.put(w);
  return w;
}

/** Fills a ticked set with the plan values the user left empty. */
export function fillFromPlan(set: SetEntry, entry: WorkoutEntry, type: ExerciseType, prev?: SetEntry): SetEntry {
  const p = entry.plan;
  const s = { ...set };
  if (type === 'weight_reps') {
    s.weight ??= prev?.weight ?? p?.weight;
    s.reps ??= prev?.reps ?? repsFloor(p?.reps);
  } else if (type === 'reps') {
    s.reps ??= prev?.reps ?? repsFloor(p?.reps);
  } else if (type === 'time') {
    s.time ??= prev?.time ?? p?.time;
  } else {
    s.time ??= prev?.time ?? p?.time;
    s.distance ??= prev?.distance ?? p?.distance;
  }
  return s;
}

export interface Totals {
  exercises: number;
  sets: number;
  volume: number; // kg × reps over done sets
  durationMs: number;
}

export function totals(w: Workout): Totals {
  let sets = 0;
  let volume = 0;
  for (const e of w.entries)
    for (const s of e.sets)
      if (s.done) {
        sets++;
        if (s.weight && s.reps) volume += s.weight * s.reps;
      }
  return {
    exercises: w.entries.filter((e) => e.sets.some((s) => s.done)).length,
    sets,
    volume: Math.round(volume),
    durationMs: (w.endedAt ?? Date.now()) - w.startedAt,
  };
}

/** 1:05:09 or 34:12 */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return (h ? `${h}:` : '') + `${mm}:${String(sec).padStart(2, '0')}`;
}

/** Minutes, rounded: for summaries. */
export function minutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60000));
}

/** Re-renders every `ms` while mounted. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Plan hint like '4 × 8-12 · 70 кг'. */
export function planText(entry: WorkoutEntry, ex: Exercise | undefined, units: { kg: string; min: string; km: string; sec: string }): string {
  const p = entry.plan;
  if (!p) return '';
  const parts = [`${p.sets} × ${p.reps ?? (p.time ? `${p.time} ${units.sec}` : '—')}`];
  if (p.weight) parts.push(`${p.weight} ${units.kg}`);
  if (ex?.type === 'cardio' && p.distance) parts.push(`${p.distance} ${units.km}`);
  return parts.join(' · ');
}
