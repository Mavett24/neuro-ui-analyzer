"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../lib/hooks";
import { drawHeatmap } from "../../lib/saliency";
import { computeWeights } from "../../lib/brain";
import PixelBrain from "./PixelBrain";
import { useSample } from "./useSample";

// The user flow: a five-node diagram that advances on its own while it is on screen, and a
// window that plays a coded version of each step. Hover or focus pauses it, clicking a node
// jumps to it. With reduced motion nothing advances on its own.

const STEP_MS = 4600;

const STEPS = [
  {
    key: "upload",
    name: "Upload",
    time: "instant",
    where: "On your device",
    title: "Upload a screenshot",
    body: "Any screen, desktop or mobile. It stays on your machine.",
    out: ["PNG, JPG or WebP", "Same file, same reading"],
  },
  {
    key: "heat",
    name: "Heatmap",
    time: "about 2s",
    where: "On your device",
    title: "Get the attention heatmap",
    body: "Where people look in the first three seconds, from a model trained on real eye-tracking.",
    out: ["Fixation heatmap", "Numbered scanpath", "When the CTA gets seen"],
  },
  {
    key: "check",
    name: "Heuristics",
    time: "under 1s",
    where: "On your device",
    title: "Run the layout check",
    body: "Six measures read straight from the pixels, each with the data behind it.",
    out: ["Pass, note or issue", "WCAG button contrast"],
  },
  {
    key: "brain",
    name: "Brain areas",
    time: "under 1s",
    where: "On your device",
    title: "See which brain systems it engages",
    body: "Real fMRI maps, weighted by what your design measured.",
    out: ["3D surface and MRI slices", "Every region named"],
  },
  {
    key: "deep",
    name: "Deep research",
    time: "about 10s",
    where: "Opt-in, cloud",
    title: "Generate the deep research analysis",
    body: "On request, a vision model reads the content and explains each issue.",
    out: ["Six more brain functions", "Issues with the principle behind them"],
  },
];

export default function FlowDemo() {
  const [active, setActive] = useState(0);
  const [run, setRun] = useState(0); // bumps on every activation, restarts the step's visual
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const root = useRef(null);
  const sample = useSample();

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(root.current);
    return () => io.disconnect();
  }, []);

  const go = (i) => {
    setActive(i);
    setRun((r) => r + 1);
  };
  const playing = inView && !paused && !reduce;
  const step = STEPS[active];

  return (
    <div
      ref={root}
      className="flow"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setPaused(false)}
    >
      <ol className="flow-rail" aria-label="Steps of an analysis">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i === active ? "on" : i < active ? "done" : ""}>
            <button type="button" onClick={() => go(i)} aria-current={i === active ? "step" : undefined}>
              <span className="node" aria-hidden="true">
                <b>{String(i + 1).padStart(2, "0")}</b>
              </span>
              <span className="label">
                <strong>{s.name}</strong>
                <em>{s.time}</em>
              </span>
              <span className="track" aria-hidden="true">
                <i
                  key={`${i}-${run}`}
                  className={i === active ? "running" : ""}
                  style={{
                    animationDuration: `${STEP_MS}ms`,
                    animationPlayState: playing && i === active ? "running" : "paused",
                  }}
                  onAnimationEnd={() => i === active && go((active + 1) % STEPS.length)}
                />
              </span>
            </button>
            {i < STEPS.length - 1 && <span className="wire" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="flow-stage">
        <div className="flow-copy" key={`c${active}-${run}`}>
          <p className="flow-meta">
            <span>Step {String(active + 1).padStart(2, "0")}</span>
            <span className={step.where.startsWith("Opt") ? "opt" : ""}>{step.where}</span>
          </p>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
          <ul>
            {step.out.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
        <div className="flow-window">
          <div className="window-bar">
            <i />
            <i />
            <i />
            <span>{["upload", "attention.map", "layout.check", "brain.map", "deep-research.md"][active]}</span>
          </div>
          <div className="flow-viz" key={`v${active}-${run}`}>
            {step.key === "upload" && <UploadViz />}
            {step.key === "heat" && <HeatViz sample={sample} />}
            {step.key === "check" && <CheckViz sample={sample} />}
            {step.key === "brain" && <BrainViz />}
            {step.key === "deep" && <DeepViz />}
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadViz() {
  return (
    <div className="v-upload">
      <div className="drop-zone">
        <div className="file">
          <img src="/demo/sample.jpg" alt="" />
        </div>
        <p>Drop a screenshot</p>
      </div>
      <div className="upload-read">
        <div className="bar">
          <i />
        </div>
        <ul>
          <li>
            <span>file</span>payloom-landing.png
          </li>
          <li>
            <span>size</span>1440 × 720 px
          </li>
          <li>
            <span>format</span>desktop, wide
          </li>
          <li>
            <span>hash</span>sha-256 a91f…e07c
          </li>
        </ul>
      </div>
    </div>
  );
}

function HeatViz({ sample }) {
  const heat = useRef(null);
  useEffect(() => {
    if (sample && heat.current) drawHeatmap(heat.current, sample.saliency);
  }, [sample]);
  const fx = sample ? sample.fixations.slice(0, 7) : [];
  const H = sample ? (1000 * sample.h) / sample.w : 500;
  const cta = sample?.stats.cta.box;
  return (
    <div className="v-heat">
      <div className="shot-frame">
        <img src="/demo/sample.jpg" alt="Sample landing page with predicted attention" />
        <canvas ref={heat} className="v-heatmap" />
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {fx.slice(1).map((f, k) => (
            <line
              key={k}
              x1={fx[k].x * 1000}
              y1={fx[k].y * H}
              x2={f.x * 1000}
              y2={f.y * H}
              pathLength="1"
              style={{ animationDelay: `${900 + k * 320}ms` }}
            />
          ))}
        </svg>
        {fx.map((f, i) => (
          <span
            key={i}
            className={`v-fx ${f.type === "cta" ? "hit" : ""}`}
            style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, animationDelay: `${760 + i * 320}ms` }}
          >
            {i + 1}
          </span>
        ))}
        {cta && (
          <span
            className="v-cta"
            style={{
              left: `${cta.x * 100}%`,
              top: `${cta.y * 100}%`,
              width: `${cta.w * 100}%`,
              height: `${cta.h * 100}%`,
            }}
          >
            <b>CTA seen at {(sample.ctaHit.start / 1000).toFixed(1)}s</b>
          </span>
        )}
      </div>
      <div className="v-foot">
        <span className="heat-legend">
          Low <i /> High
        </span>
        <span>UNISAL gaze model</span>
        <span>{sample ? sample.fixations.length : "…"} fixations in 3s</span>
      </div>
    </div>
  );
}

function useCount(to, ms = 900, delay = 0, decimals = 0) {
  const [v, setV] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (to == null || reduce) return;
    let frame;
    const t0 = performance.now() + delay;
    const tick = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      const e = 1 - Math.pow(1 - k, 3);
      setV(+(to * e).toFixed(decimals));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, ms, delay, decimals, reduce]);
  return reduce && to != null ? to : v;
}

function CheckRow({ label, to, decimals = 0, unit, status, fill, i }) {
  const v = useCount(to, 900, 200 + i * 110, decimals);
  const cells = 20;
  const lit = Math.round(fill * cells);
  return (
    <li style={{ animationDelay: `${i * 70}ms` }}>
      <span className="c-label">{label}</span>
      <span className="c-val">
        {decimals ? v.toFixed(decimals) : v}
        <small>{unit}</small>
      </span>
      <span className="c-meter" aria-hidden="true">
        {Array.from({ length: cells }, (_, k) => (
          <i key={k} className={k < lit ? "on" : ""} style={{ transitionDelay: `${300 + i * 110 + k * 22}ms` }} />
        ))}
      </span>
      <span className={`chip ${status}`}>{status === "good" ? "OK" : status === "warn" ? "Issue" : "Note"}</span>
    </li>
  );
}

function CheckViz({ sample }) {
  const s = sample?.stats;
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setLit(true));
    return () => cancelAnimationFrame(t);
  }, []);
  if (!s) return <div className="v-check" />;
  const rows = [
    { label: "White space", to: Math.round(s.whitespace), unit: "% empty", status: "good", fill: s.whitespace / 100 },
    { label: "Visual clutter", to: s.clutter, unit: "of 100", status: "info", fill: s.clutter / 100 },
    {
      label: "Colour palette",
      to: s.hues,
      unit: `hue family, ${s.neutrals} neutral`,
      status: "good",
      fill: s.hues / 6,
    },
    {
      label: "Primary CTA contrast",
      to: s.cta.contrast,
      decimals: 2,
      unit: ": 1, needs 3",
      status: "good",
      fill: s.cta.contrast / 7,
    },
    {
      label: "Attention on CTA",
      to: Math.round(sample.ctaHit.value * 100),
      unit: "% of peak",
      status: "info",
      fill: sample.ctaHit.value,
    },
  ];
  const ok = rows.filter((r) => r.status === "good").length;
  return (
    <div className={`v-check ${lit ? "lit" : ""}`}>
      <div className="c-score">
        <div>
          <span className="c-big">
            {ok}
            <small>/{rows.length}</small>
          </span>
          <span className="c-cap">measures pass</span>
        </div>
        <p>
          {rows.length - ok} notes, 0 issues. Clutter is moderate and the button gets about a quarter of the peak
          attention.
        </p>
      </div>
      <ol>
        {rows.map((r, i) => (
          <CheckRow key={r.label} {...r} i={i} />
        ))}
      </ol>
    </div>
  );
}

// Example weights for the sample page, from the same function the analyzer uses.
const SAMPLE_WEIGHTS = computeWeights({
  clutterEdgeDensityPct: 7,
  rmsContrast: 0.21,
  hueFamilies: 1,
  chromaticAreaPct: 14,
  whitespacePct: 66,
  balance: { leftRight: 0.71 },
}).filter((w) => !w.pending);

function BrainViz() {
  const [term, setTerm] = useState(SAMPLE_WEIGHTS[0].key);
  return (
    <div className="v-brain">
      <PixelBrain cell={5} className="small" terms={SAMPLE_WEIGHTS.map((w) => w.key)} onTerm={setTerm} />
      <ol>
        {SAMPLE_WEIGHTS.map((w, i) => (
          <li key={w.key} className={w.key === term ? "on" : ""} style={{ animationDelay: `${200 + i * 90}ms` }}>
            <div className="b-head">
              <strong>{w.label}</strong>
              <span>{w.weight.toFixed(2)}</span>
            </div>
            <span className="b-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${w.weight})`, transitionDelay: `${360 + i * 90}ms` }} />
            </span>
            <em>{w.regions}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

const REVIEW = [
  [
    "verdict",
    "The headline wins the first fixation, but **the primary button is only reached at 1.7s**, after three stops in the hero copy.",
  ],
  [
    "issue",
    "**Hero CTA** sits below the reading line and shares its tone with the secondary link, so visual hierarchy does not single it out.",
  ],
  [
    "issue",
    "**Logo strip** competes with the subhead for the second fixation. Gestalt proximity groups it with the hero.",
  ],
  ["change", "**Raise the button** into the first screen third and give it the only filled accent on the page."],
];
const DEEP = [
  ["Reading", 0.62],
  ["Faces", 0],
  ["Objects", 0.31],
  ["Scenes", 0.08],
  ["Reward and value", 0.33],
  ["Decision making", 0.5],
];

// Where each review line starts in the typed-out text (lines are joined with a newline).
const REVIEW_START = REVIEW.reduce(
  (acc, [, text], r) => [...acc, r ? acc[r - 1] + REVIEW[r - 1][1].replace(/\*\*/g, "").length + 1 : 0],
  []
);

function DeepViz() {
  const full = REVIEW.map(([, t]) => t.replace(/\*\*/g, "")).join("\n");
  const [typed, setN] = useState(0);
  const reduce = useReducedMotion();
  const n = reduce ? full.length : typed;
  useEffect(() => {
    if (reduce) return;
    const start = performance.now() + 500;
    let frame;
    const tick = (now) => {
      const k = Math.max(0, Math.floor((now - start) / 9));
      setN(Math.min(full.length, k));
      if (k < full.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [full.length, reduce]);

  // Reveal the review character by character while keeping its bold labels.
  return (
    <div className="v-deep">
      <ul className="d-chips">
        {DEEP.map(([name, w], i) => (
          <li key={name} className={w === 0 ? "none" : ""} style={{ animationDelay: `${i * 80}ms` }}>
            <span>{name}</span>
            <b>{w.toFixed(2)}</b>
          </li>
        ))}
      </ul>
      <div className="d-review">
        {REVIEW.map(([kind, text], r) => {
          const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
          const plainLen = text.replace(/\*\*/g, "").length;
          const show = Math.max(0, n - REVIEW_START[r]);
          if (show <= 0) return null;
          let budget = show;
          const done = show >= plainLen;
          return (
            <p key={r} className={`d-${kind}`}>
              {kind !== "verdict" && <span className="d-tag">{kind === "issue" ? "Issue" : "Change"}</span>}
              {parts.map((p, k) => {
                if (budget <= 0) return null;
                const bold = p.startsWith("**");
                const raw = bold ? p.slice(2, -2) : p;
                const cut = raw.slice(0, budget);
                budget -= raw.length;
                return bold ? <strong key={k}>{cut}</strong> : <span key={k}>{cut}</span>;
              })}
              {!done && <i className="caret" />}
            </p>
          );
        })}
      </div>
      <p className="v-note">
        Example output on the sample page. Principles named: visual hierarchy, Gestalt proximity.
      </p>
    </div>
  );
}
