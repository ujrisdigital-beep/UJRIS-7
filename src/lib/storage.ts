import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";

/**
 * Private evidence storage.
 *
 * For the MVP this writes to a local, git-ignored directory outside
 * `public/` (so files are never served without going through the
 * authenticated download route). This is intentionally swappable: in
 * production, replace this module with an S3-compatible object storage
 * client (encrypted at rest, signed URLs) — no calling code elsewhere
 * needs to change.
 */

const STORAGE_ROOT = path.join(process.cwd(), "data", "evidence");

export function relativeEvidencePath(caseId: string, evidenceId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(caseId, `${evidenceId}-${safeName}`);
}

export async function saveEvidenceFile(relativePath: string, buffer: Buffer): Promise<void> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
}

export async function readEvidenceFile(relativePath: string): Promise<Buffer> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  return readFile(fullPath);
}

export async function deleteEvidenceFile(relativePath: string): Promise<void> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  await unlink(fullPath).catch(() => undefined);
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB per file

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);
