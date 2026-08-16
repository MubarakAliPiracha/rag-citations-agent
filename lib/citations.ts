// Citation identity and citation honesty.
//
// Going from a fixed chain to an agent quietly weakens the core guarantee. A chain
// physically cannot show the model a question without evidence attached. An agent can
// decide not to search at all, and a model that skips the search will answer from memory
// — which is the exact hallucination this project exists to prevent.
//
// So the guarantee is re-established here, mechanically rather than by trusting the
// prompt: every [n] in a finished answer is checked against what was actually retrieved.

import type { CitedChunk, ScoredChunk, SourceRef } from "./types";
import { sourceLabel } from "./types";

export const REFUSAL = "I don't know based on the provided documents.";

/** Matches a citation marker: [1], [12], and the [2][3] runs the model likes to emit. */
const CITATION_PATTERN = /\[(\d+)\]/g;

/** Identity of a chunk, independent of which search surfaced it. */
function chunkKey(chunk: ScoredChunk): string {
  return `${chunk.source}::${chunk.page}::${chunk.text}`;
}

/**
 * Hands out citation numbers that stay stable for one question.
 *
 * The agent may search several times, and the same passage often surfaces in more than
 * one of those searches. Without a register, the second search would renumber it and the
 * model's earlier "[2]" would silently start pointing somewhere else.
 */
export class CitationRegister {
  private readonly byKey = new Map<string, CitedChunk>();

  /**
   * Assign numbers to freshly retrieved chunks.
   *
   * Chunks already seen keep the number they were first given, so repeat hits reinforce
   * a citation instead of duplicating it.
   */
  register(chunks: readonly ScoredChunk[]): CitedChunk[] {
    return chunks.map((chunk) => {
      const key = chunkKey(chunk);
      const existing = this.byKey.get(key);
      if (existing) return existing;

      const cited: CitedChunk = { ...chunk, n: this.byKey.size + 1 };
      this.byKey.set(key, cited);
      return cited;
    });
  }

  /** Every chunk retrieved so far, in citation order. */
  all(): CitedChunk[] {
    return [...this.byKey.values()].sort((a, b) => a.n - b.n);
  }

  has(n: number): boolean {
    return this.all().some((chunk) => chunk.n === n);
  }

  get size(): number {
    return this.byKey.size;
  }
}

/** The citation numbers actually referenced in a piece of text. */
export function citedNumbers(answer: string): number[] {
  const found = [...answer.matchAll(CITATION_PATTERN)].map((match) => Number(match[1]));
  return [...new Set(found)].sort((a, b) => a - b);
}

export interface ValidationResult {
  /** The answer, safe to display. */
  readonly answer: string;
  /** Only the sources the answer actually cites, renumbered is NOT done — numbers are preserved. */
  readonly sources: SourceRef[];
  /** True when the answer is the honest refusal rather than a grounded answer. */
  readonly refused: boolean;
  /** Citation numbers the model invented that match nothing retrieved. */
  readonly invalidCitations: number[];
}

/**
 * Check a finished answer against the evidence that was actually retrieved.
 *
 * Three failure modes are caught, in order of severity:
 *
 *   1. Nothing was retrieved at all — the agent answered without searching. Whatever it
 *      said is ungrounded by construction, so it is replaced with the refusal.
 *   2. The answer cites nothing. An uncited claim is exactly the unverifiable output the
 *      project promises not to produce, so it is also replaced with the refusal.
 *   3. The answer cites a number that was never issued. The claim is fabricated; the
 *      marker is stripped and the number reported so it can be surfaced and logged.
 */
export function validateAnswer(rawAnswer: string, register: CitationRegister): ValidationResult {
  const answer = rawAnswer.trim();
  const retrieved = register.all();

  const isRefusal = answer.toLowerCase().startsWith(REFUSAL.toLowerCase().slice(0, 20));
  if (isRefusal) {
    return { answer: REFUSAL, sources: [], refused: true, invalidCitations: [] };
  }

  if (retrieved.length === 0) {
    return { answer: REFUSAL, sources: [], refused: true, invalidCitations: [] };
  }

  const cited = citedNumbers(answer);
  const invalidCitations = cited.filter((n) => !register.has(n));
  const validCited = cited.filter((n) => register.has(n));

  if (validCited.length === 0) {
    return { answer: REFUSAL, sources: [], refused: true, invalidCitations };
  }

  // Strip only the fabricated markers; the surrounding prose may still be sound.
  const cleanedAnswer =
    invalidCitations.length === 0
      ? answer
      : answer.replace(CITATION_PATTERN, (marker, digits) =>
          invalidCitations.includes(Number(digits)) ? "" : marker,
        );

  const sources: SourceRef[] = retrieved
    .filter((chunk) => validCited.includes(chunk.n))
    .map((chunk) => ({
      n: chunk.n,
      label: sourceLabel(chunk),
      text: chunk.text,
      score: chunk.score,
    }));

  return {
    answer: cleanedAnswer.replace(/[ \t]{2,}/g, " ").trim(),
    sources,
    refused: false,
    invalidCitations,
  };
}
