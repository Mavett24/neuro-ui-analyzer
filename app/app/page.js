"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useBrowserValue } from "../../lib/hooks";
import { analyzeFile } from "../../lib/heuristics";
import { computeWeights } from "../../lib/brain";
import BrainViewer from "../../components/BrainViewer";
import BrainCards from "../../components/BrainCards";
import ReviewCard from "../../components/ReviewCard";
import WireframeSkeleton from "../../components/WireframeSkeleton";
import GazePlayer from "../../components/GazePlayer";
import UploadHero from "../../components/UploadHero";
import PixelField from "../../components/PixelField";
import { getAnalysis, listAnalyses, patchAnalysis, saveAnalysis } from "../../lib/history";
import { AttentionViz, BalanceViz, ClutterViz, ColourViz, ContrastViz, WhitespaceViz } from "../../components/DiagViz";

const SECTIONS = [
  ["attention", "Attention"],
  ["layout", "Layout"],
  ["brain", "Brain"],
];
// Each analysis is saved to this browser's history (lib/history.js), keyed by a hash of the
// file's bytes, so uploading the same file again gives the same reading.
async function fileKey(file) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // no secure context: carry on without saving
  }
}
// Keeps the open analysis in the URL, so a refresh or a history link reopens it.
function setUrlId(id) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  window.history.replaceState(null, "", url);
}

const DEEP_KEYS = ["reading", "faces", "objects", "scenes", "reward", "decision"];

export default function Analyzer() {
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [features, setFeatures] = useState(null);
  const [heat, setHeat] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  useEffect(() => {
    const count = () => listAnalyses().then((l) => setHistoryCount(l.length));
    count();
    window.addEventListener("nua:history", count);
    return () => window.removeEventListener("nua:history", count);
  }, []);
  // /app?id=... reopens a saved analysis instantly, without running anything again.
  // While it loads, the upload screen stays hidden so it doesn't flash before the report.
  const urlId = useBrowserValue(() => new URLSearchParams(window.location.search).get("id"), null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    getAnalysis(id).then((record) => {
      if (!record) {
        setUrlId(null);
        setError("That analysis is no longer in this browser's history. Upload the design again.");
        return;
      }
      setPreview(URL.createObjectURL(record.image));
      setResult(record.result);
      setImageKey(record.id);
      setFeatures(record.features || null);
      setReview(record.review ? { ...record.review, saved: true } : null);
      setDeepStarted(Boolean(record.review || record.features));
    });
  }, []);
  // Always open at the top. Browsers restore the last scroll position on reload, and the results
  // page is much longer than the landing page, so the restored position landed at the bottom.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }, []);
  // Dev helper: /?src=/some-image.png analyzes a same-origin image without uploading.
  useEffect(() => {
    const src = new URLSearchParams(window.location.search).get("src");
    if (src && src.startsWith("/") && !src.startsWith("//"))
      fetch(src).then((r) => r.blob()).then((b) => handle(new File([b], "sample", { type: b.type })));
  }, []);
  const weights = useMemo(
    () => (result ? computeWeights(result.metrics, features) : null),
    [result, features]
  );
  // The four pixel-based functions always show. The six content-based ones join after the deep analysis.
  const baseWeights = useMemo(() => (weights || []).filter((w) => !w.pending && !DEEP_KEYS.includes(w.key)), [weights]);
  const deepWeights = useMemo(() => (weights || []).filter((w) => DEEP_KEYS.includes(w.key)), [weights]);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const [deepStarted, setDeepStarted] = useState(false);
  const [imageKey, setImageKey] = useState(null);
  // Where the reader is: progress through each results section, for the nav.
  const [spy, setSpy] = useState({ active: 0, parts: [0, 0, 0] });
  const tracking = Boolean(preview && (result || analyzing));
  useEffect(() => {
    if (!tracking) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const anchor = 64 + (window.innerHeight - 64) * 0.35;
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      let active = 0;
      const parts = SECTIONS.map(([id], i) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        if (r.top <= anchor) active = i;
        return atEnd ? 1 : Math.round(Math.max(0, Math.min(1, (anchor - r.top) / r.height)) * 100) / 100;
      });
      setSpy((prev) => (prev.active === active && prev.parts.every((v, i) => v === parts[i]) ? prev : { active, parts }));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    const grow = new ResizeObserver(queue);
    grow.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      grow.disconnect();
    };
  }, [tracking]);
  const goTo = (id) =>
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  const [featuresFailed, setFeaturesFailed] = useState(false);

  async function handle(file) {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, WebP).");
      return;
    }
    setError(null);
    setReview(null);
    setFeatures(null);
    setDeepStarted(false);
    setFeaturesFailed(false);
    setImageKey(null);
    setUrlId(null);
    window.scrollTo(0, 0);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setAnalyzing(true);
    try {
      const [analysis, key] = await Promise.all([analyzeFile(file), fileKey(file)]);
      setImageKey(key);
      setResult(analysis);
      if (key) {
        setUrlId(key);
        // Same image as a saved entry: bring back its deep analysis too.
        const saved = await getAnalysis(key);
        if (saved?.features) setFeatures(saved.features);
        if (saved?.review) {
          setReview({ ...saved.review, saved: true });
          setDeepStarted(true);
        }
        saveAnalysis(key, file, analysis);
      }
      if (new URLSearchParams(window.location.search).has("src")) {
        // Dev helper: exposes the analysis so test scripts can read it.
        window.__nuaMetrics = analysis.metrics;
        window.__nuaSample = { saliency: analysis.saliency, scanpath: analysis.scanpath, metrics: analysis.metrics };
      }
    } catch {
      setResult(null);
      setError("Could not read that image.");
    } finally {
      setAnalyzing(false);
    }
  }

  // fresh = true is the Regenerate button: a new written summary, same numbers.
  async function getReview(fresh = false) {
    const saved = (await getAnalysis(imageKey)) || {};
    setError(null);
    setDeepStarted(true);
    if (saved.features && !features) setFeatures(saved.features);
    if (saved.review && saved.features && fresh !== true) {
      setReview({ ...saved.review, saved: true });
      return;
    }
    setBusy(true);
    setReview(null);
    setElapsed(0);
    const started = performance.now();
    // Content detection runs alongside the summary and adds its functions to the brain when it returns.
    if (!features && !saved.features) {
      setFeaturesFailed(false);
      fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: result.imageBase64 }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j?.features) return setFeaturesFailed(true);
          setFeatures(j.features);
          patchAnalysis(imageKey, { features: j.features });
        })
        .catch(() => setFeaturesFailed(true));
    }
    const tick = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 1000);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: result.imageBase64, metrics: result.metrics }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Review failed.");
      }
      const meta = {
        model: res.headers.get("X-Model"),
        skipped: decodeURIComponent(res.headers.get("X-Skipped") || ""),
      };
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setReview({ ...meta, review: text });
      }
      if (!text.trim()) throw new Error("The model returned an empty answer. Try again.");
      const done = { ...meta, review: text, seconds: ((performance.now() - started) / 1000).toFixed(1) };
      setReview(done);
      patchAnalysis(imageKey, { review: done });
    } catch (e) {
      setReview(null);
      setError(e.message);
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  }

  const cta = result?.metrics.ctaCandidate;

  const dropProps = {
    onClick: () => input.current.click(),
    onDragOver: (e) => {
      e.preventDefault();
      setDrag(true);
    },
    onDragLeave: () => setDrag(false),
    onDrop: (e) => {
      e.preventDefault();
      setDrag(false);
      handle(e.dataTransfer.files[0]);
    },
  };
  const STATUS = { good: "OK", info: "Note", warn: "Issue" };
  const showResults = preview && (result || analyzing);
  const overall = Math.round((spy.parts.reduce((a, b) => a + b, 0) / SECTIONS.length) * 100);
  const unisal = result?.metrics.attention.method.startsWith("UNISAL");

  return (
    <>
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="mark" aria-hidden="true">
            {[0, 1, 0, 1, 1, 1, 0, 1, 0].map((on, i) => (
              <i key={i} className={on ? "on" : ""} />
            ))}
          </span>
          Neuro UI Analyzer
        </Link>
        {showResults && (
          <ol className="steps" aria-label="Sections of this analysis">
            {SECTIONS.map(([id, name], i) => (
              <li key={id}>
                <button
                  type="button"
                  className={i === spy.active ? "on" : spy.parts[i] >= 1 ? "done" : ""}
                  aria-current={i === spy.active ? "step" : undefined}
                  onClick={() => goTo(id)}
                >
                  <span className="num">0{i + 1}</span>
                  <span className="name">{name}</span>
                  <span className="track" aria-hidden="true">
                    <i style={{ transform: `scaleX(${spy.parts[i]})` }} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="nav-links">
          {showResults ? (
            <span className="pct" aria-label={`${overall}% of the analysis read`}>
              {String(overall).padStart(2, "0")}%
            </span>
          ) : (
            <span className="chip">Analysis runs in your browser</span>
          )}
          <a className="chip" href="/history">
            History{historyCount > 0 && <span className="count">{historyCount}</span>}
          </a>
        </div>
      </nav>

      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files[0])} />
      {!showResults && !(urlId && !error) && <UploadHero onFile={handle} onBrowse={() => input.current.click()} error={error} />}

      <main className={showResults ? "" : "after-upload"}>

        {showResults && (
          <header className="compact">
            <div>
              <p className="eyebrow">Analysis</p>
              <h1>
                {result
                  ? `${result.metrics.image.width} x ${result.metrics.image.height}px, ${result.metrics.image.format}`
                  : "Reading your design..."}
              </h1>
            </div>
            <button className="ghost" {...dropProps}>
              Analyze another design
            </button>
          </header>
        )}

        {showResults && error && !deepStarted && <p className="error">{error}</p>}

        {showResults && (
          <>
            <section className="section attn" id="attention">
              <p className="eyebrow">01 Attention</p>
              <h2>Where the eyes go first</h2>
              <p className="sub">Predicted gaze for the first seconds of free viewing.</p>
              <article className="attn-card" aria-busy={!result}>
                <div className="window-bar">
                  <i />
                  <i />
                  <i />
                  <span>attention.map</span>
                </div>
                <div className="attn-tools">
                  <div className="attn-meta">
                    <span className="heat-legend">
                      Low <i /> High
                    </span>
                    {result ? (
                      <>
                        <span className="chip">Peak: {result.metrics.attention.peakZone}</span>
                        <span className={`chip ${cta && !result.scanpath.ctaHit ? "warn" : ""}`}>
                          {!cta
                            ? "No CTA found"
                            : result.scanpath.ctaHit
                            ? `CTA seen at ${(result.scanpath.ctaHit.start / 1000).toFixed(1)}s`
                            : "CTA not seen in 3s"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="chip ghosted" />
                        <span className="chip ghosted" />
                      </>
                    )}
                  </div>
                  <button className="ghost" onClick={() => setHeat(!heat)} disabled={!result}>
                    {heat ? "Hide heatmap" : "Show heatmap"}
                  </button>
                </div>
                {result ? (
                  <GazePlayer preview={preview} saliency={result.saliency} path={result.scanpath} heat={heat} cta={cta} />
                ) : (
                  <div className="attn-stage">
                    <div className="shot loading">
                      <img src={preview} alt="Uploaded design" />
                      <WireframeSkeleton src={preview} />
                    </div>
                  </div>
                )}
                <div className="review-foot" aria-live="polite">
                  <span className={result ? "" : "live"}>{result ? "complete" : "predicting gaze"}</span>
                  {result ? (
                    <>
                      <span>{unisal ? "UNISAL gaze model" : "contrast fallback"}</span>
                      <span>{result.scanpath.fixations.length} predicted fixations in 3s</span>
                      <span>peak {result.metrics.attention.peakZone}</span>
                      <span>
                        {cta
                          ? `${result.metrics.attention.ctaAttentionPctOfPeak}% of peak attention on the CTA`
                          : "no CTA found"}
                      </span>
                    </>
                  ) : (
                    <span>the first run loads a 13 MB model</span>
                  )}
                </div>
              </article>
              {result && (
                <p className="hint">
                  {unisal
                    ? "Predicted by UNISAL, a model trained on human eye-tracking data (natural images and video, not UIs). It cannot see motion, so animated elements are likely underrated."
                    : "Contrast-based fallback, because the gaze model could not load. It is not trained on eye-tracking data."}
                  {" The numbered path is a predicted order of fixations derived from that map (winner-take-all with inhibition of return, Itti, Koch & Niebur, 1998), not a recording."}
                  {cta
                    ? " The outline marks the detected primary button, with the detection confidence."
                    : " No filled button was detected with enough confidence, so none is outlined."}
                </p>
              )}
            </section>

            <section className="section" id="layout">
              <p className="eyebrow">02 Layout</p>
              <h2>Layout diagnostics</h2>
              <p className="sub">Measured from the pixels of your design. Each card shows the data behind the number.</p>
              <div className="diag-grid">
                {!result &&
                  Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="diag skeleton" aria-hidden="true">
                      <i className="sk w40" />
                      <i className="sk w25 tall" />
                      <i className="sk block" />
                      <i className="sk w90" />
                    </div>
                  ))}
                {result?.findings.map((f) => {
                  const m = result.metrics;
                  const v = result.viz;
                  const card = f.label.startsWith("White")
                    ? { big: `${m.whitespacePct}%`, unit: "empty", viz: <WhitespaceViz grid={v.whitespace} /> }
                    : f.label.startsWith("Visual clutter")
                    ? { big: m.clutterScore, unit: "of 100, higher is busier", viz: <ClutterViz grid={v.edges} /> }
                    : f.label.startsWith("Colour")
                    ? {
                        big: m.hueFamilies,
                        unit: `hue famil${m.hueFamilies === 1 ? "y" : "ies"}, plus ${m.neutralColours} neutral${m.neutralColours === 1 ? "" : "s"}`,
                        viz: <ColourViz colours={m.dominantColours} />,
                      }
                    : f.label.startsWith("Left")
                    ? { big: m.balance.leftRight.toFixed(2), unit: "balance, 1 = even", viz: <BalanceViz columns={v.columns} leftShare={v.leftShare} /> }
                    : f.label.startsWith("Primary CTA")
                    ? {
                        big: cta ? `${cta.contrastVsBackground}:1` : "none",
                        unit: cta ? `contrast, ${cta.zone}` : "",
                        viz: <ContrastViz cta={cta} background={cta?.surroundColour || m.backgroundColour} />,
                      }
                    : f.label.startsWith("Attention on CTA")
                    ? { big: `${m.attention.ctaAttentionPctOfPeak}%`, unit: "of peak attention", viz: <AttentionViz saliency={result.saliency} box={cta?.box} /> }
                    : { big: f.value, unit: "", viz: null };
                  return (
                    <article key={f.label} className="diag">
                      <div className="diag-head">
                        <span className="diag-label">{f.label}</span>
                        <span className={`chip ${f.status}`}>{STATUS[f.status]}</span>
                      </div>
                      <div className="diag-num">
                        {card.big}
                        <small>{card.unit}</small>
                      </div>
                      {card.viz && <div className="diag-viz">{card.viz}</div>}
                      <p>{f.note}</p>
                      {f.how && <p className="how">{f.how}</p>}
                    </article>
                  );
                })}
              </div>
              <p className="hint">Estimates from pixel analysis, not from user testing.</p>
            </section>

            <section className="section" id="brain">
              <p className="eyebrow">03 Brain</p>
              <h2>Regions likely engaged</h2>
              <p className="sub">
                An estimate, not a scan: real meta-analytic fMRI maps, weighted by what was measured in your design.
              </p>
              {!result ? (
                <div className="brain-grid" aria-hidden="true">
                  {[0, 1].map((i) => (
                    <div key={i} className="diag skeleton">
                      <i className="sk w40" />
                      <i className="sk w25 tall" />
                      <i className="sk w90" />
                      <i className="sk w60" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                <BrainViewer weights={weights} />

                <div className="brain-sub">
                  <h3>Measured from pixels</h3>
                  <span className="chip">{baseWeights.length} functions</span>
                </div>
                <BrainCards items={baseWeights} />

                {!deepStarted ? (
                  <div className="deep-cta">
                    <div>
                      <h3>Deep research analysis</h3>
                      <p>
                        Reads what is in the design to add six content-based functions to the brain above (reading,
                        faces, objects, scenes, reward, decision making), then writes a summary with suggested changes.
                      </p>
                      <p className="hint">
                        Sends a downscaled copy of the image to Google&apos;s Gemini API (free tier). Don&apos;t use it on
                        confidential designs: free tier requests may be used to improve Google products.
                      </p>
                    </div>
                    <button className="pill" onClick={() => getReview()}>
                      Generate deep research analysis
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="brain-sub">
                      <h3>Deep research analysis</h3>
                      <div className="attn-meta">
                        {features && <span className="chip">{deepWeights.length} functions added</span>}
                        <button className="ghost" onClick={() => getReview(true)} disabled={busy}>
                          {busy ? "Analyzing..." : "Regenerate"}
                        </button>
                      </div>
                    </div>
                    {features ? (
                      <BrainCards items={deepWeights} deep />
                    ) : featuresFailed ? (
                      <p className="error wide">
                        Content detection did not return, so the six content-based functions are missing. Regenerate to
                        try again.
                      </p>
                    ) : (
                      <div className="loading" aria-live="polite">
                        <PixelField mode="busy" cell={6} />
                        <p className="hint">Detecting text, faces, imagery and actions... {elapsed}s</p>
                      </div>
                    )}
                    {error && <p className="error wide">{error}</p>}
                    {(review || busy) && <ReviewCard review={review} busy={busy} elapsed={elapsed} />}
                  </>
                )}
                </>
              )}

              <p className="hint">
                The maps come from NeuroQuery (Dockes et al., 2020, eLife), built from about 13,000 published
                studies. The 3D brain is the ICBM152 cortical surface (the right hemisphere shape is a mirror of
                the left, the data on it is real right-hemisphere data). Deep structures such as the striatum only
                show in the MRI slices. Each card shows that function&apos;s own map from the side, and the engagement
                value is this tool&apos;s model of how strongly your design engages it, not a measurement.
              </p>
            </section>
          </>
        )}

        <footer className="foot">
          Estimates for design exploration, not measurements of real users. Gaze model: UNISAL (Droste et al.,
          2020, Apache 2.0). Brain maps: NeuroQuery (Dockes et al., 2020). Region names: AAL atlas
          (Tzourio-Mazoyer et al., 2002).
        </footer>
      </main>
    </>
  );
}
