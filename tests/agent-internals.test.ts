import { describe, expect, it } from "vitest";

import { describeError, toolArgsOf, usageOf } from "@/lib/agent";
import { isValidSessionId, newSessionId } from "@/lib/session-store";

describe("usageOf", () => {
  it("should read the normalised usage_metadata shape", () => {
    const message = {
      usage_metadata: { input_tokens: 1528, output_tokens: 33, total_tokens: 1561 },
    };

    expect(usageOf(message)).toEqual({
      inputTokens: 1528,
      outputTokens: 33,
      totalTokens: 1561,
      modelCalls: 1,
    });
  });

  it("should fall back to the older response_metadata.tokenUsage shape", () => {
    const message = {
      response_metadata: {
        tokenUsage: { promptTokens: 900, completionTokens: 40, totalTokens: 940 },
      },
    };

    expect(usageOf(message)).toEqual({
      inputTokens: 900,
      outputTokens: 40,
      totalTokens: 940,
      modelCalls: 1,
    });
  });

  // A zero total and "the provider reported nothing" mean different things in the eval
  // output, so an absent report must stay null rather than collapsing into zeros.
  it("should return null when no usage is reported at all", () => {
    expect(usageOf({})).toBeNull();
    expect(usageOf(null)).toBeNull();
    expect(usageOf(undefined)).toBeNull();
    expect(usageOf({ usage_metadata: {} })).toBeNull();
    expect(usageOf("not a message")).toBeNull();
  });

  it("should tolerate a partial usage_metadata that still carries a total", () => {
    expect(usageOf({ usage_metadata: { total_tokens: 500 } })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 500,
      modelCalls: 1,
    });
  });
});

describe("toolArgsOf", () => {
  // Regression: LangChain wraps tool arguments inconsistently, and reading them naively
  // produced an empty query, so the UI trace showed every search as `searched ""`.
  it("should unwrap arguments delivered as a nested JSON string", () => {
    const data = { input: { input: '{"query":"vacation policy"}' } };

    expect(toolArgsOf(data)).toEqual({ query: "vacation policy" });
  });

  it("should read arguments delivered as a plain object", () => {
    expect(toolArgsOf({ input: { query: "vacation policy" } })).toEqual({
      query: "vacation policy",
    });
  });

  it("should read arguments delivered as a top-level JSON string", () => {
    expect(toolArgsOf({ input: '{"query":"leave"}' })).toEqual({ query: "leave" });
  });

  it("should return an empty object rather than throwing on malformed input", () => {
    expect(toolArgsOf({ input: { input: "not json at all" } })).toEqual({});
    expect(toolArgsOf(undefined)).toEqual({});
    expect(toolArgsOf({})).toEqual({});
  });
});

describe("describeError", () => {
  it("should translate a quota error into an actionable message", () => {
    const message = describeError(new Error("429 RESOURCE_EXHAUSTED quota exceeded"));

    expect(message).toMatch(/rate limit/i);
    expect(message).not.toMatch(/RESOURCE_EXHAUSTED/);
  });

  it("should translate an auth error without echoing provider jargon", () => {
    expect(describeError(new Error("PERMISSION_DENIED: bad api key"))).toMatch(/api key/i);
  });

  it("should pass through an error it does not recognise", () => {
    expect(describeError(new Error("Something unusual happened"))).toBe(
      "Something unusual happened",
    );
  });
});

describe("session ids", () => {
  it("should generate ids that pass validation", () => {
    expect(isValidSessionId(newSessionId())).toBe(true);
  });

  it("should reject path traversal attempts, since the id becomes a storage path", () => {
    expect(isValidSessionId("../../etc/passwd")).toBe(false);
    expect(isValidSessionId("abc")).toBe(false);
    expect(isValidSessionId("")).toBe(false);
  });
});
