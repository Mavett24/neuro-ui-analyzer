// Analytics consent, stored on the device only. Nothing is sent before the visitor chooses.
// Bump the version when the privacy notice changes in a way that needs a fresh choice.

const KEY = "nua-consent-v1";
const CHANGE = "nua-consent-change";
const OPEN = "nua-consent-open";
let memory = null; // Fallback when storage is blocked: the choice holds for this visit.

export function readConsent() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY))?.analytics;
    if (value === "granted" || value === "denied") return value;
  } catch {
    // Storage blocked or corrupted: fall through to the in-memory choice.
  }
  return memory;
}

export function saveConsent(analytics) {
  memory = analytics;
  try {
    localStorage.setItem(KEY, JSON.stringify({ analytics, at: new Date().toISOString() }));
  } catch {
    // Storage blocked: the in-memory choice covers this visit.
  }
  window.dispatchEvent(new CustomEvent(CHANGE, { detail: analytics }));
}

export function onConsentChange(fn) {
  const handler = (e) => fn(e.detail);
  window.addEventListener(CHANGE, handler);
  return () => window.removeEventListener(CHANGE, handler);
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN));
}

export function onOpenSettings(fn) {
  window.addEventListener(OPEN, fn);
  return () => window.removeEventListener(OPEN, fn);
}
