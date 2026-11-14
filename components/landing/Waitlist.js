"use client";

import { useState } from "react";

// Design only: nothing is sent yet. When a provider is chosen, replace the body of submit()
// with the request and keep the three states (idle, sending, done).
export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("That email address doesn't look complete.");
      return;
    }
    setError(null);
    setState("sending");
    setTimeout(() => setState("done"), 700);
  };

  if (state === "done")
    return (
      <div className="wl-done" role="status">
        <span className="wl-check" aria-hidden="true" />
        <div>
          <strong>You&apos;re on the list.</strong>
          <p>One email to {email.trim()} when the full version opens. Nothing else.</p>
        </div>
      </div>
    );

  return (
    <form className="wl-form" onSubmit={submit} noValidate>
      <label htmlFor="wl-email" className="sr-only">
        Email address
      </label>
      <div className={`wl-field ${error ? "bad" : ""}`}>
        <input
          id="wl-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@studio.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby="wl-help"
        />
        <button type="submit" className="pill lp-press" disabled={state === "sending"}>
          <span className={state === "sending" ? "sending" : ""}>
            {state === "sending" ? "Joining" : "Join the waitlist"}
          </span>
        </button>
      </div>
      <p id="wl-help" className={error ? "wl-error" : "wl-help"}>
        {error || "One email when it opens. No newsletter, no sharing your address."}
      </p>
    </form>
  );
}
