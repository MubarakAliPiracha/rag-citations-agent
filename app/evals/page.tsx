// /evals — what the agent scored on the last eval run.
//
// A server component that reads the newest file out of eval/results at request time.
// force-dynamic because the interesting workflow is "run the harness, refresh the page",
// and a cached render would show yesterday's numbers with no hint that it had.
//
// The shell mirrors the chat page: a fixed header over one scroll region, because the
// body is h-dvh overflow-hidden and a page that does not own its own scroller simply
// cannot be scrolled.

import Link from "next/link";

import { EvalDashboard } from "@/components/evals/EvalDashboard";
import { loadLatestReport } from "@/lib/evals-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Evals · RAG Agent",
  description:
    "Behaviour, citation validity, retrieval recall and score calibration for the " +
    "citation-grounded RAG agent.",
};

function EmptyState() {
  return (
    <div className="rounded-lg border border-edge bg-surface p-8">
      <h2 className="font-serif text-[22px] leading-tight text-ink">No eval runs yet</h2>

      <p className="t-body mt-2 max-w-prose text-ink-soft">
        The harness writes a timestamped report into{" "}
        <span className="font-mono text-[13px] text-accent">eval/results/</span>. Once one
        exists, this page renders the most recent.
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <p className="t-label">1 · start the app</p>
          <pre className="t-meta mt-1 overflow-x-auto rounded border border-edge bg-canvas px-3 py-2 text-ink-soft">
            npm run dev
          </pre>
        </div>

        <div>
          <p className="t-label">2 · run the eval set in another terminal</p>
          <pre className="t-meta mt-1 overflow-x-auto rounded border border-edge bg-canvas px-3 py-2 text-ink-soft">
            python eval/run.py
          </pre>
        </div>
      </div>

      <p className="t-meta mt-5 border-t border-edge pt-3 text-ink-faint">
        Add <span className="text-ink-soft">--no-judge</span> to skip the citation judge, or{" "}
        <span className="text-ink-soft">--limit 5</span> for a quick partial run. A partial
        run is labelled as one on this page.
      </p>
    </div>
  );
}

export default async function EvalsPage() {
  const loaded = await loadLatestReport();

  return (
    <main className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-edge">
        <div className="mx-auto flex w-full max-w-5xl items-baseline gap-3 px-5 py-3.5">
          <h1 className="font-serif text-[19px] leading-none text-ink">
            Evals
            <span className="text-ink-faint"> · </span>
            <span className="text-ink-soft">Citation Grounding</span>
          </h1>

          <Link
            href="/"
            className="t-meta ml-auto shrink-0 text-ink-faint transition-colors hover:text-accent"
          >
            ← back to the agent
          </Link>
        </div>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-5 py-6">
          {loaded ? (
            <EvalDashboard
              report={loaded.report}
              fileName={loaded.fileName}
              runCount={loaded.available.length}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </main>
  );
}
