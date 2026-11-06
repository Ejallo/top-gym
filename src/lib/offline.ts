import { allExercises } from './exercises';

const CACHE = 'top-gym-media'; // must match runtimeCaching cacheName in vite.config.ts

/** How many of the given urls are already in the media cache. */
export async function cachedCount(urls: string[]): Promise<number> {
  try {
    const c = await caches.open(CACHE);
    const keys = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
    return urls.filter((u) => keys.has(new URL(u, location.href).pathname)).length;
  } catch {
    return 0;
  }
}

export async function baseMediaUrls(): Promise<string[]> {
  const list = await allExercises();
  return list.filter((e) => e.source === 'base' && e.gif).map((e) => e.gif!);
}

/**
 * Downloads every base gif into the cache, 6 at a time.
 * Goes straight to Cache Storage so it works even before the service worker controls the page.
 */
export async function downloadAllMedia(onProgress: (done: number, total: number) => void): Promise<{ done: number; total: number }> {
  const urls = await baseMediaUrls();
  const c = await caches.open(CACHE);
  const have = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
  let done = urls.filter((u) => have.has(new URL(u, location.href).pathname)).length;
  const todo = urls.filter((u) => !have.has(new URL(u, location.href).pathname));
  onProgress(done, urls.length);

  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const u = todo[i++];
      try {
        const r = await fetch(u);
        if (r.ok) {
          await c.put(u, r);
          done++;
          onProgress(done, urls.length);
        }
      } catch {
        // offline or failed: counted as not done
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { done, total: urls.length };
}
