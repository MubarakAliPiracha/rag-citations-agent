// Stage 3 — Retrieval.
//
// Big picture: given a question, find the top-K chunks most likely to hold the answer.
// The store embeds your question the same way it embedded the chunks, then returns
// the nearest ones — each still carrying its { source, page } for citations.
//
// Run it with your own question:  npx tsx retrieve.ts "what did they build at Coolhand?"

import { pathToFileURL } from "node:url";

import { buildStore } from "./store.ts";
import { sourceLabel } from "./ingest.ts";

const TOP_K = 4; // how many chunks to pull back

// Build the store, then return the K chunks closest in meaning to `question`.
export async function retrieve(question: string, k: number = TOP_K) {
  const store = await buildStore();
  const retriever = store.asRetriever(k);
  return retriever.invoke(question);
}

const isRunDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) {
  // Use the question typed on the command line, or a sensible default.
  const question = process.argv[2] ?? "What did they build at Coolhand Labs?";

  console.log(`Question: "${question}"\n`);
  console.log(`Top ${TOP_K} chunks by meaning:\n`);

  const chunks = await retrieve(question);
  chunks.forEach((chunk, i) => {
    console.log(`[${i + 1}] ${sourceLabel(chunk)}`);
    console.log(chunk.pageContent.slice(0, 200).replace(/\s+/g, " ").trim());
    console.log("");
  });
}
