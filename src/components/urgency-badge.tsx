import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CONFIG: Record<string, { label: string; className: string }> = {
  low: { label: "LOW", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  standard: { label: "STANDARD", className: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200" },
  high: { label: "HIGH", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  critical: { label: "CRITICAL", className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
};

export function UrgencyBadge({ urgency, className }: { urgency: string; className?: string }) {
  const cfg = CONFIG[urgency] ?? CONFIG.standard;
  return <Badge className={cn("border-transparent font-semibold tracking-wide", cfg.className, className)}>{cfg.label}</Badge>;
}
