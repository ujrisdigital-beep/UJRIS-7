"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { completeActionItemAction } from "@/lib/actions/cases";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function ActionItemRow({
  id,
  title,
  description,
  priority,
  status,
  linkTo,
}: {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  linkTo?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(status === "done");

  async function handleComplete() {
    setPending(true);
    await completeActionItemAction(id);
    setDone(true);
    setPending(false);
  }

  const content = (
    <div className={cn("flex-1", done && "opacity-60")}>
      <p className={cn("text-sm font-medium", done && "line-through")}>{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-3">
      <button
        type="button"
        onClick={handleComplete}
        disabled={pending || done}
        className="mt-0.5 shrink-0 text-muted-foreground transition hover:text-primary disabled:cursor-default"
        aria-label="Mark done"
      >
        {pending ? (
          <Loader2 className="h-4.5 w-4.5 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="h-4.5 w-4.5 text-primary" />
        ) : (
          <Circle className="h-4.5 w-4.5" />
        )}
      </button>
      {linkTo ? (
        <Link href={linkTo} className="flex-1">
          {content}
        </Link>
      ) : (
        content
      )}
      {priority === "high" && !done && (
        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
          PRIORITY
        </span>
      )}
    </div>
  );
}
