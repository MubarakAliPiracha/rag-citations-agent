"use client";

// The agent's reasoning, shown as it happens.
//
// This is what makes the agent legible. A chain has nothing to show — it always does the
// same thing — whereas here the number of searches, the wording the model chose, and how
// many passages came back are all decisions it made. Surfacing them turns "trust me" into
// "watch me", and it is the most convincing part of the demo: three failed searches
// followed by an honest refusal reads very differently from a bare "I don't know".
//
// Styled as a quiet margin note rather than a card. It is supporting evidence for the
// answer, and giving it equal visual weight would compete with the answer itself.

import type { AgentStep } from "@/lib/client/conversation";

interface AgentTraceProps {
  readonly steps: readonly AgentStep[];
  readonly running: boolean;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 4h9M5 8h9M5 12h9M2 4h.01M2 8h.01M2 12h.01" strokeLinecap="round" />
    </svg>
  );
}

export function AgentTrace({ steps, running }: AgentTraceProps) {
  if (steps.length === 0 && !running) return null;

  return (
    <ol
      aria-label="Agent steps"
      aria-live="polite"
      className="space-y-2 border-l-2 border-edge py-0.5 pl-3.5 text-[12.5px] text-ink-soft"
    >
      {steps.map((step, i) => {
        if (step.kind === "thinking") {
          return (
            <li key={i} className="animate-rise flex items-center gap-2 text-ink-faint">
              <span aria-hidden className="flex gap-[3px]">
                <span className="dot-1 size-1 rounded-full bg-current" />
                <span className="dot-2 size-1 rounded-full bg-current" />
                <span className="dot-3 size-1 rounded-full bg-current" />
              </span>
              <span className="italic">deciding what to do next</span>
            </li>
          );
        }

        if (step.kind === "list") {
          return (
            <li key={i} className="animate-rise flex items-start gap-2">
              <span className="mt-[3px] text-accent">
                <ListIcon />
              </span>
              <span>
                listed documents:{" "}
                <span className="font-mono text-[11.5px] text-ink">
                  {step.documents.join(", ")}
                </span>
              </span>
            </li>
          );
        }

        return (
          <li key={i} className="animate-rise flex items-start gap-2">
            <span
              className={`mt-[3px] shrink-0 ${step.done ? "text-accent" : "text-ink-faint animate-pulse-soft"}`}
            >
              <SearchIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink-faint">searched </span>
              <span className="font-medium break-words text-ink">“{step.query}”</span>
              {step.done ? (
                <span className="text-ink-faint">
                  {" "}
                  → <span className="tabular-nums">{step.hits}</span> passage
                  {step.hits === 1 ? "" : "s"}
                  {step.labels.length > 0 && (
                    <span className="font-mono text-[11px]"> · {summarise(step.labels)}</span>
                  )}
                </span>
              ) : (
                <span className="text-ink-faint"> …</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Condense the pages a search touched into something scannable.
 *
 * A top-5 search usually spans five distinct pages, and printing all of them buries the
 * part that matters — the query the agent chose — under a wall of filenames.
 */
function summarise(labels: readonly string[]): string {
  const pages = [...new Set(labels.map((label) => label.replace(/^.*\sp\./, "p.")))];
  if (pages.length <= 4) return pages.join(", ");

  return `${pages.slice(0, 4).join(", ")} +${pages.length - 4}`;
}
