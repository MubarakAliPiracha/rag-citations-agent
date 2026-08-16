// Turning a raw file into citable chunks.
//
// Chunking is the highest-leverage knob in the whole system. Too large and every answer
// drags in irrelevant text, which both dilutes the meaning-vector and gives the model
// room to wander. Too small and a sentence gets severed from the context that made it
// meaningful. The overlap exists so a fact sitting on a chunk boundary appears whole in
// at least one chunk.

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { extractText, getDocumentProxy } from "unpdf";

import type { Chunk } from "./types";

export const CHUNK_SIZE = 900;
export const CHUNK_OVERLAP = 150;

/** Chunks shorter than this are boilerplate (page numbers, stray headers) and add only noise. */
const MIN_CHUNK_CHARS = 60;

/**
 * Split on the most meaningful boundary that fits, in descending order of preference:
 * paragraph, then line, then sentence, then word. Falling back to the next separator only
 * when a chunk still does not fit is what keeps chunks from cutting mid-thought.
 */
function makeSplitter(): RecursiveCharacterTextSplitter {
  return new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });
}

/** Collapse the ragged whitespace PDF extraction leaves behind. */
function tidy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip any directory component so a citation label never exposes a server path. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/**
 * Split already-extracted per-page text into chunks.
 *
 * Pages are chunked independently and never merged, because a chunk spanning two pages
 * could not be honestly cited to either one.
 */
export async function chunkPages(pages: readonly string[], source: string): Promise<Chunk[]> {
  const splitter = makeSplitter();
  const chunks: Chunk[] = [];

  for (const [pageIndex, rawPageText] of pages.entries()) {
    const pageText = tidy(rawPageText);
    if (!pageText) continue;

    const pieces = await splitter.splitText(pageText);

    for (const piece of pieces) {
      const text = piece.trim();
      if (text.length < MIN_CHUNK_CHARS) continue;
      chunks.push({ text, source, page: pageIndex + 1 });
    }
  }

  return chunks;
}

/**
 * Extract a PDF into citable chunks.
 *
 * unpdf is used rather than pdf-parse because it is built for serverless: no native
 * bindings and no filesystem probing at import time, both of which break on Vercel.
 */
export async function chunkPdf(data: Uint8Array, fileName: string): Promise<Chunk[]> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });

  const pages = Array.isArray(text) ? text : [text];
  const chunks = await chunkPages(pages, fileNameOf(fileName));

  if (chunks.length === 0) {
    throw new Error(
      `No readable text found in "${fileNameOf(fileName)}". ` +
        "Scanned or image-only PDFs need OCR before they can be searched.",
    );
  }

  return chunks;
}

/**
 * Chunk a Markdown or plain-text file.
 *
 * Markdown has no pages, so every heading starts a new one. Splitting on headings rather
 * than on the title alone matters for citations: if the whole file collapses into "p.1",
 * every source carries an identical label, the UI shows one indistinguishable chip, and
 * the model starts citing [1] for facts that came from elsewhere.
 */
export async function chunkText(content: string, fileName: string): Promise<Chunk[]> {
  const pages = content.split(/\f|\n(?=#{1,6} )/g).filter((page) => page.trim());
  return chunkPages(pages, fileNameOf(fileName));
}
