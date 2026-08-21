// The shape of what the eval harness wrote, plus the helpers for displaying it.
//
// Deliberately free of any Node import. The dashboard is a client component, so anything
// it needs has to be bundleable for the browser — reading the file is a separate concern
// and lives in evals-server.ts. Mixing the two here pulled node:fs into the client chunk
// and the whole route failed to build.
//
// The shapes mirror what eval/run.py serialises, one field for one field. Two rules hold
// throughout, and both exist so a number on the page can never claim more than the run
// actually measured:
//
//   - Anything the run could not compute is null, never zero. A citation validity of 0%
//     and a citation validity of "the judge was disabled" are completely different
//     statements, and collapsing them into 0 would be a lie told in a large font.
//   - `run.complete` is authoritative. A partial run is labelled as one everywhere it is
//     displayed, so a subset can never be read as the full 40.

/** The four cells of the answer-vs-refuse confusion matrix. */
export type MatrixCell = "true_answer" | "false_refuse" | "false_answer" | "true_refuse";

export interface EvalRunMeta {
  readonly started_at: string;
  readonly finished_at: string;
  readonly duration_s: number;
  readonly base_url: string;
  readonly judge_enabled: boolean;
  readonly judge_model: string;
  readonly top_k_per_search: number;
  readonly total_questions: number;
  readonly attempted: number;
  readonly scored: number;
  readonly errored: number;
  readonly skipped: number;
  /** False whenever any question was skipped or errored. Never inferred client-side. */
  readonly complete: boolean;
}

export interface CategoryBreakdown {
  readonly total: number;
  readonly behavior_passed: number;
  readonly behavior_accuracy: number;
}

export interface EvalAggregate {
  readonly confusion_matrix: Record<MatrixCell, number>;
  readonly behavior_accuracy: number | null;
  readonly refusal_precision: number | null;
  readonly retrieval_recall_at_k: number | null;
  readonly citation_validity: number | null;
  readonly citations_judged: number;
  readonly citations_supported: number;
  readonly answer_match_rate: number | null;
  readonly by_category: Record<string, CategoryBreakdown>;
  readonly latency_ms: {
    readonly median: number | null;
    readonly min: number | null;
    readonly max: number | null;
  };
  readonly tokens: {
    readonly total: number | null;
    readonly mean_per_question: number | null;
    readonly reported_for: number;
  };
}

export interface CalibrationBucket {
  readonly lower: number;
  readonly upper: number;
  readonly supported: number;
  readonly total: number;
  readonly rate: number | null;
}

export interface JudgedCitation {
  readonly n: number;
  readonly label: string;
  readonly page: number | null;
  readonly score: number | null;
  readonly claim: string;
  readonly passage: string;
  readonly verdict: "supported" | "partial" | "unsupported" | "skipped" | "error";
  readonly detail: string;
}

export interface RetrievedPage {
  readonly page: number;
  readonly label: string;
  readonly n: number | null;
  readonly best_rank: number;
  readonly best_score: number;
  readonly times_retrieved: number;
}

export interface EvalScores {
  readonly behavior: {
    readonly expected: "answer" | "refuse";
    readonly actual: "answer" | "refuse";
    readonly cell: MatrixCell;
    readonly passed: boolean;
  };
  readonly retrieval: {
    readonly applicable: boolean;
    readonly expected_pages: readonly number[];
    readonly found_pages: readonly number[];
    readonly missing_pages: readonly number[];
    readonly ranks: Record<string, number>;
    readonly recall: number | null;
    readonly passed: boolean | null;
  };
  readonly answer_match: {
    readonly applicable: boolean;
    readonly overlap: number | null;
    readonly missing: readonly string[];
    readonly passed: boolean | null;
    readonly confidence?: string;
  };
  readonly citations: {
    readonly applicable: boolean;
    readonly judged: readonly JudgedCitation[];
    readonly supported: number;
    readonly total: number;
    readonly rate: number | null;
    readonly passed?: boolean | null;
  };
}

export interface EvalRecord {
  readonly id: string;
  readonly question: string;
  readonly category: "direct" | "multi_hop" | "out_of_scope" | "adversarial";
  readonly expected_behavior: "answer" | "refuse";
  readonly expected_answer: string;
  readonly expected_pages: readonly number[];
  readonly notes: string;
  readonly status: "scored" | "error";
  readonly error?: string;
  readonly generated_queries: readonly string[];
  readonly retrieved?: readonly RetrievedPage[];
  readonly answer?: string;
  readonly refused?: boolean;
  readonly invalid_citations?: readonly number[];
  readonly latency_ms?: number;
  readonly tokens?: { readonly totalTokens: number } | null;
  readonly failures?: readonly string[];
  readonly scores?: EvalScores;
}

export interface EvalReport {
  readonly run: EvalRunMeta;
  readonly aggregate: EvalAggregate;
  readonly calibration: readonly CalibrationBucket[];
  readonly results: readonly EvalRecord[];
}

export interface LoadedReport {
  readonly report: EvalReport;
  readonly fileName: string;
  /** Every run on disk, newest first, so the page can say how many exist. */
  readonly available: readonly string[];
}

/**
 * Render a run timestamp deterministically, in UTC.
 *
 * Deliberately not toLocaleString(). The dashboard is a client component, so that string
 * is produced once on the server under Node's locale and again in the browser under the
 * user's — "2026-08-20, 10:07:26 p.m." against "20/08/2026, 22:07:26". The mismatch fails
 * hydration, React throws the server tree away and re-renders, and the page silently loses
 * its interactivity. UTC is also the right call on its own merits: an eval report is a
 * record of when a measurement happened, and that should not depend on who is reading it.
 */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Format a 0-1 rate for display, keeping "not measured" visibly distinct from zero. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export const CATEGORY_LABEL: Record<EvalRecord["category"], string> = {
  direct: "direct",
  multi_hop: "multi-hop",
  out_of_scope: "out of scope",
  adversarial: "adversarial",
};

export const CELL_LABEL: Record<MatrixCell, string> = {
  true_answer: "answered correctly",
  false_refuse: "over-refused",
  false_answer: "answered ungrounded",
  true_refuse: "refused correctly",
};
