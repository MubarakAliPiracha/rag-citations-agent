// One headline number.
//
// The number is set large and in mono because it is a measurement, not prose — the same
// split the rest of the app uses. The caveat line matters as much as the figure: a rate
// computed over four citations and a rate computed over ninety look identical at 38px
// unless the denominator is printed next to it.

export type StatTone = "accent" | "strong" | "verdict" | "danger" | "neutral";

const TONE_TEXT: Record<StatTone, string> = {
  accent: "text-accent",
  strong: "text-strong",
  verdict: "text-verdict",
  danger: "text-danger",
  neutral: "text-ink",
};

const TONE_RULE: Record<StatTone, string> = {
  accent: "bg-accent",
  strong: "bg-strong",
  verdict: "bg-medium",
  danger: "bg-danger",
  neutral: "bg-edge-strong",
};

interface StatCardProps {
  readonly label: string;
  /** Pre-formatted, because "—" for unmeasured is a display decision, not a maths one. */
  readonly value: string;
  readonly basis: string;
  readonly tone?: StatTone;
  /** Shown when the figure should not be read at face value. */
  readonly caveat?: string;
}

export function StatCard({ label, value, basis, tone = "neutral", caveat }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-edge bg-surface p-4">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-px ${TONE_RULE[tone]} opacity-60`} />

      <p className="t-label">{label}</p>

      <p className={`mt-2 font-mono text-[34px] leading-none tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
      </p>

      <p className="t-meta mt-2 text-ink-faint">{basis}</p>

      {caveat && (
        <p className="t-meta mt-2 border-t border-edge pt-2 text-medium">{caveat}</p>
      )}
    </div>
  );
}
