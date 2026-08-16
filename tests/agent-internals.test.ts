import { describe, expect, it } from "vitest";

import { describeError, toolArgsOf } from "@/lib/agent";
import { isValidSessionId, newSessionId } from "@/lib/session-store";

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
