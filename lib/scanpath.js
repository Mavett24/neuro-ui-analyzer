// Predicted scanpath: the order in which the eyes are likely to visit the design in the first
// seconds, derived from the gaze map with the classic winner-take-all and inhibition-of-return
// model (Itti, Koch & Niebur, 1998). Each step jumps to the most salient spot, slightly favouring
// short jumps, then suppresses the area just looked at so the next fixation goes elsewhere.
// Deterministic: the same map always gives the same path.

const WINDOW_MS = 3000;
const MAX_FIX = 14;
// Suppressed area around a fixation, in image widths: about 2 degrees of visual angle on a desktop
// screen. A phone is held closer, so the same angle covers more of its width.
const IOR_DESKTOP = 0.07;
const IOR_PHONE = 0.16;
const NEAR_SIGMA = 0.32; // preference for nearby targets, in image widths
const TYPES = ["detail", "empty", "imagery"];
export const TYPE_LABEL = { detail: "Text or detail", empty: "Empty space", imagery: "Imagery", cta: "Primary CTA" };

function zone(x, y) {
  const h = x < 1 / 3 ? "left" : x < 2 / 3 ? "centre" : "right";
  const v = y < 1 / 3 ? "top" : y < 2 / 3 ? "middle" : "bottom";
  return `${v} ${h}`;
}

// What sits under a fixation: majority of the region map within the foveal radius.
function regionAt(regions, cta, x, y, aspect) {
  if (cta) {
    const b = cta.box,
      p = 0.01;
    if (x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p * aspect && y <= b.y + b.h + p * aspect) return "cta";
  }
  if (!regions) return "detail";
  const { cols, rows, kinds } = regions;
  const r = Math.max(1, Math.round(0.025 * cols));
  const cx = Math.floor(x * cols),
    cy = Math.floor(y * rows);
  const n = [0, 0, 0];
  for (let yy = cy - r; yy <= cy + r; yy++)
    for (let xx = cx - r; xx <= cx + r; xx++) {
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      if ((xx - cx) ** 2 + (yy - cy) ** 2 > r * r) continue;
      n[kinds[yy * cols + xx]]++;
    }
  const total = n[0] + n[1] + n[2] || 1;
  if (n[2] / total >= 0.5) return "imagery";
  if (n[0] / total >= 0.15) return "detail";
  return n[2] ? "imagery" : "empty";
}

export function computeScanpath(sal, { regions = null, cta = null } = {}) {
  const { map, w, h } = sal;
  let max = 0;
  for (let i = 0; i < map.length; i++) if (map[i] > max) max = map[i];
  if (!max) return { fixations: [], duration: 0, ctaHit: null };
  const S = new Float32Array(map.length);
  for (let i = 0; i < map.length; i++) S[i] = map[i] / max;
  const orig = Float32Array.from(S);
  const aspect = w / h; // image heights per width unit
  // Viewing starts at the centre of the first screen, as after a central fixation cross.
  let px = 0.5,
    py = Math.min(0.5, (0.5 * 0.625 * w) / h);
  const fixations = [];
  let t = 0;

  while (fixations.length < MAX_FIX && t < WINDOW_MS) {
    let best = -1,
      bestScore = 0;
    for (let y = 0; y < h; y++) {
      const fy = (y + 0.5) / h;
      const dy = (fy - py) / aspect;
      for (let x = 0; x < w; x++) {
        const v = S[y * w + x];
        if (v <= bestScore * 0.55) continue;
        const dx = (x + 0.5) / w - px;
        const score = v * (0.55 + 0.45 * Math.exp(-(dx * dx + dy * dy) / (2 * NEAR_SIGMA * NEAR_SIGMA)));
        if (score > bestScore) {
          bestScore = score;
          best = y * w + x;
        }
      }
    }
    if (best < 0 || orig[best] < 0.06) break;
    const fx = ((best % w) + 0.5) / w,
      fy = (Math.floor(best / w) + 0.5) / h;
    const dist = Math.hypot(fx - px, (fy - py) / aspect);
    // Saccade time grows with amplitude; fixations on more salient spots last longer.
    const saccade = fixations.length ? Math.round(30 + 110 * dist) : 0;
    const start = t + saccade;
    if (start >= WINDOW_MS) break;
    const value = orig[best];
    const dur = Math.min(WINDOW_MS - start, Math.round(190 + 210 * value));
    const type = regionAt(regions, cta, fx, fy, 1 / aspect);
    fixations.push({
      i: fixations.length,
      x: fx,
      y: fy,
      start,
      saccade,
      dur,
      end: start + dur,
      value: +value.toFixed(2),
      type,
      zone: zone(fx, fy),
    });
    t = start + dur;
    px = fx;
    py = fy;
    // Inhibition of return around the fixated spot.
    const r = h > w * 1.2 ? IOR_PHONE : IOR_DESKTOP;
    for (let y = 0; y < h; y++) {
      const dy = ((y + 0.5) / h - fy) / aspect;
      if (Math.abs(dy) > 3 * r) continue;
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5) / w - fx;
        if (Math.abs(dx) > 3 * r) continue;
        S[y * w + x] *= 1 - 0.95 * Math.exp(-(dx * dx + dy * dy) / (2 * r * r));
      }
    }
  }
  const ctaHit = fixations.find((f) => f.type === "cta") || null;
  return { fixations, duration: fixations.length ? fixations[fixations.length - 1].end : 0, ctaHit };
}

// Functions each moment is likely to recruit, for the trace under the playback.
// Rows map to the brain section's functions. During a saccade visual intake is suppressed
// (saccadic suppression) while attention is busy selecting the next target.
export const TRACE_ROWS = [
  ["visual", "Visual processing"],
  ["attention", "Attention"],
  ["reading", "Reading"],
  ["objects", "Object recognition"],
  ["decision", "Decision making"],
];
export function traceAt(path, t) {
  const f = path.fixations.find((x) => t >= x.start - x.saccade && t < x.end);
  const out = { visual: 0, attention: 0, reading: 0, objects: 0, decision: 0 };
  if (!f) return out;
  if (t < f.start) return { ...out, visual: 0.15, attention: 0.85 };
  const v = f.value;
  out.visual = 0.55 + 0.45 * v;
  out.attention = t - f.start < 100 ? 0.75 : 0.3 + 0.3 * v;
  if (f.type === "detail") out.reading = 0.55 + 0.45 * v;
  if (f.type === "imagery") out.objects = 0.55 + 0.45 * v;
  if (f.type === "cta") {
    out.decision = 0.6 + 0.4 * v;
    out.reading = 0.4;
  }
  return out;
}

// Gaze map revealed only where the eyes have been so far: each fixation uncovers a soft disc that
// grows with the time spent there. Returns a mask the size of the map (0 to 1).
export function revealMask(sal, path, t, buf) {
  const { w, h } = sal;
  const mask = buf && buf.length === w * h ? buf : new Float32Array(w * h);
  mask.fill(0);
  const sigma = (h > w * 1.2 ? 0.15 : 0.075) * w;
  for (const f of path.fixations) {
    if (t <= f.start) break;
    const k = Math.min(1, (t - f.start) / Math.min(f.dur, 220));
    const cx = f.x * w,
      cy = f.y * h;
    const R = Math.ceil(3 * sigma);
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(h, Math.ceil(cy + R)); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(w, Math.ceil(cx + R)); x++) {
        const g = k * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma));
        const i = y * w + x;
        mask[i] = 1 - (1 - mask[i]) * (1 - g);
      }
  }
  return mask;
}
