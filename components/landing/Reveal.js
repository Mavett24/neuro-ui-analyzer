"use client";

import { useReveal } from "./useSample";

// One-time entrance when a block first scrolls into view. Children stagger through --i.
export default function Reveal({ as: Tag = "div", className = "", children, ...rest }) {
  const [ref, shown] = useReveal();
  return (
    <Tag ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
