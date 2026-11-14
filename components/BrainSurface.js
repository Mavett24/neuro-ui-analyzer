"use client";

import { useEffect, useRef, useState } from "react";
import { useLatest } from "../lib/hooks";
import { blendPoints, blendSurface, loadBrainData, loadSurfaceData, vertexContributions } from "../lib/brain";
import { REGIONS } from "../lib/regions";

const VERT = `
attribute float aAct;
attribute float aConv;
varying vec3 vNormal;
varying vec3 vView;
varying float vAct;
varying float vConv;
varying float vX;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vX = position.x; // MNI x in mm: negative is the left side of the brain
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vAct = aAct;
  vConv = aConv;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
precision highp float;
uniform float uLo;
uniform float uHi;
uniform vec3 uGyrus;
uniform vec3 uSulcus;
uniform vec3 uRim;
uniform float uGlass;
uniform float uCut;
varying float vX;
varying vec3 vNormal;
varying vec3 vView;
varying float vAct;
varying float vConv;

vec3 ramp(float t) {
  // Red to yellow to near white: the positive-activation convention in fMRI figures.
  vec3 c = mix(vec3(0.55, 0.0, 0.02), vec3(0.95, 0.10, 0.02), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.0, 0.52, 0.04), smoothstep(0.3, 0.6, t));
  c = mix(c, vec3(1.0, 0.88, 0.25), smoothstep(0.6, 0.85, t));
  return mix(c, vec3(1.0, 0.98, 0.82), smoothstep(0.85, 1.0, t));
}

void main() {
  float a = smoothstep(uLo, uLo + (uHi - uLo) * 0.12, vAct);
  // Slice: a fixed plane moving from the left side of the brain to the right. Quiet cortex on the
  // cut side is removed, highlighted cortex stays.
  if (vX < uCut && a < 0.35) discard;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float key = max(dot(n, normalize(vec3(0.35, 0.55, 0.75))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.6, -0.2, 0.5))), 0.0);
  float fres = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.6);

  vec3 base = mix(uSulcus, uGyrus, smoothstep(-0.55, 0.45, vConv));
  vec3 lit = base * (0.22 + 0.85 * key + 0.25 * fill) + uRim * fres * 0.55;

  float t = clamp((vAct - uLo) / max(uHi - uLo, 0.001), 0.0, 1.0);
  vec3 hot = ramp(t);
  // Activation is partly self-lit so it reads as a glow, with a little shading kept for form.
  vec3 glow = hot * (0.62 + 0.38 * key) + hot * fres * 0.35;
  vec3 solid = mix(lit, glow, a * 0.94);
  // Glass mode: quiet cortex fades to a faint shell with brighter edges, activation stays visible.
  vec3 shell = base * (0.35 + 0.5 * key) + uRim * fres * 0.9;
  float shellAlpha = 0.03 + 0.5 * fres;
  vec3 glassCol = mix(shell, glow, a);
  float glassAlpha = mix(shellAlpha, 0.6, a);
  gl_FragColor = mix(vec4(solid, 1.0), vec4(glassCol, glassAlpha), uGlass);
}`;

const P_VERT = `
attribute float aVal;
uniform float uLo;
uniform float uHi;
uniform float uPx;
varying float vT;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vT = clamp((aVal - uLo) / max(uHi - uLo, 0.001), 0.0, 1.0);
  gl_PointSize = uPx * (9.0 + 5.0 * vT) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const P_FRAG = `
precision highp float;
uniform float uGlow;
varying float vT;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float fall = exp(-dot(d, d) * 14.0);
  vec3 c = mix(vec3(0.85, 0.05, 0.02), vec3(1.0, 0.5, 0.05), smoothstep(0.0, 0.5, vT));
  c = mix(c, vec3(1.0, 0.92, 0.5), smoothstep(0.5, 1.0, vT));
  gl_FragColor = vec4(c * fall * (0.022 + 0.05 * vT) * uGlow, 1.0);
}`;

export default function BrainSurface({ weights }) {
  const mount = useRef(null);
  const scene = useRef(null);
  const [hemi, setHemi] = useState("both");
  const [opacity, setOpacity] = useState(15); // cortex opacity in percent, 100 = solid
  const [tip, setTip] = useState(null);
  const [slice, setSlice] = useState(0); // 0 = whole brain, 100 = all quiet cortex cut away
  const sliceRef = useRef(setSlice);
  const weightsRef = useLatest(weights);
  const [status, setStatus] = useState("Loading brain surface...");
  const [range, setRange] = useState(null);

  // Build the scene once.
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const data = await loadSurfaceData();
        if (disposed) return;
        const el = mount.current;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setClearColor(0x000000, 1); // opaque: additive glow needs a solid backdrop
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        el.appendChild(renderer.domElement);
        const camera = new THREE.PerspectiveCamera(32, 1, 10, 2000);
        camera.up.set(0, 0, 1); // MNI space: z is up
        camera.position.set(-285, -115, 80);
        const world = new THREE.Scene();

        const uniforms = {
          uLo: { value: 3 },
          uHi: { value: 10 },
          uGyrus: { value: new THREE.Color(0.6, 0.66, 0.6) },
          uSulcus: { value: new THREE.Color(0.16, 0.2, 0.17) },
          uRim: { value: new THREE.Color(0.74, 0.95, 0.72) },
          uGlass: { value: 1 },
          uPx: { value: 1 },
          uCut: { value: -1000 },
          uGlow: { value: 1 },
        };
        const material = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const depthMaterial = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms,
          side: THREE.DoubleSide,
          colorWrite: false,
          depthWrite: true,
        });
        // Activation inside the brain, drawn as soft additive points (glass mode only).
        const points = new THREE.Points(
          new THREE.BufferGeometry(),
          new THREE.ShaderMaterial({
            vertexShader: P_VERT,
            fragmentShader: P_FRAG,
            uniforms,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
          })
        );
        points.renderOrder = 2;
        points.frustumCulled = false;
        const volume = await loadBrainData();
        if (disposed) return;

        const makeHemisphere = (mirror) => {
          const pos = new Float32Array(data.positions);
          const idx = new Uint16Array(data.indices);
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
          g.setAttribute("aConv", new THREE.BufferAttribute(data.convexity, 1));
          g.setAttribute("aAct", new THREE.BufferAttribute(new Float32Array(data.nv), 1));
          g.computeVertexNormals();
          const mesh = new THREE.Mesh(g, material);
          // Depth-only copy: at medium and high opacity it hides everything behind the nearest
          // surface, so the shell reads as one clean translucent layer instead of noisy overlap.
          const depth = new THREE.Mesh(g, depthMaterial);
          depth.renderOrder = -1;
          mesh.add(depth);
          mesh.userData.depth = depth;
          return mesh;
        };
        const left = makeHemisphere(false);
        const right = makeHemisphere(true);
        const group = new THREE.Group();
        group.add(left, right);
        world.add(points); // points are already in MNI space
        points.position.copy(new THREE.Vector3(0, 18, -12));
        group.position.set(0, 18, -12); // centre the brain on the orbit target
        world.add(group);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.zoomSpeed = 0.8; // the wheel zooms; Ctrl + wheel slices
        controls.minDistance = 220;
        controls.maxDistance = 620;
        controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        controls.autoRotateSpeed = 0.7;
        controls.addEventListener("start", () => (controls.autoRotate = false));

        const resize = () => {
          const w = el.clientWidth, h = el.clientHeight;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          uniforms.uPx.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
        };
        const observer = new ResizeObserver(resize);
        observer.observe(el);
        resize();

        // Hover: find the surface point under the cursor and describe its region if it is highlighted.
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let pending = null;
        const onMove = (e) => {
          const r = el.getBoundingClientRect();
          pending = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
        };
        const onLeave = () => {
          pending = null;
          setTip(null);
        };
        const pick = () => {
          const m = pending;
          pending = null;
          pointer.set((m.x / m.w) * 2 - 1, -(m.y / m.h) * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects([left, right].filter((o) => o.visible), false);
          const lo = uniforms.uLo.value;
          // In glass mode the first highlighted surface along the ray counts, not just the nearest one.
          const hit = hits.find((h) => h.object.geometry.attributes.aAct.array[h.face.a] > lo);
          if (!hit) return setTip(null);
          const side = hit.object === left ? 0 : 1;
          const v = hit.face.a;
          const region = REGIONS[data.labels[side * data.nv + v]];
          const drivers = vertexContributions(data, weightsRef.current, side, v).slice(0, 2).map((c) => c.label);
          setTip({
            x: Math.min(m.x + 16, m.w - 290),
            y: Math.min(m.y + 16, m.h - 170),
            name: region ? region.name : "Cortex",
            side: region?.side || (side ? "right" : "left"),
            about: region?.about || "",
            value: hit.object.geometry.attributes.aAct.array[v],
            drivers,
          });
        };
        const onWheel = (e) => {
          if (!(e.ctrlKey || e.metaKey)) return; // plain wheel: OrbitControls zooms
          e.preventDefault(); // also stops the browser's own Ctrl + wheel page zoom
          e.stopPropagation();
          sliceRef.current((v) => Math.max(0, Math.min(100, v + (e.deltaY > 0 ? 3 : -3))));
        };
        // Capture phase, so this runs before OrbitControls sees the event on the canvas.
        el.addEventListener("wheel", onWheel, { passive: false, capture: true });
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);
        controls.addEventListener("start", () => setTip(null));

        // Only render while the viewer is on screen, so it does not compete with the rest of the page.
        let frame, onScreen = true;
        const visibility = new IntersectionObserver((e) => (onScreen = e[0].isIntersecting));
        visibility.observe(el);
        const loop = () => {
          if (onScreen) {
            if (pending) pick();
            controls.update();
            renderer.render(world, camera);
          }
          frame = requestAnimationFrame(loop);
        };
        loop();

        scene.current = { THREE, data, volume, left, right, points, material, uniforms };
        setStatus(null);
        cleanup = () => {
          cancelAnimationFrame(frame);
          visibility.disconnect();
          el.removeEventListener("wheel", onWheel, { capture: true });
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerleave", onLeave);
          observer.disconnect();
          controls.dispose();
          left.geometry.dispose();
          right.geometry.dispose();
          material.dispose();
          depthMaterial.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (e) {
        console.error(e);
        if (!disposed) setStatus("Could not start the 3D brain. It needs WebGL.");
      }
    })();
    return () => {
      disposed = true;
      scene.current = null;
      cleanup();
    };
  }, [weightsRef]);

  // Update the activation whenever the weights change.
  useEffect(() => {
    const s = scene.current;
    if (!s || status) return;
    const { left, right, hi } = blendSurface(s.data, weights);
    s.left.geometry.attributes.aAct.array.set(left);
    s.right.geometry.attributes.aAct.array.set(right);
    s.left.geometry.attributes.aAct.needsUpdate = true;
    s.right.geometry.attributes.aAct.needsUpdate = true;
    const lo = Math.max(3, hi * 0.25);
    const top = Math.max(6, hi);
    s.uniforms.uLo.value = lo;
    s.uniforms.uHi.value = top;
    const pts = blendPoints(s.volume, weights, lo);
    s.points.geometry.dispose();
    const g = new s.THREE.BufferGeometry();
    g.setAttribute("position", new s.THREE.BufferAttribute(pts.positions, 3));
    g.setAttribute("aVal", new s.THREE.BufferAttribute(pts.values, 1));
    s.points.geometry = g;
    setRange([lo, top]);
  }, [weights, status]);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.left.visible = hemi !== "right";
    s.right.visible = hemi !== "left";
    const solid = opacity >= 97;
    s.uniforms.uGlass.value = solid ? 0 : 1 - opacity / 100;
    s.material.depthWrite = solid;
    // Inner glow: seen through the shell when translucent. When solid it only shows where the
    // slice has opened the brain, so it is depth-tested against the remaining cortex.
    s.points.visible = !solid || slice > 0;
    s.points.material.depthTest = solid;
    s.uniforms.uGlow.value = solid ? 1 : 1 - opacity / 100;
    // Below 30% the layered glass look is kept; above it the shell becomes a single clean layer.
    const single = opacity >= 30;
    s.left.userData.depth.visible = single;
    s.right.userData.depth.visible = single;
    s.uniforms.uCut.value = slice === 0 ? -1000 : -74 + slice * 1.48; // mm, left to right
  }, [hemi, opacity, slice, status]);

  return (
    <div className="brain-canvas surface">
      <div ref={mount} className="surface-mount" />
      {status && <p className="brain-status">{status}</p>}
      {!status && (
        <>
          <label className="opacity">
            <span>Opacity</span>
            <input
              type="range"
              min="0"
              max="100"
              value={opacity}
              onChange={(e) => setOpacity(+e.target.value)}
              aria-label="Cortex opacity"
            />
            <span className="num">{opacity}%</span>
            <span>Slice</span>
            <input
              type="range"
              min="0"
              max="100"
              value={slice}
              onChange={(e) => setSlice(+e.target.value)}
              aria-label="Slice depth"
            />
            <span className="num">{slice}%</span>
          </label>
          {tip && (
            <div className="tip" style={{ left: tip.x, top: tip.y }}>
              <strong>{tip.name}</strong>
              {tip.side && <span className="side">{tip.side} hemisphere</span>}
              {tip.about && <p>{tip.about}</p>}
              <p className="why">
                Weighted z {tip.value.toFixed(1)}
                {tip.drivers.length ? `. Driven by: ${tip.drivers.join(", ")}.` : ""}
              </p>
            </div>
          )}
          <div className="hemi">
            {[
              ["both", "Both"],
              ["left", "Left"],
              ["right", "Right"],
            ].map(([id, label]) => (
              <button key={id} className={hemi === id ? "on" : ""} onClick={() => setHemi(id)}>
                {label}
              </button>
            ))}
          </div>
          {range && (
            <div className="scale">
              <span>{range[0].toFixed(1)}</span>
              <i />
              <span>{range[1].toFixed(1)}</span>
              <em>weighted z</em>
            </div>
          )}
          <p className="drag-hint">Drag to rotate. Scroll to zoom. Ctrl + scroll to slice. Hover a highlighted area for details.</p>
        </>
      )}
    </div>
  );
}
