"use client";

import { useReveal } from "./useSample";
import { bayer } from "./pixel";

// 9 by 9 pixel glyphs for the method principles. Pixels switch on in dither order on first view.
const GLYPHS = {
  data: [
    ".........",
    ".......#.",
    ".......#.",
    ".....#.#.",
    ".....#.#.",
    "...#.#.#.",
    ".#.#.#.#.",
    ".#.#.#.#.",
    "#########",
  ],
  estimate: [
    ".........",
    ".##...#..",
    "#..#.#...",
    "....#....",
    ".........",
    ".##...#..",
    "#..#.#...",
    "....#....",
    ".........",
  ],
  repeat: [
    ".........",
    "###...###",
    "#.#...#.#",
    "###...###",
    ".........",
    "###...###",
    "#.#...#.#",
    "###...###",
    ".........",
  ],
  private: [
    "...###...",
    "..#...#..",
    "..#...#..",
    ".#######.",
    ".#######.",
    ".###.###.",
    ".###.###.",
    ".#######.",
    ".........",
  ],
};
// Accent pixels: the one detail each glyph is about.
const ACCENT = {
  data: [
    [7, 1],
    [7, 2],
  ],
  estimate: [],
  repeat: [
    [1, 2],
    [7, 2],
  ],
  private: [
    [4, 5],
    [4, 6],
  ],
};

export default function PixelIcon({ name }) {
  const [ref, shown] = useReveal();
  const g = GLYPHS[name];
  const acc = new Set((ACCENT[name] || []).map(([x, y]) => `${x},${y}`));
  return (
    <span ref={ref} className={`px-icon ${shown ? "in" : ""}`} aria-hidden="true">
      {g.flatMap((row, y) =>
        row
          .split("")
          .map((c, x) => (
            <i
              key={`${x}-${y}`}
              className={c === "#" ? (acc.has(`${x},${y}`) ? "on acc" : "on") : ""}
              style={c === "#" ? { transitionDelay: `${Math.round(bayer(x, y) * 420)}ms` } : undefined}
            />
          ))
      )}
    </span>
  );
}
