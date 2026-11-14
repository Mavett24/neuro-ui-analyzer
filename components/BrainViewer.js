"use client";

import { useEffect, useRef, useState } from "react";
import { useLatest } from "../lib/hooks";
import { blend, loadBrainData } from "../lib/brain";
import BrainSurface from "./BrainSurface";
import { REGIONS } from "../lib/regions";

const Z_MIN = 3; // lowest display threshold, in weighted z units

// Red to yellow, the convention for positive activation in fMRI figures.
const ACTIVATION = {
  R: [150, 225, 255, 255, 255],
  G: [0, 20, 130, 225, 255],
  B: [0, 0, 0, 40, 190],
  A: [0, 64, 128, 192, 255],
  I: [0, 64, 128, 192, 255],
};

function BrainSlices({ weights }) {
  const canvas = useRef(null);
  const nvRef = useRef(null);
  const lib = useRef(null);
  const [status, setStatus] = useState("Loading brain model...");
  const [loc, setLoc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let url;
    (async () => {
      try {
        if (!lib.current) lib.current = await import("@niivue/niivue");
        const { Niivue, SHOW_RENDER } = lib.current;
        if (!nvRef.current) {
          const nv = new Niivue({
            backColor: [0, 0, 0, 1],
            show3Dcrosshair: false,
            crosshairWidth: 0.3,
            crosshairColor: [1, 1, 1, 0.35],
            isColorbar: true,
            isOrientCube: false,
            multiplanarShowRender: SHOW_RENDER.NEVER,
            loadingText: "",
          });
          await nv.attachToCanvas(canvas.current);
          nv.addColormap("activation", ACTIVATION);
          nv.setMultiplanarLayout(2);
          nv.setClipPlaneColor([0, 0, 0, 0]);
          nvRef.current = nv;
        }
        const nv = nvRef.current;
        const data = await loadBrainData();
        const { file, max, hi, peakMm } = blend(data, weights);
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([file]));
        const volumes = [{ url: "/brain/mni152.nii.gz", colorbarVisible: false }];
        if (max > Z_MIN) {
          volumes.push({
            url,
            name: "activation.nii",
            colormap: "activation",
            cal_min: Math.max(Z_MIN, hi * 0.25),
            cal_max: Math.max(Z_MIN * 2, hi),
            opacity: 0.9,
          });
        }
        // The atlas is loaded invisibly so the crosshair can report which region it is in.
        volumes.push({ url: "/brain/aal.nii.gz", name: "atlas.nii.gz", opacity: 0, colorbarVisible: false });
        nv.onLocationChange = (d) => {
          const get = (n) => d.values.find((v) => v.name === n)?.value;
          setLoc({
            mm: [d.mm[0], d.mm[1], d.mm[2]].map((v) => Math.round(v)),
            region: REGIONS[Math.round(get("atlas.nii.gz") || 0)] || null,
            z: get("activation.nii") || 0,
            lo: Math.max(Z_MIN, hi * 0.25),
          });
        };
        await nv.loadVolumes(volumes);
        if (cancelled) return;
        // Start at the strongest point so the first view shows something meaningful.
        if (max > Z_MIN) {
          nv.scene.crosshairPos = nv.mm2frac(peakMm);
          nv.createOnLocationChange();
          nv.drawScene();
        }
        nv.setInterpolation(false);
        nv.setRenderAzimuthElevation(120, 15);
        nv.setSliceType(lib.current.SLICE_TYPE.MULTIPLANAR);
        setStatus(null);
      } catch (e) {
        if (!cancelled) setStatus("Could not start the 3D viewer. It needs WebGL2.");
        console.error(e);
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weights]);

  // Release the viewer when switching tabs.
  useEffect(() => () => (nvRef.current = null), []);

  return (
    <div className="slices">
      <div className="brain-canvas">
        <canvas ref={canvas} />
        {status && <p className="brain-status">{status}</p>}
      </div>
      <aside className="slice-help">
        <div className="readout">
          <h3>
            <i aria-hidden="true" />
            At the crosshair
          </h3>
          {loc ? (
            <>
              <strong>{loc.region ? loc.region.name : "Outside the labelled brain areas"}</strong>
              {loc.region?.side && <span className="side">{loc.region.side} hemisphere</span>}
              {loc.region?.about && <p>{loc.region.about}</p>}
              <p className="why">
                {loc.z >= loc.lo ? (
                  <>
                    Highlighted here: weighted z <b>{loc.z.toFixed(1)}</b>.
                  </>
                ) : (
                  "Not highlighted here: this spot is below the display threshold."
                )}{" "}
                Position <code>{loc.mm.join(", ")} mm</code>.
              </p>
            </>
          ) : (
            <p className="why">Click anywhere on a slice.</p>
          )}
        </div>
        <h3>How to read this</h3>
        <ul>
          <li>
            <b>Three cuts through one brain.</b> Top left is seen from behind (so left is on the left), top right
            from the side, bottom left from above. The white lines mark the same point in all three.
          </li>
          <li>
            <b>Grey is anatomy.</b> It is a standard average brain (MNI152), not a scan of anyone in
            particular.
          </li>
          <li>
            <b>Colour is the estimate.</b> Red areas are linked to processing what is in your design,
            yellow more strongly. The bar underneath is the scale (a weighted z-score). Uncoloured areas
            fall below the threshold.
          </li>
          <li>
            <b>Click to explore.</b> Click any spot to move the crosshair there, or scroll to step through
            slices. The panel above names the region you are on, including deep structures the 3D
            surface cannot show.
          </li>
          <li>
            <b>Letters are directions.</b> L left, R right, A front, P back, S top, I bottom.
          </li>
        </ul>
      </aside>
    </div>
  );
}

// Two-second pixel dissolve that uncovers the brain once the viewer scrolls into view, so the
// result reads as being generated. Cells clear from the centre outward in a dithered order,
// with a lime edge where the reveal is passing. Skipped for reduced motion.
const REVEAL_MS = 2000;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function Reveal({ onProgress, onDone }) {
  const ref = useRef(null);
  const progressCb = useLatest(onProgress);
  const doneCb = useLatest(onDone);
  useEffect(() => {
    const onProgress = (p) => progressCb.current(p);
    const onDone = () => doneCb.current();
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const cell = 12;
    let frame = 0, start = 0, cols = 0, rows = 0, order = null;

    const size = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      cols = Math.ceil(canvas.width / cell);
      rows = Math.ceil(canvas.height / cell);
      order = new Float32Array(cols * rows);
      const far = Math.hypot(cols / 2, rows / 2);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
          order[y * cols + x] = 0.62 * (Math.hypot(x - cols / 2, y - rows / 2) / far) + 0.38 * BAYER[(x & 3) + ((y & 3) << 2)];
    };
    const draw = (p) => {
      const e = p * p * (3 - 2 * p); // smoothstep
      const edge = e * 1.12;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const d = order[y * cols + x] - edge;
          if (d <= -0.06) continue; // revealed
          if (d <= 0) {
            ctx.fillStyle = `rgba(127, 238, 100, ${0.15 + 0.6 * (1 + d / 0.06)})`;
            ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
            continue;
          }
          ctx.fillStyle = "#000";
          ctx.fillRect(x * cell, y * cell, cell, cell);
          ctx.fillStyle = d < 0.08 ? "rgba(127, 238, 100, 0.22)" : "rgba(62, 74, 60, 0.3)";
          ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }
    };
    const tick = (now) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / REVEAL_MS);
      draw(p);
      onProgress(Math.round(p * 100));
      if (p < 1) frame = requestAnimationFrame(tick);
      else onDone();
    };

    size();
    draw(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }
    // The clock starts when the viewer is actually on screen, not when the page loads.
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        seen.disconnect();
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.35 }
    );
    seen.observe(canvas);
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [progressCb, doneCb]);
  return <canvas ref={ref} className="brain-reveal" aria-hidden="true" />;
}

const VIEWS = [
  ["surface", "3D brain", "Rotate the cortex and look inside it"],
  ["slices", "MRI slices", "Three cuts through the same data, with region names"],
];

export default function BrainViewer({ weights, initialView = "surface" }) {
  const [view, setView] = useState(initialView);
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const active = weights.filter((w) => w.weight > 0).length;
  return (
    <article className="brain-card">
      <div className="window-bar">
        <i />
        <i />
        <i />
        <span>brain.map</span>
      </div>
      <div className="brain-tools">
        <div className="seg" role="tablist" aria-label="Brain view">
          {VIEWS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => setView(id)}>
              <b aria-hidden="true" className={id} />
              {label}
            </button>
          ))}
        </div>
        <span className="seg-note">{VIEWS.find((v) => v[0] === view)[2]}</span>
      </div>
      <div className={`brain-stage is-${view}`}>
        {view === "surface" ? <BrainSurface weights={weights} /> : <BrainSlices weights={weights} />}
        {!revealed && <Reveal onProgress={setProgress} onDone={() => setRevealed(true)} />}
      </div>
      <div className="review-foot" aria-live="polite">
        <span className={revealed ? "" : "live"}>
          {revealed ? "complete" : progress ? `generating activation map ${String(progress).padStart(2, "0")}%` : "waiting"}
        </span>
        <span>NeuroQuery meta-analytic maps</span>
        <span>{active} functions blended</span>
        <span>estimate, not a scan</span>
      </div>
    </article>
  );
}
