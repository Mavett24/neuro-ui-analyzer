"use client";

import { useEffect, useRef } from "react";

// Animated field of dithered pixels in the accent colour. "ambient" drifts slowly behind content,
// "busy" sweeps left to right as a loading state. One still frame if the user prefers reduced motion.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export default function PixelField({ mode = "ambient", cell = 8, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame,
      last = 0,
      cols = 0,
      rows = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(canvas.clientWidth / cell);
      rows = Math.ceil(canvas.clientHeight / cell);
      draw(performance.now());
    };

    const draw = (now) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          let v;
          if (mode === "busy") {
            const head = ((t * 0.6) % 1.4) * cols; // sweep position
            const d = head - x;
            v = d > 0 ? Math.max(0, 1 - d / (cols * 0.45)) : 0;
            v *= 0.75 + 0.25 * Math.sin(y * 1.7 + t * 6);
          } else {
            v =
              0.5 +
              0.3 * Math.sin(x * 0.21 + t * 0.35) * Math.cos(y * 0.27 - t * 0.28) +
              0.2 * Math.sin((x + y) * 0.11 + t * 0.22);
            v = v * v;
          }
          const threshold = BAYER[(x & 3) + ((y & 3) << 2)];
          if (v > threshold) {
            ctx.fillStyle = `rgba(127, 238, 100, ${mode === "busy" ? 0.25 + 0.75 * v : 0.1 + 0.5 * v})`;
            ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
          }
        }
    };

    const loop = (now) => {
      if (now - last > 70) {
        last = now;
        draw(now);
      }
      frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!still) frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mode, cell]);

  return <canvas ref={ref} className={`pixel-field ${className}`} aria-hidden="true" />;
}
