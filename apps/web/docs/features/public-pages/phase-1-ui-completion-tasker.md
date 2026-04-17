---
title: Public Pages Phase 1 Completion Tasker
status: P0 complete (browser smoke + brief cleanup pending)
created: 2026-04-17
updated: 2026-04-17
owner: DJ
source_brief: ./phase-1-ui-brief.md
path: apps/web/docs/features/public-pages/phase-1-ui-completion-tasker.md
---

> **2026-04-17 completion pass.** All seven P0 tasks below have shipped:
>
> 1. Canonical two-part route now loads `currentUser` so authenticated viewers see the comment composer.
> 2. Unlisted semantics split into `is_live_public` (live + direct-link readable, includes unlisted) vs `is_listed_public` (live + visible in author index/eligible for public comments). `getPublicPageBySlug()` no longer filters by `visibility='public'`; unlisted pages resolve via direct link and stay out of `/p/{username}` + public comments.
> 3. Doc-tree nodes now cache `public_url_path`. `DocTreeNode` and `DocTreeView` emit the canonical `/p/{username}/{slug}` when present and fall back to the legacy combined form only for legacy rows.
> 4. Migration header comment in `20260430000000_add_public_page_views.sql` now accurately describes the stable-salt + 24h-viewed_at-dedup pattern. The nightly rollup runs from `apps/worker/src/scheduler.ts:170-173`.
> 5. `pnpm gen:types` + `pnpm gen:schema` regenerated. `view_count_*`, `users.username`, `onto_public_page_views`, and the two new RPCs are in `database.types.ts`.
> 6. New `comment-public-access.test.ts` covers live/unlisted/unpublished/deleted/non-document cases. Legacy and canonical route tests updated to pass `locals` and assert `currentUser`.
> 7. Focused test run: **32/32 passing** (`public-page.service.test.ts`, `page.server.test.ts`, `confirm/server.test.ts`, `comment-public-access.test.ts`).
>
> Bonus: `apps/web/src/routes/admin/ontology/public-pages/+page.server.ts` TS error (unreachable `?? null`) fixed. Total `svelte-check` errors across `apps/web` dropped 171 → 148.
>
> **Still open:** browser smoke checklist + screenshots capture (P0-7 in the original acceptance list) and the brief-cleanup pass described below.

# Public Pages Phase 1 Completion Tasker

## Context

Start with the locked implementation brief:

- [Public Pages Phase 1 UI Brief](./phase-1-ui-brief.md)
- [BuildOS strategy tasks T12/T13/T30](../../../../buildos-strat-tasks.md)
- [Public page service](../../../src/lib/server/public-page.service.ts)
- [Canonical public route](<../../../src/routes/(public)/p/[slugPrefix]/[slugBase]/+page.server.ts>)
- [Legacy public route](<../../../src/routes/(public)/p/[slug]/+page.server.ts>)
- [Owner Bar component](../../../src/lib/components/public-page/OwnerBar.svelte)
- [Author Index component](../../../src/lib/components/public-page/AuthorIndex.svelte)
- [Public page comments component](../../../src/lib/components/public-page/PublicPageComments.svelte)
- [Comment public-access gate](../../../src/lib/server/comment-public-access.ts)
- [Worker scheduler — 30d rollup](../../../../worker/src/scheduler.ts)

The brief marks Public Pages Phase 1 as implemented in one pass, but a verification pass on 2026-04-17 found that the feature is not merge-ready. Most of the surface exists: copy links, footer attribution, unpublish endpoint, view logging, Published panel, Owner Bar, comments, author index, username API/profile/onboarding, migrations, and the nightly 30-day view-count rollup (running from the worker scheduler). The remaining work is mainly correctness, canonical URL cleanup, generated DB types, tests, comment hygiene, and browser QA.

Do not treat this as a rebuild. Treat it as a completion pass over a mostly implemented feature.

## Current Verification Results

Commands already run:

```bash
pnpm --filter @buildos/web test -- public-page.service.test.ts page.server.test.ts confirm/server.test.ts
```

Result: 20 tests passed, 1 failed. Failure is in `src/routes/(public)/p/[slug]/page.server.test.ts` because the test does not provide `locals.safeGetSession()` after the route started reading session state.

```bash
pnpm --filter @buildos/web check
```

Result: failed with 171 errors and 221 warnings across the app. Most are unrelated existing type/Svelte issues, but one public-pages-related TypeScript error is in `apps/web/src/routes/admin/ontology/public-pages/+page.server.ts`.

Additional checks:

- `packages/shared-types/src/database.types.ts` does not contain `view_count_all`, `view_count_30d`, `view_count_30d_updated_at`, `onto_public_page_views`, or `users.username`.
- `packages/shared-types/src/database.schema.ts` only has a generated timestamp diff for these fields, not the new schema fields.
- `apps/web/docs/features/public-pages/screenshots/` does not exist.
- The 30-day view-count rollup IS wired up: `refresh_onto_public_page_30d_counts()` is called from `apps/worker/src/scheduler.ts` (`refreshPublicPage30dViewCounts`, scheduled `17 3 * * *`). The earlier draft of this tasker incorrectly assumed no caller existed.
- The migration comment in `supabase/migrations/20260430000000_add_public_page_views.sql` claims a "daily-rotating salt", but `apps/web/src/routes/api/public/pages/[slug]/view/+server.ts` uses a stable salt `'public-page-view-dedup-v1'` and a 24h dedup window. Comment must match code.
- Two unrelated `20260430*` migrations also landed in this window (`20260430000002_onto_task_update_atomic.sql`, `20260430000003_remove_brain_dump_chat_context.sql`, `20260430000004_remove_brain_dump_search_results.sql`). Not part of this tasker, but `pnpm gen:types` will pick them up alongside the public-pages fields.

## Goal

Make Public Pages Phase 1 genuinely merge-ready:

- Canonical `/p/{username}/{slug}` route works for anonymous and authenticated viewers.
- Public/unlisted visibility semantics are internally coherent.
- Copy/open surfaces emit canonical URLs.
- View counts have a real 30-day rollup path or the feature is clearly scoped without one.
- Generated DB types include the two new migrations.
- Focused tests pass, privacy-sensitive comment access has test coverage, and browser smoke paths are verified.
- The original brief is updated so it no longer contradicts the implemented state.

## P0 Tasks

### 1. Fix `currentUser` on canonical two-part public pages

Problem:

- `apps/web/src/routes/(public)/p/[slug]/+page.server.ts` loads `currentUser`.
- `apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/+page.server.ts` returns only `{ page }`.
- The two-part route reuses the one-part Svelte component, which reads `data.currentUser`. As a result, signed-in viewers on canonical `/p/{username}/{slug}` pages see the anonymous comment CTA instead of the comment composer/delete controls.

Files:

- `apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/+page.server.ts`
- `apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/page.server.test.ts`
- `apps/web/src/routes/(public)/p/[slug]/page.server.test.ts`

Implementation notes:

- Mirror the `locals.safeGetSession()` handling from the legacy route.
- Return `{ page, currentUser }`.
- Update the nested route test to pass `locals` and assert `currentUser`.
- Update the legacy route test to pass `locals.safeGetSession()` so it no longer throws before redirect assertion.

Acceptance:

- Authenticated user on `/p/{username}/{slug}` sees the comment composer.
- Anonymous user on `/p/{username}/{slug}` sees the sign-in CTA.
- Focused public page route tests pass.

### 2. Resolve unlisted public page semantics

Problem:

- `confirm` and `prepare` accept `visibility: 'unlisted'`.
- DocumentModal exposes `Unlisted`.
- `getPublicPageBySlug()` filters `.eq('visibility', 'public')`, so unlisted pages likely 404 even with a direct link.
- `toPublicPageState()` sets `is_live_public` only when `visibility === 'public'`, so unlisted pages do not get normal live controls or live sync.

Files:

- `apps/web/src/lib/server/public-page.service.ts`
- `apps/web/src/lib/server/comment-public-access.ts`
- `apps/web/src/routes/api/public/authors/[slugPrefix]/pages/+server.ts`
- `apps/web/src/lib/components/ontology/DocumentModal.svelte`
- `apps/web/src/routes/api/onto/documents/[id]/public-page/confirm/server.test.ts`
- `apps/web/src/lib/server/public-page.service.test.ts`

Recommended product semantics:

- A page is "live/shareable" when `status='published'`, `public_status='live'`, and `deleted_at IS NULL`, regardless of `visibility`.
- `visibility='public'` means listed in author index and eligible for public comments.
- `visibility='unlisted'` means direct-link readable, not shown in `/p/{username}`, not eligible for anonymous/public comment reads unless product explicitly decides otherwise.

Implementation notes:

- Either rename/extend `is_live_public` so it does not conflate live status with listing visibility, or add a second field such as `is_listed_public`.
- Keep author index filtering to `visibility='public'`.
- Keep `canAccessPublicComments()` conservative unless the product decision changes.
- Add tests for public and unlisted pages through service state and public lookup.

Acceptance:

- Unlisted page direct URL renders.
- Unlisted page does not appear in `/p/{username}` author index.
- Unlisted page can still be unpublished/republished and live-synced by the author.
- Public comment access behavior is explicit and tested.

### 3. Emit canonical URLs from doc tree surfaces

Problem:

- Doc tree metadata only has `public_slug`.
- `DocTreeNode.svelte` and `DocTreeView.svelte` build links with `{ slug: node.public_slug }`, producing `/p/{prefix-base}` instead of canonical `/p/{prefix}/{base}`.
- Opening the link redirects, but copied links are non-canonical.

Files:

- `apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.svelte`
- `apps/web/src/lib/components/ontology/doc-tree/DocTreeView.svelte`
- `apps/web/src/lib/types/onto-api.ts`
- `apps/web/src/lib/services/ontology/doc-structure.service.ts`
- `apps/web/src/lib/server/public-page.service.ts`

Implementation options:

- Preferred robust fix: extend doc tree public metadata with canonical URL parts or `public_url_path`, then write those from `syncDocTreePublicMetadata()`.
- Faster fix: on copy/open, fetch `/api/onto/documents/{id}/public-page` and build from `slug_prefix` + `slug_base`, falling back to `public_slug` if unavailable.

Acceptance:

- Copy from DocumentModal, doc-tree pill, doc-tree context menu, Published panel, and Owner Bar all produce `/p/{username}/{slug}` when prefix/base exist.
- Legacy `/p/{combined}` only appears for legacy rows without prefix/base.

### 4. Reconcile salt comment + verify 30-day view-count rollup

Problem (revised):

- The rollup IS wired up. `apps/worker/src/scheduler.ts` registers `refreshPublicPage30dViewCounts()` at `17 3 * * *` and calls `supabase.rpc('refresh_onto_public_page_30d_counts')`. The earlier "no caller" finding was wrong; the worker scheduler is the chosen path (no web cron route).
- Documentation drift remains: migration `20260430000000_add_public_page_views.sql` says the `viewer_hash` uses a "daily-rotating salt (salt rotation happens in application code)". The actual application code in `apps/web/src/routes/api/public/pages/[slug]/view/+server.ts` uses a stable salt `'public-page-view-dedup-v1'` and a 24-hour `viewed_at` dedup query, not a rotating salt. Either the code should match the design (rotate the salt daily) or the comment should match the code (stable salt + 24h dedup query).
- Worker scheduler logging happens to console only — no observable signal in the existing cron-job table. Not a blocker, but worth noting if Phase 2 adds rollup-health alerts.

Files:

- `supabase/migrations/20260430000000_add_public_page_views.sql` — migration header comment
- `apps/web/src/routes/api/public/pages/[slug]/view/+server.ts` — `hashViewer()` salt, dedup window
- `apps/worker/src/scheduler.ts` — existing rollup caller (verification only, no change expected)

Implementation notes:

- Decision needed: rotating salt vs stable salt. Recommendation: keep stable salt + 24h dedup window (current behavior). Cheaper, deterministic, and the dedup window already bounds privacy exposure. Update the migration comment to match.
- If the product wants true daily rotation, add the rotation in `hashViewer()` (e.g. include `new Date().toISOString().slice(0, 10)` in the input) and drop the 24h `viewed_at` filter in favor of relying on the changing salt.
- Verify in dev that `refreshPublicPage30dViewCounts()` runs on worker startup or after waiting through the cron cadence; confirm `view_count_30d` and `view_count_30d_updated_at` actually move on a row that has detail-table inserts.

Acceptance:

- Migration header comment in `20260430000000_add_public_page_views.sql` accurately describes the salt and dedup behavior actually implemented.
- Manual run of `refresh_onto_public_page_30d_counts()` against a page with logged views updates `view_count_30d` and stamps `view_count_30d_updated_at`.
- Worker scheduler still references and calls the RPC after any refactor.

### 5. Regenerate DB types after migrations

Problem:

- The two public-pages migrations exist:
    - `supabase/migrations/20260430000000_add_public_page_views.sql`
    - `supabase/migrations/20260430000001_add_users_username.sql`
- Generated types do not include their fields.
- Three additional unrelated migrations also landed in the same window (`20260430000002_onto_task_update_atomic.sql`, `20260430000003_remove_brain_dump_chat_context.sql`, `20260430000004_remove_brain_dump_search_results.sql`). `pnpm gen:types` will pick them up too. Coordinate with the brain-dump-deprecation work (`docs/plans/2026-04-17-brain-dump-deprecation-prework.md`) so the regenerated types land in one PR rather than fighting two branches over the same generated files.

Files:

- `packages/shared-types/src/database.types.ts`
- `packages/shared-types/src/database.schema.ts`

Steps:

1. Apply the migrations in the target Supabase environment.
2. Run:

```bash
pnpm gen:types
```

3. Confirm the generated files include (public-pages slice):
    - `onto_public_pages.view_count_all`
    - `onto_public_pages.view_count_30d`
    - `onto_public_pages.view_count_30d_updated_at`
    - `users.username`
    - `onto_public_page_views` (full table type)
    - `increment_onto_public_page_view_count` and `refresh_onto_public_page_30d_counts` in the `Functions` block

4. Spot-check that the brain-dump chat-context constraint shrink (`chat_sessions_context_type_check`, `chat_sessions_chat_type_check`) does not produce orphaned enum-like type literals that the public-pages code references.

Acceptance:

- Generated database type/schema files reflect the new migrations.
- No local-only timestamp churn is left without real schema changes.
- Admin TS error in `apps/web/src/routes/admin/ontology/public-pages/+page.server.ts` (flagged in `pnpm --filter @buildos/web check`) is gone or has a clear cause unrelated to missing types.

### 6. Backfill focused tests

Problem:

- Existing route test is failing.
- `canAccessPublicComments()` is a new privacy-sensitive gate with no focused test.
- Unlisted behavior is not covered.

Files:

- `apps/web/src/routes/(public)/p/[slug]/page.server.test.ts`
- `apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/page.server.test.ts`
- Add a new test near `apps/web/src/lib/server/comment-public-access.ts`, likely `comment-public-access.test.ts`.
- `apps/web/src/lib/server/public-page.service.test.ts`

Required test coverage:

- Legacy `/p/{combined}` redirects to `/p/{prefix}/{base}` and fixture includes `locals.safeGetSession()`.
- Canonical `/p/{prefix}/{base}` returns `currentUser` when authenticated.
- `canAccessPublicComments()` returns:
    - true for document with live public page.
    - false for unlisted page, unless the product decision explicitly changes.
    - false for unpublished page.
    - false for non-document entity.
    - false for deleted page.
- Public page service state distinguishes live/shareable from listed/public if task 2 adds that split.

Acceptance:

```bash
pnpm --filter @buildos/web test -- public-page.service.test.ts page.server.test.ts confirm/server.test.ts comment-public-access.test.ts
```

passes.

### 7. Browser smoke test Phase 1 happy paths

Use the checklist in the brief, then update this tasker with results.

Smoke paths:

- Publish a document from DocumentModal.
- Confirm live URL is `/p/{username}/{slug_base}`.
- Copy link from DocumentModal, doc-tree pill, doc-tree context menu, Published panel, and Owner Bar.
- Visit own page as author: Owner Bar appears and comments composer appears.
- Visit same page as anonymous: Owner Bar hidden and sign-in CTA appears.
- Unpublish from DocumentModal and Owner Bar.
- Republish at same URL.
- Comment as author.
- Comment as a different authenticated user.
- Anonymous comment write is blocked.
- Claim username during onboarding.
- Change username in profile and confirm new pages use new prefix while existing pages keep old prefix.
- `/p/{username}` renders author index.
- Unlisted direct link renders and remains absent from author index.

Capture screenshots under:

```text
apps/web/docs/features/public-pages/screenshots/
```

## P1 Follow-ups From The Brief

These are known follow-ups already listed in the original brief. Keep them unless product says otherwise:

- Comment notifications to the document author for every top-level public-page comment.
- Scroll DocumentModal to the publish section when opened with `?openPublish=true`.
- Project header `N public` chip.
- Empty-state nudge in the documents section.
- Comment report/flag endpoint and admin review surface.
- Mobile long-press context menu on doc-tree rows.
- Soft-hide or optional delete behavior for comments when unpublishing.
- Visibility clarity copy in the confirm modal.
- Loading skeleton polish for `PublishedPanel` and `PublicPageComments`.

## Brief Cleanup

The source brief has useful history but is internally inconsistent now that implementation work has happened.

Clean up or annotate:

- The "Dedicated `username` field — defer" section now conflicts with the implementation status saying username shipped.
- Older "Open questions for DJ" should be marked resolved, superseded, or still open.
- The implementation status table should be adjusted if any P0 item above remains unfixed.
- The screenshot section should be moved to the smoke-test checklist once screenshots exist.

## Suggested Order

1. Fix route `currentUser` and failing tests.
2. Decide/fix unlisted semantics.
3. Fix doc-tree canonical URL emission.
4. Reconcile salt comment + verify worker rollup.
5. Apply migrations and regenerate DB types (coordinate with brain-dump-deprecation branch to avoid generated-file conflicts).
6. Add privacy-sensitive tests.
7. Run focused tests, then broader checks.
8. Browser smoke test and capture screenshots.
9. Update the source brief with final truth.

## Definition Of Done

- Focused public-pages tests pass.
- Generated DB types include both new public-pages migrations (and any concurrent unrelated `20260430*` migrations land cleanly without conflict).
- Canonical URLs are emitted from every user-facing copy/open surface.
- Authenticated public-page comments work on canonical two-part URLs.
- Unlisted page behavior is explicit, implemented, and tested.
- 30-day view-count rollup runs from the worker scheduler, salt/dedup behavior in code matches the migration comment, and a manual RPC call moves real rows.
- Phase 1 browser smoke checklist is complete with screenshots.
- The source brief and strategy task status do not overstate shipped work.
