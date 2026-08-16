"use client";

// The question input, pinned to the bottom.
//
// Enter submits and Shift+Enter adds a newline, which is what people expect from a chat
// box. The textarea grows with its content up to a cap so a long question stays readable
// without the composer swallowing the transcript.

import { useRef, useState } from "react";

interface ComposerProps {
  readonly onSubmit: (question: string) => void;
  readonly busy: boolean;
  readonly disabled: boolean;
}

const MAX_HEIGHT_PX = 160;

export function Composer({ onSubmit, busy, disabled }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const blocked = busy || disabled;

  function resize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }

  function submit() {
    const question = value.trim();
    if (!question || blocked) return;

    onSubmit(question);
    setValue("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-edge bg-canvas/90 backdrop-blur">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-3 sm:px-6"
      >
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <textarea
          id="question"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={blocked}
          placeholder={busy ? "The agent is working…" : "Ask about the document…"}
          onChange={(event) => {
            setValue(event.target.value);
            resize(event.target);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="flex-1 resize-none rounded-xl border border-edge bg-surface px-4 py-3
                     text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none
                     disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={blocked || !value.trim()}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent
                     text-white transition-opacity hover:opacity-90
                     disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={busy ? "Working" : "Send question"}
        >
          {busy ? (
            <span className="size-2 rounded-full bg-white animate-pulse-soft" />
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 13.5V2.5M3.5 7 8 2.5 12.5 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
