// Downloads the full ExerciseDB open catalog (25 per page, cursor pagination) into scripts/raw/catalog.json.
// The API is rate-limited (Cloudflare 1015), so requests are spaced out and retried with backoff.
import { writeFile, readFile } from 'node:fs/promises';

const OUT = new URL('./raw/catalog.json', import.meta.url);
const API = 'https://oss.exercisedb.dev/api/v1/exercises';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let all = [];
let cursor = '';
try {
  const prev = JSON.parse(await readFile(OUT, 'utf8'));
  all = prev.items;
  cursor = prev.cursor;
  console.log(`resume: ${all.length} items, cursor ${cursor}`);
} catch {}

for (let page = 0; page < 200; page++) {
  const url = `${API}?limit=25${cursor ? `&after=${cursor}` : ''}`;
  let json;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url);
    const text = await r.text();
    if (text.startsWith('{')) {
      json = JSON.parse(text);
      break;
    }
    const wait = Math.min(120000, 15000 * (attempt + 1));
    console.log(`limited (${text.slice(0, 20)}), wait ${wait / 1000}s`);
    await sleep(wait);
  }
  all.push(...json.data);
  cursor = json.meta.nextCursor;
  await writeFile(OUT, JSON.stringify({ cursor, items: all }));
  console.log(`page ${page}: ${all.length}/${json.meta.total}`);
  if (!json.meta.hasNextPage) break;
  await sleep(4000);
}
console.log('done', all.length);
