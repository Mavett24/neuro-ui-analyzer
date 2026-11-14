import { describe, expect, it } from "vitest";
import { TERMS, computeWeights } from "../lib/brain";
import { analyzeImageData } from "../lib/heuristics";
import { landingPage } from "./fixtures";

const metrics = () => {
  const p = landingPage();
  return analyzeImageData(p.data, p.w, p.h).metrics;
};
const features = { textAmount: 0.6, faces: 1, objectImagery: 0.3, sceneImagery: 0, rewardCues: 1, choices: 4 };
const CONTENT = ["reading", "faces", "objects", "scenes", "reward", "decision"];

describe("brain weighting", () => {
  it("covers every function with a weight between 0 and 1 and a written reason", () => {
    const weights = computeWeights(metrics(), features);
    expect(weights.map((w) => w.key).sort()).toEqual(Object.keys(TERMS).sort());
    for (const w of weights) {
      expect(w.weight).toBeGreaterThanOrEqual(0);
      expect(w.weight).toBeLessThanOrEqual(1);
      expect(w.reason.length).toBeGreaterThan(20);
    }
  });

  it("leaves content-based functions pending until the deep analysis runs", () => {
    const weights = computeWeights(metrics());
    for (const w of weights) expect(w.pending).toBe(CONTENT.includes(w.key));
  });

  it("only changes content-based functions when content is detected", () => {
    const before = Object.fromEntries(computeWeights(metrics()).map((w) => [w.key, w.weight]));
    const after = Object.fromEntries(computeWeights(metrics(), features).map((w) => [w.key, w.weight]));
    for (const key of Object.keys(TERMS)) if (!CONTENT.includes(key)) expect(after[key]).toBe(before[key]);
    expect(after.faces).toBeGreaterThan(0);
    expect(after.reading).toBeGreaterThan(0);
  });

  it("raises face perception with faces on screen", () => {
    const none = computeWeights(metrics(), { ...features, faces: 0 }).find((w) => w.key === "faces");
    const some = computeWeights(metrics(), { ...features, faces: 2 }).find((w) => w.key === "faces");
    expect(some.weight).toBeGreaterThan(none.weight);
  });
});
