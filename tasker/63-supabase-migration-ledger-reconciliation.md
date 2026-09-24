<!-- tasker/63-supabase-migration-ledger-reconciliation.md -->

# 63 — Supabase migration ledger reconciliation

**Created:** 2026-08-25

**Status:** Open

**Priority:** P1
**Type:** Database deployment reliability

**2026-09-24 observation (Tasker 104):** The read-only deployment preflight confirms production
has `20260924000000`, `20260924000100`, and `20260924150000`; QA has none of those ledger versions
or alternate lease/reaper/lock-free name entries. Both projects expose the expected recovery
and queued-reaper signatures with safe service-only grants. That function-level parity does not
establish every migration effect. Verify the complete changes before repairing QA's ledger;
do not replay historical DDL. [Receipts and implementation notes](../docs/technical/reviews/SUPABASE_CONTAINMENT_IMPLEMENTATION_2026-09-24.md).

The later [complete production audit](../docs/technical/reviews/SUPABASE_MIGRATION_STATUS_2026-09-24.md)
checks all 477 active SQL files and seven archived backups. Production records 220 exact
version/name pairs and two matching migrations under different timestamps. All 255 unrecorded
active files are listed individually; 234 predate the earliest retained ledger entry. Four
recent changes are confirmed missing: security containment, task-create lock-first, onboarding
activation progress, and Libri unissued-upload quota settlement. Ten other unrecorded files have
matching live effects; 241 historical files still need full reconciliation. This is not a replay
list. The email-scan migration's complete declared schema is verified despite missing history.

The audit also compares recorded SQL: the email-review adjudication constraint is less strict in
production than the local `20260724020000` file. Other recorded-content exceptions and superseded
definitions are documented. Preserve this distinction when repairing history; an existing ledger
row does not certify current local-file equivalence.

The prior QA check found 0/477 exact local versions in its eight-entry ledger, but its task-create
lock-first function body matches local after line-ending normalization. The new containment
migration is unapplied in both and remains unstaged per DJ's conditional instruction. No hosted
schema or ledger changes occurred during either audit.

**2026-09-24 evening (Tasker 104):** the QA branch `daudvqczjqxhpzstlfih` was deleted, so every
QA ledger gap recorded here is moot; only the production ledger remains. The containment migration
`20260924202321` has since been applied to production and recorded. New migrations are
checked with `pnpm db:rehearse` against a production schema snapshot before they are applied.

## Why this exists

During the queue-first rollout, `supabase migration list` showed many historical local files absent
from the hosted migration ledger plus an unrelated pending migration. A normal `supabase db push`
therefore refuses to apply only the new migration unless `--include-all` is used. Applying hundreds
of historical files with that flag is unsafe and makes focused production rollouts harder to audit.
The queue-first migration can be applied through the Supabase migration API, but the repository and
hosted ledger should be reconciled deliberately.

## Investigation

- Classify every local-only historical migration as already reflected in schema, intentionally
  skipped, superseded, or genuinely pending.
- Compare checksums/function definitions for high-risk DDL rather than trusting filenames alone.
- Define the authoritative baseline and repair the hosted migration ledger without replaying DDL.
- Preserve the unrelated pending `20260824205329` migration and determine its owner/release order.
- Add CI that rejects duplicate timestamps and unexpected local/remote migration divergence.

## Acceptance criteria

1. `supabase migration list` has an explained, reviewed result with no ambiguous historical gap.
2. A new migration can pass `supabase db push --dry-run` without `--include-all`.
3. No historical DDL is replayed against production during ledger repair.
4. Duplicate migration timestamps are eliminated or explicitly blocked by CI.
5. The runbook documents focused migration rollback and post-apply advisor checks.

## Non-goals

- Applying the unrelated pending migration as part of the queue-first feature.
- Rewriting old migration contents after they have shipped.
- Treating schema equality alone as proof that data migrations ran correctly.
