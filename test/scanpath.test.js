import { describe, expect, it } from "vitest";
import { computeScanpath } from "../lib/scanpath";
import { saliency } from "./fixtures";

const map = () =>
  saliency(64, 40, [
    [0.2, 0.3, 1],
    [0.7, 0.6, 0.8],
    [0.5, 0.8, 0.5],
  ]);

describe("predicted scanpath", () => {
  it("lands the first fixation on the most salient spot", () => {
    const [first] = computeScanpath(map()).fixations;
    expect(first.x).toBeCloseTo(0.2, 1);
    expect(first.y).toBeCloseTo(0.3, 1);
  });

  it("moves on after each fixation (inhibition of return)", () => {
    const { fixations } = computeScanpath(map());
    for (let i = 1; i < fixations.length; i++) {
      const a = fixations[i - 1],
        b = fixations[i];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.01);
    }
  });

  it("visits the strong targets in order of salience", () => {
    const [a, b, c] = computeScanpath(map()).fixations;
    expect([a, b, c].map((f) => Math.round(f.y * 10) / 10)).toEqual([0.3, 0.6, 0.8]);
  });

  it("stays inside the three second window with ordered, non-overlapping fixations", () => {
    const { fixations, duration } = computeScanpath(map());
    expect(duration).toBeLessThanOrEqual(3000);
    for (let i = 1; i < fixations.length; i++) expect(fixations[i].start).toBeGreaterThanOrEqual(fixations[i - 1].end);
  });

  it("flags when and where the CTA is first seen", () => {
    const cta = { box: { x: 0.65, y: 0.55, w: 0.1, h: 0.1 } };
    const { ctaHit } = computeScanpath(map(), { cta });
    expect(ctaHit).not.toBeNull();
    expect(ctaHit.i).toBe(1);
  });

  it("is deterministic and handles an empty map", () => {
    expect(computeScanpath(map())).toEqual(computeScanpath(map()));
    expect(computeScanpath({ w: 8, h: 8, map: new Float32Array(64) })).toEqual({
      fixations: [],
      duration: 0,
      ctaHit: null,
    });
  });
});
