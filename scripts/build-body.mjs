// Builds public/body/body.bin — the 3D body for the Progress tab.
//
// Source: BodyParts3D 4.0 (99% reduced OBJ set), © The Database Center for Life Science, CC BY 4.0.
//   https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/  (isa_BP3D_4.0_obj_99.zip, unzipped)
// Usage: node scripts/build-body.mjs <dir with isa_BP3D_4.0_obj_99/>
//
// Only the skin surface ships. Muscle meshes are used here to tag every skin vertex with the
// muscle group lying under it, so the app can tint skin zones by training load.
//
// body.bin layout (little endian):
//   u32 vertexCount, u32 indexCount
//   i16[vertexCount*3] position, units of 0.1 mm, Y up, feet at y=0, facing +Z
//   u16[indexCount]    triangles
//   u8[vertexCount]    muscle index into MUSCLE_ORDER, 255 = none
//   u8[vertexCount]    zone weight 0..255 (fades towards zone edges)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'meshoptimizer';

// Must match the order used in src/components/Body3D.tsx.
const MUSCLE_ORDER = ['chest', 'lats', 'traps', 'lowerback', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hams', 'calves', 'adductors', 'neck'];
const MATCH = {
  chest: /pectoralis (major|minor)/,
  shoulders: /deltoid/,
  traps: /trapezius|levator scapulae|rhomboid/,
  biceps: /biceps brachii|brachialis|coracobrachialis/,
  triceps: /triceps brachii|anconeus/,
  forearms: /brachioradialis|carpi|digitorum superficialis|digitorum profundus|extensor digitorum(?! longus)|palmaris|pronator|supinator|pollicis longus|extensor digiti minimi|extensor indicis/,
  abs: /external oblique|internal oblique|rectus abdominis|transversus abdominis|pyramidalis/,
  // BodyParts3D has no latissimus dorsi: the surrounding back muscles stand in for it.
  lats: /latissimus|teres major|teres minor|infraspinatus|supraspinatus|serratus anterior/,
  lowerback: /iliocostalis|longissimus|spinalis|multifidus|quadratus lumborum/,
  glutes: /gluteus|tensor fasciae latae|piriformis/,
  quads: /rectus femoris|vastus|sartorius/,
  hams: /biceps femoris|semitendinosus|semimembranosus/,
  adductors: /adductor (longus|brevis|magnus|minimus)|gracilis|pectineus/,
  calves: /gastrocnemius|soleus|tibialis anterior|fibularis|peroneus|plantaris|extensor digitorum longus|extensor hallucis longus/,
  neck: /sternocleidomastoid|splenius|scalene/,
};
const SKIN_ID = 'FJ2810';
const TARGET_RATIO = 0.3; // keep ~30% of triangles

const root = process.argv[2];
if (!root) throw new Error('usage: node scripts/build-body.mjs <bodyparts3d dir>');
const objDir = path.join(root, 'isa_BP3D_4.0_obj_99');

function parseObj(txt) {
  const v = [];
  const f = [];
  for (const line of txt.split('\n')) {
    if (line.startsWith('v ')) { const [, x, y, z] = line.trim().split(/\s+/); v.push(+x, +y, +z); }
    else if (line.startsWith('f ')) { const t = line.slice(2).trim().split(/\s+/).map((s) => +s.split('/')[0] - 1); for (let i = 1; i + 1 < t.length; i++) f.push(t[0], t[i], t[i + 1]); }
  }
  return { v, f };
}

// --- skin, welded ---
const raw = parseObj(fs.readFileSync(path.join(objDir, SKIN_ID + '.obj'), 'utf8'));
const remap = new Map();
const Pl = [];
const vmap = new Int32Array(raw.v.length / 3);
for (let i = 0; i < vmap.length; i++) {
  const k = raw.v.slice(i * 3, i * 3 + 3).map((c) => Math.round(c * 2)).join(',');
  let j = remap.get(k);
  if (j === undefined) { j = Pl.length / 3; remap.set(k, j); Pl.push(raw.v[i * 3], raw.v[i * 3 + 1], raw.v[i * 3 + 2]); }
  vmap[i] = j;
}
const tri = [];
for (let i = 0; i < raw.f.length; i += 3) {
  const a = vmap[raw.f[i]], b = vmap[raw.f[i + 1]], c = vmap[raw.f[i + 2]];
  if (a !== b && b !== c && a !== c) tri.push(a, b, c);
}
const n = Pl.length / 3;
const P = Float64Array.from(Pl);
console.log('skin', n, 'verts', tri.length / 3, 'tris');

// --- mannequin groin (source coords: mm, Z up, front = -Y) ---
{
  const plane = (z) => (z >= 800 ? -175 : z <= 640 ? -62 : -62 - ((z - 640) / 160) * 113);
  const w = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], z = P[v * 3 + 2];
    const d = Math.max(Math.abs(x) / 60, Math.abs(z - 715) / 125);
    if (d < 1.4 && P[v * 3 + 1] < 10) w[v] = Math.min(1, (1.4 - d) / 0.5);
    if (Math.abs(x) < 55 && z > 585 && z < 805) {
      if (P[v * 3 + 1] < plane(z)) P[v * 3 + 1] = plane(z);
      const y = P[v * 3 + 1];
      const floor = 605 + Math.max(0, -55 - y) * 1.9;
      if (Math.abs(x) < 45 && y < -50 && z < floor) P[v * 3 + 2] = floor;
    }
  }
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < tri.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[tri[t + a]].add(tri[t + b]);
  for (let it = 0; it < 80; it++) {
    const np = P.slice();
    for (let v = 0; v < n; v++) {
      if (!w[v] || !nb[v].size) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const u of nb[v]) { sx += P[u * 3]; sy += P[u * 3 + 1]; sz += P[u * 3 + 2]; }
      const c = nb[v].size, k = 0.6 * w[v];
      np[v * 3] += (sx / c - P[v * 3]) * k; np[v * 3 + 1] += (sy / c - P[v * 3 + 1]) * k; np[v * 3 + 2] += (sz / c - P[v * 3 + 2]) * k;
    }
    P.set(np);
  }
}

// --- muscle zones: nearest muscle surface sample within MAXD mm ---
const CELL = 30, MAXD = 40, CORE = 18;
const grid = new Map();
const cell = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
for (const file of fs.readdirSync(objDir)) {
  if (!file.endsWith('.obj') || file === SKIN_ID + '.obj') continue;
  const txt = fs.readFileSync(path.join(objDir, file), 'utf8');
  const name = (txt.match(/# English name : (.*)/) || [])[1]?.trim().toLowerCase() ?? '';
  const gi = MUSCLE_ORDER.findIndex((m) => MATCH[m].test(name));
  if (gi < 0) continue;
  const { v } = parseObj(txt);
  for (let i = 0; i < v.length; i += 6) {
    const k = cell(v[i], v[i + 1], v[i + 2]);
    let b = grid.get(k); if (!b) grid.set(k, (b = []));
    b.push(v[i], v[i + 1], v[i + 2], gi);
  }
}
const group = new Uint8Array(n).fill(255);
const weight = new Uint8Array(n);
for (let v = 0; v < n; v++) {
  const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
  let best = MAXD * MAXD, bg = -1;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const b = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!b) continue;
    for (let i = 0; i < b.length; i += 4) {
      const d = (b[i] - x) ** 2 + (b[i + 1] - y) ** 2 + (b[i + 2] - z) ** 2;
      if (d < best) { best = d; bg = b[i + 3]; }
    }
  }
  if (bg >= 0) { group[v] = bg; weight[v] = Math.round(255 * (1 - Math.max(0, Math.sqrt(best) - CORE) / (MAXD - CORE))); }
}

// --- simplify, compact ---
await MeshoptSimplifier.ready;
const [simp] = MeshoptSimplifier.simplify(new Uint32Array(tri), new Float32Array(P), 3, Math.floor((tri.length * TARGET_RATIO) / 3) * 3, 0.002);
const keep = new Int32Array(n).fill(-1);
let m = 0;
for (const i of simp) if (keep[i] < 0) keep[i] = m++;
if (m > 65535) throw new Error('too many vertices for u16 indices: ' + m);

let minZ = Infinity, sx = 0, sy = 0, cnt = 0;
for (let v = 0; v < n; v++) if (keep[v] >= 0) { minZ = Math.min(minZ, P[v * 3 + 2]); sx += P[v * 3]; sy += P[v * 3 + 1]; cnt++; }
sx /= cnt; sy /= cnt;

const buf = Buffer.alloc(8 + m * 6 + simp.length * 2 + m * 2 + 4);
buf.writeUInt32LE(m, 0);
buf.writeUInt32LE(simp.length, 4);
let o = 8;
const pos = new Int16Array(buf.buffer, buf.byteOffset + o, m * 3);
for (let v = 0; v < n; v++) {
  const j = keep[v]; if (j < 0) continue;
  pos[j * 3] = Math.round((P[v * 3] - sx) * 10); // x
  pos[j * 3 + 1] = Math.round((P[v * 3 + 2] - minZ) * 10); // up
  pos[j * 3 + 2] = Math.round(-(P[v * 3 + 1] - sy) * 10); // front → +Z
}
o += m * 6;
const idx = new Uint16Array(buf.buffer, buf.byteOffset + o, simp.length);
for (let i = 0; i < simp.length; i++) idx[i] = keep[simp[i]];
o += simp.length * 2;
for (let v = 0; v < n; v++) if (keep[v] >= 0) { buf[o + keep[v]] = group[v]; buf[o + m + keep[v]] = weight[v]; }
o += m * 2;

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'body', 'body.bin');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf.subarray(0, o));
console.log('out', m, 'verts', simp.length / 3, 'tris', (o / 1024).toFixed(0) + ' KB →', out);
