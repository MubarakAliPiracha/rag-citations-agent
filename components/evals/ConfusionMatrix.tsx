"use client";

// Answer-vs-refuse, as a 2x2 you can click into.
//
// The two off-diagonal cells are not equally bad and are not coloured as though they
// were. Over-refusing is unhelpful but safe, so it takes the same amber the refusal
// verdict uses elsewhere. Answering something the documents do not support is the exact
// failure this project exists to prevent, so it is the only red on the page.

import type { MatrixCell } from "@/lib/evals";

const CELL_TONE: Record<MatrixCell, string> = {
  true_answer: "text-strong",
  true_refuse: "text-strong",
  false_refuse: "text-verdict",
  false_answer: "text-danger",
};

const CELL_EDGE: Record<MatrixCell, string> = {
  true_answer: "hover:border-strong/50",
  true_refuse: "hover:border-strong/50",
  false_refuse: "hover:border-verdict/60",
  false_answer: "hover:border-danger/60",
};

const CELL_CAPTION: Record<MatrixCell, string> = {
  true_answer: "grounded answer",
  false_refuse: "over-refused",
  false_answer: "ungrounded answer",
  true_refuse: "correct refusal",
};

interface ConfusionMatrixProps {
  readonly matrix: Record<MatrixCell, number>;
  readonly selected: MatrixCell | null;
  readonly onSelect: (cell: MatrixCell | null) => void;
}

function Cell({
  cell,
  count,
  selected,
  onSelect,
}: {
  readonly cell: MatrixCell;
  readonly count: number;
  readonly selected: MatrixCell | null;
  readonly onSelect: (cell: MatrixCell | null) => void;
}) {
  const isActive = selected === cell;
  const isEmpty = count === 0;

  return (
    <button
      type="button"
      // Clicking the active cell clears the filter, so the matrix is also the way out
      // of the filtered state it created.
      onClick={() => onSelect(isActive ? null : cell)}
      disabled={isEmpty}
      aria-pressed={isActive}
      className={`group flex flex-col items-center justify-center rounded-md border px-3 py-5
                  transition-colors
                  ${isActive ? "border-accent bg-accent-soft" : "border-edge bg-raised"}
                  ${isEmpty ? "cursor-default opacity-45" : `cursor-pointer ${CELL_EDGE[cell]} hover:bg-hover`}`}
    >
      <span className={`font-mono text-[30px] leading-none tabular-nums ${CELL_TONE[cell]}`}>
        {count}
      </span>
      <span className="t-meta mt-2 text-center text-ink-faint">{CELL_CAPTION[cell]}</span>
    </button>
  );
}

export function ConfusionMatrix({ matrix, selected, onSelect }: ConfusionMatrixProps) {
  const total = Object.values(matrix).reduce((sum, count) => sum + count, 0);

  return (
    <section className="rounded-lg border border-edge bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[19px] leading-none text-ink">Answer vs refuse</h2>
        <span className="t-meta text-ink-faint">
          {selected ? "click again to clear" : "click a cell to filter below"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_1fr] gap-2">
        <div />
        <p className="t-label pb-1 text-center">agent answered</p>
        <p className="t-label pb-1 text-center">agent refused</p>

        <p className="t-label flex items-center pr-2 text-right leading-tight">
          should
          <br />
          answer
        </p>
        <Cell cell="true_answer" count={matrix.true_answer} selected={selected} onSelect={onSelect} />
        <Cell cell="false_refuse" count={matrix.false_refuse} selected={selected} onSelect={onSelect} />

        <p className="t-label flex items-center pr-2 text-right leading-tight">
          should
          <br />
          refuse
        </p>
        <Cell cell="false_answer" count={matrix.false_answer} selected={selected} onSelect={onSelect} />
        <Cell cell="true_refuse" count={matrix.true_refuse} selected={selected} onSelect={onSelect} />
      </div>

      <p className="t-meta mt-4 border-t border-edge pt-3 text-ink-soft">
        <span className="text-danger">Ungrounded answers</span> are the failure this system
        exists to prevent. <span className="text-verdict">Over-refusals</span> are unhelpful
        but safe. {total} question{total === 1 ? "" : "s"} scored.
      </p>
    </section>
  );
}
