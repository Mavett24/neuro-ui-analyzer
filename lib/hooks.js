import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

// Small hooks for browser-only values. useSyncExternalStore renders the server value during
// hydration and the real one right after, so there is no hydration mismatch and no effect that
// sets state on mount.

const never = () => () => {};

// A value read from the browser that doesn't change while the page is open (platform, URL).
// `read` must return a primitive so React can compare snapshots.
export function useBrowserValue(read, serverValue) {
  return useSyncExternalStore(never, read, () => serverValue);
}

export function useMediaQuery(query, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

// A ref that always holds the latest value, for callbacks and animation loops that must not
// restart when a prop changes. Updated after render, never during it.
export function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
