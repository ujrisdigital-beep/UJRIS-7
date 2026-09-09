import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReadinessGauge } from "@/components/case/readiness-gauge";
import { CaseJourney } from "@/components/case/case-journey";
import { ActionItemRow } from "@/components/case/action-item-row";
import { TruthLayerBadge } from "@/components/truth-layer-badge";
import { daysUntil } from "@/lib/legal/deadlines";
import { ArrowRight, Sparkles, Users2, FileText } from "lucide-react";
import { format } from "date-fns";

export default async function CaseOverviewPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const kase = await db.case.findUnique({
    where: { id: caseId },
    include: {
      actions: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] },
      deadlines: { orderBy: { dueDate: "asc" } },
      issues: true,
      people: true,
      events: { orderBy: { date: "asc" } },
      evidence: true,
      briefs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!kase || kase.userId !== user.id) notFound();

  const brief = kase.briefs[0];
  const pendingActions = kase.actions.filter((a) => a.status !== "done");
  const topAction = pendingActions[0];
  const nextDeadline = kase.deadlines.filter((d) => !d.acknowledged)[0];

  return (
    <div className="space-y-6">
      {topAction && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Your next best action</p>
                <p className="mt-0.5 font-semibold">{topAction.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{topAction.description}</p>
              </div>
            </div>
            <Button className="shrink-0 gap-2" render={<Link href={topAction.linkTo ?? `/cases/${caseId}/actions`} />}>
              Review <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <ReadinessGauge score={kase.readiness} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Your case journey
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CaseJourney stage={kase.stage} />
          </CardContent>
        </Card>
      </div>

      {nextDeadline && (
        <Card className="border-amber-300/60 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">Most important date</p>
              <p className="mt-0.5 font-medium">{nextDeadline.label}</p>
              <p className="text-sm text-muted-foreground">
                {format(nextDeadline.dueDate, "EEEE d MMMM yyyy")} · {Math.abs(daysUntil(nextDeadline.dueDate))} days{" "}
                {daysUntil(nextDeadline.dueDate) < 0 ? "overdue" : "remaining"}
              </p>
            </div>
            <Button variant="outline" render={<Link href={`/cases/${caseId}/deadlines`} />}>
              View deadlines
            </Button>
          </CardContent>
        </Card>
      )}

      {brief && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your UJU Brief</CardTitle>
            <TruthLayerBadge layer="ai_inference" />
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <BriefSection title="What happened" content={brief.whatHappened} />
            <BriefSection title="What matters" content={brief.whatMatters} />
            <div className="grid gap-4 sm:grid-cols-2">
              <BriefSection title="Supported by evidence" content={brief.supportedByEvidence} />
              <BriefSection title="What's uncertain" content={brief.uncertain} />
            </div>
            {JSON.parse(brief.questionsOutstanding).length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Questions UJRIS still needs answered
                </p>
                <ul className="space-y-1 list-disc pl-5 text-muted-foreground">
                  {JSON.parse(brief.questionsOutstanding).map((q: string, i: number) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Actions</span>
              <span className="text-xs font-normal text-muted-foreground">{pendingActions.length} pending</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {kase.actions.length === 0 && <p className="text-sm text-muted-foreground">No actions yet.</p>}
            {kase.actions.map((a) => (
              <ActionItemRow
                key={a.id}
                id={a.id}
                title={a.title}
                description={a.description}
                priority={a.priority}
                status={a.status}
                linkTo={a.linkTo}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Possible legal issues <TruthLayerBadge layer="ai_inference" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {kase.issues.length === 0 && (
              <p className="text-sm text-muted-foreground">
                UJRIS hasn&apos;t identified a specific issue yet — add more detail to your narrative.
              </p>
            )}
            {kase.issues.map((issue) => (
              <div key={issue.id} className="rounded-lg border border-border/70 p-3">
                <p className="text-sm font-medium">{issue.title}</p>
                {issue.authority && <p className="mt-0.5 text-xs text-muted-foreground">Potentially relevant: {issue.authority}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Confidence: {issue.confidence}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <SummaryLink href={`/cases/${caseId}/evidence`} icon={FileText} label="Evidence" value={kase.evidence.length} />
        <SummaryLink href={`/cases/${caseId}/timeline`} icon={Sparkles} label="Timeline events" value={kase.events.length} />
        <SummaryLink href={`/cases/${caseId}/timeline`} icon={Users2} label="People identified" value={kase.people.length} />
      </div>
    </div>
  );
}

function BriefSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-sm leading-relaxed">{content}</p>
    </div>
  );
}

function SummaryLink({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-4 transition hover:border-primary/40">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="text-lg font-semibold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </Link>
  );
}
