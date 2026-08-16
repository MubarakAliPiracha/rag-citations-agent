# 📚 RAG Agent with Citation Grounding

> Ask questions about your own PDFs. Every claim comes back with a citation you can click — or an honest **"I don't know based on the provided documents"** when the answer isn't there.

A full-stack **agentic RAG** system in TypeScript. It targets the single biggest reason companies hesitate to ship LLMs: **hallucination**. The agent decides its own searches, grounds every claim in your documents, and refuses to guess — and the refusal is enforced by code, not by hoping the prompt worked.

---

## ✨ Why this exists

An LLM on its own will confidently invent facts. That's a dealbreaker for anything real — legal, medical, finance, internal docs.

Two guarantees fix that:

1. **Citations** — every claim points at the exact passage (`handbook.pdf p.4`), so it's verifiable.
2. **Honest refusal** — if the answer isn't in your documents, it says so.

Verifiable + honest = **trustworthy = deployable.**

---

## 🤖 Why an *agent*, not a chain

The usual RAG pipeline is a fixed chain — retrieve once, answer:

```
question → retrieve 4 chunks → answer.   Always. No choices.
```

That cannot answer *"How does the parental leave policy compare to the vacation policy?"*, because the two answers live in different chunks and one retrieval only reaches one of them.

Here the model holds the steering wheel. It's given a `search_documents` tool and decides when to call it, what to search for, and whether the results are good enough:

```
Q: How does parental leave compare to the vacation policy?

  🔎 search_documents("parental leave")   → 5 passages
  🔎 search_documents("vacation policy")  → 5 passages
  ✅ Parental leave offers 16 weeks fully paid [2].
     In contrast, vacation is 20 days per year, accrued monthly [1].
```

It also makes refusals *earned* rather than lazy:

```
Q: What is the CEO's favourite pizza topping?

  🔎 search_documents("CEO favourite pizza topping")
  🔎 search_documents("CEO favorite pizza")        ← retried spelling
  🔎 search_documents("CEO pizza topping")         ← retried phrasing
  ✅ I don't know based on the provided documents.
```

Every one of those steps streams to the browser live, so you watch the agent reason instead of taking its word for it.

---

## 🛡️ The catch nobody mentions: agents *weaken* grounding

This is the part worth understanding.

A chain **physically cannot** show the model a question without evidence attached. An agent can simply decide not to search — and a model that skips the search answers from memory, which is exactly the hallucination the project exists to prevent.

So the guarantee is re-established mechanically, in [`lib/citations.ts`](lib/citations.ts). Before any answer reaches the browser:

| Failure | What the guard does |
|---|---|
| Agent never searched | Answer is discarded, replaced with the refusal |
| Answer cites nothing | Discarded — an uncited claim is unverifiable by definition |
| Answer cites `[7]` when only `[1]`–`[3]` exist | Fabricated marker stripped, and the UI reports that it happened |

Citation numbers are also issued by a **register** rather than per-search. Without it, the second search would renumber a passage and the model's earlier `[2]` would silently start pointing somewhere else.

---

## 🧠 How it works

```
   YOUR PDF                                   YOUR QUESTION
      │                                             │
   [1] split into per-page chunks           [4] agent decides what to search
      │                                             │
   [2] embed each chunk                    ┌────────┴─────────┐
      │                                    │  search_documents │◄─── may run
   [3] store as a vector index ◄───────────┤  cosine top-K     │     many times
                                           └────────┬──────────┘
                                                    │
                                        [5] answer with [n] citations
                                                    │
                                        [6] validate every [n] ── fabricated? strip it
                                                    │
                                        [7] stream to the browser
```

| Stage | Detail |
|---|---|
| **Chunk** | 900 chars, 150 overlap. Chunks never span a page, so every one is honestly citable |
| **Embed** | `gemini-embedding-001` truncated to 768 dims (Matryoshka), normalised to unit length |
| **Retrieve** | Exact cosine scan. At demo scale it beats an approximate index and serialises to JSON for free |
| **Agent** | LangChain v1 `createAgent` (LangGraph-backed), max 8 steps, `temperature 0` |
| **Validate** | Every citation checked against what was actually retrieved |

**One detail that punches above its weight:** questions and passages are embedded **asymmetrically** (`RETRIEVAL_QUERY` vs `RETRIEVAL_DOCUMENT`). A question rarely looks like its own answer, and telling the embedding model which role the text plays measurably improves retrieval.

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript |
| **Agent** | LangChain v1 (`createAgent`, tool calling) |
| **LLM** | Google **Gemini** or Anthropic **Claude** — one config change |
| **Embeddings** | `gemini-embedding-001` @ 768 dims, via the REST API |
| **Vector store** | Custom in-memory cosine index (`lib/vector-index.ts`) |
| **PDF parsing** | `unpdf` — serverless-safe, no native bindings |
| **Upload storage** | Vercel Blob, with an on-disk fallback for local dev |
| **Styling** | Tailwind CSS v4, light + dark |
| **Testing** | Vitest — 63 tests, model and network fully mocked |

---

## 🚀 Getting started

```bash
npm install
cp .env.example .env      # add a free key from https://aistudio.google.com/apikey
npm run dev               # http://localhost:3000
```

That's it — the app ships with a pre-embedded sample handbook, so it answers questions immediately. Drop in your own PDF to replace it.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm run cli` | Same agent, in the terminal (uses PDFs in `docs/`, else the sample) |
| `npm test` | Run the test suite |
| `npm run smoke` | Live end-to-end check against the real APIs |
| `npm run build:index` | Rebuild `data/sample-index.json` after editing the sample doc |
| `npm run typecheck` | Type-check without building |

---

## 🗂️ Project structure

```
app/
  page.tsx              # the chat page
  api/ask/route.ts      # streams agent events as NDJSON
  api/upload/route.ts   # PDF → chunks → index → session id
components/             # Chat, AgentTrace, AnswerBody, SourceList, …
lib/
  agent.ts              # createAgent + the streaming event loop
  tools.ts              # search_documents, list_documents
  citations.ts          # citation register + the validation guard
  vector-index.ts       # build + cosine search
  embeddings.ts         # Google embeddings, asymmetric task types
  chunk.ts              # PDF/markdown → citable chunks
  prompt.ts             # the grounding contract
  session-store.ts      # Vercel Blob, with a local-disk fallback
tests/                  # 63 tests, no network
```

---

## 🌐 Deploy your own

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Add environment variable **`GOOGLE_API_KEY`** ([free key](https://aistudio.google.com/apikey)).
3. In the project's **Storage** tab, create a **Blob** store and connect it. That sets `BLOB_READ_WRITE_TOKEN` automatically and is what makes visitor uploads work.
4. Deploy.

Without step 3 everything still works against the sample document; only uploads are disabled.

---

## ⚠️ Known limits

- **Free-tier rate limits.** `gemini-flash-lite-latest` is the default precisely because full Flash allows only 5 requests/min and one agent question can spend four of them. Under load you may still hit a limit; the UI says so plainly rather than hanging.
- **Uploads are capped** at 4 MB and 400 passages, and expire after an hour. This is a public demo, not a document warehouse.
- **Scanned PDFs need OCR.** If a PDF has no embedded text layer, there is nothing to chunk, and the upload says so.
- **The vector index is exact-scan.** Ideal to a few thousand chunks; past that it wants a real vector database.

## 🗺️ Roadmap

- [ ] LangGraph corrective-RAG loop — grade retrieved chunks, rewrite the query, retry
- [ ] Persistent vector store (pgvector / Chroma) to scale past in-memory
- [ ] Multi-document sessions and conversational follow-ups
- [ ] **MCP server** — expose the agent as a tool inside Claude Desktop/Code
- [ ] Observability (cost / latency / refusal-rate tracking)

## 📄 License

MIT
