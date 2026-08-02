// Shared environment loader.
//
// IMPORTANT: `override: true` makes values in your .env file WIN over anything already
// set in your system environment (e.g. Claude Code's internal ANTHROPIC_API_KEY, which
// is invalid for direct API calls).
import dotenv from "dotenv";

dotenv.config({ override: true });

// Which LLM writes the answers: "anthropic" (Claude, default) or "google" (Gemini, free tier).
export const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? "anthropic").trim().toLowerCase();

export const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY ?? "").trim();
export const GOOGLE_API_KEY = (process.env.GOOGLE_API_KEY ?? "").trim();

// Return the key for the active provider, or fail fast with a friendly, actionable message.
export function assertApiKey(): string {
  if (LLM_PROVIDER === "google") {
    if (!GOOGLE_API_KEY) {
      throw new Error(
        "LLM_PROVIDER=google but no GOOGLE_API_KEY in .env.\n" +
          "  Get a FREE key (no credit card) at https://aistudio.google.com/apikey\n" +
          "  then add to .env:  GOOGLE_API_KEY=...",
      );
    }
    return GOOGLE_API_KEY;
  }

  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "No Claude API key found. Paste a real key into .env:\n" +
        "  ANTHROPIC_API_KEY=sk-ant-...\n" +
        "  Get one at https://console.anthropic.com/ -> API Keys.",
    );
  }
  return ANTHROPIC_API_KEY;
}
