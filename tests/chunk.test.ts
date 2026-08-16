import { describe, expect, it } from "vitest";

import { CHUNK_SIZE, chunkPages, chunkText, fileNameOf } from "@/lib/chunk";

describe("fileNameOf", () => {
  it("should strip directories so a citation never leaks a server path", () => {
    expect(fileNameOf("/var/tmp/uploads/handbook.pdf")).toBe("handbook.pdf");
    expect(fileNameOf("C:\\Users\\me\\docs\\handbook.pdf")).toBe("handbook.pdf");
  });

  it("should leave a bare filename alone", () => {
    expect(fileNameOf("handbook.pdf")).toBe("handbook.pdf");
  });
});

describe("chunkPages", () => {
  it("should number pages from 1", async () => {
    const chunks = await chunkPages(["a".repeat(200), "b".repeat(200)], "doc.pdf");

    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 2]);
  });

  it("should never let one chunk span two pages, so every chunk is citable", async () => {
    const pages = ["Alpha content ".repeat(20), "Beta content ".repeat(20)];

    const chunks = await chunkPages(pages, "doc.pdf");

    for (const chunk of chunks) {
      const mentionsAlpha = chunk.text.includes("Alpha");
      const mentionsBeta = chunk.text.includes("Beta");
      expect(mentionsAlpha && mentionsBeta).toBe(false);
    }
  });

  it("should skip pages that are empty or whitespace only", async () => {
    const chunks = await chunkPages([" \n\n ", "Real content ".repeat(20)], "doc.pdf");

    expect(chunks.every((chunk) => chunk.page === 2)).toBe(true);
  });

  it("should drop fragments too short to carry meaning", async () => {
    const chunks = await chunkPages(["p.7"], "doc.pdf");

    expect(chunks).toEqual([]);
  });

  it("should keep chunks near the configured size", async () => {
    const chunks = await chunkPages(["word ".repeat(1200)], "doc.pdf");

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }
  });
});

describe("chunkText", () => {
  it("should start a new page at every markdown heading", async () => {
    // Regression: splitting only on "# " collapsed a whole file into p.1, which made
    // every citation label identical and broke the sources list.
    const markdown = [
      "# Title",
      "Intro paragraph that is long enough to survive the minimum length filter easily.",
      "## Section One",
      "Content for section one that is also comfortably past the minimum chunk length.",
      "## Section Two",
      "Content for section two that is likewise long enough to be kept as a real chunk.",
    ].join("\n\n");

    const chunks = await chunkText(markdown, "handbook.md");
    const pages = [...new Set(chunks.map((chunk) => chunk.page))];

    expect(pages.length).toBe(3);
  });

  it("should carry the file name onto every chunk", async () => {
    const chunks = await chunkText("Some reasonably long content ".repeat(5), "notes.md");

    expect(chunks.every((chunk) => chunk.source === "notes.md")).toBe(true);
  });
});
