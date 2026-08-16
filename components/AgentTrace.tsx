"use client";

// The agent's reasoning, shown as it happens.
//
// This is the component that makes the agent legible. A chain has nothing to show — it
// always does the same thing — whereas here the number of searches, the wording the model
// chose, and how many passages came back are all decisions it made. Surfacing them is
// what turns "trust me" into "watch me", and it is the most convincing part of the demo:
// three failed searches followed by an honest refusal reads very differently from a bare
// "I don't know".

import type { AgentStep } from "@/lib/client/conversation";

interface AgentTraceProps {
  readonly steps: readonly AgentStep[];
  readonly running: boolean;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
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
      className="space-y-1.5 rounded-lg border border-edge bg-canvas/60 p-3 text-xs text-ink-soft"
    >
      {steps.map((step, i) => {
        if (step.kind === "thinking") {
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-ink-faint animate-pulse-soft" />
              <span className="italic">Deciding what to do next…</span>
            </li>
          );
        }

        if (step.kind === "list") {
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-accent">
                <ListIcon />
              </span>
              <span>
                Checked what documents are available:{" "}
                <span className="font-medium text-ink">{step.documents.join(", ")}</span>
              </span>
            </li>
          );
        }

        return (
          <li key={i} className="flex items-start gap-2">
            <span className={`mt-0.5 ${step.done ? "text-accent" : "text-ink-faint animate-pulse-soft"}`}>
              <SearchIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink-soft">searched </span>
              <span className="font-medium text-ink break-words">“{step.query}”</span>
              {step.done ? (
                <span className="text-ink-faint">
                  {" "}
                  → {step.hits} passage{step.hits === 1 ? "" : "s"}
                  {step.labels.length > 0 && (
                    <span className="text-ink-faint"> ({summarise(step.labels)})</span>
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
 * part that matters — the query the agent chose — in a wall of filenames.
 */
function summarise(labels: readonly string[]): string {
  const unique = [...new Set(labels)];
  if (unique.length <= 3) return unique.join(", ");

  return `${unique.slice(0, 3).join(", ")} +${unique.length - 3} more`;
}
