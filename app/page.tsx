// The one page.
//
// A server component so index metadata (which document, how many passages) is read on the
// server and sent as plain props, rather than costing the browser a round trip before it
// can render anything.
//
// The shell is a full-height flex column: header, then Chat, which owns the scrolling
// transcript and the composer anchored beneath it.

import Link from "next/link";

import { Chat } from "@/components/Chat";
import { activeModelName } from "@/lib/llm";
import { DEFAULT_INDEX, DEFAULT_INDEX_LABEL } from "@/lib/default-index";

/**
 * A short tour rather than a list of prompts.
 *
 * One single-fact lookup, one multi-hop question a fixed chain could not answer, and one
 * that is deliberately absent from the document so the refusal behaviour is discoverable
 * without the viewer having to guess at it.
 */
const SUGGESTIONS = [
  {
    text: "How much parental leave do I get?",
    note: "single lookup · one search",
  },
  {
    text: "How does parental leave compare to the vacation policy?",
    note: "multi-hop · needs two searches in different sections",
  },
  {
    text: "What laptop do new hires receive?",
    note: "single lookup · cites an exact page",
  },
  {
    text: "What is the CEO's favourite pizza topping?",
    note: "not in the document · the agent searches, then declines",
    refuses: true,
  },
];

export default function Home() {
  const passages = DEFAULT_INDEX.chunks.length;

  return (
    <main className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-edge">
        <div className="mx-auto flex w-full max-w-3xl items-baseline gap-3 px-5 py-3.5">
          <h1 className="font-serif text-[19px] leading-none text-ink">
            RAG Agent
            <span className="text-ink-faint"> · </span>
            <span className="text-ink-soft">Citation Grounding</span>
          </h1>

          <div className="ml-auto flex shrink-0 items-baseline gap-3">
            <Link
              href="/evals"
              className="t-meta text-ink-faint transition-colors hover:text-accent"
              title="How this agent scores across the 40-question eval set"
            >
              evals
            </Link>
            <span className="t-meta text-ink-faint">{activeModelName()}</span>
          </div>
        </div>
      </header>

      <Chat
        defaultLabel={DEFAULT_INDEX_LABEL}
        defaultDetail={`${passages} passages indexed`}
        suggestions={SUGGESTIONS}
      />
    </main>
  );
}
