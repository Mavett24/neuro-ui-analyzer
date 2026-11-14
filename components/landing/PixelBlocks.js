"use client";

import { useEffect, useRef, useState } from "react";
import { C, bayer, ease, fit, inkTone, rgb, sampleGrid, tween } from "./pixel";
import { useSample } from "./useSample";

// Metric 02. The sample page split into blocks, the way the layout check reads it. Each tab lights
// the blocks behind one measure; switching dissolves cell by cell. Still at rest.

const COLS = 64, ROWS = 32;
const MODES = [
  { key: "space", name: "White space", what: "Flat blocks with nothing on them" },
  { key: "clutter", name: "Clutter", what: "Blocks holding detail, brighter where it is denser" },
  { key: "balance", name: "Balance", what: "Detail in the left half against the right half" },
  { key: "cta", name: "CTA contrast", what: "The detected button, measured against its surroundings" },
];

export default function PixelBlocks() {
  const sample = useSample();
  const canvas = useRef(null);
  const [mode, setMode] = useState(0);
  const [grid, setGrid] = useState(null);
  const state = useRef({ from: -1, to: 0, k: 1, shown: false });

  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        sampleGrid(COLS, ROWS).then(setGrid);
      },
      { rootMargin: "0px 0px -15% 0px" }
    );
    io.observe(canvas.current);
    return () => io.disconnect();
  }, []);

  // What each block looks like in a given mode.
  const colour = (m, x, y) => {
    const i = y * COLS + x;
    const detail = Math.min(1, grid.std[i] * 7);
    const empty = grid.std[i] < 0.018;
    const ink = Math.min(1, (1 - grid.lum[i]) * 1.4 + detail * 0.5) * 0.55;
    const base = inkTone(ink, x, y);
    const key = MODES[m].key;
    if (key === "space") return empty ? (bayer(x, y) < 0.75 ? C.lime : C.ink2) : base;
    if (key === "clutter") return !empty && detail > bayer(x, y) * 0.9 ? (detail > 0.75 ? C.phosphor : C.lime) : base;
    if (key === "balance") return !empty && detail > 0.08 ? (x < COLS / 2 ? C.lime : C.phosphor) : base;
    const b = sample?.stats.cta.box;
    if (b && (x + 0.5) / COLS >= b.x && (x + 0.5) / COLS <= b.x + b.w && (y + 0.5) / ROWS >= b.y && (y + 0.5) / ROWS <= b.y + b.h) return C.lime;
    return inkTone(ink * 0.6, x, y);
  };

  const draw = () => {
    if (!grid || !canvas.current) return;
    const { from, to, k } = state.current;
    const { ctx, w, h } = fit(canvas.current);
    const cw = w / COLS, ch = h / ROWS, g = Math.max(1, cw * 0.12);
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        // Dissolve: a cell switches once the sweep passes its dither threshold.
        const reveal = from < 0 ? (y + 0.5) / ROWS < k : true;
        if (!reveal) continue;
        const m = from >= 0 && bayer(x, y) >= k ? from : to;
        ctx.fillStyle = rgb(colour(m, x, y));
        ctx.fillRect(x * cw + g, y * ch + g, cw - g, ch - g);
      }
  };

  useEffect(() => {
    if (!grid) return;
    const s = state.current;
    s.from = s.shown ? s.to : -1;
    s.to = mode;
    s.shown = true;
    const cancel = tween(s.from < 0 ? 800 : 320, (k) => {
      s.k = s.from < 0 ? ease(k) : k;
      draw();
    });
    return cancel;
  }, [grid, mode, sample]);

  useEffect(() => {
    const ro = new ResizeObserver(draw);
    ro.observe(canvas.current);
    return () => ro.disconnect();
  });

  // Balance share from the same blocks, so the number matches the picture.
  let left = 0, right = 0;
  if (grid)
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const d = grid.std[y * COLS + x] < 0.018 ? 0 : Math.min(1, grid.std[y * COLS + x] * 7);
        if (x < COLS / 2) left += d;
        else right += d;
      }
  const share = left + right ? left / (left + right) : 0.5;
  const s = sample?.stats;
  const value = [
    s ? `${Math.round(s.whitespace)}%` : "",
    s ? `${s.clutter}` : "",
    (Math.min(share, 1 - share) / Math.max(share, 1 - share)).toFixed(2),
    s ? `${s.cta.contrast.toFixed(2)}:1` : "",
  ][mode];
  const unit = ["of the screen is empty", "of 100, moderate", "1 means even", "passes WCAG 3:1"][mode];

  return (
    <div className="m-card px-card">
      <div className="window-bar">
        <i />
        <i />
        <i />
        <span>layout.check</span>
      </div>
      <div className="px-tabs" role="tablist" aria-label="Layout measures">
        {MODES.map((m, i) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={i === mode}
            className={i === mode ? "on" : ""}
            onClick={() => setMode(i)}
            onPointerEnter={() => setMode(i)}
          >
            {m.name}
          </button>
        ))}
      </div>
      <div className="px-stage blocks">
        <canvas ref={canvas} className="px-canvas" />
      </div>
      <div className="px-readout">
        <span className="big" key={mode}>
          {value}
          <small>{unit}</small>
        </span>
        {MODES[mode].key === "balance" ? (
          <span className="px-split" aria-label={`${Math.round(share * 100)}% of detail on the left`}>
            <i style={{ flex: share }} />
            <b style={{ flex: 1 - share }} />
          </span>
        ) : (
          <span className="what">{MODES[mode].what}</span>
        )}
      </div>
    </div>
  );
}
