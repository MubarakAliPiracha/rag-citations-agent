// Does the retrieval score mean anything?
//
// The app shows a match score next to every citation, which quietly asks the reader to
// trust that a higher number is a better citation. This plot is where that claim gets
// tested: citations are bucketed by their retrieval score, and each bucket is plotted
// against the fraction the judge ruled actually supported the claim.
//
// The diagonal is a REFERENCE, not a target. Cosine similarity is not a probability, so
// "0.7 should mean 70% supported" is not a law of nature — it is simply the line a
// perfectly self-describing score would sit on. What matters is the SHAPE: points that
// rise left-to-right mean the score carries information. A flat scatter means it does
// not, however confident it looks in the interface.

import type { CalibrationBucket } from "@/lib/evals";

const WIDTH = 520;
const HEIGHT = 300;
const PAD = { left: 46, right: 18, top: 16, bottom: 46 };

const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;

/** Retrieval scores realistically land here; a wider axis would be mostly empty. */
const X_MIN = 0.5;
const X_MAX = 1.0;

const toX = (score: number) =>
  PAD.left + ((clamp(score) - X_MIN) / (X_MAX - X_MIN)) * PLOT_WIDTH;

const toY = (rate: number) => PAD.top + (1 - rate) * PLOT_HEIGHT;

function clamp(score: number): number {
  return Math.min(Math.max(score, X_MIN), X_MAX);
}

/** Bigger bucket, bigger dot — so a 1-citation bucket cannot masquerade as a trend. */
function radiusFor(count: number): number {
  return Math.min(4 + Math.sqrt(count) * 2.6, 16);
}

interface PlottedBucket extends CalibrationBucket {
  readonly midpoint: number;
  readonly clamped: boolean;
  readonly label: string;
}

function prepare(buckets: readonly CalibrationBucket[]): PlottedBucket[] {
  return buckets
    .filter((bucket) => bucket.total > 0 && bucket.rate !== null)
    .map((bucket) => {
      const upper = Math.min(bucket.upper, 1);
      const midpoint = (bucket.lower + upper) / 2;

      return {
        ...bucket,
        midpoint,
        clamped: midpoint < X_MIN,
        label:
          bucket.lower < X_MIN
            ? `<${upper.toFixed(2)}`
            : `${bucket.lower.toFixed(2)}–${upper.toFixed(2)}`,
      };
    })
    .sort((a, b) => a.midpoint - b.midpoint);
}

interface CalibrationPlotProps {
  readonly buckets: readonly CalibrationBucket[];
  readonly judgeEnabled: boolean;
}

export function CalibrationPlot({ buckets, judgeEnabled }: CalibrationPlotProps) {
  const points = prepare(buckets);
  const anyClamped = points.some((point) => point.clamped);

  return (
    <section className="rounded-lg border border-edge bg-surface p-5">
      <h2 className="font-serif text-[19px] leading-none text-ink">Score calibration</h2>
      <p className="t-body mt-1.5 text-ink-soft">
        Does a higher retrieval score actually mean a better-supported citation?
      </p>

      {points.length === 0 ? (
        <p className="t-meta mt-5 rounded border border-edge bg-raised px-3 py-6 text-center text-ink-faint">
          {judgeEnabled
            ? "No citations were judged in this run, so there is nothing to calibrate."
            : "The citation judge was disabled for this run, so calibration was not measured."}
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="mt-4 w-full"
            role="img"
            aria-label="Calibration plot of retrieval score against the fraction of citations judged supported"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={toY(tick)}
                  y2={toY(tick)}
                  stroke="var(--color-edge)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={toY(tick) + 4}
                  textAnchor="end"
                  fill="var(--color-ink-faint)"
                  style={{ font: '500 10px var(--font-mono)' }}
                >
                  {tick * 100}%
                </text>
              </g>
            ))}

            {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((tick) => (
              <text
                key={tick}
                x={toX(tick)}
                y={HEIGHT - PAD.bottom + 18}
                textAnchor="middle"
                fill="var(--color-ink-faint)"
                style={{ font: '500 10px var(--font-mono)' }}
              >
                {tick.toFixed(1)}
              </text>
            ))}

            {/* Perfect-calibration reference: score equals support rate. */}
            <line
              x1={toX(X_MIN)}
              y1={toY(X_MIN)}
              x2={toX(X_MAX)}
              y2={toY(X_MAX)}
              stroke="var(--color-ink-faint)"
              strokeWidth="1.25"
              strokeDasharray="5 4"
            />
            {/* Labelled low on the diagonal: the data sits along the top of the plot, so
                anything near the upper right collides with it. */}
            <text
              x={toX(0.63) + 6}
              y={toY(0.63) + 14}
              textAnchor="start"
              fill="var(--color-ink-faint)"
              style={{ font: '500 9px var(--font-mono)' }}
            >
              perfect calibration
            </text>

            {points.length > 1 && (
              <polyline
                points={points.map((p) => `${toX(p.midpoint)},${toY(p.rate ?? 0)}`).join(" ")}
                fill="none"
                stroke="var(--color-accent-dim)"
                strokeWidth="1.75"
              />
            )}

            {points.map((point) => (
              <g key={`${point.lower}-${point.upper}`}>
                <circle
                  cx={toX(point.midpoint)}
                  cy={toY(point.rate ?? 0)}
                  r={radiusFor(point.total)}
                  fill="var(--color-accent-soft)"
                  stroke="var(--color-accent)"
                  strokeWidth="1.75"
                />
                <title>
                  {`score ${point.label}: ${point.supported} of ${point.total} citations judged supported`}
                </title>
              </g>
            ))}

            <line
              x1={PAD.left}
              y1={PAD.top}
              x2={PAD.left}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--color-edge-strong)"
              strokeWidth="1"
            />

            <text
              x={PAD.left + PLOT_WIDTH / 2}
              y={HEIGHT - 8}
              textAnchor="middle"
              fill="var(--color-ink-soft)"
              style={{ font: '500 10px var(--font-mono)' }}
            >
              retrieval score
            </text>
          </svg>

          <div className="mt-3 space-y-1 border-t border-edge pt-3">
            {points.map((point) => (
              <div
                key={`${point.lower}-${point.upper}`}
                className="t-meta flex items-baseline gap-3 text-ink-faint"
              >
                <span className="w-24 shrink-0 tabular-nums text-ink-soft">{point.label}</span>
                <span className="w-14 shrink-0 tabular-nums text-accent">
                  {((point.rate ?? 0) * 100).toFixed(0)}%
                </span>
                <span className="tabular-nums">
                  {point.supported}/{point.total} supported
                </span>
              </div>
            ))}
          </div>

          <p className="t-meta mt-3 border-t border-edge pt-3 text-ink-faint">
            Dot size is the number of citations in the bucket. The dashed line is where a
            perfectly self-describing score would sit — cosine similarity is not a
            probability, so what matters is whether the points rise left to right, not
            whether they touch the line.
            {anyClamped && " The lowest bucket is plotted at the axis edge."}
          </p>
        </>
      )}
    </section>
  );
}
