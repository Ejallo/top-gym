import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type PlanItem, type Template, type Workout, type WorkoutEntry } from './db';
import type { Exercise } from './exercises';
import type { Muscle } from './muscles';
import { activeWorkout } from './workouts';
import { addDays, weekStartOf } from './stats';

/** Built-in stretching and yoga routines. Names and blurbs come from the dictionary: routine.<id>. */
export interface Routine {
  id: string;
  cat: 'stretch' | 'yoga';
  items: { id: string; time: number }[];
}

const r = (id: string, cat: Routine['cat'], items: [string, number][]): Routine => ({ id, cat, items: items.map(([id, time]) => ({ id, time })) });

export const ROUTINES: Routine[] = [
  r('morning', 'yoga', [['y_mountain', 20], ['y_forwardfold', 30], ['y_lowlunge', 30], ['y_downdog', 45], ['y_cobra', 30], ['y_child', 30], ['y_downdog', 30], ['y_warrior1', 30], ['y_warrior2', 30], ['y_tree', 30], ['y_mountain', 20]]),
  r('evening', 'yoga', [['y_child', 60], ['y_catcow', 45], ['y_pigeon', 45], ['y_seatedfold', 45], ['y_happybaby', 45], ['6sYyrRX', 45], ['bWlZvXh', 45], ['y_shavasana', 120]]),
  r('legs', 'stretch', [['0mB6wHO', 30], ['BWnJR72', 30], ['sU5BrfP', 30], ['DeDThfG', 30], ['QY39eBr', 30], ['m0tCHqc', 30]]),
  r('upper', 'stretch', [['Uto7l43', 30], ['f38OEuO', 30], ['xifhB5W', 30], ['Z5YStHW', 30], ['GSDioYu', 30], ['x2chWLO', 30]]),
  r('office', 'stretch', [['x2chWLO', 30], ['oQRJYkC', 30], ['GSDioYu', 30], ['1jXLYEw', 30], ['QFmz6ch', 40], ['JbC2iaV', 40], ['UtmIqcI', 20]]),
];

/** Default hold when nothing is planned, seconds. */
export const DEFAULT_HOLD = 30;
/** Pause before each hold to get into position, seconds. */
export const PREP = 5;

/** Plan items of a routine: one set per side for one-sided holds. */
export function routineItems(items: { id: string; time: number }[], byId: Map<string, Exercise>): PlanItem[] {
  return items.map((x) => ({ exerciseId: x.id, sets: byId.get(x.id)?.perSide ? 2 : 1, time: x.time }));
}

/** Total minutes of a plan (holds + get-ready pauses). */
export function planMinutes(items: PlanItem[]): number {
  const sec = items.reduce((a, x) => a + (x.time ?? DEFAULT_HOLD) * (x.sets || 1) + PREP * (x.sets || 1), 0);
  return Math.max(1, Math.round(sec / 60));
}

/** Starts a mobility session (or returns the running workout: only one at a time). */
export async function startMobility(title: string, items: PlanItem[], templateId?: string): Promise<Workout> {
  const running = await activeWorkout();
  if (running) return running;
  const entries: WorkoutEntry[] = items.map((x) => ({
    exerciseId: x.exerciseId,
    plan: { sets: x.sets, time: x.time },
    sets: Array.from({ length: Math.max(1, x.sets) }, () => ({ done: false })),
  }));
  const w: Workout = { id: uid('w_'), title, templateId, startedAt: Date.now(), entries, kind: 'mobility' };
  await db.workouts.put(w);
  return w;
}

// Stretches for each muscle, best first: the cooldown takes the first unused one per trained muscle
const STRETCH_FOR: Partial<Record<Muscle, string[]>> = {
  quads: ['BWnJR72', 'tFGKm99'],
  hams: ['sU5BrfP', '99rWm7w'],
  glutes: ['DeDThfG', 'RQNVT10'],
  calves: ['m0tCHqc', 'qOKcgVP'],
  adductors: ['2Dk4xQV'],
  lats: ['f38OEuO', '1jXLYEw'],
  traps: ['GSDioYu'],
  lowerback: ['QFmz6ch', 'JbC2iaV'],
  chest: ['Uto7l43', '3uj0Ozg'],
  shoulders: ['xifhB5W'],
  triceps: ['Z5YStHW'],
  biceps: ['Uto7l43'],
  forearms: ['UtmIqcI'],
  neck: ['x2chWLO'],
  abs: ['01qpYSe'],
};

/** 3–4 stretches for the muscles a workout loaded most (primary muscles, by done sets). */
export function cooldownFor(w: Workout, byId: Map<string, Exercise>): { muscles: Muscle[]; items: PlanItem[] } {
  const load = new Map<Muscle, number>();
  for (const e of w.entries) {
    const ex = byId.get(e.exerciseId);
    const n = e.sets.filter((s) => s.done).length;
    if (!ex || !n || ex.category === 'stretch' || ex.category === 'yoga') continue;
    for (const m of ex.muscles) load.set(m, (load.get(m) ?? 0) + n);
  }
  const ranked = [...load.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m).filter((m) => STRETCH_FOR[m]);
  const ids: string[] = [];
  const muscles: Muscle[] = [];
  // First pass: one per muscle; second pass fills up to 4 with alternatives
  for (const pass of [0, 1])
    for (const m of ranked) {
      if (ids.length >= 4) break;
      const id = STRETCH_FOR[m]![pass];
      if (!id || ids.includes(id) || !byId.has(id)) continue;
      ids.push(id);
      if (!muscles.includes(m)) muscles.push(m);
    }
  return { muscles, items: routineItems(ids.map((id) => ({ id, time: DEFAULT_HOLD })), byId) };
}

/** Own routines (templates marked as mobility). */
export function useMobilityTemplates(): Template[] | undefined {
  return useLiveQuery(async () => (await db.templates.orderBy('name').toArray()).filter((x) => x.kind === 'mobility'), []);
}

/** Finished mobility sessions this week. */
export function mobilityThisWeek(ws: Workout[]): number {
  const start = weekStartOf(Date.now());
  return ws.filter((w) => w.kind === 'mobility' && w.endedAt && w.startedAt >= start && w.startedAt < addDays(start, 7)).length;
}

export const isStrength = (w: Workout) => w.kind !== 'mobility';
