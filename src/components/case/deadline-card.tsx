"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { acknowledgeDeadlineAction } from "@/lib/actions/cases";
import { cn } from "@/lib/utils";
import { UrgencyBadge } from "@/components/urgency-badge";

export function DeadlineCard({
  id,
  label,
  dueDate,
  basis,
  confidence,
  acknowledged,
  daysRemaining,
}: {
  id: string;
  label: string;
  dueDate: string;
  basis: string;
  confidence: string;
  acknowledged: boolean;
  daysRemaining: number;
}) {
  const [pending, setPending] = useState(false);
  const [ack, setAck] = useState(acknowledged);
  const urgency = daysRemaining < 0 ? "critical" : daysRemaining <= 7 ? "critical" : daysRemaining <= 21 ? "high" : daysRemaining <= 45 ? "standard" : "low";

  async function handleAck() {
    setPending(true);
    await acknowledgeDeadlineAction(id);
    setAck(true);
    setPending(false);
  }

  return (
    <div className={cn("rounded-lg border border-border/70 bg-card p-4", ack && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{basis}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Confidence: {confidence} · Verify this date with ACAS or an adviser before relying on it.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <UrgencyBadge urgency={urgency} />
          <p className="text-xs font-medium">{dueDate}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {daysRemaining < 0 ? `${Math.abs(daysRemaining)} day(s) overdue` : `${daysRemaining} day(s) remaining`}
        </p>
        {!ack && (
          <button
            onClick={handleAck}
            disabled={pending}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Acknowledge
          </button>
        )}
        {ack && <span className="text-xs text-muted-foreground">Acknowledged</span>}
      </div>
    </div>
  );
}
