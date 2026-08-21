// The reducer that turns a stream of agent events into what the user sees.

import { describe, expect, it } from "vitest";

import { applyEvent, newTurn, type Turn } from "@/lib/client/conversation";
import type { AgentEvent, AnswerResult } from "@/lib/agent";

function fold(events: readonly AgentEvent[]): Turn {
  return events.reduce(applyEvent, newTurn("t1", "a question"));
}

const doneResult: AnswerResult = {
  answer: "Grounded answer [1].",
  sources: [{ n: 1, label: "handbook.pdf p.1", text: "passage", score: 0.8 }],
  refused: false,
  invalidCitations: [],
  traces: [],
  latencyMs: 1234,
};

describe("applyEvent", () => {
  it("should start a turn in the running state with nothing to show", () => {
    const turn = newTurn("t1", "a question");

    expect(turn.status).toBe("running");
    expect(turn.steps).toEqual([]);
    expect(turn.draft).toBe("");
  });

  it("should treat thinking as a phase rather than a visible step", () => {
    // The agent emits one before every model call. Rendering each as a row told the user
    // nothing; what they need is which ACTIVITY is happening.
    const turn = fold([{ type: "thinking" }, { type: "thinking" }, { type: "thinking" }]);

    expect(turn.steps).toEqual([]);
    expect(turn.phase).toBe("deciding");
  });

  it("should report the searching phase while a search is in flight", () => {
    const turn = fold([{ type: "thinking" }, { type: "search_start", query: "vacation" }]);

    expect(turn.phase).toBe("searching");
    expect(turn.steps).toHaveLength(1);
    expect(turn.steps[0]).toMatchObject({ kind: "search", query: "vacation", done: false });
  });

  it("should report the generating phase once answer tokens start arriving", () => {
    // Searching and generating are distinct activities and the UI shows them as such.
    const turn = fold([
      { type: "search_start", query: "vacation" },
      { type: "search_end", query: "vacation", hits: 3, passages: [] },
      { type: "token", text: "Employees" },
    ]);

    expect(turn.phase).toBe("generating");
  });

  it("should not fall back to deciding once the answer is being written", () => {
    // A late model-call event must not drag the UI back to "deciding" mid-answer.
    const turn = fold([
      { type: "token", text: "Employees get" },
      { type: "thinking" },
    ]);

    expect(turn.phase).toBe("generating");
  });

  it("should carry retrieved passages and their scores onto the completed search", () => {
    const turn = fold([
      { type: "search_start", query: "vacation" },
      {
        type: "search_end",
        query: "vacation",
        hits: 1,
        passages: [{ n: 1, label: "handbook.pdf p.4", score: 0.72 }],
      },
    ]);

    expect(turn.steps[0]).toMatchObject({
      kind: "search",
      done: true,
      passages: [{ n: 1, label: "handbook.pdf p.4", score: 0.72 }],
    });
  });

  it("should complete a search when its results arrive", () => {
    const turn = fold([
      { type: "search_start", query: "vacation" },
      { type: "search_end", query: "vacation", hits: 3, passages: [{ n: 1, label: "handbook.pdf p.4", score: 0.72 }] },
    ]);

    expect(turn.steps[0]).toMatchObject({ kind: "search", hits: 3, done: true });
  });

  it("should track two searches independently for a multi-hop question", () => {
    const turn = fold([
      { type: "search_start", query: "parental leave" },
      { type: "search_end", query: "parental leave", hits: 5, passages: [] },
      { type: "search_start", query: "vacation policy" },
      { type: "search_end", query: "vacation policy", hits: 5, passages: [] },
    ]);

    expect(turn.steps).toHaveLength(2);
    expect(turn.steps.every((step) => step.kind === "search" && step.done)).toBe(true);
  });

  it("should complete the oldest unfinished search when results overlap", () => {
    const turn = fold([
      { type: "search_start", query: "first" },
      { type: "search_start", query: "second" },
      { type: "search_end", query: "second", hits: 2, passages: [] },
    ]);

    const [first, second] = turn.steps;
    expect(first).toMatchObject({ query: "first", done: false });
    expect(second).toMatchObject({ query: "second", done: true, hits: 2 });
  });

  it("should accumulate streamed tokens into the draft", () => {
    const turn = fold([
      { type: "token", text: "Hello" },
      { type: "token", text: " world" },
    ]);

    expect(turn.draft).toBe("Hello world");
  });

  it("should finish the turn and return to idle on done", () => {
    const turn = fold([
      { type: "search_start", query: "q" },
      { type: "search_end", query: "q", hits: 1, passages: [] },
      { type: "done", result: doneResult },
    ]);

    expect(turn.status).toBe("done");
    expect(turn.phase).toBe("idle");
    expect(turn.result).toEqual(doneResult);
  });

  it("should record an error without discarding the steps already shown", () => {
    const turn = fold([
      { type: "search_start", query: "q" },
      { type: "search_end", query: "q", hits: 1, passages: [] },
      { type: "error", message: "Rate limited." },
    ]);

    expect(turn.status).toBe("error");
    expect(turn.error).toBe("Rate limited.");
    expect(turn.steps).toHaveLength(1);
  });

  it("should record a list_documents step", () => {
    const turn = fold([{ type: "list_documents", documents: ["a.pdf", "b.pdf"] }]);

    expect(turn.steps[0]).toEqual({ kind: "list", documents: ["a.pdf", "b.pdf"] });
  });

  it("should never mutate the turn it was given", () => {
    const before = newTurn("t1", "q");

    applyEvent(before, { type: "token", text: "x" });

    expect(before.draft).toBe("");
  });
});
