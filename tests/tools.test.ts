// The agent's tools, with retrieval stubbed.
//
// The important behaviour here is citation numbering ACROSS searches — the thing that
// silently breaks when a chain becomes an agent.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScoredChunk } from "@/lib/types";

const search = vi.fn();

vi.mock("@/lib/vector-index", () => ({
  DEFAULT_TOP_K: 5,
  search,
}));

const { makeAgentTools } = await import("@/lib/tools");

import type { DocumentIndex } from "@/lib/types";

const index = {
  embeddingModel: "gemini-embedding-001",
  dims: 768,
  documents: ["handbook.pdf"],
  chunks: [],
} as unknown as DocumentIndex;

function chunk(text: string, page: number): ScoredChunk {
  return { text, source: "handbook.pdf", page, score: 0.7 };
}

/**
 * Call a tool the way the agent runtime does.
 *
 * The cast is deliberate: `tool()` returns a type whose invoke signature is generic over
 * its own argument schema, which cannot be expressed by a helper meant to accept any of
 * them. The runtime call is exactly what the agent performs.
 */
type InvokableTool = { invoke: (args: Record<string, unknown>) => Promise<unknown> };

async function invoke(tool: unknown, args: Record<string, unknown>): Promise<string> {
  return String(await (tool as InvokableTool).invoke(args));
}

describe("search_documents", () => {
  beforeEach(() => search.mockReset());

  it("should return passages numbered and labelled for citation", async () => {
    search.mockResolvedValue([chunk("Vacation is 20 days.", 4)]);
    const { tools } = makeAgentTools(index);

    const output = await invoke(tools[0], { query: "vacation" });

    expect(output).toContain("[1] (handbook.pdf p.4)");
    expect(output).toContain("Vacation is 20 days.");
  });

  it("should keep numbering across searches instead of restarting at 1", async () => {
    // Without this, "[1]" would mean a different passage in the second search and every
    // citation in a multi-hop answer would be ambiguous.
    const { tools } = makeAgentTools(index);

    search.mockResolvedValue([chunk("First passage.", 1)]);
    await invoke(tools[0], { query: "one" });

    search.mockResolvedValue([chunk("Second passage.", 2)]);
    const second = await invoke(tools[0], { query: "two" });

    expect(second).toContain("[2] (handbook.pdf p.2)");
    expect(second).not.toContain("[1]");
  });

  it("should reuse a passage's original number when a later search returns it again", async () => {
    const { tools, register } = makeAgentTools(index);

    search.mockResolvedValue([chunk("Shared passage.", 1)]);
    await invoke(tools[0], { query: "one" });

    search.mockResolvedValue([chunk("New passage.", 2), chunk("Shared passage.", 1)]);
    const second = await invoke(tools[0], { query: "two" });

    expect(second).toContain("[2] (handbook.pdf p.2)");
    expect(second).toContain("[1] (handbook.pdf p.1)");
    expect(register.size).toBe(2);
  });

  it("should tell the agent to retry rather than returning silence on zero hits", async () => {
    search.mockResolvedValue([]);
    const { tools } = makeAgentTools(index);

    const output = await invoke(tools[0], { query: "nothing" });

    expect(output).toMatch(/no passages matched/i);
    expect(output).toMatch(/different wording|refusal/i);
  });

  it("should record a trace of what it searched for", async () => {
    search.mockResolvedValue([chunk("A passage.", 3)]);
    const { tools, traces } = makeAgentTools(index);

    await invoke(tools[0], { query: "holiday allowance" });

    expect(traces).toEqual([
      {
        tool: "search_documents",
        query: "holiday allowance",
        hits: 1,
        passages: [{ n: 1, label: "handbook.pdf p.3", score: 0.7 }],
      },
    ]);
  });
});

describe("list_documents", () => {
  it("should report the documents available to search", async () => {
    const { tools } = makeAgentTools({
      ...index,
      documents: ["a.pdf", "b.pdf"],
      chunks: new Array(12).fill(null),
    } as unknown as DocumentIndex);

    const output = await invoke(tools[1], {});

    expect(output).toContain("a.pdf, b.pdf");
    expect(output).toContain("12 passages");
  });
});
