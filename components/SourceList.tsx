"use client";

// The evidence behind an answer.
//
// Every source shown here was actually cited — the server strips uncited passages before
// they reach the browser. That matters: listing everything retrieved would imply the
// answer rests on more evidence than it does.

import { useEffect, useRef } from "react";

import type { SourceRef } from "@/lib/types";

interface SourceListProps {
  readonly sources: readonly SourceRef[];
  /** Citation number to scroll to and flash, set when a chip in the answer is clicked. */
  readonly focused?: number;
}

export function SourceList({ sources, focused }: SourceListProps) {
  const containerRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (focused === undefined) return;

    const target = containerRef.current?.querySelector<HTMLElement>(`[data-source="${focused}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focused]);

  if (sources.length === 0) return null;

  return (
    <div className="mt-3">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
        Sources
      </h3>
      <ul ref={containerRef} className="space-y-1.5">
        {sources.map((source) => (
          <li
            key={source.n}
            data-source={source.n}
            className={`rounded-lg border p-2.5 text-xs transition-colors ${
              focused === source.n
                ? "border-accent bg-accent-soft"
                : "border-edge bg-canvas/60"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full
                           bg-accent-soft text-[11px] font-bold text-accent-ink"
              >
                {source.n}
              </span>
              <span className="font-bold text-ink">{source.label}</span>
              <span className="ml-auto tabular-nums text-ink-faint" title="Similarity to the query">
                {source.score.toFixed(2)}
              </span>
            </div>
            <p className="line-clamp-4 leading-relaxed text-ink-soft">{source.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
