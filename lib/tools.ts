// The agent's hands.
//
// This is the whole difference between a chain and an agent. In the chain, our code
// decided to retrieve once and the model never had a say. Here the model is handed a
// function and decides for itself when to call it, what to search for, and whether the
// results were good enough to answer from — which is what makes multi-hop questions
// ("how does X compare to Y?") answerable at all.
//
// Tools are built per request so they can close over that request's index and citation
// register, keeping concurrent users completely isolated from each other.

import { tool } from "langchain";
import { z } from "zod";

import { CitationRegister } from "./citations";
import { search, DEFAULT_TOP_K } from "./vector-index";
import type { CitedChunk, DocumentIndex } from "./types";
import { sourceLabel } from "./types";

/** One passage a search surfaced, as the UI needs to display it. */
export interface TracedPassage {
  readonly n: number;
  readonly label: string;
  readonly score: number;
}

/**
 * Records what a tool call did, so the UI can show the agent's reasoning honestly.
 *
 * Scores are carried alongside the labels purely so the interface can show how strong a
 * retrieval was. Nothing here feeds back into ranking or citation — it is a read-only
 * view of numbers search() has already computed.
 */
export interface ToolTrace {
  readonly tool: string;
  readonly query?: string;
  readonly hits: number;
  readonly passages: readonly TracedPassage[];
}

/** Format retrieved chunks the way the model is told to expect them in the prompt. */
function renderResults(chunks: readonly CitedChunk[]): string {
  if (chunks.length === 0) {
    return "No passages matched that query. Try different wording, or answer with the refusal if the documents genuinely do not cover it.";
  }

  return chunks
    .map((chunk) => `[${chunk.n}] (${sourceLabel(chunk)})\n${chunk.text}`)
    .join("\n\n");
}

/**
 * Derived from the factory rather than hand-written.
 *
 * `tool()` returns a precisely generic type carrying its own argument schema, and any
 * hand-written annotation erases those generics — which createAgent then rejects.
 */
export type AgentTools = ReturnType<typeof makeAgentTools>;

/**
 * Build the tool set for a single question.
 *
 * The returned register and traces are live: they fill up as the agent runs, and are read
 * afterwards to validate citations and to render what the agent actually did.
 */
export function makeAgentTools(index: DocumentIndex, topK: number = DEFAULT_TOP_K) {
  const register = new CitationRegister();
  const traces: ToolTrace[] = [];

  const searchDocuments = tool(
    async ({ query }: { query: string }) => {
      const hits = await search(index, query, topK);

      // Numbering happens here, once, so a passage keeps the same [n] across every
      // search in this question.
      const cited = register.register(hits);

      traces.push({
        tool: "search_documents",
        query,
        hits: cited.length,
        passages: cited.map((chunk) => ({
          n: chunk.n,
          label: sourceLabel(chunk),
          score: chunk.score,
        })),
      });

      return renderResults(cited);
    },
    {
      name: "search_documents",
      description:
        "Search the user's documents for passages relevant to a query and return them " +
        "with numbered citation markers. Call this before answering anything. Call it " +
        "multiple times with different wording to cover multi-part questions or to " +
        "retry when results look weak.",
      schema: z.object({
        query: z
          .string()
          .min(2)
          .describe(
            "What to look for, phrased the way it would appear in the document rather " +
              "than as a question. Example: 'refund window and eligibility' rather than " +
              "'can I get a refund?'",
          ),
      }),
    },
  );

  const listDocuments = tool(
    async () => {
      traces.push({
        tool: "list_documents",
        hits: index.documents.length,
        passages: [],
      });

      return `The collection contains ${index.chunks.length} passages from: ${index.documents.join(", ")}.`;
    },
    {
      name: "list_documents",
      description:
        "List which documents are available to search. Use this when the user asks what " +
        "you can see, or when you need to know the scope before searching.",
      schema: z.object({}),
    },
  );

  return { tools: [searchDocuments, listDocuments], register, traces };
}
