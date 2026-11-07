import { isWork, type Workout, type WorkoutEntry } from './db';
import type { Exercise } from './exercises';

/**
 * Stand-ins for an exercise when its machine is busy: same primary muscle, same section
 * (strength vs stretch/yoga/rehab). Ranked: done before → same type → shared muscles → name.
 */
export function alternatives(ex: Exercise, all: Exercise[], history: Workout[]): Exercise[] {
  const used = new Map<string, number>(); // exerciseId → times trained
  for (const w of history) if (w.endedAt) for (const e of w.entries) if (e.sets.some(isWork)) used.set(e.exerciseId, (used.get(e.exerciseId) ?? 0) + 1);
  const target = new Set([...ex.muscles, ...ex.secondary]);
  const overlap = (x: Exercise) => [...x.muscles, ...x.secondary].filter((m) => target.has(m)).length;
  return all
    .filter((x) => x.id !== ex.id && x.muscles[0] === ex.muscles[0] && (x.category ?? null) === (ex.category ?? null))
    .map((x) => ({ x, u: used.get(x.id) ?? 0, ty: x.type === ex.type ? 1 : 0, o: overlap(x) }))
    .sort((a, b) => b.u - a.u || b.ty - a.ty || b.o - a.o || a.x.name.localeCompare(b.x.name))
    .map((r) => r.x);
}

/**
 * Put `toId` in place of entry i. Nothing ticked yet → swapped in place, plan and sets kept.
 * Some sets ticked → those stay with the old exercise; the unticked ones move to a new entry right after it.
 */
export function swapEntry(entries: WorkoutEntry[], i: number, toId: string): WorkoutEntry[] {
  const e = entries[i];
  if (!e) return entries;
  const done = e.sets.filter((s) => s.done);
  // Sets and reps carry over; the planned weight belongs to the old exercise
  const plan = e.plan && { ...e.plan, weight: undefined };
  const left = e.sets.filter((s) => !s.done).map((s) => ({ done: false, warmup: s.warmup }));
  if (!done.length) {
    const next: WorkoutEntry = { ...e, exerciseId: toId, side: undefined, plan, sets: left.length ? left : [{ done: false }] };
    return entries.map((x, j) => (j === i ? next : x));
  }
  const kept: WorkoutEntry = { ...e, sets: done };
  const moved: WorkoutEntry = { exerciseId: toId, rest: e.rest, plan, sets: left.length ? left : [{ done: false }] };
  return [...entries.slice(0, i), kept, moved, ...entries.slice(i + 1)];
}
