"use client";

// One question and everything that came of it.
//
// Three outcomes, styled to be told apart instantly, because they mean different things:
//
//   grounded  — an answer with citations and its evidence
//   refused   — the system working CORRECTLY. Framed as a verdict, with the work it did
//               to reach that verdict shown as justification. Never red, never an icon
//               that means failure.
//   error     — the system actually broke. Not the document's fault.
//
// The refusal treatment is the one that matters most for a first-time viewer: if it looks
// like a failure they will read it as the app being bad at its job, when it is the single
// behaviour the project exists to demonstrate.

import { useState } from "react";

import { AnswerBody } from "./AnswerBody";
import { AnswerMetrics } from "./AnswerMetrics";
import { SearchTrace } from "./SearchTrace";
import { SourceList } from "./SourceList";
import { searchCount, totalPassages, type Turn } from "@/lib/client/conversation";

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
      // Clipboard access can be denied. Leaving the label unchanged is the honest
      // outcome; claiming "Copied" when nothing was copied is worse than silence.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="t-meta flex items-center gap-1.5 rounded px-1.5 py-1 text-ink-faint
                 transition-colors hover:bg-hover hover:text-ink-soft"
      aria-label="Copy answer"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2.5" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? "copied" : "copy"}
    </button>
  );
}

export function TurnView({ turn }: TurnViewProps) {
  const [focusedSource, setFocusedSource] = useState<number | undefined>();

  const result = turn.result;
  const showDraft = turn.status === "running" && turn.draft.length > 0;
  const searches = searchCount(turn);
  const passages = totalPassages(turn);

  return (
    <article className="animate-rise space-y-3">
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-lg rounded-br-sm bg-raised px-4 py-2.5 font-serif
                      text-[17px] leading-snug text-ink ring-1 ring-edge">
          {turn.question}
        </p>
      </div>

      <SearchTrace steps={turn.steps} phase={turn.phase} />

      {showDraft && (
        <div className="rounded-lg border border-edge bg-surface p-5">
          <AnswerBody text={turn.draft} sources={[]} streaming />
        </div>
      )}

      {turn.status === "error" && (
        <div role="alert" className="rounded-lg border border-danger-edge bg-danger-soft p-4">
          <p className="t-label text-danger">System error</p>
          <p className="t-body mt-1.5 text-ink-soft">{turn.error}</p>
        </div>
      )}

      {result?.refused && (
        <div className="overflow-hidden rounded-lg border border-verdict-edge bg-surface">
          <div className="flex items-center gap-2 border-b border-verdict-edge bg-verdict-soft px-4 py-2">
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 text-verdict" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 5v3.5" strokeLinecap="round" />
              <path d="M8 11h.01" strokeLinecap="round" />
            </svg>
            <span className="t-label text-verdict">Refused — insufficient grounding</span>
          </div>

          <div className="p-5">
            <p className="font-serif text-[21px] leading-snug text-ink">{result.answer}</p>

            <p className="t-body mt-3 text-ink-soft">
              The agent ran{" "}
              <span className="font-mono text-[13px] text-verdict">
                {searches} search{searches === 1 ? "" : "es"}
              </span>{" "}
              and read{" "}
              <span className="font-mono text-[13px] text-verdict">{passages} passages</span>,
              none of which supported an answer. Rather than assemble a plausible one, it
              declined.
            </p>

            <p className="t-meta mt-3 border-t border-edge pt-3 text-ink-faint">
              This is the intended behaviour. An answer with no evidence behind it is the
              failure mode this system exists to prevent.
            </p>

            <AnswerMetrics result={result} passagesRead={passages} />
          </div>
        </div>
      )}

      {result && !result.refused && (
        <div className="rounded-lg border border-edge bg-surface p-5">
          <AnswerBody
            text={result.answer}
            sources={result.sources}
            onCitationClick={setFocusedSource}
          />

          {result.invalidCitations.length > 0 && (
            <p className="t-meta mt-4 rounded border border-verdict-edge bg-verdict-soft
                          px-3 py-2 text-verdict">
              Stripped {result.invalidCitations.length} fabricated citation
              {result.invalidCitations.length === 1 ? "" : "s"} pointing at nothing
              retrieved. The validator caught it before display.
            </p>
          )}

          <SourceList sources={result.sources} focused={focusedSource} />

          <div className="-ml-1.5 mt-3 flex items-center">
            <CopyButton text={result.answer} />
          </div>

          <AnswerMetrics result={result} passagesRead={passages} />
        </div>
      )}
    </article>
  );
}
