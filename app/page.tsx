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
      <header className="border-b border-edge bg-surface">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
          <h1 className="font-serif text-2xl text-ink sm:text-3xl">
            RAG Agent with Citation Grounding
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            A retrieval agent that decides its own searches, cites every claim, and refuses
            to guess. Powered by {activeModelName()}.
          </p>
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
