// Configuration, read once, validated eagerly, with errors a human can act on.
//
// Next.js loads .env itself, but the CLI and the index build script do not, so we load
// dotenv defensively. `override: true` matters: it makes .env win over an already-set
// system variable. Claude Code exports its own ANTHROPIC_API_KEY that is not valid for
// direct API calls, and without override that ghost key silently shadows the real one.

import dotenv from "dotenv";

dotenv.config({ override: true, quiet: true });

/** Which provider writes the answers. */
export type LlmProvider = "google" | "anthropic";

function readTrimmed(name: string): string {
  return (process.env[name] ?? "").trim();
}

export const LLM_PROVIDER: LlmProvider =
  readTrimmed("LLM_PROVIDER").toLowerCase() === "anthropic" ? "anthropic" : "google";

export const GOOGLE_API_KEY = readTrimmed("GOOGLE_API_KEY");
export const ANTHROPIC_API_KEY = readTrimmed("ANTHROPIC_API_KEY");

/**
 * Chat model names. Aliases like "-latest" survive Google retiring specific versions.
 *
 * flash-LITE rather than flash is deliberate. Free-tier quota is per model, and full
 * Flash allows only 5 requests/minute — an agent spends 2-4 of those on a single
 * question, so a public demo would rate-limit itself almost immediately. Flash-lite
 * absorbed a 12-request burst without throttling and handles tool calling just as well.
 */
export const GOOGLE_CHAT_MODEL = readTrimmed("GOOGLE_MODEL") || "gemini-flash-lite-latest";
export const ANTHROPIC_CHAT_MODEL = readTrimmed("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

/** Embedding model. Must match whatever built the index — see DocumentIndex.embeddingModel. */
export const EMBEDDING_MODEL = readTrimmed("EMBEDDING_MODEL") || "gemini-embedding-001";

/**
 * Embedding width. gemini-embedding-001 is Matryoshka-trained, so we can truncate to a
 * shorter vector with very little quality loss. 768 keeps a serialised index ~4x smaller
 * than the 3072 default, which matters a lot when the index round-trips through storage.
 */
export const EMBEDDING_DIMS = Number(readTrimmed("EMBEDDING_DIMS")) || 768;

const GOOGLE_KEY_HELP =
  "Missing GOOGLE_API_KEY.\n" +
  "  Get a FREE key (no credit card) at https://aistudio.google.com/apikey\n" +
  "  Local:  add GOOGLE_API_KEY=... to .env\n" +
  "  Vercel: add it under Project Settings -> Environment Variables, then redeploy.";

/**
 * The key used for embeddings. Always Google: embeddings and chat are separate concerns,
 * and the index must stay embeddable even when the chat provider is Claude.
 */
export function requireGoogleApiKey(): string {
  if (!GOOGLE_API_KEY) throw new Error(GOOGLE_KEY_HELP);
  return GOOGLE_API_KEY;
}

/** The key for whichever provider is currently writing answers. */
export function requireChatApiKey(): string {
  if (LLM_PROVIDER === "anthropic") {
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        "LLM_PROVIDER=anthropic but no ANTHROPIC_API_KEY is set.\n" +
          "  Get one at https://console.anthropic.com -> API Keys, then add it to .env.\n" +
          "  Or set LLM_PROVIDER=google to use the free Gemini tier instead.",
      );
    }
    return ANTHROPIC_API_KEY;
  }
  return requireGoogleApiKey();
}
