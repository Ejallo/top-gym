import { useEffect, useState } from 'react';
import { db, type Category, type CustomExercise, type ExerciseType, type Side } from './db';
import { getLang } from '../i18n';
import { groupOf, type Group, type Muscle } from './muscles';

/** Exercise as the app uses it: base (bundled) and custom/downloaded merged into one shape. */
export interface Exercise {
  id: string;
  name: string; // in the UI language
  en: string; // English name (search, matching Claude plans)
  muscles: Muscle[]; // primary first
  secondary: Muscle[];
  group: Group;
  equipment: string; // equipment key, see 'eq.*' in the dictionary
  type: ExerciseType;
  steps: string[];
  mistakes: string[]; // common mistakes
  gif?: string; // url
  photos: Blob[]; // own photos, shown before the gif
  videoUrl?: string;
  category?: Category;
  side?: Side;
  /** Hold one side, then the other (the timer runs twice) */
  perSide?: boolean;
  /** Weight is entered for one hand, not the total */
  perHand?: boolean;
  source: 'base' | 'own' | 'full';
}

/** Language-neutral part of public/data/exercises.json */
interface BaseRow {
  id: string;
  en: string;
  muscles: Muscle[];
  secondary: Muscle[];
  equipment: string;
  type: ExerciseType;
  noMedia?: true; // no gif exists for this one
  category?: Category;
  perSide?: true;
  perHand?: true;
  pict?: string; // drawn pictogram public/pict/<key>.svg instead of a gif
}
/** public/data/exercises.<lang>.json: id → name + steps + common mistakes */
type BaseText = Record<string, { n: string; s: string[]; e?: string[] }>;

const BASE_URL = import.meta.env.BASE_URL;
export const FULL_API = 'https://oss.exercisedb.dev/api/v1/exercises';
export const mediaUrl = (id: string) => `${BASE_URL}media/${id}.gif`;
export const fullMediaUrl = (id: string) => `https://static.exercisedb.dev/media/${id}.gif`;

let base: Exercise[] | null = null;
let loading: Promise<Exercise[]> | null = null;

async function loadBase(): Promise<Exercise[]> {
  if (base) return base;
  loading ??= (async () => {
    const [rows, text] = await Promise.all([
      fetch(`${BASE_URL}data/exercises.json`).then((r) => r.json() as Promise<BaseRow[]>),
      fetch(`${BASE_URL}data/exercises.${getLang()}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<BaseText>) : ({} as BaseText)))
        .catch(() => ({}) as BaseText),
    ]);
    base = rows.map((r) => ({
      ...r,
      name: text[r.id]?.n ?? r.en,
      steps: text[r.id]?.s ?? [],
      mistakes: text[r.id]?.e ?? [],
      group: groupOf(r.muscles[0]),
      gif: r.pict ? `${BASE_URL}pict/${r.pict}.svg` : r.noMedia ? undefined : mediaUrl(r.id),
      photos: [],
      source: 'base' as const,
    }));
    return base;
  })();
  return loading;
}

function fromCustom(c: CustomExercise): Exercise {
  const muscles = (c.muscles.length ? c.muscles : ['abs']) as Muscle[];
  return {
    id: c.id,
    name: c.name,
    en: c.en ?? c.name,
    muscles,
    secondary: (c.secondary ?? []) as Muscle[],
    group: groupOf(muscles[0]),
    equipment: c.equipment ?? 'other',
    type: c.type,
    steps: c.steps ?? [],
    mistakes: c.mistakes ?? [],
    gif: c.gif,
    photos: c.photos ?? [],
    category: c.category,
    side: c.side,
    videoUrl: c.videoUrl,
    source: c.source,
  };
}

/** All exercises: custom and downloaded first, then the bundled base. */
export async function allExercises(): Promise<Exercise[]> {
  // If IndexedDB is slow to open (seen on iOS and headless browsers), show the base first
  const customP = db.customExercises.orderBy('name').toArray().catch(() => [] as CustomExercise[]);
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 2000));
  const [b, custom] = await Promise.all([loadBase(), Promise.race([customP, timeout])]);
  if (custom === null) {
    void customP.then((c) => c.length && exercisesChanged());
    return b;
  }
  return [...custom.map(fromCustom), ...b];
}

let version = 0;
const listeners = new Set<() => void>();
/** Call after custom exercises change so lists reload. */
export function exercisesChanged() {
  version++;
  listeners.forEach((l) => l());
}

export function useExercises(): Exercise[] | null {
  const [list, setList] = useState<Exercise[] | null>(base);
  const [v, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    let alive = true;
    void allExercises().then((x) => alive && setList(x));
    return () => {
      alive = false;
    };
  }, [v]);
  return list;
}

/** Case/ё-insensitive search over name and English name. */
export function matches(e: Exercise, q: string): boolean {
  const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е');
  const n = norm(q.trim());
  if (!n) return true;
  const hay = norm(e.name + ' ' + e.en);
  return n.split(/\s+/).every((w) => hay.includes(w));
}

/** Search result from the full online ExerciseDB base (the search endpoint returns only these fields). */
export interface FullHit {
  exerciseId: string;
  name: string;
  gifUrl: string;
}

/** Full record, fetched by id. */
export interface FullExercise extends FullHit {
  bodyParts: string[];
  equipments: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
}

export async function searchFull(q: string): Promise<FullHit[]> {
  const r = await fetch(`${FULL_API}/search?search=${encodeURIComponent(q)}&limit=20`);
  if (!r.ok) throw new Error(String(r.status));
  const j = (await r.json()) as { data: FullHit[] };
  // The API is fuzzy and returns duplicates by name: keep the first of each
  const seen = new Set<string>();
  return j.data.filter((h) => {
    const k = h.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function fetchFull(id: string): Promise<FullExercise> {
  const r = await fetch(`${FULL_API}/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(String(r.status));
  return ((await r.json()) as { data: FullExercise }).data;
}
