"use client";

import { useEffect, useRef, useState } from "react";
import { C, bayer, ease, fit, inkTone, rgb, sampleGrid, tween } from "./pixel";
import { useSample } from "./useSample";

// Metric 01. The sample page drawn as a phosphor negative, with the real predicted gaze map lit
// in lime and the predicted fixations on top. Builds in once, top to bottom, then holds still.
// Hovering opens a sharp fovea over the real screenshot, the same idea as the gaze model.

const COLS = 120,
  ROWS = 60;

export default function PixelGaze() {
  const sample = useSample();
  const canvas = useRef(null);
  const stage = useRef(null);
  const sharp = useRef(null);
  const [phase, setPhase] = useState(0); // 0 waiting, 1 drawing, 2 done

  useEffect(() => {
    if (!sample) return;
    let grid = null;
    let p = { rows: 0, sal: 0 };
    let cancel = () => {};
    const s = sample.saliency;
    const salAt = (x, y) => {
      const sx = Math.floor(((x + 0.5) / COLS) * s.w),
        sy = Math.floor(((y + 0.5) / ROWS) * s.h);
      return s.map[sy * s.w + sx];
    };
    const draw = () => {
      if (!grid) return;
      const { ctx, w, h } = fit(canvas.current);
      const cw = w / COLS,
        ch = h / ROWS,
        g = Math.max(1, cw * 0.14);
      ctx.clearRect(0, 0, w, h);
      const shownRows = Math.ceil(p.rows * ROWS);
      for (let y = 0; y < shownRows; y++)
        for (let x = 0; x < COLS; x++) {
          const i = y * COLS + x;
          // Ink: dark page areas become bright, the way a terminal would render it.
          const ink = Math.min(1, (1 - grid.lum[i]) * 1.6 + grid.std[i] * 2.2);
          let col = inkTone(ink * 0.9, x, y);
          const v = salAt(x, y);
          if (p.sal && v > 0.12 && v * p.sal > bayer(x, y) * 0.85 + 0.08) col = v > 0.7 ? C.phosphor : C.lime;
          ctx.fillStyle = rgb(col);
          ctx.fillRect(x * cw + g, y * ch + g, cw - g, ch - g);
        }
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        sampleGrid(COLS, ROWS).then((gr) => {
          grid = gr;
          setPhase(1);
          cancel = tween(
            800,
            (k) => {
              p.rows = ease(k);
              draw();
            },
            () => {
              cancel = tween(
                700,
                (k) => {
                  p.sal = ease(k);
                  draw();
                },
                () => setPhase(2)
              );
            }
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
  }, [sample]);

  // Fovea lens: written straight to the element, no re-render per move.
  const move = (e) => {
    const r = stage.current.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    const m = `radial-gradient(circle at ${x}px ${y}px, #000 52px, transparent 74px)`;
    sharp.current.style.webkitMaskImage = m;
    sharp.current.style.maskImage = m;
    stage.current.style.setProperty("--lx", `${x}px`);
    stage.current.style.setProperty("--ly", `${y}px`);
  };

  const fx = sample ? sample.fixations.slice(0, 8) : [];
  return (
    <div className="m-card px-card">
      <div className="window-bar">
        <i />
        <i />
        <i />
        <span>attention.map</span>
      </div>
      <div
        className={`px-stage ${phase === 2 ? "done" : ""}`}
        ref={stage}
        onPointerMove={move}
        onPointerDown={move}
        data-cursor="inspect"
      >
        <canvas ref={canvas} className="px-canvas" />
        <img
          ref={sharp}
          className="px-sharp"
          src="/demo/sample.jpg"
          alt="Sample landing page with its predicted attention"
        />
        <i className="px-lens" aria-hidden="true" />
        {fx.map((f, i) => (
          <span
            key={i}
            className={`px-fx ${f.type === "cta" ? "hit" : ""}`}
            style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, "--d": `${i * 90}ms` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="v-foot">
        <span className="px-key">
          <i className="lime" />
          predicted gaze
        </span>
        <span className="px-key">
          <i className="num" />
          fixation order
        </span>
        <span>
          <span className="for-pointer">hover</span>
          <span className="for-touch">tap</span> for the fovea
        </span>
      </div>
    </div>
  );
}
