// Reading eval reports off disk.
//
// Kept apart from lib/evals.ts on purpose. The dashboard is a client component and imports
// the types and formatters from there; if the fs import lived in the same module, Turbopack
// would try to bundle node:fs/promises for the browser and the route would fail to build
// outright. Server-only I/O therefore gets its own file, and only the server component
// imports it.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { EvalReport, LoadedReport } from "./evals";

export const RESULTS_DIR = path.join(process.cwd(), "eval", "results");

/**
 * Load the most recent results file.
 *
 * File names are timestamps (2026-08-21T02-07-26Z.json), which sort lexicographically in
 * the same order they sort chronologically, so picking the newest is a reverse sort rather
 * than stat-ing every file.
 *
 * Returns null rather than throwing when nothing has been run yet: an eval page with no
 * runs is an ordinary state, not an error, and the page renders instructions instead.
 */
export async function loadLatestReport(): Promise<LoadedReport | null> {
  let entries: string[];

  try {
    entries = await readdir(RESULTS_DIR);
  } catch {
    return null;
  }

  const available = entries
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse();

  if (available.length === 0) return null;

  const fileName = available[0];

  try {
    const raw = await readFile(path.join(RESULTS_DIR, fileName), "utf8");
    return { report: JSON.parse(raw) as EvalReport, fileName, available };
  } catch {
    // A half-written or corrupt report should render the empty state with instructions,
    // not a 500 that hides which file is the problem.
    return null;
  }
}
