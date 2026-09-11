# Dependency exception register

This is the **only** documented exception to failing the runtime/CI
dependency gate on High/Critical findings. It is not a blanket ignore.
`npm audit` continues to surface the advisory. Matching is by **exact
advisory ID plus approved dependency context**, not package name, via
name, parent package, path alone, or severity.

**EXCEPTION IDENTITY INVARIANT:** a dependency exception applies only to
the exact approved advisory identity and approved dependency context.
Unknown or different High advisories never inherit another advisory's
exception. Missing advisory IDs fail closed.

**ADVISORY SET INVARIANT:** every High/Critical advisory in a
vulnerability record must be independently identified and authorized.
One approved GHSA never PASSes a record that also contains unknown,
malformed, missing-ID, or unapproved High/Critical causes. Empty High
`via` lists and malformed `via` values fail closed.

**ADVISORY ID TYPE INVARIANT:** dependency exception matching accepts only
validated scalar advisory identifiers matching
`^GHSA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$` after documented trim and
case-normalisation. Arrays, objects, numbers, booleans, null, nested
values, comma-combined strings, and other malformed identities never
inherit an exception. `String()` / template coercion is not used on
advisory identity.

**EXACT ADVISORY TOKEN INVARIANT:** a GHSA may be taken from a URL only
when the entire decoded GitHub `/advisories/<segment>` equals the
canonical identity. A valid GHSA substring or prefix inside a longer
malformed token, nested path, query, fragment, or foreign host must fail
closed.

Reviewed: 2026-09-10  
Next review / `review_by`: 2026-12-31  
Owner: UJRIS engineering — Step 2A security track

## Exception EX-DEP-001

| Field | Value |
|---|---|
| Advisory ID | **GHSA-ggr8-5vv4-36mx** (required match) |
| Package | `deepmerge-ts` |
| Also listed by npm | `prisma`, `@prisma/config` (inherited cluster of **this** GHSA only) |
| Declared version (vulnerable range) | `<8.0.0` |
| Severity | High |
| Scope | development |
| Dependency paths | `prisma>@prisma/config>deepmerge-ts`; `node_modules/deepmerge-ts`; `node_modules/@prisma/config`; `node_modules/prisma` |
| Runtime exposure | **None in the Next.js request path.** `@prisma/client` does not load `@prisma/config` / `deepmerge-ts`. |
| Owner | UJRIS engineering — Step 2A security track |
| reviewed_at | 2026-09-10 |
| review_by / expires | 2026-12-31 |
| Remediation | Upgrade Prisma to a release that pins `deepmerge-ts >= 8`, or stop using Prisma CLI in production images |
| Decision | accept_temporary_dev_only |
| Reason | Confined to Prisma CLI config merger (devDependency). Exception is keyed to GHSA-ggr8-5vv4-36mx only. |

A **different** High on `deepmerge-ts`, an **unknown** High on the same
package or Prisma CLI path, a missing advisory ID, a Critical on the same
package, a **production_runtime** path (for example `@prisma/client`), an
**unknown** path, an expired exception, or an approved GHSA **plus**
another unidentified/malformed High **fails**
`npm run test:audit-policy`. Via-name-only parent rows do not inherit
EX-DEP-001 unless the audit graph reconstructs **this** GHSA and no other
High/Critical cause remains unidentified.
Audit-service errors, malformed JSON, empty/truncated output, and timeouts
are **ERROR** (exit 2), never a clean PASS.

Launch: `scripts/command-runner.mjs` runs `process.execPath` + `npm_execpath`
(or `npm-cli.js`). A bare `spawn("npm")` is not used. Spawn ENOENT,
timeout, signal termination, unexpected exit, and missing/malformed JSON
are ERROR. npm audit exit 0 or 1 with a valid `vulnerabilities` object is
**evaluated**.

Exception EX-DEP-001 `acceptedPathClasses`: **`dev_tooling` only**.

CI behaviour: the policy test is the gate. Raw `npm audit --audit-level=high`
is allowed to be nonzero for this documented advisory (and any Moderate
findings npm still prints).

Machine-readable copy: `docs/security/dependency-exceptions.json`.
Matcher: `scripts/dependency-match.mjs`.
