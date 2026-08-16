// The browser's model of a conversation, and the reducer that folds agent events into it.
//
// Kept out of the components so the state transitions can be reasoned about (and tested)
// on their own, without rendering anything.

import type { AgentEvent, AnswerResult } from "@/lib/agent";

export type AgentStep =
  | { readonly kind: "thinking" }
  | {
      readonly kind: "search";
      readonly query: string;
      readonly hits: number;
      readonly labels: readonly string[];
      readonly done: boolean;
    }
  | { readonly kind: "list"; readonly documents: readonly string[] };

export type TurnStatus = "running" | "done" | "error";

export interface Turn {
  readonly id: string;
  readonly question: string;
  readonly steps: readonly AgentStep[];
  /** Tokens as they stream in. Replaced by the validated answer once the turn finishes. */
  readonly draft: string;
  readonly result?: AnswerResult;
  readonly error?: string;
  readonly status: TurnStatus;
}

export function newTurn(id: string, question: string): Turn {
  return { id, question, steps: [], draft: "", status: "running" };
}

/**
 * Fold one agent event into a turn, returning a new turn.
 *
 * Note "thinking" steps are collapsed rather than appended: the agent emits one before
 * every model call, and a list with four identical "thinking" rows tells the user nothing
 * that one row does not.
 */
export function applyEvent(turn: Turn, event: AgentEvent): Turn {
  switch (event.type) {
    case "thinking": {
      const last = turn.steps.at(-1);
      if (last?.kind === "thinking") return turn;
      return { ...turn, steps: [...turn.steps, { kind: "thinking" }] };
    }

    case "search_start": {
      // Drop a trailing "thinking" placeholder — the decision it represented is now known.
      const steps = turn.steps.at(-1)?.kind === "thinking" ? turn.steps.slice(0, -1) : turn.steps;
      return {
        ...turn,
        steps: [...steps, { kind: "search", query: event.query, hits: 0, labels: [], done: false }],
      };
    }

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
            labels: event.labels,
            done: true,
          };
          break;
        }
      }
      return { ...turn, steps };
    }

    case "list_documents":
      return { ...turn, steps: [...turn.steps, { kind: "list", documents: event.documents }] };

    case "token":
      return { ...turn, draft: turn.draft + event.text };

    case "done":
      return {
        ...turn,
        status: "done",
        result: event.result,
        steps: turn.steps.filter((step) => step.kind !== "thinking"),
      };

    case "error":
      return { ...turn, status: "error", error: event.message };

    default:
      return turn;
  }
}
