"use client";

import { useEffect, useRef } from "react";
import { bayer, ease, fit, tween } from "./pixel";

// The seam between two bands: the next band's colour grows into the previous one as dithered
// cells, once, when the seam scrolls into view. Still afterwards.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export default function PixelDivider({ from, to, cell = 8, height = 64 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const a = hex(from), b = hex(to);
    let progress = 0;
    let cancel = () => {};
    // Columns get a fixed random offset so the edge reads as eroded, not as a straight ramp.
    let jitter = [];
    const draw = () => {
      const { ctx, w, h } = fit(canvas);
      const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      if (jitter.length !== cols) jitter = Array.from({ length: cols }, (_, i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1);
      ctx.fillStyle = `rgb(${a})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgb(${b})`;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const t = (y + 0.5) / rows; // 0 at the top (from), 1 at the bottom (to)
          const v = t * 1.25 - 0.12 + (jitter[x] - 0.5) * 0.35;
          if (v * progress > bayer(x, y) * 0.98 + (1 - progress) * 0.5) ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      // Bottom row always lands on the next band, so there is no hairline seam.
      if (progress >= 1) ctx.fillRect(0, h - 1, w, 1);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        cancel = tween(900, (k) => {
          progress = ease(k);
          draw();
        });
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(canvas);
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => {
      cancel();
      io.disconnect();
      ro.disconnect();
    };
  }, [from, to, cell]);

  return <canvas ref={ref} className="pixel-divider" style={{ height }} aria-hidden="true" />;
}
