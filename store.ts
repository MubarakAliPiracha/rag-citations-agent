// Stage 2 — Embeddings + vector store.
//
// Big picture: turn every chunk into a "meaning coordinate" (an embedding), and
// put them all in a store that can find the nearest coordinates to a question.
//
// Run it directly to SEE meaning-search work:  npm run store
// Import buildStore() from later stages to get a searchable store of your real PDFs.

import { pathToFileURL } from "node:url";

import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

import { loadChunks } from "./ingest.ts";

// all-MiniLM-L6-v2: small, fast, runs locally + free. Downloads once (~90 MB) on first use.
export function makeEmbeddings(): HuggingFaceTransformersEmbeddings {
  return new HuggingFaceTransformersEmbeddings({
    model: "Xenova/all-MiniLM-L6-v2",
  });
}

// Cache the store so we only read PDFs + embed chunks ONCE per process, not per question.
// We cache the Promise (not the resolved store) so concurrent callers share one build.
let storePromise: Promise<MemoryVectorStore> | null = null;

async function buildStoreUncached(): Promise<MemoryVectorStore> {
  const chunks = await loadChunks();
  const embeddings = makeEmbeddings();
  // fromDocuments embeds every chunk and stores it, keeping each chunk's metadata.
  return MemoryVectorStore.fromDocuments(chunks, embeddings);
}

// Build a searchable store from the real PDF chunks. Reused by Stage 3+.
export function buildStore(): Promise<MemoryVectorStore> {
  if (!storePromise) storePromise = buildStoreUncached();
  return storePromise;
}

// When run directly: the "aha" test on toy sentences — proves search is by MEANING, not words.
const isRunDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) {
  console.log("Downloading the embedding model on first run (~90 MB)… this can take a minute.\n");

  const sentences = [
    "Cats and dogs are popular household pets.",
    "Kittens love to nap in warm, sunny spots.",
    "The quarterly financial report shows rising profits.",
  ];

  const embeddings = makeEmbeddings();
  const demoStore = await MemoryVectorStore.fromTexts(
    sentences,
    sentences.map((_, i) => ({ id: i })), // one metadata object per sentence
    embeddings,
  );

  // Note: the query shares NO words with the pet sentences ("animal", not "cat"/"dog").
  const query = "information about pet animals";
  const results = await demoStore.similaritySearchWithScore(query, 3);

  console.log(`Query: "${query}"\n`);
  console.log("Ranked by meaning (higher score = closer):\n");
  for (const [doc, score] of results) {
    console.log(`  ${score.toFixed(3)}  ${doc.pageContent}`);
  }
  console.log(
    "\n✅ If the two pet sentences rank above the finance one, embeddings just clicked.",
  );
}
