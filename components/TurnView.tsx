"use client";

// One question and everything that came of it.
//
// The three outcomes are styled to look genuinely different, because they mean different
// things and should be distinguishable at a glance:
//   - a grounded answer: an elevated card with citations and its evidence
//   - a refusal: SUCCESS, not failure. Calm amber, serif, stated plainly
//   - an error: the system broke, which is not the document's fault

import { useState } from "react";

import { AgentTrace } from "./AgentTrace";
import { AnswerBody } from "./AnswerBody";
import { SourceList } from "./SourceList";
import type { Turn } from "@/lib/client/conversation";

interface TurnViewProps {
  readonly turn: Turn;
}

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; silently leaving the label unchanged is the
      // honest outcome, since claiming "Copied" when nothing was copied is worse.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-ink-faint
                 transition-colors hover:bg-hover hover:text-ink-soft"
      aria-label="Copy answer"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2.5" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function TurnView({ turn }: TurnViewProps) {
  const [focusedSource, setFocusedSource] = useState<number | undefined>();

  const result = turn.result;
  const showDraft = turn.status === "running" && turn.draft.length > 0;

  return (
    <article className="animate-rise space-y-3.5">
      <div className="flex justify-end">
        <p
          className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px]
                     text-white shadow-accent"
        >
          {turn.question}
        </p>
      </div>

      <div className="space-y-3.5">
        <AgentTrace steps={turn.steps} running={turn.status === "running"} />

        {showDraft && (
          <div className="rounded-2xl rounded-bl-md bg-surface p-5 shadow-mid ring-1 ring-edge">
            <AnswerBody text={turn.draft} sources={[]} streaming />
          </div>
        )}

        {turn.status === "error" && (
          <div
            role="alert"
            className="rounded-2xl rounded-bl-md bg-danger-soft p-4 ring-1 ring-danger-edge"
          >
            <p className="text-[13px] font-bold text-danger">Something went wrong</p>
            <p className="mt-1 text-[14px] text-ink-soft">{turn.error}</p>
          </div>
        )}

        {result?.refused && (
          <div className="rounded-2xl rounded-bl-md bg-warn-soft p-5 ring-1 ring-warn-edge">
            <p className="font-serif text-xl leading-snug text-ink">{result.answer}</p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">
              The agent searched{" "}
              <span className="font-bold text-warn">
                {result.traces.length === 1 ? "once" : `${result.traces.length} times`}
              </span>{" "}
              and found nothing that answers this, so it declined to guess.
            </p>
          </div>
        )}

        {result && !result.refused && (
          <div className="rounded-2xl rounded-bl-md bg-surface p-5 shadow-mid ring-1 ring-edge">
            <AnswerBody
              text={result.answer}
              sources={result.sources}
              onCitationClick={setFocusedSource}
            />

            {result.invalidCitations.length > 0 && (
              <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn ring-1 ring-warn-edge">
                Removed {result.invalidCitations.length} citation
                {result.invalidCitations.length === 1 ? "" : "s"} pointing at nothing
                retrieved. The guard caught it before you saw it.
              </p>
            )}

            <SourceList sources={result.sources} focused={focusedSource} />

            <div className="-mb-1 -ml-2 mt-2 flex items-center">
              <CopyButton text={result.answer} />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
