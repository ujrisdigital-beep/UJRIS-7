import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildEvidenceDownloadHeaders,
  sanitizeDownloadFilename,
  sniffActiveContent,
} from "@/lib/evidence-delivery";
import { resolveContainedEvidencePath } from "@/lib/storage";

const fixtures = path.join(process.cwd(), "tests", "fixtures");

describe("evidence download headers", () => {
  it("forces HTML to octet-stream attachment with nosniff", () => {
    const bytes = readFileSync(path.join(fixtures, "active.html"));
    const headers = buildEvidenceDownloadHeaders({
      storedMimeType: "text/html",
      fileName: "payload.html",
      bytes,
    });
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers["Content-Disposition"]).toMatch(/^attachment;/);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Disposition"]).not.toContain("inline");
  });

  it("forces SVG to octet-stream attachment even if declared as image/svg+xml", () => {
    const bytes = readFileSync(path.join(fixtures, "active.svg"));
    const headers = buildEvidenceDownloadHeaders({
      storedMimeType: "image/svg+xml",
      fileName: "pic.svg",
      bytes,
    });
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers["Content-Disposition"]).toMatch(/^attachment;/);
  });

  it("sniffs HTML even when MIME and extension are mismatched", () => {
    const bytes = Buffer.from("<html><body>hi</body></html>");
    expect(sniffActiveContent(bytes)).toBe("html");
    const headers = buildEvidenceDownloadHeaders({
      storedMimeType: "application/pdf",
      fileName: "innocent.pdf",
      bytes,
    });
    expect(headers["Content-Type"]).toBe("application/octet-stream");
  });

  it("strips CR/LF and quotes from Content-Disposition filenames", () => {
    const name = sanitizeDownloadFilename('evil\r\nX-Injected: 1".html');
    expect(name).not.toMatch(/[\r\n"]/);
    const headers = buildEvidenceDownloadHeaders({
      storedMimeType: "text/plain",
      fileName: 'report\r\nLocation: https://evil.test".txt',
      bytes: Buffer.from("ok"),
    });
    expect(headers["Content-Disposition"]).not.toMatch(/[\r\n]/);
    expect(headers["Content-Disposition"]).not.toContain("Location:");
  });

  it("serves PDF and JPEG as attachments (not inline) with their types", () => {
    const pdf = buildEvidenceDownloadHeaders({
      storedMimeType: "application/pdf",
      fileName: "bundle.pdf",
      bytes: Buffer.from("%PDF-1.4 mock"),
    });
    expect(pdf["Content-Type"]).toBe("application/pdf");
    expect(pdf["Content-Disposition"]).toMatch(/^attachment;/);

    const jpeg = buildEvidenceDownloadHeaders({
      storedMimeType: "image/jpeg",
      fileName: "photo.jpg",
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    expect(jpeg["Content-Type"]).toBe("image/jpeg");
    expect(jpeg["Content-Disposition"]).toMatch(/^attachment;/);
  });
});

describe("storage path containment", () => {
  it("rejects path traversal", () => {
    expect(() => resolveContainedEvidencePath("../etc/passwd")).toThrow("path_traversal");
    expect(() => resolveContainedEvidencePath("../../secret.txt")).toThrow("path_traversal");
  });
});
