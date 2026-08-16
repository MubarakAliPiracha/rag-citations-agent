import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalize } from "@/lib/embeddings";

// Retrieval must be testable without spending API calls, so the embedding factory is
// replaced with a deterministic stand-in.
const embedQuery = vi.fn();

vi.mock("@/lib/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embeddings")>();
  return {
    ...actual,
    makeEmbeddings: () => ({
      model: "gemini-embedding-001",
      dims: 3,
      embedQuery,
      embedDocuments: vi.fn(),
    }),
  };
});

const { assertIndexIsCurrent, dotProduct, search } = await import("@/lib/vector-index");

import type { DocumentIndex } from "@/lib/types";

function index(dims = 3, model = "gemini-embedding-001"): DocumentIndex {
  return {
    embeddingModel: model,
    dims,
    documents: ["handbook.pdf"],
    chunks: [
      { text: "about cats", source: "handbook.pdf", page: 1, vector: normalize([1, 0, 0]) },
      { text: "about dogs", source: "handbook.pdf", page: 2, vector: normalize([0, 1, 0]) },
      { text: "about finance", source: "handbook.pdf", page: 3, vector: normalize([0, 0, 1]) },
    ],
  };
}

describe("normalize", () => {
  it("should scale a vector to unit length", () => {
    const result = normalize([3, 4]);

    expect(result).toEqual([0.6, 0.8]);
  });

  it("should leave a zero vector alone rather than dividing by zero", () => {
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("dotProduct", () => {
  it("should return 1 for identical unit vectors", () => {
    expect(dotProduct([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it("should return 0 for orthogonal vectors", () => {
    expect(dotProduct([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it("should refuse to compare vectors of different lengths", () => {
    expect(() => dotProduct([1, 0], [1, 0, 0])).toThrow(/length mismatch/i);
  });
});

describe("assertIndexIsCurrent", () => {
  it("should accept an index built with the configured model and dimensions", () => {
    expect(() => assertIndexIsCurrent(index(768))).not.toThrow();
  });

  it("should reject an index with mismatched dimensions rather than search it silently", () => {
    // Silent mismatch is the dangerous case: it yields plausible numbers and therefore
    // confident nonsense that the model then cites.
    expect(() => assertIndexIsCurrent(index(1536))).toThrow(/rebuild the index/i);
  });

  it("should reject an index built by a different embedding model", () => {
    expect(() => assertIndexIsCurrent(index(768, "some-other-model"))).toThrow(/some-other-model/);
  });
});

describe("search", () => {
  beforeEach(() => {
    embedQuery.mockReset();
  });

  it("should rank chunks by closeness in meaning", async () => {
    embedQuery.mockResolvedValue(normalize([0.9, 0.1, 0]));

    const results = await search(index(768), "cats", 3);

    expect(results.map((r) => r.text)).toEqual(["about cats", "about dogs", "about finance"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("should return at most topK results", async () => {
    embedQuery.mockResolvedValue(normalize([1, 0, 0]));

    const results = await search(index(768), "cats", 2);

    expect(results).toHaveLength(2);
  });

  it("should return no citation numbers, leaving numbering to the register", async () => {
    embedQuery.mockResolvedValue(normalize([1, 0, 0]));

    const [first] = await search(index(768), "cats", 1);

    expect(first).not.toHaveProperty("n");
    expect(first.page).toBe(1);
  });
});
