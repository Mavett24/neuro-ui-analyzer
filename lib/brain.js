// Turns measured design features into a brain map.
// The maps are real: NeuroQuery meta-analytic z-maps, one per cognitive function.
// The weights are our model: how strongly this design is expected to engage each function.
// So the result is "regions the literature links to processing what is in this design",
// not a recording or a prediction of any individual brain.

const clamp = (v) => Math.max(0, Math.min(1, v));

export const TERMS = {
  visual: { label: "Visual processing", regions: "Occipital cortex (V1 to V3)" },
  attention: { label: "Attention and visual search", regions: "Intraparietal sulcus, frontal eye fields" },
  load: { label: "Working memory load", regions: "Dorsolateral prefrontal and posterior parietal cortex" },
  colour: { label: "Colour processing", regions: "Ventral occipital cortex (V4), fusiform gyrus" },
  reading: { label: "Reading", regions: "Visual word form area, left inferior frontal and temporal language areas" },
  faces: { label: "Face perception", regions: "Fusiform face area, occipital face area, amygdala" },
  objects: { label: "Object recognition", regions: "Lateral occipital complex, ventral temporal cortex" },
  scenes: { label: "Scene perception", regions: "Parahippocampal place area, retrosplenial cortex" },
  reward: { label: "Reward and value", regions: "Ventral striatum, ventromedial prefrontal cortex" },
  decision: { label: "Decision making", regions: "Striatum, anterior cingulate, orbitofrontal cortex" },
};

// metrics: output of lib/heuristics. features: optional content detection from the vision model.
export function computeWeights(metrics, features) {
  const edge = metrics.clutterEdgeDensityPct;
  const out = [];
  const add = (key, weight, reason, pending = false) =>
    out.push({ key, ...TERMS[key], weight: +clamp(weight).toFixed(2), reason, pending });

  add(
    "visual",
    0.5 + metrics.rmsContrast * 1.2 + edge / 40,
    `Any on-screen design drives early visual cortex. Scaled by contrast (${metrics.rmsContrast}) and detail (${edge}% edges).`
  );
  add(
    "attention",
    0.25 + edge / 20 + (1 - metrics.balance.leftRight) / 4,
    `More competing detail means more visual search. Based on ${edge}% edge density and left/right balance ${metrics.balance.leftRight}.`
  );
  const hues = metrics.hueFamilies ?? 0;
  const chroma = (metrics.chromaticAreaPct ?? 0) / 100;
  add(
    "load",
    edge / 18 + hues / 12 + (metrics.whitespacePct < 25 ? 0.25 : 0),
    `Dense, varied layouts hold more in mind at once. Based on clutter, ${hues} hue famil${hues === 1 ? "y" : "ies"} and ${metrics.whitespacePct}% white space.`
  );
  add(
    "colour",
    0.1 + 0.4 * Math.min(1, hues / 5) + 0.5 * chroma,
    `${hues} hue famil${hues === 1 ? "y" : "ies"} in the interface, and about ${Math.round(chroma * 100)}% of the screen is coloured (imagery included).`
  );

  const f = features;
  const need = "Needs content detection. Run the deep research analysis to include it.";
  add(
    "reading",
    f ? f.textAmount : 0,
    f ? `Text takes up about ${Math.round(f.textAmount * 100)}% of the reading effort scale.` : need,
    !f
  );
  add("faces", f ? f.faces * 0.5 : 0, f ? `${f.faces} human face(s) detected.` : need, !f);
  add("objects", f ? f.objectImagery : 0, f ? `Object or product imagery rated ${f.objectImagery} of 1.` : need, !f);
  add("scenes", f ? f.sceneImagery : 0, f ? `Scene or place imagery rated ${f.sceneImagery} of 1.` : need, !f);
  add(
    "reward",
    f ? f.rewardCues / 3 : 0,
    f ? `${f.rewardCues} reward cue(s): prices, discounts, ratings, badges.` : need,
    !f
  );
  add(
    "decision",
    f ? Math.log2(f.choices + 1) / 4 : 0,
    f ? `${f.choices} distinct actions on screen. Scaled logarithmically, as in Hick's law.` : need,
    !f
  );
  return out;
}

let cache;
export async function loadBrainData() {
  if (!cache) {
    cache = Promise.all([
      fetch("/brain/terms.json").then((r) => r.json()),
      fetch("/brain/terms.bin").then((r) => r.arrayBuffer()),
      fetch("/brain/header2x.bin").then((r) => r.arrayBuffer()),
    ]).then(([meta, maps, header]) => ({ meta, maps: new Uint8Array(maps), header: new Uint8Array(header) }));
  }
  return cache;
}

// Weighted sum of z-maps -> an in-memory NIfTI file (float32) the viewer can load.
// The 4mm maps are upsampled 2x with trilinear interpolation so the overlay is smooth.
export function blend(data, weights) {
  const { meta, maps, header } = data;
  const [nx, ny, nz] = meta.shape;
  const n = meta.voxels;
  const sum = new Float32Array(n);
  meta.terms.forEach((term, i) => {
    const w = weights.find((x) => x.key === term.key)?.weight || 0;
    if (!w) return;
    const k = w / meta.scale;
    const off = i * n;
    for (let v = 0; v < n; v++) sum[v] += maps[off + v] * k;
  });

  const X = nx * 2,
    Y = ny * 2,
    Z = nz * 2;
  const out = new Float32Array(X * Y * Z);
  const axis = (len, i2) => {
    const c = Math.max(0, Math.min(len - 1, i2 / 2 - 0.25));
    const i0 = Math.floor(c);
    return [i0, Math.min(len - 1, i0 + 1), c - i0];
  };
  let max = 0;
  let peakMm = [0, 0, 0];
  for (let z = 0; z < Z; z++) {
    const [z0, z1, fz] = axis(nz, z);
    for (let y = 0; y < Y; y++) {
      const [y0, y1, fy] = axis(ny, y);
      const r00 = (z0 * ny + y0) * nx,
        r01 = (z0 * ny + y1) * nx;
      const r10 = (z1 * ny + y0) * nx,
        r11 = (z1 * ny + y1) * nx;
      for (let x = 0; x < X; x++) {
        const [x0, x1, fx] = axis(nx, x);
        const a = sum[r00 + x0] * (1 - fx) + sum[r00 + x1] * fx;
        const b = sum[r01 + x0] * (1 - fx) + sum[r01 + x1] * fx;
        const c = sum[r10 + x0] * (1 - fx) + sum[r10 + x1] * fx;
        const d = sum[r11 + x0] * (1 - fx) + sum[r11 + x1] * fx;
        const v = (a * (1 - fy) + b * fy) * (1 - fz) + (c * (1 - fy) + d * fy) * fz;
        out[(z * Y + y) * X + x] = v;
        if (v > max) {
          max = v;
          peakMm = [x * 2 - 91, y * 2 - 127, z * 2 - 73]; // 2mm grid origin in MNI space
        }
      }
    }
  }

  // Robust upper bound: 99.5th percentile of active voxels, so one hot spot does not flatten the scale.
  const hist = new Uint32Array(512);
  let active = 0;
  for (let v = 0; v < out.length; v++)
    if (out[v] > 1) {
      hist[Math.min(511, Math.floor((out[v] / max) * 511))]++;
      active++;
    }
  let acc = 0,
    hi = max;
  for (let b = 0; b < 512; b++) {
    acc += hist[b];
    if (acc >= active * 0.995) {
      hi = ((b + 1) / 511) * max;
      break;
    }
  }

  const file = new Uint8Array(header.length + out.byteLength);
  file.set(header, 0);
  file.set(new Uint8Array(out.buffer), header.length);
  return { file, max, hi, peakMm };
}

// ---- Cortical surface version of the same data ----

let surfaceCache;
export async function loadSurfaceData() {
  if (!surfaceCache) {
    surfaceCache = Promise.all([
      fetch("/brain/terms.json").then((r) => r.json()),
      fetch("/brain/mesh.bin").then((r) => r.arrayBuffer()),
      fetch("/brain/surface.bin").then((r) => r.arrayBuffer()),
      fetch("/brain/labels.bin").then((r) => r.arrayBuffer()),
    ]).then(([meta, mesh, surface, labels]) => {
      const { vertices: nv, faces: nf, unitsPerMm } = meta.mesh;
      const raw = new Int16Array(mesh, 0, nv * 3);
      const positions = new Float32Array(nv * 3);
      for (let i = 0; i < raw.length; i++) positions[i] = raw[i] / unitsPerMm;
      const indices = new Uint16Array(mesh, nv * 6, nf * 3);
      const convRaw = new Uint8Array(mesh, nv * 6 + nf * 6, nv);
      const convexity = new Float32Array(nv);
      for (let i = 0; i < nv; i++) convexity[i] = (convRaw[i] - 128) / 127;
      return {
        meta,
        nv,
        positions,
        indices,
        convexity,
        values: new Uint8Array(surface),
        labels: new Uint8Array(labels),
      };
    });
  }
  return surfaceCache;
}

// Weighted sum per vertex. Returns one array per hemisphere plus a robust display range.
export function blendSurface(data, weights) {
  const { meta, nv, values } = data;
  const left = new Float32Array(nv);
  const right = new Float32Array(nv);
  meta.terms.forEach((term, i) => {
    const w = weights.find((x) => x.key === term.key)?.weight || 0;
    if (!w) return;
    const k = w / meta.scale;
    const offL = i * 2 * nv,
      offR = offL + nv;
    for (let v = 0; v < nv; v++) {
      left[v] += values[offL + v] * k;
      right[v] += values[offR + v] * k;
    }
  });
  const all = new Float32Array(nv * 2);
  all.set(left);
  all.set(right, nv);
  const sorted = all.filter((v) => v > 1).sort();
  const hi = sorted.length ? sorted[Math.floor(sorted.length * 0.995)] : 0;
  return { left, right, hi };
}

// Coarse (4mm) weighted volume as glowing points, for showing activation inside a see-through brain.
// Returns MNI coordinates and values of voxels above the display threshold.
export function blendPoints(data, weights, lo) {
  const { meta, maps } = data;
  const [nx, ny, nz] = meta.shape;
  const n = meta.voxels;
  const sum = new Float32Array(n);
  meta.terms.forEach((term, i) => {
    const w = weights.find((x) => x.key === term.key)?.weight || 0;
    if (!w) return;
    const k = w / meta.scale;
    const off = i * n;
    for (let v = 0; v < n; v++) sum[v] += maps[off + v] * k;
  });
  const pos = [];
  const val = [];
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const v = sum[(z * ny + y) * nx + x];
        if (v > lo) {
          // NeuroQuery grid: 4mm voxels, origin (-90, -126, -72) in MNI space
          pos.push(x * 4 - 90, y * 4 - 126, z * 4 - 72);
          val.push(v);
        }
      }
  return { positions: new Float32Array(pos), values: new Float32Array(val) };
}

// Which functions drive the activation at one surface vertex (hemi: 0 left, 1 right).
export function vertexContributions(data, weights, hemi, v) {
  const { meta, nv, values } = data;
  return meta.terms
    .map((term, i) => {
      const w = weights.find((x) => x.key === term.key);
      return { label: w?.label || term.key, value: ((w?.weight || 0) * values[(i * 2 + hemi) * nv + v]) / meta.scale };
    })
    .filter((c) => c.value > 0.5)
    .sort((a, b) => b.value - a.value);
}
