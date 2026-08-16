// Terminal interface to the same agent the web app uses.
//
// Useful for iterating on the prompt or on chunking without a browser in the way, and it
// proves the agent is genuinely decoupled from the UI: identical code path, different
// front end.
//
// Run it:  npm run cli            (asks about your PDFs in docs/, or the sample)
//          npm run cli -- --sample (force the bundled sample handbook)

import { createInterface } from "node:readline/promises";
import { readdir, readFile } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import { join } from "node:path";

import { askStreaming } from "../lib/agent";
import { buildIndex } from "../lib/vector-index";
import { chunkPdf, chunkText } from "../lib/chunk";
import type { Chunk, DocumentIndex } from "../lib/types";

const DOCS_DIR = "docs";
const SAMPLE_PATH = "sample/nimbus-handbook.md";

async function findLocalPdfs(): Promise<string[]> {
  try {
    const entries = await readdir(DOCS_DIR);
    return entries.filter((name) => name.toLowerCase().endsWith(".pdf"));
  } catch {
    return [];
  }
}

/** Prefer the user's own PDFs; fall back to the sample so the CLI always works. */
async function loadIndex(forceSample: boolean): Promise<DocumentIndex> {
  const pdfs = forceSample ? [] : await findLocalPdfs();

  if (pdfs.length === 0) {
    const markdown = await readFile(SAMPLE_PATH, "utf8");
    const chunks = await chunkText(markdown, "nimbus-handbook.md");
    console.log(`Using the sample handbook (${chunks.length} passages).`);
    return buildIndex(chunks);
  }

  const chunks: Chunk[] = [];
  for (const name of pdfs) {
    const bytes = new Uint8Array(await readFile(join(DOCS_DIR, name)));
    chunks.push(...(await chunkPdf(bytes, name)));
  }

  console.log(`Indexed ${pdfs.length} PDF(s) from ${DOCS_DIR}/ (${chunks.length} passages).`);
  return buildIndex(chunks);
}

const forceSample = process.argv.includes("--sample");
const index = await loadIndex(forceSample);

const rl = createInterface({ input, output });
console.log("\nAsk a question, or type 'exit' to quit.\n");

while (true) {
  const question = (await rl.question("You: ")).trim();
  if (!question) continue;
  if (question.toLowerCase() === "exit") break;

  console.log("");

  for await (const event of askStreaming(index, question)) {
    switch (event.type) {
      case "search_start":
        process.stdout.write(`  🔎 ${event.query}`);
        break;
      case "search_end":
        console.log(` → ${event.hits} passages`);
        break;
      case "error":
        console.log(`  ⚠️  ${event.message}`);
        break;
      case "done": {
        const { result } = event;
        console.log(`\nAgent: ${result.answer}\n`);
        if (result.sources.length > 0) {
          console.log("Sources:");
          for (const source of result.sources) {
            console.log(`  [${source.n}] ${source.label}`);
          }
          console.log("");
        }
        break;
      }
    }
  }
}

rl.close();
