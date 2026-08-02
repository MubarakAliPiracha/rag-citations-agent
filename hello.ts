// Stage 0 smoke test: proves TypeScript runs and your API key is loaded.
// Run it with:  npx tsx hello.ts   (or:  npm run hello)
import { ANTHROPIC_API_KEY } from "./env.ts";

console.log("✅ TypeScript is running via tsx.");

if (ANTHROPIC_API_KEY.length > 0) {
  console.log(`✅ A Claude API key is set in .env (starts with "${ANTHROPIC_API_KEY.slice(0, 7)}...").`);
  console.log("   (Note: 'set' isn't 'valid' — the real check is running answer.ts.)");
} else {
  console.log("⚠️  No Claude API key in .env yet. Paste one into the .env file, then run this again.");
}
