"use client";

// The instrument reading under an answer.
//
// Everything here is a measurement, so it is all mono — the same split the rest of the
// app uses to separate what the model wrote from what the system counted.
//
// The scores are the point. An answer with citations looks equally authoritative whether
// its evidence matched at 0.85 or at 0.52, and the only way a reader can tell the
// difference is if the number is on screen. The link to /evals is what turns a single
// reading into a claim you can check: these are this answer's numbers, and there are the
// numbers across all 40 questions.

import Link from "next/link";

import { bandOf } from "./ScoreMeter";
import type { AnswerResult } from "@/lib/agent";

const BAND_TEXT = {
  strong: "text-strong",
  medium: "text-medium",
  weak: "text-weak",
} as const;

/** Sub-second latencies read better in milliseconds; anything longer reads better in seconds. */
function formatLatency(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

interface AnswerMetricsProps {
  readonly result: AnswerResult;
  /** How many passages the agent read, used when an answer cites none of them. */
  readonly passagesRead: number;
}

export function AnswerMetrics({ result, passagesRead }: AnswerMetricsProps) {
  const cited = result.sources;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-edge pt-2.5">
      <span className="t-meta text-ink-faint" title="Server-side time for the whole agent run">
        {formatLatency(result.latencyMs)}
      </span>

      {result.usage && (
        <span
          className="t-meta text-ink-faint"
          title={`${result.usage.inputTokens} in / ${result.usage.outputTokens} out across ${result.usage.modelCalls} model calls`}
        >
          {result.usage.totalTokens.toLocaleString()} tok
        </span>
      )}

      {cited.length > 0 ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="t-meta text-ink-faint">match</span>
          {cited.map((source) => (
            <span
              key={source.n}
              className={`t-meta tabular-nums ${BAND_TEXT[bandOf(source.score)]}`}
              title={`[${source.n}] ${source.label} — cosine similarity ${source.score.toFixed(3)}`}
            >
              [{source.n}]&nbsp;{source.score.toFixed(2)}
            </span>
          ))}
        </span>
      ) : (
        <span className="t-meta text-ink-faint">
          {passagesRead} passage{passagesRead === 1 ? "" : "s"} read · 0 cited
        </span>
      )}

      <Link
        href="/evals"
        className="t-meta ml-auto text-ink-faint transition-colors hover:text-accent"
        title="How the agent scores across the full 40-question eval set"
      >
        evals →
      </Link>
    </div>
  );
}
