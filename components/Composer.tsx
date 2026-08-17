"use client";

// The question input, pinned to the bottom.
//
// Enter submits, Shift+Enter adds a newline. The textarea grows with its content up to a
// cap, so a long question stays readable without the composer swallowing the transcript.
//
// The bar sits on a blurred, faded canvas rather than a hard-edged panel, so the
// transcript appears to pass underneath it instead of being cut off by it.

import { useRef, useState } from "react";

interface ComposerProps {
  readonly onSubmit: (question: string) => void;
  readonly busy: boolean;
  readonly disabled: boolean;
}

const MAX_HEIGHT_PX = 168;

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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
      {/* Fade the transcript out behind the bar instead of clipping it with a border. */}
      <div aria-hidden className="h-10 bg-gradient-to-t from-canvas to-transparent" />

      <div className="pointer-events-auto bg-canvas pb-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="mx-auto w-full max-w-3xl px-4 sm:px-6"
        >
          <div
            className={`flex items-end gap-2 rounded-2xl bg-surface p-2 pl-4 transition-all duration-200 ${
              focused ? "shadow-high ring-2 ring-accent/40" : "shadow-mid ring-1 ring-edge"
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
              placeholder={busy ? "The agent is working…" : "Ask about the document…"}
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
              className="flex-1 resize-none bg-transparent py-2.5 text-[15px] text-ink
                         placeholder:text-ink-faint focus:outline-none disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!canSend}
              aria-label={busy ? "Working" : "Send question"}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent
                         text-white transition-all duration-200 hover:bg-accent-hover
                         disabled:cursor-not-allowed disabled:bg-edge-strong disabled:text-ink-faint"
            >
              {busy ? (
                <span className="flex gap-[3px]">
                  <span className="dot-1 size-1 rounded-full bg-current" />
                  <span className="dot-2 size-1 rounded-full bg-current" />
                  <span className="dot-3 size-1 rounded-full bg-current" />
                </span>
              ) : (
                <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 13.5V3M3.5 7.5 8 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>

          <p className="mt-2 text-center text-[11.5px] text-ink-faint">
            Answers are grounded in the loaded document only. Citations link to the exact page.
          </p>
        </form>
      </div>
    </div>
  );
}
