"use client";

// What the agent decided to do.
//
// This is the most distinctive thing the app does and it is treated as primary content,
// not as a debug line. A chain has nothing to show here — it always retrieves once, the
// same way. Everything in this panel is a choice the model made: that it should search at
// all, the wording it invented, whether one search was enough, and when to stop.
//
// So the query is the largest thing in each row. The passages under it are evidence for
// how that particular wording performed, scored so a weak retrieval is obvious. Read top
// to bottom it is a legible account of the agent's reasoning.

import { useState } from "react";

import { ScoreMeter } from "./ScoreMeter";
import type { AgentStep, Phase } from "@/lib/client/conversation";

interface SearchTraceProps {
  readonly steps: readonly AgentStep[];
  readonly phase: Phase;
}

function ChevronIcon({ open }: { readonly open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`size-3 transition-transform duration-300 ${open ? "" : "-rotate-90"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 6.5 8 10.5 12 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The live status line: which of the three activities is happening right now. */
function PhaseIndicator({ phase }: { readonly phase: Phase }) {
  if (phase === "idle") return null;

  const copy: Record<Exclude<Phase, "idle">, string> = {
    deciding: "deciding what to do next",
    searching: "searching the document",
    generating: "writing the answer",
  };

  return (
    <span className="t-meta inline-flex items-center gap-1.5 text-accent">
      <span aria-hidden className="flex gap-[3px]">
        <span className="dot-1 size-1 rounded-full bg-current" />
        <span className="dot-2 size-1 rounded-full bg-current" />
        <span className="dot-3 size-1 rounded-full bg-current" />
      </span>
      {copy[phase]}
    </span>
  );
}

export function SearchTrace({ steps, phase }: SearchTraceProps) {
  const [open, setOpen] = useState(true);

  const searches = steps.filter((step) => step.kind === "search");
  const passageCount = searches.reduce((sum, step) => sum + step.hits, 0);

  if (steps.length === 0 && phase === "idle") return null;

  return (
    <section
      aria-label="Agent retrieval steps"
      className="overflow-hidden rounded-lg border border-edge bg-surface"
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex items-center gap-2 text-ink-faint transition-colors hover:text-ink-soft"
        >
          <ChevronIcon open={open} />
          <span className="t-label">Agent retrieval</span>
        </button>

        <span className="ml-auto">
          {phase !== "idle" ? (
            <PhaseIndicator phase={phase} />
          ) : (
            <span className="t-meta text-ink-faint tabular-nums">
              {searches.length} search{searches.length === 1 ? "" : "es"} · {passageCount} passage
              {passageCount === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>

      {/* 0fr → 1fr animates to the content's natural height, which max-height cannot do
          without guessing a magic number. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <ol className="border-t border-edge">
            {steps.map((step, i) =>
              step.kind === "list" ? (
                <li key={i} className="animate-rise border-b border-edge/60 px-3 py-2.5 last:border-0">
                  <p className="t-meta text-ink-soft">
                    listed available documents:{" "}
                    <span className="text-ink">{step.documents.join(", ")}</span>
                  </p>
                </li>
              ) : (
                <SearchRow
                  key={i}
                  step={step}
                  ordinal={searches.indexOf(step) + 1}
                />
              ),
            )}
          </ol>
        </div>
      </div>
    </section>
  );
}

interface SearchRowProps {
  readonly step: Extract<AgentStep, { kind: "search" }>;
  readonly ordinal: number;
}

function SearchRow({ step, ordinal }: SearchRowProps) {
  return (
    <li className="animate-rise border-b border-edge/60 px-3 py-3 last:border-0">
      <div className="flex items-baseline gap-2.5">
        <span className="t-meta shrink-0 tabular-nums text-ink-faint">
          {String(ordinal).padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1">
          <p className="t-label mb-1">Query the agent wrote</p>

          {/* The query is the largest element in the row on purpose — it is the decision. */}
          <p className="font-mono text-[13.5px] leading-snug break-words text-ink">
            {step.query}
          </p>

          {!step.done ? (
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-edge">
              <div className="animate-sweep h-full w-1/4 rounded-full bg-accent" />
            </div>
          ) : step.passages.length === 0 ? (
            <p className="t-meta mt-2 text-weak">no passages matched</p>
          ) : (
            <ul className="mt-2.5 space-y-1">
              {step.passages.map((passage) => (
                <li key={passage.n} className="flex items-center gap-2.5">
                  <span
                    className="flex size-4 shrink-0 items-center justify-center rounded
                               bg-accent-soft font-mono text-[9.5px] font-bold text-accent"
                  >
                    {passage.n}
                  </span>
                  <span className="t-meta min-w-0 flex-1 truncate text-ink-soft">
                    {passage.label}
                  </span>
                  <ScoreMeter score={passage.score} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
