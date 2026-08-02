# 📚 RAG Agent with Citation Grounding

> Ask questions about your own PDFs and get answers **with citations** (file + page) — or an honest **"I don't know based on the provided documents"** when the answer isn't there.

A full-stack **Retrieval-Augmented Generation (RAG)** agent built in TypeScript. It solves the single biggest reason companies hesitate to ship LLMs: **hallucination**. Every claim is grounded in your documents and cited, so you can verify it — and when the answer isn't in your files, the agent refuses instead of making something up.

---

## ✨ Why this exists

An LLM on its own will confidently invent facts. That's a dealbreaker for anything real — legal, medical, finance, internal docs.

This project fixes that with two guarantees:

1. **Citations** — every claim points to the exact source (`file.pdf p.3`), so it's verifiable.
2. **Honest refusal** — if the answer isn't in your documents, it says so instead of guessing.

Verifiable + honest = **trustworthy = deployable.**

---

## 🎬 What it looks like

**Answerable question** → grounded answer with inline citations:

```
Q: What are their technical skills and programming languages?

A: Their technical skills include:
   • Languages: Python, JavaScript, TypeScript, SQL, C++, Java, C [1]
   • Web: React.js, Node.js, Next.js, FastAPI, Tailwind CSS [1]
   • Databases: PostgreSQL, MySQL, MongoDB [1]

Sources:
   [1] resume.pdf p.1
```

**Unanswerable question** → honest refusal, no hallucination:

```
Q: What is their favorite pizza topping?

A: I don't know based on the provided documents.
```

---

## 🧠 How it works

```
   YOUR PDFs                                        YOUR QUESTION
      |                                                   |
   [1] chop into chunks                          [3] embed the question
      |                                                   |
   [2] embed + store  ------>  vector store  <---- [3] similarity search
                                                          |
                                                   [4] send top chunks + question to the LLM
                                                          |
                                                   [5] answer WITH citations  /  "I don't know"
```

| Stage | What happens | Key detail |
|-------|--------------|------------|
| **1. Ingest** | PDFs are loaded and split into chunks | `500`-char chunks, `100`-char overlap; page numbers preserved for citations |
| **2. Embed & store** | Each chunk becomes a meaning-vector | Local `all-MiniLM-L6-v2` model — **runs offline, no API cost** |
| **3. Retrieve** | Find the chunks closest in meaning to the question | Top-`4` by cosine similarity |
| **4–5. Answer** | LLM writes the answer using **only** those chunks | `temperature 0`, mandatory `[n]` citations, strict refusal rule |

The API key never leaves the server — the browser only sends a question and receives `{ answer, sources }`.

---

## 🛠️ Tech stack

| Layer | Technology |
|-------|-----------|
| **Language / runtime** | TypeScript, Node.js, [tsx](https://github.com/privatenumber/tsx) (no build step) |
| **RAG framework** | [LangChain](https://js.langchain.com/) (`0.3` line) |
| **Embeddings** | HuggingFace Transformers — `Xenova/all-MiniLM-L6-v2` (local) |
| **Vector store** | LangChain `MemoryVectorStore` (in-memory, cosine similarity) |
| **PDF parsing** | `pdf-parse` via LangChain `PDFLoader` |
| **LLM (swappable)** | Anthropic **Claude** or Google **Gemini** — one config change |
| **Backend** | Express (`POST /ask`) |
| **Frontend** | Vanilla HTML/CSS/JS — responsive, accessible chat UI |
| **Config / validation** | dotenv, Zod |

---

## 🚀 Getting started

### 1. Install

```bash
npm install
```

### 2. Add your documents

Drop one or more PDFs into the `docs/` folder.

```
docs/
  my-handbook.pdf
  research-paper.pdf
```

### 3. Add an API key

Copy the example env file and fill in **one** provider:

```bash
cp .env.example .env
```

**Option A — Google Gemini (free, no credit card):**
Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), then in `.env`:

```
LLM_PROVIDER=google
GOOGLE_API_KEY=your-key-here
```

**Option B — Anthropic Claude:**
Get a key at [console.anthropic.com](https://console.anthropic.com), then in `.env`:

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key-here
```

### 4. Run

**Web app** (recommended):

```bash
npm run web
# open http://localhost:3000
```

**Command line:**

```bash
npm run cli
```

---

## 📜 Available scripts

| Command | What it does |
|---------|--------------|
| `npm run web` | Start the web app on `http://localhost:3000` |
| `npm run cli` | Ask questions in the terminal |
| `npm run ingest` | Stage 1 — load + chunk your PDFs (prints sample chunks) |
| `npm run store` | Stage 2 — build the vector store (similarity-search demo) |
| `npm run retrieve` | Stage 3 — test retrieval: `npm run retrieve "your question"` |

---

## 🗂️ Project structure

```
.
├── ingest.ts        # Stage 1: load PDFs + chunk them
├── store.ts         # Stage 2: local embeddings + in-memory vector store
├── retrieve.ts      # Stage 3: semantic similarity search
├── answer.ts        # Stage 4+5: grounded answer with citations + refusal
├── llm.ts           # Swappable LLM factory (Claude ⇆ Gemini)
├── env.ts           # Environment loader + friendly key errors
├── main.ts          # CLI interface
├── server.ts        # Express backend (POST /ask)
├── public/
│   └── index.html   # Chat web UI (vanilla JS)
└── docs/            # ← your PDFs go here (gitignored)
```

---

## 🎯 Design highlights

- **Grounding is enforced by prompt, not hope.** A strict system prompt at `temperature 0` requires a `[n]` citation after every claim and a fixed refusal string when evidence is missing.
- **Provider-agnostic LLM layer.** A single `makeModel()` factory over LangChain's `BaseChatModel` means swapping Claude ⇆ Gemini (or adding another) is a one-line change — no SDK lock-in.
- **Fully local embeddings.** Semantic search runs on-device with `all-MiniLM-L6-v2`; no embedding API calls, no per-query cost.
- **Production-minded.** API keys stay server-side, inputs are validated, and failures (missing key, no credit) return clean messages instead of crashing.
- **Warm-start caching.** PDFs are embedded once per process via a memoized promise and shared across concurrent requests.

---

## 🗺️ Roadmap

- [ ] Persistent vector store (Chroma / pgvector) to scale beyond in-memory
- [ ] Chunking-quality tuning for cleaner top-K ranking
- [ ] Automated test suite
- [ ] **MCP server** — expose the RAG engine as a tool inside Claude Desktop/Code
- [ ] Observability (cost / latency / failure tracking)

---

## 🌐 Deploy your own (Vercel)

This repo is ready to deploy as a live web app on Vercel's free tier.

Because serverless functions can't hold the local embedding model in memory, the
**deployed** version uses a different, serverless-friendly setup — swapped in without
changing the core idea:

| | Local (`npm run web`) | Deployed (Vercel) |
|---|---|---|
| Embeddings | Local `all-MiniLM-L6-v2` | Google embedding API (`gemini-embedding-001`) |
| Documents | Your PDFs in `docs/` | Pre-built index of a sample handbook (`api/index.json`) |
| Server | Express (always on) | Serverless function (`api/ask.ts`) |

**One-click deploy:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/MubarakAliPiracha/rag-citations-agent&env=GOOGLE_API_KEY&envDescription=Free%20Gemini%20API%20key%20from%20aistudio.google.com/apikey)

Or manually:

1. Import this repo at [vercel.com/new](https://vercel.com/new).
2. Add an environment variable **`GOOGLE_API_KEY`** (free key from
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
3. Deploy. Done.

**Rebuilding the deployed index** (after editing `sample/nimbus-handbook.md`):

```bash
npx tsx scripts/build-index.ts   # regenerates api/index.json, then commit it
```

## 📄 License

MIT
