"use client";

import { useEffect, useRef } from "react";

// Small coded visualizations for the layout diagnostics. Pixel grids use the same dither as the
// rest of the app. Colours stay in the phosphor palette, except where the data is a colour.
const LIME = "#7fee64";
const PHOS = "#ddffdc";
const PINE = "#3e4a3c";
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (v, x, y) => v > BAYER[(x & 3) + ((y & 3) << 2)];

function PixelCanvas({ cols, rows, paint, overlay, size = 6 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    c.width = cols * size;
    c.height = rows * size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const p = paint(x, y);
        if (!p) continue;
        ctx.globalAlpha = p[1];
        ctx.fillStyle = p[0];
        ctx.fillRect(x * size, y * size, size - 1, size - 1);
      }
    ctx.globalAlpha = 1;
    if (overlay) overlay(ctx, size);
  });
  return <canvas ref={ref} className="pix" aria-hidden="true" />;
}

// Layout silhouette: content blocks bright, empty space as a faint grid.
export function WhitespaceViz({ grid }) {
  return (
    <PixelCanvas
      cols={grid.cols}
      rows={grid.rows}
      paint={(x, y) => (grid.values[y * grid.cols + x] > 0.5 ? [PINE, 0.45] : [PHOS, 0.85])}
    />
  );
}

// Edge density as a dithered map: denser pixels where there is more visual detail.
export function ClutterViz({ grid }) {
  return (
    <PixelCanvas
      cols={grid.cols}
      rows={grid.rows}
      paint={(x, y) => {
        const v = grid.values[y * grid.cols + x];
        return dither(v, x, y) ? [LIME, 0.35 + 0.65 * v] : [PINE, 0.2];
      }}
    />
  );
}

// Visual weight per column, with the centre line. Even weight gives a flat skyline.
export function BalanceViz({ columns, leftShare }) {
  const rows = 14;
  const n = columns.length;
  return (
    <div className="viz-stack">
      <PixelCanvas
        cols={n}
        rows={rows}
        size={8}
        paint={(x, y) => {
          const h = Math.round(columns[x] * rows);
          return rows - y <= h ? [PHOS, 0.35 + 0.5 * columns[x]] : [PINE, 0.18];
        }}
        overlay={(ctx, s) => {
          ctx.fillStyle = LIME;
          ctx.fillRect((n / 2) * s - 1, 0, 2, rows * s);
        }}
      />
      <div className="split">
        <span>L {Math.round(leftShare * 100)}%</span>
        <span>R {Math.round((1 - leftShare) * 100)}%</span>
      </div>
    </div>
  );
}

// The interface palette as a proportional strip: flat fills only, near-identical shades merged.
// Shares are relative to the palette, not the whole screen.
export function ColourViz({ colours }) {
  if (!colours.length) return <p className="viz-empty">No flat colour fills found</p>;
  return (
    <div className="viz-stack">
      <div className="strip">
        {colours.map((c) => (
          <span
            key={c.hex}
            style={{ flex: Math.max(c.sharePct, 1.5), background: c.hex }}
            title={`${c.hex} ${c.sharePct}%`}
          />
        ))}
      </div>
      <ul className="legend">
        {colours.slice(0, 4).map((c) => (
          <li key={c.hex}>
            <i style={{ background: c.hex }} />
            {c.hex}
            <b>{c.neutral ? "neutral" : `${c.sharePct}%`}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Contrast ratio on a scale with the WCAG thresholds for UI components (3:1) and text (4.5:1).
export function ContrastViz({ cta, background }) {
  if (!cta) return <p className="viz-empty">No CTA candidate detected</p>;
  const X = (v) => 12 + ((Math.min(Math.max(v, 1), 8) - 1) / 7) * 276;
  const v = cta.contrastVsBackground;
  return (
    <div className="viz-stack">
      <div className="pair">
        <span style={{ background }}>
          <i style={{ background: cta.colour }} />
        </span>
        <code>
          {cta.colour} on {background}
        </code>
      </div>
      <svg viewBox="0 0 300 52" className="scale-svg">
        <rect x="12" y="22" width="276" height="4" rx="2" fill={PINE} />
        <rect x="12" y="22" width={X(v) - 12} height="4" rx="2" fill={PHOS} />
        {[
          [3, "3:1 UI"],
          [4.5, "4.5:1 text"],
        ].map(([t, label]) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1="16" y2="32" stroke="#8cab87" strokeWidth="1" />
            <text x={X(t)} y="46" textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
        <path d={`M ${X(v)} 18 l -6 -9 h 12 z`} fill={LIME} />
        <text x="12" y="10" textAnchor="start">
          1:1
        </text>
        <text x="288" y="10" textAnchor="end">
          8:1
        </text>
      </svg>
    </div>
  );
}

// Predicted attention as a dithered map, with the CTA candidate outlined.
export function AttentionViz({ saliency, box }) {
  const { map, w, h } = saliency;
  let cols = 48;
  let rows = Math.max(6, Math.round((cols * h) / w));
  if (rows > 40) {
    rows = 40;
    cols = Math.max(6, Math.round((rows * w) / h));
  }
  const cell = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let m = 0;
      for (let sy = Math.floor((y * h) / rows); sy < Math.floor(((y + 1) * h) / rows); sy++)
        for (let sx = Math.floor((x * w) / cols); sx < Math.floor(((x + 1) * w) / cols); sx++)
          if (map[sy * w + sx] > m) m = map[sy * w + sx];
      cell[y * cols + x] = m;
    }
  return (
    <PixelCanvas
      cols={cols}
      rows={rows}
      paint={(x, y) => {
        const v = cell[y * cols + x];
        return dither(v, x, y) ? [LIME, 0.3 + 0.7 * v] : [PINE, 0.18];
      }}
      overlay={(ctx, s) => {
        if (!box) return;
        ctx.strokeStyle = PHOS;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          box.x * cols * s,
          box.y * rows * s,
          Math.max(4, box.w * cols * s),
          Math.max(4, box.h * rows * s)
        );
      }}
    />
  );
}
