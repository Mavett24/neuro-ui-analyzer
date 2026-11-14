"use client";

import { useEffect, useRef, useState } from "react";
import { useLatest } from "../../lib/hooks";
import * as THREE from "three";
import { loadSurfaceData, TERMS } from "../../lib/brain";
import { REGIONS } from "../../lib/regions";

// Pixel brain. The real ICBM152 cortical surface is rendered into a tiny render target, then drawn
// as a grid of dithered phosphor cells. The activation on it is real: NeuroQuery maps, crossfading
// from one cognitive function to the next. Fades out top and bottom. Renders only while visible.
//
// interactive: hovering opens a fovea-sized lens (sharper, brighter, periphery dims), the sway and
//   the map cycle hold still, and onRegion reports the AAL region under the cursor.
// focus: a term key. While set, the cycle stops and the brain blends to that map.

const CYCLE = ["visual", "attention", "reading", "faces", "load", "reward"];
const HOLD_MS = 2600;
const BLEND_MS = 1200;
const LENS = 6.5; // lens radius, in cells

const BRAIN_VERT = /* glsl */ `
  attribute float aConv;
  attribute float aA;
  attribute float aB;
  uniform float uMix;
  varying float vConv;
  varying float vAct;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vConv = aConv;
    vAct = mix(aA, aB, uMix);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const BRAIN_FRAG = /* glsl */ `
  varying float vConv;
  varying float vAct;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vN);
    vec3 l = normalize(vec3(-0.35, 0.55, 0.75));
    float diff = max(dot(n, l), 0.0);
    float rim = pow(1.0 - max(dot(n, vView), 0.0), 2.2);
    // Gyri bright, sulci dark: convexity carries the folding, light gives the volume.
    float conv = vConv * 0.5 + 0.5;
    float lum = 0.08 + 0.42 * diff + 0.5 * smoothstep(0.3, 0.75, conv) * (0.45 + 0.55 * diff) + 0.18 * rim;
    // r: shading, g: activation, b: coverage
    gl_FragColor = vec4(clamp(lum, 0.0, 1.0), clamp(vAct, 0.0, 1.0), 1.0, 1.0);
  }
`;

const QUAD_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const QUAD_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uGrid;    // cells across, cells down
  uniform vec2 uSize;    // canvas size in device px
  uniform float uCell;   // cell size in device px
  uniform float uTime;
  uniform float uReveal; // 0 to 1, rows switch on top to bottom on first view
  uniform vec2 uMouse;   // pointer, in cells from the bottom left
  uniform float uHover;  // 0 to 1
  uniform float uLens;

  float bayer(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
    m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
    float v = 0.0;
    for (int k = 0; k < 16; k++) if (k == i) v = m[k];
    return (v + 0.5) / 16.0;
  }

  void main() {
    // Whole device pixels from the bottom-left, so every cell is exactly uCell wide.
    vec2 cell = floor(gl_FragCoord.xy / uCell);
    vec2 local = gl_FragCoord.xy - cell * uCell;

    // Fovea lens around the pointer.
    float d = length(cell + 0.5 - uMouse);
    float inLens = uHover * (1.0 - smoothstep(uLens - 1.0, uLens, d));
    float ring = uHover * (1.0 - smoothstep(0.0, 0.7, abs(d - uLens - 0.6)));

    float gap = max(1.0, floor(uCell * mix(0.16, 0.06, inLens)));
    if (local.x < gap || local.y < gap) discard;

    vec4 s = texture2D(uTex, (cell + 0.5) / uGrid);
    float v = 1.0 - (cell.y + 0.5) * uCell / uSize.y;
    if (v > uReveal) discard;
    float fade = smoothstep(0.0, 0.26, v) * (1.0 - smoothstep(0.72, 1.0, v));

    if (s.b < 0.5) {
      // Outside the brain the lens draws only its outline.
      if (ring > 0.05) gl_FragColor = vec4(vec3(0.867, 1.0, 0.863) * 0.35 * ring * fade, 0.35 * ring * fade);
      else discard;
      return;
    }

    float t = bayer(cell);
    float band = exp(-pow((v - fract(uTime * 0.07) * 1.3 + 0.15) * 9.0, 2.0)) * (1.0 - uHover);
    float lum = clamp(s.r + band * 0.12 + inLens * 0.22, 0.0, 1.0);
    float act = clamp(s.g * (1.0 + inLens * 0.6), 0.0, 1.0);

    // Four tones, ordered-dithered between neighbours so shading reads as volume, not noise.
    vec3 tones[4];
    tones[0] = vec3(0.07, 0.09, 0.07);
    tones[1] = vec3(0.17, 0.21, 0.165);
    tones[2] = vec3(0.29, 0.355, 0.28);
    tones[3] = vec3(0.47, 0.585, 0.45);
    float x = lum * 3.0;
    float lo = floor(x);
    float idx = clamp((fract(x) > t) ? lo + 1.0 : lo, 0.0, 3.0);
    vec3 col = tones[0];
    for (int k = 1; k < 4; k++) if (float(k) == idx) col = tones[k];
    float alpha = 0.92;

    vec3 lime = vec3(0.498, 0.933, 0.392);
    vec3 phosphor = vec3(0.867, 1.0, 0.863);
    if (act > 0.06 && act * 1.15 > t * 0.9) {
      col = mix(lime, phosphor, smoothstep(0.6, 1.0, act));
      alpha = 1.0;
    }
    if (ring > 0.4) { col = mix(col, phosphor, 0.7); alpha = 1.0; }

    // Periphery dims while the lens is open, the way vision does.
    alpha *= 1.0 - 0.3 * uHover * (1.0 - inLens);
    alpha *= fade;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

export default function PixelBrain({
  cell = 7,
  className = "",
  onTerm,
  onRegion,
  terms = CYCLE,
  focus = null,
  interactive = false,
  zoom = 1,
}) {
  const wrap = useRef(null);
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const termCb = useLatest(onTerm);
  const regionCb = useLatest(onRegion);
  const focusRef = useLatest(focus);
  const kick = useRef(() => {});
  const list = terms.join(",");

  useEffect(() => {
    kick.current();
  }, [focus]);

  useEffect(() => {
    const cycle = list.split(",");
    let disposed = false;
    let frame = 0;
    let visible = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        powerPreference: "low-power",
      });
    } catch {
      return; // no WebGL: the copy still carries the section
    }
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 10, 2000);
    camera.up.set(0, 0, 1);
    const target = new THREE.WebGLRenderTarget(8, 8, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    const uniforms = { uMix: { value: 0 } };
    const material = new THREE.ShaderMaterial({
      vertexShader: BRAIN_VERT,
      fragmentShader: BRAIN_FRAG,
      uniforms,
      side: THREE.DoubleSide,
    });

    const q = {
      uTex: { value: target.texture },
      uGrid: { value: new THREE.Vector2(1, 1) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uCell: { value: cell },
      uTime: { value: 0 },
      uReveal: { value: reduce ? 1 : 0 },
      uMouse: { value: new THREE.Vector2(-100, -100) },
      uHover: { value: 0 },
      uLens: { value: LENS },
    };
    const quadScene = new THREE.Scene();
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quadScene.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, uniforms: q, transparent: true })
      )
    );

    const pivot = new THREE.Group();
    scene.add(pivot);
    let data = null;
    let maps = null; // [term][hemi] -> Float32Array
    let hemis = [];
    let meshes = [];
    let a = 0,
      b = 1 % cycle.length; // shown map, next map
    let blendStart = 0; // 0 = holding
    let holdStart = 0;
    let revealStart = 0;
    let sway = 0;
    let last = 0;
    let hoverTarget = 0;
    let pointer = null; // { x, y } in css px inside the wrap
    let pickPending = false;
    let grid = { gx: 1, gy: 1, c: cell, w: 1, h: 1, dpr: 1 };

    const resize = () => {
      if (!wrap.current) return;
      const w = wrap.current.clientWidth;
      const h = wrap.current.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      const c = cell * dpr;
      const gx = Math.ceil((w * dpr) / c);
      const gy = Math.ceil((h * dpr) / c);
      grid = { gx, gy, c, w, h, dpr };
      target.setSize(gx, gy);
      q.uGrid.value.set(gx, gy);
      q.uSize.value.set(w * dpr, h * dpr);
      q.uCell.value = c;
      camera.aspect = gx / gy;
      camera.updateProjectionMatrix();
    };

    const upload = () => {
      hemis.forEach((g, hemi) => {
        g.attributes.aA.array.set(maps[a][hemi]);
        g.attributes.aB.array.set(maps[b][hemi]);
        g.attributes.aA.needsUpdate = true;
        g.attributes.aB.needsUpdate = true;
      });
    };
    const startBlend = (to, now) => {
      if (to === a) return;
      if (blendStart && uniforms.uMix.value > 0.5) a = b; // mid-blend: continue from the nearer map
      b = to;
      upload();
      uniforms.uMix.value = 0;
      blendStart = now;
    };

    // Which region sits under the pointer.
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = () => {
      pickPending = false;
      if (!pointer || !data || !regionCb.current) return;
      const { gx, gy, c, h, dpr } = grid;
      // The render target spans gx by gy whole cells from the bottom-left of the canvas.
      const px = pointer.x * dpr;
      const py = (h - pointer.y) * dpr;
      ndc.set((px / (gx * c)) * 2 - 1, (py / (gy * c)) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit) return regionCb.current(null);
      const side = hit.object.userData.side;
      const v = hit.face.a;
      const region = REGIONS[data.labels[side * data.nv + v]];
      const g = hit.object.geometry.attributes;
      const act = g.aA.array[v] * (1 - uniforms.uMix.value) + g.aB.array[v] * uniforms.uMix.value;
      regionCb.current(
        region ? { ...region, side: region.side || (side ? "right" : "left"), act, x: pointer.x, y: pointer.y } : null
      );
    };

    const render = (now) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      q.uTime.value = now / 1000;
      const hv = q.uHover.value + (hoverTarget - q.uHover.value) * Math.min(1, dt / 90);
      q.uHover.value = Math.abs(hv - hoverTarget) < 0.002 ? hoverTarget : hv;
      if (!reduce) {
        // Slow sway, not a spin: the lateral view is the readable one. Holds still under the lens.
        sway += dt * (1 - q.uHover.value);
        pivot.rotation.z = Math.sin(sway / 9000) * 0.32;
        if (revealStart) q.uReveal.value = Math.min(1, (now - revealStart) / 1600);
      }
      const f = focusRef.current ? cycle.indexOf(focusRef.current) : -1;
      if (f >= 0 && f !== b) startBlend(f, now);
      if (blendStart) {
        const k = reduce ? 1 : Math.min(1, (now - blendStart) / BLEND_MS);
        uniforms.uMix.value = k * k * (3 - 2 * k);
        if (k >= 1) {
          a = b;
          b = (a + 1) % cycle.length;
          upload();
          uniforms.uMix.value = 0;
          blendStart = 0;
          holdStart = now;
          termCb.current?.(cycle[a]);
        }
      } else if (f < 0 && !reduce) {
        if (hoverTarget) holdStart += dt; // the map waits while someone is looking
        if (now - holdStart > HOLD_MS) startBlend((a + 1) % cycle.length, now);
      }
      if (pickPending) pick();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(quadScene, quadCam);
    };

    const needsFrames = () => !reduce || blendStart || q.uHover.value !== hoverTarget;
    const loop = (now) => {
      frame = 0;
      if (disposed || !visible || document.hidden) return;
      render(now);
      if (needsFrames()) frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame && maps && visible) frame = requestAnimationFrame(loop);
    };
    kick.current = start;

    const onMove = (e) => {
      const r = wrap.current.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      const { c, h, dpr } = grid;
      q.uMouse.value.set((pointer.x * dpr) / c, ((h - pointer.y) * dpr) / c);
      hoverTarget = 1;
      pickPending = true;
      start();
    };
    const onLeave = () => {
      pointer = null;
      hoverTarget = 0;
      regionCb.current?.(null);
      start();
    };
    // Touch has no hover: a tap opens the lens on that spot and holds it for a few seconds.
    let release = 0;
    const onHover = (e) => e.pointerType === "mouse" && onMove(e);
    const onExit = (e) => e.pointerType === "mouse" && onLeave();
    const onTap = (e) => {
      if (e.pointerType === "mouse") return;
      clearTimeout(release);
      onMove(e);
      release = setTimeout(onLeave, 3500);
    };
    if (interactive) {
      wrap.current.addEventListener("pointermove", onHover);
      wrap.current.addEventListener("pointerleave", onExit);
      wrap.current.addEventListener("pointerdown", onTap);
    }

    loadSurfaceData()
      .then((d) => {
        if (disposed) return;
        data = d;
        const { meta, nv, positions, indices, convexity, values } = d;
        const order = meta.terms.map((t) => t.key);
        maps = cycle.map((key) => {
          const i = order.indexOf(key);
          return [0, 1].map((hemi) => {
            const out = new Float32Array(nv);
            const off = (i * 2 + hemi) * nv;
            // Scale to the 99th percentile and keep the upper part of each map, so every function
            // reads as its own region rather than a wash over the whole cortex.
            const sorted = values.slice(off, off + nv).sort();
            const top = Math.max(1, sorted[Math.floor(nv * 0.99)]);
            for (let v = 0; v < nv; v++) out[v] = Math.min(1, Math.max(0, (values[off + v] / top - 0.3) / 0.6));
            return out;
          });
        });
        const box = new THREE.Box3();
        [false, true].forEach((mirror, side) => {
          const pos = new Float32Array(positions);
          const idx = new Uint16Array(indices);
          if (mirror) {
            for (let i = 0; i < pos.length; i += 3) pos[i] = -pos[i];
            for (let i = 0; i < idx.length; i += 3) {
              const t = idx[i + 1];
              idx[i + 1] = idx[i + 2];
              idx[i + 2] = t;
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          g.setIndex(new THREE.BufferAttribute(idx, 1));
          g.setAttribute("aConv", new THREE.BufferAttribute(convexity, 1));
          g.setAttribute("aA", new THREE.BufferAttribute(new Float32Array(nv), 1));
          g.setAttribute("aB", new THREE.BufferAttribute(new Float32Array(nv), 1));
          g.computeVertexNormals();
          g.computeBoundingBox();
          box.union(g.boundingBox);
          const m = new THREE.Mesh(g, material);
          m.userData.side = side;
          pivot.add(m);
          hemis.push(g);
          meshes.push(m);
        });
        const c = box.getCenter(new THREE.Vector3());
        meshes.forEach((m) => m.position.sub(c));
        // Left lateral view, slightly from behind and above, like the app viewer.
        camera.position.set(-450 / zoom, -30 / zoom, 70 / zoom);
        camera.lookAt(0, 0, 0);
        const f = focusRef.current ? cycle.indexOf(focusRef.current) : -1;
        a = f >= 0 ? f : 0;
        b = (a + 1) % cycle.length;
        upload();
        termCb.current?.(cycle[a]);
        resize();
        holdStart = performance.now();
        render(holdStart);
        setReady(true);
        start();
      })
      .catch(() => {});

    const ro = new ResizeObserver(() => {
      if (!wrap.current) return;
      resize();
      if (maps) render(performance.now());
    });
    ro.observe(wrap.current);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !revealStart && !reduce) {
        revealStart = performance.now();
        last = 0;
      }
      if (visible) start();
    });
    io.observe(wrap.current);
    const onVis = () => !document.hidden && start();
    document.addEventListener("visibilitychange", onVis);
    const el = wrap.current;

    return () => {
      disposed = true;
      kick.current = () => {};
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      clearTimeout(release);
      if (interactive) {
        el.removeEventListener("pointermove", onHover);
        el.removeEventListener("pointerleave", onExit);
        el.removeEventListener("pointerdown", onTap);
      }
      hemis.forEach((g) => g.dispose());
      material.dispose();
      target.dispose();
      renderer.dispose();
    };
  }, [cell, list, interactive, zoom, termCb, regionCb, focusRef]);

  return (
    <div
      ref={wrap}
      className={`pixel-brain ${ready ? "ready" : ""} ${className}`}
      data-cursor={interactive ? "inspect" : undefined}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}

export const BRAIN_CYCLE = CYCLE.map((key) => ({ key, ...TERMS[key] }));
