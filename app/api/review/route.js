// Server-side call to the Gemini API so the key never reaches the browser.
// To swap provider later, only this file changes.
// The answer is streamed back as plain text so the review appears as it is written.

const MODELS = [
  process.env.GEMINI_MODEL,
  // Flash-Lite first: on the free tier it answers in a couple of seconds,
  // while the full Flash models can hang for 25s or more before the first word.
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-2.5-flash",
].filter(Boolean);

const FIRST_BYTE_TIMEOUT_MS = 12_000;

// Reasoning ("thinking") is the main source of latency, and a short review does not need much.
// Gemini 2.5 takes a token budget, Gemini 3 and later take a level.
function thinkingConfig(model) {
  if (model.includes("2.5")) return { thinkingBudget: 0 };
  if (model.includes("lite")) return { thinkingLevel: "minimal" };
  return { thinkingLevel: "low" };
}

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

async function callModel(model, key, payload, withThinking) {
  const body = {
    ...payload,
    generationConfig: {
      ...payload.generationConfig,
      ...(withThinking ? { thinkingConfig: thinkingConfig(model) } : {}),
    },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FIRST_BYTE_TIMEOUT_MS);
  try {
    return await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

// Turn Gemini's server-sent events into a plain text stream, dropping thought parts.
function textStream(upstream) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const emit = (controller, line) => {
    if (!line.startsWith("data:")) return;
    try {
      const json = JSON.parse(line.slice(5));
      for (const part of json.candidates?.[0]?.content?.parts || []) {
        if (part.text && !part.thought) controller.enqueue(encoder.encode(part.text));
      }
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

export async function POST(req) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "No GEMINI_API_KEY set. Add it to .env.local and restart the dev server." },
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

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: `Measured layout metrics (JSON):\n${JSON.stringify(metrics)}` },
        ],
      },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  };

  const skipped = [];
  let last = { status: 502, message: "No model responded." };

  for (const model of MODELS) {
    let res;
    try {
      res = await callModel(model, key, payload, true);
      // An unsupported thinking setting returns 400: retry this model with its defaults.
      if (res.status === 400) res = await callModel(model, key, payload, false);
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

    const json = await res.json().catch(() => ({}));
    const message = (Array.isArray(json) ? json[0] : json)?.error?.message || res.statusText;
    last = { status: res.status, message };
    skipped.push(`${model}: ${res.status}`);
    // Try the next model only when this one is missing, out of quota or overloaded.
    if (![404, 429, 500, 503].includes(res.status)) break;
  }

  const hint =
    last.status === 429 ? " Free tier quota reached. Wait a minute or try again tomorrow." : "";
  return Response.json({ error: `Gemini API: ${last.message}${hint}` }, { status: last.status });
}
