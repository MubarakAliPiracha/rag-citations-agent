"use client";

// The eval report, assembled.
//
// One piece of state lives here — which confusion-matrix cell is selected — because the
// matrix and the table below it are two views of the same set and have to agree.
//
// The ordering is an argument, not a layout: headline rates first, then the matrix that
// decomposes the most important of them, then whether the score the UI displays is worth
// anything, then the individual failures. Each section is the natural "but why?" of the
// one above it.

import { useMemo, useState } from "react";

import { CalibrationPlot } from "./CalibrationPlot";
import { ConfusionMatrix } from "./ConfusionMatrix";
import { FailureTable } from "./FailureTable";
import { StatCard } from "./StatCard";
import {
  CATEGORY_LABEL,
  formatPercent,
  formatTimestamp,
  type EvalReport,
  type MatrixCell,
} from "@/lib/evals";

interface EvalDashboardProps {
  readonly report: EvalReport;
  readonly fileName: string;
  readonly runCount: number;
}

export function EvalDashboard({ report, fileName, runCount }: EvalDashboardProps) {
  const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);

  const { run, aggregate, calibration, results } = report;

  const visible = useMemo(() => {
    if (selectedCell) {
      return results.filter(
        (record) => record.status === "scored" && record.scores?.behavior.cell === selectedCell,
      );
    }

    // Default view is the failures, and an errored question is a failure of the run even
    // though it never produced a score.
    return results.filter(
      (record) => record.status === "error" || (record.failures?.length ?? 0) > 0,
    );
  }, [results, selectedCell]);

  const answerable = results.filter(
    (record) => record.status === "scored" && record.scores?.retrieval.applicable,
  ).length;

  return (
    <div className="space-y-5">
      {!run.complete && (
        <div
          role="status"
          className="rounded-lg border border-verdict-edge bg-verdict-soft px-4 py-3"
        >
          <p className="t-label text-verdict">Partial run</p>
          <p className="t-body mt-1 text-ink-soft">
            Every figure on this page is computed over the{" "}
            <span className="font-mono text-[13px] text-verdict">{run.scored}</span> question
            {run.scored === 1 ? "" : "s"} that completed, not the full{" "}
            <span className="font-mono text-[13px] text-verdict">{run.total_questions}</span>.
            {run.errored > 0 && ` ${run.errored} errored.`}
            {run.skipped > 0 && ` ${run.skipped} were never attempted.`}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Behavior accuracy"
          value={formatPercent(aggregate.behavior_accuracy)}
          basis={`${run.scored} question${run.scored === 1 ? "" : "s"} scored`}
          tone="accent"
        />
        <StatCard
          label="Citation validity"
          value={formatPercent(aggregate.citation_validity)}
          basis={
            run.judge_enabled
              ? `${aggregate.citations_supported}/${aggregate.citations_judged} citations judged`
              : "judge disabled for this run"
          }
          tone={run.judge_enabled ? "strong" : "neutral"}
          caveat={run.judge_enabled ? undefined : "Not measured."}
        />
        <StatCard
          label={`Retrieval recall@${run.top_k_per_search}`}
          value={formatPercent(aggregate.retrieval_recall_at_k)}
          basis={`${answerable} answerable question${answerable === 1 ? "" : "s"}`}
          tone="neutral"
          caveat={`Only 7 passages exist and each search returns ${run.top_k_per_search}, so this is near-saturated by construction.`}
        />
        <StatCard
          label="Refusal precision"
          value={formatPercent(aggregate.refusal_precision)}
          basis={`of ${aggregate.confusion_matrix.true_refuse + aggregate.confusion_matrix.false_refuse} refusals made`}
          tone="verdict"
        />
      </div>

      {/* The matrix and the per-category bars are two cuts of the same behaviour number,
          so they share a column; calibration is a separate question and gets its own. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <ConfusionMatrix
            matrix={aggregate.confusion_matrix}
            selected={selectedCell}
            onSelect={setSelectedCell}
          />

          <section className="rounded-lg border border-edge bg-surface p-5">
            <h2 className="font-serif text-[19px] leading-none text-ink">
              Behavior by category
            </h2>

            <div className="mt-4 space-y-2.5">
              {(["direct", "multi_hop", "out_of_scope", "adversarial"] as const).map(
                (category) => {
                  const bucket = aggregate.by_category[category];
                  if (!bucket) return null;

                  return (
                    <div key={category} className="flex items-center gap-3">
                      <span className="t-meta w-24 shrink-0 text-ink-soft">
                        {CATEGORY_LABEL[category]}
                      </span>

                      <span
                        aria-hidden
                        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-edge-strong"
                      >
                        <span
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            bucket.behavior_accuracy === 1 ? "bg-strong" : "bg-medium"
                          }`}
                          style={{ width: `${bucket.behavior_accuracy * 100}%` }}
                        />
                      </span>

                      <span className="t-meta w-14 shrink-0 text-right tabular-nums text-ink">
                        {formatPercent(bucket.behavior_accuracy, 0)}
                      </span>
                      <span className="t-meta w-12 shrink-0 text-right tabular-nums text-ink-faint">
                        {bucket.behavior_passed}/{bucket.total}
                      </span>
                    </div>
                  );
                },
              )}
            </div>

            <p className="t-meta mt-4 border-t border-edge pt-3 text-ink-faint">
              The adversarial set is the interesting one: those questions sit next to real
              content, so retrieval returns confident-looking passages that still do not
              answer them.
            </p>
          </section>
        </div>

        <CalibrationPlot buckets={calibration} judgeEnabled={run.judge_enabled} />
      </div>

      <FailureTable
        records={visible}
        selectedCell={selectedCell}
        onClearCell={() => setSelectedCell(null)}
      />

      <section className="rounded-lg border border-edge bg-surface px-5 py-4">
        <p className="t-label">Run detail</p>

        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["file", fileName],
            ["finished", formatTimestamp(run.finished_at)],
            ["duration", `${run.duration_s}s`],
            ["target", run.base_url],
            ["judge", run.judge_enabled ? run.judge_model : "disabled"],
            [
              "latency",
              aggregate.latency_ms.median === null
                ? "—"
                : `${aggregate.latency_ms.median} ms median (${aggregate.latency_ms.min}–${aggregate.latency_ms.max})`,
            ],
            [
              "tokens",
              aggregate.tokens.total === null
                ? "—"
                : `${aggregate.tokens.total.toLocaleString()} total · ~${aggregate.tokens.mean_per_question}/question`,
            ],
            [
              "answer match",
              `${formatPercent(aggregate.answer_match_rate)} — fuzzy, advisory only`,
            ],
            ["runs on disk", `${runCount}`],
          ].map(([term, value]) => (
            <div key={term} className="flex gap-2">
              <dt className="t-label shrink-0 pt-0.5">{term}</dt>
              <dd className="t-meta min-w-0 break-words text-ink-soft">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
