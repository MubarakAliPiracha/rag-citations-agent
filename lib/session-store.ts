// Where an uploaded document's index lives between requests.
//
// Serverless functions share no memory, so the index built during an upload is gone by
// the time the next question arrives. It has to be written somewhere both requests can
// reach.
//
// Lookups go by session id rather than by a URL supplied by the browser. That is a
// security decision, not a stylistic one: letting the client hand the server a URL to
// fetch is a server-side request forgery hole, and no amount of validating the hostname
// is as safe as never accepting the URL in the first place.
//
// Vercel Blob is used in production. Locally, where there is usually no blob token, it
// falls back to a folder on disk so `npm run dev` works with no cloud setup at all.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { list, put } from "@vercel/blob";

import type { DocumentIndex } from "./types";

const BLOB_PREFIX = "indexes/";
const LOCAL_CACHE_DIR = join(process.cwd(), ".cache", "indexes");

/**
 * Decimal places kept per vector component.
 *
 * Vectors are unit length, so six decimals is well inside the precision the embedding
 * model actually carries, while cutting the serialised index to roughly a third of the
 * size of full float output. On a long PDF that is the difference between a snappy
 * round-trip and a multi-megabyte one.
 */
const VECTOR_PRECISION = 6;

function usingBlobStorage(): boolean {
  return Boolean((process.env.BLOB_READ_WRITE_TOKEN ?? "").trim());
}

/** A fresh, unguessable session id. */
export function newSessionId(): string {
  return randomUUID();
}

/**
 * Reject anything that is not a plain UUID.
 *
 * The id becomes part of a storage path, so this is the boundary that stops "../" and
 * other path tricks from escaping the prefix.
 */
export function isValidSessionId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function serialize(index: DocumentIndex): string {
  const compact = {
    ...index,
    chunks: index.chunks.map((chunk) => ({
      ...chunk,
      vector: chunk.vector.map((value) => Number(value.toFixed(VECTOR_PRECISION))),
    })),
  };
  return JSON.stringify(compact);
}

export async function saveSessionIndex(sessionId: string, index: DocumentIndex): Promise<void> {
  if (!isValidSessionId(sessionId)) throw new Error("Invalid session id.");

  const body = serialize(index);

  if (!usingBlobStorage()) {
    await mkdir(LOCAL_CACHE_DIR, { recursive: true });
    await writeFile(join(LOCAL_CACHE_DIR, `${sessionId}.json`), body, "utf8");
    return;
  }

  await put(`${BLOB_PREFIX}${sessionId}.json`, body, {
    access: "public",
    contentType: "application/json",
    // Deterministic path so the session id alone is enough to find it again.
    addRandomSuffix: false,
    // Uploaded documents are disposable demo data; expiring them keeps storage bounded
    // and means a visitor's file does not linger indefinitely.
    cacheControlMaxAge: 60 * 60,
  });
}

export async function loadSessionIndex(sessionId: string): Promise<DocumentIndex | null> {
  if (!isValidSessionId(sessionId)) return null;

  if (!usingBlobStorage()) {
    try {
      const body = await readFile(join(LOCAL_CACHE_DIR, `${sessionId}.json`), "utf8");
      return JSON.parse(body) as DocumentIndex;
    } catch {
      return null;
    }
  }

  // Resolve the id to a URL through the storage API rather than trusting one from the
  // client, then fetch it.
  const { blobs } = await list({ prefix: `${BLOB_PREFIX}${sessionId}`, limit: 1 });
  const blob = blobs[0];
  if (!blob) return null;

  const response = await fetch(blob.url);
  if (!response.ok) return null;

  return (await response.json()) as DocumentIndex;
}
