"use client";

// Standalone demo of the brain viewer with sample weights: http://localhost:3000/brain
import { useEffect, useState } from "react";
import BrainViewer from "../../components/BrainViewer";
import { computeWeights } from "../../lib/brain";

const sampleMetrics = {
  clutterEdgeDensityPct: 7,
  rmsContrast: 0.2,
  distinctColours: 8,
  hueFamilies: 3,
  chromaticAreaPct: 30,
  whitespacePct: 55,
  balance: { leftRight: 0.7 },
};
const sampleFeatures = { textAmount: 0.6, faces: 1, objectImagery: 0.3, sceneImagery: 0, rewardCues: 1, choices: 4 };
const weights = computeWeights(sampleMetrics, sampleFeatures);

export default function BrainDemo() {
  const [view, setView] = useState(null);
  useEffect(() => setView(new URLSearchParams(window.location.search).get("view") || "surface"), []);
  if (!view) return null;
  return (
    <main>
      <header className="compact">
        <div>
          <p className="eyebrow">Demo, sample weights</p>
          <h1>Brain viewer</h1>
        </div>
        <a className="chip" href="/app">Back to the analyzer</a>
      </header>
      <BrainViewer weights={weights} initialView={view} />
    </main>
  );
}
