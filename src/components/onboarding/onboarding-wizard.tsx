"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createCaseAction, type CaseActionResult } from "@/lib/actions/cases";
import { SITUATION_OPTIONS } from "@/lib/ai/situations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Mic, PenLine, Upload } from "lucide-react";

const initialState: CaseActionResult = { ok: true };

export function OnboardingWizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [situation, setSituation] = useState<string>("");
  const [narrative, setNarrative] = useState("");
  const [state, formAction, pending] = useActionState(createCaseAction, initialState);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-center justify-center gap-2">
        <StepDot active={step === 1} done={step > 1} label="1" />
        <div className="h-px w-10 bg-border" />
        <StepDot active={step === 2} done={false} label="2" />
      </div>

      {step === 1 && (
        <div>
          <h1 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Something has happened.</h1>
          <p className="mt-2 text-center text-muted-foreground">What do you need help with?</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {SITUATION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSituation(opt.id)}
                className={cn(
                  "rounded-lg border px-4 py-3.5 text-left text-sm font-medium transition",
                  situation === opt.id
                    ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                    : "border-border hover:border-primary/40 hover:bg-secondary/60"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <Button size="lg" className="gap-2 px-8" disabled={!situation} onClick={() => setStep(2)}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form action={formAction}>
          <input type="hidden" name="situation" value={situation} />
          <h1 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Tell UJRIS what happened.</h1>
          <p className="mt-2 text-center text-muted-foreground">
            Write it in your own words — dates, names, and what was said all help. You can add documents afterwards.
          </p>

          <div className="mt-6 flex justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><PenLine className="h-3.5 w-3.5" /> Write</span>
            <span className="flex items-center gap-1"><Mic className="h-3.5 w-3.5" /> Speak (coming soon)</span>
            <span className="flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Upload after this</span>
          </div>

          <Textarea
            name="narrative"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="E.g. On 14 March I raised a complaint about how shifts were allocated. On 22 March HR responded saying it wasn't discriminatory. On 4 April I was told I was being investigated, and on 11 April I was dismissed..."
            className="mt-6 min-h-[180px] resize-y"
            required
            minLength={20}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{narrative.trim().split(/\s+/).filter(Boolean).length} words</p>

          {!state.ok && state.error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="ghost" className="gap-2" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button type="submit" size="lg" className="gap-2 px-8" disabled={pending || narrative.trim().length < 20}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Build my case"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
        active && "bg-primary text-primary-foreground",
        done && !active && "bg-primary/20 text-primary",
        !active && !done && "bg-secondary text-muted-foreground"
      )}
    >
      {label}
    </div>
  );
}
