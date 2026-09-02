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
