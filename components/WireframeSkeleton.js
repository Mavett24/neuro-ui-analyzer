"use client";

import { useEffect, useRef } from "react";

// Loading state for the attention map: the uploaded design reduced to a pixel wireframe
// (content blocks bright, empty space faint) with a lime scan line passing over it.
// One still frame if the user prefers reduced motion.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export default function WireframeSkeleton({ src }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame, last = 0, cols = 0, rows = 0, cell = 8, grid = null, dead = false;

    const img = new Image();
    img.onload = () => {
      if (dead) return;
      cols = Math.min(112, Math.max(24, Math.round(img.naturalWidth / 12)));
      rows = Math.max(8, Math.round((cols * img.naturalHeight) / img.naturalWidth));
      const small = document.createElement("canvas");
      small.width = cols;
      small.height = rows;
      const sctx = small.getContext("2d", { willReadFrequently: true });
      sctx.drawImage(img, 0, 0, cols, rows);
      const d = sctx.getImageData(0, 0, cols, rows).data;
      const lum = new Float32Array(cols * rows);
      const hist = new Uint32Array(16);
      for (let i = 0; i < cols * rows; i++) {
        lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
        hist[Math.min(15, Math.floor(lum[i] * 16))]++;
      }
      // Content = whatever differs from the most common brightness (the page background).
      const bg = (hist.indexOf(Math.max(...hist)) + 0.5) / 16;
      grid = lum.map((v) => Math.min(1, Math.abs(v - bg) * 2.4));
      canvas.width = cols * cell;
      canvas.height = rows * cell;
      draw(performance.now());
      if (!still) frame = requestAnimationFrame(loop);
    };
    img.src = src;

    const draw = (now) => {
      const t = now / 1000;
      const head = ((t * 0.45) % 1.3) * rows; // scan line position, top to bottom
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < rows; y++) {
        const d = head - y;
        const scan = still ? 0 : d > 0 ? Math.max(0, 1 - d / (rows * 0.22)) : 0;
        for (let x = 0; x < cols; x++) {
          const v = grid[y * cols + x];
          const on = v > 0.12 && 0.25 + v > BAYER[(x & 3) + ((y & 3) << 2)];
          if (scan > 0.02 && (on || scan > BAYER[((x + 1) & 3) + ((y & 3) << 2)] * 1.6)) {
            ctx.fillStyle = `rgba(127, 238, 100, ${(on ? 0.35 : 0.1) + 0.6 * scan * (on ? 1 : 0.5)})`;
          } else if (on) ctx.fillStyle = `rgba(221, 255, 220, ${0.14 + 0.32 * v})`;
          else ctx.fillStyle = "rgba(62, 74, 60, 0.22)";
          ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }
      }
    };
    const loop = (now) => {
      if (now - last > 60) {
        last = now;
        draw(now);
      }
      frame = requestAnimationFrame(loop);
    };
    return () => {
      dead = true;
      cancelAnimationFrame(frame);
    };
  }, [src]);

  return <canvas ref={ref} className="wire" aria-hidden="true" />;
}
