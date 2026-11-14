"use client";

import { useId, useState } from "react";
import { useMediaQuery } from "../lib/hooks";

// Phones get scannable rows: label, status and value stay visible, and the visualization and
// explanation open on tap. Larger screens get the full card.
export const useCompact = () => useMediaQuery("(max-width: 700px)");

export default function MetricCard({ className = "", style, summary, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <article className={`diag compact ${open ? "open" : ""} ${className}`} style={style}>
      <button
        type="button"
        className="diag-sum"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {summary}
        <span className="diag-chev" aria-hidden="true" />
      </button>
      {/* Mounted on open, so canvases inside measure their real size. */}
      <div id={id} className="diag-more" hidden={!open}>
        {open && children}
      </div>
    </article>
  );
}
