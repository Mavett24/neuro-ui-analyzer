"use client";

import { useEffect, useRef } from "react";
import PixelField from "./PixelField";

// The written analysis as a terminal-window card: the verdict as a lead statement, then
// what works, issues and suggested changes as three marked columns. Falls back to plain
// paragraphs if the model does not follow the section format.

const inline = (s) =>
  s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
// List items get a bold lead-in for scanning. If the model did not bold one, a short "Label: rest"
// opening is used, otherwise the item is left as written.
const lead = (s) => {
  if (s.includes("**")) return inline(s);
  const m = s.match(/^([^:.,]{3,40}):\s+(.+)$/);
  return m ? [<strong key="l">{m[1]}</strong>, ": ", m[2]] : s;
};

const KINDS = [
  { id: "works", match: /work/i, title: "What works", mark: "+" },
  { id: "issues", match: /issue|problem/i, title: "Issues", mark: "!" },
  { id: "changes", match: /change|suggest|fix/i, title: "Suggested changes", mark: ">" },
];

function parse(text) {
  const sections = [];
  let cur = { title: "", lines: [] };
  text.split("\n").forEach((line) => {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith("#")) {
      cur = { title: t.replace(/^#+\s*/, ""), lines: [] };
      sections.push(cur);
    } else {
      if (!sections.length) sections.push(cur);
      cur.lines.push(t);
    }
  });
  const verdict = sections.find((s) => /verdict/i.test(s.title));
  const cols = KINDS.map((k) => ({ ...k, section: sections.find((s) => s !== verdict && k.match.test(s.title)) }));
  const used = new Set([verdict, ...cols.map((c) => c.section)]);
  return { verdict, cols, extra: sections.filter((s) => !used.has(s)) };
}

const items = (lines) => lines.map((l) => l.replace(/^([-*]|\d+[.)])\s+/, ""));

// Static dithered corner: lime pixels thinning out toward the text. Drawn once, never animated.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
function Dither() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const cell = 6,
      cols = 56,
      rows = 22;
    c.width = cols * cell;
    c.height = rows * cell;
    const ctx = c.getContext("2d");
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const v = Math.pow(x / cols, 1.6) * Math.pow(1 - y / rows, 1.2);
        if (v > BAYER[(x & 3) + ((y & 3) << 2)]) {
          ctx.fillStyle = `rgba(127, 238, 100, ${0.12 + 0.5 * v})`;
          ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }
      }
  }, []);
  return <canvas ref={ref} className="review-dither" aria-hidden="true" />;
}

export default function ReviewCard({ review, busy, elapsed }) {
  const text = review?.review || "";
  const { verdict, cols, extra } = parse(text);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const structured = verdict || cols.some((c) => c.section);
  const last = [...cols].reverse().find((c) => c.section);

  return (
    <article className="review">
      <div className="window-bar">
        <i />
        <i />
        <i />
        <span>deep-analysis.md</span>
      </div>
      <div className="review-body">
        <Dither />
        <p className="eyebrow">Summary</p>
        {!text ? (
          <div className="loading" aria-live="polite">
            <PixelField mode="busy" cell={6} />
            <p className="hint">Writing the summary... {elapsed}s</p>
          </div>
        ) : (
          <>
            {verdict ? (
              <p className="review-verdict">
                {inline(verdict.lines.join(" "))}
                {busy && !last && <span className="caret" />}
              </p>
            ) : (
              !structured && (
                <div className="md">
                  {items(extra.flatMap((s) => s.lines)).map((l, i) => (
                    <p key={i}>{inline(l)}</p>
                  ))}
                </div>
              )
            )}
            {cols.some((c) => c.section) && (
              <div className="review-cols">
                {cols.map(
                  (c) =>
                    c.section && (
                      <section key={c.id} className={`review-col ${c.id}`}>
                        <h4>
                          <b aria-hidden="true">{c.mark}</b>
                          {c.title}
                          <span>{String(c.section.lines.length).padStart(2, "0")}</span>
                        </h4>
                        <ol>
                          {items(c.section.lines).map((l, i) => (
                            <li key={i}>
                              <span className="n">{String(i + 1).padStart(2, "0")}</span>
                              <span>
                                {lead(l)}
                                {busy && c === last && i === c.section.lines.length - 1 && <span className="caret" />}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )
                )}
              </div>
            )}
            {structured &&
              extra.map((s, i) => (
                <div key={i} className="md">
                  {s.title && <h3>{s.title}</h3>}
                  {items(s.lines).map((l, j) => (
                    <p key={j}>{inline(l)}</p>
                  ))}
                </div>
              ))}
          </>
        )}
      </div>
      <div className="review-foot">
        <span className={busy ? "live" : ""}>{busy ? "writing" : "complete"}</span>
        {review?.model && <span>{review.model}</span>}
        {review?.seconds && <span>{review.seconds}s</span>}
        {words > 0 && <span>{words} words</span>}
        {review?.skipped && <span>skipped: {review.skipped}</span>}
        {review?.saved && <span>saved from your first run of this image</span>}
      </div>
    </article>
  );
}
