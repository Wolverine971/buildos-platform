# Libri post-migration BuildOS safety audit

Date: 2026-09-01 EDT
Production evidence refreshed: 2026-09-02T03:00Z
Decision: conditional pass; keep Convex read-only and do not retire it yet

## Scope

This is the first signed follow-up receipt for Tasker 73. It checks the migrated Libri catalog,
private image storage, shared BuildOS database boundary, dedicated Railway process, and the release
pipeline after the Libri data import and OCR worker deployment.

The audit is not a final cutover sign-off. The Libri frontend still contains active Convex-backed
routes, the 7-14 day observation window has not elapsed, and production has no eligible pending or
failed image for a genuine exact-batch canary. Convex retirement remains prohibited.

## Release receipt

- BuildOS `main`: `67e758421d05110ea1349bf191d2e089f2e07675`.
- Libri OCR admission hardening: `fc667108d` (ancestor of deployed worker revision).
- Railway runtime revision: `78b65a54a456ffe23b73913ec797ffdeee962cfe`.
- Railway deployments:
    - `agentic-chat-worker`: `c8b61467-6bbf-4f73-8ade-40c4d1b0e037`, four running instances;
    - `daily-brief-worker`: `f8df7342-df6a-4cd5-8730-4d8c5fa52c60`, one running instance;
    - `libri-worker`: `7291c49e-8bd7-49ad-b470-fde6de139559`, one running instance.
- GitHub CI run `33581615967`: Supabase RPC drift, complete repository verification, coverage,
  deep-research PostgreSQL integration, self-contained Supabase SQL contracts, and the dependent
  PostgreSQL 15 Libri migration-safety job all passed.
- Libri frontend local `main` commit `d23a5a0` adds the first bounded, server-only Supabase catalog
  shadow adapter. It is not deployed and has no production credential yet.

The deployed Railway services all report `SUCCESS`. The Libri process remains
`LIBRI_WORKER_ENABLED=false`, concurrency two, admission dispatch unset, activation mode disabled,
and has no canary target, Supabase service-role key, provider key, or asset-broker token. Its
restricted database connection is present and logs in as `libri_worker`.

## Migration ledger

Production contains all twenty-one reviewed Libri migrations:

`20260829183727`, `20260829192710`, `20260829201033`, `20260829202608`, `20260829203729`,
`20260829204949`, `20260829232231`, `20260830181834`, `20260830224500`, `20260831145458`,
`20260831220245`, `20260831223000`, `20260901012550`, `20260901014021`, `20260901020431`,
`20260901054000`, `20260901055654`, `20260901153414`, `20260901155435`, and
`20260901163552`, plus `20260902025903` for the frontend catalog read boundary.

The immutable migration firewall and disposable PostgreSQL contract gate passed after the final
deployment. No applied migration was rewritten.

## Signed source and reconciliation

The retained Convex database and storage export is outside the live application database at
`library-app/migration-archives/libri-convex-full-2026-08-29.zip` in the Libri repository. Its
current SHA-256 is byte-identical to the signed inventory receipt:

`394b791860b04978af9bd58a22bdc19b0fa8d0aca80ba22a5cc3bc9dc2783bbc`

The committed storage manifest remains
`b68fdbdcae44d671d96fe7c26d654b2e986c43d9f2bb98110b9749e25a292f8e`.

Current production counts match the signed import manifests for immutable migrated identities:

| Object                             |            Rows |
| ---------------------------------- | --------------: |
| Libraries / memberships            |           1 / 1 |
| People / books / domains           |    97 / 85 / 26 |
| Book-person / book-domain links    |       103 / 211 |
| Chapters / notes                   |      1,285 / 61 |
| Sources / documents / book links   | 997 / 585 / 588 |
| YouTube channels / videos          |           6 / 8 |
| Entity edges                       |             588 |
| Images                             |             408 |
| Agent profiles / derived artifacts |      87 / 2,363 |
| Migration ID mappings              |          10,245 |

The source-chunk count is 4,132: the signed 4,131 imported transcript/OCR chunks plus the one
database-fenced production OCR canary chunk recorded in Phase 3G. All 4,132 stored content hashes
recompute correctly.

Storage still contains exactly 408 private `libri-assets` objects and 162,112,668 bytes. Image
metadata contains the same count and byte total. The MIME distribution remains 339 JPEG, three PNG,
and 66 WebP objects. There are zero missing objects, byte-size mismatches, or MIME mismatches.

All 408 images are now OCR `complete`: the one failed imported image was advanced by the signed
Phase 3G canary. The only research run, research step, cost reservation, asset grant, and Libri
queue row are that completed canary lineage. There are zero active runs, steps, admissions, or
Libri queue jobs.

## Shared-database isolation

- All 27 Libri tables have RLS enabled and forced.
- `anon` has no `libri` schema usage and neither `anon` nor `PUBLIC` has a Libri table grant.
- The owner-role smoke sees one library, 85 books, 408 images, 4,132 source chunks, and 2,363
  derived artifacts.
- A non-member authenticated smoke sees zero rows for each of those objects.
- No non-Libri table has a foreign key whose target is in the `libri` schema.
- The only Libri `SECURITY DEFINER` routine is the hardened exact admission finalizer. `anon` and
  `authenticated` cannot execute it, and it does not retain default public execute authority.
- Current database state reports zero lock waiters, zero waiting active sessions, zero conflicts,
  and zero deadlocks, with eleven database connections at the sampled instant.
- Libri relations occupy approximately 32.4 MB. The four BuildOS canaries remain present:
  `public.queue_jobs`, `public.onto_projects`, `public.chat_sessions`, and
  `public.onto_embeddings`.
- The new `libri_frontend_reader` login is capped at three connections, defaults to read-only, has
  no memberships or BuildOS table grants, can read only five column-scoped Libri catalog tables,
  and is forced by RLS to the deterministic migrated library. It has no password, so the shadow
  path remains inert until the reviewed deployment step.

The last signed normalized non-Libri fingerprint was
`b4e3e2696dbad5a8147d97bb435d468b` across 15,568 signatures after the independently authorized
`onto_events` RLS migration. Current public object counts are 246 tables, 15 views, and 650
functions, reflecting later BuildOS migrations. The reusable fingerprint query was not retained in
either repository, so a byte-for-byte current comparison is still an open audit item; no evidence
attributes the later public objects to Libri.

## Supabase advisors

The current Supabase advisor snapshot contains no Libri warning-level security or performance
finding.

- Security: one Libri informational notice for the intentionally policy-free, service-private
  `libri.migration_id_map` table with forced RLS.
- Performance: informational unused-index notices only, expected while the migrated frontend and
  batch path remain inactive.

The relevant RLS informational notice is documented by the
[Supabase database linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Existing project-wide advisor warnings are BuildOS baseline debt and are not attributed to this
Libri release. The new isolated login also causes the performance advisor to enumerate existing
permissive `PUBLIC` policies against that role on unrelated tables; without table grants these are
non-executable role fan-out notices, not new BuildOS access paths.

## Canary decision

No exact-batch admission was fabricated. The planner correctly permits only pending or failed
images, while all 408 production images are complete. Mutating a completed image back to failed
would corrupt the evidence. The next live canary therefore requires one genuinely new, reviewed
image import.

When that image exists, the approved sequence is:

1. Plan and review one exact image batch through the authenticated BuildOS control plane.
2. Confirm and dispatch the exact admission with queue consumption still disabled.
3. Run the read-only exact-admission audit and preserve the queue receipt.
4. Separately provision short-lived broker/provider credentials, concurrency one, the exact step
   UUID, and an expiry no more than thirty minutes ahead.
5. Enable one Libri replica, prove one terminal result and an unchanged non-Libri control, then
   disable and sanitize the service immediately.

## Open gates and observation window

The rollback/observation window began with the data import on 2026-08-29 and is planned to end no
earlier than 2026-09-12. Final `pass` requires all of the following:

1. Deploy and verify the bounded catalog shadow, add private cover signing, then migrate the Libri
   frontend's active production routes off Convex and prove visible Supabase read parity.
2. Retain a current normalized non-Libri fingerprint command and compare it to the signed baseline
   with only reviewed BuildOS deltas.
3. Capture BuildOS p95 latency, connection use, lock waits, queue age, and error rate through the
   full observation window.
4. Import and review one genuine new image, then complete the exact dispatch/audit/OCR canary above.
5. Keep Convex read-only until the observation window closes without an unresolved discrepancy.

Until those gates pass, the audit decision remains **conditional pass** and Convex retirement is
blocked.
