"use client";

// Which document is being searched, and how to change it.
//
// Permanently visible rather than tucked into a menu: "what am I actually asking about?"
// is the first question a visitor has, and a grounded answer is meaningless without
// knowing its scope.

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
      className={`flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${
        dragging
          ? "bg-accent-soft ring-2 ring-accent ring-dashed"
          : "bg-surface shadow-low ring-1 ring-edge"
      }`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          busy ? "bg-accent-soft text-accent animate-pulse-soft" : "bg-surface-sunk text-accent"
        }`}
      >
        <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5Z" />
          <path d="M9 1.5v4h4" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-ink">
          {dragging ? "Drop the PDF to index it" : label}
        </p>
        {detail && !dragging && (
          <p className="truncate font-mono text-[11px] text-ink-faint">{detail}</p>
        )}
      </div>

      {isCustom && (
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-ink-faint
                     transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          Use sample
        </button>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg bg-surface-sunk px-3 py-1.5 text-[12.5px] font-bold text-ink-soft
                   ring-1 ring-edge transition-all hover:bg-accent hover:text-white
                   hover:ring-accent disabled:cursor-not-allowed disabled:opacity-50
                   disabled:hover:bg-surface-sunk disabled:hover:text-ink-soft"
      >
        {busy ? "Indexing…" : "Upload a PDF"}
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
