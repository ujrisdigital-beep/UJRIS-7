/**
 * Safe delivery of untrusted evidence bytes.
 *
 * Invariant: user-uploaded content must never execute as HTML/JS/SVG in the
 * UJRIS application origin. This ticket uses attachment delivery for every
 * evidence type, including PDF/image. Preview-on-origin is out of scope.
 */

const ACTIVE_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "text/html; charset=utf-8",
]);

const ACTIVE_EXTENSIONS = new Set(["html", "htm", "shtml", "svg", "xml", "js", "mjs"]);

export function sanitizeDownloadFilename(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "download";
  const ascii = base
    .replace(/[\r\n"]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[/\\]/g, "_")
    .trim();
  const clipped = ascii.slice(0, 180);
  return clipped.length > 0 ? clipped : "download";
}

export function sniffActiveContent(buffer: Buffer): "html" | "svg" | "javascript" | null {
  const head = buffer.subarray(0, 2048).toString("utf8").replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (head.startsWith("<svg") || /<svg[\s>]/.test(head)) return "svg";
  if (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.includes("<script") ||
    head.startsWith("<iframe")
  ) {
    return "html";
  }
  if (head.startsWith("javascript:") || head.startsWith("<script")) return "javascript";
  return null;
}

export function isActiveDeclaredType(mimeType: string, fileName: string): boolean {
  const mime = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ACTIVE_MIME_TYPES.has(mime) || ACTIVE_MIME_TYPES.has(mimeType.trim().toLowerCase())) return true;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ACTIVE_EXTENSIONS.has(ext);
}

export type EvidenceDownloadHeaders = {
  "Content-Type": string;
  "Content-Disposition": string;
  "X-Content-Type-Options": "nosniff";
  "Cache-Control": "private, no-store";
  "X-Frame-Options": "DENY";
};

export function buildEvidenceDownloadHeaders(input: {
  storedMimeType: string;
  fileName: string;
  bytes: Buffer;
}): EvidenceDownloadHeaders {
  const filename = sanitizeDownloadFilename(input.fileName);
  // RFC 2183 / 6266 — quoted filename with CR/LF/quotes already stripped.
  const disposition = `attachment; filename="${filename}"`;

  const sniffed = sniffActiveContent(input.bytes);
  const declaredActive = isActiveDeclaredType(input.storedMimeType, input.fileName);

  let contentType: string;
  if (sniffed || declaredActive) {
    contentType = "application/octet-stream";
  } else if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(input.storedMimeType.split(";")[0]?.trim() ?? "")) {
    const base = input.storedMimeType.split(";")[0].trim().toLowerCase();
    contentType = base;
  } else {
    contentType = "application/octet-stream";
  }

  return {
    "Content-Type": contentType,
    "Content-Disposition": disposition,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "X-Frame-Options": "DENY",
  };
}
