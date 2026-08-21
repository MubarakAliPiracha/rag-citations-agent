"use client";

// Which document is being searched, and how to change it.
//
// Permanently visible rather than tucked into a menu: "what am I actually asking about?"
// is the first question a viewer has, and a grounded answer means nothing without knowing
// its scope. Kept to a single dense line so it frames the conversation without competing
// with it.

import { useRef, useState } from "react";

interface DocumentBarProps {
  readonly label: string;
  readonly detail?: string;
  readonly busy: boolean;
  readonly onUpload: (file: File) => void;
  readonly onReset: () => void;
  readonly isCustom: boolean;
}

export function DocumentBar({ label, detail, busy, onUpload, onReset, isCustom }: DocumentBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onUpload(file);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2
                  transition-colors duration-200 ${
                    dragging
                      ? "border-dashed border-accent bg-accent-soft"
                      : "border-edge bg-surface"
                  }`}
    >
      <span className="t-label shrink-0">Source</span>

      <span className="min-w-0 flex-1">
        <span className="t-meta block truncate text-ink">
          {dragging ? "Drop the PDF to index it" : label}
        </span>
      </span>

      {detail && !dragging && (
        <span className="t-meta shrink-0 text-ink-faint">{detail}</span>
      )}

      {isCustom && (
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="t-meta shrink-0 rounded px-1.5 py-0.5 text-ink-faint transition-colors
                     hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          use sample
        </button>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="t-meta shrink-0 rounded border border-edge px-2 py-0.5 text-ink-soft
                   transition-colors hover:border-accent-edge hover:text-accent
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "indexing…" : "upload PDF"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          // Reset so re-selecting the same file still fires a change event.
          event.target.value = "";
        }}
      />
    </div>
  );
}
