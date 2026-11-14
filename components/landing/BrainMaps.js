"use client";

import { useState } from "react";
import PixelBrain from "./PixelBrain";
import { TERMS } from "../../lib/brain";

// Metric 03. All ten function maps on the pixel brain. It steps through them on its own; pointing
// at a function shows its map and holds it. The lens works here too.

const PIXEL = ["visual", "attention", "load", "colour"];
const CONTENT = ["reading", "faces", "objects", "scenes", "reward", "decision"];
const ALL = [...PIXEL, ...CONTENT];

export default function BrainMaps() {
  const [shown, setShown] = useState(ALL[0]);
  const [focus, setFocus] = useState(null);
  const current = focus || shown;
  const chip = (k) => (
    <li key={k}>
      <button
        type="button"
        className={k === current ? "on" : ""}
        aria-pressed={k === focus}
        onPointerEnter={() => setFocus(k)}
        onFocus={() => setFocus(k)}
        onClick={() => setFocus(k)}
      >
        {TERMS[k].label}
      </button>
    </li>
  );
  return (
    <div className="m-card px-card brain-maps" onPointerLeave={() => setFocus(null)}>
      <div className="window-bar">
        <i />
        <i />
        <i />
        <span>brain.map</span>
      </div>
      <div className="bm-stage">
        <PixelBrain cell={5} zoom={1.35} terms={ALL} focus={focus} onTerm={setShown} interactive />
      </div>
      <div className="bm-now" key={current}>
        <strong>{TERMS[current].label}</strong>
        <span>{TERMS[current].regions}</span>
      </div>
      <div className="bm-groups" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocus(null)}>
        <div>
          <h5>Measured from pixels</h5>
          <ul>{PIXEL.map(chip)}</ul>
        </div>
        <div>
          <h5>Read from content</h5>
          <ul>{CONTENT.map(chip)}</ul>
        </div>
      </div>
    </div>
  );
}
