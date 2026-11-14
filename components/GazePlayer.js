"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawHeatmap } from "../lib/saliency";
import { revealMask, traceAt, TRACE_ROWS, TYPE_LABEL } from "../lib/scanpath";

// Playback of the predicted first 3 seconds: numbered fixations and the jumps between them
// appear over the design, the gaze map builds up where the eyes have been, and a trace shows
// which functions each moment is likely to recruit. Plays once when it scrolls into view.
const WINDOW = 3000;
const BIN = 100;
const RAMP = [[140, 0, 5], [242, 26, 5], [255, 133, 10], [255, 224, 64], [255, 250, 209]];
const ramp = (t) => {
  const p = Math.max(0, Math.min(0.9999, t)) * (RAMP.length - 1);
  const i = Math.floor(p), f = p - i;
  return `rgb(${RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f)).join(",")})`;
};
const secs = (ms) => (ms / 1000).toFixed(2) + "s";

export default function GazePlayer({ preview, saliency, path, heat, cta }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [started, setStarted] = useState(false);
  const stage = useRef(null);
  const canvas = useRef(null);
  const mask = useRef(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const end = WINDOW;

  // Reset and wait for the viewport whenever a new design comes in.
  useEffect(() => {
    setPlaying(false);
    setStarted(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(end);
      setStarted(true);
      return;
    }
    setT(0);
    const seen = new IntersectionObserver(
      (e) => {
        if (!e[0].isIntersecting) return;
        seen.disconnect();
        setStarted(true);
        setPlaying(true);
      },
      { threshold: 0.5 }
    );
    seen.observe(stage.current);
    return () => seen.disconnect();
  }, [path, end]);

  // Clock. Each frame advances by at most 50ms of real time, so a frame stalled by the page
  // (the brain viewer loading, for example) slows playback down instead of skipping ahead.
  const clock = useRef(0);
  clock.current = t;
  useEffect(() => {
    if (!playing) return;
    let frame, last = performance.now();
    const tick = (now) => {
      const dt = Math.min(50, now - last);
      last = now;
      const next = Math.min(end, clock.current + dt * speedRef.current);
      clock.current = next;
      setT(next);
      if (next >= end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, end]);

  // Gaze map: only where the eyes have been, complete at the end.
  useEffect(() => {
    if (!heat || !canvas.current) return;
    if (t >= end) drawHeatmap(canvas.current, saliency);
    else drawHeatmap(canvas.current, saliency, (mask.current = revealMask(saliency, path, t, mask.current)));
  }, [t, heat, saliency, path, end]);

  // Trace raster: function x 100ms bins, sampled four times per bin.
  const trace = useMemo(() => {
    const bins = WINDOW / BIN;
    return TRACE_ROWS.map(([key]) =>
      Array.from({ length: bins }, (_, b) => {
        let v = 0;
        for (let k = 0; k < 4; k++) v += traceAt(path, b * BIN + (k + 0.5) * (BIN / 4))[key];
        return v / 4;
      })
    );
  }, [path]);

  const fx = path.fixations;
  const current = fx.find((f) => t >= f.start - f.saccade && t < f.end);
  const shown = fx.filter((f) => t >= f.start || t >= end);
  const aspect = saliency.h / saliency.w;
  const H = 1000 * aspect;
  const seek = (ms) => {
    setPlaying(false);
    setStarted(true);
    setT(Math.max(0, Math.min(end, ms)));
  };
  const toggle = () => {
    setStarted(true);
    if (playing) return setPlaying(false);
    if (t >= end) setT(0);
    setPlaying(true);
  };
  const nowBin = Math.min(WINDOW / BIN - 1, Math.floor(t / BIN));

  // The jump in progress, drawn as a growing line.
  let jump = null;
  if (current && t < current.start && current.i > 0) {
    const a = fx[current.i - 1];
    const k = (t - (current.start - current.saccade)) / current.saccade;
    jump = { x1: a.x * 1000, y1: a.y * H, x2: (a.x + (current.x - a.x) * k) * 1000, y2: (a.y + (current.y - a.y) * k) * H };
  }

  return (
    <>
      <div className="attn-stage" ref={stage}>
        <div className="shot ready gaze">
          <img src={preview} alt="Uploaded design" />
          {heat && <canvas ref={canvas} className="heat" />}
          <svg className="gaze-lines" viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {shown.slice(1).map((f) => {
              const a = fx[f.i - 1];
              return (
                <g key={f.i}>
                  <line x1={a.x * 1000} y1={a.y * H} x2={f.x * 1000} y2={f.y * H} className="under" />
                  <line x1={a.x * 1000} y1={a.y * H} x2={f.x * 1000} y2={f.y * H} />
                </g>
              );
            })}
            {jump && (
              <g>
                <line {...jump} className="under" />
                <line {...jump} className="live" />
              </g>
            )}
          </svg>
          {shown.map((f) => {
            const now = current === f && t >= f.start && t < end;
            const size = 22 + Math.round((22 * (f.dur - 190)) / 210);
            return (
              <button
                key={f.i}
                type="button"
                className={`fix ${now ? "now" : ""} ${f.type === "cta" ? "on-cta" : ""}`}
                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: size, height: size }}
                onClick={() => seek(f.start)}
                aria-label={`Fixation ${f.i + 1}: ${TYPE_LABEL[f.type]}, ${f.zone}, at ${secs(f.start)}`}
              >
                {f.i + 1}
                {now && <i style={{ transform: `scale(${1 + Math.min(1, (t - f.start) / f.dur) * 0.9})` }} />}
              </button>
            );
          })}
          {cta && (
            <span
              className="cta-box"
              style={{ left: `${cta.box.x * 100}%`, top: `${cta.box.y * 100}%`, width: `${cta.box.w * 100}%`, height: `${cta.box.h * 100}%` }}
            >
              <b>CTA {cta.confidencePct}%</b>
            </span>
          )}
          {!started && <span className="gaze-wait">Scroll here to play the first 3 seconds</span>}
        </div>
      </div>

      <div className="player">
        <button type="button" className="play" onClick={toggle} aria-label={playing ? "Pause" : t >= end ? "Replay" : "Play"}>
          <b className={playing ? "pause" : t >= end ? "replay" : "start"} aria-hidden="true" />
          {playing ? "Pause" : t >= end ? "Replay" : "Play"}
        </button>
        <div className="scrub">
          <div className="lanes" aria-hidden="true">
            {fx.map((f) => (
              <span
                key={f.i}
                className={`${f.type} ${current === f ? "now" : ""} ${t >= f.start ? "past" : ""}`}
                style={{ left: `${(f.start / WINDOW) * 100}%`, width: `${(f.dur / WINDOW) * 100}%` }}
              >
                {f.dur > 230 ? f.i + 1 : ""}
              </span>
            ))}
            <i className="head" style={{ left: `${(t / WINDOW) * 100}%` }} />
          </div>
          <input
            type="range"
            min="0"
            max={end}
            step="10"
            value={Math.round(t)}
            onChange={(e) => seek(+e.target.value)}
            aria-label="Playback position"
          />
        </div>
        <span className="clock">
          {secs(t)} <em>/ {secs(WINDOW)}</em>
        </span>
        <div className="seg small" role="group" aria-label="Playback speed">
          {[0.5, 1].map((s) => (
            <button key={s} type="button" className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="gaze-detail">
        <section className="seq">
          <h4>Fixation sequence</h4>
          <ol>
            {fx.map((f) => (
              <li key={f.i} className={`${current === f && t < end ? "now" : ""} ${t < f.start && t < end ? "later" : ""}`}>
                <button type="button" onClick={() => seek(f.start)}>
                  <span className="n">{String(f.i + 1).padStart(2, "0")}</span>
                  <span className="what">
                    <b>{TYPE_LABEL[f.type]}</b>
                    {f.zone}
                  </span>
                  <span className="when">
                    {secs(f.start)}
                    <em>{f.dur}ms</em>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className="trace">
          <h4>Functions recruited</h4>
          <div className="raster" style={{ "--bins": WINDOW / BIN }}>
            {TRACE_ROWS.map(([key, label], r) => (
              <div key={key} className="raster-row">
                <span>{label}</span>
                <div className="cells">
                  {trace[r].map((v, b) => (
                    <i
                      key={b}
                      className={b === nowBin && t < end && started ? "cur" : ""}
                      style={b * BIN < t && v > 0.05 ? { background: ramp(0.1 + 0.85 * v), opacity: 0.35 + 0.65 * v } : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="raster-axis">
              <span />
              <div>
                <em>0s</em>
                <em>1s</em>
                <em>2s</em>
                <em>3s</em>
              </div>
            </div>
          </div>
          <p className="how">
            Illustrative: what each fixation lands on, mapped to the functions in the brain section. During a jump,
            visual intake is suppressed while attention picks the next target.
          </p>
        </section>
      </div>
    </>
  );
}
