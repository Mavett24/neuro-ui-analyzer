// Content detection: the vision model reports what is in the design as plain numbers.
// It does not decide anything about the brain. lib/brain.js maps these numbers to the maps.

const MODELS = [process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash"].filter(
  Boolean
);

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
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "No GEMINI_API_KEY set." }, { status: 500 });

  const { imageBase64 } = await req.json().catch(() => ({}));
  if (!imageBase64 || imageBase64.length > 4_000_000) {
    return Response.json({ error: "Missing or oversized image." }, { status: 400 });
  }

  const payload = {
    contents: [
      { role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } }, { text: PROMPT }] },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: "application/json" },
  };

  let last = "No model responded.";
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12_000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        last = json.error?.message || res.statusText;
        continue;
      }
      const text = (json.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p.thought)
        .map((p) => p.text || "")
        .join("");
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
