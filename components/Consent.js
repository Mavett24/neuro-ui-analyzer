"use client";

import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { onConsentChange, onOpenSettings, readConsent, saveConsent } from "../lib/consent";

// Drops query strings and hashes so analytics only ever sees the page path.
function stripUrl(event) {
  if (readConsent() !== "granted") return null;
  const url = new URL(event.url);
  return { ...event, url: url.origin + url.pathname };
}

export default function Consent() {
  // "unknown" on the server and during hydration, so the banner never flashes for people who already chose.
  const choice = useSyncExternalStore(onConsentChange, readConsent, () => "unknown");
  const [reopened, setReopened] = useState(false);
  useEffect(() => onOpenSettings(() => setReopened(true)), []);
  const open = choice === null || reopened;

  const decide = (value) => {
    saveConsent(value);
    setReopened(false);
  };

  return (
    <>
      {choice === "granted" && <Analytics beforeSend={stripUrl} />}
      {open && (
        <section className="consent" role="dialog" aria-modal="false" aria-labelledby="consent-title">
          <p id="consent-title" className="consent-title">
            Anonymous usage stats?
          </p>
          <p className="consent-body">
            With your permission, Vercel Web Analytics counts page views so I can see which parts of the tool get used.
            It sets no cookies and doesn&apos;t track you across sites. Your screenshots are never part of it.{" "}
            <Link href="/privacy">Privacy notice</Link>
          </p>
          <div className="consent-actions">
            <button type="button" onClick={() => decide("denied")}>
              Decline
            </button>
            <button type="button" onClick={() => decide("granted")}>
              Allow
            </button>
          </div>
        </section>
      )}
    </>
  );
}
