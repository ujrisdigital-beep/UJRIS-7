import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readEvidenceFile } from "@/lib/storage";
import { recordCustodyView } from "@/lib/actions/evidence";

/**
 * Authenticated, object-level-authorised evidence download.
 * Files are never reachable through `public/` — every request is checked
 * against the requesting user's ownership of the parent case.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const evidence = await db.evidence.findUnique({ where: { id: evidenceId }, include: { case: true } });
  if (!evidence || evidence.case.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await readEvidenceFile(evidence.storagePath).catch(() => null);
  if (!buffer) return NextResponse.json({ error: "File missing from storage" }, { status: 404 });

  await recordCustodyView(evidenceId);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": evidence.mimeType,
      "Content-Disposition": `inline; filename="${evidence.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
