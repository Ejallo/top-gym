import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Program } from './db';

/** All programs, newest first. Several can be stored, one is active. */
export function usePrograms(): Program[] | undefined {
  return useLiveQuery(async () => (await db.programs.toArray()).sort((a, b) => b.importedAt - a.importedAt), []);
}

/** The active program; falls back to the newest one if none is flagged (old data, deleted active). */
export function activeOf(list: Program[] | undefined): Program | undefined {
  return list?.find((p) => p.active) ?? list?.[0];
}

/** Makes one program active and the others inactive (writes only what changes, so sync stays small). */
export async function setActiveProgram(id: string): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    for (const p of await db.programs.toArray()) {
      const on = p.id === id;
      if (p.active !== on) await db.programs.update(p.id, { active: on });
    }
  });
}

/** Deletes a program with its day templates. Past workouts stay. */
export async function deleteProgram(p: Program): Promise<void> {
  await db.templates.where('id').anyOf(p.days.map((d) => d.templateId)).delete();
  await db.programs.delete(p.id);
}

export async function renameProgram(id: string, name: string): Promise<void> {
  await db.programs.update(id, { name });
}
