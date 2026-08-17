"use client";

// The chat surface: owns conversation state, drives the stream, handles uploads.
//
// State deliberately lives in one place. The turn reducer is pure and lives in
// lib/client/conversation, so this component is only wiring: fetch, fold events, render.

import { useCallback, useEffect, useRef, useState } from "react";

import { Composer } from "./Composer";
import { DocumentBar } from "./DocumentBar";
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
  readonly suggestions: readonly string[];
}

export function Chat({ defaultLabel, defaultDetail, suggestions }: ChatProps) {
  const sampleDocument: ActiveDocument = { label: defaultLabel, detail: defaultDetail };

  const [document, setDocument] = useState<ActiveDocument>(sampleDocument);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // Cancel any in-flight request if the component goes away mid-answer.
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
    setDocument(sampleDocument);
    setTurns([]);
    setUploadError(null);
    // sampleDocument is rebuilt each render from stable props, so it is safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLabel, defaultDetail]);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Bottom padding clears the fixed composer, which is ~150px tall with its hint. */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-52 pt-6 sm:px-6">
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
            className="mt-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {uploadError}
          </p>
        )}

        {turns.length === 0 ? (
          <EmptyState suggestions={suggestions} onPick={ask} disabled={asking || uploading} />
        ) : (
          <div className="mt-6 space-y-8">
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <Composer onSubmit={ask} busy={asking} disabled={uploading} />
    </div>
  );
}

function EmptyState({
  suggestions,
  onPick,
  disabled,
}: {
  readonly suggestions: readonly string[];
  readonly onPick: (question: string) => void;
  readonly disabled: boolean;
}) {
  return (
    <div className="animate-rise mt-14 text-center">
      <h2 className="font-serif text-3xl leading-tight text-ink">
        Ask the document anything
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">
        Every claim comes back with a citation you can click. If the answer is not in the
        document, the agent says so instead of inventing one.
      </p>

      <p className="label-caps mt-10">Try one</p>

      <div className="mx-auto mt-3 flex max-w-xl flex-col gap-2">
        {suggestions.map((suggestion, i) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onPick(suggestion)}
            style={{ animationDelay: `${i * 60}ms` }}
            className="animate-rise group flex items-center gap-3 rounded-xl bg-surface px-4 py-3
                       text-left text-[14.5px] text-ink-soft shadow-low ring-1 ring-edge
                       transition-all hover:text-ink hover:shadow-mid hover:ring-accent-edge
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex-1">{suggestion}</span>
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="size-3.5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>

      <p className="mt-6 text-[12.5px] text-ink-faint">
        The last one isn&apos;t in the document — watch it refuse.
      </p>
    </div>
  );
}
