// Reading the NDJSON event stream in the browser.
//
// The one subtlety: a network chunk is not a line. A single read can deliver half an
// event, or three and a half events, so the tail has to be buffered until its newline
// arrives. Parsing per chunk instead of per line is the classic way this breaks, and it
// only shows up under real latency.

import type { AgentEvent } from "@/lib/agent";

export interface AskRequestBody {
  readonly question: string;
  readonly sessionId?: string;
}

/** POST a question and yield each agent event as it arrives. */
export async function* streamAsk(
  body: AskRequestBody,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    yield { type: "error", message: detail?.error ?? `Request failed (${response.status}).` };
    return;
  }

  if (!response.body) {
    yield { type: "error", message: "The server sent an empty response." };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    // The final element is whatever came after the last newline: an incomplete event.
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const event = parseEvent(trimmed);
      if (event) yield event;
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const event = parseEvent(tail);
    if (event) yield event;
  }
}

function parseEvent(line: string): AgentEvent | null {
  try {
    return JSON.parse(line) as AgentEvent;
  } catch {
    return null;
  }
}
