import { describe, expect, it } from "vitest";
import { rateLimit } from "../lib/rateLimit";

describe("rateLimit", () => {
  it("allows 10 requests per 10 minutes, then asks the client to wait", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(rateLimit("test:a", t0 + i)).toBeNull();
    expect(rateLimit("test:a", t0 + 10)).toBeGreaterThan(0);
    expect(rateLimit("test:b", t0 + 10)).toBeNull();
    expect(rateLimit("test:a", t0 + 10 * 60 * 1000 + 1)).toBeNull();
  });
});
