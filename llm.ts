// The "brain" — the model that writes the grounded answer.
//
// This is the ONE place the LLM provider is chosen, so swapping Claude <-> Gemini
// (or adding another later) is a single-file change. Controlled by LLM_PROVIDER in .env.
//
// temperature 0 everywhere → deterministic, factual; no creativity when grounding.

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { LLM_PROVIDER, assertApiKey } from "./env.ts";

export function makeModel(): BaseChatModel {
  const apiKey = assertApiKey(); // .env key wins; friendly error if missing.

  if (LLM_PROVIDER === "google") {
    // Gemini Flash: fast + free tier. Override the model via GOOGLE_MODEL if you like.
    return new ChatGoogleGenerativeAI({
      // "gemini-flash-latest" is a stable alias that always points to Google's current
      // Flash model, so it won't 404 when a specific version (1.5, 2.5) gets retired.
      model: (process.env.GOOGLE_MODEL ?? "gemini-flash-latest").trim(),
      temperature: 0,
      apiKey,
    });
  }

  // Default: Claude.
  return new ChatAnthropic({ model: "claude-sonnet-4-6", temperature: 0, apiKey });
}
