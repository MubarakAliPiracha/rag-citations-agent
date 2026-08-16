import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // import.meta.dirname, not __dirname: this config is ESM, and Vite is dropping the
    // CJS shim that makes __dirname work here.
    alias: { "@": import.meta.dirname },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests must never reach a real API. Anything needing the model or the embedding
    // service is mocked, so a missing key is a bug in the test rather than a skip reason.
    env: { GOOGLE_API_KEY: "test-key-not-used" },
  },
});
