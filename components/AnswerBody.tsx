"use client";

// Renders an answer: words resolve out of a slight blur as they stream, and every [n]
// becomes a chip you can click to jump to the passage it came from.
//
// The per-word animation depends on a React detail worth stating plainly. Each word gets
// a STABLE key derived from its position in the text, so when a new token arrives React
// mounts only the new spans and leaves the existing ones alone. Only newly mounted
// elements run their animation. Keying by anything unstable makes every word re-animate
// on every token and the paragraph strobes.
//
// Markdown is handled by a deliberately small renderer rather than a library: under this
// prompt the model only emits bullets, bold and paragraphs, and hand-rolling that avoids
// shipping a parser plus a sanitiser to guard against injected HTML.

import type { SourceRef } from "@/lib/types";

interface AnswerBodyProps {
  readonly text: string;
  readonly sources: readonly SourceRef[];
  readonly onCitationClick?: (n: number) => void;
  /** True while tokens are still arriving, so a caret trails the text. */
  readonly streaming?: boolean;
}

const CITATION_PATTERN = /\[(\d+)\]/g;

interface CitationChipProps {
  readonly n: number;
  readonly source?: SourceRef;
  readonly onClick?: (n: number) => void;
}

function CitationChip({ n, source, onClick }: CitationChipProps) {
  const page = source ? source.label.replace(/^.*\sp\./, "p.") : null;

  return (
    <button
      type="button"
      onClick={() => onClick?.(n)}
      title={source ? source.label : `Source ${n}`}
      aria-label={source ? `Jump to source ${n}, ${source.label}` : `Source ${n}`}
      // Left margin only: a right margin pushes trailing punctuation away and renders
      // as "approval [2] ." instead of "approval [2]."
      className="animate-pop ml-1 inline-flex translate-y-[-1px] items-center gap-1 rounded-md
                 bg-accent-soft py-[1px] pr-1.5 pl-1 align-middle font-mono text-[10.5px]
                 font-bold text-accent-ink ring-1 ring-accent-edge transition-colors
                 duration-150 hover:bg-accent hover:text-white hover:ring-accent"
    >
      <span className="tabular-nums">{n}</span>
      {page && <span className="font-normal opacity-70">{page}</span>}
    </button>
  );
}

/** Split a run of plain text into animated words, honouring **bold**. */
function renderWords(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\s+)/).flatMap((piece, i) => {
    if (!piece) return [];

    // Preserve whitespace runs as-is so spacing survives the split.
    if (/^\s+$/.test(piece)) return [<span key={`${keyPrefix}-s${i}`}>{piece}</span>];

    const bold = piece.startsWith("**") || piece.endsWith("**");
    const clean = piece.replace(/\*\*/g, "");

    return [
      <span
        key={`${keyPrefix}-w${i}`}
        className={`animate-word inline ${bold ? "font-bold text-ink" : ""}`}
      >
        {clean}
      </span>,
    ];
  });
}

/** Split a line into words and citation chips. */
function renderLine(
  line: string,
  keyPrefix: string,
  sources: readonly SourceRef[],
  onCitationClick?: (n: number) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  CITATION_PATTERN.lastIndex = 0;

  while ((match = CITATION_PATTERN.exec(line)) !== null) {
    if (match.index > cursor) {
      nodes.push(...renderWords(line.slice(cursor, match.index), `${keyPrefix}-${cursor}`));
    }

    const n = Number(match[1]);
    nodes.push(
      <CitationChip
        key={`${keyPrefix}-c${match.index}`}
        n={n}
        source={sources.find((candidate) => candidate.n === n)}
        onClick={onCitationClick}
      />,
    );

    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    nodes.push(...renderWords(line.slice(cursor), `${keyPrefix}-${cursor}`));
  }

  return nodes;
}

export function AnswerBody({ text, sources, onCitationClick, streaming }: AnswerBodyProps) {
  const lines = text.split("\n");
  const lastRenderedIndex = lines.reduce((last, line, i) => (line.trim() ? i : last), -1);

  return (
    <div className="space-y-2.5 text-[15px] leading-[1.7] text-ink">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const bullet = /^[-*•]\s+/.exec(trimmed);
        const content = bullet ? trimmed.slice(bullet[0].length) : trimmed;
        const nodes = renderLine(content, `l${i}`, sources, onCitationClick);

        // The caret belongs on the last line with content, not floating after the block.
        const showCaret = streaming && i === lastRenderedIndex;

        if (bullet) {
          return (
            <div key={i} className="flex gap-2.5 pl-0.5">
              <span
                aria-hidden
                className="mt-[0.6em] size-1 shrink-0 rounded-full bg-accent/60"
              />
              <p className={`flex-1 ${showCaret ? "streaming-caret" : ""}`}>{nodes}</p>
            </div>
          );
        }

        return (
          <p key={i} className={showCaret ? "streaming-caret" : ""}>
            {nodes}
          </p>
        );
      })}
    </div>
  );
}
