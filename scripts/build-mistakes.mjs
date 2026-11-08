// Adds common mistakes to the bundled exercise texts:
//   scripts/mistakes/<lang>/*.txt  one exercise per line: "english name :: mistake | mistake | mistake"
//   public/data/exercises.<lang>.json  gets e: [...] next to n (name) and s (steps)
// Idempotent; build-base.mjs runs it at the end. Usage: node scripts/build-mistakes.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));

const rows = await read('public/data/exercises.json');
for (const lang of ['ru', 'de']) {
  const mistakes = {};
  for (const f of (await readdir(new URL(`scripts/mistakes/${lang}/`, root))).filter((f) => f.endsWith('.txt')))
    for (const line of (await readFile(new URL(`scripts/mistakes/${lang}/${f}`, root), 'utf8')).split(/\r?\n/)) {
      const [name, list] = line.split('::').map((x) => x?.trim());
      if (!name || !list || name.startsWith('#')) continue;
      mistakes[name.toLowerCase()] = list.split('|').map((x) => x.trim()).filter(Boolean);
    }
  const textPath = `public/data/exercises.${lang}.json`;
  const text = await read(textPath);
  const missing = [];
  for (const r of rows) {
    const m = mistakes[r.en.toLowerCase()];
    if (!text[r.id]) continue;
    if (m?.length) text[r.id].e = m;
    else {
      delete text[r.id].e;
      missing.push(r.en);
    }
  }
  const known = new Set(rows.map((r) => r.en.toLowerCase()));
  const unused = Object.keys(mistakes).filter((k) => !known.has(k));
  await writeFile(new URL(textPath, root), JSON.stringify(text));
  console.log(`${lang}: mistakes ${rows.length - missing.length}/${rows.length}`);
  if (missing.length) console.log(`  MISSING ${lang}:`, missing.join(' | '));
  if (unused.length) console.log(`  UNUSED ${lang}:`, unused.join(' | '));
}
