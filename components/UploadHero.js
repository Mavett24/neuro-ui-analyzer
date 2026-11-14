"use client";

import { useEffect, useState } from "react";
import ShaderBg from "./landing/ShaderBg";
import PixelField from "./PixelField";

// The app's start screen. One job: get a screenshot in. The whole screen is a drop target,
// pasting an image works too, and the sample page is one click away. The report replaces this
// screen as soon as a file arrives.

// 9 by 9 upload glyph: an arrow into a tray.
const GLYPH = [
  "....#....",
  "...###...",
  "..#####..",
  ".#.###.#.",
  "...###...",
  "...###...",
  "#.......#",
  "#.......#",
  "#########",
];

const STEPS = [
  ["01", "Attention heatmap", "about 2s"],
  ["02", "Layout check", "under 1s"],
  ["03", "Brain map", "under 1s"],
];

export default function UploadHero({ onFile, onBrowse, error }) {
  const [drag, setDrag] = useState(false);
  const [mac, setMac] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    // Paste a screenshot straight from the clipboard.
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        onFile(item.getAsFile());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile]);

  const trySample = async () => {
    setLoadingSample(true);
    try {
      const blob = await fetch("/demo/sample.jpg").then((r) => r.blob());
      onFile(new File([blob], "payloom-landing.jpg", { type: blob.type }));
    } catch {
      setLoadingSample(false);
    }
  };

  // dragleave fires when moving over children, so only clear when the pointer leaves the section.
  const dropProps = {
    onDragOver: (e) => {
      e.preventDefault();
      if (!drag) setDrag(true);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      setDrag(false);
      onFile(e.dataTransfer.files[0]);
    },
  };

  return (
    <section className={`up ${drag ? "drag" : ""}`} {...dropProps} aria-label="Upload a design to analyze">
      <ShaderBg focus={[0.5, 0.42]} />
      <div className="up-inner">
        <p className="up-badge">
          <i aria-hidden="true" />
          Analyzer
        </p>
        <h1>
          <span>Drop in a screen.</span>
          <span className="l2">Get the report.</span>
        </h1>
        <p className="up-lead">Predicted gaze, a layout check and the brain systems it engages, in a few seconds.</p>

        <button type="button" className="up-drop" onClick={onBrowse} aria-describedby="up-formats">
          {drag && <PixelField mode="busy" cell={8} className="up-scan" />}
          <span className="up-glyph" aria-hidden="true">
            {GLYPH.flatMap((row, y) => row.split("").map((c, x) => <i key={`${x}${y}`} className={c === "#" ? "on" : ""} />))}
          </span>
          <span className="up-title">
            {drag ? (
              "Release to analyze"
            ) : (
              <>
                <span className="fine">Drop a screenshot here</span>
                <span className="touch">Choose a screenshot</span>
              </>
            )}
          </span>
          <span className="up-sub fine">
            or <u>browse your files</u>
          </span>
          <span className="up-formats" id="up-formats">
            PNG, JPG or WebP · desktop or mobile
          </span>
        </button>

        <div className="up-alt">
          <button type="button" className="up-sample" onClick={trySample} disabled={loadingSample}>
            {loadingSample ? "Loading the sample…" : "Try it on a sample page"}
          </button>
          <span className="up-paste fine">
            or paste with <kbd>{mac ? "⌘" : "Ctrl"}</kbd>
            <kbd>V</kbd>
          </span>
        </div>

        {error && (
          <p className="error up-error" role="alert">
            {error}
          </p>
        )}

        <ol className="up-steps" aria-label="What you get">
          {STEPS.map(([n, name, t]) => (
            <li key={n}>
              <span className="n">{n}</span>
              <strong>{name}</strong>
              <em>{t}</em>
            </li>
          ))}
          <li className="opt">
            <span className="n">+</span>
            <strong>Deep research</strong>
            <em>on request</em>
          </li>
        </ol>
        <p className="up-note">Gaze, layout and brain run in your browser. Nothing leaves your device unless you ask for deep research.</p>
      </div>
    </section>
  );
}
