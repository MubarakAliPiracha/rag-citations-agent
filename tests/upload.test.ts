// Boundary checks on anonymous file input.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vector-index", () => ({
  DEFAULT_TOP_K: 5,
  buildIndex: vi.fn(async () => ({
    embeddingModel: "gemini-embedding-001",
    dims: 768,
    documents: ["doc.pdf"],
    chunks: [],
  })),
}));

vi.mock("@/lib/session-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session-store")>();
  return { ...actual, saveSessionIndex: vi.fn(async () => undefined) };
});

const { MAX_UPLOAD_BYTES, UploadError, processUpload } = await import("@/lib/upload");

function fakeFile(content: Uint8Array | string, name = "doc.pdf"): File {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

describe("processUpload", () => {
  it("should reject an empty file", async () => {
    await expect(processUpload(fakeFile(""))).rejects.toThrow(/empty/i);
  });

  it("should reject a file over the size limit before reading it", async () => {
    const oversized = fakeFile("x".repeat(10));
    // Report a size past the cap without allocating megabytes in the test.
    Object.defineProperty(oversized, "size", { value: MAX_UPLOAD_BYTES + 1 });

    await expect(processUpload(oversized)).rejects.toThrow(/limit is 4 MB/i);
  });

  it("should reject a non-PDF even when it is named .pdf and claims a PDF MIME type", async () => {
    // Both the filename and the MIME type are attacker-controlled; only the magic
    // number is trustworthy.
    await expect(processUpload(fakeFile("<html>not a pdf at all</html>"))).rejects.toThrow(
      /does not look like a PDF/i,
    );
  });

  it("should raise UploadError with an HTTP status the route can use", async () => {
    const error = await processUpload(fakeFile("nope")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UploadError);
    expect((error as InstanceType<typeof UploadError>).status).toBe(400);
  });

  it("should give an oversized upload a 413 rather than a generic 400", async () => {
    const oversized = fakeFile("x");
    Object.defineProperty(oversized, "size", { value: MAX_UPLOAD_BYTES + 1 });

    const error = await processUpload(oversized).catch((caught: unknown) => caught);

    expect((error as InstanceType<typeof UploadError>).status).toBe(413);
  });
});
