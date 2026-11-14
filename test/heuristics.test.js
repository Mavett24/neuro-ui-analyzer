import { describe, expect, it } from "vitest";
import { analyzeImageData } from "../lib/heuristics";
import { detectCta } from "../lib/cta";
import { canvas, darkPageWithTwoButtons, landingPage, monochromePage } from "./fixtures";

const findCta = (page) => detectCta(page.data, page.w, page.h);
const analyze = (page) => analyzeImageData(page.data, page.w, page.h, undefined, findCta(page));

describe("layout heuristics", () => {
  it("gives the same reading for the same pixels", () => {
    // The product promise: re-uploading a design never changes its numbers.
    const a = analyze(landingPage());
    const b = analyze(landingPage());
    expect(b.metrics).toEqual(a.metrics);
    expect(b.findings).toEqual(a.findings);
  });

  it("reads a blank screen as all white space and no clutter", () => {
    const { metrics } = analyze(canvas(512, 320));
    expect(metrics.whitespacePct).toBe(100);
    expect(metrics.clutterScore).toBe(0);
    expect(metrics.ctaCandidate).toBeNull();
  });

  it("does not count grey gradients as colours", () => {
    // Regression: shades inside photos used to inflate the palette on monochrome screens.
    const { metrics } = analyze(monochromePage());
    expect(metrics.hueFamilies).toBe(0);
  });

  it("scores a busier layout as more cluttered", () => {
    const calm = analyze(landingPage()).metrics.clutterScore;
    const busy = landingPage();
    for (let y = 0; y < 300; y += 20) busy.text(8, y, 496, 1, 7);
    expect(analyze(busy).metrics.clutterScore).toBeGreaterThan(calm);
  });

  it("keeps every metric in its documented range", () => {
    const { metrics } = analyze(landingPage());
    expect(metrics.whitespacePct).toBeGreaterThanOrEqual(0);
    expect(metrics.whitespacePct).toBeLessThanOrEqual(100);
    expect(metrics.clutterScore).toBeGreaterThanOrEqual(0);
    expect(metrics.clutterScore).toBeLessThanOrEqual(100);
    expect(metrics.balance.leftRight).toBeGreaterThanOrEqual(0);
    expect(metrics.balance.leftRight).toBeLessThanOrEqual(1);
  });

  it("returns a status and an explanation for every finding", () => {
    const { findings } = analyze(landingPage());
    expect(findings.length).toBeGreaterThanOrEqual(5);
    for (const f of findings) {
      expect(["good", "info", "warn"]).toContain(f.status);
      expect(f.note).toBeTruthy();
    }
  });
});

describe("CTA detection", () => {
  it("finds a filled button with a label and places it correctly", () => {
    const cta = findCta(landingPage());
    expect(cta).not.toBeNull();
    expect(cta.rgb).toEqual([255, 90, 40]);
    // Drawn at x 24..134, y 200..234 on a 512 x 320 page.
    expect(cta.box.x).toBeCloseTo(24 / 512, 2);
    expect(cta.box.y).toBeCloseTo(200 / 320, 2);
  });

  it("answers 'no CTA' instead of guessing", () => {
    expect(findCta(canvas(512, 320))).toBeNull();
    expect(findCta(monochromePage())).toBeNull();
  });

  it("picks the accent-coloured hero button over a neutral nav button", () => {
    const cta = findCta(darkPageWithTwoButtons());
    expect(cta.rgb.map(Math.round)).toEqual([230, 80, 31]);
    expect(cta.box.y).toBeCloseTo(313 / 506, 2);
  });

  it("reads a thin antialiased label by its stroke cores", () => {
    const page = canvas(1024, 506, [8, 8, 10]);
    page.rect(236, 313, 106, 20, [230, 80, 31]);
    for (let x = 246; x < 330; x += 4) {
      page.rect(x, 319, 1, 8, [255, 255, 255]);
      page.rect(x + 1, 319, 1, 8, [242, 167, 143]);
    }
    // Averaging every label pixel scored this button 0.63; reading the stroke cores gives 0.86.
    expect(findCta(page).confidence).toBeGreaterThan(0.8);
  });

  it("still finds a neutral button when it is the only one", () => {
    const page = canvas(512, 320).text(24, 90, 240, 2, 16);
    page.rect(24, 200, 110, 34, [17, 17, 17]).text(40, 212, 70, 1, 9, [255, 255, 255]);
    const cta = findCta(page);
    expect(cta).not.toBeNull();
    expect(cta.rgb.map(Math.round)).toEqual([17, 17, 17]);
  });

  it("counts the CTA colour in the palette even when it covers little of the screen", () => {
    const { metrics } = analyze(darkPageWithTwoButtons());
    expect(metrics.hueFamilies).toBe(1);
  });

  it("ignores a coloured block that has no label", () => {
    const page = canvas(512, 320).rect(24, 200, 110, 34, [255, 90, 40]);
    expect(findCta(page)).toBeNull();
  });
});
