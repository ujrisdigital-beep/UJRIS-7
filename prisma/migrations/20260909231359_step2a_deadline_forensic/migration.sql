-- CreateTable
CREATE TABLE "ForensicFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidenceId" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "sourceEvidenceIds" TEXT NOT NULL,
    "sourceEvidenceHashes" TEXT NOT NULL,
    "sourceTimestamps" TEXT NOT NULL,
    "derivedTimestamp" DATETIME,
    "calculationInputs" TEXT NOT NULL,
    "calculationResult" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "confirmationStatus" TEXT NOT NULL DEFAULT 'unconfirmed',
    "confirmationActor" TEXT,
    "confirmationAt" DATETIME,
    "supersedesId" TEXT,
    "supersededById" TEXT,
    "revisionReason" TEXT,
    "payloadHash" TEXT NOT NULL,
    CONSTRAINT "ForensicFinding_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deadline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "basis" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "source" TEXT NOT NULL DEFAULT 'ai_inference',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" DATETIME,
    "resolutionStatus" TEXT NOT NULL DEFAULT 'unresolved',
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "resolutionReason" TEXT,
    "confirmationStatus" TEXT NOT NULL DEFAULT 'unconfirmed',
    "confirmedAt" DATETIME,
    "confirmedBy" TEXT,
    "sourceKind" TEXT NOT NULL DEFAULT 'derived_deadline',
    "ruleId" TEXT,
    "ruleVersion" TEXT,
    "calculationInputs" TEXT,
    "sourceEventDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deadline_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Deadline" ("acknowledged", "basis", "caseId", "confidence", "createdAt", "dueDate", "id", "label", "source") SELECT "acknowledged", "basis", "caseId", "confidence", "createdAt", "dueDate", "id", "label", "source" FROM "Deadline";
DROP TABLE "Deadline";
ALTER TABLE "new_Deadline" RENAME TO "Deadline";
CREATE INDEX "Deadline_caseId_idx" ON "Deadline"("caseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ForensicFinding_evidenceId_idx" ON "ForensicFinding"("evidenceId");

-- CreateIndex
CREATE INDEX "ForensicFinding_supersedesId_idx" ON "ForensicFinding"("supersedesId");
