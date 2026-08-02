// Vercel serverless function — the deployed "brain".
//
// This is a self-contained version of the RAG answer step, built for serverless:
// it has NO heavy imports (no local embedding model), only `fetch` + the pre-built
// index (api/index.json). Flow per request:
//   1. embed the question with Google's embedding API
//   2. cosine-similarity search over the pre-computed chunk vectors (top 4)
//   3. ask Gemini to answer using ONLY those chunks, with citations or an honest refusal
//
// Requires the GOOGLE_API_KEY environment variable to be set in the Vercel project.

import indexData from "./index.json";

const REFUSAL = "I don't know based on the provided documents.";
const CHAT_MODEL = "gemini-flash-latest";
const TOP_K = 4;

const SYSTEM_PROMPT = [
  "You answer questions using ONLY the numbered sources provided by the user.",
  "Rules, follow all of them:",
  "1. Use only facts found in the sources. Never use outside knowledge.",
  "2. After each claim, cite the source number(s) it came from, like [1] or [2][3].",
  `3. If the answer is not in the sources, reply with exactly: "${REFUSAL}" and nothing else.`,
  "4. Do not guess, infer beyond the text, or pad the answer.",
].join("\n");

type IndexChunk = { text: string; label: string; vector: number[] };
type Index = { model: string; dims: number; chunks: IndexChunk[] };

const index = indexData as Index;

// Minimal request/response shapes (Vercel passes Node-like objects).
interface Req {
  method?: string;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  json(data: unknown): void;
}

function apiKey(): string {
  const key = (process.env.GOOGLE_API_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "GOOGLE_API_KEY is not set on the server. Add it in the Vercel project's " +
        "Environment Variables, then redeploy.",
    );
  }
  return key;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function embedQuestion(question: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${index.model}:embedContent?key=${apiKey()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${index.model}`,
      content: { parts: [{ text: question }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: index.dims,
    }),
  });
  if (!res.ok) throw new Error(`Embedding failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!values) throw new Error("Embedding response had no values.");
  return values;
}

async function generateAnswer(question: string, context: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey()}`;
  const userMessage = `Sources:\n\n${context}\n\nQuestion: ${question}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Answer generation failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Answer response had no text.");
  return text.trim();
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  // Vercel usually parses JSON bodies; handle string bodies too, just in case.
  const raw = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const question = String((raw as { question?: unknown })?.question ?? "").trim();
  if (!question) {
    res.status(400).json({ error: "Please enter a question." });
    return;
  }

  try {
    const queryVector = await embedQuestion(question);

    const ranked = index.chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    const sources = ranked.map((item, i) => ({ n: i + 1, label: item.chunk.label }));
    const context = ranked
      .map((item, i) => `[${i + 1}] (${item.chunk.label})\n${item.chunk.text}`)
      .join("\n\n");

    const answer = await generateAnswer(question, context);
    res.status(200).json({ answer, sources });
  } catch (err) {
    res.status(200).json({ error: (err as Error).message });
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
