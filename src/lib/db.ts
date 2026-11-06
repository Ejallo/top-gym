import Dexie, { type Table } from 'dexie';

// Local data model. Everything stays on the device (IndexedDB).

export type ExerciseType = 'weight_reps' | 'reps' | 'time' | 'cardio';

/** User-made exercise or one pulled from the full online base. Base exercises ship as static JSON. */
export interface CustomExercise {
  id: string; // 'c_<random>' for own, ExerciseDB id for downloaded
  name: string;
  muscles: string[];
  type: ExerciseType;
  gif?: string; // cached media url
  photo?: Blob;
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
}

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
}

export interface WorkoutEntry {
  exerciseId: string;
  rest?: string;
  note?: string;
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
