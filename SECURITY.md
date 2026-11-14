# Security

## Reporting a vulnerability

Please report security issues privately through [GitHub's private vulnerability reporting](https://github.com/mavett24/neuro-ui-analyzer/security/advisories/new) rather than in a public issue. You'll get a reply within a week.

## How data is handled

- **Screenshots stay in the browser** for the gaze model, layout analysis, brain maps and history. History is stored in IndexedDB on the user's device and is never uploaded.
- **The deep research analysis is opt-in.** It sends a downscaled JPEG (longest side 1024 px) and the measured metrics to the Gemini API through the app's own server routes.
- **The API key never reaches the browser.** `GEMINI_API_KEY` is read only in `app/api/*/route.js`. `.env.local` is git-ignored.
- **Request size is capped.** The API routes reject images over 4 million base64 characters (about 3 MB) and validate the request body before calling the model.
