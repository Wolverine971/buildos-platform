<!-- apps/web/docs/technical/email/RECEIPT-PHASE-A-SLICE-4-REVIEW-IMPLEMENTATION.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-07-24; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Receipt — Gmail Relevance Phase A, Slice 4 Review Implementation

**Implementation date:** 2026-07-24  
**Depends on:** Slice 3 live pilot run `fa8c0e78-faf4-4f42-84eb-8cc7ede37a4d`  
**Production project:** `iwifjtlebphefldmwbkh` (`build_os`)  
**Outcome:** Review implementation and production schema verified; no production review was
activated and no Gmail call was made by this implementation work.

## Implemented boundary

- A separate default-off review flag and exact-user allowlist leave the Slice 3 scan controls off.
- A deterministic sample contains exactly 100 unique observation/project pairs per account for the
  completed three-account run.
- Sampling is variant-aware across `a_only`, `b_only`, `both`, and no-candidate controls, fills
  sparse strata deterministically, and stores inverse-probability weights.
- A/B presence, scores, confidence, and fixed evidence booleans stay hidden until an adjudication
  commits.
- One explicit open action re-fetches one request-lifetime metadata record. No cache or body path
  exists.
- Adjudications use fixed decision, correction-reason, corrected-project, and rule-proposal fields.
  There is no free-form text or mailbox content column.
- The adjudication RPC is exactly-once per sample with an idempotency hash and a canonical decision
  hash. Conflicting replays fail closed.
- Review tables are directly read-only to the service role. All preparation, adjudication, and
  expiry writes go through reviewed `SECURITY DEFINER` RPCs.
- Rule proposals remain inert review records. They do not create Gmail rules, project data, tasks,
  events, messages, labels, or drafts.

## Evaluation output

The dashboard computes weighted, content-free aggregates for:

- precision, recall, wrong-project rate, ambiguous rate, and estimated accepted candidates by
  variant;
- A/B overlap and unique contribution;
- candidate yield per 100 observations;
- provider-call, Gmail-unit, and runtime cost per accepted candidate;
- account and project coverage;
- account-level and project-level A/B quality, cost, and yield;
- correction and rule-proposal counts; and
- pending, reviewed, and expired sample counts.

Candidate totals are reconstructed exactly from the locked stratum populations and sample weights,
so aggregate evaluation remains available after transient candidate rows are purged.

## Retention reconciliation

The paired retention work makes expired observation/candidate rows immediately unreadable to
authenticated clients and adds a bounded hourly purge route. Deleting a source observation marks
any pending review sample expired without deleting immutable completed adjudications. Opaque source
and corrected-project references intentionally do not block source, project, or account deletion.

## Verification receipt

- focused Gmail relevance, admin-route, and retention-route suite: 145/145 passing across 28 files;
- Slice 4 focused service, metrics, route, content-boundary, and retention tests: passing;
- PostgreSQL 16 runtime test: 100 samples, four balanced synthetic strata, idempotent preparation,
  idempotent adjudication, and update immutability: passing;
- read-only production physical schema verifier: all 16 checks plus the aggregate installation
  check are `ok`;
- focused ESLint: passing with no warnings;
- Svelte autofixer: no issues or suggestions;
- `@buildos/web` check: 0 errors and 0 warnings;
- server-route and Supabase-select guardrails: passing;
- `@buildos/shared-types` build: passing;
- production web build: passing; and
- `git diff --check`: passing.

## Production state and next operation

Production initially contained an older zero-row Slice 4 draft without migration-ledger history.
The preflight confirmed zero review samples and zero adjudications. Rather than drop or replay those
tables, migration `20260724040000_gmail_relevance_review_reconciliation.sql` brought them forward
without data loss. Retention migration `20260724030000` and the reconciliation were applied as
exact transactional files; versions `20260724020000`, `20260724030000`, and `20260724040000` are
now aligned locally/remotely. Fresh production generation reports 245 tables and 14 views, and
`@buildos/shared-types` builds.

Vercel production now has a random sensitive `CRON_SECRET`, the exact variable Vercel uses to
attach bearer authorization to scheduled requests. Phase A scan/review variables remain absent.
The currently deployed review and retention routes both return 404, so this receipt does not
mistake the schema operation for a web deployment.

The reviewed file hashes recorded at reconciliation are:

| Version          | Purpose                                      | SHA-256                                                            |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `20260724020000` | canonical review/evaluation schema           | `59b120b348cffcc4a1dd8b929b3ab29df37f539b7d8070db4b9d5667351056ee` |
| `20260724030000` | immediate retention-policy enforcement       | `1e7da5ef4e788db3046cd4a39405a551b068c3c0921955bc7b1ddec2b413e229` |
| `20260724040000` | forward-only production-draft reconciliation | `0860535ff1e8b231fb9f4b5a7fe7e6e9ae1274f43c2f77f06db0ef2897c81d90` |

The post-reconciliation ledger read showed each of those exact versions on both the local and
remote sides. The final read-only production verifier returned `ok` for all 16 physical/security
checks and for `physical_installation_complete`. A fresh pinned-CLI `2.90.0` production type
snapshot was installed without a stale-types fallback; its SHA-256 is
`fb5aa7937b758ceb080695a7a4664c31eaafe8facd6ed66b5e7401f865d5054c`.

This receipt does not claim the web revision is deployed or that review is enabled. The next
bounded operation is:

1. deploy the web revision with both review variables absent/false while leaving scan and model
   flags off;
2. verify the review route is 404 and the authenticated retention route returns bounded,
   content-free counts only;
3. temporarily enable only `GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED` and the exact review-user
   allowlist;
4. prepare the 300-item sample once; and
5. complete the blinded human adjudications before the source metadata retention deadline.

Do not start another mailbox scan, enable a model, or create an autonomous project mutation path.
