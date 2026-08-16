"use client";

// Renders an answer, turning every [n] marker into a clickable citation chip.
//
// The chips are the product's promise made tangible: a claim you can click to see the
// exact passage it came from. Rendering them as buttons rather than styled spans is
// deliberate — they are interactive, so they must be reachable by keyboard.
//
// Markdown is handled with a deliberately small renderer instead of a library. The model
// only ever emits bullets, bold and paragraphs under this prompt, and hand-rolling that
// avoids shipping a parser plus a sanitiser to defend against injected HTML.

import type { SourceRef } from "@/lib/types";

interface AnswerBodyProps {
  readonly text: string;
  readonly sources: readonly SourceRef[];
  readonly onCitationClick?: (n: number) => void;
  /** True while tokens are still arriving, so a caret can be shown. */
  readonly streaming?: boolean;
}

const CITATION_PATTERN = /\[(\d+)\]/g;

/** Split "**bold** text" into renderable spans. Bold is the only inline mark used. */
function renderInlineBold(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b${i}`} className="font-bold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-t${i}`}>{part}</span>;
  });
}

/** Split a line into text and citation chips. */
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
      nodes.push(...renderInlineBold(line.slice(cursor, match.index), `${keyPrefix}-${cursor}`));
    }

    const n = Number(match[1]);
    const source = sources.find((candidate) => candidate.n === n);

    nodes.push(
      <button
        key={`${keyPrefix}-c${match.index}`}
        type="button"
        onClick={() => onCitationClick?.(n)}
        title={source ? source.label : `Source [${n}]`}
        aria-label={source ? `Jump to source ${n}, ${source.label}` : `Source ${n}`}
        // Left margin only. A right margin pushes the following punctuation away and
        // renders as "approval [2] ." instead of "approval [2].".
        className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full
                   bg-accent-soft px-1.5 align-baseline text-[11px] font-bold text-accent-ink
                   transition-colors hover:bg-accent hover:text-white"
      >
        {n}
      </button>,
    );

    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    nodes.push(...renderInlineBold(line.slice(cursor), `${keyPrefix}-${cursor}`));
  }

  return nodes;
}

export function AnswerBody({ text, sources, onCitationClick, streaming }: AnswerBodyProps) {
  const lines = text.split("\n");

  return (
    <div className={`space-y-2 leading-relaxed ${streaming ? "streaming-caret" : ""}`}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const bullet = /^[-*•]\s+/.exec(trimmed);
        const content = bullet ? trimmed.slice(bullet[0].length) : trimmed;
        const nodes = renderLine(content, `l${i}`, sources, onCitationClick);

        if (bullet) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-faint" />
              <p className="flex-1">{nodes}</p>
            </div>
          );
        }

        return <p key={i}>{nodes}</p>;
      })}
    </div>
  );
}
