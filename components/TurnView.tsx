"use client";

// One question and everything that came of it.
//
// The three outcomes are styled to look genuinely different, because they mean different
// things and a user should be able to tell them apart at a glance:
//   - a grounded answer, with citation chips and its evidence
//   - a refusal, which is a SUCCESS and is styled as a calm, deliberate statement
//   - an error, which is a failure of the system rather than of the documents

import { useState } from "react";

import { AgentTrace } from "./AgentTrace";
import { AnswerBody } from "./AnswerBody";
import { SourceList } from "./SourceList";
import type { Turn } from "@/lib/client/conversation";

interface TurnViewProps {
  readonly turn: Turn;
}

export function TurnView({ turn }: TurnViewProps) {
  const [focusedSource, setFocusedSource] = useState<number | undefined>();

  const result = turn.result;
  const showDraft = turn.status === "running" && turn.draft.length > 0;

  return (
    <article className="space-y-3">
      <div className="flex justify-end">
        <p
          className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-white
                     shadow-sm"
        >
          {turn.question}
        </p>
      </div>

      <div className="max-w-[95%] space-y-3">
        <AgentTrace steps={turn.steps} running={turn.status === "running"} />

        {showDraft && (
          <div className="rounded-2xl rounded-bl-sm border border-edge bg-surface p-4 shadow-sm">
            <AnswerBody text={turn.draft} sources={[]} streaming />
          </div>
        )}

        {turn.status === "error" && (
          <div
            role="alert"
            className="rounded-2xl rounded-bl-sm border border-danger/40 bg-danger-soft p-4"
          >
            <p className="text-sm font-bold text-danger">Something went wrong</p>
            <p className="mt-1 text-sm text-ink-soft">{turn.error}</p>
          </div>
        )}

        {result?.refused && (
          <div className="rounded-2xl rounded-bl-sm border border-warn/40 bg-warn-soft p-4">
            <p className="font-serif text-lg text-ink">{result.answer}</p>
            <p className="mt-2 text-xs text-ink-soft">
              The agent searched
              {" "}
              {result.traces.length === 1 ? "once" : `${result.traces.length} times`} and found
              nothing that answers this, so it declined to guess.
            </p>
          </div>
        )}

        {result && !result.refused && (
          <div className="rounded-2xl rounded-bl-sm border border-edge bg-surface p-4 shadow-sm">
            <AnswerBody
              text={result.answer}
              sources={result.sources}
              onCitationClick={setFocusedSource}
            />

            {result.invalidCitations.length > 0 && (
              <p className="mt-3 rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
                Removed {result.invalidCitations.length} citation
                {result.invalidCitations.length === 1 ? "" : "s"} that pointed at nothing
                retrieved. The guard caught it before you saw it.
              </p>
            )}

            <SourceList sources={result.sources} focused={focusedSource} />
          </div>
        )}
      </div>
    </article>
  );
}
