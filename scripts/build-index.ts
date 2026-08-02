// Build-time indexer for the Vercel deployment.
//
// Why this exists: Vercel runs "serverless" functions that can't hold a 90 MB local
// embedding model in memory. So instead of embedding at runtime, we pre-compute the
// whole search index ONCE, here, and commit the result (api/index.json). The deployed
// function then only has to embed the incoming question — one tiny API call.
//
// Run it:  npx tsx scripts/build-index.ts   (needs GOOGLE_API_KEY in .env)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import dotenv from "dotenv";

dotenv.config({ override: true });

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768; // smaller vectors → smaller index, still strong retrieval
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

const DOC_LABEL = "Nimbus Coffee Co. Handbook";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = resolve(here, "../sample/nimbus-handbook.md");
const OUT_PATH = resolve(here, "../api/index.json");

type Chunk = { text: string; label: string; vector: number[] };

function getApiKey(): string {
  const key = (process.env.GOOGLE_API_KEY ?? "").trim();
  if (!key) throw new Error("GOOGLE_API_KEY missing in .env — needed to embed the sample.");
  return key;
}

// Split the markdown into { heading, body } sections on "## " headings.
function splitIntoSections(markdown: string): { heading: string; body: string }[] {
  const lines = markdown.split("\n");
  const sections: { heading: string; body: string }[] = [];
  let heading = "Introduction";
  let body: string[] = [];

  const flush = () => {
    const text = body.join("\n").trim();
    if (text) sections.push({ heading, body: text });
    body = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      heading = line.replace(/^##\s+/, "").trim();
    } else if (!line.startsWith("# ")) {
      body.push(line);
    }
  }
  flush();
  return sections;
}

// Call Google's embedding endpoint for one piece of text.
async function embed(text: string, taskType: "RETRIEVAL_DOCUMENT"): Promise<number[]> {
  const key = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBED_DIMS,
    }),
  });
  if (!res.ok) throw new Error(`Embed failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!values) throw new Error(`Embed response had no values: ${JSON.stringify(data)}`);
  return values;
}

async function main(): Promise<void> {
  const markdown = readFileSync(SAMPLE_PATH, "utf8");
  const sections = splitIntoSections(markdown);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const pieces = await splitter.splitText(section.body);
    for (const text of pieces) {
      const vector = await embed(text, "RETRIEVAL_DOCUMENT");
      chunks.push({ text, label: `${DOC_LABEL} — ${section.heading}`, vector });
      console.log(`  embedded: ${section.heading} (${text.length} chars)`);
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify({ model: EMBED_MODEL, dims: EMBED_DIMS, chunks }, null, 0),
  );
  console.log(`\n✅ Wrote ${chunks.length} chunks to api/index.json`);
}

await main();
