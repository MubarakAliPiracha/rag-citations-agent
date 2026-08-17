// The browser's model of a conversation, and the reducer that folds agent events into it.
//
// Kept out of the components so state transitions can be reasoned about (and tested) on
// their own, without rendering anything.

import type { AgentEvent, AnswerResult } from "@/lib/agent";
import type { TracedPassage } from "@/lib/tools";

export type AgentStep =
  | {
      readonly kind: "search";
      readonly query: string;
      readonly hits: number;
      readonly passages: readonly TracedPassage[];
      readonly done: boolean;
    }
  | { readonly kind: "list"; readonly documents: readonly string[] };

/**
 * What the agent is doing right now.
 *
 * These are genuinely different activities and the UI shows them as such: "deciding" is
 * the model choosing its next move, "searching" is a retrieval in flight, and
 * "generating" is the answer being written. One undifferentiated spinner would hide the
 * most interesting part — that the agent chose to search, and how many times.
 */
export type Phase = "deciding" | "searching" | "generating" | "idle";

export type TurnStatus = "running" | "done" | "error";

export interface Turn {
  readonly id: string;
  readonly question: string;
  readonly steps: readonly AgentStep[];
  /** Tokens as they stream in. Replaced by the validated answer once the turn finishes. */
  readonly draft: string;
  readonly phase: Phase;
  readonly result?: AnswerResult;
  readonly error?: string;
  readonly status: TurnStatus;
}

export function newTurn(id: string, question: string): Turn {
  return { id, question, steps: [], draft: "", phase: "deciding", status: "running" };
}

/** Total passages surfaced across every search in a turn. */
export function totalPassages(turn: Turn): number {
  return turn.steps.reduce((sum, step) => sum + (step.kind === "search" ? step.hits : 0), 0);
}

/** How many searches the agent chose to run. */
export function searchCount(turn: Turn): number {
  return turn.steps.filter((step) => step.kind === "search").length;
}

/** Fold one agent event into a turn, returning a new turn. */
export function applyEvent(turn: Turn, event: AgentEvent): Turn {
  switch (event.type) {
    case "thinking":
      // Only meaningful before the answer starts; once tokens flow, the phase is
      // "generating" and a model call is just part of that.
      return turn.draft ? turn : { ...turn, phase: "deciding" };

    case "search_start":
      return {
        ...turn,
        phase: "searching",
        steps: [
          ...turn.steps,
          { kind: "search", query: event.query, hits: 0, passages: [], done: false },
        ],
      };

    case "search_end": {
      const steps = [...turn.steps];
      // Complete the most recent unfinished search. Searches can overlap, so matching on
      // "last unfinished" is more reliable than assuming it is the final element.
      for (let i = steps.length - 1; i >= 0; i--) {
        const step = steps[i];
        if (step.kind === "search" && !step.done) {
          steps[i] = {
            kind: "search",
            query: step.query || event.query,
            hits: event.hits,
            passages: event.passages,
            done: true,
          };
          break;
        }
      }
      return { ...turn, phase: "deciding", steps };
    }

    case "list_documents":
      return {
        ...turn,
        steps: [...turn.steps, { kind: "list", documents: event.documents }],
      };

    case "token":
      return { ...turn, phase: "generating", draft: turn.draft + event.text };

    case "done":
      return { ...turn, status: "done", phase: "idle", result: event.result };

    case "error":
      return { ...turn, status: "error", phase: "idle", error: event.message };

    default:
      return turn;
  }
}
