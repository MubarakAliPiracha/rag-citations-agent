"use client";

// Every question that failed a check, and enough context to see why without re-running it.
//
// The collapsed row answers "what broke". The expanded row answers "was the harness right
// to call it broken" — which needs the passage the judge actually read, because a citation
// ruled unsupported is a claim about a specific piece of text, and the only way to check
// that claim is to see the text.

import { useState } from "react";

import { ScoreMeter } from "@/components/ScoreMeter";
import { CATEGORY_LABEL, CELL_LABEL, type EvalRecord, type MatrixCell } from "@/lib/evals";

const VERDICT_TONE: Record<string, string> = {
  supported: "text-strong",
  partial: "text-verdict",
  unsupported: "text-danger",
  skipped: "text-ink-faint",
  error: "text-ink-faint",
};

const CATEGORY_TONE: Record<EvalRecord["category"], string> = {
  direct: "text-ink-soft",
  multi_hop: "text-accent",
  out_of_scope: "text-ink-soft",
  adversarial: "text-verdict",
};

function Chevron({ open }: { readonly open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

function ExpandedDetail({ record }: { readonly record: EvalRecord }) {
  const scores = record.scores;
  if (!scores) return null;

  const judged = scores.citations.judged;

  return (
    <div className="space-y-4 border-t border-edge bg-canvas px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="t-label">Expected</p>
          <p className="t-meta mt-1 text-ink-soft">
            {scores.behavior.expected === "refuse" ? "refuse" : "answer"}
            {record.expected_pages.length > 0 && (
              <> · from {record.expected_pages.map((page) => `p.${page}`).join(", ")}</>
            )}
          </p>
          {record.expected_answer && (
            <p className="t-meta mt-1 text-ink-faint">fact: {record.expected_answer}</p>
          )}
        </div>

        <div>
          <p className="t-label">Actual</p>
          <p className="t-meta mt-1 text-ink-soft">
            {record.refused ? "refused" : "answered"}
            {scores.retrieval.applicable && (
              <>
                {" "}
                · recall {((scores.retrieval.recall ?? 0) * 100).toFixed(0)}%
                {scores.retrieval.missing_pages.length > 0 && (
                  <span className="text-danger">
                    {" "}
                    · missing {scores.retrieval.missing_pages.map((p) => `p.${p}`).join(", ")}
                  </span>
                )}
              </>
            )}
          </p>
          {record.latency_ms !== undefined && (
            <p className="t-meta mt-1 text-ink-faint">
              {record.latency_ms} ms
              {record.tokens ? ` · ${record.tokens.totalTokens} tokens` : ""}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="t-label">Why this question is here</p>
        <p className="t-body mt-1 text-ink-soft">{record.notes}</p>
      </div>

      {record.answer && (
        <div>
          <p className="t-label">Answer returned</p>
          <p className="t-answer mt-1 text-ink">{record.answer}</p>
        </div>
      )}

      {judged.length > 0 && (
        <div>
          <p className="t-label">Citations, as the judge saw them</p>
          <div className="mt-2 space-y-2">
            {judged.map((citation) => (
              <div key={citation.n} className="rounded border border-edge bg-surface p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="t-meta text-accent">[{citation.n}]</span>
                  <span className="t-meta text-ink-soft">{citation.label}</span>
                  {citation.score !== null && <ScoreMeter score={citation.score} />}
                  <span
                    className={`t-label ml-auto ${VERDICT_TONE[citation.verdict] ?? "text-ink-faint"}`}
                  >
                    {citation.verdict}
                  </span>
                </div>

                <p className="t-body mt-2 text-ink">
                  <span className="t-label mr-1.5">claim</span>
                  {citation.claim}
                </p>

                <p className="t-meta mt-2 whitespace-pre-wrap border-t border-edge pt-2 text-ink-soft">
                  <span className="t-label mr-1.5">passage</span>
                  {citation.passage}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface FailureTableProps {
  readonly records: readonly EvalRecord[];
  readonly selectedCell: MatrixCell | null;
  readonly onClearCell: () => void;
}

export function FailureTable({ records, selectedCell, onClearCell }: FailureTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-edge bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-edge px-5 py-3.5">
        <h2 className="font-serif text-[19px] leading-none text-ink">
          {selectedCell ? CELL_LABEL[selectedCell] : "Failures"}
        </h2>

        <div className="flex items-center gap-3">
          <span className="t-meta text-ink-faint">
            {records.length} question{records.length === 1 ? "" : "s"}
            {selectedCell ? " in this cell" : " failed at least one check"}
          </span>

          {selectedCell && (
            <button
              type="button"
              onClick={onClearCell}
              className="t-meta rounded border border-edge px-2 py-1 text-ink-soft
                         transition-colors hover:bg-hover hover:text-ink"
            >
              clear filter
            </button>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="t-body px-5 py-10 text-center text-ink-soft">
          {selectedCell
            ? "No questions landed in this cell."
            : "Every scored question passed every check."}
        </p>
      ) : (
        <ul>
          {records.map((record) => {
            const isOpen = openId === record.id;
            const failures = record.failures ?? [];

            return (
              <li key={record.id} className="border-b border-edge last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : record.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 px-5 py-3.5 text-left
                             transition-colors hover:bg-hover"
                >
                  <span className="mt-1 text-ink-faint">
                    <Chevron open={isOpen} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="t-meta text-ink-faint">{record.id}</span>
                      <span className={`t-label ${CATEGORY_TONE[record.category]}`}>
                        {CATEGORY_LABEL[record.category]}
                      </span>
                      {record.status === "error" && (
                        <span className="t-label text-danger">errored</span>
                      )}
                      {record.status === "scored" && failures.length === 0 && (
                        <span className="t-label text-strong">passed</span>
                      )}
                    </span>

                    <span className="t-body mt-1 block text-ink">{record.question}</span>

                    {failures.map((reason) => (
                      <span key={reason} className="t-meta mt-1 block text-danger">
                        → {reason}
                      </span>
                    ))}

                    {record.status === "error" && (
                      <span className="t-meta mt-1 block text-danger">→ {record.error}</span>
                    )}

                    {record.generated_queries.length > 0 && (
                      <span className="mt-2 block">
                        <span className="t-label mr-1.5">searched</span>
                        {record.generated_queries.map((query, index) => (
                          <span
                            key={`${query}-${index}`}
                            className="t-meta mr-1.5 inline-block rounded border border-accent-edge
                                       bg-accent-soft px-1.5 py-0.5 text-accent"
                          >
                            {query}
                          </span>
                        ))}
                      </span>
                    )}

                    {record.retrieved && record.retrieved.length > 0 && (
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="t-label">retrieved</span>
                        {record.retrieved.slice(0, 5).map((page) => (
                          <span key={page.page} className="flex items-center gap-1.5">
                            <span
                              className={`t-meta ${
                                record.expected_pages.includes(page.page)
                                  ? "text-strong"
                                  : "text-ink-faint"
                              }`}
                            >
                              p.{page.page}
                            </span>
                            <ScoreMeter score={page.best_score} />
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>

                {isOpen && <ExpandedDetail record={record} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
