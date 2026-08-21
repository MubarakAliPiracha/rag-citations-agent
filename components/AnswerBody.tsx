"use client";

// The answer itself, set as prose.
//
// Serif body copy is a deliberate call: it makes the answer read as something written and
// meant to be read, while every machine-asserted fact around it — page labels, scores,
// citations — stays mono. You can tell the two apart without reading a word.
//
// Words resolve out of blur as they stream. Each word is a span with a STABLE key so
// React mounts only new ones and only those animate; keying by anything unstable
// re-animates the whole paragraph on every token and the text strobes.
//
// Markdown is handled by a deliberately small renderer rather than a library: under this
// prompt the model only emits bullets, bold and paragraphs, and hand-rolling that avoids
// shipping a parser plus a sanitiser to guard against injected HTML.

import type { SourceRef } from "@/lib/types";

interface AnswerBodyProps {
  readonly text: string;
  readonly sources: readonly SourceRef[];
  readonly onCitationClick?: (n: number) => void;
  readonly streaming?: boolean;
}

const CITATION_PATTERN = /\[(\d+)\]/g;

function CitationChip({
  n,
  source,
  onClick,
}: {
  readonly n: number;
  readonly source?: SourceRef;
  readonly onClick?: (n: number) => void;
}) {
  const page = source ? source.label.replace(/^.*\sp\./, "p.") : null;

  return (
    <button
      type="button"
      onClick={() => onClick?.(n)}
      title={source ? source.label : `Source ${n}`}
      aria-label={source ? `Jump to source ${n}, ${source.label}` : `Source ${n}`}
      // Left margin only: a right margin pushes trailing punctuation away and renders as
      // "approval [2] ." instead of "approval [2]."
      className="animate-pop ml-1 inline-flex translate-y-[-2px] items-center gap-1 rounded
                 border border-accent-edge bg-accent-soft px-1 py-px align-middle font-mono
                 text-[10px] font-bold text-accent transition-colors duration-150
                 hover:bg-accent hover:text-canvas"
    >
      <span className="tabular-nums">{n}</span>
      {page && <span className="font-normal opacity-75">{page}</span>}
    </button>
  );
}

/** Split plain text into animated words, honouring **bold**. */
function renderWords(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\s+)/).flatMap((piece, i) => {
    if (!piece) return [];
    if (/^\s+$/.test(piece)) return [<span key={`${keyPrefix}-s${i}`}>{piece}</span>];

    const bold = piece.includes("**");
    const clean = piece.replace(/\*\*/g, "");

    return [
      <span
        key={`${keyPrefix}-w${i}`}
        className={`animate-word inline ${bold ? "font-bold" : ""}`}
      >
        {clean}
      </span>,
    ];
  });
}

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
    <div className="t-answer space-y-3 text-ink">
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
            <div key={i} className="flex gap-3">
              <span aria-hidden className="mt-[0.7em] size-1 shrink-0 rounded-full bg-accent-dim" />
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
