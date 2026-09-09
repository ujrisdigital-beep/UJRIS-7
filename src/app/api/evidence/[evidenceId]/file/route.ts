import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readEvidenceFile } from "@/lib/storage";
import { recordCustodyView } from "@/lib/actions/evidence";
import { buildEvidenceDownloadHeaders } from "@/lib/evidence-delivery";

/**
 * Authenticated, object-level-authorised evidence download.
 * Bytes are always returned as an attachment with nosniff. Active content
 * (HTML/SVG/JS) is forced to application/octet-stream so it cannot execute
 * on the UJRIS origin.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const evidence = await db.evidence.findUnique({ where: { id: evidenceId }, include: { case: true } });
  if (!evidence || evidence.case.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readEvidenceFile(evidence.storagePath);
  } catch {
    return NextResponse.json({ error: "File missing from storage" }, { status: 404 });
  }

  await recordCustodyView(evidenceId);

  const headers = buildEvidenceDownloadHeaders({
    storedMimeType: evidence.mimeType,
    fileName: evidence.fileName,
    bytes: buffer,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": headers["Content-Type"],
      "Content-Disposition": headers["Content-Disposition"],
      "X-Content-Type-Options": headers["X-Content-Type-Options"],
      "Cache-Control": headers["Cache-Control"],
      "X-Frame-Options": headers["X-Frame-Options"],
    },
  });
}
