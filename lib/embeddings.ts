// Turning text into meaning-vectors.
//
// We talk to Google's embedding REST API directly rather than through the LangChain
// wrapper for two reasons the wrapper does not expose:
//
//   1. outputDimensionality — lets us truncate 3072 -> 768 dims, shrinking a stored
//      index ~4x for almost no quality loss (the model is Matryoshka-trained).
//   2. taskType — a question and a passage get embedded ASYMMETRICALLY. Telling the
//      model "this is a search query" vs "this is a document being indexed" measurably
//      improves retrieval, because a question rarely looks like its own answer.
//
// The class still extends LangChain's Embeddings base, so it drops into anything that
// expects an embeddings object.

import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";

import { EMBEDDING_DIMS, EMBEDDING_MODEL, requireGoogleApiKey } from "./env";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Google caps a batchEmbedContents call at 100 requests. */
const MAX_BATCH = 100;

type TaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

interface GoogleEmbeddingsParams extends EmbeddingsParams {
  readonly model?: string;
  readonly dims?: number;
  readonly apiKey?: string;
}

interface EmbedResponse {
  readonly embeddings?: readonly { readonly values?: readonly number[] }[];
}

/**
 * Scale a vector to unit length.
 *
 * Required, not cosmetic: gemini-embedding-001 only returns normalised vectors at its
 * full 3072 dims. Truncated outputs come back unnormalised, and comparing unnormalised
 * vectors by dot product silently ranks longer vectors higher regardless of meaning.
 * Normalising here means cosine similarity later is just a dot product.
 */
export function normalize(vector: readonly number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;

  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return [...vector];

  return vector.map((value) => value / magnitude);
}

export class GoogleEmbeddings extends Embeddings {
  readonly model: string;
  readonly dims: number;
  private readonly apiKey: string;

  constructor(params: GoogleEmbeddingsParams = {}) {
    super(params);
    this.model = params.model ?? EMBEDDING_MODEL;
    this.dims = params.dims ?? EMBEDDING_DIMS;
    this.apiKey = params.apiKey ?? requireGoogleApiKey();
  }

  /** Embed a user's question. */
  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text], "RETRIEVAL_QUERY");
    return vector;
  }

  /** Embed passages being indexed. */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, "RETRIEVAL_DOCUMENT");
  }

  private async embed(texts: readonly string[], taskType: TaskType): Promise<number[][]> {
    const vectors: number[][] = [];

    for (let start = 0; start < texts.length; start += MAX_BATCH) {
      const batch = texts.slice(start, start + MAX_BATCH);
      vectors.push(...(await this.embedBatch(batch, taskType)));
    }

    return vectors;
  }

  private async embedBatch(texts: readonly string[], taskType: TaskType): Promise<number[][]> {
    const url = `${API_ROOT}/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: this.dims,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding request failed (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as EmbedResponse;
    const embeddings = data.embeddings;

    if (!embeddings || embeddings.length !== texts.length) {
      throw new Error(
        `Embedding response shape unexpected: asked for ${texts.length}, got ${embeddings?.length ?? 0}.`,
      );
    }

    return embeddings.map((embedding, i) => {
      const values = embedding.values;
      if (!values?.length) throw new Error(`Embedding ${i} came back empty.`);
      return normalize(values);
    });
  }
}

/**
 * The single place embeddings are constructed.
 *
 * Mirrors makeModel(). Swapping in a different embedding backend later (a local model,
 * a different vendor) is a change to this function and nothing else.
 */
export function makeEmbeddings(): GoogleEmbeddings {
  return new GoogleEmbeddings();
}
