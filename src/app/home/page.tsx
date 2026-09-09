import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UrgencyBadge } from "@/components/urgency-badge";
import { entitlementsFor } from "@/lib/plans";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { format } from "date-fns";

const URGENCY_RANK: Record<string, number> = { critical: 0, high: 1, standard: 2, low: 3 };

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cases = await db.case.findMany({
    where: { userId: user.id, status: { not: "archived" } },
    include: {
      actions: { where: { status: { not: "done" } }, orderBy: { priority: "desc" } },
      deadlines: { where: { acknowledged: false }, orderBy: { dueDate: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (cases.length === 0) redirect("/onboarding");

  const sorted = [...cases].sort((a, b) => (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9));
  const primary = sorted[0];
  const others = cases.filter((c) => c.id !== primary.id);
  const plan = entitlementsFor(user.plan);
  const canCreateNew = cases.length < plan.maxCases;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1 bg-secondary/10">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Justice Command Centre</p>
              <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user.name.split(" ")[0]}</h1>
            </div>
            {canCreateNew ? (
              <Button className="gap-2" render={<Link href="/onboarding" />}>
                <Plus className="h-4 w-4" /> New case
              </Button>
            ) : (
              <Button variant="outline" className="gap-2" render={<Link href="/pricing" />}>
                Upgrade for more cases
              </Button>
            )}
          </div>

          <Link href={`/cases/${primary.id}`} className="block">
            <Card className="border-primary/30 transition hover:border-primary/60">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your situation</p>
                    <UrgencyBadge urgency={primary.urgency} />
                  </div>
                  <h2 className="mt-1 text-xl font-semibold">{primary.title}</h2>
                  {primary.actions[0] && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Next: {primary.actions[0].title}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-2xl font-semibold tabular-nums">{primary.readiness}<span className="text-sm text-muted-foreground">/100</span></p>
                    <p className="text-xs text-muted-foreground">Readiness</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {others.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-sm font-medium text-muted-foreground">Other cases</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {others.map((c) => (
                  <Link key={c.id} href={`/cases/${c.id}`}>
                    <Card className="h-full transition hover:border-primary/40">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{c.title}</p>
                          <UrgencyBadge urgency={c.urgency} />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Readiness {c.readiness}/100 · Updated {format(c.updatedAt, "d MMM yyyy")}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
