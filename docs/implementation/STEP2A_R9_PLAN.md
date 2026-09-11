# Step 2A-R9 plan

Branch: `step-2a-security-test-foundation`  
Reviewed R8 head: `772cb9b944c729cebec569133e68a84dcb5eebe9`  
Supabase / Step 2B: **not in this ticket**  
GHSA / advisory policy: **do not reopen**  
R4–R8 passing named cases: **do not reopen** except these two clause structures

## Handoff recovery

`CURSOR_BLOCKERS.md` and `FINAL_MERGE_GATE.md` were **not** present on this
host (Windows Codex output path is not mounted). The two remaining High
fixtures below were recovered by running the clause structures named in
the R9 ticket against HEAD `772cb9b`. Among those structures, these two
still assign 20 April 2026 to a dismissal occurrence and yield a
provisional/confirmable limitation candidate:

## Exact Codex reproduction 1

`The hearing, about my dismissal, is on 20 April 2026.`

Current classification: `dismissal` remains `occurrence` (comma between
`hearing` and `about` breaks the R8 tight gap). `nearestEventOwner`
assigns 20 April to dismissal. One resolved qualifying candidate.

## Exact Codex reproduction 2

`The tribunal hearing, which concerns my dismissal, is on 20 April 2026.`

Current classification: same failure class. Comma + relative pronoun
`which` + `concerns` is outside the R8 suffix grammar, so dismissal owns
20 April.

(The relative-clause example without commas, `The hearing for the
dismissal I received last month is on 20 April 2026.`, already classifies
dismissal as a reference at R8. It is a required structural variant, not
a current miss.)

## Why R8 still misclassifies them

R8 reference detection requires the gap between a procedural head and a
qualifying word to **be** `relation + optional determiner` only. A comma,
`which`/`that`, or `concerns` makes the suffix fail. Nearest-token
ownership then gives the outer procedural date to the inner noun.

Separately, labelling every embedded dismissal as `reference` would drop
a real inner date (`…dismissal I received on 12 March… is on 20 April`).
R9 must distinguish **outer procedural assertion dates** from **inner
qualifying assertion dates**.

## General ownership invariant

**CLAUSE-BOUNDARY DATE OWNERSHIP INVARIANT:** a date may support
limitation confirmation only when it is independently owned by the
qualifying event occurrence. A date belonging to an outer procedural
assertion must not transfer to a qualifying event mentioned inside that
procedural assertion, regardless of lexical proximity.

## Minimum production change

1. Punctuation-tolerant topic-scope: allow commas and `which|that|who`
   (optional `is|was`) before the existing relation vocabulary, including
   `concerns`. Keep the **suffix** check so an independent later
   `but I was dismissed on …` stays an occurrence.
2. Event-assertion date binding in the same sentence:
   - date-first procedural noun (`The 20 April 2026 hearing`);
   - outer predicate (`is/was/took place/scheduled/listed on|for DATE`);
   - parenthetical/comma span containing the date binds to the inner
     event in that span;
   - otherwise a short local `on|for` window after a qualifying mention
     binds to that mention even if it is topic-embedded.
3. Confirmation: refuse when stored qualifying type/date is owned by a
   procedural event (tamper / mismatched `dateOwnerEventType`).

Do not phrase-blacklist the two fixtures. Do not edit GHSA matchers.

## Direct confirmation defence

`evaluateLimitationConfirmation` already refuses
`dateOwnerEventType !== qualifying type`. Add an explicit unit/integration
tamper: `eventType=dismissal`, `civilDate=20 April`,
`dateOwnerEventType=hearing` → REFUSE.

## Regression tests

`tests/integration/clause-boundary-date-ownership.test.ts` — fixtures 1
and 2 first, then relative-clause, scheduled-for parenthetical, date-first,
embedded 12 March + outer 20 April, two-date ownership, second unresolved
dismissal, R8 three named phrases, mutation (comma-blind nearest mention).

## Mutation test

If ownership falls back to nearest qualifying mention / last preceding
event without assertion binding, fixtures 1 and 2 fail.

## Stop condition

Both recovered fixtures refuse confirmation and do not attach high
confidence; inner 12 March still belongs to dismissal; R8 named cases and
GHSA tests remain green; full verification and CI pass. Then STOP.
