// POST /api/ask — run the agent and stream every step back to the browser.
//
// The response is newline-delimited JSON rather than Server-Sent Events. Both would work,
// but NDJSON needs no client library, survives proxies that mangle SSE, and each line is
// already exactly the AgentEvent the UI wants to handle.
//
// The API key never crosses this boundary. The browser sends a question and receives
// events; the model credentials stay on the server.

import { NextResponse } from "next/server";
import { z } from "zod";

import { askStreaming, describeError, type AgentEvent } from "@/lib/agent";
import { DEFAULT_INDEX } from "@/lib/default-index";
import { isValidSessionId, loadSessionIndex } from "@/lib/session-store";
import type { DocumentIndex } from "@/lib/types";

/** The agent makes several sequential model calls, so it needs more than the default 10s. */
export const maxDuration = 60;

const AskRequest = z.object({
  question: z.string().trim().min(1, "Please enter a question.").max(1000),
  /** Absent means "ask the built-in sample document". */
  sessionId: z.string().optional(),
});

function encodeEvent(event: AgentEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}

/** Pick the index this question should search. */
async function resolveIndex(sessionId?: string): Promise<DocumentIndex> {
  if (!sessionId) return DEFAULT_INDEX;

  if (!isValidSessionId(sessionId)) {
    throw new Error("That upload session id is not valid. Please re-upload your document.");
  }

  const index = await loadSessionIndex(sessionId);
  if (!index) {
    throw new Error("That uploaded document has expired. Please upload it again.");
  }

  return index;
}

export async function POST(request: Request): Promise<Response> {
  let parsed: z.infer<typeof AskRequest>;

  try {
    parsed = AskRequest.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid request.")
        : "Invalid request body.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let index: DocumentIndex;
  try {
    index = await resolveIndex(parsed.sessionId);
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of askStreaming(index, parsed.question)) {
          controller.enqueue(encodeEvent(event));
        }
      } catch (error) {
        // A throw this late still has to reach the user as a readable line, not a
        // truncated stream that the UI would render as an unexplained hang.
        controller.enqueue(encodeEvent({ type: "error", message: describeError(error) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Tells proxies not to buffer, which would defeat the point of streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
