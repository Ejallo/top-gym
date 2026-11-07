import { useEffect, useRef } from 'react';
import type { Muscle } from '../lib/muscles';

// Order of muscle indices baked into public/body/body.bin (see scripts/build-body.mjs).
const ORDER: Muscle[] = ['chest', 'lats', 'traps', 'lowerback', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hams', 'calves', 'adductors', 'neck'];

const BASE = 0x3a3a3c; // graphite skin
/** Load 0..1 → zone colour, or null when the muscle wasn't trained. */
function heat(v: number): number | null {
  if (!v || v <= 0) return null;
  if (v < 0.34) return 0x8fb017;
  if (v < 0.67) return 0xd4ff00;
  return 0xff3d7f;
}

type BodyData = { pos: Float32Array; index: Uint16Array; group: Uint8Array; weight: Uint8Array };
let bodyData: Promise<BodyData> | null = null;

function loadBody(): Promise<BodyData> {
  bodyData ??= fetch(`${import.meta.env.BASE_URL}body/body.bin`)
    .then((r) => {
      if (!r.ok) throw new Error('body.bin ' + r.status);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const head = new DataView(buf);
      const nv = head.getUint32(0, true);
      const ni = head.getUint32(4, true);
      let o = 8;
      const q = new Int16Array(buf, o, nv * 3);
      o += nv * 6;
      const index = new Uint16Array(buf, o, ni);
      o += ni * 2;
      const group = new Uint8Array(buf, o, nv);
      const weight = new Uint8Array(buf, o + nv, nv);
      const pos = new Float32Array(nv * 3);
      for (let i = 0; i < pos.length; i++) pos[i] = q[i] / 10000; // 0.1 mm → m
      return { pos, index, group, weight };
    });
  bodyData.catch(() => (bodyData = null));
  return bodyData;
}

/** Per-vertex colours: graphite skin tinted over trained muscles, edges softened over the mesh. */
function vertexColors(d: BodyData, load: Record<Muscle, number>, THREE: typeof import('three')): Float32Array {
  const nv = d.group.length;
  const col = new Float32Array(nv * 3);
  const base = new THREE.Color(BASE);
  const c = new THREE.Color();
  const hc = new THREE.Color();
  for (let v = 0; v < nv; v++) {
    c.copy(base);
    const g = d.group[v];
    const h = g < ORDER.length ? heat(load[ORDER[g]]) : null;
    if (h != null) c.lerp(hc.setHex(h), d.weight[v] / 255);
    col[v * 3] = c.r;
    col[v * 3 + 1] = c.g;
    col[v * 3 + 2] = c.b;
  }
  const idx = d.index;
  const acc = new Float32Array(nv * 3);
  const cnt = new Float32Array(nv);
  for (let pass = 0; pass < 2; pass++) {
    acc.fill(0);
    cnt.fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], e = idx[t + 2];
      for (const [p, q1, q2] of [[a, b, e], [b, a, e], [e, a, b]]) {
        for (const s of [p, q1, q2]) {
          acc[p * 3] += col[s * 3];
          acc[p * 3 + 1] += col[s * 3 + 1];
          acc[p * 3 + 2] += col[s * 3 + 2];
        }
        cnt[p] += 3;
      }
    }
    for (let v = 0; v < nv; v++) if (cnt[v]) for (let k = 0; k < 3; k++) col[v * 3 + k] = acc[v * 3 + k] / cnt[v];
  }
  return col;
}

/**
 * Realistic 3D body (BodyParts3D skin) with skin zones tinted by muscle load.
 * Drag to rotate, idles with a slow spin. three.js and the mesh are loaded lazily.
 */
export function Body3D({ load, height = 300 }: { load: Record<Muscle, number>; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const loadKey = JSON.stringify(load);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void Promise.all([import('three'), loadBody()]).then(([THREE, data]) => {
      const el = wrap.current;
      if (disposed || !el) return;
      const w = el.clientWidth;
      const h = height;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(22, w / h, 0.1, 50);
      cam.position.set(0, 0.88, 4.9);
      cam.lookAt(0, 0.86, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.0);
      key.position.set(0.8, 1.6, 1.6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x9ec8ff, 1.3);
      rim.position.set(-1.5, 1.2, -1.2);
      scene.add(rim);
      const back = new THREE.DirectionalLight(0xffffff, 1.0);
      back.position.set(0.6, 1.4, -1.8);
      scene.add(back);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
      geo.setIndex(new THREE.BufferAttribute(data.index, 1));
      geo.setAttribute('color', new THREE.BufferAttribute(vertexColors(data, load, THREE), 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
      const body = new THREE.Mesh(geo, mat);
      scene.add(body);

      let ry = 0.5;
      let drag = false;
      let px = 0;
      let idleAt = 0;
      const down = (e: PointerEvent) => {
        drag = true;
        px = e.clientX;
        renderer.domElement.setPointerCapture(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        if (!drag) return;
        ry += (e.clientX - px) * 0.012;
        px = e.clientX;
      };
      const up = () => {
        drag = false;
        idleAt = performance.now() + 2500;
      };
      const c = renderer.domElement;
      c.style.touchAction = 'pan-y';
      c.addEventListener('pointerdown', down);
      c.addEventListener('pointermove', move);
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);

      let raf = 0;
      const loop = (now: number) => {
        if (!drag && now > idleAt) ry += 0.006;
        body.rotation.y = ry;
        renderer.render(scene, cam);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(raf);
        geo.dispose();
        mat.dispose();
        renderer.dispose();
        c.remove();
      };
    }).catch((e) => console.warn('Body3D', e));
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, height]);

  return <div ref={wrap} className="body3d" style={{ height }} />;
}
