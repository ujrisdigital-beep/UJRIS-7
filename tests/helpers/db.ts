import { db } from "@/lib/db";

export async function resetTestDatabase(): Promise<void> {
  await db.forensicFinding.deleteMany();
  await db.custodyEvent.deleteMany();
  await db.evidence.deleteMany();
  await db.caseEvent.deleteMany();
  await db.person.deleteMany();
  await db.issue.deleteMany();
  await db.contradiction.deleteMany();
  await db.deadline.deleteMany();
  await db.actionItem.deleteMany();
  await db.generatedDocument.deleteMany();
  await db.ujuBrief.deleteMany();
  await db.auditLog.deleteMany();
  await db.authSession.deleteMany();
  await db.subscription.deleteMany();
  await db.case.deleteMany();
  await db.user.deleteMany();
}
