import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FileCheck2, User, BookMarked, Sparkles, ShieldCheck } from "lucide-react";

export type TruthLayer = "user_assertion" | "document_evidence" | "external_authority" | "ai_inference" | "human_verified";

const CONFIG: Record<TruthLayer, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  user_assertion: { label: "You said", icon: User, className: "bg-secondary text-secondary-foreground border-transparent" },
  document_evidence: { label: "Document shows", icon: FileCheck2, className: "bg-accent text-accent-foreground border-transparent" },
  external_authority: { label: "Authority says", icon: BookMarked, className: "bg-blue-100 text-blue-900 border-transparent dark:bg-blue-950 dark:text-blue-200" },
  ai_inference: { label: "UJRIS inference", icon: Sparkles, className: "bg-violet-100 text-violet-900 border-transparent dark:bg-violet-950 dark:text-violet-200" },
  human_verified: { label: "Human verified", icon: ShieldCheck, className: "bg-emerald-100 text-emerald-900 border-transparent dark:bg-emerald-950 dark:text-emerald-200" },
};

export function TruthLayerBadge({ layer, className }: { layer: TruthLayer; className?: string }) {
  const cfg = CONFIG[layer];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[11px] font-medium", cfg.className, className)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
