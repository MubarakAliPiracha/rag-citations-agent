// Stage 6 — CLI smoke test.
//
// A simple loop: type a question -> get a cited answer -> repeat. This proves the
// whole engine works in the terminal before we wrap it in a web page (Stage 7).
//
// Run it:  npm run cli   (or:  npx tsx main.ts)

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { answerQuestion } from "./answer.ts";

const rl = createInterface({ input, output });

console.log("Ask questions about your PDFs. Type 'exit' to quit.\n");

while (true) {
  const question = (await rl.question("You: ")).trim();
  if (!question) continue;
  if (question.toLowerCase() === "exit") break;

  try {
    const { answer, sources } = await answerQuestion(question);
    console.log("\nAgent: " + answer + "\n");
    if (sources.length > 0) {
      console.log("Sources:");
      for (const s of sources) console.log(`  [${s.n}] ${s.label}`);
    }
    console.log("");
  } catch (err) {
    console.error("⚠️  " + (err as Error).message + "\n");
  }
}

rl.close();
