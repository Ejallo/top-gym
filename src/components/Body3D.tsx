import { useEffect, useRef } from 'react';
import type { Muscle } from '../lib/muscles';

/** Load 0..1 → colour: none, low (olive), medium (lime), high (pink). */
function colorFor(v: number): number {
  if (v <= 0) return 0x2b2b2b;
  if (v < 0.34) return 0x5a6e10;
  if (v < 0.67) return 0xd4ff00;
  return 0xff3d7f;
}

/**
 * Faceted 3D mannequin coloured by muscle load. Drag to rotate, idles with a slow spin.
 * three.js is loaded lazily so the rest of the app doesn't pay for it.
 */
export function Body3D({ load, height = 240 }: { load: Record<Muscle, number>; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const loadKey = JSON.stringify(load);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import('three').then((THREE) => {
      const el = wrap.current;
      if (disposed || !el) return;
      const w = el.clientWidth;
      const h = height;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
      cam.position.set(0, 1.02, 5.3);
      cam.lookAt(0, 1, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(2, 3, 4);
      scene.add(key);

      const body = new THREE.Group();
      const geos: { dispose(): void }[] = [];
      const add = (geo: InstanceType<typeof THREE.CapsuleGeometry> | InstanceType<typeof THREE.SphereGeometry>, m: Muscle | null, p: [number, number, number], s?: [number, number, number], rz = 0) => {
        const mat = new THREE.MeshLambertMaterial({ color: m ? colorFor(load[m]) : 0x2b2b2b, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...p);
        if (s) mesh.scale.set(...s);
        mesh.rotation.z = rz;
        body.add(mesh);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0x000000 }));
        edges.position.copy(mesh.position);
        edges.scale.copy(mesh.scale);
        edges.rotation.copy(mesh.rotation);
        body.add(edges);
        geos.push(geo, mat, edges.geometry, edges.material as { dispose(): void });
      };
      const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 8);
      const sph = (r: number) => new THREE.SphereGeometry(r, 10, 8);

      add(sph(0.14), null, [0, 1.92, 0]);
      add(cap(0.06, 0.06), 'neck', [0, 1.75, 0]);
      add(cap(0.3, 0.5), null, [0, 1.28, 0], [1, 1, 0.62]);
      for (const sx of [-1, 1]) {
        add(sph(0.17), 'chest', [sx * 0.14, 1.43, 0.13], [1, 0.72, 0.5]);
        add(sph(0.17), 'lats', [sx * 0.16, 1.28, -0.12], [1, 1.2, 0.45]);
        add(sph(0.12), 'traps', [sx * 0.11, 1.6, -0.08], [1, 0.6, 0.6]);
        add(sph(0.13), 'shoulders', [sx * 0.42, 1.56, 0]);
        add(cap(0.07, 0.2), 'biceps', [sx * 0.5, 1.3, 0.035], undefined, sx * 0.08);
        add(cap(0.07, 0.2), 'triceps', [sx * 0.5, 1.3, -0.04], undefined, sx * 0.08);
        add(cap(0.058, 0.24), 'forearms', [sx * 0.54, 0.98, 0], undefined, sx * 0.05);
        add(sph(0.13), 'glutes', [sx * 0.1, 0.86, -0.09], [1, 1, 0.8]);
        add(cap(0.115, 0.36), 'quads', [sx * 0.15, 0.58, 0.03]);
        add(cap(0.1, 0.36), 'hams', [sx * 0.15, 0.58, -0.04]);
        add(cap(0.06, 0.26), 'adductors', [sx * 0.07, 0.62, 0]);
        add(cap(0.08, 0.28), 'calves', [sx * 0.15, 0.2, -0.01]);
      }
      add(cap(0.11, 0.22), 'abs', [0, 1.1, 0.13], [1.25, 1, 0.45]);
      add(cap(0.1, 0.16), 'lowerback', [0, 1.05, -0.13], [1.3, 1, 0.45]);
      add(sph(0.22), null, [0, 0.9, 0], [1.25, 0.7, 0.8]);
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
        geos.forEach((g) => g.dispose());
        renderer.dispose();
        c.remove();
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, height]);

  return <div ref={wrap} className="body3d" style={{ height }} />;
}
