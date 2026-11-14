"use client";

import { useEffect, useRef } from "react";

// Custom cursor: a pixel dot that tracks the pointer exactly, and a bracket frame that follows
// with a little lag. The frame grows over links and buttons, turns into an inspect reticle over
// [data-cursor="inspect"], and steps aside for text fields so the I-beam shows. Drawn with
// difference blending so it reads on both the dark and the light bands. Mouse and trackpad only.

export default function Cursor() {
  const dot = useRef(null);
  const ring = useRef(null);
  const label = useRef(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    root.classList.add("has-cursor");

    let x = -100,
      y = -100,
      rx = -100,
      ry = -100;
    let frame = 0;
    let mode = "";
    const set = (m, text = "") => {
      if (m === mode) return;
      mode = m;
      ring.current.dataset.mode = m;
      dot.current.dataset.mode = m;
      label.current.textContent = text;
    };
    const step = () => {
      frame = 0;
      const k = reduce ? 1 : 0.24;
      rx += (x - rx) * k;
      ry += (y - ry) * k;
      ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      if (Math.abs(x - rx) > 0.1 || Math.abs(y - ry) > 0.1) frame = requestAnimationFrame(step);
    };
    const onMove = (e) => {
      x = e.clientX;
      y = e.clientY;
      if (rx < -50) ((rx = x), (ry = y));
      dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.current.style.opacity = dot.current.style.opacity = "1";
      if (!frame) frame = requestAnimationFrame(step);
    };
    const onOver = (e) => {
      const el = e.target.closest?.("input, textarea, [data-cursor], a, button, [role='button']");
      if (!el) return set("");
      if (el.matches("input, textarea")) return set("text");
      if (el.dataset.cursor === "inspect") return set("inspect", "inspect");
      if (el.matches(":disabled")) return set("");
      set("link");
    };
    const onDown = () => ring.current.classList.add("down");
    const onUp = () => ring.current.classList.remove("down");
    const onLeave = () => (ring.current.style.opacity = dot.current.style.opacity = "0");

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      root.classList.remove("has-cursor");
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="cursor" aria-hidden="true">
      <div className="cursor-ring" ref={ring}>
        <i className="tl" />
        <i className="tr" />
        <i className="bl" />
        <i className="br" />
        <span ref={label} />
      </div>
      <div className="cursor-dot" ref={dot} />
    </div>
  );
}
