import { useSyncExternalStore } from 'react';
import Dexie from 'dexie';
import { db, type CustomExercise } from './db';
import { exercisesChanged } from './exercises';

/**
 * Account sync. The phone stays the source of truth (local-first); when signed in, every change is
 * queued in an outbox and pushed to the server, and changes from other devices are pulled by sequence
 * number. Conflicts resolve per record: the later change wins.
 */

export const ACCOUNT_API = 'https://top-gym-api.vetervlad94.workers.dev';

const TABLES = ['customExercises', 'templates', 'programs', 'workouts', 'kv'] as const;
type Tbl = (typeof TABLES)[number];
const SYNCED_KV = new Set(['weeklyGoal']); // other kv keys are device-local

const LS = { session: 'tg.session', user: 'tg.user', seq: 'tg.seq', outbox: 'tg.outbox', photos: 'tg.photosUp' };

type Outbox = Record<string, { at: number; deleted: boolean }>; // key: `${tbl}|${id}`

const readJson = <T,>(k: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '') as T;
  } catch {
    return fallback;
  }
};

// ---------- account state ----------

export interface Account {
  name: string;
  email: string;
}
export type SyncState = 'off' | 'idle' | 'syncing' | 'error' | 'offline';
interface Status {
  account: Account | null;
  state: SyncState;
  lastSync?: number;
  pending: number;
}

let status: Status = {
  account: localStorage.getItem(LS.session) ? readJson<Account>(LS.user, { name: '', email: '' }) : null,
  state: localStorage.getItem(LS.session) ? 'idle' : 'off',
  lastSync: Number(localStorage.getItem('tg.lastSync')) || undefined,
  pending: Object.keys(readJson<Outbox>(LS.outbox, {})).length,
};
const listeners = new Set<() => void>();
function setStatus(p: Partial<Status>) {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
}
export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

const session = () => localStorage.getItem(LS.session);

// ---------- outbox (change tracking) ----------

function mark(tbl: Tbl, id: string, deleted: boolean) {
  if (!session()) return; // signed out: nothing to sync; first sign-in uploads everything anyway
  if (tbl === 'kv' && !SYNCED_KV.has(id)) return;
  const box = readJson<Outbox>(LS.outbox, {});
  box[`${tbl}|${id}`] = { at: Date.now(), deleted };
  localStorage.setItem(LS.outbox, JSON.stringify(box));
  setStatus({ pending: Object.keys(box).length });
  scheduleSync();
}

/** Every local record goes to the outbox: used on first sign-in and after restoring a backup. */
export async function markAllDirty() {
  const box = readJson<Outbox>(LS.outbox, {});
  const now = Date.now();
  for (const tbl of TABLES) {
    const keys = (await db.table(tbl).toCollection().primaryKeys()) as string[];
    for (const id of keys) if (tbl !== 'kv' || SYNCED_KV.has(id)) box[`${tbl}|${id}`] ??= { at: now, deleted: false };
  }
  localStorage.setItem(LS.outbox, JSON.stringify(box));
  setStatus({ pending: Object.keys(box).length });
}

const REMOTE = Symbol('remote');
const isRemote = (tx: unknown) => !!(tx as Record<symbol, boolean> | undefined)?.[REMOTE];

/** Dexie hooks: any local create/update/delete lands in the outbox (writes made by the sync itself don't). */
export function installHooks() {
  for (const tbl of TABLES) {
    const table = db.table(tbl);
    table.hook('creating', (key, obj, tx) => {
      if (!isRemote(tx)) mark(tbl, String(key ?? (obj as { id?: string; key?: string }).id ?? (obj as { key?: string }).key), false);
    });
    table.hook('updating', (_mods, key, _obj, tx) => {
      if (!isRemote(tx)) mark(tbl, String(key), false);
    });
    table.hook('deleting', (key, _obj, tx) => {
      if (!isRemote(tx)) mark(tbl, String(key), true);
    });
  }
}

// ---------- photos ----------

async function photoIds(ex: CustomExercise): Promise<string[]> {
  if (!ex.photos?.length) return [];
  return Promise.all(
    ex.photos.map(async (b) => {
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()));
      return `${ex.id}_${[...hash.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    }),
  );
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(ACCOUNT_API + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session()}` } });
  if (r.status === 401) {
    signOutLocal();
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r;
}

async function uploadPhotos(ex: CustomExercise, ids: string[]) {
  const done = new Set(readJson<string[]>(LS.photos, []));
  for (const [i, id] of ids.entries()) {
    if (done.has(id)) continue;
    await api(`/photo/${encodeURIComponent(id)}`, { method: 'PUT', body: ex.photos![i], headers: { 'Content-Type': ex.photos![i].type || 'image/jpeg' } });
    done.add(id);
    localStorage.setItem(LS.photos, JSON.stringify([...done]));
  }
}

// ---------- push / pull ----------

interface Change {
  tbl: Tbl;
  id: string;
  updated: number;
  deleted: boolean;
  body?: unknown;
}

async function push() {
  const box = readJson<Outbox>(LS.outbox, {});
  const keys = Object.keys(box);
  for (let i = 0; i < keys.length; i += 200) {
    const slice = keys.slice(i, i + 200);
    const changes: Change[] = [];
    for (const k of slice) {
      const [tbl, id] = k.split('|') as [Tbl, string];
      const e = box[k];
      const rec = e.deleted ? undefined : await db.table(tbl).get(id);
      if (!rec) {
        changes.push({ tbl, id, updated: e.at, deleted: true });
        continue;
      }
      let body: unknown = rec;
      if (tbl === 'customExercises') {
        const ex = rec as CustomExercise;
        const ids = await photoIds(ex);
        if (ids.length) await uploadPhotos(ex, ids);
        body = { ...ex, photos: undefined, photoIds: ids };
      }
      changes.push({ tbl, id, updated: e.at, deleted: false, body });
    }
    await api('/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) });
    // Drop sent entries unless they changed again meanwhile
    const now = readJson<Outbox>(LS.outbox, {});
    for (const k of slice) if (now[k]?.at === box[k].at) delete now[k];
    localStorage.setItem(LS.outbox, JSON.stringify(now));
    setStatus({ pending: Object.keys(now).length });
  }
}

interface RemoteRecord extends Change {
  seq: number;
}

async function applyRemote(records: RemoteRecord[]) {
  const box = readJson<Outbox>(LS.outbox, {});
  // Photos are fetched before the transaction (IndexedDB transactions can't wait on the network)
  const photosFor = new Map<string, Blob[] | undefined>();
  for (const r of records) {
    if (r.tbl !== 'customExercises' || r.deleted) continue;
    const ids = ((r.body as { photoIds?: string[] })?.photoIds ?? []) as string[];
    if (!ids.length) continue;
    const local = await db.customExercises.get(r.id);
    const localIds = local ? await photoIds(local) : [];
    if (local && localIds.join() === ids.join()) {
      photosFor.set(r.id, local.photos);
      continue;
    }
    try {
      photosFor.set(r.id, await Promise.all(ids.map(async (id) => (await api(`/photo/${encodeURIComponent(id)}`)).blob())));
      const done = new Set(readJson<string[]>(LS.photos, []));
      ids.forEach((id) => done.add(id));
      localStorage.setItem(LS.photos, JSON.stringify([...done]));
    } catch {
      photosFor.set(r.id, local?.photos);
    }
  }

  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    (Dexie.currentTransaction as unknown as Record<symbol, boolean>)[REMOTE] = true;
    for (const r of records) {
      const pending = box[`${r.tbl}|${r.id}`];
      if (pending && pending.at > r.updated) continue; // our unsent change is newer
      const table = db.table(r.tbl);
      if (r.deleted) await table.delete(r.id);
      else if (r.tbl === 'customExercises') {
        const { photoIds: _ids, ...rest } = r.body as CustomExercise & { photoIds?: string[] };
        await table.put({ ...rest, photos: photosFor.get(r.id) });
      } else await table.put(r.body);
    }
  });
  if (records.some((r) => r.tbl === 'customExercises')) exercisesChanged();
}

async function pull() {
  let seq = Number(localStorage.getItem(LS.seq) ?? 0);
  for (;;) {
    const r = (await (await api(`/sync?since=${seq}`)).json()) as { records: RemoteRecord[]; seq: number; more: boolean };
    if (r.records.length) await applyRemote(r.records);
    seq = r.seq;
    localStorage.setItem(LS.seq, String(seq));
    if (!r.more) break;
  }
}

let running: Promise<void> | null = null;
let again = false;

/** Push local changes, then pull remote ones. Concurrent calls coalesce into one extra run. */
export function syncNow(): Promise<void> {
  if (!session()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    setStatus({ state: 'syncing' });
    try {
      do {
        again = false;
        await push();
        await pull();
      } while (again);
      const now = Date.now();
      localStorage.setItem('tg.lastSync', String(now));
      setStatus({ state: 'idle', lastSync: now });
    } catch (e) {
      if (!session()) return;
      setStatus({ state: navigator.onLine === false || e instanceof TypeError ? 'offline' : 'error' });
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(ms = 2500) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

// ---------- sign-in / sign-out ----------

/** Back from Google: the server put a session into the URL fragment. Returns what happened. */
export async function takeLoginFromUrl(): Promise<'ok' | 'error' | null> {
  const hash = location.hash.slice(1);
  if (hash === 'login-error') {
    history.replaceState(null, '', location.pathname + location.search);
    return 'error';
  }
  const p = new URLSearchParams(hash);
  const token = p.get('login');
  if (!token) return null;
  history.replaceState(null, '', location.pathname + location.search);
  localStorage.setItem(LS.session, token);
  const account = { name: p.get('name') ?? '', email: p.get('email') ?? '' };
  localStorage.setItem(LS.user, JSON.stringify(account));
  localStorage.setItem(LS.seq, '0');
  localStorage.removeItem(LS.photos);
  await markAllDirty(); // upload what's already on this device
  setStatus({ account, state: 'idle' });
  return 'ok';
}

function signOutLocal() {
  for (const k of [LS.session, LS.user, LS.seq, LS.outbox, LS.photos, 'tg.lastSync']) localStorage.removeItem(k);
  setStatus({ account: null, state: 'off', pending: 0, lastSync: undefined });
}

/** Ends the session on the server too. Local data stays on the phone. */
export async function signOut() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // offline: the session simply expires unused
  }
  signOutLocal();
}

export function startSync() {
  installHooks();
  if (!session()) return;
  void syncNow();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  window.addEventListener('online', () => void syncNow());
  setInterval(() => void syncNow(), 5 * 60 * 1000);
}
