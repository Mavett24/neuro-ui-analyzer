# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-18

Launch. The tool is free to use, open source under the MIT license, and the first public release.

### Added

- Code of conduct, and the app version shown in the landing page footer, read from `package.json`.

### Changed

- The deep research analysis now runs on Mistral (EU-based) instead of Gemini, whose free tier can't be offered to users in the EEA.
- The tool is free to use: the landing page now links straight to the analyzer and to a sample report.

### Removed

- The waitlist form.

## [0.1.0] - 2026-11-14

First working beta.

### Added

- Gaze heatmap from the UNISAL model, running in the browser.
- Predicted scanpath with playback of the first 3 seconds.
- Six pixel-based layout diagnostics with explanations, and filled-button CTA detection with a confidence score.
- Brain view with ten NeuroQuery maps on a 3D cortex and as MRI slices.
- Optional deep research analysis through Gemini: content detection and a streamed written review.
- Landing page with a waitlist form, and a sample design to try the analyzer on.
- History of analyses stored in IndexedDB.
- Mobile-first layout: a bottom tab bar for the report sections, a full-width heatmap with zoom, collapsible metric cards, and touch gestures for the brain viewer (tap to inspect, vertical swipes scroll the page).
- Unit tests for the layout heuristics, CTA detection, scanpath and brain weighting, including a determinism check.
- ESLint, Prettier and a GitHub Actions workflow that lints, tests and builds every push.
- Method, architecture, security and contributing docs, third-party notices and an MIT license.

### Fixed

- CTA detection read thin, antialiased button labels as low contrast, so an accent button could lose to a neutral nav button. Labels are now read from their stroke cores, and a close-scoring accent button wins over a neutral one.
- The CTA hit margin was converted with the wrong aspect ratio, which made it four times too small vertically on wide screenshots.
- "1 hue families" now reads "1 hue family".

[1.0.0]: https://github.com/mavett24/neuro-ui-analyzer/releases/tag/v1.0.0
[0.1.0]: https://github.com/mavett24/neuro-ui-analyzer/commits/main
