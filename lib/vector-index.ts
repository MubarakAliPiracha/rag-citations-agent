// The vector store.
//
// This replaces both the LangChain MemoryVectorStore used locally and the hand-rolled
// cosine loop that used to live in the serverless function. One implementation, so local
// and production retrieval cannot drift apart.
//
// It is deliberately a plain array plus a dot product. At demo scale — a handful of
// documents, hundreds of chunks — an exact scan is both faster and more accurate than an
// approximate-nearest-neighbour database, and it serialises to JSON for free, which is
// what makes per-session uploaded indexes possible without a database.

import { makeEmbeddings } from "./embeddings";
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from "./env";
import type { Chunk, DocumentIndex, EmbeddedChunk, ScoredChunk } from "./types";

export const DEFAULT_TOP_K = 5;

/**
 * Similarity between two unit-length vectors.
 *
 * Because every vector is normalised at embed time, the dot product IS the cosine, so
 * the magnitude terms are skipped. Callers must not pass unnormalised vectors.
 */
export function dotProduct(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}.`);
  }

  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

/** Embed chunks and package them into a self-describing, serialisable index. */
export async function buildIndex(chunks: readonly Chunk[]): Promise<DocumentIndex> {
  if (chunks.length === 0) throw new Error("Cannot build an index from zero chunks.");

  const embeddings = makeEmbeddings();
  const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.text));

  const embedded: EmbeddedChunk[] = chunks.map((chunk, i) => ({ ...chunk, vector: vectors[i] }));

  return {
    embeddingModel: embeddings.model,
    dims: embeddings.dims,
    documents: [...new Set(chunks.map((chunk) => chunk.source))],
    chunks: embedded,
  };
}

/**
 * Guard against searching an index built by a different embedding model.
 *
 * This failure is nastier than a crash if left unchecked: mismatched vectors still
 * produce numbers, so retrieval silently returns nonsense that the model then dutifully
 * cites. Failing loudly is the only safe option.
 */
export function assertIndexIsCurrent(index: DocumentIndex): void {
  if (index.embeddingModel !== EMBEDDING_MODEL || index.dims !== EMBEDDING_DIMS) {
    throw new Error(
      `This index was built with ${index.embeddingModel}@${index.dims} dims but the app ` +
        `is configured for ${EMBEDDING_MODEL}@${EMBEDDING_DIMS}. Rebuild the index ` +
        "(npm run build:index) or re-upload the document.",
    );
  }
}

/**
 * Find the chunks whose meaning is closest to the query.
 *
 * Deliberately returns no citation numbers. Numbering is the CitationRegister's job,
 * because the agent may call this many times per question and numbers have to stay
 * stable and unique across all of those calls.
 */
export async function search(
  index: DocumentIndex,
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<ScoredChunk[]> {
  assertIndexIsCurrent(index);

  const embeddings = makeEmbeddings();
  const queryVector = await embeddings.embedQuery(query);

  return index.chunks
    .map((chunk) => ({ chunk, score: dotProduct(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({
      text: chunk.text,
      source: chunk.source,
      page: chunk.page,
      score,
    }));
}
