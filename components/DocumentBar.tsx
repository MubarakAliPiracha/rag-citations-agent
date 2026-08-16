"use client";

// Which document is being searched, and how to change it.
//
// Kept permanently visible rather than tucked into a menu, because "what am I actually
// asking about?" is the question a visitor has first, and a grounded answer is
// meaningless without knowing its scope.

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
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        dragging ? "border-accent bg-accent-soft" : "border-edge bg-surface"
      }`}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="size-4 shrink-0 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5Z" />
        <path d="M9 1.5v4h4" />
      </svg>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">
          {dragging ? "Drop the PDF to index it" : label}
        </p>
        {detail && !dragging && <p className="truncate text-xs text-ink-soft">{detail}</p>}
      </div>

      {isCustom && (
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-ink-soft transition-colors
                     hover:bg-canvas hover:text-ink disabled:opacity-50"
        >
          Use sample
        </button>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-edge px-3 py-1.5 text-xs font-bold text-ink
                   transition-colors hover:border-accent hover:text-accent
                   disabled:cursor-not-allowed disabled:opacity-50"
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
