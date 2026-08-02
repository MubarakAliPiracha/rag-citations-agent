// Stage 7 (backend) — the "kitchen".
//
// A tiny web server with one job: take a question at POST /ask, run the RAG engine,
// and send back { answer, sources }. It also serves the chat page from public/.
// Your API key stays here on the server — the browser never sees it.
//
// Run it:  npm run web   then open http://localhost:3000

import express from "express";

import { answerQuestion } from "./answer.ts";
import { buildStore } from "./store.ts";

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json()); // parse JSON request bodies
app.use(express.static("public")); // serve the chat page (public/index.html)

// The one endpoint the chat page calls.
app.post("/ask", async (req, res) => {
  const question = String(req.body?.question ?? "").trim();
  if (!question) {
    res.status(400).json({ error: "Please enter a question." });
    return;
  }

  try {
    const { answer, sources } = await answerQuestion(question);
    res.json({ answer, sources });
  } catch (err) {
    // e.g. missing key or no credit — send a clean message the page can display.
    res.json({ error: (err as Error).message });
  }
});

// Warm the cache (read PDFs + embed once) so the first real question is fast.
console.log("Warming up: reading and embedding your PDFs once…");
await buildStore();

app.listen(PORT, () => {
  console.log(`✅ Ready. Open http://localhost:${PORT} in your browser.`);
});
