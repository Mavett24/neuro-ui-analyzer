import "./landing/landing.css";
import Hero from "../components/landing/Hero";
import FlowDemo from "../components/landing/FlowDemo";
import Reveal from "../components/landing/Reveal";
import Waitlist from "../components/landing/Waitlist";
import Cursor from "../components/landing/Cursor";
import PixelDivider from "../components/landing/PixelDivider";
import PixelIcon from "../components/landing/PixelIcon";
import PixelGaze from "../components/landing/PixelGaze";
import PixelBlocks from "../components/landing/PixelBlocks";
import BrainMaps from "../components/landing/BrainMaps";
import PixelDetect from "../components/landing/PixelDetect";

export const metadata = {
  title: "Neuro UI Analyzer: predict how people see your interface",
  description:
    "Predicted attention from an eye-tracking-trained gaze model, an auditable layout check and brain maps from about 13,000 fMRI studies. Private beta.",
};

const VOID = "#000000";
const GROUND = "#131514";
const LIGHT = "#def0dd";

const PRINCIPLES = [
  ["data", "Grounded in data", "Eye-tracking recordings and 13,000 fMRI studies."],
  ["estimate", "Labelled as an estimate", "The method sits under every number."],
  ["repeat", "Repeatable", "Same image, same reading. Compare versions fairly."],
  ["private", "Private by default", "Only the opt-in review leaves your device."],
];

function Metric({ n, id, name, title, lead, how, assumes, source, flip, tone = "void", children }) {
  return (
    <section className={`band ${tone}`} id={id} aria-labelledby={`${id}-h`}>
      <div className={`metric ${flip ? "flip" : ""}`}>
        <Reveal className="metric-copy">
          <p className="eyebrow">
            <span className="m-n">{n}</span>
            {name}
          </p>
          <h3 id={`${id}-h`}>{title}</h3>
          <p className="m-lead">{lead}</p>
          <ol className="m-how" aria-label="How it is built">
            {how.map((h, i) => (
              <li key={i}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {h}
              </li>
            ))}
          </ol>
          <div className="m-assume">
            <h4>Assumes</h4>
            <ul>
              {assumes.map(([b, t]) => (
                <li key={b}>
                  <strong>{b}</strong>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="m-source">{source}</p>
        </Reveal>
        <Reveal className="metric-visual">{children}</Reveal>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <Cursor />
      <nav className="nav lp-nav">
        <a className="brand" href="/">
          <span className="mark" aria-hidden="true">
            {[0, 1, 0, 1, 1, 1, 0, 1, 0].map((on, i) => (
              <i key={i} className={on ? "on" : ""} />
            ))}
          </span>
          Neuro UI Analyzer
        </a>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#method">Method</a>
          <a href="#metrics">Metrics</a>
        </div>
        <div className="nav-links">
          <a className="chip" href="/app">
            Try the beta
          </a>
          <a className="lp-nav-cta lp-press" href="#waitlist">
            Early access
          </a>
        </div>
      </nav>

      <Hero />

      <section className="band void" id="how">
        <div className="band-inner">
          <Reveal className="lp-head">
            <p className="eyebrow">How it works</p>
            <h2>Screenshot in, findings out</h2>
            <p className="sub">Four steps on your device in seconds. The fifth only runs when you ask.</p>
          </Reveal>
          <FlowDemo />
        </div>
      </section>

      <PixelDivider from={VOID} to={LIGHT} />
      <section className="band light" id="method">
        <div className="band-inner">
          <Reveal className="method">
            <div className="method-head">
              <p className="eyebrow">Method</p>
              <h2>A prediction, and clear about being one</h2>
              <p className="sub">
                Built by a product designer trained in cognitive psychology. Every measure comes from published research
                and shows its working.
              </p>
            </div>
            <ul className="principles">
              {PRINCIPLES.map(([icon, t, d], i) => (
                <li key={t} style={{ "--i": i }}>
                  <PixelIcon name={icon} />
                  <strong>{t}</strong>
                  <p>{d}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
      <PixelDivider from={LIGHT} to={VOID} />

      <section className="band void metrics-intro" id="metrics">
        <div className="band-inner">
          <Reveal className="lp-head">
            <p className="eyebrow">Metrics</p>
            <h2>What each result means</h2>
            <p className="sub">Its source, how it is computed, and what it takes for granted.</p>
          </Reveal>
        </div>
      </section>

      <Metric
        n="01"
        id="m-attention"
        name="Predicted attention"
        title="Attention, from real eye‑tracking"
        lead="A published gaze model, trained on where real people looked, predicts the first three seconds."
        how={["Gaze model trained on human fixations", "Fixation map computed in your browser", "Scanpath from winner-take-all and inhibition of return"]}
        assumes={[
          ["Free viewing", "no specific task in mind"],
          ["First 3 seconds", "before reading and intent take over"],
          ["Still image", "motion pulls the eye, so animation is underrated"],
          ["Trained on photos", "a strong prior for UIs, not a recording"],
        ]}
        source="UNISAL, Droste et al. 2020 · MIT1003, Judd et al. 2009 · Itti, Koch & Niebur 1998"
      >
        <PixelGaze />
      </Metric>

      <PixelDivider from={VOID} to={GROUND} />
      <Metric
        n="02"
        id="m-layout"
        name="Layout heuristics"
        title="A layout check you can audit"
        lead="Six measures straight from the pixels. No AI, and the same numbers every time."
        how={["Screen read in small blocks", "Blocks sorted into empty, detail and imagery", "Measures checked against published thresholds"]}
        assumes={[
          ["Filled buttons only", "ghost buttons and text links are skipped"],
          ["Context matters", "a splash screen is not a dashboard"],
        ]}
        source="WCAG 2.2 · 1.4.11 Non-text Contrast · OKLab colour space"
        tone="ground"
        flip
      >
        <PixelBlocks />
      </Metric>
      <PixelDivider from={GROUND} to={VOID} />

      <Metric
        n="03"
        id="m-brain"
        name="Brain regions"
        title="Brain maps from 13,000 studies"
        lead="Real meta-analytic fMRI maps, weighted by what was measured in your design."
        how={["One NeuroQuery map per function", "Weights from your measurements, formula shown", "Drawn on the ICBM152 surface, AAL region names"]}
        assumes={[
          ["An estimate, not a scan", "no brain is recorded"],
          ["Population average", "where research places a function, not one person"],
        ]}
        source="NeuroQuery, Dockès et al. 2020 · ICBM152 · AAL atlas, Tzourio-Mazoyer et al. 2002"
      >
        <BrainMaps />
      </Metric>

      <PixelDivider from={VOID} to={GROUND} />
      <Metric
        n="04"
        id="m-deep"
        name="Deep research analysis"
        title="A review that gives its reasons"
        lead="On request, a vision model reads the screen's content and names the principle behind each issue."
        how={["Finds text, faces, objects, prices and actions", "Adds six content-based brain functions", "Cites Hick's law, Fitts's law, Gestalt and hierarchy"]}
        assumes={[
          ["Opt-in, cloud", "sent to Gemini, so skip confidential work"],
          ["Models misread", "the measured numbers stay the evidence"],
        ]}
        source="Hick 1952 · Fitts 1954 · Gemini API"
        tone="ground"
        flip
      >
        <PixelDetect />
      </Metric>
      <PixelDivider from={GROUND} to={VOID} />

      <footer className="lp-foot" id="waitlist">
        <div className="lp-cta">
          <div className="lp-cta-copy">
            <p className="eyebrow">Early access</p>
            <h2>Be first in when it fully opens</h2>
            <p className="sub">The beta runs the whole flow today. Leave your email to hear when the full version is ready.</p>
          </div>
          <Waitlist />
        </div>
        <div className="lp-foot-bar">
          <a className="brand" href="/">
            <span className="mark" aria-hidden="true">
              {[0, 1, 0, 1, 1, 1, 0, 1, 0].map((on, i) => (
                <i key={i} className={on ? "on" : ""} />
              ))}
            </span>
            Neuro UI Analyzer
          </a>
          <nav aria-label="Footer">
            <a href="/app">Try the beta</a>
            <a href="/brain">Brain demo</a>
            <a href="#metrics">Metrics</a>
            <a href="https://matteofavetta.com">matteofavetta.com</a>
          </nav>
        </div>
        <p className="lp-credits">
          Estimates for design exploration, not measurements of real users. Gaze model: UNISAL (Droste et al., 2020,
          Apache 2.0). Brain maps: NeuroQuery (Dockès et al., 2020). Region names: AAL atlas (Tzourio-Mazoyer et al.,
          2002).
        </p>
      </footer>
    </div>
  );
}
