'use client';

import { useEffect, useRef, useState } from 'react';
import wordmark from '@/lib/wordmark.json';

/**
 * MUSETRADE, inflated.
 *
 * The letters are Baloo 2 at 800 — the face musebook sets its whole town in —
 * pulled out of the TTF at build time (scripts/glyphs.py) and shipped as path
 * data. They are extruded with a fat bevel so they read as soft vinyl toys,
 * not type: ink brown for MUSE, the inherited half, and clover for TRADE,
 * the half that is ours (cream letters vanished into the cream page). The
 * pointer leans the word a few degrees; each letter breathes, barely.
 *
 * The flat SVG underneath is the real content: it is what renders before the
 * 3D arrives, when JS never runs, and when the reader has asked for less
 * motion.
 */

type Letter = { char: string; d: string; advance: number };
const LETTERS = wordmark.letters as Letter[];
const TRACKING = -0.005;
const CAP = wordmark.capHeight;
const totalWidth = LETTERS.reduce((w, l) => w + l.advance + TRACKING, -TRACKING);
const OURS = 4; // index where TRADE starts
const LEAN_Y = 0.14; // max lean toward the pointer, radians
const LEAN_X = 0.08;

function layout() {
  let x = 0;
  return LETTERS.map((l) => { const at = x; x += l.advance + TRACKING; return { ...l, x: at }; });
}

export default function Wordmark3D({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const placed = layout();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let stop = () => {};
    let cancelled = false;
    const start = () => {
      import('three').then(async (THREE) => {
        const { SVGLoader } = await import('three/examples/jsm/loaders/SVGLoader.js');
        if (cancelled) return;
        try { stop = build(THREE, SVGLoader, el, () => setLive(true)); } catch { /* flat wordmark stays */ }
      });
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (h: number) => void };
    const handle = w.requestIdleCallback ? w.requestIdleCallback(start) : window.setTimeout(start, 150);
    return () => { cancelled = true; if (w.cancelIdleCallback) w.cancelIdleCallback(handle); else clearTimeout(handle); stop(); };
  }, []);

  const pad = 0.12;
  return (
    <div className={`relative ${className}`} style={{ aspectRatio: `${totalWidth + pad * 2} / ${CAP + pad * 2.6}` }}>
      <svg
        viewBox={`${-pad} ${-(CAP + pad * 1.3)} ${totalWidth + pad * 2} ${CAP + pad * 2.6}`}
        className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${live ? 'opacity-0' : 'opacity-100'}`}
        role="img" aria-label="MUSETRADE"
      >
        {placed.map((l, i) => (
          <path key={i} d={l.d} transform={`translate(${l.x} 0)`} fill={i >= OURS ? '#2f8a52' : '#4a3b32'} />
        ))}
      </svg>
      <div ref={host} className="absolute pointer-events-none" style={{ inset: '-38% -9%' }} aria-hidden />
    </div>
  );
}

type Three = typeof import('three');
type Loader = typeof import('three/examples/jsm/loaders/SVGLoader.js').SVGLoader;

function build(THREE: Three, SVGLoader: Loader, host: HTMLDivElement, onLive: () => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);

  // The room: a pastel sky, a warm floor, one bright soft window. A matte
  // vinyl only ever shows its surroundings as a blur, so the map is broad.
  const env = document.createElement('canvas'); env.width = 512; env.height = 256;
  const g = env.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, '#dcefff'); grad.addColorStop(0.55, '#fff3e6'); grad.addColorStop(0.8, '#ffd9c2'); grad.addColorStop(1, '#f2c7b2');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(60, 40, 170, 70);
  g.fillStyle = 'rgba(168,230,207,0.6)'; g.fillRect(330, 90, 120, 60);
  const envTex = new THREE.CanvasTexture(env); envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  envTex.dispose(); pmrem.dispose();

  const vinyl = (color: number, sheen: number) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.48, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35,
    sheen: 0.5, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.6, envMapIntensity: 0.4, side: THREE.DoubleSide,
  });
  const cream = vinyl(0x55403a, 0xb08a70); // ink, warmed a step so it reads as a toy and not a shadow
  const clover = vinyl(0x1f7a43, 0x4fb374); // a touch deeper than the CSS clover: the room lightens everything

  scene.add(new THREE.HemisphereLight(0xfff8f1, 0xffd0b8, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-2, 3, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xcdb4f6, 0.5); fill.position.set(3, -1, 2); scene.add(fill);

  const group = new THREE.Group();
  const placed = layout();
  const loader = new SVGLoader();
  const letters: { mesh: import('three').Mesh; i: number }[] = [];
  placed.forEach((l, i) => {
    const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${l.d}"/></svg>`);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelOffset: -0.002, bevelSegments: 10, curveSegments: 22 });
    geo.scale(1, -1, 1); // font paths are Y-down; DoubleSide covers the flipped winding
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, i >= OURS ? clover : cream);
    mesh.position.set(l.x - totalWidth / 2, -CAP / 2, 0);
    group.add(mesh);
    letters.push({ mesh, i });
  });
  scene.add(group);

  let width = 1, height = 1;
  const fit = () => {
    const r = host.getBoundingClientRect();
    width = Math.max(1, r.width); height = Math.max(1, r.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    // Fit by projecting the group's corners, not by trigonometry: the near
    // faces of a tilted, extruded word are bigger than any plane says.
    camera.position.set(0, 0, 4);
    // Size the unleaned word to the flat SVG under it (the host is 118% of the
    // box wide, so the word wants 1/1.18 of the canvas); a lean then spills
    // into the canvas margin instead of shrinking the word.
    const saved = group.rotation.clone();
    group.rotation.set(0, 0, 0); group.updateMatrixWorld(true);
    for (let pass = 0; pass < 4; pass++) {
      camera.updateMatrixWorld();
      const box = new THREE.Box3().setFromObject(group);
      let maxX = 0;
      for (const cx of [box.min.x, box.max.x]) for (const cz of [box.min.z, box.max.z]) {
        const v = new THREE.Vector3(cx, 0, cz).project(camera);
        maxX = Math.max(maxX, Math.abs(v.x));
      }
      camera.position.z *= maxX / 0.83;
    }
    group.rotation.copy(saved);
  };
  const ro = new ResizeObserver(fit); ro.observe(host);

  const target = { x: 0, y: 0 }; const cur = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    const px = (e.clientX - (r.left + r.width / 2)) / Math.max(r.width, 1);
    const py = (e.clientY - (r.top + r.height / 2)) / Math.max(r.height, 1);
    target.y = Math.max(-1, Math.min(1, px)) * LEAN_Y;
    target.x = Math.max(-1, Math.min(1, py)) * LEAN_X;
  };
  const onLeave = () => { target.x = 0; target.y = 0; };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }, { threshold: 0.01 });
  io.observe(host);

  let raf = 0; let shown = false; const t0 = performance.now();
  const loop = () => {
    if (!visible) return;
    raf = requestAnimationFrame(loop);
    const t = (performance.now() - t0) / 1000;
    cur.x += (target.x - cur.x) * 0.04; cur.y += (target.y - cur.y) * 0.04;
    group.rotation.set(cur.x, cur.y, 0);
    for (const { mesh, i } of letters) {
      mesh.position.y = -CAP / 2 + Math.sin(t * 0.7 + i * 0.8) * 0.004;
      mesh.rotation.x = Math.sin(t * 0.5 + i) * 0.01;
    }
    renderer.render(scene, camera);
    if (!shown) { shown = true; onLive(); }
  };
  fit(); loop();

  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave);
    letters.forEach(({ mesh }) => mesh.geometry.dispose()); cream.dispose(); clover.dispose();
    renderer.dispose(); renderer.domElement.remove();
  };
}
