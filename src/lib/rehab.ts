import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type CustomExercise, type ExerciseType, type PlanItem, type Workout } from './db';
import { exercisesChanged } from './exercises';
import { activeWorkout, entryFromPlan } from './workouts';

/**
 * Personal rehab program (format top-gym-rehab v1). It is imported from a file the user keeps,
 * never bundled: it holds medical details. Stored in kv 'rehab' (synced with the account);
 * its exercises become own exercises 'rh_<key>' in the rehab category.
 */
export interface RehabExercise {
  key: string;
  num: number;
  name: string;
  dose: string;
  stage: number;
  type: ExerciseType;
  perSide: boolean;
  start?: string | null;
  steps: string[];
  feelLabel?: string | null;
  feel?: string | null;
  bad: string[];
  easier?: string | null;
  harder?: string | null;
  svg?: string | null;
}

export interface RehabItem {
  ex: string;
  text: string;
  sets: number;
  reps?: string;
  time?: number;
}

export type DayKind = 'daily' | 'strong' | 'light' | 'run' | 'sport' | 'rest' | 'test';

export interface RehabDay {
  d: string; // YYYY-MM-DD
  kind: DayKind;
  label: string;
  items: RehabItem[];
  notes: { text: string; bold: boolean }[];
}

export interface RehabWeek {
  title: string;
  stage: number;
  a: string;
  b: string;
  note?: string | null;
  days: RehabDay[];
}

export interface RehabProgram {
  format: 'top-gym-rehab';
  v: 1;
  id: string;
  title: string;
  lead: string;
  start: string;
  end: string;
  pain: { tone: 'ok' | 'warn' | 'stop'; title: string; text: string }[];
  rule: string;
  avoid: string[];
  readiness: string;
  foot: string;
  stages: { n: number; title: string; text: string }[];
  exercises: RehabExercise[];
  weeks: RehabWeek[];
}

const KEY = 'rehab';
const TICKS = 'rehabTicks';
export const exId = (key: string) => `rh_${key}`;

// Muscles by exercise key for the known program; anything else counts as adductors (the usual target)
const MUSCLES: Record<string, string[]> = {
  bridge: ['glutes', 'hams'],
  bridge1: ['glutes', 'hams'],
  deadbug: ['abs'],
  sideknee: ['abs'],
  sidefull: ['abs'],
  abd: ['glutes'],
  squat: ['quads', 'glutes'],
  lunge: ['quads', 'glutes'],
  walk: ['glutes'],
  jumps: ['calves', 'quads'],
  run: ['cardio'],
};

/** Local calendar date as YYYY-MM-DD. */
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function useRehab(): RehabProgram | null | undefined {
  return useLiveQuery(async () => ((await db.kv.get(KEY))?.value as RehabProgram | undefined) ?? null, []);
}

/** Days ticked by hand (a finished rehab workout counts by itself). */
export function useRehabTicks(): string[] {
  return useLiveQuery(async () => ((await db.kv.get(TICKS))?.value as string[] | undefined) ?? [], []) ?? [];
}

export async function toggleTick(d: string) {
  const cur = ((await db.kv.get(TICKS))?.value as string[] | undefined) ?? [];
  await db.kv.put({ key: TICKS, value: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] });
}

/** Dates with a finished rehab workout. */
export function useRehabDone(): Set<string> {
  const ws = useLiveQuery(async () => (await db.workouts.toArray()).filter((w) => w.rehabDay && w.endedAt), []);
  return new Set((ws ?? []).map((w) => w.rehabDay!));
}

export function allDays(p: RehabProgram): RehabDay[] {
  return p.weeks.flatMap((w) => w.days);
}

/** The program day on exactly this date, if any. */
export function dayOn(p: RehabProgram, date: string): { day: RehabDay; week: RehabWeek } | null {
  for (const week of p.weeks) for (const day of week.days) if (day.d === date) return { day, week };
  return null;
}

/** The day for a date; before the start → the first day, after the end → null. */
export function dayFor(p: RehabProgram, date: string): { day: RehabDay; week: RehabWeek } | null {
  for (const week of p.weeks) for (const day of week.days) if (day.d === date) return { day, week };
  if (date < p.start) return { day: p.weeks[0].days[0], week: p.weeks[0] };
  return null;
}

function check(p: unknown): asserts p is RehabProgram {
  const x = p as RehabProgram;
  if (!x || x.format !== 'top-gym-rehab' || x.v !== 1 || !Array.isArray(x.weeks) || !Array.isArray(x.exercises) || !x.weeks.length)
    throw new Error('format');
  for (const e of x.exercises) if (!/^[a-z0-9]{1,40}$/.test(e.key)) throw new Error('format');
}

/** Exercise steps for the ordinary exercise card: start position first, then the steps, then what to feel. */
function stepsOf(e: RehabExercise): string[] {
  return [...(e.start ? [e.start] : []), ...e.steps, ...(e.feel ? [`${e.feelLabel ?? ''}: ${e.feel}`.replace(/^: /, '')] : [])];
}

/** Saves the program and creates/updates its exercises. Replaces a previous rehab program. */
export async function importRehab(json: string): Promise<RehabProgram> {
  const p: unknown = JSON.parse(json);
  check(p);
  const now = Date.now();
  const exs: CustomExercise[] = p.exercises.map((e) => ({
    id: exId(e.key),
    name: e.name,
    muscles: MUSCLES[e.key] ?? ['adductors'],
    type: e.type,
    steps: stepsOf(e),
    photos: e.svg ? [new Blob([e.svg], { type: 'image/svg+xml' })] : [],
    category: 'rehab',
    side: 'both',
    source: 'own',
    createdAt: now,
  }));
  await db.transaction('rw', db.kv, db.customExercises, async () => {
    await db.kv.put({ key: KEY, value: p });
    await db.customExercises.bulkPut(exs);
  });
  exercisesChanged();
  return p;
}

/** Removes the program and its exercises (finished workouts stay). */
export async function removeRehab(p: RehabProgram) {
  await db.transaction('rw', db.kv, db.customExercises, async () => {
    await db.kv.delete(KEY);
    await db.kv.delete(TICKS);
    await db.customExercises.bulkDelete(p.exercises.map((e) => exId(e.key)));
  });
  exercisesChanged();
}

/** Starts the day's session as a workout (or returns the running one). */
export async function startRehabDay(day: RehabDay, title: string): Promise<Workout> {
  const running = await activeWorkout();
  if (running) return running;
  const items: PlanItem[] = day.items.map((x) => ({ exerciseId: exId(x.ex), sets: x.sets, reps: x.reps, time: x.time, note: x.text }));
  const w: Workout = {
    id: uid('w_'),
    title,
    startedAt: Date.now(),
    entries: items.map(entryFromPlan),
    note: day.notes.map((n) => n.text).join('\n') || undefined,
    rehabDay: day.d,
  };
  await db.workouts.put(w);
  return w;
}
