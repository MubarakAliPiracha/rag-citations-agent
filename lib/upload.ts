// Turning an uploaded file into a searchable session.
//
// Everything here is a boundary check. The input is a file from an anonymous visitor on
// a public URL, so each limit exists to stop one specific way that could go wrong:
// oversized bodies, non-PDF payloads, and documents long enough that embedding them
// would be slow and expensive.

import { buildIndex } from "./vector-index";
import { chunkPdf } from "./chunk";
import { newSessionId, saveSessionIndex } from "./session-store";
import type { DocumentIndex } from "./types";

/** Vercel caps a serverless request body at 4.5 MB; stay clear of the edge. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Ceiling on passages per upload.
 *
 * Embedding is billed and rate-limited per request, and a 400-chunk document already
 * takes several batched calls. Beyond this the demo stops feeling instant and starts
 * being a way to burn someone else's quota.
 */
export const MAX_CHUNKS = 400;

const PDF_MAGIC = "%PDF-";

export interface UploadResult {
  readonly sessionId: string;
  readonly fileName: string;
  readonly chunks: number;
  readonly pages: number;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Confirm the bytes really are a PDF.
 *
 * The filename and the browser-supplied MIME type are both attacker-controlled, so the
 * only trustworthy signal is the file's own magic number.
 */
function assertLooksLikePdf(bytes: Uint8Array, fileName: string): void {
  const header = new TextDecoder("latin1").decode(bytes.slice(0, PDF_MAGIC.length));

  if (header !== PDF_MAGIC) {
    throw new UploadError(
      `"${fileName}" does not look like a PDF. Please upload a real PDF file.`,
    );
  }
}

/** Validate, chunk, embed and store an uploaded PDF. */
export async function processUpload(file: File): Promise<UploadResult> {
  if (file.size === 0) throw new UploadError("That file is empty.");

  if (file.size > MAX_UPLOAD_BYTES) {
    const limitMb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
    const actualMb = (file.size / 1024 / 1024).toFixed(1);
    throw new UploadError(`That file is ${actualMb} MB. The limit is ${limitMb} MB.`, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  assertLooksLikePdf(bytes, file.name);

  const chunks = await chunkPdf(bytes, file.name);

  if (chunks.length > MAX_CHUNKS) {
    throw new UploadError(
      `That document has ${chunks.length} passages, over the ${MAX_CHUNKS} limit for this demo. ` +
        "Try a shorter document, or run the project locally where you can raise the cap.",
      413,
    );
  }

  const index: DocumentIndex = await buildIndex(chunks);
  const sessionId = newSessionId();
  await saveSessionIndex(sessionId, index);

  return {
    sessionId,
    fileName: chunks[0].source,
    chunks: chunks.length,
    pages: Math.max(...chunks.map((chunk) => chunk.page)),
  };
}
