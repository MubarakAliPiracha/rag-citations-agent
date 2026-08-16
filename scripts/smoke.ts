// Live end-to-end smoke test against the real APIs.
//
// The automated test suite mocks the model so it can run fast and offline. This script
// does the opposite: it spends real quota to prove the agent genuinely drives its own
// tool loop, that multi-hop questions trigger more than one search, and that an
// unanswerable question still gets refused.
//
// Run it:  npm run smoke

import { readFile } from "node:fs/promises";

import { askStreaming } from "../lib/agent";
import { buildIndex } from "../lib/vector-index";
import { chunkText } from "../lib/chunk";

const SAMPLE_PATH = "sample/nimbus-handbook.md";

const QUESTIONS = [
  // Single fact, should need one search.
  "How many vacation days do full-time employees get?",
  // Two unrelated sections, should need two searches. A plain chain cannot do this.
  "How does parental leave compare to the vacation policy?",
  // Not in the document at all, must refuse.
  "What is the CEO's favourite pizza topping?",
];

const markdown = await readFile(SAMPLE_PATH, "utf8");
const chunks = await chunkText(markdown, "nimbus-handbook.md");
console.log(`Chunked ${SAMPLE_PATH} into ${chunks.length} passages.`);

console.time("Built index in");
const index = await buildIndex(chunks);
console.timeEnd("Built index in");
console.log(`Index: ${index.chunks.length} chunks @ ${index.dims} dims via ${index.embeddingModel}\n`);

for (const question of QUESTIONS) {
  console.log("=".repeat(72));
  console.log("Q: " + question);
  console.log("=".repeat(72));

  for await (const event of askStreaming(index, question)) {
    switch (event.type) {
      case "search_start":
        console.log(`  🔎 search_documents("${event.query}")`);
        break;
      case "search_end":
        console.log(`     → ${event.hits} hits: ${event.labels.join(", ")}`);
        break;
      case "error":
        console.log(`  ⚠️  ${event.message}`);
        break;
      case "done": {
        const { result } = event;
        console.log(`\n  searches run:      ${result.traces.length}`);
        console.log(`  refused:           ${result.refused}`);
        console.log(`  bad citations:     ${JSON.stringify(result.invalidCitations)}`);
        console.log(`\n  ${result.answer.replace(/\n/g, "\n  ")}\n`);
        if (result.sources.length > 0) {
          console.log("  Sources:");
          for (const source of result.sources) {
            console.log(`    [${source.n}] ${source.label}  (score ${source.score.toFixed(3)})`);
          }
        }
        break;
      }
    }
  }
  console.log("");
}
