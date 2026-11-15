// Mistral chat completions, called only from the server routes so the key never reaches the browser.
// Mistral AI is based in Paris and hosts API data in the EU by default.

export const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

// Small first: it answers in a few seconds and reads screenshots well. Medium is the fallback
// when Small is unavailable or over its rate limit.
export const MODELS = [process.env.MISTRAL_MODEL, "mistral-small-latest", "mistral-medium-latest"].filter(Boolean);

// Errors worth retrying on the next model: missing model, rate limit, or a server-side failure.
export const RETRY_STATUSES = [404, 429, 500, 502, 503];

export function apiKey() {
  return process.env.MISTRAL_API_KEY;
}

export function userContent(imageBase64, text) {
  return [
    { type: "image_url", image_url: `data:image/jpeg;base64,${imageBase64}` },
    { type: "text", text },
  ];
}

export function callMistral(key, body, signal) {
  return fetch(MISTRAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  });
}

// Message content is a string, or an array of chunks on models that also return reasoning.
// Only the text chunks belong in the answer.
export function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c?.type === "text")
    .map((c) => c.text || "")
    .join("");
}

export async function errorMessage(res) {
  const json = await res.json().catch(() => ({}));
  return json.message || json.error?.message || json.detail || res.statusText;
}
