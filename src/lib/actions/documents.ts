"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { generateDocument, type DocumentKind } from "@/lib/ai/documents";
import { revalidatePath } from "next/cache";

export async function generateDocumentAction(caseId: string, kind: DocumentKind): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const kase = await db.case.findUnique({
    where: { id: caseId },
    include: { people: true, events: { orderBy: { date: "asc" } }, issues: true, evidence: true },
  });
  if (!kase || kase.userId !== user.id) return { ok: false, error: "Case not found." };

  const generated = generateDocument(kind, {
    title: kase.title,
    narrative: kase.narrative,
    situation: kase.situation,
    userName: user.name,
    people: kase.people.map((p) => ({ name: p.name, role: p.role })),
    events: kase.events.map((e) => ({ date: e.date, title: e.title, description: e.description })),
    issues: kase.issues.map((i) => ({ label: i.title, authority: i.authority ?? "" })),
    evidenceSummaries: kase.evidence.map((e) => ({ fileName: e.fileName, category: e.category })),
  });

  const version = (await db.generatedDocument.count({ where: { caseId, kind } })) + 1;

  const doc = await db.generatedDocument.create({
    data: {
      caseId,
      kind,
      title: generated.title,
      content: generated.content,
      version,
      assumptions: JSON.stringify(generated.assumptions),
    },
  });

  await appendAuditLog({ userId: user.id, caseId, action: "DOCUMENT_GENERATED", detail: `kind=${kind} v${version}` });
  revalidatePath(`/cases/${caseId}/actions`);
  redirect(`/cases/${caseId}/documents/${doc.id}`);
}

export async function approveDocumentAction(documentId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const doc = await db.generatedDocument.findUnique({ where: { id: documentId }, include: { case: true } });
  if (!doc || doc.case.userId !== user.id) return;
  await db.generatedDocument.update({ where: { id: documentId }, data: { status: "approved" } });
  await appendAuditLog({ userId: user.id, caseId: doc.caseId, action: "DOCUMENT_APPROVED", detail: doc.title });
  revalidatePath(`/cases/${doc.caseId}/documents/${documentId}`);
}
