import exifr from "exifr";
import { PDFDocument } from "pdf-lib";
import { differenceInCalendarDays } from "date-fns";
import { sha256Buffer } from "@/lib/hash-chain";

/**
 * Forensic / metadata analysis for uploaded evidence.
 *
 * This never claims to establish authenticity or legal admissibility on its
 * own — it surfaces objective, explainable signals (embedded timestamps,
 * device/software info, GPS, stripped metadata, edit gaps) so the user and
 * any adviser can decide what they mean. Every flag states exactly what was
 * found and why it might matter — never an accusation of wrongdoing.
 */

export interface ForensicFlag {
  id: string;
  severity: "info" | "attention" | "review";
  title: string;
  detail: string;
}

export interface ForensicReport {
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  flags: ForensicFlag[];
  category: "image" | "pdf" | "document" | "audio" | "other";
}

export async function analyzeEvidenceFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  claimedDate: Date | null
): Promise<ForensicReport> {
  const sha256 = sha256Buffer(buffer);
  const category = categorize(mimeType, fileName);

  if (category === "image") {
    return analyzeImage(buffer, mimeType, sha256, claimedDate);
  }
  if (category === "pdf") {
    return analyzePdf(buffer, mimeType, sha256, claimedDate);
  }

  return {
    sha256,
    mimeType,
    sizeBytes: buffer.length,
    metadata: {},
    category,
    flags: [
      {
        id: "no_metadata_extraction",
        severity: "info",
        title: "Metadata extraction not available for this file type",
        detail:
          "UJRIS currently extracts embedded metadata for images (EXIF) and PDFs. This file's cryptographic hash and custody record are still recorded, so integrity can still be verified later.",
      },
    ],
  };
}

function categorize(mimeType: string, fileName: string): ForensicReport["category"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("audio/")) return "audio";
  if (/\.(docx?|txt|eml|msg)$/i.test(fileName)) return "document";
  return "other";
}

async function analyzeImage(
  buffer: Buffer,
  mimeType: string,
  sha256: string,
  claimedDate: Date | null
): Promise<ForensicReport> {
  const flags: ForensicFlag[] = [];
  let metadata: Record<string, unknown> = {};

  try {
    const exif = await exifr.parse(buffer, { gps: true, tiff: true, exif: true });
    metadata = exif ?? {};
  } catch {
    flags.push({
      id: "exif_parse_failed",
      severity: "info",
      title: "Could not read embedded image metadata",
      detail: "The image may have been re-saved, compressed, or exported by an app that strips EXIF data.",
    });
  }

  const createDate: Date | undefined = (metadata.DateTimeOriginal || metadata.CreateDate) as Date | undefined;
  const modifyDate: Date | undefined = metadata.ModifyDate as Date | undefined;

  if (!createDate && Object.keys(metadata).length === 0) {
    flags.push({
      id: "metadata_stripped",
      severity: "attention",
      title: "No embedded capture metadata found",
      detail:
        "This image has no EXIF capture date, camera, or GPS data. This is common for screenshots and messaging-app exports, but can also indicate metadata was stripped on save. Consider also preserving the original file or a screen recording of its source.",
    });
  }

  if (createDate) {
    metadata.readableCreateDate = createDate.toISOString();
    if (claimedDate) {
      const gap = Math.abs(differenceInCalendarDays(createDate, claimedDate));
      if (gap > 2) {
        flags.push({
          id: "date_mismatch",
          severity: "review",
          title: "Capture date differs from the date you assigned to this evidence",
          detail: `The image's embedded capture date is ${createDate.toDateString()}, which is ${gap} day(s) from the date you recorded (${claimedDate.toDateString()}). This may simply mean the photo was taken and shared later — worth double-checking which date is correct for your timeline.`,
        });
      }
    }
  }

  if (createDate && modifyDate) {
    metadata.readableModifyDate = modifyDate.toISOString();
    const editGap = Math.abs(differenceInCalendarDays(modifyDate, createDate));
    if (editGap > 1) {
      flags.push({
        id: "edited_after_capture",
        severity: "attention",
        title: "Image was modified after it was originally captured",
        detail: `Captured ${createDate.toDateString()}, last modified ${modifyDate.toDateString()} (${editGap} day(s) later). This can be entirely normal (e.g. cropping, re-saving) but is worth noting if the image's authenticity is disputed.`,
      });
    }
  }

  if (metadata.latitude && metadata.longitude) {
    flags.push({
      id: "gps_present",
      severity: "info",
      title: "Location data found",
      detail: `This image contains GPS coordinates (${metadata.latitude}, ${metadata.longitude}), which may help corroborate where an event took place.`,
    });
  }

  if (metadata.Make || metadata.Model) {
    metadata.device = [metadata.Make, metadata.Model].filter(Boolean).join(" ");
  }

  return { sha256, mimeType, sizeBytes: buffer.length, metadata: trimMetadata(metadata), flags, category: "image" };
}

async function analyzePdf(
  buffer: Buffer,
  mimeType: string,
  sha256: string,
  claimedDate: Date | null
): Promise<ForensicReport> {
  const flags: ForensicFlag[] = [];
  let metadata: Record<string, unknown> = {};

  try {
    const doc = await PDFDocument.load(buffer, { updateMetadata: false, ignoreEncryption: true });
    const creationDate = doc.getCreationDate();
    const modificationDate = doc.getModificationDate();
    metadata = {
      title: doc.getTitle() ?? null,
      author: doc.getAuthor() ?? null,
      producer: doc.getProducer() ?? null,
      creator: doc.getCreator() ?? null,
      pageCount: doc.getPageCount(),
      creationDate: creationDate?.toISOString() ?? null,
      modificationDate: modificationDate?.toISOString() ?? null,
    };

    if (!creationDate && !doc.getAuthor() && !doc.getProducer()) {
      flags.push({
        id: "metadata_stripped",
        severity: "attention",
        title: "No document metadata found",
        detail:
          "This PDF has no creation date, author, or producer recorded. This is common for print-to-PDF or scanned/flattened documents, but can also mean metadata was removed.",
      });
    }

    if (creationDate && claimedDate) {
      const gap = Math.abs(differenceInCalendarDays(creationDate, claimedDate));
      if (gap > 2) {
        flags.push({
          id: "date_mismatch",
          severity: "review",
          title: "PDF creation date differs from the date you assigned",
          detail: `The file's internal creation date is ${creationDate.toDateString()}, which is ${gap} day(s) from the date you recorded (${claimedDate.toDateString()}). This can happen when a document is scanned or re-saved after the fact — worth checking which date matters for your case.`,
        });
      }
    }

    if (creationDate && modificationDate) {
      const editGap = Math.abs(differenceInCalendarDays(modificationDate, creationDate));
      if (editGap > 1) {
        flags.push({
          id: "edited_after_creation",
          severity: "attention",
          title: "Document was modified after it was created",
          detail: `Created ${creationDate.toDateString()}, last modified ${modificationDate.toDateString()} (${editGap} day(s) later). If the content or dates of this document are disputed, this gap may be relevant.`,
        });
      }
    }

    if (metadata.producer && /(word|excel|powerpoint|libreoffice|pages)/i.test(String(metadata.producer))) {
      flags.push({
        id: "originated_as_editable_document",
        severity: "info",
        title: "This PDF was generated from an editable document",
        detail: `Producer software recorded as "${metadata.producer}". If you have the original editable file, preserving it alongside the PDF can strengthen your evidence chain.`,
      });
    }
  } catch {
    flags.push({
      id: "pdf_parse_failed",
      severity: "info",
      title: "Could not read PDF metadata",
      detail: "The file may be encrypted, corrupted, or in a format UJRIS could not parse. Its hash is still recorded for custody purposes.",
    });
  }

  return { sha256, mimeType, sizeBytes: buffer.length, metadata, flags, category: "pdf" };
}

function trimMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  // Drop huge/binary EXIF fields (thumbnails etc.) that aren't useful to display.
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value instanceof Uint8Array || (typeof value === "object" && value !== null && "length" in (value as object) && (value as { length: number }).length > 2000)) {
      continue;
    }
    clone[key] = value;
  }
  return clone;
}

export function evidenceStrengthScore(flags: ForensicFlag[], hasExtractedText: boolean, category: string): number {
  let score = 40;
  if (category === "image" || category === "pdf") score += 15;
  if (hasExtractedText) score += 15;
  for (const flag of flags) {
    if (flag.severity === "review") score -= 10;
    if (flag.severity === "attention") score -= 5;
    if (flag.id === "gps_present") score += 10;
  }
  return Math.max(0, Math.min(100, score));
}
