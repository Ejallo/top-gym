import { useEffect, useState } from 'react';
import { db, isWork, uid, type ExerciseType, type PlanItem, type SetEntry, type Template, type Workout, type WorkoutEntry } from './db';
import type { Exercise } from './exercises';
import { t } from '../i18n';

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

/**
 * Fills an empty set when it is ticked: previous set of this workout, then the plan,
 * then the same set of the last session (`last`).
 */
export function fillFromPlan(set: SetEntry, entry: WorkoutEntry, type: ExerciseType, prev?: SetEntry, last?: SetEntry): SetEntry {
  const p = entry.plan;
  const s = { ...set };
  if (type === 'weight_reps') {
    s.weight ??= prev?.weight ?? p?.weight ?? last?.weight;
    s.reps ??= prev?.reps ?? repsFloor(p?.reps) ?? last?.reps;
  } else if (type === 'reps') {
    s.reps ??= prev?.reps ?? repsFloor(p?.reps) ?? last?.reps;
  } else if (type === 'time') {
    s.time ??= prev?.time ?? p?.time ?? last?.time;
  } else {
    s.time ??= prev?.time ?? p?.time ?? last?.time;
    s.distance ??= prev?.distance ?? p?.distance ?? last?.distance;
  }
  return s;
}

/**
 * Template items rebuilt from what was actually done: exercises swapped, added, removed or reordered
 * during the workout. Kept exercises keep their template item; new ones get sets/reps from their plan
 * (swap carries it over) or from the logged sets. Returns null when the exercise list matches the template.
 */
export function itemsFromWorkout(w: Workout, tpl: Template): PlanItem[] | null {
  // An exercise swapped away with some sets already done stays as its own entry: leave it out
  const entries = w.entries.filter((e, i) => !w.entries.some((x, j) => j > i && x.swappedFrom === e.exerciseId));
  const ids = entries.map((e) => e.exerciseId);
  if (!ids.length || ids.join('|') === tpl.items.map((x) => x.exerciseId).join('|')) return null;
  const pool = [...tpl.items];
  return entries.map((e) => {
    const k = pool.findIndex((x) => x.exerciseId === e.exerciseId);
    if (k >= 0) return pool.splice(k, 1)[0];
    const work = e.sets.filter((s) => !s.warmup);
    const first = work.find((s) => s.done) ?? work[0];
    const p = e.plan;
    return {
      exerciseId: e.exerciseId,
      sets: p?.sets ?? Math.max(1, work.length),
      reps: p?.reps ?? (first?.reps ? String(first.reps) : undefined),
      time: p?.time ?? first?.time,
      distance: p?.distance ?? first?.distance,
      rest: e.rest,
    };
  });
}

/**
 * Before finishing: if the exercise list differs from the template it came from, ask whether to keep
 * the new list for the next times. Mobility routines are left alone.
 */
export async function offerTemplateUpdate(w: Workout, ask: (name: string) => boolean): Promise<void> {
  if (!w.templateId || w.kind === 'mobility') return;
  const tpl = await db.templates.get(w.templateId);
  if (!tpl) return;
  const items = itemsFromWorkout(w, tpl);
  if (items && ask(tpl.name)) await db.templates.update(tpl.id, { items });
}

/** Finish a running workout from outside its screen (Home card): same checks as the Finish button. */
export async function finishWorkout(w: Workout): Promise<boolean> {
  if (totals(w).sets === 0 && !confirm(t('wk.finishEmpty'))) return false;
  await offerTemplateUpdate(w, (name) => confirm(t('wk.saveToPlan', { name })));
  await db.workouts.update(w.id, { endedAt: Date.now() });
  return true;
}

export interface Totals {
  exercises: number;
  sets: number; // working sets
  ticked: number; // all ticked sets incl. warm-up
  volume: number; // kg × reps over working sets
  durationMs: number;
}

export function totals(w: Workout): Totals {
  let sets = 0;
  let ticked = 0;
  let volume = 0;
  for (const e of w.entries)
    for (const s of e.sets) {
      if (s.done) ticked++;
      if (isWork(s)) {
        sets++;
        if (s.weight && s.reps) volume += s.weight * s.reps;
      }
    }
  return {
    exercises: w.entries.filter((e) => e.sets.some(isWork)).length,
    sets,
    ticked,
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
