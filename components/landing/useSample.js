"use client";

import { useEffect, useRef, useState } from "react";

// The sample page analysis precomputed by the real analyzer (public/demo/sample.json).
let samplePromise;
export function useSample() {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!samplePromise)
      samplePromise = fetch("/demo/sample.json")
        .then((r) => r.json())
        .then((d) => {
          const bin = atob(d.map);
          const map = new Float32Array(bin.length);
          for (let i = 0; i < bin.length; i++) map[i] = bin.charCodeAt(i) / 255;
          return { ...d, saliency: { w: d.w, h: d.h, map } };
        });
    let live = true;
    samplePromise.then((d) => live && setData(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return data;
}

// Adds `in` once the element scrolls into view. Used for one-time section reveals.
export function useReveal(margin = "0px 0px -12% 0px") {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, shown];
}
