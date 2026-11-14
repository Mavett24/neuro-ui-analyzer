# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Unit tests for the layout heuristics, CTA detection, scanpath and brain weighting, including a determinism check.
- ESLint, Prettier and a GitHub Actions workflow that lints, tests and builds every push.
- Method, architecture, security and contributing docs, third-party notices and an MIT license.

### Changed

- Browser-only state (reduced motion, platform, URL parameters) is now read through `useSyncExternalStore`, which fixes the React 19 hook lint errors.

### Removed

- Two unused components.

## [0.1.0] - 2026-11-14

First working beta.

### Added

- Gaze heatmap from the UNISAL model, running in the browser.
- Predicted scanpath with playback of the first 3 seconds.
- Six pixel-based layout diagnostics with explanations, and filled-button CTA detection with a confidence score.
- Brain view with ten NeuroQuery maps on a 3D cortex and as MRI slices.
- Optional deep research analysis through Gemini: content detection and a streamed written review.
- Landing page with a waitlist form.
- History of analyses stored in IndexedDB.

[Unreleased]: https://github.com/mavett24/neuro-ui-analyzer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mavett24/neuro-ui-analyzer/releases/tag/v0.1.0
