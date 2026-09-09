import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export const RESOLUTION_LADDER = [
  { id: "understand", label: "Understand" },
  { id: "preserve", label: "Preserve" },
  { id: "informal", label: "Informal Resolution" },
  { id: "formal", label: "Formal Complaint" },
  { id: "adr", label: "ADR / Mediation" },
  { id: "negotiation", label: "Negotiation" },
  { id: "regulator", label: "Regulator / Ombudsman" },
  { id: "tribunal", label: "Tribunal / Court" },
];

export function CaseJourney({ stage }: { stage: string }) {
  const currentIndex = Math.max(0, RESOLUTION_LADDER.findIndex((s) => s.id === stage));

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-1.5 py-1">
        {RESOLUTION_LADDER.map((s, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  isDone && !isCurrent && "border-primary/30 bg-primary/10 text-primary",
                  !isDone && !isCurrent && "border-border text-muted-foreground"
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : null}
                {s.label}
              </div>
              {i < RESOLUTION_LADDER.length - 1 && <div className="h-px w-4 bg-border" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
