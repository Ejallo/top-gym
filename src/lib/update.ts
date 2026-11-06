import { useSyncExternalStore } from 'react';

// The service worker normally updates the app on its own, but iOS can keep an old version cached for days.
// version.json is never cached, so comparing it with the running build tells a stuck app that it is outdated.
const CHECK_EVERY_MS = 30 * 60 * 1000;

let available = false;
const listeners = new Set<() => void>();

export type CheckResult = 'available' | 'latest' | 'offline';

/** Fetches the deployed build stamp and compares it with the running one. */
export async function checkForUpdate(): Promise<CheckResult> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return 'offline'; // dev server has no version.json
    const { build } = (await r.json()) as { build?: string };
    available = !!build && build !== __BUILD__;
  } catch {
    return 'offline';
  }
  listeners.forEach((l) => l());
  return available ? 'available' : 'latest';
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => available,
  );
}

/**
 * Drops this app's service worker and caches, then reloads from the network.
 * Workouts live in IndexedDB and stay. Exercise gifs cache is kept too (it is big and does not change).
 */
export async function hardReload() {
  const scope = new URL(import.meta.env.BASE_URL, location.origin).href;
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.filter((r) => r.scope.startsWith(scope)).map((r) => r.unregister()));
  } catch {
    // no service worker support: a plain reload is all we can do
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.includes(scope) || k.startsWith('workbox-precache')).map((k) => caches.delete(k)));
  } catch {
    // cache storage unavailable
  }
  location.reload();
}

export function startUpdateChecks() {
  void checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
}
