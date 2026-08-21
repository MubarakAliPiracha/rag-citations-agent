"use client";

// The question input.
//
// A flex child of the page column, not a fixed overlay. That is what removes the dead gap
// the old layout produced: the transcript scrolls above it and it sits exactly at the
// bottom of the available height, always.
//
// Enter submits, Shift+Enter adds a newline.

import { useRef, useState } from "react";

interface ComposerProps {
  readonly onSubmit: (question: string) => void;
  readonly busy: boolean;
  readonly disabled: boolean;
}

const MAX_HEIGHT_PX = 160;

export function Composer({ onSubmit, busy, disabled }: ComposerProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const blocked = busy || disabled;
  const canSend = Boolean(value.trim()) && !blocked;

  function resize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }

  function submit() {
    if (!canSend) return;
    onSubmit(value.trim());
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    <div className="shrink-0 border-t border-edge bg-canvas">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mx-auto w-full max-w-3xl px-5 py-3"
      >
        <div
          className={`flex items-end gap-2 rounded-lg border bg-surface pl-3.5 pr-2 py-1.5
                      transition-colors duration-200 ${
                        focused ? "border-accent-edge" : "border-edge"
                      }`}
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
            placeholder={busy ? "Agent is working…" : "Ask about the document…"}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
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
            className="flex-1 resize-none bg-transparent py-2 font-serif text-[17px] text-ink
                       placeholder:text-ink-faint focus:outline-none disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label={busy ? "Working" : "Send question"}
            className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded
                       bg-accent text-canvas transition-colors duration-200
                       hover:bg-accent-dim disabled:bg-edge disabled:text-ink-faint"
          >
            {busy ? (
              <span className="flex gap-[3px]">
                <span className="dot-1 size-1 rounded-full bg-current" />
                <span className="dot-2 size-1 rounded-full bg-current" />
                <span className="dot-3 size-1 rounded-full bg-current" />
              </span>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M8 13V3.5M3.5 8 8 3.5 12.5 8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        <p className="t-meta mt-2 text-center text-ink-faint">
          Grounded in the loaded document only · every claim cites an exact page
        </p>
      </form>
    </div>
  );
}
