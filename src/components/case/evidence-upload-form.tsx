"use client";

import { useActionState, useRef } from "react";
import { uploadEvidenceAction, type EvidenceActionResult } from "@/lib/actions/evidence";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

const initialState: EvidenceActionResult = { ok: true };

export function EvidenceUploadForm({ caseId }: { caseId: string }) {
  const [state, formAction, pending] = useActionState(uploadEvidenceAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="caseId" value={caseId} />

      {!state.ok && state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && state.evidenceId && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Uploaded and hashed. UJRIS has run its forensic check below.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="file">File</Label>
        <Input id="file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.txt,.doc,.docx,.mp3,.wav,.m4a" />
        <p className="text-xs text-muted-foreground">PDFs and images get full forensic metadata analysis. Max 25MB.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Type</Label>
          <Select name="category" defaultValue="document">
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="image">Photo / screenshot</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="claimedDate">Date this relates to</Label>
          <Input id="claimedDate" name="claimedDate" type="date" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Note (optional)</Label>
        <Textarea id="description" name="description" placeholder="What is this and why does it matter?" className="min-h-[70px]" />
      </div>

      <Button type="submit" disabled={pending} className="gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        Upload evidence
      </Button>
    </form>
  );
}
