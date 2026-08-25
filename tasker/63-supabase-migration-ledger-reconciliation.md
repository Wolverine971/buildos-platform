<!-- tasker/63-supabase-migration-ledger-reconciliation.md -->

# 63 — Supabase migration ledger reconciliation

**Created:** 2026-08-25

**Status:** Open

**Priority:** P1
**Type:** Database deployment reliability

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
