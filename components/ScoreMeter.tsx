"use client";

// How well a passage matched the query, shown as a number you can read and a bar you
// can skim.
//
// A bare "0.76" in a corner means nothing to someone seeing this for the first time. Two
// things fix that: a word ("match"), and a bar whose colour encodes the band. Weak
// retrieval should be visible without doing arithmetic — that is the whole point of
// surfacing the score at all, since a confident answer built on 0.31 matches is exactly
// the case a reader should be suspicious of.

/** Cosine similarity is in [-1, 1] but retrieval hits realistically land in [0.3, 0.9]. */
const FLOOR = 0.3;
const CEILING = 0.9;

export type ScoreBand = "strong" | "medium" | "weak";

export function bandOf(score: number): ScoreBand {
  if (score >= 0.7) return "strong";
  if (score >= 0.55) return "medium";
  return "weak";
}

const BAND_BAR: Record<ScoreBand, string> = {
  strong: "bg-strong",
  medium: "bg-medium",
  weak: "bg-weak",
};

const BAND_TEXT: Record<ScoreBand, string> = {
  strong: "text-strong",
  medium: "text-medium",
  weak: "text-weak",
};

const BAND_WORD: Record<ScoreBand, string> = {
  strong: "strong match",
  medium: "partial match",
  weak: "weak match",
};

/** Map the useful part of the range onto the full width of the bar. */
function fillPercent(score: number): number {
  const clamped = Math.min(Math.max(score, FLOOR), CEILING);
  return ((clamped - FLOOR) / (CEILING - FLOOR)) * 100;
}

interface ScoreMeterProps {
  readonly score: number;
  /** "full" labels the band in words; "compact" is just the number and bar. */
  readonly variant?: "full" | "compact";
}

export function ScoreMeter({ score, variant = "compact" }: ScoreMeterProps) {
  const band = bandOf(score);

  return (
    <span
      className="inline-flex items-center gap-2"
      title={`Cosine similarity to the search query: ${score.toFixed(3)} (${BAND_WORD[band]})`}
    >
      {variant === "full" && (
        <span className="t-meta text-ink-faint">{BAND_WORD[band]}</span>
      )}

      <span
        aria-hidden
        className="relative h-1 w-10 overflow-hidden rounded-full bg-edge-strong"
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${BAND_BAR[band]}`}
          style={{ width: `${fillPercent(score)}%` }}
        />
      </span>

      <span className={`t-meta tabular-nums ${BAND_TEXT[band]}`}>{score.toFixed(2)}</span>

      <span className="sr-only">
        match score {score.toFixed(2)} out of 1, {BAND_WORD[band]}
      </span>
    </span>
  );
}
