// Content detection: the vision model reports what is in the design as plain numbers.
// It does not decide anything about the brain. lib/brain.js maps these numbers to the maps.

import { clientIp, rateLimit, tooManyRequests } from "../../../lib/rateLimit";
import { MODELS, RETRY_STATUSES, apiKey, callMistral, errorMessage, textOf, userContent } from "../../../lib/mistral";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT = `Look at this UI screenshot and report what it contains. Return only JSON with exactly these keys:
{
 "textAmount": number 0 to 1 (0 = no text, 0.3 = a headline and a few labels, 0.6 = several paragraphs or many labels, 1 = wall of text),
 "faces": integer, number of clearly visible human faces in photos or illustrations,
 "objectImagery": number 0 to 1, share of the screen showing photos or renders of objects or products,
 "sceneImagery": number 0 to 1, share of the screen showing places, landscapes, rooms or environments,
 "rewardCues": integer, number of distinct reward signals: prices, discounts, ratings, badges, progress or streak rewards,
 "choices": integer, number of distinct interactive actions visible: buttons, links, menu items, inputs
}`;

const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));

export async function POST(req) {
  const wait = rateLimit(`features:${clientIp(req)}`);
  if (wait) return tooManyRequests(wait);

  const key = apiKey();
  if (!key) return Response.json({ error: "No MISTRAL_API_KEY set." }, { status: 500 });

  const { imageBase64 } = await req.json().catch(() => ({}));
  if (!imageBase64 || imageBase64.length > 4_000_000) {
    return Response.json({ error: "Missing or oversized image." }, { status: 400 });
  }

  const body = {
    messages: [{ role: "user", content: userContent(imageBase64, PROMPT) }],
    temperature: 0,
    max_tokens: 400,
    response_format: { type: "json_object" },
  };

  // This route runs alongside the review, and the free tier allows about one request per second,
  // so a rate-limited first attempt waits a moment and tries the same model once more.
  const attempts = [MODELS[0], MODELS[0], ...MODELS.slice(1)];
  let last = "No model responded.";
  for (const [i, model] of attempts.entries()) {
    try {
      const res = await callMistral(key, { ...body, model }, AbortSignal.timeout(12_000));
      if (!res.ok) {
        last = await errorMessage(res);
        if (res.status === 429 && i === 0) await sleep(1200);
        else if (!RETRY_STATUSES.includes(res.status)) break;
        continue;
      }
      const json = await res.json();
      const text = textOf(json.choices?.[0]?.message?.content);
      const raw = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
      return Response.json({
        model,
        features: {
          textAmount: +num(raw.textAmount, 1).toFixed(2),
          faces: Math.round(num(raw.faces, 20)),
          objectImagery: +num(raw.objectImagery, 1).toFixed(2),
          sceneImagery: +num(raw.sceneImagery, 1).toFixed(2),
          rewardCues: Math.round(num(raw.rewardCues, 20)),
          choices: Math.round(num(raw.choices, 200)),
        },
      });
    } catch (e) {
      last = e.message;
    }
  }
  return Response.json({ error: `Content detection failed: ${last}` }, { status: 502 });
}
