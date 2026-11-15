"use client";

import Link from "next/link";
import { openConsentSettings } from "../lib/consent";

// Links to the privacy notice and to change the analytics choice at any time.
// only="settings" renders just the settings button, for use inside a sentence.
export default function PrivacyLinks({ className = "privacy-links", only }) {
  const settings = (
    <button type="button" className="linklike" onClick={openConsentSettings}>
      Privacy settings
    </button>
  );
  if (only === "settings") return settings;
  return (
    <span className={className}>
      <Link href="/privacy">Privacy</Link>
      {settings}
    </span>
  );
}
