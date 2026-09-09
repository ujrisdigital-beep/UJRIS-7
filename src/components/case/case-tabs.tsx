"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/evidence", label: "Evidence" },
  { href: "/timeline", label: "Timeline" },
  { href: "/deadlines", label: "Deadlines" },
  { href: "/actions", label: "Action Engine" },
];

export function CaseTabs({ caseId }: { caseId: string }) {
  const pathname = usePathname();
  const base = `/cases/${caseId}`;

  return (
    <div className="border-b border-border/70">
      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const active = pathname === href || (tab.href === "" && pathname === base);
          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
