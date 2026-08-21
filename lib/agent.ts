// The agent.
//
// createAgent gives us the loop: call the model, run whatever tools it asks for, feed the
// results back, repeat until it stops asking and writes a final answer. In LangChain v1
// that loop is a LangGraph graph under the hood, which is what makes streamEvents able to
// report each step as it happens.
//
// Two safety rails wrap the loop:
//   - a step limit, so a model that keeps searching forever cannot burn the request
//   - citation validation on the way out, so the refusal guarantee survives the move from
//     a forced-retrieval chain to a model that chooses for itself

import { createAgent } from "langchain";

import { makeAgentTools, type ToolTrace, type TracedPassage } from "./tools";
import { makeModel } from "./llm";
import { SYSTEM_PROMPT } from "./prompt";
import { validateAnswer, type ValidationResult } from "./citations";
import { DEFAULT_TOP_K } from "./vector-index";
import type { DocumentIndex } from "./types";

/**
 * Hard ceiling on model calls per question.
 *
 * Each search costs a model call to decide it plus one to read the results, so this
 * allows roughly three searches and a final answer — enough for a multi-part question,
 * short enough that a confused agent fails fast instead of looping.
 */
const MAX_STEPS = 8;

/** Everything the UI can be told while a question is being answered. */
export type AgentEvent =
  | { readonly type: "thinking" }
  | { readonly type: "search_start"; readonly query: string }
  | {
      readonly type: "search_end";
      readonly query: string;
      readonly hits: number;
      readonly passages: readonly TracedPassage[];
    }
  | { readonly type: "list_documents"; readonly documents: readonly string[] }
  | { readonly type: "token"; readonly text: string }
  | { readonly type: "done"; readonly result: AnswerResult }
  | { readonly type: "error"; readonly message: string };

/**
 * What one question cost, summed across every model call the agent made.
 *
 * Providers report usage per call and an agent makes several per question, so a single
 * call's figure is misleading on its own. The total is the number that answers "what does
 * asking this actually cost", which is what the eval harness records.
 */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /** Model calls that reported usage. 0 means the provider told us nothing. */
  readonly modelCalls: number;
}

export interface AnswerResult extends ValidationResult {
  readonly traces: readonly ToolTrace[];
  /**
   * Wall-clock time for the whole agent run, measured on the server.
   *
   * Server-side rather than in the browser so the eval harness and the UI are quoting
   * the same quantity — a client timer would also be measuring the network.
   */
  readonly latencyMs: number;
  /** Absent when the provider reports no usage metadata at all. */
  readonly usage?: TokenUsage;
}

interface AskOptions {
  readonly topK?: number;
}

/** Pull the plain text out of a message content that may be a string or content blocks. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === "string"
          ? block
          : typeof (block as { text?: unknown })?.text === "string"
            ? (block as { text: string }).text
            : "",
      )
      .join("");
  }

  return "";
}

/**
 * Read a tool's arguments out of an on_tool_start event.
 *
 * LangChain does not hand these over in one predictable shape: depending on how the
 * model emitted the call, `data.input` is either the argument object itself or a wrapper
 * whose `input` field holds the arguments as a JSON *string*. Reading it naively yields
 * an empty query, which is how this surfaced — the UI trace showed every search as "".
 */
export function toolArgsOf(data: unknown): Record<string, unknown> {
  const input = (data as { input?: unknown })?.input;
  if (!input) return {};

  if (typeof input === "string") return safeParseObject(input);

  const inner = (input as { input?: unknown }).input;
  if (typeof inner === "string") return safeParseObject(inner);
  if (inner && typeof inner === "object") return inner as Record<string, unknown>;

  return input as Record<string, unknown>;
}

function safeParseObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Read token usage off one finished model call.
 *
 * Providers disagree on the spelling: LangChain normalises most models onto
 * `usage_metadata`, but some still only populate the older `response_metadata.tokenUsage`.
 * Both are tried rather than assuming one and silently recording zeros, because a zero
 * here is indistinguishable from "this call was free" in the eval output.
 */
export function usageOf(message: unknown): TokenUsage | null {
  const source = message as {
    usage_metadata?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
    response_metadata?: {
      tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    };
  } | null;

  if (!source || typeof source !== "object") return null;

  const modern = source.usage_metadata;
  if (modern && typeof modern.total_tokens === "number") {
    return {
      inputTokens: modern.input_tokens ?? 0,
      outputTokens: modern.output_tokens ?? 0,
      totalTokens: modern.total_tokens,
      modelCalls: 1,
    };
  }

  const legacy = source.response_metadata?.tokenUsage;
  if (legacy && typeof legacy.totalTokens === "number") {
    return {
      inputTokens: legacy.promptTokens ?? 0,
      outputTokens: legacy.completionTokens ?? 0,
      totalTokens: legacy.totalTokens,
      modelCalls: 1,
    };
  }

  return null;
}

/** Fold one call's usage into the running total for the question. */
function addUsage(total: TokenUsage | undefined, next: TokenUsage | null): TokenUsage | undefined {
  if (!next) return total;
  if (!total) return next;

  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    totalTokens: total.totalTokens + next.totalTokens,
    modelCalls: total.modelCalls + next.modelCalls,
  };
}

function buildAgent(index: DocumentIndex, topK: number) {
  const { tools, register, traces } = makeAgentTools(index, topK);

  const agent = createAgent({
    model: makeModel(),
    tools,
    systemPrompt: SYSTEM_PROMPT,
  });

  return { agent, register, traces };
}

/**
 * Answer a question, streaming each step as it happens.
 *
 * Tokens are streamed for responsiveness, but they are a preview, not the verdict: the
 * text is only trustworthy after validation, so the final "done" event carries the
 * authoritative answer and the UI replaces the streamed draft with it.
 */
export async function* askStreaming(
  index: DocumentIndex,
  question: string,
  options: AskOptions = {},
): AsyncGenerator<AgentEvent> {
  const { agent, register, traces } = buildAgent(index, options.topK ?? DEFAULT_TOP_K);

  const startedAt = Date.now();
  let finalText = "";
  let usage: TokenUsage | undefined;

  try {
    const stream = agent.streamEvents(
      { messages: [{ role: "user", content: question }] },
      { version: "v2", recursionLimit: MAX_STEPS * 2 },
    );

    for await (const event of stream) {
      if (event.event === "on_chat_model_start") {
        yield { type: "thinking" };
        continue;
      }

      if (event.event === "on_tool_start" && event.name === "search_documents") {
        const query = String(toolArgsOf(event.data).query ?? "");
        yield { type: "search_start", query };
        continue;
      }

      if (event.event === "on_tool_end" && event.name === "search_documents") {
        const trace = traces.at(-1);
        yield {
          type: "search_end",
          query: trace?.query ?? "",
          hits: trace?.hits ?? 0,
          passages: trace?.passages ?? [],
        };
        continue;
      }

      if (event.event === "on_tool_end" && event.name === "list_documents") {
        yield { type: "list_documents", documents: index.documents };
        continue;
      }

      if (event.event === "on_chat_model_end") {
        usage = addUsage(usage, usageOf(event.data?.output));
        continue;
      }

      if (event.event === "on_chat_model_stream") {
        const text = textOf((event.data?.chunk as { content?: unknown })?.content);
        if (text) {
          finalText += text;
          yield { type: "token", text };
        }
      }
    }
  } catch (error) {
    yield { type: "error", message: describeError(error) };
    return;
  }

  const validated = validateAnswer(finalText, register);
  yield {
    type: "done",
    result: { ...validated, traces, latencyMs: Date.now() - startedAt, usage },
  };
}

/** Non-streaming variant, used by the CLI and by tests. */
export async function ask(
  index: DocumentIndex,
  question: string,
  options: AskOptions = {},
): Promise<AnswerResult> {
  const { agent, register, traces } = buildAgent(index, options.topK ?? DEFAULT_TOP_K);

  const startedAt = Date.now();

  const output = await agent.invoke(
    { messages: [{ role: "user", content: question }] },
    { recursionLimit: MAX_STEPS * 2 },
  );

  const lastMessage = output.messages.at(-1);
  const validated = validateAnswer(textOf(lastMessage?.content), register);

  // invoke() returns the whole message history, so usage has to be summed across it
  // rather than read off the final message alone.
  const usage = output.messages.reduce<TokenUsage | undefined>(
    (total, message) => addUsage(total, usageOf(message)),
    undefined,
  );

  return { ...validated, traces, latencyMs: Date.now() - startedAt, usage };
}

/**
 * Turn a provider error into something a user can act on.
 *
 * Quota and key problems are the two failures a visitor will actually hit, and the raw
 * provider text for both is unreadable, so they get translated.
 */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/quota|rate.?limit|429|RESOURCE_EXHAUSTED/i.test(message)) {
    return "The model's free-tier rate limit was hit. Wait a minute and try again.";
  }

  if (/api.?key|401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
    return "The server's API key is missing or invalid. Check GOOGLE_API_KEY in the environment.";
  }

  if (/credit balance|billing/i.test(message)) {
    return "The configured provider account is out of credit. Switch LLM_PROVIDER to google for the free tier.";
  }

  return message;
}
