"use client";

// The chat surface: owns conversation state, drives the stream, handles uploads.
//
// Layout is a three-row flex column filling the viewport — header, scrolling transcript,
// composer. The composer is a flex CHILD, not a fixed overlay. That is the fix for the
// dead space: previously the transcript ended wherever it ended and the input floated at
// the bottom of the window with nothing between them.
//
// `my-auto` on the transcript's inner container does the centring: with less content than
// the viewport it centres, and once content overflows it behaves like normal flow.

import { useCallback, useEffect, useRef, useState } from "react";

import { Composer } from "./Composer";
import { DocumentBar } from "./DocumentBar";
import { EmptyState } from "./EmptyState";
import { TurnView } from "./TurnView";
import { applyEvent, newTurn, type Turn } from "@/lib/client/conversation";
import { streamAsk } from "@/lib/client/stream";

interface ActiveDocument {
  readonly label: string;
  readonly detail?: string;
  readonly sessionId?: string;
}

interface ChatProps {
  readonly defaultLabel: string;
  readonly defaultDetail: string;
  readonly suggestions: readonly { readonly text: string; readonly refuses?: boolean }[];
}

export function Chat({ defaultLabel, defaultDetail, suggestions }: ChatProps) {
  const [document, setDocument] = useState<ActiveDocument>({
    label: defaultLabel,
    detail: defaultDetail,
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (turns.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (question: string) => {
      if (asking) return;

      const id = `${Date.now()}-${turns.length}`;
      setTurns((current) => [...current, newTurn(id, question)]);
      setAsking(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of streamAsk(
          { question, sessionId: document.sessionId },
          controller.signal,
        )) {
          setTurns((current) =>
            current.map((turn) => (turn.id === id ? applyEvent(turn, event) : turn)),
          );
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "The request failed.";
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id ? applyEvent(turn, { type: "error", message }) : turn,
          ),
        );
      } finally {
        setAsking(false);
        abortRef.current = null;
      }
    },
    [asking, document.sessionId, turns.length],
  );

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/upload", { method: "POST", body });
      const data = (await response.json()) as {
        error?: string;
        sessionId?: string;
        fileName?: string;
        chunks?: number;
        pages?: number;
      };

      if (!response.ok || !data.sessionId) {
        setUploadError(data.error ?? "Upload failed.");
        return;
      }

      setDocument({
        label: data.fileName ?? file.name,
        detail: `${data.pages} page${data.pages === 1 ? "" : "s"} · ${data.chunks} passages indexed`,
        sessionId: data.sessionId,
      });
      setTurns([]);
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setDocument({ label: defaultLabel, detail: defaultDetail });
    setTurns([]);
    setUploadError(null);
  }, [defaultLabel, defaultDetail]);

  const empty = turns.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl shrink-0 px-5 pt-4 pb-3">
        <DocumentBar
          label={document.label}
          detail={document.detail}
          busy={uploading || asking}
          onUpload={upload}
          onReset={reset}
          isCustom={Boolean(document.sessionId)}
        />

        {uploadError && (
          <p
            role="alert"
            className="t-meta mt-2 rounded border border-danger-edge bg-danger-soft px-3 py-2 text-danger"
          >
            {uploadError}
          </p>
        )}
      </div>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {/* min-h-full + my-auto: centres short content, flows normally once it overflows. */}
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5">
          <div className={`my-auto w-full ${empty ? "" : "py-2"}`}>
            {empty ? (
              <EmptyState
                suggestions={suggestions}
                onPick={ask}
                disabled={asking || uploading}
              />
            ) : (
              <div className="space-y-10">
                {turns.map((turn) => (
                  <TurnView key={turn.id} turn={turn} />
                ))}
              </div>
            )}
          </div>

          <div ref={bottomRef} />
        </div>
      </div>

      <Composer onSubmit={ask} busy={asking} disabled={uploading} />
    </div>
  );
}
