import Link from "next/link";
import PrivacyLinks from "../../components/PrivacyLinks";

export const metadata = {
  title: "Privacy · Neuro UI Analyzer",
  description: "What Neuro UI Analyzer does with your data, and your choices.",
};

const UPDATED = "15 November 2026";

export default function Privacy() {
  return (
    <>
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="mark" aria-hidden="true">
            {[0, 1, 0, 1, 1, 1, 0, 1, 0].map((on, i) => (
              <i key={i} className={on ? "on" : ""} />
            ))}
          </span>
          Neuro UI Analyzer
        </Link>
        <div className="nav-links">
          <a className="chip" href="/app">
            Analyzer
          </a>
        </div>
      </nav>

      <main className="legal">
        <header>
          <p className="eyebrow">Privacy notice</p>
          <h1>Your data, in plain words</h1>
          <p className="legal-meta">Last updated {UPDATED}</p>
        </header>

        <section>
          <h2>The short version</h2>
          <ul>
            <li>
              The gaze model, layout check, brain maps and history run in your browser. Your screenshot stays on your
              device.
            </li>
            <li>Only the optional deep analysis sends a screenshot off your device, to Mistral AI in the EU.</li>
            <li>
              Anonymous page view statistics are collected only if you allow them. No cookies, no ads, no tracking
              across sites.
            </li>
            <li>Nothing is sold or shared for marketing.</li>
          </ul>
        </section>

        <section>
          <h2>Who is responsible</h2>
          <p>
            Neuro UI Analyzer is a personal project by Matteo Favetta, based in The Hague, the Netherlands. I am the
            controller for the personal data described here. You can reach me through{" "}
            <a href="https://matteofavetta.com">matteofavetta.com</a>.
          </p>
        </section>

        <section>
          <h2>What is processed, and why</h2>

          <h3>Screenshots you analyze</h3>
          <p>
            The gaze heatmap, layout check and brain view are computed in your browser. The image is not uploaded for
            these. Past analyses are saved in your browser&apos;s storage (IndexedDB) so you can reopen them from the
            History page. They never leave your device, and you can delete them there or by clearing this site&apos;s
            data in your browser.
          </p>

          <h3>Deep analysis (optional)</h3>
          <p>
            When you start a deep analysis, a downscaled copy of your screenshot and the measured layout numbers are
            sent through this site&apos;s server to Mistral AI (Paris, France), which writes the review and reports what
            the design contains. Nothing is stored on this site&apos;s server. Mistral hosts API data in the EU by
            default, keeps it for up to 30 days to detect abuse, and this project has opted out of having it used to
            train Mistral&apos;s models. Don&apos;t analyze screenshots that contain personal, confidential or
            unreleased information. Legal basis: providing the analysis you asked for (Art. 6(1)(b) GDPR).
          </p>

          <h3>Usage statistics (only with your consent)</h3>
          <p>
            If you choose Allow, Vercel Web Analytics records which pages are viewed, the referring site, and your rough
            location, browser, operating system and device type. It sets no cookies. Visitors are told apart by a hash
            of the request that resets every 24 hours, so you can&apos;t be followed across days or other websites.
            Query strings are removed from addresses before anything is sent. Data is shown to me only as totals. Legal
            basis: your consent (Art. 6(1)(a) GDPR), which you can withdraw at any time with{" "}
            <PrivacyLinks className="inline-links" only="settings" />. Your choice is saved in your browser&apos;s local
            storage.
          </p>

          <h3>Hosting and security</h3>
          <p>
            The site is hosted by Vercel. Like any web server, it receives your IP address and browser details with each
            request, and Vercel keeps short-lived technical logs to run and protect the service. To stop one connection
            from using up the shared analysis quota, the server holds a count of deep-analysis requests per IP address
            in memory for up to 10 minutes. It is not written anywhere. Legal basis: legitimate interest in running a
            secure, available service (Art. 6(1)(f) GDPR).
          </p>

          <h3>Waitlist</h3>
          <p>The waitlist form on the homepage does not store or send your email address yet.</p>
        </section>

        <section>
          <h2>Who receives data</h2>
          <ul>
            <li>
              <strong>Vercel Inc.</strong> (hosting and, with consent, analytics), as my processor.
            </li>
            <li>
              <strong>Mistral AI</strong> (France), only when you start a deep analysis.
            </li>
          </ul>
          <p>
            Vercel is based in the United States, so transfers to it rely on the EU-US Data Privacy Framework or the
            European Commission&apos;s standard contractual clauses in its data processing terms. Mistral AI is an EU
            company and keeps data in the EU by default.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>
            Under the GDPR you can ask for access to, correction or deletion of your personal data, restrict or object
            to its processing, and ask for a copy in a portable format. You can withdraw consent at any time, without
            affecting what happened before. Since this site keeps no account or server-side record of you, most data can
            be removed by clearing this site&apos;s data in your browser. For anything else, contact me as above.
          </p>
          <p>
            You can also complain to the Dutch data protection authority,{" "}
            <a href="https://www.autoriteitpersoonsgegevens.nl">Autoriteit Persoonsgegevens</a>, or the authority where
            you live.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>If this notice changes in a way that affects your choices, you&apos;ll be asked again.</p>
        </section>

        <footer className="foot">
          <PrivacyLinks />
        </footer>
      </main>
    </>
  );
}
