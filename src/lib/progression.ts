import { isWork, type SetEntry, type Workout, type WorkoutEntry } from './db';
import type { Exercise } from './exercises';
import { repsFloor } from './workouts';

/** What the user did last time for an exercise and what to try now. */
export interface Hint {
  last: SetEntry[]; // done sets of the previous session
  next: { weight?: number; reps?: number; time?: number };
  /** 'up' = heavier/longer, 'reps' = same load, one more rep, 'hold' = repeat: last time was near failure */
  kind: 'up' | 'reps' | 'hold';
}

/** Upper bound of a reps target: '8-12' → 12, '10' → 10. */
function repsCeil(reps?: string): number | undefined {
  const all = reps?.match(/\d+/g);
  return all ? Number(all[all.length - 1]) : undefined;
}

/** Weight step by equipment: dumbbells and kettlebells go up in smaller steps. */
function step(ex: Exercise): number {
  return ex.equipment === 'dumbbell' || ex.equipment === 'kettlebell' ? 2 : 2.5;
}

/** Done sets of this exercise in the latest finished workout before `before`. */
export function lastSets(history: Workout[], exerciseId: string, before: number, skipId: string): SetEntry[] {
  for (const w of history) {
    if (w.id === skipId || !w.endedAt || w.startedAt >= before) continue;
    const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter(isWork));
    if (sets.length) return sets;
  }
  return [];
}

/** Average effort (1–10) over sets that have it. */
function effortOf(sets: SetEntry[]): number | undefined {
  const v = sets.map((s) => s.effort).filter((x): x is number => !!x);
  return v.length ? v.reduce((a, x) => a + x, 0) / v.length : undefined;
}

/** At or above this average effort the last session counts as near failure: repeat instead of adding. */
export const HARD = 9;

/**
 * Double progression: when every working set hit the top of the rep range, add weight;
 * otherwise keep the weight and add a rep. If the last session felt near-maximal (effort ≥ 9),
 * repeat it instead. Time holds grow by 5–10 s. Stretching and cardio get no hint.
 */
export function progressionHint(entry: WorkoutEntry, ex: Exercise | undefined, last: SetEntry[]): Hint | null {
  if (!ex || !last.length || ex.category === 'stretch') return null;
  if (ex.type === 'weight_reps') {
    const top = Math.max(...last.map((s) => s.weight ?? 0));
    if (!top) return null;
    const work = last.filter((s) => (s.weight ?? 0) === top && s.reps);
    if (!work.length) return null;
    const minReps = Math.min(...work.map((s) => s.reps!));
    const ceil = repsCeil(entry.plan?.reps) ?? Math.max(...work.map((s) => s.reps!));
    if ((effortOf(work) ?? 0) >= HARD) return { last, kind: 'hold', next: { weight: top, reps: minReps } };
    if (minReps >= ceil) {
      const weight = Math.round((top + step(ex)) * 4) / 4;
      return { last, kind: 'up', next: { weight, reps: repsFloor(entry.plan?.reps) ?? minReps } };
    }
    return { last, kind: 'reps', next: { weight: top, reps: Math.min(minReps + 1, ceil) } };
  }
  if (ex.type === 'reps') {
    const best = Math.max(...last.map((s) => s.reps ?? 0));
    if (best && (effortOf(last) ?? 0) >= HARD) return { last, kind: 'hold', next: { reps: best } };
    return best ? { last, kind: 'reps', next: { reps: best + 1 } } : null;
  }
  if (ex.type === 'time') {
    const best = Math.max(...last.map((s) => s.time ?? 0));
    return best ? { last, kind: 'up', next: { time: best + (best < 60 ? 5 : 10) } } : null;
  }
  return null;
}

/** Puts the suggested values into sets that are not ticked and still empty. */
export function applyHint(entry: WorkoutEntry, hint: Hint): WorkoutEntry {
  return {
    ...entry,
    sets: entry.sets.map((s) =>
      s.done || s.warmup
        ? s
        : {
            ...s,
            weight: s.weight ?? hint.next.weight,
            reps: s.reps ?? hint.next.reps,
            time: s.time ?? hint.next.time,
          },
    ),
  };
}
