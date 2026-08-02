// Stage 4 + 5 — Grounded answer with citations (and honest "I don't know").
//
// Big picture: retrieve the relevant chunks, hand them to Claude as the ONLY allowed
// source, and require a citation after every claim. If the answer isn't in the chunks,
// Claude must refuse instead of guessing. This is the whole value of the project.
//
// Run it:  npx tsx answer.ts "what did they build at Coolhand?"

import { pathToFileURL } from "node:url";

import { retrieve } from "./retrieve.ts";
import { sourceLabel } from "./ingest.ts";
import { makeModel } from "./llm.ts";

const REFUSAL = "I don't know based on the provided documents.";

// The rules that force grounding + citations + refusal. This prompt IS the product.
const SYSTEM_PROMPT = [
  "You answer questions using ONLY the numbered sources provided by the user.",
  "Rules, follow all of them:",
  "1. Use only facts found in the sources. Never use outside knowledge.",
  "2. After each claim, cite the source number(s) it came from, like [1] or [2][3].",
  `3. If the answer is not in the sources, reply with exactly: "${REFUSAL}" and nothing else.`,
  "4. Do not guess, infer beyond the text, or pad the answer.",
].join("\n");

export type Answer = {
  answer: string;
  sources: { n: number; label: string }[];
};

// Retrieve chunks for the question, then ask Claude to answer grounded + cited.
export async function answerQuestion(question: string): Promise<Answer> {
  const chunks = await retrieve(question);

  // Number each chunk and label it, e.g. "[1] (Mubarak_Ali_Piracha 2.pdf p.1)".
  const sources = chunks.map((chunk, i) => ({ n: i + 1, label: sourceLabel(chunk) }));

  const context = chunks
    .map((chunk, i) => `[${i + 1}] (${sourceLabel(chunk)})\n${chunk.pageContent}`)
    .join("\n\n");

  const userMessage = `Sources:\n\n${context}\n\nQuestion: ${question}`;

  const model = makeModel();
  const response = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ]);

  return { answer: String(response.content).trim(), sources };
}

const isRunDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) {
  const question = process.argv[2] ?? "What did they build at Coolhand Labs?";
  console.log(`Question: "${question}"\n`);

  try {
    const { answer, sources } = await answerQuestion(question);
    console.log("Answer:\n" + answer + "\n");
    console.log("Sources it could draw from:");
    for (const s of sources) console.log(`  [${s.n}] ${s.label}`);
  } catch (err) {
    console.error("⚠️  " + (err as Error).message);
    process.exitCode = 1; // clean exit (avoids the libuv teardown assertion on Windows)
  }
}
