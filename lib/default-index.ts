// The document the demo answers about before anyone uploads anything.
//
// Committed as pre-embedded JSON rather than embedded on demand, so the first question a
// visitor asks does not pay for a cold-start embedding call. Rebuild it with
// `npm run build:index` after editing the sample handbook.

import sampleIndex from "@/data/sample-index.json";

import type { DocumentIndex } from "./types";

export const DEFAULT_INDEX = sampleIndex as unknown as DocumentIndex;

/** Shown in the UI so it is never ambiguous which document is being searched. */
export const DEFAULT_INDEX_LABEL = "Nimbus Coffee Co. — Employee Handbook (sample)";
