"use client";

// The evidence behind an answer.
//
// Collapsed by default so the answer itself stays the focus, but the count is always
// visible — "2 sources" is a claim the UI makes up front, and expanding is how you check
// it. Clicking a citation chip in the answer opens the panel and highlights that source,
// so verification is one click from any individual claim.
//
// Everything listed here was actually cited: the server strips uncited passages before
// they reach the browser, because listing all retrieved text would imply the answer rests
// on more evidence than it does.

import { useEffect, useRef, useState } from "react";

import type { SourceRef } from "@/lib/types";

interface SourceListProps {
  readonly sources: readonly SourceRef[];
  /** Citation number to reveal and flash, set when a chip in the answer is clicked. */
  readonly focused?: number;
}

/**
 * Tidy a raw chunk for display.
 *
 * Chunks are stored exactly as they were indexed, markdown syntax and all, because the
 * embedding and the model should see the real text. But rendering "## Parental Leave"
 * verbatim in a preview looks like a bug, so the markers are stripped at display time
 * only — the stored passage is untouched.
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

  // A citation click should open the panel, not silently scroll a collapsed one.
  useEffect(() => {
    if (focused !== undefined) setOpen(true);
  }, [focused]);

  useEffect(() => {
    if (!open || focused === undefined) return;

    const target = listRef.current?.querySelector<HTMLElement>(`[data-source="${focused}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open, focused]);

  if (sources.length === 0) return null;

  return (
    <div className="mt-4 border-t border-edge pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="group flex items-center gap-2 rounded-lg py-1 pr-2 text-left transition-colors"
      >
        {/* Stacked page markers — a glanceable count before anything is expanded. */}
        <span aria-hidden className="flex -space-x-1.5">
          {sources.slice(0, 4).map((source) => (
            <span
              key={source.n}
              className="flex size-5 items-center justify-center rounded-full bg-accent-soft
                         font-mono text-[10px] font-bold text-accent-ink
                         ring-2 ring-surface"
            >
              {source.n}
            </span>
          ))}
        </span>

        <span className="text-[13px] font-bold text-ink-soft transition-colors group-hover:text-ink">
          {sources.length} source{sources.length === 1 ? "" : "s"}
        </span>

        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={`size-3.5 text-ink-faint transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 6.5 8 10.5 12 6.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/*
        The 0fr → 1fr grid trick animates to the content's natural height, which a
        max-height transition cannot do without guessing a magic number.
      */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <ul ref={listRef} className="mt-2 space-y-2">
            {sources.map((source) => (
              <li
                key={source.n}
                data-source={source.n}
                className={`rounded-xl p-3 text-[13px] transition-all duration-300 ${
                  focused === source.n
                    ? "bg-accent-soft ring-1 ring-accent-edge"
                    : "bg-surface-sunk ring-1 ring-edge"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full
                               bg-accent-soft font-mono text-[10px] font-bold text-accent-ink"
                  >
                    {source.n}
                  </span>
                  <span className="font-mono text-[11.5px] font-bold text-ink">
                    {source.label}
                  </span>
                  <span
                    className="ml-auto font-mono text-[10.5px] tabular-nums text-ink-faint"
                    title="Similarity to the search query"
                  >
                    {source.score.toFixed(2)}
                  </span>
                </div>
                <p className="leading-relaxed text-ink-soft">{readable(source.text)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
