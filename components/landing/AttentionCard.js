"use client";

import { useEffect, useRef } from "react";
import { drawHeatmap } from "../../lib/saliency";
import { useSample } from "./useSample";

// Static result of the real analyzer on the sample page: heatmap plus predicted scanpath.
export default function AttentionCard() {
  const sample = useSample();
  const heat = useRef(null);
  useEffect(() => {
    if (sample && heat.current) drawHeatmap(heat.current, sample.saliency);
  }, [sample]);
  const fx = sample ? sample.fixations.slice(0, 8) : [];
  const H = sample ? (1000 * sample.h) / sample.w : 500;
  return (
    <div className="m-card">
      <div className="window-bar">
        <i />
        <i />
        <i />
        <span>attention.map</span>
      </div>
      <div className="m-shot">
        <img src="/demo/sample.jpg" alt="Sample landing page with a predicted attention heatmap and scanpath" />
        <canvas ref={heat} className="v-heatmap still" />
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {fx.slice(1).map((f, k) => (
            <line key={k} className="still" x1={fx[k].x * 1000} y1={fx[k].y * H} x2={f.x * 1000} y2={f.y * H} />
          ))}
        </svg>
        {fx.map((f, i) => (
          <span key={i} className={`v-fx still ${f.type === "cta" ? "hit" : ""}`} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className="v-foot">
        <span className="heat-legend">
          Low <i /> High
        </span>
        <span>peak {sample?.stats.peak || "…"}</span>
        <span>{sample ? `CTA reached on fixation ${sample.ctaHit.i + 1}` : ""}</span>
      </div>
    </div>
  );
}
