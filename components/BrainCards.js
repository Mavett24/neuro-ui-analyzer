"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadBrainData } from "../lib/brain";

// Brain function cards: text on the left, a side-view "glass brain" of that function's own
// NeuroQuery map on the right. The map shows where the function sits, brightness shows how
// strongly this design is estimated to engage it.

// Side-view outline of the MNI152 template on the 4mm map grid (55 x 46, bit-packed, bottom row first).
const SILHOUETTE = "AAAeAAAAAAAA/AAAAAAAD/wAAAAAAH/8AAAAAAH/+AAAAAAH//z8AAAAH////wAAAD////4AAAD////+AAAB/////AAAA//////wAAf/////+AAP//////gAf//////4AP//////8AP///////AH///////gD///////wB///////4A///////8Af//////+AP///////AH///////gB///////gA///////wAf//////wAH//////4AB//////4AA//////8AAP/////8AAD/////8AAB/////8AAAf////8AAAH////8AAAD////4AAAA////wAAAAH///gAAAAA///AAAAAAP/4AAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const NY = 55, NZ = 46;
const CROP = { y0: 4, y1: 52, z0: 0, z1: 41 }; // tight box around the brain
const Z_MIN = 21; // z = 3 in map units (maps are stored as z * 7)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
// Red to yellow, the same activation scale as the 3D brain.
const RAMP = [[140, 0, 5], [242, 26, 5], [255, 133, 10], [255, 224, 64], [255, 250, 209]];
const ramp = (t) => {
  const p = Math.max(0, Math.min(0.9999, t)) * (RAMP.length - 1);
  const i = Math.floor(p), f = p - i;
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f));
};

let outline;
function silhouette() {
  if (!outline) {
    const bytes = Uint8Array.from(atob(SILHOUETTE), (c) => c.charCodeAt(0));
    outline = new Uint8Array(NY * NZ);
    for (let i = 0; i < NY * NZ; i++) outline[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  }
  return outline;
}

// One side-view projection per function: the strongest value along the left-right axis.
function projections({ meta, maps }) {
  const [nx, ny, nz] = meta.shape;
  const out = {};
  meta.terms.forEach((term, i) => {
    const mip = new Uint8Array(ny * nz);
    let max = 1;
    const off = i * meta.voxels;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++) {
        let m = 0;
        const row = off + (z * ny + y) * nx;
        for (let x = 0; x < nx; x++) if (maps[row + x] > m) m = maps[row + x];
        mip[z * ny + y] = m;
        if (m > max) max = m;
      }
    out[term.key] = { mip, max };
  });
  return out;
}

function BrainMap({ proj, weight }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const s = 4;
    const cols = CROP.y1 - CROP.y0, rows = CROP.z1 - CROP.z0;
    c.width = cols * s;
    c.height = rows * s;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    const sil = silhouette();
    for (let r = 0; r < rows; r++)
      for (let x = 0; x < cols; x++) {
        const idx = (CROP.z1 - 1 - r) * NY + CROP.y0 + x; // top of the head at the top
        if (!sil[idx]) continue;
        const raw = proj ? proj.mip[idx] : 0;
        const v = raw > Z_MIN ? raw / proj.max : 0;
        if (v && 0.3 + v > BAYER[(x & 3) + ((r & 3) << 2)]) {
          if (weight > 0) {
            const t = Math.min(1, v * weight * 1.5);
            const [R, G, B] = ramp(t);
            ctx.fillStyle = `rgba(${R}, ${G}, ${B}, ${0.45 + 0.55 * t})`;
          } else ctx.fillStyle = "rgba(140, 171, 135, 0.35)"; // linked regions, not engaged
        } else ctx.fillStyle = "rgba(62, 74, 60, 0.32)";
        ctx.fillRect(x * s, r * s, s - 1, s - 1);
      }
  }, [proj, weight]);
  return <canvas ref={ref} className="pix" aria-hidden="true" />;
}

function Meter({ weight }) {
  const n = 24;
  const on = Math.round(weight * n);
  return (
    <div className="meter" role="img" aria-label={`Engagement ${weight.toFixed(2)} of 1`}>
      {Array.from({ length: n }, (_, i) => {
        const [R, G, B] = ramp(0.15 + (0.8 * i) / n);
        return <i key={i} style={i < on ? { background: `rgb(${R}, ${G}, ${B})` } : undefined} />;
      })}
    </div>
  );
}

const level = (w) => (w >= 0.66 ? "High" : w >= 0.33 ? "Medium" : w > 0 ? "Low" : "Inactive");

export default function BrainCards({ items, deep = false }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    loadBrainData().then((d) => live && setData(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const proj = useMemo(() => (data ? projections(data) : null), [data]);

  return (
    <div className="brain-grid">
      {items.map((w, i) => (
        <article
          key={w.key}
          className={`diag wide${deep ? " deep" : ""}${w.weight > 0 ? "" : " inactive"}`}
          style={deep && w.weight > 0 ? { animationDelay: `${i * 70}ms` } : undefined}
        >
          <div className="diag-body">
            <div className="diag-head">
              <span className="diag-label">{w.label}</span>
              <span className="chip">{level(w.weight)}</span>
            </div>
            <div className="diag-num">
              {w.weight.toFixed(2)}
              <small>engagement, 0 to 1</small>
            </div>
            <p className="regions">{w.regions}</p>
            <p>{w.reason}</p>
          </div>
          <div className="diag-viz">
            <div className="viz-stack">
              <BrainMap proj={proj?.[w.key]} weight={w.weight} />
              <Meter weight={w.weight} />
              <div className="split">
                <span>back</span>
                <span>side view</span>
                <span>front</span>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
