"use client";

import { useEffect, useRef, useState } from "react";
import { fit, inkTone, rgb, sampleGrid, tween, ease } from "./pixel";

// Metric 04. What the vision model reads that pixels cannot: the content of the screen. The page
// is drawn in pixels, then each detection frames itself in. Example output for the sample page.

const COLS = 120,
  ROWS = 60;
const FOUND = [
  { kind: "Text", label: "Headline", box: [0.04, 0.26, 0.43, 0.2] },
  { kind: "Text", label: "Body copy", box: [0.04, 0.48, 0.36, 0.13] },
  { kind: "Action", label: "Primary CTA", box: [0.043, 0.655, 0.125, 0.085] },
  { kind: "Action", label: "Secondary link", box: [0.175, 0.665, 0.09, 0.065] },
  { kind: "Action", label: "Nav, 5 links", box: [0.62, 0.035, 0.34, 0.065] },
  { kind: "Reward", label: "Price figure", box: [0.52, 0.28, 0.17, 0.11] },
  { kind: "Object", label: "Product chart", box: [0.52, 0.5, 0.43, 0.24] },
  { kind: "Social", label: "Logo strip", box: [0.04, 0.82, 0.38, 0.065] },
];
const COUNTS = [
  ["Text", "2 blocks"],
  ["Actions", "7"],
  ["Reward cues", "1"],
  ["Faces", "0"],
];

export default function PixelDetect() {
  const canvas = useRef(null);
  const [live, setLive] = useState(false);
  const [hot, setHot] = useState(null);

  useEffect(() => {
    let grid = null,
      p = 0,
      cancel = () => {};
    const draw = () => {
      if (!grid) return;
      const { ctx, w, h } = fit(canvas.current);
      const cw = w / COLS,
        ch = h / ROWS,
        g = Math.max(1, cw * 0.14);
      ctx.clearRect(0, 0, w, h);
      const rows = Math.ceil(p * ROWS);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < COLS; x++) {
          const i = y * COLS + x;
          const ink = Math.min(1, (1 - grid.lum[i]) * 1.6 + grid.std[i] * 2.2) * 0.8;
          ctx.fillStyle = rgb(inkTone(ink, x, y));
          ctx.fillRect(x * cw + g, y * ch + g, cw - g, ch - g);
        }
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        sampleGrid(COLS, ROWS).then((gr) => {
          grid = gr;
          cancel = tween(
            700,
            (k) => {
              p = ease(k);
              draw();
            },
            () => setLive(true)
          );
        });
      },
      { rootMargin: "0px 0px -15% 0px" }
    );
    io.observe(canvas.current);
    const ro = new ResizeObserver(draw);
    ro.observe(canvas.current);
    return () => {
      cancel();
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <div className="m-card px-card">
      <div className="window-bar">
        <i />
        <i />
        <i />
        <span>content.detect</span>
      </div>
      <div className={`px-stage detect ${live ? "live" : ""} ${hot != null ? "focus" : ""}`}>
        <canvas ref={canvas} className="px-canvas" />
        {FOUND.map((f, i) => (
          <span
            key={f.label}
            className={`px-box k-${f.kind.toLowerCase()} ${hot === i ? "hot" : ""}`}
            style={{
              left: `${f.box[0] * 100}%`,
              top: `${f.box[1] * 100}%`,
              width: `${f.box[2] * 100}%`,
              height: `${f.box[3] * 100}%`,
              "--d": `${i * 110}ms`,
            }}
            onPointerEnter={() => setHot(i)}
            onPointerLeave={() => setHot(null)}
            data-cursor="inspect"
          >
            <b>
              {f.kind} · {f.label}
            </b>
          </span>
        ))}
      </div>
      <ul className="px-counts">
        {COUNTS.map(([k, v]) => (
          <li key={k} className={v === "0" ? "zero" : ""}>
            <span>{k}</span>
            <b>{v}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
