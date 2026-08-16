// The shared vocabulary of the whole app.
//
// Everything downstream — chunking, embedding, retrieval, citations, the agent — speaks
// in these shapes, which is what lets one code path serve both local dev and production.

/** A slice of a document, small enough to hand to the model, still knowing where it came from. */
export interface Chunk {
  readonly text: string;
  /** File name only, e.g. "handbook.pdf". Never a full path — paths leak the server's disk layout. */
  readonly source: string;
  /** 1-based page number, used to build the citation label. */
  readonly page: number;
}

/** A chunk plus its meaning-vector. This is what actually gets stored and searched. */
export interface EmbeddedChunk extends Chunk {
  readonly vector: readonly number[];
}

/**
 * A complete, self-contained searchable index.
 *
 * This is the serialisable unit: it is what the build script writes to disk, what an
 * upload writes to blob storage, and what a request loads back. Because the embedding
 * model and dimensions travel with it, a stale index can never be silently searched
 * with a mismatched query vector.
 */
export interface DocumentIndex {
  readonly embeddingModel: string;
  readonly dims: number;
  /** Distinct source file names contained in this index. */
  readonly documents: readonly string[];
  readonly chunks: readonly EmbeddedChunk[];
}

/** A chunk that came back from a search, with how well it matched. */
export interface ScoredChunk extends Chunk {
  /** Cosine similarity to the query, in [-1, 1]. Higher is closer in meaning. */
  readonly score: number;
}

/**
 * A scored chunk that has been assigned a stable citation number.
 *
 * The number is issued by the CitationRegister, not by the search, because an agent
 * searches repeatedly and per-search numbering would make "[1]" mean different things
 * in different turns of the same answer.
 */
export interface CitedChunk extends ScoredChunk {
  /** The number the model must use to refer to this chunk, e.g. 1 for "[1]". */
  readonly n: number;
}

/** What the UI needs to render one entry in the sources list. */
export interface SourceRef {
  readonly n: number;
  /** Human-readable citation label, e.g. "handbook.pdf p.3". */
  readonly label: string;
  readonly text: string;
  readonly score: number;
}

/** Render a chunk as the citation label shown to the user and the model. */
export function sourceLabel(chunk: Chunk): string {
  return `${chunk.source} p.${chunk.page}`;
}
