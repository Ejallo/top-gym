import Dexie, { type Table } from 'dexie';

// Local data model. Everything stays on the device (IndexedDB).

export type ExerciseType = 'weight_reps' | 'reps' | 'time' | 'cardio';
/** Section an own exercise belongs to besides its muscle group. */
export type Category = 'rehab' | 'stretch' | 'yoga';
/** Which side is trained (rehab often works one limb). */
export type Side = 'left' | 'right' | 'both';

/** User-made exercise or one pulled from the full online base. Base exercises ship as static JSON. */
export interface CustomExercise {
  id: string; // 'c_<random>' for own, ExerciseDB id for downloaded
  name: string;
  en?: string; // original English name for downloaded ones
  muscles: string[]; // app muscle keys, primary first
  secondary?: string[];
  equipment?: string;
  type: ExerciseType;
  steps?: string[];
  gif?: string; // media url (cached by the service worker)
  photos?: Blob[]; // up to 8, downscaled JPEG
  category?: Category;
  side?: Side;
  videoUrl?: string;
  source: 'own' | 'full';
  createdAt: number;
}

export interface PlanItem {
  exerciseId: string;
  sets: number;
  reps?: string; // '10' or '8-12'
  weight?: number;
  time?: number; // seconds, for time-based
  distance?: number; // km, for cardio
  rest?: string; // free text: '2 мин'
  note?: string;
}

export interface Template {
  id: string;
  name: string;
  items: PlanItem[];
  createdAt: number;
  /** Set for program days: such templates live under the program, not in the templates list */
  programId?: string;
  /** Own stretching/yoga routine: listed under mobility and run in the hold player */
  kind?: 'mobility';
  /** Home block (X / Y) this template belongs to; such templates are listed only inside that block */
  folder?: Folder;
}

export type Folder = 'x' | 'y';

/** Weekly program: weekday (1 = Monday … 7 = Sunday) → template. One is active at a time. */
export interface Program {
  id: string;
  name: string;
  days: { weekday: number; templateId: string }[];
  active: boolean;
  importedAt: number;
}

export interface SetEntry {
  weight?: number;
  reps?: number;
  time?: number;
  distance?: number;
  done: boolean;
  /** Warm-up set: shown and kept, but left out of volume, e1RM, progression and reports */
  warmup?: boolean;
  /** How hard the set felt, 1 (easy) … 10 (all-out), entered by hand */
  effort?: number;
  comment?: string;
}

/** A ticked working set: the only kind that counts in stats. */
export const isWork = (s: SetEntry): boolean => s.done && !s.warmup;

export interface WorkoutEntry {
  exerciseId: string;
  rest?: string;
  note?: string;
  /** Target from the template/program, shown as a hint */
  plan?: { sets: number; reps?: string; weight?: number; time?: number; distance?: number };
  side?: Side;
  sets: SetEntry[];
}

export interface Workout {
  id: string;
  title: string;
  templateId?: string;
  startedAt: number;
  endedAt?: number; // undefined while in progress
  note?: string;
  entries: WorkoutEntry[];
  /** Stretching/yoga session: run in the hold player, counted apart from strength workouts */
  kind?: 'mobility';
  /** Rehab program day (YYYY-MM-DD) this session belongs to */
  rehabDay?: string;
}

class TopGymDB extends Dexie {
  customExercises!: Table<CustomExercise, string>;
  templates!: Table<Template, string>;
  programs!: Table<Program, string>;
  workouts!: Table<Workout, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('top-gym');
    this.version(1).stores({
      customExercises: 'id, name',
      templates: 'id, name',
      programs: 'id, active',
      workouts: 'id, startedAt, endedAt',
      kv: 'key',
    });
  }
}

export const db = new TopGymDB();

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
