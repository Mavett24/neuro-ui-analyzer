"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearHistory, deleteAnalysis, listAnalyses } from "../../lib/history";

// Every design analyzed in this browser, newest first. Opening one restores the saved report
// instantly; nothing is recomputed and nothing is fetched.

// 9 by 9 glyph for the empty state: a stack of screens.
const GLYPH = [
  ".........",
  "..#####..",
  "..#...#..",
  "#####.#..",
  "#...#.#..",
  "#...###..",
  "#...#....",
  "#####....",
  ".........",
];

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
function ago(t) {
  const s = Math.round((t - Date.now()) / 1000);
  const steps = [
    [60, "second"],
    [3600, "minute", 60],
    [86400, "hour", 3600],
    [604800, "day", 86400],
    [Infinity, "week", 604800],
  ];
  if (Math.abs(s) < 45) return "just now";
  for (const [limit, unit, div = 1] of steps)
    if (Math.abs(s) < limit) return rtf ? rtf.format(Math.round(s / div), unit) : new Date(t).toLocaleDateString();
  return new Date(t).toLocaleDateString();
}
const stamp = (t) =>
  new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function ctaLine(s) {
  if (!s.hasCta) return "no CTA found";
  return s.ctaSeenMs != null ? `CTA seen at ${(s.ctaSeenMs / 1000).toFixed(1)}s` : "CTA not seen in 3s";
}

export default function History() {
  const [items, setItems] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let urls = {};
    const load = () =>
      listAnalyses().then((list) => {
        const next = {};
        list.forEach((it) => {
          next[it.id] = urls[it.id] || (it.thumb ? URL.createObjectURL(it.thumb) : null);
        });
        Object.keys(urls).forEach((id) => !next[id] && urls[id] && URL.revokeObjectURL(urls[id]));
        urls = next;
        setThumbs(next);
        setItems(list);
      });
    load();
    window.addEventListener("nua:history", load);
    return () => {
      window.removeEventListener("nua:history", load);
      Object.values(urls).forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, []);

  // A second click within a few seconds clears everything. No browser dialog.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const remove = (id) => {
    setItems((list) => list.filter((it) => it.id !== id));
    deleteAnalysis(id);
  };
  const clearAll = () => {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    setItems([]);
    clearHistory();
  };

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
        <div className="nav-links">
          <span className="chip">Stored in this browser only</span>
          <a className="chip" href="/app">
            Analyzer
          </a>
        </div>
      </nav>

      <main className="hist">
        <header className="compact">
          <div>
            <p className="eyebrow">History</p>
            <h1>Your analyses</h1>
          </div>
          <div className="hist-actions">
            {items?.length > 0 && (
              <button type="button" className={`ghost ${confirming ? "danger" : ""}`} onClick={clearAll}>
                {confirming ? "Click again to clear all" : "Clear history"}
              </button>
            )}
            <a className="pill" href="/app">
              New analysis
            </a>
          </div>
        </header>
        <p className="hist-sub">
          Saved on this device, never uploaded. The 30 most recent designs are kept; reopening one shows the exact same
          reading, including any deep research analysis.
        </p>

        {items === null ? (
          <div className="diag-grid" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="diag skeleton">
                <i className="sk w40" />
                <i className="sk block" />
                <i className="sk w60" />
                <i className="sk w90" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="hist-empty">
            <span className="up-glyph" aria-hidden="true">
              {GLYPH.flatMap((row, y) => row.split("").map((c, x) => <i key={`${x}${y}`} className={c === "#" ? "on" : ""} />))}
            </span>
            <h2>No analyses yet</h2>
            <p>Every design you analyze lands here, so you can reopen it or compare versions later.</p>
            <a className="pill" href="/app">
              Analyze a design
            </a>
          </div>
        ) : (
          <ul className="diag-grid hist-grid">
            {items.map((it) => {
              const s = it.summary || {};
              return (
                <li key={it.id} className="diag hist-card">
                  <div className="diag-head">
                    <time className="diag-label" dateTime={new Date(it.updatedAt).toISOString()} title={stamp(it.updatedAt)}>
                      {ago(it.updatedAt)}
                    </time>
                    {it.deep && <span className="chip info">Deep analysis</span>}
                  </div>
                  <div className="diag-viz hist-thumb">
                    {thumbs[it.id] ? <img src={thumbs[it.id]} alt="" /> : <span className="hint">no preview</span>}
                  </div>
                  <a className="hist-name" href={`/app?id=${it.id}`} title={it.name}>
                    {it.name}
                  </a>
                  <dl className="hist-meta">
                    <div>
                      <dt>Size</dt>
                      <dd>
                        {s.width} x {s.height}px{s.format ? `, ${s.format}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Layout</dt>
                      <dd>
                        clutter {s.clutter}, {s.whitespace}% empty
                      </dd>
                    </div>
                    <div>
                      <dt>Peak</dt>
                      <dd>{s.peakZone}</dd>
                    </div>
                    <div>
                      <dt>CTA</dt>
                      <dd>{ctaLine(s)}</dd>
                    </div>
                  </dl>
                  <button type="button" className="ghost hist-del" onClick={() => remove(it.id)} aria-label={`Delete ${it.name}`}>
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="foot">
          History uses your browser&apos;s local storage (IndexedDB). Clearing site data in your browser removes it too.
        </footer>
      </main>
    </>
  );
}
