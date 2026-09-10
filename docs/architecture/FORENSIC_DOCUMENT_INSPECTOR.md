# Forensic Document Inspector — design only (Step 2A)

Status: **design remains the long-term contract**. Step 2A remediation added
an additive SQLite `ForensicFinding` table for timestamp-rule provenance
and versioning only. The full inspector (reports, observations, tool runs,
relationships) is still not implemented. Step 2B / Supabase was not started.

The inspector observes **metadata and byte-level facts**. It does not decide
authenticity, legal liability, or intent.

## Purpose

Given an evidence object (file bytes + immutable original hash + custody
history), produce:

1. a **report** (one per inspection run of a file, or of a related set);
2. **findings** that a human can review, each tied to a rule, a tool, and
   raw observations;
3. **observations** (facts the tools measured);
4. **tool run** records (name, version, parameters, started/finished);
5. optional **document relationships** and **document versions**.

Findings are explanations of what was observed, not accusations.

## Allowed language

Allowed (examples, not exhaustive):

- metadata inconsistency
- timestamp anomaly
- later revision appears present
- creator/producer mismatch
- requires explanation
- requires expert review

Forbidden when based solely on metadata (do not output these from inspector
rules):

- forged
- fabricated
- fraudulent
- tampered (as a determination of authenticity)

A finding may say a timestamp **requires explanation**. It must not say the
file was forged.

## Version identifiers (required on every report)

These are distinct. Do not collapse them into a single “version” string.

| identifier | what it versions | who bumps it |
|---|---|---|
| `forensic_report_version` | This report row’s ordinal for the same evidence/case (1, 2, 3…) | new report after correction/re-run |
| `schema_version` | Shape of report/observation/finding records | inspector schema owner |
| `rule_set_version` | The published set of finding rules (e.g. F-TS-001 bundle) | legal/forensic rule owner |
| `extractor_version` | Parser that pulled raw metadata/text from bytes | extractor module |
| `tool_version` | External or bundled tool (exifr, pdf-lib, …) | tool vendor / pin file |
| `processing_pipeline_version` | Orchestration: copy bytes → extract → evaluate → persist | pipeline owner |

A report stores the versions **used for that run**. Changing a rule or
extractor never mutates a finalized report; it produces a new report.

## Reproducibility principle

Given:

- the same original evidence bytes (immutable `Evidence.sha256`);
- the same extractor version;
- the same tool version;
- the same rule-set version;
- the same processing pipeline version;

the system must be able to explain **how** a finding was produced
(which observations, which rule, which comparison). Bit-identical
re-emission of every timestamp is a goal, not a guarantee, when a tool
embeds wall-clock `generated_at`. Explanations must still be reconstructable.

## Future tables

PostgreSQL types are indicative. SQLite equivalents can be used only if a
local prototype is required; production target is Supabase Postgres (ADR-0002).

### forensic_reports

One inspection of one evidence item (or a declared set). **Immutable after
finalization.** Corrections create a new row with `report_version + 1` and
`supersedes_report_id` pointing at the previous finalized report. Historical
rows are never overwritten.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| case_id | uuid fk → cases | required |
| evidence_id | uuid fk → evidence | required for single-file reports |
| report_version | int | `forensic_report_version` for this evidence (starts at 1) |
| status | text | `queued` \| `running` \| `completed` \| `failed` \| `needs_review` \| `finalized` |
| schema_version | text | e.g. `forensic-report/1.0.0` |
| rule_set_version | text | e.g. `ujris-forensic-rules/2026.09.1` |
| pipeline_version | text | processing_pipeline_version |
| extractor_version | text | default extractor for this run |
| tool_versions | jsonb | map of tool_name → tool_version |
| summary | text | non-accusatory |
| limitations | text | what the run could not determine |
| started_at | timestamptz | |
| completed_at | timestamptz null | |
| created_by | uuid / text | user id or `system:` inspector service |
| created_at | timestamptz | |
| supersedes_report_id | uuid null | previous report this one replaces |
| finalized_at | timestamptz null | once set, the row is append-only |
| payload_hash | text | hash of canonical report body excluding `id` |

Writes after `finalized_at` are forbidden except to set `superseded_by`
on this row when a newer report is finalized.

### forensic_observations

Raw measurements. Findings cite observations; observations do not assert
legal meaning.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| report_id | uuid fk → forensic_reports | |
| evidence_id | uuid fk → evidence | |
| kind | text | e.g. `exif_datetime_original`, `pdf_mod_date`, `sha256` |
| raw_value | text | exactly what the extractor/tool returned |
| normalized_value | text null | canonical form (e.g. UTC ISO-8601) |
| source_location | text | byte range, metadata key, PDF info dict key, … |
| extractor | text | module id |
| extractor_version | text | |
| tool_name | text | |
| tool_version | text | |
| extraction_timestamp | timestamptz | when this observation was made |
| value_numeric | numeric null | |
| value_instant | timestamptz null | normalized UTC when the observation is a time |
| raw_json | jsonb | vendor/tool payload |
| created_at | timestamptz | |

### forensic_findings

Every finding **must** include the fields below. Findings are immutable
once their parent report is finalized.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| report_id | uuid fk → forensic_reports | |
| evidence_id | uuid fk → evidence | |
| finding_type | text | stable machine id, e.g. `later_revision_appears_present` |
| category | text | e.g. `timestamp`, `metadata`, `hash`, `relationship` |
| rule_id | text | e.g. `F-TS-001` |
| rule_version | text | version of that rule inside the rule set |
| observation_ids | uuid[] / jsonb | observations this finding rests on |
| observed_value | text | what was measured |
| reference_value | text null | expected/comparison value when applicable |
| severity | text | `info` \| `attention` \| `review` |
| confidence | text | `low` \| `medium` \| `high` — about the *observation*, not guilt |
| explanation | text | allowed language only |
| limitations | text | what this finding does not prove |
| generated_at | timestamptz | |
| tool_name | text | |
| tool_version | text | |
| created_at | timestamptz | |

### forensic_tool_runs

Isolated processing record. Future workers must not mutate evidence bytes.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| report_id | uuid fk → forensic_reports | |
| tool_name | text | |
| tool_version | text | |
| extractor_version | text null | if this run is an extractor |
| parameters_json | jsonb | |
| started_at | timestamptz | |
| finished_at | timestamptz null | |
| exit_status | text | `ok` \| `error` \| `unavailable` |
| error_detail | text null | no file bytes |

### document_relationships

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| case_id | uuid fk → cases | |
| from_evidence_id | uuid fk → evidence | |
| to_evidence_id | uuid fk → evidence | |
| relationship_type | text | e.g. `derived_from`, `same_family`, `attachment_of` |
| confidence | text | |
| explanation | text | |
| created_at | timestamptz | |

### document_versions

Logical document identity across files (e.g. two PDFs of “grievance outcome”).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| case_id | uuid fk → cases | |
| label | text | user-facing, not a finding |
| created_at | timestamptz | |

Join table `document_version_evidence (version_id, evidence_id, ordinal)`.

## Relationships to existing concepts

```
cases 1──* evidence 1──* custody_events
  │              │
  │              └──* forensic_reports 1──* forensic_findings
  │                              │         └── forensic_observations
  │                              └──* forensic_tool_runs
  ├──* chronology / case_events     (findings may *cite* an event id; they do not rewrite it)
  ├──* assertions / uju_briefs      (findings never become facts automatically)
  └──* contradictions               (a finding may *suggest* a contradiction for human review)
```

- **Custody events** remain the write-ahead ledger for access and upload.
  A forensic run may append a custody action such as `forensic_inspected`
  once that action is defined — it must not rewrite prior chain hashes.
- **Evidence.sha256** is the immutable original hash. Verification recomputes
  current bytes and compares; it never overwrites `sha256`.
- **Chronology/events** may be proposed from timestamps but stay
  `ai_inference` / `needs_review` until a human confirms.
- **Assertions** (user narrative, UJU Brief) are a different truth layer
  from forensic observations.
- **Contradictions** are case-level review items. A metadata inconsistency
  may create a *candidate* contradiction; it is not auto-confirmed.

## Processing isolation (future)

- Run tools in a worker that cannot serve HTML on the application origin.
- Copy bytes to an isolated temp path; never execute user files.
- Persist tool name + version on every finding.
- Store raw tool output as observations, not as user-visible accusations.

## Current codebase mapping (do not confuse with this schema)

Today `Evidence.forensics` is a JSON blob of flags from
`src/lib/forensics/evidence.ts`. Rule **F-TS-001** lives in
`src/lib/forensics/timestamps.ts` and is the only timestamp comparison
rule made deterministic in Step 2A. The blob is a transitional store until
these tables exist.

## Immutability and corrections

1. A report may be mutated only while `status` is `queued` or `running`.
2. `finalized` / `completed` reports are immutable.
3. A human or system correction **inserts** a new report (`report_version+1`,
   `supersedes_report_id = old.id`). It does not `UPDATE` findings in place.
4. Confirmation of a finding is a separate audit event; it does not rewrite
   `observed_value`, `rule_version`, or `observation_ids`.
5. The current Step 2A `ForensicFinding` SQLite table is a **transitional**
   provenance store for F-TS-001 only. It is not the inspector.

## Out of scope here

- Implementing the tables, worker, or UI (Step 2B / later).
- Expanding UJU.
- Declaring files authentic or inauthentic.
- LLM-based deadline or authenticity arithmetic.
