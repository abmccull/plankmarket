import { cn } from "@/lib/utils";
import { Truck, X, AlertCircle, Info } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QualityScoreProps {
  score: number;
  shipReady: boolean;
  requiredMissing: string[];
  suggestedMissing: string[];
  compact?: boolean;
}

// ─── Score color helpers ──────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score <= 40) return "text-destructive";
  if (score <= 70) return "text-yellow-600";
  return "text-green-600";
}

function getScoreBg(score: number): string {
  if (score <= 40) return "bg-destructive/10 border-destructive/30";
  if (score <= 70) return "bg-yellow-50 border-yellow-300 dark:bg-yellow-950/20 dark:border-yellow-800";
  return "bg-green-50 border-green-300 dark:bg-green-950/20 dark:border-green-800";
}

function getScoreRingColor(score: number): string {
  if (score <= 40) return "border-destructive";
  if (score <= 70) return "border-yellow-500";
  return "border-green-500";
}

// ─── Compact mode ─────────────────────────────────────────────────────────────

function CompactScore({
  score,
  shipReady,
}: {
  score: number;
  shipReady: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold border",
        getScoreBg(score)
      )}
      title={`Quality score: ${score}/100${shipReady ? " · Ship ready" : ""}`}
      aria-label={`Quality score ${score} out of 100${shipReady ? ", ship ready" : ""}`}
    >
      <span className={cn("tabular-nums", getScoreColor(score))}>{score}</span>
      {shipReady ? (
        <Truck
          className="h-3.5 w-3.5 text-green-600"
          aria-hidden="true"
        />
      ) : (
        <X
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ─── Full mode ────────────────────────────────────────────────────────────────

function FullScore({
  score,
  shipReady,
  requiredMissing,
  suggestedMissing,
}: Omit<QualityScoreProps, "compact">) {
  return (
    <div className="space-y-4">
      {/* Score circle + ship-ready badge */}
      <div className="flex items-center gap-4">
        {/* Circular score */}
        <div
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-full border-4 shrink-0",
            getScoreRingColor(score)
          )}
          role="img"
          aria-label={`Quality score: ${score} out of 100`}
        >
          <span
            className={cn("text-2xl font-bold tabular-nums leading-none", getScoreColor(score))}
          >
            {score}
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {score <= 40
              ? "Needs work"
              : score <= 70
              ? "Good — could be better"
              : "Excellent listing"}
          </p>

          {/* Ship-ready indicator */}
          {shipReady ? (
            <div
              className="inline-flex items-center gap-1.5 rounded-md bg-green-50 border border-green-300 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400"
              aria-label="Ship ready"
            >
              <Truck className="h-3.5 w-3.5" aria-hidden="true" />
              Ship Ready
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 rounded-md bg-muted border px-2 py-0.5 text-xs font-medium text-muted-foreground"
              aria-label="Not ship ready"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Not Ship Ready
            </div>
          )}
        </div>
      </div>

      {/* Required missing */}
      {requiredMissing.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive mb-1.5 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Required — Missing Fields
          </p>
          <ul className="space-y-1" aria-label="Required missing fields">
            {requiredMissing.map((field) => (
              <li
                key={field}
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {field}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested missing */}
      {suggestedMissing.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-yellow-600 mb-1.5 flex items-center gap-1">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            Suggested — Improve Your Score
          </p>
          <ul className="space-y-1" aria-label="Suggested missing fields">
            {suggestedMissing.map((field) => (
              <li
                key={field}
                className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-500"
              >
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {field}
              </li>
            ))}
          </ul>
        </div>
      )}

      {requiredMissing.length === 0 && suggestedMissing.length === 0 && (
        <p className="text-sm text-muted-foreground">
          All recommended fields are filled in.
        </p>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function QualityScore({
  score,
  shipReady,
  requiredMissing,
  suggestedMissing,
  compact = false,
}: QualityScoreProps) {
  if (compact) {
    return <CompactScore score={score} shipReady={shipReady} />;
  }

  return (
    <FullScore
      score={score}
      shipReady={shipReady}
      requiredMissing={requiredMissing}
      suggestedMissing={suggestedMissing}
    />
  );
}
