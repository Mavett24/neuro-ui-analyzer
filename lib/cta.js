// Primary CTA detection from pixels.
// A filled button is looked for as what it is: a region of one flat colour with straight top and
// bottom edges, button proportions, a short contrasting label inside it and a different colour
// around it. Every candidate is scored, and when nothing scores well the answer is "no CTA found"
// instead of a guess. Outlined (ghost) buttons and text links are not detected.

const TOL = 26; // colour distance that still counts as the same fill
const MIN_CONFIDENCE = 0.34;

const sat = (r, g, b) => {
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};
const relLum = (r, g, b) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const l1 = relLum(...a),
    l2 = relLum(...b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const median = (arr) => {
  const s = Array.from(arr).sort((x, y) => x - y);
  return s[s.length >> 1] || 0;
};

export function detectCta(data, w, h) {
  const n = w * h;
  const portrait = h > w * 1.2;
  // Plausible button size, relative to the screenshot width.
  const minH = Math.max(9, Math.round(w * (portrait ? 0.055 : 0.016)));
  const maxH = Math.round(w * (portrait ? 0.2 : 0.075));
  const maxW = Math.round(w * (portrait ? 0.96 : 0.42));

  // Share of the image per coarse colour, to tell an accent from a colour used everywhere.
  const hist = new Uint32Array(4096);
  for (let i = 0; i < n; i++)
    hist[((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4)]++;

  const label = new Int32Array(n); // 0 = unvisited, else component id
  const stack = new Int32Array(n);
  const candidates = [];
  let id = 0;

  for (let s = 0; s < n; s++) {
    if (label[s]) continue;
    id++;
    const r0 = data[s * 4],
      g0 = data[s * 4 + 1],
      b0 = data[s * 4 + 2];
    let top = 0;
    stack[top++] = s;
    label[s] = id;
    let count = 0,
      x0 = w,
      x1 = 0,
      y0 = h,
      y1 = 0,
      sr = 0,
      sg = 0,
      sb = 0;
    while (top) {
      const k = stack[--top];
      const x = k % w,
        y = (k - x) / w;
      count++;
      sr += data[k * 4];
      sg += data[k * 4 + 1];
      sb += data[k * 4 + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let d = 0; d < 4; d++) {
        const nk = d === 0 ? k + 1 : d === 1 ? k - 1 : d === 2 ? k + w : k - w;
        if (d === 0 && x === w - 1) continue;
        if (d === 1 && x === 0) continue;
        if (nk < 0 || nk >= n || label[nk]) continue;
        const dr = data[nk * 4] - r0,
          dg = data[nk * 4 + 1] - g0,
          db = data[nk * 4 + 2] - b0;
        if (dr * dr + dg * dg + db * db > TOL * TOL) continue;
        label[nk] = id;
        stack[top++] = nk;
      }
    }
    const bw = x1 - x0 + 1,
      bh = y1 - y0 + 1;
    if (bh < minH || bh > maxH || bw > maxW) continue;
    const aspect = bw / bh;
    if (aspect < 1.5 || aspect > 9.5) continue;
    const fill = count / (bw * bh);
    if (fill < 0.5 || fill > 0.985) continue;
    candidates.push({ id, x0, x1, y0, y1, bw, bh, count, rgb: [sr / count, sg / count, sb / count], fill });
  }

  const scored = [];
  for (const c of candidates) {
    const { x0, x1, y0, y1, bw, bh, rgb } = c;

    // 1. Straight sides: in the middle rows the fill must span almost the full width.
    let rows = 0,
      spanning = 0;
    for (let y = y0 + Math.round(bh * 0.25); y <= y1 - Math.round(bh * 0.25); y++) {
      let a = -1,
        b = -1;
      for (let x = x0; x <= x1; x++)
        if (label[y * w + x] === c.id) {
          if (a < 0) a = x;
          b = x;
        }
      rows++;
      if (a >= 0 && (b - a + 1) / bw >= 0.92) spanning++;
    }
    const straight = rows ? spanning / rows : 0;
    if (straight < 0.8) continue;
    // Top and bottom edges: mostly fill a couple of pixels in from the edge.
    const edgeRow = (y) => {
      let on = 0;
      const a = x0 + Math.round(bh * 0.5),
        b = x1 - Math.round(bh * 0.5);
      if (b <= a) return 1;
      for (let x = a; x <= b; x++) if (label[y * w + x] === c.id) on++;
      return on / (b - a + 1);
    };
    const inset = Math.max(1, Math.round(bh * 0.12));
    if (edgeRow(y0 + inset) < 0.85 || edgeRow(y1 - inset) < 0.85) continue;

    // 2. Label: some pixels inside that are not the fill, contrasting with it, roughly centred.
    const ix0 = x0 + Math.round(bh * 0.3),
      ix1 = x1 - Math.round(bh * 0.3);
    const iy0 = y0 + Math.round(bh * 0.15),
      iy1 = y1 - Math.round(bh * 0.15);
    let inner = 0,
      other = 0,
      cy = 0,
      cxs = 0,
      strong = 0;
    const strokes = [];
    const fillLum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    for (let y = iy0; y <= iy1; y++)
      for (let x = ix0; x <= ix1; x++) {
        inner++;
        const k = y * w + x;
        if (label[k] === c.id) continue;
        other++;
        const r = data[k * 4],
          g = data[k * 4 + 1],
          b = data[k * 4 + 2];
        const dl = Math.abs(0.2126 * r + 0.7152 * g + 0.0722 * b - fillLum);
        if (dl > 60) {
          strong++;
          strokes.push([dl, r, g, b]);
          cy += y;
          cxs += x;
        }
      }
    if (!inner) continue;
    const labelShare = other / inner;
    if (labelShare < 0.025 || labelShare > 0.5 || strong < 4) continue;
    // Label colour from the stroke cores. Small text is antialiased into the fill, so averaging every
    // label pixel would blend white-on-orange into pink and underrate the contrast.
    strokes.sort((p, q) => q[0] - p[0]);
    const core = strokes.slice(0, Math.max(4, Math.round(strokes.length * 0.1)));
    const labelRgb = [1, 2, 3].map((ch) => core.reduce((sum, p) => sum + p[ch], 0) / core.length);
    const ly = (cy / strong - y0) / bh,
      lx = (cxs / strong - x0) / bw;
    if (ly < 0.3 || ly > 0.7 || lx < 0.2 || lx > 0.8) continue;
    const labelContrast = contrast(labelRgb, rgb);
    if (labelContrast < 2) continue;
    // Text is made of thin strokes: most label pixels should sit next to fill pixels.
    const labelScore = Math.min(1, (labelContrast - 1.5) / 2.5) * Math.min(1, strong / other + 0.35);

    // 3. Surroundings: a ring just outside the box, ideally one colour that differs from the fill.
    const ring = [];
    const pad = Math.max(3, Math.round(bh * 0.25));
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const k = (y * w + x) * 4;
      ring.push([data[k], data[k + 1], data[k + 2]]);
    };
    for (let x = x0; x <= x1; x += 2) {
      push(x, y0 - pad);
      push(x, y1 + pad);
    }
    for (let y = y0; y <= y1; y += 2) {
      push(x0 - pad, y);
      push(x1 + pad, y);
    }
    if (ring.length < 8) continue;
    const around = [0, 1, 2].map((ch) => median(ring.map((p) => p[ch])));
    const uniform =
      ring.filter((p) => Math.hypot(p[0] - around[0], p[1] - around[1], p[2] - around[2]) < 36).length / ring.length;
    const apart = Math.hypot(rgb[0] - around[0], rgb[1] - around[1], rgb[2] - around[2]);
    if (apart < 45) continue;
    const ctaContrast = contrast(rgb, around);

    // 4. Accent: saturated or strongly contrasting, and not a colour that covers the page.
    const share = hist[((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4)] / n;
    const rarity = 1 - Math.min(1, share / 0.2);
    const accent = Math.max(sat(...rgb), Math.min(1, (ctaContrast - 1) / 7));
    const size = Math.min(1, Math.sqrt((bw * bh) / (w * w)) / (portrait ? 0.2 : 0.045));

    const confidence =
      (0.45 + 0.55 * straight) *
      (0.4 + 0.6 * labelScore) *
      (0.3 + 0.7 * uniform) *
      (0.35 + 0.65 * accent) *
      (0.5 + 0.5 * rarity) *
      (0.55 + 0.45 * size);
    scored.push({ ...c, confidence, around, ctaContrast });
  }

  // Several buttons often share the accent colour. Among near-equal buttons of the winning colour, take the
  // first one down the page. A near-equal button in a different colour is a different action, not a repeat.
  const top = Math.max(0, ...scored.map((c) => c.confidence));
  if (top < MIN_CONFIDENCE) return null;
  // Convention: the primary action carries the accent colour, while neutral fills (white, black, grey)
  // are used for nav and secondary buttons. So a close-scoring saturated button beats a neutral one.
  const chromatic = (c) => sat(...c.rgb) > 0.35;
  const close = scored.filter((c) => c.confidence >= top * 0.8);
  const accents = close.filter(chromatic);
  const pool = accents.length && accents.length < close.length ? accents : scored;
  const leader = pool.reduce((a, c) => (c.confidence > a.confidence ? c : a));
  const sameFill = (c) => Math.hypot(...c.rgb.map((v, i) => v - leader.rgb[i])) < TOL;
  const best = pool
    .filter((c) => c.confidence >= leader.confidence * 0.85 && sameFill(c))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)[0];
  return {
    box: { x: best.x0 / w, y: best.y0 / h, w: best.bw / w, h: best.bh / h },
    rgb: best.rgb,
    around: best.around,
    contrast: best.ctaContrast,
    areaShare: (best.bw * best.bh) / n,
    confidence: +Math.min(1, best.confidence).toFixed(2),
  };
}
