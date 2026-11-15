import { afterEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../lib/mistral";
import { POST as review } from "../app/api/review/route";
import { POST as features } from "../app/api/features/route";

const req = (body, ip) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("textOf", () => {
  it("keeps plain strings and only the text chunks of reasoning output", () => {
    expect(textOf("hi")).toBe("hi");
    expect(
      textOf([
        { type: "thinking", thinking: [] },
        { type: "text", text: "answer" },
      ])
    ).toBe("answer");
    expect(textOf(undefined)).toBe("");
  });
});

describe("Mistral routes", () => {
  it("streams the review as plain text", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "test");
    const sse = [
      'data: {"choices":[{"delta":{"content":"## Verdict"}}]}',
      'data: {"choices":[{"delta":{"content":" Clear."}}]}',
      "data: [DONE]",
      "",
    ].join("\n\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sse, { status: 200 }))
    );
    const res = await review(req({ imageBase64: "AAAA", metrics: { a: 1 } }, "1.1.1.1"));
    expect(res.headers.get("X-Model")).toBe("mistral-small-latest");
    expect(await res.text()).toBe("## Verdict Clear.");
  });

  it("parses content detection and retries once after a rate limit", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "test");
    const ok = {
      choices: [
        {
          message: {
            content: '{"textAmount":0.4,"faces":2,"objectImagery":0.1,"sceneImagery":0,"rewardCues":1,"choices":9}',
          },
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: "Rate limit" }, { status: 429 }))
      .mockResolvedValueOnce(Response.json(ok));
    vi.stubGlobal("fetch", fetchMock);
    const res = await features(req({ imageBase64: "AAAA" }, "2.2.2.2"));
    const json = await res.json();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(json.features).toEqual({
      textAmount: 0.4,
      faces: 2,
      objectImagery: 0.1,
      sceneImagery: 0,
      rewardCues: 1,
      choices: 9,
    });
  });
});
