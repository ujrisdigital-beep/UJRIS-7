import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CaseTabs } from "@/components/case/case-tabs";
import { UrgencyBadge } from "@/components/urgency-badge";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const kase = await db.case.findUnique({ where: { id: caseId } });
  if (!kase || kase.userId !== user.id) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="border-b border-border/70 bg-secondary/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Case</p>
            <h1 className="text-xl font-semibold tracking-tight">{kase.title}</h1>
          </div>
          <UrgencyBadge urgency={kase.urgency} />
        </div>
      </div>
      <CaseTabs caseId={caseId} />
      <main className="flex-1 bg-secondary/10">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
