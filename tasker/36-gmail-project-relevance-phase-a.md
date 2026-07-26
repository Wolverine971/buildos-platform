<!-- tasker/36-gmail-project-relevance-phase-a.md -->

# 36 — Gmail Project Relevance Phase A

**Created 2026-07-22.** Owner: Email relevance / product engineer.  
**Type:** bounded internal evaluation build.  
**Status:** A0, Slice 1, Slice 2, and the bounded Slice 3 live pilot are complete. The pilot processed
2,148 observations across three read-only Gmail connections and produced content-free A/B
candidates with no model, mailbox write, queue, watch, polling loop, or project mutation. The scan
gate was returned to default off. Slice 4 review/evaluation is implemented behind its own
default-off exact-user gate; its production schema, forward reconciliation, retention enforcement,
physical verifier, migration ledger, fresh production types, and shared-types build are complete.
The web deployment, 300 human decisions, aggregate decision, and retention receipt remain.

**Handoff:** `apps/web/docs/technical/email/HANDOFF-PHASE-A-PROJECT-RELEVANCE.md`  
**Slice 2 handoff:**
`apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-2-SCAN-CONTROL-PLANE.md`

**Slice 3 completion handoff:**
`apps/web/docs/technical/email/HANDOFF-PHASE-A-SLICE-3-PILOT-COMPLETION.md`

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
- [x] Keep both Phase A flags disabled in deployment policy through Slice 2. They were not changed
      during either production migration and remain fail-closed by default.
- [x] Lock the retention/deletion matrix, observability allowlist, and synthetic-fixture contract in
      the Phase A handoff.
- [x] Encode Slice 2 boundaries in schema constraints, the strict four-field job serializer, and
      durable-field/source import leak tests. Queue registration remains deferred to Slice 3 or
      later if it is actually needed.
- [x] Add synthetic profile/message fixtures that contain no real mailbox content.

## Slice 1 — Profile compiler and preview

- [x] Lock the TypeScript field contract for versioned profiles and explicit rules.
- [x] Author `20260723000000_gmail_relevance_project_profiles.sql` with owner-scoped profiles,
      immutable sequential versions, encrypted exact-match rules, RLS, and service-role-only writes.
- [x] Reconcile the already-live physical schema to exact ledger version `20260723000000`, verify
      the three tables, regenerate production types, and build shared types.
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
- [x] Add immutable scan manifests and configuration hashes.
- [x] Add per-account resumable checkpoints and idempotency constraints.
- [x] Add Gmail quota/time counters and fail-closed reservation/settlement accounting.
- [x] Define and database-enforce partial/cancelled/quota-stopped/failed/expired behavior.
- [x] Prove a synthetic three-account pause/resume lifecycle, cancellation, replay no-ops, lease
      recovery, retry exhaustion, quota stop, disconnect isolation, expiry, RLS, and leak safety.

## Slice 3 — Metadata-only A/B retrieval

- [x] Implement bounded inbox+sent scan; exclude spam/trash/drafts.
- [x] Implement A: rules/threads/actors/domains/artifacts/identifiers.
- [x] Implement B: structured-profile lexical score plus negative evidence.
- [x] Store evidence/hashes/provenance only; never body or attachment content.
- [x] Add wrong-user/account, budget, retry, disconnect, and content-leak tests.
- [x] Complete the synthetic three-connection lifecycle.
- [x] Apply the reviewed exact-file migration through the forward protocol, verify the physical
      schema read-only, align only its ledger version, and regenerate production types.
- [x] Wire the reviewed private invocation before recording the explicitly authorized exact-user
      pilot receipt with flags otherwise off.

## Slice 4 — Review and evaluation

- [x] Add candidate review with account, project, and evidence provenance locally.
- [x] Add correct/wrong/other-project/not-relevant/ambiguous and always/never proposal decisions.
- [x] Build a deterministic, variant-aware 100-item-per-account sample without A/B double-counting.
- [x] Produce versioned quality, review-burden, Gmail-quota, latency, and cost metrics locally.
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

Execute the remaining sequence in `HANDOFF-PHASE-A-SLICE-4-REVIEW-EVALUATION.md`: deploy the web
revision with review off, verify the route stays 404 and the retention job remains content-free,
then prepare and adjudicate the 300-item exact-user sample before source retention expires. Keep
scan and model flags off; do not rerun ingestion, read bodies/attachments, add a queue/watch/poll,
mutate Gmail, or mutate projects.

## Current verification

- Production ledger: `20260723000000` and `20260723211500` aligned locally/remotely.
- Production schema: four Slice 2 tables live with zero rows immediately after apply; fresh types
  contain all four tables and eight Slice 2 RPCs (241 tables and 14 views total).
- `@buildos/shared-types` build: passing after fresh post-apply production type generation.
- Phase A profile/rule schema: three tables live; exact ledger version reconciled after the physical
  schema was found pre-existing.
- Slice 2 migration: clean transactional apply plus full lifecycle/RLS verification in disposable
  PostgreSQL, followed by isolated exact-file production dry-run and apply.
- Svelte autofixer for `/admin/gmail-relevance`: zero issues or suggestions.
- Full `@buildos/web` check: zero errors and zero warnings after post-apply type generation.
- Focused Gmail plus Phase A suites: 65/65 passing across 13 files.
- Focused lint for the Slice 2 server/runtime files: passing.
- Slice 3 production schema: all 15 read-only physical/security checks pass; exact version
  `20260723223402` is aligned locally/remotely after repairing only that already-installed version.
- Read-only post-incident lookup: zero synthetic fixture rows remain in users, actors, projects,
  Gmail connections, profiles, or profile versions.
- Production public types regenerated without `--allow-stale`: 243 tables and 14 views; derived
  schema and `@buildos/shared-types` build pass.
- Slice 3 migration: clean transactional apply in disposable PostgreSQL; Slice 3 harness returns
  `gmail_relevance_metadata_retrieval_ok`, and the prior Slice 2 lifecycle harness still returns
  `gmail_relevance_scan_control_plane_ok` on the extended schema.
- Slice 3 focused Gmail plus Phase A suites: 83/83 passing across 19 files; focused lint passing.
- Full `@buildos/web` check: zero errors and zero warnings at the local Slice 3 checkpoint.
- Slice 3 live pilot: 2,148/2,148 observations processed across three scopes; 1,724 A candidates,
  731 B candidates, 2,170 provider calls, 43,070 Gmail units, and no retries or provider errors.
- Temporary Slice 3 production flags were removed and the private pilot route returned to 404.
- Slice 4 plus the full Gmail relevance/admin/retention-route suite: 145/145 passing across 28
  files.
- Slice 4 disposable PostgreSQL harness returns `gmail_relevance_review_evaluation_ok`; the
  read-only production physical verifier reports all 16 checks plus the aggregate installation
  check `ok`.
- Current `@buildos/web` check: zero errors and zero warnings; review Svelte autofixer has no
  findings.
- Production Slice 4 preflight found an older, unledgered draft with zero samples and zero
  adjudications. Forward migration `20260724040000` reconciled it without dropping data; retention
  `20260724030000` and reconciliation were exact-file applied, and exact versions `20260724020000`,
  `20260724030000`, and `20260724040000` now align locally/remotely.
- Fresh production types report 245 tables and 14 views; derived schema and
  `@buildos/shared-types` build pass.
- Production now has Vercel's reserved `CRON_SECRET`; Phase A scan/review variables remain absent.
  The current review and retention routes both return 404, and the pending production web build
  passes locally.
