# Libri frontend Supabase catalog shadow

Date: 2026-09-01 EDT
Status: database boundary live; frontend adapter committed on local `main`; credential and deployment intentionally pending

## Outcome

The first frontend cutover seam reads the migrated catalog from Supabase without placing the
BuildOS project-wide service-role key in the separate Libri Vercel application.

Libri commit `d23a5a0` adds an admin-only shadow endpoint at
`GET /api/internal/libri/catalog-shadow`. The existing Convex session remains only as a temporary
authentication gate. The endpoint performs no writes and does not replace a visible route yet.

The adapter maps Supabase books, people, author links, domains, and book-domain links into the
existing Convex homepage list shape. It preserves titles, slugs, authors, domains, ownership,
indexing state, completeness, ISBNs, and creation time. Cover URLs intentionally remain `null`
until private Storage signing is added; this prevents a premature visible cutover with broken
images.

## Shared-database boundary

Production migration `20260902025903_libri_frontend_catalog_read_boundary` is applied. The
separately provisioned `libri_frontend_reader` login:

- is capped at three database connections;
- has no superuser, database creation, role creation, inheritance, replication, bypass-RLS, or
  role-membership capability;
- defaults transactions to read-only with a 2-second lock timeout, 10-second statement timeout,
  and 10-second idle-in-transaction timeout;
- can select only the exact columns used by the adapter from `libri.books`, `libri.people`,
  `libri.book_people`, `libri.domains`, and `libri.book_domains`;
- cannot select `library_id`, write a catalog row, use a sequence, or read `public.queue_jobs`; and
- is restricted by forced RLS to library `f09948c4-e4e0-581c-8689-7258bea2f501`.

The role currently has no password, so the new database path is inert. No Libri Vercel secret was
created and no release was deployed from this slice.

## Performance posture

The Vercel adapter uses the Supabase connection pooler, one connection per warm server instance,
prepared statements disabled, a five-second idle timeout, and strict CA-backed TLS verification.
The five catalog queries use existing library-leading indexes and explicit fail-closed limits:

| Relation          | Maximum rows |
| ----------------- | -----------: |
| Books             |        1,000 |
| People            |        2,500 |
| Book-person links |       10,000 |
| Domains           |        1,000 |
| Book-domain links |       10,000 |

Current production cardinalities are 85, 97, 103, 26, and 211 respectively. This is intentionally
a bounded snapshot seam, not the final pagination/search API.

Adding the isolated login causes Supabase's performance advisor to enumerate existing permissive
`PUBLIC` policies against the new role on unrelated BuildOS tables, just as it does for
`libri_worker`. The reader has no grants on those tables, so those notices do not create access or
change BuildOS query plans. The new Libri policies do not produce a Libri warning-level security
finding.

## Verification

- Libri adapter unit tests: 3/3 passed.
- Libri Svelte/TypeScript check: zero errors and zero warnings.
- Libri Vercel production build: passed; the endpoint is server-only.
- Libri migration static firewall: 21 migrations accepted; 32/32 guard tests passed.
- Disposable PostgreSQL contracts: 38/38 passed, including exact column grants, five exact
  policies, hidden second-library rows, denied writes, denied BuildOS reads, and an unchanged
  BuildOS control row.
- Production postcheck: the migration receipt and five exact policies exist; `title` is readable,
  `library_id` is not, book writes are denied, and `public.queue_jobs` remains unreadable.
- The broader linked Supabase dry run remains blocked by two pre-existing remote-only BuildOS
  versions (`20260827133601` and `20260830200035`); this is existing repository drift and is not a
  Libri migration discrepancy.

## Next controlled steps

1. Land and pass CI for the BuildOS grant/RLS migration and Libri adapter commits.
2. Generate a random password for `libri_frontend_reader`, validate the session-pooler URL against
   the pinned Supabase root CA, and place only the scoped URL, CA, and library UUID in Vercel.
3. Deploy the shadow endpoint, sign in through the existing Libri admin session, and retain a live
   receipt proving exactly 85 books and 26 domains with representative field parity.
4. Add private cover signing and a server load for the homepage behind a default-off read-source
   flag. Keep the Convex query as rollback until the visible parity check passes.
5. Migrate book detail and search reads in small slices before moving any write path.

Do not create the reader password or deploy the endpoint until both repository commits and the CI
gate are green. Do not retire Convex during the shadow period.

## Original-app activity and current completeness (October 4)

The standalone Libri app now has a local-qualified replacement for owner activity
reads, search/book/chapter/domain activity logging, and live completeness. The original
screens and layouts stay in the Libri repository. Application activation remains off.

`20261004012951_libri_application_activity.sql` adds an append-only activity table with
forced RLS and owner-only reads. The session RPC pins `auth.uid()`, checks and locks
owner membership before any subject lookup, accepts only four explicit event types,
checks library/book/chapter scope, bounds text, and serializes duplicate calls. Clients
cannot directly append/update/delete events or supply an actor. The note trigger writes
one content-free creation event in the note transaction; a rollback removes both.
Imports without a user identity produce no new activity. Library and auth-user cascades
cover deletion without changing shared purge routines. Archived Convex events stay archived.

Security review of the rehearsal finding: `log_application_activity` is intentionally
callable by `authenticated`, because it is the original application's session write API.
The definer is necessary to keep raw event insertion unavailable to clients and to lock
membership for concurrent dedupe/revocation. It fixes its search path, rejects missing
identity and non-owner/foreign membership, validates subjects in that library, exposes
no arbitrary SQL or event type, and has no public/anonymous/worker/reader grant. The
note trigger has no client EXECUTE grant. PostgreSQL tests cover the negative boundaries,
revocation, note rollback/privacy, simultaneous dedupe, and actor/library deletion.

`20261004013540_libri_live_completeness_reads.sql` is a STABLE SECURITY INVOKER read with
caller RLS and 1–100 unique book IDs per call. It calculates the existing factor weights,
rounding, tiers and gaps from current canonical chapters, artifacts, sources, edges,
authors and visible notes. Archived OCR and rejected/superseded artifacts are excluded;
scans, uploaded files and transcript sources are not external-source points. Latest note
edits/count changes mark saved analysis stale. No old score is overwritten, and no
research queue or provider is invoked. The frontend requires a complete, validated score
response for each requested book, in bounded sequential batches. Catalog sorting and
book detail both use these current scores. Research-gap task lifecycle still needs its
own replacement; this read does not claim to migrate it.

Local PostgreSQL 16 contracts and the combined production-schema rehearsal pass. The
rehearsal has 36 intended Libri changes, no new client read failures, and both standing
shared-schema checks pass. Its one intentional session-definer finding is reviewed above.
The actual hosted PostgreSQL 15 CI gate and production application are still pending.
No hosted writes, provider calls, activation, or historical replay occurred here.


## Original book, chapter and prompt edits (October 4)

Migration `20261004015552_libri_manual_book_edits.sql` adds one session RPC for the
existing forms. The authenticated SECURITY DEFINER finding is intentional and reviewed:
atomic domain replacement, activity and versioned artifacts require a transaction, while
clients retain no raw artifact/activity write grants. The function fixes its search path,
checks `auth.uid()`, locks current owner membership before lookup, scopes every subject,
rejects unknown/bounded fields, and compares the exact saved timestamp under a row lock.
Anonymous, service, worker and reader execution are revoked. Existing shared permissions
and private-note policies are unchanged.

Book edits keep established URLs stable, normalize title/ISBN matching, and replace scoped
domain links atomically. Chapter edits retain order and research/evidence. Both add one
content-free activity event and mark saved book analysis/knowledge documents outdated
without deleting them. Prompt edits require both profile and current-artifact versions,
retain the prior artifact, increment versions, and hash the manually saved content.
No provider or queue calls occur. Automatic knowledge rebuilding and research-gap task
lifecycle still require the replacement worker before activation.

Local qualification: the disposable PostgreSQL contract covers actor/scope denial,
invalid fields, stale edits, rollback, normalized domains/ISBN/accented titles, retained
research and prompt provenance. Three real concurrent/rollback tests prove one winner
for edits by different owners and for simultaneous first-prompt creation. Rehearsal
against the fresh production schema passes both standing checks and adds no role-read
failures; the two intentional client-definer findings (activity and editing) are reviewed.
Exact-head PostgreSQL 15 CI, production application and hosted qualification remain pending.
Libri's original forms use `PRIVATE_LIBRI_CATALOG_EDITS_ENABLED`, still off by default.
