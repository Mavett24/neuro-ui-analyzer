"use client";

import { useEffect, useRef, useState } from "react";
import { drawHeatmap } from "../lib/saliency";

// The landing page instrument. A sample design is shown the way peripheral vision sees it:
// blurred, desaturated, low contrast. Only a fovea-sized circle around the pointer is sharp.
// Holding still leaves a numbered fixation. "Show predicted path" overlays the model's path for
// the same page, precomputed by the real analyzer (public/demo/sample.json).
// Nothing moves until the user does.

const SHARP = 64; // px, roughly the fovea (about 2 degrees) at desktop viewing distance
const FADE = 150; // px, parafovea falloff
const DWELL_MS = 220; // holding still this long counts as a fixation
const STILL = 0.012; // max drift during a dwell, in image widths
const APART = 0.045; // a new fixation must be this far from the previous one
const MAX_FIX = 8;

export default function FoveaHero({ onAnalyze, dropProps, drag }) {
  const [data, setData] = useState(null);
  const [mine, setMine] = useState([]);
  const [showModel, setShowModel] = useState(false);
  const [touched, setTouched] = useState(false);
  const stage = useRef(null);
  const sharp = useRef(null);
  const ring = useRef(null);
  const readout = useRef(null);
  const heat = useRef(null);
  const target = useRef(null); // where the pointer is, 0 to 1
  const pos = useRef(null); // where the fovea is drawn, eased toward target
  const dwell = useRef({ x: 0, y: 0, since: 0 });
  const mineRef = useRef(mine);
  mineRef.current = mine;

  useEffect(() => {
    fetch("/demo/sample.json")
      .then((r) => r.json())
      .then((d) => {
        const bin = atob(d.map);
        const map = new Float32Array(bin.length);
        for (let i = 0; i < bin.length; i++) map[i] = bin.charCodeAt(i) / 255;
        setData({ ...d, saliency: { w: d.w, h: d.h, map } });
      })
      .catch(() => {});
  }, []);

  // Before any interaction the fovea rests on the model's first predicted fixation.
  useEffect(() => {
    if (!data || target.current) return;
    const f = data.fixations[0];
    target.current = { x: f.x, y: f.y };
    pos.current = { x: f.x, y: f.y };
    paint(f.x, f.y);
  }, [data]);

  useEffect(() => {
    if (showModel && data && heat.current) drawHeatmap(heat.current, data.saliency);
  }, [showModel, data]);

  // Write the fovea straight onto the elements (no React render, no inherited CSS variables).
  function paint(x, y) {
    const el = stage.current;
    if (!el || !sharp.current) return;
    const w = el.clientWidth, h = el.clientHeight;
    const px = x * w, py = y * h;
    // Scale with the image on small screens, so the fovea covers the same share of the page.
    const k = Math.min(1, w / 1200);
    const r = Math.max(30, SHARP * k), f = Math.max(70, FADE * k);
    const m = `radial-gradient(circle at ${px}px ${py}px, #000 ${r}px, rgba(0,0,0,0.55) ${(r + f) / 2}px, transparent ${r + f}px)`;
    ring.current.style.width = ring.current.style.height = `${r * 2}px`;
    ring.current.style.margin = `${-r}px 0 0 ${-r}px`;
    sharp.current.style.webkitMaskImage = m;
    sharp.current.style.maskImage = m;
    ring.current.style.transform = `translate(${px}px, ${py}px)`;
    if (readout.current) readout.current.textContent = `x ${x.toFixed(2)}  y ${y.toFixed(2)}`;
  }

  // Ease the fovea toward the pointer. Decorative motion, so a soft follow feels better than a
  // hard snap. Stops scheduling frames once it has arrived.
  useEffect(() => {
    if (!data) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const step = () => {
      frame = 0;
      const t = target.current, p = pos.current;
      if (!t || !p) return;
      const k = reduce ? 1 : 0.22;
      p.x += (t.x - p.x) * k;
      p.y += (t.y - p.y) * k;
      paint(p.x, p.y);
      if (Math.abs(t.x - p.x) > 0.0005 || Math.abs(t.y - p.y) > 0.0005) frame = requestAnimationFrame(step);
    };
    const el = stage.current;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      target.current = { x, y };
      if (!touched) setTouched(true);
      const d = dwell.current;
      if (Math.hypot(x - d.x, (y - d.y) * (r.height / r.width)) > STILL) dwell.current = { x, y, since: performance.now(), done: false };
      if (!frame) frame = requestAnimationFrame(step);
    };
    // Dwell check runs on a slow timer, not every frame.
    const timer = setInterval(() => {
      const d = dwell.current;
      if (!d.since || d.done || performance.now() - d.since < DWELL_MS) return;
      const list = mineRef.current;
      if (list.length >= MAX_FIX) return;
      const last = list[list.length - 1];
      const r = el.getBoundingClientRect();
      if (last && Math.hypot(d.x - last.x, (d.y - last.y) * (r.height / r.width)) < APART) return;
      d.done = true;
      setMine((m) => [...m, { x: d.x, y: d.y, i: m.length }]);
    }, 60);
    el.addEventListener("pointermove", onMove);
    const onResize = () => pos.current && paint(pos.current.x, pos.current.y);
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, [data, touched]);

  const cta = data?.stats?.cta?.box;
  const inCta = (f) => cta && f.x >= cta.x - 0.01 && f.x <= cta.x + cta.w + 0.01 && f.y >= cta.y - 0.02 && f.y <= cta.y + cta.h + 0.02;
  const myCta = mine.find(inCta);
  const modelCta = data?.ctaHit;
  const H = data ? (1000 * data.h) / data.w : 500;

  const path = (list, cls) =>
    list.slice(1).map((f, k) => {
      const a = list[k];
      return (
        <line key={`${cls}${f.i}`} className={cls} style={{ "--d": `${k * 60}ms` }} x1={a.x * 1000} y1={a.y * H} x2={f.x * 1000} y2={f.y * H} pathLength="1" />
      );
    });

  let verdict = "Move across the page. Hold still to fixate.";
  if (mine.length && !showModel) verdict = myCta ? `You found the button on fixation ${myCta.i + 1}.` : `${mine.length} fixation${mine.length === 1 ? "" : "s"}, the button not yet.`;
  if (showModel && modelCta)
    verdict = myCta
      ? `You: button on fixation ${myCta.i + 1}. Model: fixation ${modelCta.i + 1}, at ${(modelCta.start / 1000).toFixed(1)}s.`
      : `Model: button on fixation ${modelCta.i + 1}, at ${(modelCta.start / 1000).toFixed(1)}s.`;

  return (
    <section className="instrument" aria-label="Interactive demo: foveal vision on a sample page">
      <div className="inst-top">
        <span>payloom-landing.png</span>
        <span className="mono">1440 × 720</span>
        <span className="mono" ref={readout} aria-hidden="true" />
        <span className="mono">fovea ≈ 2°</span>
      </div>
      <div
        className={`inst-stage ${drag ? "over" : ""} ${showModel ? "model" : ""}`}
        ref={stage}
        onDragOver={dropProps.onDragOver}
        onDragLeave={dropProps.onDragLeave}
        onDrop={dropProps.onDrop}
      >
        <img className="periphery" src="/demo/sample.jpg" alt="" aria-hidden="true" />
        <img className="fovea" ref={sharp} src="/demo/sample.jpg" alt="Sample landing page for a fictional payroll product" />
        {showModel && <canvas ref={heat} className="inst-heat" />}
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {path(mine, "mine")}
          {showModel && data && path(data.fixations, "model")}
        </svg>
        {mine.map((f) => (
          <span key={`m${f.i}`} className={`fx mine ${inCta(f) ? "hit" : ""}`} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}>
            {f.i + 1}
          </span>
        ))}
        {showModel &&
          data?.fixations.map((f) => (
            <span
              key={`p${f.i}`}
              className={`fx model ${f.type === "cta" ? "hit" : ""}`}
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, "--d": `${f.i * 60}ms` }}
            >
              {f.i + 1}
            </span>
          ))}
        <i className="ring" ref={ring} aria-hidden="true" />
        {!touched && data && <span className="first-hint">Predicted first fixation</span>}
        <b className="tick tl" />
        <b className="tick tr" />
        <b className="tick bl" />
        <b className="tick br" />
        <div className="inst-drop" aria-hidden={!drag}>
          <p>Drop to analyze</p>
        </div>
      </div>
      <div className="inst-bar">
        <p aria-live="polite">
          <span className="key mine" />
          You
          {showModel && (
            <>
              <span className="key model" />
              Model
            </>
          )}
          <em>{verdict}</em>
        </p>
        <div className="inst-actions">
          {mine.length > 0 && (
            <button type="button" className="quiet" onClick={() => setMine([])}>
              Clear
            </button>
          )}
          <button type="button" className="ghost" aria-pressed={showModel} onClick={() => setShowModel((v) => !v)}>
            {showModel ? "Hide predicted path" : "Show predicted path"}
          </button>
          <button type="button" className="pill" onClick={onAnalyze}>
            Analyze your design
          </button>
        </div>
      </div>
    </section>
  );
}
