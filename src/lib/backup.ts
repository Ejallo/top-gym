import { db, type CustomExercise } from './db';
import { exercisesChanged } from './exercises';

const FORMAT = 'top-gym-backup';
const VERSION = 1;
const LAST_KEY = 'lastBackup';

type StoredExercise = Omit<CustomExercise, 'photos'> & { photos?: string[] }; // photos as data URLs

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  createdAt: number;
  customExercises: StoredExercise[];
  templates: unknown[];
  programs: unknown[];
  workouts: unknown[];
  kv: unknown[];
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

const fromDataUrl = async (u: string) => (await fetch(u)).blob();

/** Everything in IndexedDB as one JSON string; photos are embedded as data URLs. */
export async function exportJson(): Promise<string> {
  const ex = await db.customExercises.toArray();
  const customExercises: StoredExercise[] = await Promise.all(
    ex.map(async (e) => ({ ...e, photos: e.photos ? await Promise.all(e.photos.map(toDataUrl)) : undefined })),
  );
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    createdAt: Date.now(),
    customExercises,
    templates: await db.templates.toArray(),
    programs: await db.programs.toArray(),
    workouts: await db.workouts.toArray(),
    kv: (await db.kv.toArray()).filter((x) => x.key !== LAST_KEY),
  };
  return JSON.stringify(file);
}

export function backupFileName(): string {
  const d = new Date();
  return `top-gym-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
}

/**
 * Saves the backup: iOS share sheet (→ «Save to Files») when files can be shared, else a download.
 * Returns false if the user cancelled the share sheet.
 */
export async function saveBackup(json: string): Promise<boolean> {
  const name = backupFileName();
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      throw e;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  await db.kv.put({ key: LAST_KEY, value: Date.now() });
  return true;
}

export async function lastBackupAt(): Promise<number | undefined> {
  const v = (await db.kv.get(LAST_KEY))?.value;
  return typeof v === 'number' ? v : undefined;
}

export interface BackupInfo {
  createdAt: number;
  workouts: number;
  templates: number;
  exercises: number;
}

/** Validates a backup file and returns what's inside, without writing anything. */
export function inspectBackup(text: string): BackupFile & { info: BackupInfo } {
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('json');
  }
  if (data?.format !== FORMAT || !Array.isArray(data.workouts)) throw new Error('format');
  if (data.version > VERSION) throw new Error('version');
  return {
    ...data,
    info: { createdAt: data.createdAt, workouts: data.workouts.length, templates: data.templates.length, exercises: data.customExercises.length },
  };
}

/** Replaces all local data with the backup. */
export async function restoreBackup(data: BackupFile): Promise<void> {
  const exercises: CustomExercise[] = await Promise.all(
    data.customExercises.map(async (e) => ({ ...e, photos: e.photos ? await Promise.all(e.photos.map(fromDataUrl)) : undefined })),
  );
  await db.transaction('rw', [db.customExercises, db.templates, db.programs, db.workouts, db.kv], async () => {
    await Promise.all([db.customExercises.clear(), db.templates.clear(), db.programs.clear(), db.workouts.clear(), db.kv.clear()]);
    await db.customExercises.bulkPut(exercises);
    await db.templates.bulkPut(data.templates as never[]);
    await db.programs.bulkPut(data.programs as never[]);
    await db.workouts.bulkPut(data.workouts as never[]);
    await db.kv.bulkPut(data.kv as never[]);
  });
  exercisesChanged();
}
