// The citation guarantee is the product, so these are the tests that matter most.

import { describe, expect, it } from "vitest";

import {
  CitationRegister,
  REFUSAL,
  citedNumbers,
  validateAnswer,
} from "@/lib/citations";
import type { ScoredChunk } from "@/lib/types";

function chunk(text: string, page = 1, score = 0.9): ScoredChunk {
  return { text, source: "handbook.pdf", page, score };
}

describe("CitationRegister", () => {
  it("should number chunks from 1 in the order they are first seen", () => {
    const register = new CitationRegister();

    const cited = register.register([chunk("a"), chunk("b", 2)]);

    expect(cited.map((c) => c.n)).toEqual([1, 2]);
  });

  it("should keep a chunk's original number when a later search returns it again", () => {
    const register = new CitationRegister();
    register.register([chunk("a"), chunk("b", 2)]);

    // A second search surfaces "a" again alongside something new.
    const second = register.register([chunk("c", 3), chunk("a")]);

    expect(second.map((c) => c.n)).toEqual([3, 1]);
    expect(register.size).toBe(3);
  });

  it("should treat identical text on different pages as different chunks", () => {
    const register = new CitationRegister();

    const cited = register.register([chunk("same text", 1), chunk("same text", 2)]);

    expect(cited.map((c) => c.n)).toEqual([1, 2]);
  });

  it("should report all chunks in citation order", () => {
    const register = new CitationRegister();
    register.register([chunk("a"), chunk("b", 2)]);
    register.register([chunk("c", 3)]);

    expect(register.all().map((c) => c.n)).toEqual([1, 2, 3]);
  });
});

describe("citedNumbers", () => {
  it("should extract each distinct citation number once, sorted", () => {
    expect(citedNumbers("Claim one [2][1]. Claim two [2]. Claim three [10].")).toEqual([1, 2, 10]);
  });

  it("should return nothing when the text has no citations", () => {
    expect(citedNumbers("An answer with no markers at all.")).toEqual([]);
  });
});

describe("validateAnswer", () => {
  function registerWith(count: number): CitationRegister {
    const register = new CitationRegister();
    register.register(
      Array.from({ length: count }, (_, i) => chunk(`passage ${i + 1}`, i + 1, 0.9 - i * 0.1)),
    );
    return register;
  }

  it("should accept a grounded answer and return only the sources it cites", () => {
    const register = registerWith(3);

    const result = validateAnswer("Vacation is 20 days [1]. Leave is 16 weeks [3].", register);

    expect(result.refused).toBe(false);
    expect(result.invalidCitations).toEqual([]);
    expect(result.sources.map((s) => s.n)).toEqual([1, 3]);
  });

  it("should refuse when the agent never searched, even if it produced confident text", () => {
    // This is the core regression the agent introduces: a model that skips the tool.
    const result = validateAnswer("Paris is the capital of France.", new CitationRegister());

    expect(result.refused).toBe(true);
    expect(result.answer).toBe(REFUSAL);
    expect(result.sources).toEqual([]);
  });

  it("should refuse when an answer cites nothing at all", () => {
    const result = validateAnswer("Employees get plenty of vacation.", registerWith(3));

    expect(result.refused).toBe(true);
    expect(result.answer).toBe(REFUSAL);
  });

  it("should strip a fabricated citation but keep the validly cited prose", () => {
    const register = registerWith(2);

    const result = validateAnswer("Real claim [1]. Invented claim [9].", register);

    expect(result.invalidCitations).toEqual([9]);
    expect(result.answer).not.toContain("[9]");
    expect(result.answer).toContain("[1]");
    expect(result.sources.map((s) => s.n)).toEqual([1]);
  });

  it("should refuse when every citation in the answer was fabricated", () => {
    const result = validateAnswer("Made up entirely [7][8].", registerWith(2));

    expect(result.refused).toBe(true);
    expect(result.invalidCitations).toEqual([7, 8]);
  });

  it("should normalise the refusal to the exact canonical string", () => {
    const result = validateAnswer(
      "I don't know based on the provided documents. Sorry about that.",
      registerWith(2),
    );

    expect(result.refused).toBe(true);
    expect(result.answer).toBe(REFUSAL);
  });
});
