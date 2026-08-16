// Pre-builds the sample index that ships with the app.
//
// The deployed demo has to answer its first question instantly, with no upload and no
// setup. Embedding the sample handbook at request time would mean a cold-start API call
// on every fresh serverless instance, so it is embedded once here and committed as JSON.
//
// Run it after editing sample/nimbus-handbook.md:  npm run build:index

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { buildIndex } from "../lib/vector-index";
import { chunkText } from "../lib/chunk";

const SOURCE_PATH = "sample/nimbus-handbook.md";
const SOURCE_NAME = "nimbus-handbook.md";
const OUTPUT_PATH = "data/sample-index.json";

/** Match the precision used when storing uploaded indexes, for the same size reasons. */
const VECTOR_PRECISION = 6;

const markdown = await readFile(SOURCE_PATH, "utf8");
const chunks = await chunkText(markdown, SOURCE_NAME);
console.log(`Chunked ${SOURCE_PATH} into ${chunks.length} passages.`);

const index = await buildIndex(chunks);

const compact = {
  ...index,
  chunks: index.chunks.map((chunk) => ({
    ...chunk,
    vector: chunk.vector.map((value) => Number(value.toFixed(VECTOR_PRECISION))),
  })),
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(compact), "utf8");

const sizeKb = Math.round(JSON.stringify(compact).length / 1024);
console.log(
  `Wrote ${OUTPUT_PATH}: ${index.chunks.length} chunks @ ${index.dims} dims ` +
    `via ${index.embeddingModel} (${sizeKb} KB).`,
);
