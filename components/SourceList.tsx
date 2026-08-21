"use client";

// The passages an answer actually cites.
//
// Everything listed here was cited: the server strips uncited passages before they reach
// the browser, because listing all retrieved text would imply the answer rests on more
// evidence than it does.
//
// The score is labelled and metered rather than printed bare, so a reader can tell
// whether a confident-sounding answer is standing on strong evidence or thin evidence.

import { useEffect, useRef, useState } from "react";

import { ScoreMeter } from "./ScoreMeter";
import type { SourceRef } from "@/lib/types";

interface SourceListProps {
  readonly sources: readonly SourceRef[];
  /** Citation number to reveal and highlight, set when a chip in the answer is clicked. */
  readonly focused?: number;
}

/**
 * Tidy a raw chunk for display.
 *
 * Chunks are stored exactly as indexed, markdown and all, because the embedding and the
 * model should see the real text. Rendering "## Parental Leave" verbatim looks like a
 * bug, so the markers are stripped at display time only.
 */
function readable(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

export function SourceList({ sources, focused }: SourceListProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // A citation click must open the panel, not silently scroll a collapsed one.
  useEffect(() => {
    if (focused !== undefined) setOpen(true);
  }, [focused]);

  useEffect(() => {
    if (!open || focused === undefined) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-source="${focused}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open, focused]);

  if (sources.length === 0) return null;

  return (
    <div className="mt-5 border-t border-edge pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 text-left"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={`size-3 text-ink-faint transition-transform duration-300 ${open ? "" : "-rotate-90"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6.5 8 10.5 12 6.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <span className="t-label transition-colors group-hover:text-ink-soft">
          Evidence · {sources.length} cited passage{sources.length === 1 ? "" : "s"}
        </span>

        <span aria-hidden className="ml-auto flex -space-x-1">
          {sources.slice(0, 5).map((source) => (
            <span
              key={source.n}
              className="flex size-4 items-center justify-center rounded border border-edge
                         bg-accent-soft font-mono text-[9px] font-bold text-accent"
            >
              {source.n}
            </span>
          ))}
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <ul ref={listRef} className="mt-3 space-y-2">
            {sources.map((source) => (
              <li
                key={source.n}
                data-source={source.n}
                className={`rounded-lg border p-3 transition-colors duration-300 ${
                  focused === source.n
                    ? "border-accent-edge bg-accent-soft"
                    : "border-edge bg-raised"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="flex size-4 shrink-0 items-center justify-center rounded
                               bg-accent-soft font-mono text-[9.5px] font-bold text-accent"
                  >
                    {source.n}
                  </span>
                  <span className="t-meta truncate text-ink">{source.label}</span>
                  <span className="ml-auto shrink-0">
                    <ScoreMeter score={source.score} variant="full" />
                  </span>
                </div>
                <p className="font-serif text-[15px] leading-relaxed text-ink-soft">
                  {readable(source.text)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
