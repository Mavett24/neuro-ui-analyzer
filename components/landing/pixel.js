"use client";

// Shared helpers for the landing page's pixel visuals.

export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(x & 3) + ((y & 3) << 2)];

// Palette, as rgb arrays.
export const C = {
  void: [0, 0, 0],
  ink0: [18, 23, 18],
  ink1: [43, 54, 42],
  ink2: [74, 91, 72],
  ink3: [120, 149, 115],
  lime: [127, 238, 100],
  phosphor: [221, 255, 220],
};
export const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const INK = [C.ink0, C.ink1, C.ink2, C.ink3];

// Ordered dither of a 0..1 value into the four ink tones.
export function inkTone(v, x, y) {
  const s = Math.max(0, Math.min(0.999, v)) * 3;
  const lo = Math.floor(s);
  return INK[Math.min(3, s - lo > bayer(x, y) ? lo + 1 : lo)];
}

// The sample screenshot reduced to a grid: mean luminance and local contrast per cell.
const cache = new Map();
export function sampleGrid(cols, rows, src = "/demo/sample.jpg") {
  const key = `${src}:${cols}x${rows}`;
  if (!cache.has(key))
    cache.set(
      key,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const sub = 4; // pixels per cell side in the working copy
          const W = cols * sub,
            H = rows * sub;
          const c = document.createElement("canvas");
          c.width = W;
          c.height = H;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, W, H);
          const px = ctx.getImageData(0, 0, W, H).data;
          const lum = new Float32Array(cols * rows);
          const std = new Float32Array(cols * rows);
          for (let y = 0; y < rows; y++)
            for (let x = 0; x < cols; x++) {
              let s = 0,
                s2 = 0;
              for (let j = 0; j < sub; j++)
                for (let i = 0; i < sub; i++) {
                  const k = ((y * sub + j) * W + x * sub + i) * 4;
                  const l = (0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255;
                  s += l;
                  s2 += l * l;
                }
              const n = sub * sub,
                m = s / n;
              lum[y * cols + x] = m;
              std[y * cols + x] = Math.sqrt(Math.max(0, s2 / n - m * m));
            }
          resolve({ cols, rows, lum, std });
        };
        img.onerror = reject;
        img.src = src;
      })
    );
  return cache.get(key);
}

// Size a canvas to its box at device resolution; returns css width and height.
export function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export const ease = (k) => 1 - Math.pow(1 - k, 3);
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Run fn(progress 0..1) over ms. Returns a cancel function.
export function tween(ms, fn, done) {
  if (reducedMotion()) {
    fn(1);
    done?.();
    return () => {};
  }
  let frame;
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    fn(k);
    if (k < 1) frame = requestAnimationFrame(tick);
    else done?.();
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
