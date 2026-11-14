"use client";

import { useState } from "react";
import PixelBrain, { BRAIN_CYCLE } from "./PixelBrain";
import ShaderBg from "./ShaderBg";

const level = (a) => (a > 0.55 ? "strong" : a > 0.15 ? "moderate" : "low");

export default function Hero() {
  const [term, setTerm] = useState(BRAIN_CYCLE[0].key);
  const [region, setRegion] = useState(null);
  const i = Math.max(
    0,
    BRAIN_CYCLE.findIndex((t) => t.key === term)
  );
  const t = BRAIN_CYCLE[i];

  return (
    <header className="lp-hero">
      <ShaderBg />
      <div className="lp-hero-inner">
        <div className="lp-hero-copy">
          <p className="lp-badge">
            <i aria-hidden="true" />
            Private beta
          </p>
          <h1>
            <span className="l1">Know what the brain</span>
            <span className="l2">sees first.</span>
          </h1>
          <p className="lp-lead">
            Predict where attention lands, check your layout against perception research, and see which brain systems
            your design engages. Before you spend a user test on it.
          </p>
          <div className="lp-actions">
            <a className="pill lp-press" href="#waitlist">
              Get early access
            </a>
            <a className="lp-ghost lp-press" href="/app">
              Try the beta
            </a>
          </div>
          <dl className="lp-facts">
            <div>
              <dt>Gaze model</dt>
              <dd>Trained on eye-tracking</dd>
            </div>
            <div>
              <dt>Brain maps</dt>
              <dd>~13,000 fMRI studies</dd>
            </div>
            <div>
              <dt>Privacy</dt>
              <dd>Runs in your browser</dd>
            </div>
          </dl>
        </div>

        <figure className={`lp-hero-visual ${region ? "inspecting" : ""}`}>
          <PixelBrain cell={7} onTerm={setTerm} onRegion={setRegion} interactive />
          {region && (
            <div className="region-tip" style={{ left: region.x, top: region.y }} aria-live="polite">
              <span className="side">{region.side} hemisphere</span>
              <strong>{region.name}</strong>
              <p>{region.about}</p>
              <span className={`lvl ${level(region.act)}`}>
                <i />
                {level(region.act)} in {t.label.toLowerCase()}
              </span>
            </div>
          )}
          <figcaption>
            <span className="mono">
              map {String(i + 1).padStart(2, "0")}/{String(BRAIN_CYCLE.length).padStart(2, "0")}
              <em>
                {region ? (
                  "held while you look"
                ) : (
                  <>
                    <span className="for-pointer">hover to inspect</span>
                    <span className="for-touch">tap to inspect</span>
                  </>
                )}
              </em>
            </span>
            <span className="term" key={t.key}>
              <strong>{t.label}</strong>
              <em>{t.regions}</em>
            </span>
          </figcaption>
        </figure>
      </div>
    </header>
  );
}
