import { Progress } from "@/components/ui/progress";

export function ReadinessGauge({ score }: { score: number }) {
  const label = score >= 80 ? "Well prepared" : score >= 50 ? "Building readiness" : "Early stage";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Case Readiness Score™</p>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-4xl font-semibold tabular-nums">{score}</span>
        <span className="pb-1 text-muted-foreground">/100</span>
      </div>
      <Progress value={score} className="mt-3 h-2" />
      <p className="mt-2 text-xs text-muted-foreground">
        Measures evidence completeness, timeline clarity, and deadline readiness — not your chance of winning.
      </p>
    </div>
  );
}
