// Attention map. Two methods share one output shape { map, w, h, method }:
// 1. modelSaliency: UNISAL (Droste et al., ECCV 2020), a neural network trained on human gaze
//    recordings and fine-tuned on the MIT1003 eye-tracking set. Runs in the browser via ONNX Runtime.
//    Its training images are natural scenes and video, not UIs, so treat UI results as an estimate.
// 2. computeSaliency: classical contrast-based saliency (Itti and Koch style), used only if the
//    model cannot load. It is not trained on gaze data.

let sessionPromise;
async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = "/ort/";
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create("/models/unisal.onnx", {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      return { ort, session };
    })();
    sessionPromise.catch(() => (sessionPromise = null));
  }
  return sessionPromise;
}

// Downscale in halving steps. A single large canvas resize aliases thin text, and the model
// is sensitive to that: it shifts predicted attention away from headlines.
function downscale(source, w, h) {
  let cur = source;
  let cw = source.width,
    ch = source.height;
  const step = (tw, th) => {
    const c = document.createElement("canvas");
    c.width = tw;
    c.height = th;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, tw, th);
    cur = c;
    cw = tw;
    ch = th;
  };
  while (cw >= w * 2 && ch >= h * 2) step(Math.ceil(cw / 2), Math.ceil(ch / 2));
  step(w, h);
  return cur;
}

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export async function modelSaliency(bitmap) {
  const { ort, session } = await getSession();
  // The model was trained around 384px wide. Sides must be multiples of 32; very tall pages are capped.
  let w = 384;
  let h = Math.max(32, Math.round(((bitmap.height / bitmap.width) * w) / 32) * 32);
  if (h > 1024) {
    w = Math.max(96, Math.round(((bitmap.width / bitmap.height) * 1024) / 32) * 32);
    h = 1024;
  }
  const { data } = downscale(bitmap, w, h).getContext("2d").getImageData(0, 0, w, h);
  const n = w * h;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) input[c * n + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  const out = await session.run({ image: new ort.Tensor("float32", input, [1, 3, h, w]) });
  return { map: out.saliency.data, w, h, method: "UNISAL gaze model" };
}

const S = 4; // downscale factor from the analysis image

function boxBlur(src, w, h, r) {
  // Separable box blur with prefix sums; edges average over the pixels that exist.
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const P = new Float64Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) P[x + 1] = P[x] + src[row + x];
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - r),
        b = Math.min(w, x + r + 1);
      tmp[row + x] = (P[b] - P[a]) / (b - a);
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) P[y + 1] = P[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const a = Math.max(0, y - r),
        b = Math.min(h, y + r + 1);
      out[y * w + x] = (P[b] - P[a]) / (b - a);
    }
  }
  return out;
}

function normalise(a) {
  let max = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > max) max = a[i];
  if (max > 0) for (let i = 0; i < a.length; i++) a[i] /= max;
  return a;
}

export function computeSaliency(data, W, H) {
  const w = Math.floor(W / S);
  const h = Math.floor(H / S);
  const n = w * h;
  const I = new Float32Array(n),
    RG = new Float32Array(n),
    BY = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let dy = 0; dy < S; dy++)
        for (let dx = 0; dx < S; dx++) {
          const i = ((y * S + dy) * W + x * S + dx) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
      const k = y * w + x,
        d = S * S * 255;
      r /= d;
      g /= d;
      b /= d;
      I[k] = (r + g + b) / 3;
      RG[k] = r - g;
      BY[k] = b - (r + g) / 2;
    }

  const map = new Float32Array(n);
  for (const [ch, weight] of [
    [I, 1],
    [RG, 0.6],
    [BY, 0.6],
  ]) {
    for (const [c, s] of [
      [1, 6],
      [3, 14],
    ]) {
      const centre = boxBlur(ch, w, h, c);
      const surround = boxBlur(ch, w, h, s);
      const cs = new Float32Array(n);
      for (let i = 0; i < n; i++) cs[i] = Math.abs(centre[i] - surround[i]);
      normalise(cs);
      for (let i = 0; i < n; i++) map[i] += cs[i] * weight;
    }
  }

  // Upper-left weighted prior over the first screen height.
  const fold = Math.min(h, Math.round(w * 0.7));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x / w - 0.42) / 0.55;
      const dy = (Math.min(y, fold * 1.6) / fold - 0.38) / 0.6;
      map[y * w + x] *= 0.55 + 0.45 * Math.exp(-(dx * dx + dy * dy));
    }

  const smooth = normalise(boxBlur(boxBlur(map, w, h, 2), w, h, 2));
  return { map: smooth, w, h, method: "contrast-based estimate" };
}

// Strongest predicted attention inside a normalised box, as a fraction of the map's peak (0 to 1).
export function attentionInBox(sal, box) {
  const { map, w, h } = sal;
  const x0 = Math.max(0, Math.floor(box.x * w)),
    x1 = Math.min(w, Math.ceil((box.x + box.w) * w));
  const y0 = Math.max(0, Math.floor(box.y * h)),
    y1 = Math.min(h, Math.ceil((box.y + box.h) * h));
  let best = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (map[y * w + x] > best) best = map[y * w + x];
  return best;
}

export function peak(sal) {
  const { map, w, h } = sal;
  let best = 0;
  for (let i = 1; i < map.length; i++) if (map[i] > map[best]) best = i;
  return { x: ((best % w) + 0.5) / w, y: (Math.floor(best / w) + 0.5) / h };
}

// Standard eye-tracking heatmap colours: transparent, blue, green, yellow, red.
const STOPS = [
  [0.0, 0, 0, 255, 0],
  [0.2, 0, 90, 255, 70],
  [0.45, 0, 220, 120, 130],
  [0.7, 255, 230, 0, 175],
  [1.0, 255, 30, 0, 215],
];

// mask (optional, 0 to 1 per pixel) limits the map to where the eyes have been, for playback.
export function drawHeatmap(canvas, sal, mask = null) {
  const { map, w, h } = sal;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < map.length; i++) {
    const v = mask ? map[i] * mask[i] : map[i];
    let j = 1;
    while (j < STOPS.length - 1 && v > STOPS[j][0]) j++;
    const a = STOPS[j - 1],
      b = STOPS[j];
    const t = Math.max(0, Math.min(1, (v - a[0]) / (b[0] - a[0])));
    for (let c = 0; c < 4; c++) img.data[i * 4 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * t;
  }
  ctx.putImageData(img, 0, 0);
}
