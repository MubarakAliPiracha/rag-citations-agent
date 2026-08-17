"use client";

// First contact.
//
// The examples are doing the teaching. A viewer who has never seen this cannot be
// expected to invent a question that demonstrates refusal, and refusal is the whole
// point — so one example is explicitly marked as unanswerable and labelled with what it
// will do. Discovering the behaviour should not depend on guessing.
//
// Each example is also annotated with what it demonstrates (single lookup, multi-hop,
// refusal), which turns a list of prompts into a short tour of the agent's capabilities.

interface Suggestion {
  readonly text: string;
  readonly note?: string;
  readonly refuses?: boolean;
}

interface EmptyStateProps {
  readonly suggestions: readonly Suggestion[];
  readonly onPick: (question: string) => void;
  readonly disabled: boolean;
}

export function EmptyState({ suggestions, onPick, disabled }: EmptyStateProps) {
  return (
    <div className="animate-rise py-6">
      <h2 className="t-display text-ink">Ask the document anything</h2>

      <p className="t-body mt-3 max-w-xl text-ink-soft">
        The agent writes its own search queries, cites every claim to an exact page, and
        declines to answer when the document does not support one.
      </p>

      <p className="t-label mt-8">Try one</p>

      <ul className="mt-2.5 divide-y divide-edge border-y border-edge">
        {suggestions.map((suggestion, i) => (
          <li key={suggestion.text}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(suggestion.text)}
              style={{ animationDelay: `${i * 55}ms` }}
              className="animate-rise group flex w-full items-center gap-4 py-3 text-left
                         transition-colors hover:bg-hover disabled:cursor-not-allowed
                         disabled:opacity-50"
            >
              <span className="t-meta w-5 shrink-0 tabular-nums text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[17px] leading-snug text-ink-soft
                                 transition-colors group-hover:text-ink">
                  {suggestion.text}
                </span>
                {suggestion.note && (
                  <span className="t-meta mt-0.5 block text-ink-faint">{suggestion.note}</span>
                )}
              </span>

              {suggestion.refuses && (
                <span
                  className="t-meta shrink-0 rounded border border-verdict-edge
                             bg-verdict-soft px-1.5 py-0.5 text-verdict"
                >
                  will refuse
                </span>
              )}

              <svg
                viewBox="0 0 16 16"
                aria-hidden
                className="size-3 shrink-0 text-ink-faint transition-all
                           group-hover:translate-x-0.5 group-hover:text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
