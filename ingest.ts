// Stage 1 — Load + chunk PDFs.
//
// Big picture: read every PDF in docs/, then chop each into small overlapping
// "chunks". Later stages search these chunks and hand only the relevant ones to Claude.
//
// Run it directly to eyeball the result:  npm run ingest
// Import loadChunks() from other stages to reuse the loading logic.

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Document } from "@langchain/core/documents";

const DOCS_DIR = resolve("docs");

// The #1 quality lever in RAG. Too big = noisy answers; too small = lost context.
// 500 chars ≈ a few sentences; 100-char overlap keeps sentences from being cut in half.
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

// Find every .pdf sitting in docs/.
function findPdfPaths(): string[] {
  const entries = readdirSync(DOCS_DIR);
  return entries
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .map((name) => resolve(DOCS_DIR, name));
}

// Load + chunk all PDFs. Returns one flat list of chunks, each still carrying
// { source, page } metadata — that metadata is what powers citations later (free).
export async function loadChunks(): Promise<Document[]> {
  const pdfPaths = findPdfPaths();

  if (pdfPaths.length === 0) {
    throw new Error(
      `No PDFs found in ${DOCS_DIR}. Drop at least one .pdf file there, then try again.`,
    );
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const allChunks: Document[] = [];

  for (const pdfPath of pdfPaths) {
    // splitPages: true → one "document" per page, so each keeps its page number.
    const loader = new PDFLoader(pdfPath, { splitPages: true });
    const pages = await loader.load();

    // Split each page's text into chunks; chunks inherit the page's metadata.
    const chunks = await splitter.splitDocuments(pages);
    allChunks.push(...chunks);
  }

  return allChunks;
}

// Pull a clean "file p.X" label out of a chunk's metadata (used for the preview + citations).
export function sourceLabel(doc: Document): string {
  const source = String(doc.metadata.source ?? "unknown");
  const fileName = source.split(/[\\/]/).pop() ?? source;
  const page = doc.metadata.loc?.pageNumber ?? doc.metadata.page ?? "?";
  return `${fileName} p.${page}`;
}

// When run directly (not imported), print a small preview so you can sanity-check it.
const isRunDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) {
  const chunks = await loadChunks();
  console.log(`✅ Loaded and chunked ${chunks.length} chunks total.\n`);
  console.log("First 3 chunks:\n");

  for (const chunk of chunks.slice(0, 3)) {
    console.log(`── ${sourceLabel(chunk)} ──`);
    console.log(chunk.pageContent.slice(0, 300).trim());
    console.log("");
  }
}
