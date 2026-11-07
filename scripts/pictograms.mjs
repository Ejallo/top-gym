// Draws yoga pose pictograms (stick figures on a lime mat) into public/pict/<key>.svg.
// Poses the open ExerciseDB catalog has no gif for. Usage: node scripts/pictograms.mjs
import { mkdir, writeFile } from 'node:fs/promises';

const INK = '#0b0b0b';
const FAR = '#9a9a9a'; // limbs on the far side

// Each pose: head [x, y], lines (near side) and far (far side) as point lists [x, y, x, y, ...].
// A line starting with 'q' is a quadratic curve: q, x1, y1, cx, cy, x2, y2.
const POSES = {
  mountain: { head: [100, 34], lines: [[100, 50, 100, 102], [100, 102, 96, 138, 95, 172], [100, 102, 104, 138, 105, 172], [100, 56, 82, 80, 78, 106], [100, 56, 118, 80, 122, 106]] },
  tree: { head: [100, 34], lines: [[100, 50, 100, 98], [100, 98, 100, 136, 100, 172], [100, 98, 130, 118, 104, 130], [100, 54, 80, 34, 98, 8], [100, 54, 120, 34, 102, 8]] },
  warrior1: { head: [96, 34], lines: [[97, 50, 100, 100], [100, 100, 138, 110, 141, 172], [100, 100, 72, 138, 44, 172], [97, 54, 106, 30, 110, 6]] },
  warrior2: { head: [100, 40], lines: [[100, 56, 100, 104], [100, 104, 140, 120, 142, 172], [100, 104, 70, 138, 42, 172], [100, 62, 140, 62, 178, 62], [100, 62, 60, 62, 22, 62]] },
  triangle: { head: [160, 86], lines: [[100, 112, 146, 92], [100, 112, 130, 142, 158, 172], [100, 112, 70, 142, 42, 172], [144, 94, 148, 120, 152, 146], [144, 94, 140, 68, 136, 42]] },
  chair: { head: [116, 54], lines: [[92, 118, 110, 70], [92, 118, 128, 136, 112, 172], [110, 72, 124, 48, 138, 24]] },
  forwardfold: { head: [124, 152], lines: [[96, 100, 118, 138], [96, 100, 97, 136, 98, 172], [118, 140, 124, 158, 128, 172]] },
  downdog: { head: [54, 140], lines: [[110, 92, 64, 124], [110, 92, 136, 132, 160, 172], [64, 124, 50, 148, 36, 172]] },
  cobra: { head: [58, 104], lines: [[110, 160, 68, 118], [110, 160, 146, 166, 184, 170], [70, 122, 70, 146, 72, 172]] },
  child: { head: [74, 160], lines: [[140, 148, 92, 150], [140, 148, 104, 166, 150, 172], [92, 152, 62, 166, 28, 170]] },
  catcow: { head: [46, 134], lines: [['q', 140, 120, 100, 84, 60, 120], [140, 120, 140, 170, 178, 172], [60, 122, 60, 146, 60, 172]] },
  pigeon: { head: [100, 76], lines: [[100, 140, 100, 92], [100, 140, 70, 160, 114, 168], [100, 140, 140, 160, 184, 170], [100, 96, 86, 130, 80, 166]] },
  bridge: { head: [42, 162], lines: [[60, 166, 118, 126], [118, 126, 150, 118, 154, 172], [62, 168, 90, 172, 116, 172]] },
  happybaby: { head: [54, 160], far: [[124, 164, 118, 128, 120, 90]], lines: [[70, 166, 124, 166], [124, 164, 104, 132, 106, 92], [72, 164, 88, 128, 104, 94]] },
  seatedfold: { head: [130, 138], lines: [[70, 166, 118, 140], [70, 166, 110, 168, 150, 168, 154, 152], [118, 142, 136, 152, 150, 158]] },
  shavasana: { head: [34, 160], lines: [[50, 166, 102, 166], [102, 166, 140, 168, 176, 168], [52, 166, 74, 172, 98, 172]] },
  lowlunge: { head: [99, 70], lines: [[98, 86, 96, 134], [96, 134, 130, 132, 130, 172], [96, 134, 70, 168, 28, 170], [98, 88, 104, 60, 108, 34]] },
};

function path(l) {
  if (l[0] === 'q') {
    const [, x1, y1, cx, cy, x2, y2] = l;
    return `<path d="M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}"`;
  }
  const pts = [];
  for (let i = 0; i < l.length; i += 2) pts.push(`${l[i]},${l[i + 1]}`);
  return `<polyline points="${pts.join(' ')}"`;
}

function svg(p) {
  const stroke = (c) => `fill="none" stroke="${c}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
    '<rect width="200" height="200" fill="#fff"/>',
    `<rect x="8" y="177" width="184" height="9" fill="#d4ff00" stroke="${INK}" stroke-width="3"/>`,
    ...(p.far ?? []).map((l) => `${path(l)} ${stroke(FAR)}`),
    ...p.lines.map((l) => `${path(l)} ${stroke(INK)}`),
    `<circle cx="${p.head[0]}" cy="${p.head[1]}" r="12" fill="${INK}"/>`,
    '</svg>',
  ].join('');
}

const out = new URL('../public/pict/', import.meta.url);
await mkdir(out, { recursive: true });
for (const [k, p] of Object.entries(POSES)) await writeFile(new URL(`${k}.svg`, out), svg(p));
console.log('pictograms', Object.keys(POSES).length);
