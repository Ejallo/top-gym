import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

/** kv key holding every pinned exercise note: exerciseId → text. Synced across devices. */
export const PINS_KEY = 'exNotes';

type Pins = Record<string, string>;

const read = async (): Promise<Pins> => ((await db.kv.get(PINS_KEY))?.value as Pins | undefined) ?? {};

/** All pinned notes (empty object while loading). */
export function usePins(): Pins {
  return useLiveQuery(read, []) ?? {};
}

/** Set or clear (empty text) the pinned note of one exercise. */
export async function setPin(exerciseId: string, text: string): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const pins = { ...(await read()) };
    const v = text.trim();
    if (v) pins[exerciseId] = v;
    else delete pins[exerciseId];
    await db.kv.put({ key: PINS_KEY, value: pins });
  });
}
