// The one page.
//
// A server component so the index metadata (which document, how many passages) is read on
// the server and sent as plain props, rather than costing the browser a round trip before
// it can render anything.

import { Chat } from "@/components/Chat";
import { activeModelName } from "@/lib/llm";
import { DEFAULT_INDEX, DEFAULT_INDEX_LABEL } from "@/lib/default-index";

const SUGGESTIONS = [
  "How much parental leave do I get?",
  "How does parental leave compare to the vacation policy?",
  "What laptop do new hires receive?",
  "What is the CEO's favourite pizza topping?",
];

export default function Home() {
  const passages = DEFAULT_INDEX.chunks.length;

  return (
    <main>
      <header className="sticky top-0 z-10 border-b border-edge bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent
                       text-white shadow-accent"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M2.5 3.5A1 1 0 0 1 3.5 2.5H7a1.5 1.5 0 0 1 1.5 1.5v9A1.2 1.2 0 0 0 7.4 12H3.5a1 1 0 0 1-1-1v-7.5Z" />
              <path d="M13.5 3.5a1 1 0 0 0-1-1H9A1.5 1.5 0 0 0 7.5 4v9A1.2 1.2 0 0 1 8.6 12h3.9a1 1 0 0 0 1-1v-7.5Z" />
            </svg>
          </span>

          <div className="min-w-0">
            <h1 className="truncate font-serif text-xl leading-tight text-ink sm:text-2xl">
              RAG Agent with Citation Grounding
            </h1>
            <p className="truncate text-[12.5px] text-ink-soft">
              Decides its own searches · cites every claim · refuses to guess
            </p>
          </div>

          <span className="label-caps ml-auto hidden shrink-0 font-mono sm:block">
            {activeModelName()}
          </span>
        </div>
      </header>

      <Chat
        defaultLabel={DEFAULT_INDEX_LABEL}
        defaultDetail={`${passages} passages indexed · drop in your own PDF to replace it`}
        suggestions={SUGGESTIONS}
      />
    </main>
  );
}
