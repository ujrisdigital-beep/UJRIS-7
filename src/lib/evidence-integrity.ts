import { sha256Buffer } from "@/lib/hash-chain";
import { readEvidenceFile } from "@/lib/storage";

export type IntegrityStatus = "verified" | "mismatch" | "unavailable" | "error";

export interface IntegrityCheckResult {
  status: IntegrityStatus;
  computedSha256?: string;
}

/**
 * Recompute SHA-256 of the bytes currently on disk and compare with the
 * immutable stored original hash. Never writes, never overwrites sha256.
 */
export async function verifyEvidenceIntegrity(input: {
  storagePath: string;
  storedSha256: string;
}): Promise<IntegrityCheckResult> {
  try {
    const bytes = await readEvidenceFile(input.storagePath);
    const computedSha256 = sha256Buffer(bytes);
    if (computedSha256 === input.storedSha256) {
      return { status: "verified", computedSha256 };
    }
    return { status: "mismatch", computedSha256 };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = error instanceof Error ? error.message : "";
    if (code === "ENOENT" || message === "path_traversal" || message === "invalid_storage_path") {
      return { status: "unavailable" };
    }
    return { status: "error" };
  }
}
