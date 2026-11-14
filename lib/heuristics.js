import { attentionInBox, computeSaliency, modelSaliency, peak } from "./saliency";
import { detectCta } from "./cta";
import { computeScanpath } from "./scanpath";

// Deterministic layout metrics computed in the browser from raw pixels.
// Everything here is a heuristic estimate, not a measurement of real users.

const W = 512; // analysis width in px
const B = 8; // block size in px

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function relLum(r, g, b) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function saturation(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// ---- Colour: OKLab, so "similar" means similar to the eye, not close in RGB ----
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  LIN[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function oklab(r, g, b) {
  const lr = LIN[Math.round(r)],
    lg = LIN[Math.round(g)],
    lb = LIN[Math.round(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const labDist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const SAME_COLOUR = 0.055; // OKLab distance below which two fills read as one colour
const NEUTRAL_CHROMA = 0.04; // below this a colour reads as black, white or grey
const HUE_FAMILY_DEG = 32; // hues closer than this count as one family

// The design palette: colours used as flat fills (backgrounds, surfaces, buttons, bars).
// Photos, illustrations, gradients and the soft edges of text are not flat, so their thousands
// of in-between shades are left out instead of being counted as "colours".
export function extractPalette(data, w, h, extra = []) {
  const P = 8;
  const bw = Math.floor(w / P),
    bh = Math.floor(h / P);
  const total = bw * bh || 1;
  // Pass 1: describe every 8px block. kind: 0 = other (text, edges), 1 = flat, 2 = image texture.
  const kind = new Uint8Array(total);
  const mean = new Float32Array(total * 3);
  let chromatic = 0;
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let r0 = 255,
        r1 = 0,
        g0 = 255,
        g1 = 0,
        b0 = 255,
        b1 = 0,
        sr = 0,
        sg = 0,
        sb = 0;
      for (let y = by * P; y < by * P + P; y++)
        for (let x = bx * P; x < bx * P + P; x++) {
          const i = (y * w + x) * 4,
            r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          if (r < r0) r0 = r;
          if (r > r1) r1 = r;
          if (g < g0) g0 = g;
          if (g > g1) g1 = g;
          if (b < b0) b0 = b;
          if (b > b1) b1 = b;
          sr += r;
          sg += g;
          sb += b;
        }
      const px = P * P,
        k = by * bw + bx;
      mean[k * 3] = sr / px;
      mean[k * 3 + 1] = sg / px;
      mean[k * 3 + 2] = sb / px;
      const lab = oklab(sr / px, sg / px, sb / px);
      if (Math.hypot(lab[1], lab[2]) > 0.06) chromatic++;
      if (Math.max(r1 - r0, g1 - g0, b1 - b0) <= 5) kind[k] = 1;
      else {
        // Text and line art are two-tone: nearly every pixel is close to the darkest or the
        // lightest value in the block. Image texture and soft shading fill the range in between.
        let lo = 255,
          hi = 0;
        for (let y = by * P; y < by * P + P; y++)
          for (let x = bx * P; x < bx * P + P; x++) {
            const i = (y * w + x) * 4,
              v = lum(data[i], data[i + 1], data[i + 2]);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        const band = (hi - lo) * 0.25;
        let ends = 0;
        for (let y = by * P; y < by * P + P; y++)
          for (let x = bx * P; x < bx * P + P; x++) {
            const i = (y * w + x) * 4,
              v = lum(data[i], data[i + 1], data[i + 2]);
            if (v <= lo + band || v >= hi - band) ends++;
          }
        if (ends / px < 0.65) kind[k] = 2;
      }
    }

  // Pass 2: a flat block next to an almost-but-not-quite identical flat block is part of a
  // gradient or a soft photo area, not a solid fill.
  const soft = new Uint8Array(total);
  const diff = (a, b) =>
    Math.max(
      Math.abs(mean[a * 3] - mean[b * 3]),
      Math.abs(mean[a * 3 + 1] - mean[b * 3 + 1]),
      Math.abs(mean[a * 3 + 2] - mean[b * 3 + 2])
    );
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      const k = by * bw + bx;
      if (kind[k] !== 1) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = bx + dx,
          ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const nk = ny * bw + nx;
        if (kind[nk] !== 1) continue;
        const d = diff(k, nk);
        if (d > 1.5 && d <= 14) {
          soft[k] = 1;
          break;
        }
      }
    }

  // Pass 3: image areas. A 4x4 group of blocks that is mostly texture or soft shading is an
  // image, and so are the groups touching it, so flat patches inside a photo are not counted.
  const C = 4;
  const cw = Math.ceil(bw / C),
    ch = Math.ceil(bh / C);
  const cell = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      let n = 0,
        img = 0;
      for (let by = cy * C; by < Math.min(bh, cy * C + C); by++)
        for (let bx = cx * C; bx < Math.min(bw, cx * C + C); bx++) {
          n++;
          const k = by * bw + bx;
          if (kind[k] === 2 || soft[k]) img++;
        }
      if (n && img / n >= 0.3) cell[cy * cw + cx] = 1;
    }
  const masked = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      if (!cell[cy * cw + cx]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx,
            ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < cw && ny < ch) masked[ny * cw + nx] = 1;
        }
    }

  // Pass 4: solid fills outside image areas go into the palette. Soft shading is tallied by hue
  // so a gradient background still counts as the colour it is.
  const bins = new Map();
  const softHue = new Float64Array(12 * 4); // per 30 degree slice: count, r, g, b
  let imagery = 0;
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      const k = by * bw + bx;
      const inImage = masked[Math.floor(by / C) * cw + Math.floor(bx / C)];
      if (cell[Math.floor(by / C) * cw + Math.floor(bx / C)]) imagery++;
      const rgb = [mean[k * 3], mean[k * 3 + 1], mean[k * 3 + 2]];
      if (kind[k] === 1 && soft[k]) {
        const lab = oklab(...rgb);
        if (Math.hypot(lab[1], lab[2]) >= NEUTRAL_CHROMA) {
          const slice = Math.floor((((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360) / 30) % 12;
          softHue[slice * 4]++;
          softHue[slice * 4 + 1] += rgb[0];
          softHue[slice * 4 + 2] += rgb[1];
          softHue[slice * 4 + 3] += rgb[2];
        }
        continue;
      }
      if (kind[k] !== 1) continue;
      const key = ((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3);
      const e = bins.get(key) || { n: 0, out: 0, r: 0, g: 0, b: 0 };
      e.n++;
      e.r += rgb[0];
      e.g += rgb[1];
      e.b += rgb[2];
      if (!inImage) e.out++;
      bins.set(key, e);
    }

  // Merge near-identical fills, largest first.
  const clusters = [];
  const sorted = [...bins.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0]);
  for (const [, e] of sorted) {
    const rgb = [e.r / e.n, e.g / e.n, e.b / e.n];
    const lab = oklab(...rgb);
    const hit = clusters.find((c) => labDist(c.lab, lab) < SAME_COLOUR);
    if (hit) {
      hit.n += e.n;
      hit.out += e.out;
    } else clusters.push({ rgb, lab, n: e.n, out: e.out });
  }
  // A colour has to cover a visible area to count: 0.12% of the screen, about one small button,
  // measured away from images. Inside or right next to an image it only counts if it is large
  // (2% of the screen), which keeps page backgrounds and drops flat patches within photos.
  const kept = clusters.filter((c) => c.out / total >= 0.0012 || c.n / total >= 0.02);
  // A gradient counts when one hue slice of it covers at least 4% of the screen.
  for (let sl = 0; sl < 12; sl++) {
    const n = softHue[sl * 4];
    if (n / total < 0.04) continue;
    const rgb = [softHue[sl * 4 + 1] / n, softHue[sl * 4 + 2] / n, softHue[sl * 4 + 3] / n];
    kept.push({ rgb, lab: oklab(...rgb), n, gradient: true });
  }
  // Small filled buttons can fall under the area limit, so a detected CTA colour is added explicitly.
  for (const rgb of extra) {
    const lab = oklab(...rgb);
    if (!kept.some((c) => labDist(c.lab, lab) < SAME_COLOUR))
      kept.push({ rgb, lab, n: Math.max(1, Math.round(total * 0.0012)), accent: true });
  }
  const keptTotal = kept.reduce((a, c) => a + c.n, 0) || 1;
  // Coarse map of what is where, for the scanpath: 0 text or detail, 1 empty, 2 imagery.
  const kinds = new Uint8Array(total);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      const k = by * bw + bx;
      kinds[k] = cell[Math.floor(by / C) * cw + Math.floor(bx / C)] ? 2 : kind[k] === 1 ? 1 : 0;
    }
  const hues = [];
  const palette = kept
    .sort((a, b) => b.n - a.n)
    .map((c) => {
      const neutral = Math.hypot(c.lab[1], c.lab[2]) < NEUTRAL_CHROMA;
      if (!neutral) {
        const hue = ((Math.atan2(c.lab[2], c.lab[1]) * 180) / Math.PI + 360) % 360;
        if (!hues.some((hh) => Math.min(Math.abs(hh - hue), 360 - Math.abs(hh - hue)) < HUE_FAMILY_DEG)) hues.push(hue);
      }
      return {
        hex: hex(c.rgb),
        lab: c.lab,
        share: c.n / total,
        sharePct: +((c.n / keptTotal) * 100).toFixed(1),
        neutral,
        accent: !!c.accent,
        gradient: !!c.gradient,
      };
    });
  return {
    regions: { cols: bw, rows: bh, kinds },
    palette,
    hueFamilies: hues.length,
    neutrals: palette.filter((c) => c.neutral).length,
    imageryShare: imagery / total,
    chromaticShare: chromatic / total,
  };
}

function zone(cx, cy) {
  const h = cx < 1 / 3 ? "left" : cx < 2 / 3 ? "center" : "right";
  const v = cy < 1 / 3 ? "top" : cy < 2 / 3 ? "middle" : "bottom";
  return `${v} ${h}`;
}

export function analyzeImageData(data, w, h, original = { width: w, height: h }, ctaRaw = null, sharp = null) {
  // Palette first: it also tells white space which colours are backgrounds.
  const src = sharp || { data, w, h };
  const pal = extractPalette(src.data, src.w, src.h, ctaRaw ? [ctaRaw.rgb] : []);
  const grounds = pal.palette.filter((c) => c.share >= 0.03 && !c.accent && !c.gradient);
  const n = w * h;
  const gray = new Float32Array(n);
  const bins = new Map(); // 4 bits per channel colour histogram

  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = lum(r, g, b);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key);
    if (e) {
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else bins.set(key, { n: 1, r, g, b });
  }

  const colours = [...bins.values()]
    .map((e) => ({ share: e.n / n, rgb: [e.r / e.n, e.g / e.n, e.b / e.n] }))
    .sort((a, b) => b.share - a.share);
  const bg = colours[0];
  const palette = colours.filter((c) => c.share >= 0.005);

  // Sobel edge magnitude
  const edge = new Float32Array(n);
  let edgeCount = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += gray[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (gray[i] - mean) ** 2;
  const rmsContrast = Math.sqrt(variance / n) / 255;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      const m = Math.sqrt(gx * gx + gy * gy);
      edge[i] = m;
      if (m > 80) edgeCount++;
    }
  }
  const edgeDensity = edgeCount / n;

  // Block grid: empty space, visual weight, accent candidates
  const bw = Math.floor(w / B);
  const bh = Math.floor(h / B);
  const empty = new Uint8Array(bw * bh);
  const weight = new Float32Array(bw * bh);
  let emptyCount = 0;
  let total = 0;
  let mx = 0;
  let my = 0;

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let e = 0,
        sr = 0,
        sg = 0,
        sb = 0,
        sat = 0,
        strong = 0;
      for (let y = by * B; y < by * B + B; y++) {
        for (let x = bx * B; x < bx * B + B; x++) {
          const i = y * w + x;
          e += edge[i];
          if (edge[i] > 80) strong++;
          const r = data[i * 4],
            g = data[i * 4 + 1],
            b = data[i * 4 + 2];
          sr += r;
          sg += g;
          sb += b;
          sat += saturation(r, g, b);
        }
      }
      const px = B * B;
      const k = by * bw + bx;
      const col = [sr / px, sg / px, sb / px];
      const dist = Math.hypot(col[0] - bg.rgb[0], col[1] - bg.rgb[1], col[2] - bg.rgb[2]);
      weight[k] = e / px;
      total += weight[k];
      mx += weight[k] * (bx + 0.5);
      my += weight[k] * (by + 0.5);
      // Empty space: a block with no edges in it, in one of the page's background colours.
      // (Any background counts, not only the most common one, so a dark hero above a light page
      // is still read as empty where it is empty.)
      if (strong === 0) {
        const lab = oklab(...col);
        if (dist < 24 || grounds.some((g) => labDist(g.lab, lab) < SAME_COLOUR)) {
          empty[k] = 1;
          emptyCount++;
        }
      }
    }
  }
  const whitespace = emptyCount / (bw * bh);
  const cx = total ? mx / total / bw : 0.5;
  const cy = total ? my / total / bh : 0.5;

  // Left/right and top/bottom balance (1 = perfectly even)
  let left = 0,
    top = 0;
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      const v = weight[by * bw + bx];
      if (bx < bw / 2) left += v;
      if (by < bh / 2) top += v;
    }
  const balanceLR = total ? 1 - Math.abs(2 * left - total) / total : 1;
  const balanceTB = total ? 1 - Math.abs(2 * top - total) / total : 1;

  // Primary CTA: found by lib/cta.js on a sharper copy of the image, or null when nothing is convincing.
  let cta = null;
  if (ctaRaw) {
    const b = ctaRaw.box;
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    cta = {
      box: b,
      colour: hex(ctaRaw.rgb),
      surroundColour: hex(ctaRaw.around),
      zone: zone(c.x, c.y),
      areaPct: +(ctaRaw.areaShare * 100).toFixed(2),
      contrastVsBackground: +ctaRaw.contrast.toFixed(2),
      confidencePct: Math.round(ctaRaw.confidence * 100),
      inFirstScreenThird: c.y < 1 / 3,
    };
  }

  // Clutter score, 0 to 100. Three ingredients: how much of the screen holds detail, how dense
  // that detail is (edge density), and how many different colours compete, photos included.
  // Weights are set so a near-empty splash screen lands under 10 and a dense grid of thumbnails or
  // a packed news front page lands above 70.
  // A continuous image reads as one object, so the area it covers counts at about a third.
  const variety = Math.min(1, palette.length / 24);
  const occupied = 1 - whitespace;
  // The discount fades out as edges get denser: one calm photo is one object, a wall of
  // thumbnails with titles on them is not.
  const calm = Math.max(0, 1 - edgeDensity / 0.2);
  const occupiedEff = occupied - 0.65 * calm * Math.min(occupied, pal.imageryShare);
  const clutterScore = Math.round(100 * Math.min(1, 2.2 * edgeDensity + 0.4 * occupiedEff + 0.12 * variety));

  const ratio = original.width / original.height;
  const metrics = {
    image: {
      width: original.width,
      height: original.height,
      format: ratio < 0.8 ? "mobile / portrait" : ratio > 1.2 ? "desktop / landscape" : "square-ish",
    },
    whitespacePct: +(whitespace * 100).toFixed(1),
    clutterEdgeDensityPct: +(edgeDensity * 100).toFixed(1),
    clutterScore,
    occupiedPct: +((1 - whitespace) * 100).toFixed(1),
    distinctColours: pal.palette.length,
    hueFamilies: pal.hueFamilies,
    neutralColours: pal.neutrals,
    imageryPct: Math.round(pal.imageryShare * 100),
    chromaticAreaPct: Math.round(pal.chromaticShare * 100),
    dominantColours: pal.palette.slice(0, 8).map((c) => ({ hex: c.hex, sharePct: c.sharePct, neutral: c.neutral })),
    backgroundColour: hex(bg.rgb),
    rmsContrast: +rmsContrast.toFixed(3),
    balance: { leftRight: +balanceLR.toFixed(2), topBottom: +balanceTB.toFixed(2) },
    visualCentreOfMass: { x: +cx.toFixed(2), y: +cy.toFixed(2), zone: zone(cx, cy) },
    ctaCandidate: cta,
  };
  const ws = pool(Array.from(empty), bw, bh, 64, 40);
  const ed = pool(Array.from(weight), bw, bh, 64, 40);
  const sorted = ed.values.filter((v) => v > 0).sort((x, y) => x - y);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  ed.values = ed.values.map((v) => Math.min(1, v / p95));
  const colRaw = new Array(bw).fill(0);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) colRaw[bx] += weight[by * bw + bx];
  const fc = Math.ceil(bw / 32);
  const cols = [];
  for (let x = 0; x + fc <= bw; x += fc) cols.push(colRaw.slice(x, x + fc).reduce((a, b) => a + b, 0));
  const cmax = Math.max(...cols, 1e-6);
  const viz = {
    regions: pal.regions,
    whitespace: ws,
    edges: ed,
    columns: cols.map((v) => v / cmax),
    leftShare: total ? left / total : 0.5,
    topShare: total ? top / total : 0.5,
  };
  return { metrics, findings: interpret(metrics), viz };
}

// Average a block grid down so it fits a small visualization, keeping the aspect ratio.
function pool(src, bw, bh, maxCols, maxRows) {
  const f = Math.max(1, Math.ceil(bw / maxCols), Math.ceil(bh / maxRows));
  const cols = Math.max(1, Math.floor(bw / f)),
    rows = Math.max(1, Math.floor(bh / f));
  const values = new Array(cols * rows).fill(0);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) sum += src[(y * f + dy) * bw + x * f + dx];
      values[y * cols + x] = sum / (f * f);
    }
  return { cols, rows, values };
}

// One line per card on how the number is produced, shown on the card.
const HOW = {
  "White space": "Share of the screen that is flat background with nothing on it.",
  "Visual clutter":
    "Combines how much of the screen holds detail, how dense its edges are and how many colours compete. Higher means busier.",
  "Colour palette":
    "Counts colours used as flat fills, grouping near-identical shades. Hues within about 30 degrees count as one family.",
  "Left / right balance": "Compares the amount of detail in the left and right halves. 1 means equal.",
  "Primary CTA": "Looks for a filled button with a readable label and measures its contrast with what surrounds it.",
  "Attention on CTA": "Predicted gaze on the button, relative to the most looked-at spot.",
};

// Thresholds are working defaults, to be calibrated against real UI sets later.
function interpret(m) {
  const f = [];
  const add = (label, value, status, note) => f.push({ label, value, status, note, how: HOW[label.split(" (")[0]] });

  const ws = m.whitespacePct;
  const imageLed = ws < 25 && m.imageryPct >= 50 && m.clutterScore <= 60;
  add(
    "White space",
    `${ws}%`,
    imageLed ? "info" : ws < 25 ? "warn" : ws > 80 ? "info" : "good",
    imageLed
      ? `Little flat background, because imagery covers about ${m.imageryPct}% of the screen. Check that text placed over it stays readable.`
      : ws < 25
        ? "Dense layout. Little empty space to group content or rest the eye."
        : ws > 80
          ? "Very sparse. Fine for a hero or splash, thin for a content screen."
          : "Healthy share of empty space for grouping and scanning."
  );

  const cl = m.clutterScore;
  add(
    "Visual clutter",
    `${cl} of 100`,
    cl > 60 ? "warn" : cl >= 30 ? "info" : "good",
    (cl > 60
      ? "High. A lot competes for attention at once, which slows visual search."
      : cl >= 30
        ? "Moderate. Readable, but watch for elements competing with the main action."
        : "Low. Easy to take in at a glance.") +
      ` Detail fills ${m.occupiedPct}% of the screen, and ${m.clutterEdgeDensityPct}% of all pixels sit on a sharp edge.`
  );

  const hf = m.hueFamilies;
  const nn = m.neutralColours;
  const img =
    m.imageryPct >= 5
      ? ` Photos, gradients and illustrations (about ${m.imageryPct}% of the screen) are not counted.`
      : "";
  add(
    "Colour palette",
    `${hf} hue famil${hf === 1 ? "y" : "ies"}`,
    hf >= 6 ? "warn" : hf >= 4 ? "info" : "good",
    (hf === 0 && m.chromaticAreaPct >= 15
      ? `No flat colour accents in the interface itself: ${nn} neutral${nn === 1 ? "" : "s"}. The colour on this screen comes from its imagery.`
      : hf === 0
        ? `Monochrome: ${nn} neutral${nn === 1 ? "" : "s"} (black, white, greys) and no colour accent.`
        : hf >= 6
          ? `${hf} different hue families plus ${nn} neutral${nn === 1 ? "" : "s"}. Check that each colour has a job.`
          : hf >= 4
            ? `${hf} hue families plus ${nn} neutral${nn === 1 ? "" : "s"}. Fine if each maps to a meaning.`
            : `Restrained: ${hf} hue famil${hf === 1 ? "y" : "ies"} plus ${nn} neutral${nn === 1 ? "" : "s"}.`) + img
  );

  const lr = m.balance.leftRight;
  add(
    "Left / right balance",
    lr.toFixed(2),
    lr < 0.6 ? "info" : "good",
    lr < 0.6
      ? "Visual weight sits mostly on one side. Fine if intentional (split hero)."
      : "Visual weight is evenly spread horizontally."
  );

  const c = m.ctaCandidate;
  if (!c) {
    add(
      "Primary CTA",
      "none detected",
      "info",
      "No filled button with a readable label was found with enough confidence. Outlined buttons and text links are not detected, so check this one by eye."
    );
  } else {
    add(
      "Primary CTA (candidate)",
      `${c.zone}, ${c.colour}`,
      c.contrastVsBackground < 3
        ? "warn"
        : c.inFirstScreenThird || m.image.format.startsWith("desktop")
          ? "good"
          : "info",
      c.contrastVsBackground < 3
        ? `Button contrast with its surroundings is ${c.contrastVsBackground}:1, below the 3:1 minimum for UI components (WCAG 1.4.11).`
        : `Button contrast with its surroundings is ${c.contrastVsBackground}:1. Covers ${c.areaPct}% of the screen. Detection confidence ${c.confidencePct}%.`
    );
  }
  return f;
}

// Browser entry point: File -> metrics + a downscaled JPEG for the AI review.
export async function analyzeFile(file) {
  const bmp = await createImageBitmap(file);
  const w = Math.min(W, bmp.width);
  const h = Math.max(B * 2, Math.round((bmp.height / bmp.width) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  // Button detection needs sharper pixels than the layout metrics, so it gets its own larger copy.
  const cw = Math.min(1024, bmp.width);
  const ch = Math.max(16, Math.round((bmp.height / bmp.width) * cw));
  const big = document.createElement("canvas");
  big.width = cw;
  big.height = ch;
  const bctx = big.getContext("2d", { willReadFrequently: true });
  bctx.drawImage(bmp, 0, 0, cw, ch);
  let ctaRaw = null;
  let sharpData = null;
  try {
    sharpData = bctx.getImageData(0, 0, cw, ch).data;
    ctaRaw = detectCta(sharpData, cw, ch);
  } catch (e) {
    console.warn("CTA detection failed.", e);
  }
  const result = analyzeImageData(
    data,
    w,
    h,
    { width: bmp.width, height: bmp.height },
    ctaRaw,
    sharpData && { data: sharpData, w: cw, h: ch }
  );

  // Predicted attention, and how much of it lands on the CTA candidate.
  let saliency;
  try {
    saliency = await modelSaliency(bmp);
  } catch (e) {
    console.warn("Gaze model unavailable, using contrast-based fallback.", e);
    saliency = computeSaliency(data, w, h);
  }
  const p = peak(saliency);
  const cta = result.metrics.ctaCandidate;
  const pct = cta ? Math.round(attentionInBox(saliency, cta.box) * 100) : null;
  const scanpath = computeScanpath(saliency, { regions: result.viz.regions, cta });
  result.metrics.attention = {
    method: saliency.method,
    peakZone: zone(p.x, p.y),
    ctaAttentionPctOfPeak: pct,
    predictedFixationsIn3s: scanpath.fixations.length,
    ctaFirstFixation: scanpath.ctaHit ? scanpath.ctaHit.i + 1 : null,
    ctaFirstSeenMs: scanpath.ctaHit ? scanpath.ctaHit.start : null,
    fixationSequence: scanpath.fixations.map((f) => `${f.zone} (${f.type})`),
  };
  if (cta) {
    result.findings.push({
      how: HOW["Attention on CTA"],
      label: "Attention on CTA",
      value: `${pct}% of peak`,
      status: pct >= 60 ? "good" : pct >= 30 ? "info" : "warn",
      note:
        pct >= 60
          ? "The CTA candidate is among the most attended elements in the first seconds."
          : pct >= 30
            ? `The CTA candidate gets moderate predicted attention. The peak is ${zone(p.x, p.y)}.`
            : `The CTA candidate gets little predicted attention in the first seconds. The peak is ${zone(p.x, p.y)}.`,
    });
  }

  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const out = document.createElement("canvas");
  out.width = Math.round(bmp.width * scale);
  out.height = Math.round(bmp.height * scale);
  out.getContext("2d").drawImage(bmp, 0, 0, out.width, out.height);
  const imageBase64 = out.toDataURL("image/jpeg", 0.85).split(",")[1];
  return { ...result, saliency, scanpath, imageBase64 };
}
