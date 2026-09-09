# Forensic Document Inspector — design only (Step 2A)

Status: **design only**. Not implemented in this ticket. No tables below are
created in Prisma/SQLite yet. This document is the contract for the future
inspector so Step 2B+ can migrate evidence first, then add structured
findings without inventing schema under pressure.

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

## Future tables

PostgreSQL types are indicative. SQLite equivalents can be used only if a
local prototype is required; production target is Supabase Postgres (ADR-0002).

### forensic_reports

One inspection of one evidence item (or a declared set).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| case_id | uuid fk → cases | required |
| evidence_id | uuid fk → evidence | required for single-file reports |
| status | text | `queued` \| `running` \| `completed` \| `failed` \| `needs_review` |
| summary | text | non-accusatory |
| limitations | text | what the run could not determine |
| created_by | uuid fk → profiles/users | inspector service account or user |
| created_at | timestamptz | |
| completed_at | timestamptz null | |

### forensic_findings

Every finding **must** include the fields below.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| report_id | uuid fk → forensic_reports | |
| evidence_id | uuid fk → evidence | |
| finding_type | text | stable machine id, e.g. `later_revision_appears_present` |
| category | text | e.g. `timestamp`, `metadata`, `hash`, `relationship` |
| observed_value | text | what was measured |
| reference_value | text null | expected/comparison value when applicable |
| rule_id | text | e.g. `F-TS-001` |
| severity | text | `info` \| `attention` \| `review` |
| confidence | text | `low` \| `medium` \| `high` — about the *observation*, not guilt |
| explanation | text | allowed language only |
| limitations | text | what this finding does not prove |
| tool_name | text | |
| tool_version | text | |
| raw_observation_reference | uuid fk → forensic_observations | |
| created_at | timestamptz | |

### forensic_observations

Raw measurements. Findings cite observations; observations do not assert
legal meaning.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| report_id | uuid fk → forensic_reports | |
| evidence_id | uuid fk → evidence | |
| kind | text | e.g. `exif_datetime_original`, `pdf_mod_date`, `sha256` |
| value_text | text null | |
| value_numeric | numeric null | |
| value_instant | timestamptz null | normalized UTC when the observation is a time |
| raw_json | jsonb | vendor/tool payload |
| created_at | timestamptz | |

### forensic_tool_runs

Isolated processing record. Future workers must not mutate evidence bytes.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| report_id | uuid fk → forensic_reports | |
| tool_name | text | |
| tool_version | text | |
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

## Out of scope here

- Implementing the tables or UI.
- Expanding UJU.
- Declaring files authentic or inauthentic.
- LLM-based deadline or authenticity arithmetic.
