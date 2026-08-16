// The model that reasons and writes.
//
// One factory, so swapping providers is a config change rather than a code change. Both
// providers must support tool calling — the agent is built on it, so a model without it
// would silently degrade into answering from memory.
//
// temperature 0 throughout: grounding is a factual task, and sampling variety here only
// ever manifests as drift away from the source text.

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import {
  ANTHROPIC_CHAT_MODEL,
  GOOGLE_CHAT_MODEL,
  LLM_PROVIDER,
  requireChatApiKey,
} from "./env";

export function makeModel(): BaseChatModel {
  const apiKey = requireChatApiKey();

  if (LLM_PROVIDER === "anthropic") {
    return new ChatAnthropic({ model: ANTHROPIC_CHAT_MODEL, temperature: 0, apiKey });
  }

  return new ChatGoogleGenerativeAI({ model: GOOGLE_CHAT_MODEL, temperature: 0, apiKey });
}

/** Which model is answering, for display in the UI footer. */
export function activeModelName(): string {
  return LLM_PROVIDER === "anthropic" ? ANTHROPIC_CHAT_MODEL : GOOGLE_CHAT_MODEL;
}
