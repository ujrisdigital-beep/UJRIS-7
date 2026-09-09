import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { BrandMark } from "@/components/brand-mark";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  FileSearch,
  GitBranch,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Clock,
  Fingerprint,
} from "lucide-react";

const PROOF_POINTS = [
  {
    icon: FileSearch,
    title: "See it",
    description: "Understand what happened — UJRIS reconstructs a timeline of events, people, and issues from your own account.",
  },
  {
    icon: GitBranch,
    title: "Prove it",
    description: "Organise and connect your evidence. Every file is hashed, timestamped, and checked for forensic metadata signals worth your attention.",
  },
  {
    icon: ListChecks,
    title: "Act on it",
    description: "Know your next step. UJRIS always answers one question: what should I do next, and why?",
  },
];

const EMOTION_ROWS = [
  ["Fear", "Immediate orientation"],
  ["Confusion", "Case reconstruction"],
  ["Chaos", "Evidence organisation"],
  ["Doubt", "Evidence & authority mapping"],
  ["Helplessness", "Next-best-action"],
  ["Anxiety", "Deadline defence"],
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-accent/40 via-background to-background" />
          <div className="mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
            <div className="mb-6 flex justify-center">
              <BrandMark size={76} />
            </div>
            <Badge variant="outline" className="mb-6 gap-1.5 border-primary/20 bg-primary/5 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Justice Intelligence for UK employment disputes
            </Badge>
            <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              Something happened at work.{" "}
              <span className="text-primary">Now what?</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              UJRIS helps you understand what happened, organise your evidence, and decide what to do next —
              turning a confusing dispute into a structured case, an evidence map, and a clear next step.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="gap-2 px-7 text-base" render={<Link href="/signup" />}>
                Start my case <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="px-7 text-base" render={<Link href="/pricing" />}>
                See pricing
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No lawyer required to get started. In under 60 seconds, UJRIS can help you turn confusion into a
              structured case picture.
            </p>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">The entire product, in three moves</h2>
            <p className="mt-3 text-muted-foreground">Not fifty features. Three proof points.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {PROOF_POINTS.map((p) => (
              <Card key={p.title} className="border-border/70 shadow-sm">
                <CardContent className="pt-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <p.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{p.title.toUpperCase()}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y border-border/70 bg-secondary/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">Your next best action, every time you open UJRIS</h2>
                <p className="mt-4 text-muted-foreground">
                  Not a dashboard full of statistics. UJRIS always answers one question clearly, with the reasoning
                  behind it — never fabricated certainty, always your own evidence and the applicable rules.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Deadline-aware — UJRIS calculates ACAS and Tribunal time limits from your dates.</li>
                  <li className="flex gap-2"><Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Every document is SHA-256 hashed with a tamper-evident custody trail.</li>
                  <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Every AI-generated statement is labelled — you always know what&apos;s fact vs. inference.</li>
                </ul>
              </div>
              <Card className="border-border/70 shadow-md">
                <CardContent className="space-y-4 pt-6">
                  <div className="rounded-lg border border-border/70 bg-card p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your next best action</p>
                    <p className="mt-1 font-medium">Review a contradiction between the respondent&apos;s explanation and your evidence.</p>
                    <p className="mt-2 text-sm text-muted-foreground">We found evidence that appears inconsistent with their stated reason. Review it before you respond.</p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card p-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Case readiness</p>
                      <p className="mt-1 text-2xl font-semibold">72<span className="text-base text-muted-foreground">/100</span></p>
                    </div>
                    <Badge className="border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">HIGH URGENCY — 18 days</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Built for how it actually feels</h2>
          <p className="mt-3 text-center text-muted-foreground">
            The goal is not to tell you that you&apos;ll win. It&apos;s the moment you say: &ldquo;I understand what is happening now.&rdquo;
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {EMOTION_ROWS.map(([emotion, mechanism]) => (
              <div key={emotion} className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-4 py-3 text-sm">
                <span className="font-medium text-muted-foreground">{emotion}</span>
                <span className="font-medium">{mechanism}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border/70 bg-primary/5">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Upload your first document.</h2>
            <p className="mt-3 text-muted-foreground">
              UJRIS provides structured information, evidence organisation, procedural guidance, drafting assistance and
              decision support — not legal representation, and never a guaranteed outcome.
            </p>
            <Button size="lg" className="mt-8 gap-2 px-7 text-base" render={<Link href="/signup" />}>
              Start my case <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 py-10 text-center text-sm text-muted-foreground">
        <div className="mb-4 flex justify-center">
          <Logo className="text-foreground" />
        </div>
        <p>UJRIS is an assistive technology platform for self-represented individuals in England &amp; Wales.</p>
        <p className="mt-1">
          It does not provide legal representation and does not guarantee any outcome. Always verify dates and legal
          conclusions with ACAS, Citizens Advice, or a qualified adviser.
        </p>
      </footer>
    </div>
  );
}
