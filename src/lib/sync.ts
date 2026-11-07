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
const SYNCED_KV = new Set(['weeklyGoal', 'rehab', 'rehabTicks', 'exNotes']); // other kv keys are device-local

const LS = { session: 'tg.session', user: 'tg.user', seq: 'tg.seq', outbox: 'tg.outbox', photos: 'tg.photosUp', pair: 'tg.pair', full: 'tg.fullPush' };

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

/**
 * Every local record goes to the outbox. at = 1 (the default) uploads only what the server doesn't
 * have yet: any version already there is newer and wins, so stale copies never overwrite other devices.
 * Pass Date.now() to make this device's data win (e.g. after restoring a backup).
 */
export async function markAllDirty(at = 1) {
  const box = readJson<Outbox>(LS.outbox, {});
  for (const tbl of TABLES) {
    const keys = (await db.table(tbl).toCollection().primaryKeys()) as string[];
    for (const id of keys) if (tbl !== 'kv' || SYNCED_KV.has(id)) box[`${tbl}|${id}`] ??= { at, deleted: false };
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
      // Once per device: queue everything that may never have reached the server (an earlier
      // sign-in could finish in another browser context, so this device's data was never uploaded)
      const firstFull = !localStorage.getItem(LS.full);
      if (firstFull) await markAllDirty();
      do {
        again = false;
        await push();
        await pull();
      } while (again);
      if (firstFull) localStorage.setItem(LS.full, '1');
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

async function acceptSession(token: string, account: Account) {
  localStorage.setItem(LS.session, token);
  localStorage.setItem(LS.user, JSON.stringify(account));
  localStorage.setItem(LS.seq, '0');
  localStorage.removeItem(LS.photos);
  localStorage.removeItem(LS.pair);
  await markAllDirty(); // upload what's already on this device
  setStatus({ account, state: 'idle' });
}

// ---------- paired sign-in ----------
// The app keeps a random secret and gives Google only its hash as the ID-token nonce. After sign-in the
// server parks the session under that hash; the app claims it with the secret. This works wherever the
// Google page ends up (on iOS it may finish in Safari, whose storage is separate from the home-screen app).

const PAIR_TTL = 10 * 60 * 1000;
interface Pair {
  secret: string;
  nonce: string;
  at: number;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const freshPair = (): Pair | null => {
  const p = readJson<Pair | null>(LS.pair, null);
  return p && Date.now() - p.at < PAIR_TTL ? p : null;
};

/** Nonce for the Google button; the secret behind it stays on this device. */
export async function pairNonce(): Promise<string> {
  const old = freshPair();
  if (old && Date.now() - old.at < PAIR_TTL / 2) return old.nonce;
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))));
  localStorage.setItem(LS.pair, JSON.stringify({ secret, nonce, at: Date.now() } satisfies Pair));
  return nonce;
}

let claiming = false;
/** Asks the server whether the sign-in for our secret has finished; signs in if so. */
export async function claimPair(): Promise<boolean> {
  const p = freshPair();
  if (!p || session() || claiming) return false;
  claiming = true;
  try {
    const r = await fetch(ACCOUNT_API + '/auth/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: p.secret }) });
    if (!r.ok) return false;
    const d = (await r.json()) as { token?: string; name?: string; email?: string };
    if (!d.token) return false;
    await acceptSession(d.token, { name: d.name ?? '', email: d.email ?? '' });
    void syncNow();
    return true;
  } catch {
    return false;
  } finally {
    claiming = false;
  }
}

/**
 * Back from Google. 'paired' = the server holds a session for some device's secret: claim it if it's
 * ours, otherwise this is a different browser (iOS Safari) and the user should return to the app.
 */
export async function takeLoginFromUrl(): Promise<'ok' | 'error' | 'elsewhere' | null> {
  const hash = location.hash.slice(1);
  if (hash === 'login-error' || hash === 'paired') history.replaceState(null, '', location.pathname + location.search);
  if (hash === 'login-error') return 'error';
  if (hash === 'paired') {
    if (!freshPair()) return 'elsewhere';
    for (let i = 0; i < 3; i++) {
      if (await claimPair()) return 'ok';
      await new Promise((r) => setTimeout(r, 800));
    }
    return session() ? 'ok' : 'error';
  }
  // Legacy redirect with the session in the fragment
  const p = new URLSearchParams(hash);
  const token = p.get('login');
  if (!token) return null;
  history.replaceState(null, '', location.pathname + location.search);
  await acceptSession(token, { name: p.get('name') ?? '', email: p.get('email') ?? '' });
  return 'ok';
}

function signOutLocal() {
  for (const k of [LS.session, LS.user, LS.seq, LS.outbox, LS.photos, LS.full, 'tg.lastSync']) localStorage.removeItem(k);
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
  void syncNow();
  void claimPair();
  // Listeners stay on while signed out too: sign-in can finish later in this session
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void claimPair();
    void syncNow();
  });
  window.addEventListener('online', () => void syncNow());
  setInterval(() => void syncNow(), 5 * 60 * 1000);
}
