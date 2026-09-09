import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";

/**
 * Private evidence storage.
 *
 * Writes to a local, git-ignored directory outside `public/`. Every read
 * goes through `resolveContainedEvidencePath` so `../` cannot escape the
 * evidence root. This module is swappable for object storage later.
 */

const STORAGE_ROOT = path.join(process.cwd(), "data", "evidence");

export function getEvidenceStorageRoot(): string {
  return STORAGE_ROOT;
}

export function resolveContainedEvidencePath(relativePath: string): string {
  if (!relativePath || relativePath.includes("\0")) {
    throw new Error("invalid_storage_path");
  }
  const root = path.resolve(STORAGE_ROOT);
  const full = path.resolve(root, relativePath);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(prefix)) {
    throw new Error("path_traversal");
  }
  return full;
}

export function relativeEvidencePath(caseId: string, evidenceId: string, fileName: string): string {
  const safeCase = caseId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeId = evidenceId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(safeCase, `${safeId}-${safeName}`);
}

export async function saveEvidenceFile(relativePath: string, buffer: Buffer): Promise<void> {
  const fullPath = resolveContainedEvidencePath(relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
}

export async function readEvidenceFile(relativePath: string): Promise<Buffer> {
  const fullPath = resolveContainedEvidencePath(relativePath);
  return readFile(fullPath);
}

export async function deleteEvidenceFile(relativePath: string): Promise<void> {
  try {
    const fullPath = resolveContainedEvidencePath(relativePath);
    await unlink(fullPath);
  } catch {
    // Missing file or traversal — ignore on delete.
  }
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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
