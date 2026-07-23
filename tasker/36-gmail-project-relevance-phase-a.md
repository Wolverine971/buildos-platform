<!-- tasker/36-gmail-project-relevance-phase-a.md -->

# 36 — Gmail Project Relevance Phase A

**Created 2026-07-22.** Owner: Email relevance / product engineer.  
**Type:** bounded internal evaluation build.  
**Status:** A0 is complete for authoring and Slice 1 is implemented locally. Production is linked,
the Gmail migration is reconciled, generated database types are fresh, and the deterministic
profile compiler/read-only preview are tested. The Phase A profile/rule migration is locally
verified but not applied to production. Slice 2 is fully specified and ready to implement after
that exact-file production verification receipt.  
**Handoff:** `apps/web/docs/technical/email/HANDOFF-PHASE-A-PROJECT-RELEVANCE.md`  
**Slice 2 handoff:**
`apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-2-SCAN-CONTROL-PLANE.md`  
**Architecture:**
`apps/web/docs/technical/email/GMAIL-INGESTION-AND-PROJECT-RELEVANCE-ARCHITECTURE.md`

## Outcome

Run a manually started, 30-day/up-to-1,000-message-per-account evaluation across DJ's three
read-only Gmail connections. Compare explainable retrieval and optional tool-free classifiers,
collect at least 300 adjudications, and decide from measured recall, precision, wrong-project risk,
and cost whether daily-brief ingestion is warranted.

## Non-goals

- no Gmail writes, drafts, labels, archive, delete, or mark-read;
- no continuous polling, Gmail watch, Pub/Sub, or daily-brief automation;
- no durable raw bodies or attachments;
- no production mailbox vector index;
- no unreviewed project mutations; and
- no model lane before explicit ZDR approval and enforcement.

## Prerequisite A0

- [x] Authenticate the Supabase CLI and link the workspace to production project
      `iwifjtlebphefldmwbkh` (`build_os`). Stable CLI `2.90.0` is the validated path; the installed
      `2.109.1` management/type commands hang in this environment.
- [x] Confirm the existing Gmail migration `20260722000000` is present in both local and remote
      migration history.
- [x] Choose and document the exact-file forward baseline for the broader migration ledger in
      `SUPABASE-MIGRATION-LEDGER-BASELINE.md`. Do not mass-repair legacy versions or use
      repository-wide `db push`; new migrations require exact transactional apply and verification.
- [x] Regenerate database types from production without `--allow-stale` using
      `BUILDOS_SUPABASE_CLI_VERSION=2.90.0`; replace the hand-authored Gmail column mirror with a
      generated compatibility/narrowing layer.
- [x] Add default-off Phase A and model flags to root/web env examples.
- [ ] Keep both Phase A flags disabled in deployment policy until their respective gates pass.
- [x] Lock the retention/deletion matrix, observability allowlist, and synthetic-fixture contract in
      the Phase A handoff.
- [ ] Encode those boundaries in schema constraints, queue serializers, and leak tests.
- [x] Add synthetic profile/message fixtures that contain no real mailbox content.

## Slice 1 — Profile compiler and preview

- [x] Lock the TypeScript field contract for versioned profiles and explicit rules.
- [x] Author `20260723000000_gmail_relevance_project_profiles.sql` with owner-scoped profiles,
      immutable sequential versions, encrypted exact-match rules, RLS, and service-role-only writes.
- [ ] Apply that exact migration to production and regenerate types only after final SQL review.
- [x] Implement deterministic compiler with field-level provenance, negative evidence, TTLs,
      bounded fields, stable hashes, and explainable diffs.
- [x] Add ownership, determinism, normalization, bounds, TTL, diff, source-deletion, and synthetic
      prompt-injection tests.
- [x] Add the DJ-only read-only profile preview at `/admin/gmail-relevance`, gated by both the
      Phase A flag and an exact user-ID allowlist.
- [x] Verify the compiler foundation has no Gmail/provider/model call.

## Slice 2 — Scan control plane

- [x] Lock the synthetic-only implementation contract, storage responsibilities, state machine,
      atomic reservation/settlement rules, access boundary, test matrix, and exit criteria in the
      Slice 2 handoff.
- [ ] Add immutable scan manifests and configuration hashes.
- [ ] Add per-account resumable checkpoints and idempotency constraints.
- [ ] Add Gmail quota/time counters and fail-closed budget reservation.
- [ ] Define partial/cancelled/quota-stopped/failed/expired behavior.
- [ ] Prove synthetic three-account pause/resume/cancel without duplicates.

## Slice 3 — Metadata-only A/B retrieval

- [ ] Implement bounded inbox+sent scan; exclude spam/trash/drafts.
- [ ] Implement A: rules/threads/actors/domains/artifacts/identifiers.
- [ ] Implement B: structured-profile lexical score plus negative evidence.
- [ ] Store evidence/hashes/provenance only; never body or attachment content.
- [ ] Add wrong-user/account, budget, retry, disconnect, and content-leak tests.

## Slice 4 — Review and evaluation

- [ ] Add candidate review with account, project, and evidence provenance.
- [ ] Add link/other-project/not-relevant/always-link/never-suggest decisions.
- [ ] Sample all positives plus stratified apparent negatives.
- [ ] Produce versioned quality, review-burden, Gmail-quota, latency, and cost reports.
- [ ] Collect at least 300 decisions, with at least 100 per account.

## Slice 5 — Optional C/D bakeoff

- [ ] Record the approved ZDR model/provider route and implement fail-closed enforcement.
- [ ] Add tool-free schema-constrained batched classifier C.
- [ ] Add offline embedding/stronger-model challenger D without a mailbox index.
- [ ] Run A/B/C/D on the same adjudicated set.
- [ ] Write the threshold/model/no-model recommendation; do not auto-enable the winner.

## Go/no-go gates for Phase B

- [ ] Candidate recall ≥95%.
- [ ] High-confidence precision ≥90%.
- [ ] Wrong-project rate <1%.
- [ ] Zero wrong-user/wrong-account reads.
- [ ] Zero raw content in logs, traces, analytics, queue metadata, or error reports.
- [ ] Initial scan cost ≤$0.25/account.
- [ ] Zero autonomous project mutations.

## Immediate next task

Complete final review and exact-file production verification for the profile/rule migration, then
implement Slice 2's TypeScript manifest/state/budget contracts and synthetic tests before its
database migration or executor. Do not combine the first Gmail scan, queue rollout, or any model
call with either migration.

## Current verification

- Phase A compiler/source/config suites: 14/14 passing.
- Existing focused Gmail suites: 90/90 passing (104/104 combined).
- `@buildos/shared-types` build: passing after fresh production type generation.
- Phase A profile/rule migration: clean transactional apply in a disposable PostgreSQL 16 database;
  positive insert/sync path and negative owner, version-sequence, immutability, and rule-scope paths
  verified. It has not been applied to production.
- Svelte autofixer for `/admin/gmail-relevance`: zero issues or suggestions.
- Full `@buildos/web` check: Phase A/Gmail diagnostics are clear; the worktree currently has two
  unrelated `ActivityEntry` narrowing errors in `agent-chat-sse-handler.ts` from a separate
  in-progress agent-chat change.
