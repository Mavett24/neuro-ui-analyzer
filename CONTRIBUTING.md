# Contributing

Thanks for taking an interest. This is a solo project for now, but issues and pull requests are welcome.

## Setup

```bash
npm install
npm run dev
```

The deep research analysis needs a `GEMINI_API_KEY` in `.env.local` (see `.env.example`). Everything else works without one.

## Before you open a pull request

```bash
npm run check   # lint, format check and unit tests
npm run build
```

CI runs the same steps.

## Ground rules

These keep the tool trustworthy, which matters more than any single feature.

1. **Same image, same reading.** Analysis code must be deterministic: no randomness, no time-based behaviour, no thresholds that drift. `test/heuristics.test.js` checks this.
2. **Every number shows its working.** A new metric needs a one-line explanation on its card and an entry in `docs/METHOD.md`.
3. **Estimates are labelled as estimates.** Nothing in the UI should read as a measurement of real users.
4. **Images stay on the device by default.** Anything that sends data off the device must be opt-in and say where the data goes.
5. **Ground methods in research.** If a change affects how something is measured, link the paper or standard it's based on.

## Code

- Pure analysis logic lives in `lib/` and takes plain arrays, so it can be tested in Node. Put browser APIs (canvas, IndexedDB, WebGL) at the edges.
- Add or update tests in `test/` for any change to `lib/`. `test/fixtures.js` draws synthetic screenshots.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
