// Server-side call to the Mistral API so the key never reaches the browser.
// The answer is streamed back as plain text so the review appears as it is written.

import { clientIp, rateLimit, tooManyRequests } from "../../../lib/rateLimit";
import { MODELS, RETRY_STATUSES, apiKey, callMistral, errorMessage, textOf, userContent } from "../../../lib/mistral";

const FIRST_BYTE_TIMEOUT_MS = 12_000;

const SYSTEM = `You are a senior product designer with a cognitive psychology background reviewing a UI screenshot.
You receive the image plus layout metrics measured from its pixels. The metrics are heuristics: use them as evidence, and say so when the image contradicts them (for example a wrongly detected CTA).
Write in plain, direct language. No hype, no filler, no em dashes.
Return markdown with exactly these sections:
## Verdict
Two sentences.
## What works
Up to 3 bullets.
## Issues
Up to 4 bullets, most severe first. Each one names the element, the problem, and the cognitive principle behind it (for example Hick's law, Fitts's law, Gestalt proximity, visual hierarchy, cognitive load).
## Suggested changes
Up to 4 concrete, specific edits a designer could make today.
Formatting for fast scanning: start every bullet with a bolded label of 2 to 5 words that names the element or the action, for example "**Nav CTA** repeats the hero button...". In the verdict, bold the single most important phrase. Bold nothing else.
Keep the whole review under 300 words.`;

// Turn Mistral's server-sent events into a plain text stream, keeping only the answer text.
function textStream(upstream) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const emit = (controller, line) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const text = textOf(JSON.parse(data).choices?.[0]?.delta?.content);
      if (text) controller.enqueue(encoder.encode(text));
    } catch {
      // ignore keep-alives and partial lines
    }
  };
  return upstream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) emit(controller, line);
      },
      flush(controller) {
        emit(controller, buffer);
      },
    })
  );
}

// Abort only if no response headers arrive in time; once streaming starts, let it finish.
async function callWithTimeout(key, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FIRST_BYTE_TIMEOUT_MS);
  try {
    return await callMistral(key, body, ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req) {
  const wait = rateLimit(`review:${clientIp(req)}`);
  if (wait) return tooManyRequests(wait);

  const key = apiKey();
  if (!key) {
    return Response.json(
      { error: "No MISTRAL_API_KEY set. Add it to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { imageBase64, metrics } = body || {};
  if (!imageBase64 || !metrics) {
    return Response.json({ error: "Missing image or metrics." }, { status: 400 });
  }
  if (imageBase64.length > 4_000_000) {
    return Response.json({ error: "Image too large." }, { status: 413 });
  }

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userContent(imageBase64, `Measured layout metrics (JSON):\n${JSON.stringify(metrics)}`) },
  ];

  const skipped = [];
  let last = { status: 502, message: "No model responded." };

  for (const model of MODELS) {
    let res;
    try {
      res = await callWithTimeout(key, { model, messages, temperature: 0.2, max_tokens: 1500, stream: true });
    } catch {
      skipped.push(`${model}: timeout`);
      last = { status: 504, message: `${model} did not answer in time.` };
      continue;
    }

    if (res.ok && res.body) {
      return new Response(textStream(res.body), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Model": model,
          "X-Skipped": encodeURIComponent(skipped.join("; ")),
        },
      });
    }

    last = { status: res.status, message: await errorMessage(res) };
    skipped.push(`${model}: ${res.status}`);
    // Try the next model only when this one is missing, out of quota or overloaded.
    if (!RETRY_STATUSES.includes(res.status)) break;
  }

  const hint = last.status === 429 ? " The free tier is busy. Wait a minute and try again." : "";
  return Response.json({ error: `Mistral API: ${last.message}${hint}` }, { status: last.status });
}
