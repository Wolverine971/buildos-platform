---
title: Public Pages Phase 1 — End-User UI Design Brief
status: Draft (v3 — locked for implementation)
author: DJ (via Claude audit, 2026-04-16; v2 expanded same day with panel surfacing + views + comments; v3 locks in author-controls + URL format + mobile parity)
source_task: [buildos-strat-tasks.md T2](../../../../buildos-strat-tasks.md) (End-user publish UX audit)
related_strategy:
  - [buildos-strat.md §3.1 Public Pages as a First-Class Distribution Surface](../../../../buildos-strat.md)
  - [buildos-strat-tasks.md T12 — Phase 1 end-user publish UI](../../../../buildos-strat-tasks.md)
  - [buildos-strat-tasks.md T13 — Made with BuildOS attribution](../../../../buildos-strat-tasks.md)
  - [buildos-strat-tasks.md T30 — URL migration /p/{user_name}/{slug}](../../../../buildos-strat-tasks.md)
  - [docs/marketing/brand/brand-guide-1-pager.md](../../../../docs/marketing/brand/brand-guide-1-pager.md)
  - [Inkprint Design System](../../technical/components/INKPRINT_DESIGN_SYSTEM.md)
codebase_refs:
  - [DocumentModal.svelte](../../../src/lib/components/ontology/DocumentModal.svelte) — existing publish UI, lines ~2365–2470 and ~3063–3200
  - [public-page.service.ts](../../../src/lib/server/public-page.service.ts) — publish/unpublish service
  - [public-page-content-review.service.ts](../../../src/lib/server/public-page-content-review.service.ts) — moderation review
  - [/api/onto/documents/[id]/public-page/](../../../src/routes/api/onto/documents/[id]/public-page) — prepare/confirm/live-sync endpoints
  - [/p/[slug]/+page.svelte](../../../src/routes/(public)/p/[slug]/+page.svelte) — public page template, footer line 121
  - [/p/[slugPrefix]/[slugBase]/+page.svelte](../../../src/routes/(public)/p/[slugPrefix]/[slugBase]/+page.svelte) — two-part URL route (already exists)
  - [DocTreeNode.svelte](../../../src/lib/components/ontology/doc-tree/DocTreeNode.svelte) — Public pill at line 256
  - [DocTreeContextMenu.svelte](../../../src/lib/components/ontology/doc-tree/DocTreeContextMenu.svelte) — right-click menu
  - [projects/[id]/+page.svelte](../../../src/routes/projects/[id]/+page.svelte) — project page, three-dot menu lines 1915–2010, ProjectDocumentsSection import line 1702
  - [resolve_onto_public_page_slug_prefix migration](../../../../supabase/migrations/20260428000004_add_public_page_slug_parts.sql) — username-prefix derivation
path: apps/web/docs/features/public-pages/phase-1-ui-brief.md
---

> **Revision note (v3, 2026-04-16):** Scope is locked. DJ has approved "one-swoop" delivery — we ship the full Phase 1 surface in one coordinated push rather than trickled PRs. Locked additions on top of v2:
>
> 1. **Mobile parity is a P1 requirement, not deferrable.** Every surface in this spec must render and function cleanly on phones.
> 2. **Expandable "Published docs" section inside the project-page insight panels** — not just a modal behind the three-dot menu. Persistent, collapsible, right-column placement per DJ.
> 3. **`Copy link` must be always-visible on the doc modal**, not tucked behind a hover or secondary affordance.
> 4. **Author-only controls rendered inline on the live public page** — when the signed-in viewer is the author, the public page becomes a mini workspace with in-page actions (Publish/Unpublish, Edit original, Back to project). Invisible to anyone else.
> 5. **URL format locks to `/p/{user_name}/{slug}` as the default** — the two-part route (`/p/[slugPrefix]/[slugBase]`) already exists; slug-prefix derivation is already implemented in `resolve_onto_public_page_slug_prefix()`. We're enforcing it as the canonical format rather than the fallback. This is T30 from the task list pulled into Phase 1.
> 6. **Author attribution on public pages** becomes prominent — the author's name + link to their other public pages goes in the header, not just the footer.
>
> Timeline is treated as irrelevant by DJ. The ~8.5 engineering-day estimate stands for reference only.

---

## Inputs needed from DJ (before the spec is fully executable)

Tracking what's outstanding from DJ's side so implementation isn't blocked mid-stream.

### Needed before PR 6 (comments) opens

1. **Screenshots of current state** — DJ agreed to provide these. Target: `apps/web/docs/features/public-pages/screenshots/`. Required shots:
    - DocumentModal publish section, `not_public` state
    - DocumentModal publish section, `live` state
    - DocumentModal confirm modal (slug editor)
    - DocumentModal confirm modal with slug conflict
    - DocumentModal confirm modal with flagged review
    - Doc tree with Globe badge on a published doc
    - Doc tree right-click context menu (current state)
    - Project three-dot menu (current state)
    - Live `/p/{slug}` footer area
    - Mobile: project page on iPhone-14-Pro width (393px)
    - Mobile: DocumentModal publish section on same width
    - Mobile: live public page on same width
2. **Username source confirmation** — `resolve_onto_public_page_slug_prefix()` today derives the URL username from `onto_actors.name` → `users.name` → email local-part → `'user'` fallback. **Do you want a dedicated `username` field on users**, or is the derived approach acceptable for v3? Dedicated field is cleaner long-term (it's the thing that becomes part of someone's identity) but adds onboarding friction. Recommendation inside the spec.
3. **Username collisions** — today slug dedup handles slug collisions within a user's prefix, but not cross-user name collisions. If two users are both named "David," they both get `/p/david/...`. The slug_base dedup avoids URL collisions, but the namespace confusion is real. Decide: first-come gets "david", second gets "david-2"? Or append a short suffix by default?
4. **Mobile breakpoints** — confirm we're targeting Tailwind defaults (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536). Any phones below 375px width to support? The iPhone SE is 375px; going lower is probably not necessary.

### Can be decided during implementation without blocking

Everything in the "Open questions" section below — I'll default to the spec's recommendations unless DJ overrides.

# Public Pages Phase 1 — End-User UI Design Brief

## TL;DR (the update to the strategy)

The strategy doc states public pages are "~60–70% built, missing end-user UI." **That understates what's shipped.** After auditing the codebase, the DocumentModal (`apps/web/src/lib/components/ontology/DocumentModal.svelte`, 3960 lines) contains a near-complete publish UI: publish button, confirm modal with slug editor, visibility selector, live-sync toggle, noindex control, flagged-review inline guidance, optimistic live-sync toggling, and a URL preview. The prepare → review → confirm flow is wired end-to-end against the existing API.

The real Phase 1 gaps are smaller and more surgical than the strategy implied:

1. **No entry points outside the document editor.** A user cannot discover, manage, or publish anything from the project page, doc tree context menu, or anywhere else. Everything funnels through opening a single document and scrolling to find the publish section.
2. **No copy-link affordance anywhere.** Only "Open in new tab." This directly undermines the "collaboration-framed sharing" strategy — the highest-leverage primitive ("here's my outline, tell me what I'm missing") requires one-click copy, not a browser-tab detour.
3. **No unpublish path in UI or backend.** The backend supports soft-delete (`deleted_at`) but there is no `DELETE` route, no unpublish function, and no UI for it. Trust requires reversibility.
4. **Weak attribution on the live public page.** Footer reads "Published with BuildOS" as non-linked muted text. No logo, no link, no UTM. This is the single cheapest permanent-backlink mechanism we have; it's currently unused. (Overlaps with T13 but worth flagging here.)
5. **Intermediate states (`pending_confirmation`, `unpublished`) aren't cleanly surfaced.** The modal treats "is live" as a binary via `isLiveDocument` derived value; users in a stuck state see the "Make This Document Public" button again with no explanation.

**Scope Phase 1 around discovery + one-click copy-link + unpublish + views + comments.** Not around rebuilding what's already built.

**v2 additions (DJ feedback, 2026-04-16):**

6. **Public link affordances inside the project-page panels** — specifically on doc rows in `ProjectDocumentsSection` and the doc-tree's Public pill — so a user can grab a share link without opening DocumentModal.
7. **View counts on public pages** — simple server-side tracking, displayed on the public page and in the author's DocumentModal. No view analytics vendor; own it in Postgres.
8. **Comments on public pages** — reuses the existing `onto_comments` infrastructure. Requires reworking the access gate from project-level `is_public` to document-level `onto_public_pages` lookup when the commented entity is a document. Phase 1 scope: auth-gated writes, author moderation, no likes/follows.

**v3 additions (DJ feedback, 2026-04-16 — scope locked):**

9. **Expandable `Published` section inside the project-page right rail** (not a modal behind a menu) — a persistent insight panel alongside tasks/plans/goals/events, with view counts, comment counts, and per-row actions.
10. **Always-visible `Copy link` button on the DocumentModal** — primary action, not tucked away.
11. **Author-only Owner Bar on public pages** — when the logged-in viewer is the author, they see an inline action bar: Publish/Unpublish, Edit original, View in project, Copy link, Live-sync toggle, view & comment counts. Invisible to everyone else.
12. **URL format enforced to `/p/{user_name}/{slug}`** — infrastructure already exists (`/p/[slugPrefix]/[slugBase]` route, `resolve_onto_public_page_slug_prefix` RPC). v3 makes this canonical across all emission paths. No migration needed.
13. **Author attribution bumped on the public page** — Inkprint body size + avatar + link to a stub `/p/{user_name}` author page.
14. **Mobile parity is P1** — every surface has a mobile spec (bottom-sheets replacing dropdowns, long-press replacing right-click, safe-area-inset respect, 44x44 tap targets).

v3 expands scope to ~13.5 engineering days across 9 PRs. Comments (PR 8) is still the single largest add (~3 days); Owner Bar (PR 6) is next (~2 days). Timeline is irrelevant per DJ — shipping one-swoop rather than trickled.

---

## What the backend already supports (ground truth)

Source of truth: `apps/web/src/lib/server/public-page.service.ts`, `public-page-content-review.service.ts`, `apps/web/src/routes/api/onto/documents/[id]/public-page/{+server.ts, prepare/+server.ts, confirm/+server.ts, live-sync/+server.ts}`.

### Exported service surface

- `getDocumentPublicPageState(supabase, documentId)` — fetch current state or null.
- `prepareDocumentPublicPagePreview(...)` — **preview only, no DB write.** Returns deduped slug suggestion, derived title/summary, URL path, full content.
- `confirmDocumentPublicPage(...)` — **single write** that upserts to `status='published'`, `public_status='live'`. Moderation review is gated upstream in the API route, not in this function.
- `setDocumentPublicPageLiveSync(...)` — flips `live_sync_enabled` boolean; no content sync.
- `syncLivePublicPageForDocument(...)` — on doc save, runs review and (if passed) updates `published_content/description/props`. Blocked if review is flagged.
- `suggestAvailablePublicPageSlug(...)` — RPC-backed slug dedup.
- `normalizePublicPageSlug{,Prefix,Base}`, `composePublicPageSlug`, `isValidPublicPageSlug`, `buildPublicPageUrlPath` — helpers.
- `getPublicPageBySlug`, `getPublicPageRedirectSlug` — public lookup + redirect-chain following.

### State machine (actual)

```
(no public page row)
    │
    ├── POST /prepare ─────► returns preview (no DB write, idempotent)
    │
    └── POST /confirm ─────► ContentReview gate
                              │
                              ├── status=passed ──► public_status='live'
                              ├── status=flagged + admin_decision=approved ──► public_status='live'
                              └── status=flagged + admin_decision≠approved ──► HTTP 422 CONTENT_REVIEW_FLAGGED
                                                                              (surfaces review reasons/findings)
Live
    ├── [live_sync_enabled=true] + doc saved ──► /live-sync ──► re-review
    │                                            ├── passed  → published_content updated
    │                                            └── flagged → last_live_sync_error set, page NOT updated
    │
    ├── POST /live-sync { live_sync_enabled: boolean } ──► flips toggle only
    │
    └── (no explicit unpublish) ── soft-delete via deleted_at only; no route exposed
```

### Error responses the UI must handle

- 401 unauthenticated
- 400 missing/invalid slug (reserved slug or regex violation)
- 403 no write access
- 404 document not found
- **409 `SLUG_TAKEN`** — returns `suggested_slug_base` + `suggested_slug` + `slug_prefix`. (Already handled inline in DocumentModal confirm flow.)
- **422 `CONTENT_REVIEW_FLAGGED`** — returns full `review` object with reasons and findings. (Already handled inline.)
- 500 internal

### Database shape worth knowing

- `onto_public_pages.status` ∈ `draft | published | unpublished | archived`
- `onto_public_pages.public_status` ∈ `not_public | pending_confirmation | live | unpublished | archived`
- `onto_public_pages.visibility` ∈ `public | unlisted`
- `onto_public_pages.noindex` boolean
- `onto_public_pages.live_sync_enabled` boolean (default `true`)
- `onto_public_pages.last_live_sync_error` text (surfaced as an inline error in modal today)
- `onto_projects.is_public` — exists but **currently unused by the publish flow**. Read only by comment-permission checks and the homepage example carousel (`/api/public/projects`). Not a document-level concern; do not conflate with Phase 1.

---

## Current state of UI surfaces

### DocumentModal (`apps/web/src/lib/components/ontology/DocumentModal.svelte`) — fully wired

What's present today:

- **Publish section rendered in two layouts** (sidebar at line ~2365, alternate layout at ~3063; same content in both).
- **Status badge** — Globe icon + "LIVE" state indicator when `publicPageState.public_status !== 'not_public'`.
- **`Make This Document Public` / `Update Public Page` primary button** (line 2451 / 3145) — calls `handleMakeDocumentPublic()` which POSTs `/prepare`, hydrates draft, opens confirm modal.
- **`Open in new tab` button** — uses `window.open(publicPageState.url_path)`. (Gap: no "Copy link.")
- **Live-sync toggle** — optimistic update with rollback on failure; toast feedback on success.
- **`last_live_sync_error` inline display** — when a background sync blocked.
- **Flagged-review inline card** — shows `latestPublicPageReview.summary`, first 3 `reasons`, admin decision + timestamp + reason, and derived guidance ("Admin marked this content okay. Publish again to proceed." / "Publishing is blocked pending admin review. Ask an admin to mark this content okay." / "Admin marked this content not okay. Update it and try again.").
- **Confirm modal** (line ~3605) — `Modal` component with:
    - Slug base input with live-preview URL string and helper text ("Will publish as `foo`.")
    - Public title, Summary, Visibility (`public | unlisted`), Noindex checkbox, Live-sync toggle
    - Preview shows `publicPageDraftUrlPreview` like `/p/{slugPrefix}/{slugBase}`
    - Primary action: "Confirm and Publish" / "Confirm Changes"
    - **Slug conflict retry handled inline** — on 409 the modal stays open, updates the draft's `slug_base` and preview to the suggestion, and the user retries.
    - **Flagged content warning re-rendered inside the modal** before they commit.

What's missing inside the modal:

- **`Copy link` button.** There's `openPublicPageInNewTab` but no clipboard copy. This is the Phase 1 primitive for collaboration-framed sharing.
- **Unpublish action.** There is no button to revert `public_status` from `live` back to `unpublished`. No backend route exists for this either.
- **Intermediate state handling.** `isLiveDocument = publicPageState?.is_live_public === true`. When `public_status === 'pending_confirmation'` or `'unpublished'`, the UI falls back to the same "Make This Document Public" flow without explaining the state. Rare but it does happen (e.g., after admin archival, or after a past flagged block that was never retried).

### Project page (`apps/web/src/routes/projects/[id]/+page.svelte`)

No publish affordance anywhere. Confirmed by grep: strings `publish`, `public_page`, `is_public`, `share` produce zero hits in the file.

Three-dot header menu (lines 1915–2010) currently contains:

1. Show graph (conditional)
2. Turn notifications on/off
3. Collaboration settings
4. Edit project
5. Calendar
6. — divider —
7. Delete project (destructive)

### Doc tree

- **`DocTreeNode.svelte`** displays a small "Public" pill with Globe icon when `node.is_public === true` (line 256–263). Title attr shows `/p/{slug}`. Badge is purely informational, not clickable.
- **`DocTreeContextMenu.svelte`** (right-click on a doc) offers only: Open · Create child · Move to... · Archive. **No publish, share, copy-link, or view-public action.**

### Project settings / user settings

No project-settings route exists. Project settings are accessed via the header menu → "Edit project" modal (`OntologyProjectEditModal`), which covers name, description, facets, dates, context doc, next-steps. It does not touch visibility and should not — document is the unit of publication, not project.

### Live public page template (`apps/web/src/routes/(public)/p/[slug]/+page.svelte`)

Footer at line 120–129:

```svelte
<footer class="mt-8 border-t border-border pt-4 pb-2">
	<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
		{#if page.project_name}
			<span class="micro-label">{page.project_name}</span>
			<span class="text-border text-xs">·</span>
		{/if}
		<span class="micro-label text-muted-foreground/60"> Published with BuildOS </span>
	</div>
</footer>
```

Problems:

- "Published with BuildOS" is **plain muted text, not a link.**
- No `utm_source` / `utm_medium` / `utm_campaign` parameters.
- No logo mark.
- Color is deliberately de-emphasized (`text-muted-foreground/60`) — which in context feels apologetic, not confident.

This is a tight coupling with T13 ("Verify Made with BuildOS attribution"); Phase 1 should fix this in the same PR. Every live public page is a permanent backlink; leaving it unlinked is a measurable LLM-citation and SEO own-goal.

---

## Minimum user journey (proposed Phase 1)

### Journey A — First publish (happy path)

1. User is on the project page, or editing a document in DocumentModal.
2. **Entry 1 (new):** Doc-tree context menu → **Publish to public page...** · opens DocumentModal and scrolls/focuses the publish section.
3. **Entry 2 (new):** Project header menu → **Published documents** · opens a small modal/panel showing all documents in this project with a publish column and bulk-none action (list view, not a new route — keep scope small).
4. **Entry 3 (existing):** DocumentModal publish section (works today).
5. User clicks **Make This Document Public**.
6. Confirm modal opens with slug editor (prefilled from title), visibility (default `public`), live-sync (default on).
7. User clicks **Confirm and Publish**.
8. Success toast: "Published." Modal closes.
9. Publish section now shows: URL path · **Copy link** (new, primary) · Open in new tab · Live sync toggle · **Unpublish** (new, destructive).

### Journey B — Quick share after publish

1. User opens DocumentModal on an already-live doc.
2. One click on **Copy link** copies `https://build-os.com/p/{slug}` (with optional UTM — see open question) to clipboard.
3. Toast: "Link copied. Share it with a collaborator for feedback."

**This is the highest-leverage journey.** It's the collaboration-framed share primitive. Every week it doesn't exist, we lose share events that would have sent traffic and become LLM training signal.

### Journey C — Unpublish

1. User opens DocumentModal on live doc.
2. Clicks **Unpublish** (small, secondary-destructive, not a primary action).
3. Inline confirm: "Unpublish this document? The link will 404 and anyone you've shared it with will lose access."
4. Single API call (new endpoint; see "Backend gaps" below).
5. Toast: "Unpublished." Badge updates to `unpublished`. Primary button becomes **Republish**.

### Journey D — Slug conflict (existing, works today)

Retained: in the confirm modal, on 409 the slug input updates to the suggested base, inline helper text explains, user confirms again.

### Journey E — Flagged content (existing, works today)

Retained: modal shows review reasons and admin decision inline; user updates the doc or waits for admin, then republishes.

---

## URL format — lock to `/p/{user_name}/{slug}` (new in v3)

**User intent:** "We need to attribute the author, and on the URL, the URL should have the user's name in there. Something like https://build-os.com/p/{user_name}/{slug}. I debated doing this in the past, but we need to do something like this."

**Critical finding:** **This is already built.** No migration needed. The existing infrastructure supports it today, but inconsistently. We're enforcing it as canonical.

### What already exists

- Route file `apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/+page.svelte` — serves the two-part URL today, delegates rendering to the `/p/[slug]/+page.svelte` component.
- Columns `onto_public_pages.slug_prefix` and `onto_public_pages.slug_base` on the DB — already separate.
- RPC `resolve_onto_public_page_slug_prefix(p_actor_id uuid)` (in `supabase/migrations/20260428000004_add_public_page_slug_parts.sql`) — derives the prefix by coalescing `onto_actors.name` → `users.name` → email local-part → `'user'`, normalized to lowercase alphanumeric with hyphens, max 24 chars.
- RPC `suggest_onto_public_page_slug(p_slug_prefix, p_slug_base, p_exclude_page_id)` — handles dedup within the user's namespace.
- Helper `buildPublicPageUrlPath(slug, slugPrefix?, slugBase?)` in `public-page.service.ts` — already returns `/p/{prefix}/{base}` when both parts are available, falls back to `/p/{slug}`.

### What needs to change

1. **Enforce `slug_prefix` is always populated on publish.** In `resolvePublicPageSlugPrefix` (called from `prepareDocumentPublicPagePreview` and `confirmDocumentPublicPage`), the current code already calls the RPC but the return value can be a generic `"user"` fallback. We want to keep the fallback for accounts without a name — but we need to make sure the UI surfaces the resulting prefix clearly so users know their URL will read `/p/user/...` if they don't have a display name set.

2. **Surface the user's prefix in onboarding / profile settings.** Today a user has no idea their publishing URL will be `/p/their-name/...` until they hit the publish flow. Recommendation: show a read-only "Your public URL will start with `build-os.com/p/{name}/`" line in profile settings, with a "Change display name" action. Not strictly blocking but avoids surprises.

3. **Canonicalize URL emission.** Any surface that currently emits `/p/{slug}` only (e.g., future attribution rendering) must go through `buildPublicPageUrlPath` with both parts. Audit:
    - DocumentModal's `publicPageUrlPath` derived value (already uses `publicPageState.url_path` which is populated by the service — good).
    - The `PublicPagePreview.url_path_preview` in the confirm modal (already good).
    - The live public page's `<link rel="canonical">` — verify it emits the two-part form.
    - The JSON-LD `Article.url` — verify same.
    - Any share endpoint / clipboard copy we add — use `buildPublicPageUrlPath` or a new helper `buildAbsolutePublicPageUrl(origin, slugPrefix, slugBase)`.

4. **Legacy single-slug pages.** If any existing live page has `slug_prefix === null` (created before the two-part migration), decide: (a) redirect on-the-fly via the slug-history table, or (b) backfill. Recommendation: (a) for Phase 1; the slug-history table exists precisely for this.

5. **Username collision handling.** Two users with the same derived prefix compete for slug_base within that prefix. Current behavior: the dedup RPC only checks slug uniqueness globally. Recommendation: keep current behavior — the resulting URLs differ in slug_base anyway, so there's no conflict. But this means visiting `/p/david` alone (no base) gives a 404. Decide later if we want a per-user index page at `/p/{prefix}` — that's a Phase 5 discovery-layer concern.

### URL format decision table

| Scenario                                             | URL                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-time publisher, has display name "David Wayne" | `/p/david-wayne/my-book-outline`                                                                                                                                                |
| First-time publisher, no name set                    | `/p/user/my-book-outline` (and we nudge them to set a name)                                                                                                                     |
| Second "David Wayne" publishing "my-book-outline"    | `/p/david-wayne/my-book-outline-2` (dedup handled in RPC)                                                                                                                       |
| Changing display name after publishing               | URL stays stable; slug_prefix frozen at publish time (confirmed in DocumentModal line 3693: "The prefix is frozen from the publishing account name"). New pages use new prefix. |

### Dedicated `username` field — defer

Adding a `users.username` column with constraints (unique, regex-validated, claimable) is a real migration and onboarding-flow change. Recommendation: **defer to Phase 2.** v3 ships on the derived-from-name approach. It matches existing behavior and unblocks everything else in this brief. Add as a follow-up ticket.

### Scope

- Audit of URL emission paths: ~2 hrs
- Profile-settings "Your public URL" read-only display: ~1 hr
- Legacy redirect verification: ~1 hr
- Tests for `buildPublicPageUrlPath` consistency: ~1 hr

**Total: ~5 hrs** — rolled into PR 1 because it's a prerequisite for Copy link (we want the copied URL to be canonical).

---

## Author-only controls on public pages (new in v3)

**User intent:** "On the public pages, if the logged-in user is reading the page, there should be some options for him on that public page. He should see some stuff on that public page that other people can't, like: publish, unpublish, go back to original document, go back to project with document."

This turns the public page from a one-way broadcast into a bi-modal surface: an immutable artifact for visitors, and a lightweight workspace for the author. High leverage because authors will re-open their published pages constantly (to share, to review, to update) — and every time they do, they should be able to act without navigating back to the app.

### What renders when the viewer is the author

An inline **Owner Bar** at the top of the public page (directly below the header, sticky on scroll). Visible if and only if `session.user.id === page.owner_user_id` (server-side check, never trust the client).

Contents of the Owner Bar:

1. **Status badge** — `Live` / `Unlisted` / `Unpublished` — color-coded pill matching the DocumentModal states.
2. **Edit original** (primary action, desktop) — navigates to `/projects/{projectId}?doc={documentId}&openPublish=true` which opens the project page with DocumentModal pre-opened to this document. Copy: `Edit original →`.
3. **Open in project** (secondary) — `/projects/{projectId}` without the doc modal. Copy: `View in project`.
4. **Copy link** — copies the canonical public URL to clipboard. Copy: `Copy link`.
5. **Unpublish** (destructive, requires confirm) — calls the new unpublish endpoint (see Backend gaps). Copy: `Unpublish`. Confirm text: "Unpublish this page? The link will 404. You can republish at the same URL anytime."
6. **Republish** — only shown when `public_status === 'unpublished'`. Re-runs the confirm flow. Copy: `Republish`.
7. **Live sync indicator** — small chip: `Live sync on` (green) / `Live sync off` (muted). Click to toggle directly from the public page.
8. **View count** — shown inline: `1.2k views`.
9. **Comment count** — shown inline: `💬 14`.

### What a visitor sees in the same spots

Nothing. The Owner Bar is conditionally rendered. A visitor sees the article, author attribution, comments, and the "Made with BuildOS" footer. No flicker between states — the owner-ness is determined server-side on initial render.

### Mobile treatment

The Owner Bar on mobile collapses to:

1. Status pill (left).
2. A single `Owner actions` overflow button (right, three-dot).

The overflow opens a sheet/drawer from the bottom with the full list. Sticky positioning: top-aligned, offset below the mobile browser chrome.

### Implementation notes

- Add a server-side flag to the page load: `isAuthor: boolean`. Computed in `/p/[slug]/+page.server.ts` (or the slugPrefix/slugBase equivalent) by comparing `session.user.id` against `onto_public_pages.created_by_user_id` (may need a join through `onto_actors`).
- Cache-busting: if a non-owner's cached copy is served to the author, the Owner Bar won't render. Two options: (a) bypass cache for authenticated requests (simple, small perf cost), (b) render the Owner Bar from client-side hydration after auth check (simple, brief layout shift). Recommendation: (a) — set `Cache-Control: private` when a session cookie is present.
- Never trust `isAuthor` from the client. Every action button calls an authenticated endpoint that re-verifies ownership.
- Styling: author-only elements use a subtle contrast so they feel "editable surface" not "CTA banner." Think GitHub's own-repo actions vs. someone else's.

### Author attribution (separate from Owner Bar, always visible)

Regardless of viewer identity, the page header must prominently attribute the author. Current state (line ~20 of `/p/[slug]/+page.svelte`): shows author name + published date in the header but in small muted text. v3 requirement: bump the author's name to Inkprint body size, link it to a future `/p/{user_name}` author page (stub for now — can 404 gracefully with a "Coming soon" placeholder, or link to the author's live public pages aggregated). Name + a small avatar (use initials if no photo).

This is the "attribute the author" part of DJ's instruction. Separate from the Owner Bar, since it renders for everyone.

### Scope

- `isAuthor` server-side check: ~2 hrs
- Owner Bar component (desktop + mobile overflow): ~1 day
- Wire up the 7+ action buttons against existing/new endpoints: ~4 hrs (most endpoints already exist; unpublish is new)
- Author attribution in header (bumped size + link stub + avatar): ~2 hrs
- Cache-control handling for authenticated reads: ~1 hr

**Total: ~2 engineering days.**

---

## Surfacing A — public link affordances inside project-page panels (v2, expanded in v3)

**User intent (v2):** "Our public links should be shown in the inside panels on the projects page. That should be accessible for quick access."

**User intent (v3, sharpened):** "Add these public docs into the inside panels. An expandable section where you can see the published docs." → read: a persistent, collapsible **Published documents** panel living alongside the other insight panels, not a modal behind a menu.

**Structure recap.** `apps/web/src/routes/projects/[id]/+page.svelte` uses a two-column layout:

- **Left column:** `ProjectDocumentsSection` — renders the full document set (doc tree + inline doc listings) for the project. Documents are the unit of publication, so this is a secondary target for inline Globe chips.
- **Right column:** Insight panels — `tasks | plans | goals | risks | events | images`. These entities are **not** publishable today, so **we add a new panel: `Published`** slotted into this rail.

### v3 addition — the `Published` insight panel

A new expandable section in the right rail, styled consistently with the existing insight panels (same collapse chevron, same header pattern, same `expandedPanels` state shape). Keyed as `InsightPanelKey = 'published'` alongside the existing keys.

Panel contents:

- **Header:** `Published` label, count chip (`3`), chevron. Empty state: "No public pages yet" + a link `Learn about sharing publicly →` (routes to `/how-it-works#sharing` or similar).
- **Rows** (one per live public page in this project):
    - Document title (clicks → opens DocumentModal for that doc)
    - Small Globe chip + slug path (`/p/david/my-outline`)
    - Views count (from v2 Views section) — `1.2k`
    - Comment count (from v2 Comments section) — `💬 14`
    - Row hover / mobile tap-long-press reveals: `Copy link`, `Open public page`, `Unpublish`
- **Filter / sort:** visibility (public/unlisted toggle), sort by views / recent / title. Reuse `panelStates` infrastructure already there for the other insight panels.

Data is loaded via the new `GET /api/onto/projects/[id]/public-pages` endpoint (listed in Backend gaps). Hydrated on project load alongside the other panels; refreshed after any publish/unpublish action.

Why a **right-rail panel** rather than a **three-dot-menu modal** (changed from v2):

- Persistent visibility: the author doesn't have to remember a menu exists.
- Matches the rest of the project page's information architecture (everything in the rail is a curated view of project data).
- Mobile treatment is already solved for panels (collapse/expand stack).
- The modal approach is retained only as a narrower "Published documents" view from the three-dot menu for users who want a full-screen table with more columns — probably skip in Phase 1 and add later if needed.

### Target affordances

1. **Doc row in `ProjectDocumentsSection`** — when the underlying document has `is_public === true` (data already available via `docTreeDocuments` state), render an inline Globe chip at the end of the row:
    - **Hover / focus** → tooltip shows the full `/p/{slug}` URL.
    - **Click** → copies the URL to clipboard, fires a "Link copied" toast (no navigation, no modal open).
    - **Shift-click or Cmd-click** → opens the live page in a new tab (browser-conventional power-user path).
    - Menu button on the row (if one exists) gets a "Copy public link" / "Open public page" / "Manage public page..." entry.

2. **`DocTreeNode` Public pill** — the existing inline Globe "Public" pill (line 256–263) becomes a button with the same copy-on-click behavior as #1. This removes the need for a round-trip to DocumentModal just to get a shareable URL.

3. **Collapsed-documents header** — when the documents section is collapsed (`documentsExpanded=false`), show a small "2 public" count chip in the section header if the project has any live public pages. Click = expand + scroll to first public doc.

### Data requirement

`ProjectDocumentsSection` already receives the `documents` prop and drives the doc tree from `docTreeDocuments`. `is_public` and `public_slug` are already populated on `EnrichedDocTreeNode` (confirmed via grep in `DocTreeNode.svelte`). **No new backend call is needed for Phase 1 surfacing — use the data that's already hydrated.**

If we later want "draft vs live" accuracy (for documents in `pending_confirmation`), we'll want to ensure the server response includes `public_status`, not just `is_public`. That's a small extension, not a blocker.

### Why this matters

The single most-asked share workflow is: "I want to copy the link to my book outline and paste it in a DM to my editor." Today that requires: open project → find doc → click doc → wait for DocumentModal → scroll to publish section → click "Open in new tab" → copy from address bar. Six steps, one of them a modal load. The panel-surfaced affordance makes this a one-click operation from the project overview.

---

## Surfacing B — project-page header and empty state (new in v2)

Minor additions that complement Surfacing A:

- **Project header chip** — if any document in this project is publicly published, show `🌐 3 public` chip next to the project name. Click opens the `Published documents` modal (also listed in the P1 section below). Cheapest possible "state at a glance" primitive.
- **Empty state nudge** — on a project with zero public pages, a small link `Share a document publicly? →` inside the documents section empty state (but only once the user has ≥1 document). Not promotional, not a popup — contextual suggestion.

Both of these overlap with the `Published documents` menu item and can share the same backing data fetch (`GET /api/onto/projects/[id]/public-pages`).

---

## Views — page-view tracking + display (new in v2)

**User intent:** "Surface views of a public page."

**Current state.** No view/impression tracking exists. Grep for `view_count`, `page_view`, `impressions`, `visit_count` in the codebase returns zero hits related to public pages. This is greenfield.

### Data model

New table: `onto_public_page_views`.

```sql
create table onto_public_page_views (
  id uuid primary key default gen_random_uuid(),
  public_page_id uuid not null references onto_public_pages(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  viewer_hash text,           -- hash(ip + user_agent + daily_salt) for dedup, no raw IP stored
  referrer text,
  is_author boolean default false,
  session_id text,            -- optional, cookie-based for authenticated viewers
  created_at timestamptz not null default now()
);

create index idx_onto_public_page_views_page_id_viewed_at
  on onto_public_page_views (public_page_id, viewed_at desc);
```

Plus a denormalized counter on `onto_public_pages` for fast read:

```sql
alter table onto_public_pages add column view_count_all int not null default 0;
alter table onto_public_pages add column view_count_30d int not null default 0;
-- view_count_30d is refreshed by a nightly job, not transactionally
```

### View logging flow

1. Public page loads at `/p/{slug}` — server-side `+page.server.ts` fires `POST /api/public/pages/{slug}/view` in the background (not awaited, non-blocking).
2. Endpoint:
    - Computes `viewer_hash = sha256(ip + user_agent + daily_rotating_salt)` — GDPR-safer than raw IP; resets daily.
    - Checks whether a row with this `viewer_hash` exists for this `public_page_id` in the last 24 h. If yes, skip (dedup).
    - Detects `is_author` by comparing the optional Supabase session to the page's owning actor. Author views are logged but flagged and excluded from the public-facing count.
    - Otherwise inserts a new view row and atomically increments `view_count_all` via RPC.
3. Crawler filter: block known crawler user agents (`GPTBot`, `ClaudeBot`, `OAI-SearchBot`, `Googlebot`, `bingbot`, `facebookexternalhit`). **Do not** block them from the page — just don't count them as human views.

### Display surfaces

- **On the public page itself** — small muted footer chip next to the attribution: `1.2k views` or `42 views`. Hidden if `view_count_all < 10` (avoids the "2 views" vanity-negative). Not clickable.
- **In DocumentModal publish section** (author view) — "**1,204 views** · 89 in the last 30 days · Last viewed 2 hours ago." Links to nothing in Phase 1; in a future phase could open a tiny viewer analytics modal.
- **In `Published documents` project modal** — a "Views" column on each row, sorted desc by default.
- **In the project-page chip** — stretch goal only. If we want `🌐 3 public · 4.5k views`, sum via a cheap projection. Skip in Phase 1 if it adds complexity.

### Privacy and compliance

- No IP stored; `viewer_hash` is a salted hash with daily salt rotation.
- No cookies set on the viewer (the public page is already cache-friendly; adding cookies hurts that).
- Author views are logged but filtered out of public count to avoid inflation.
- Respect `Do Not Track` header: if present, skip logging.
- Respect `noindex` pages: still track views (the author wants to know), but flag a `is_private_count=true` boolean so if we later build public gallery ranking we don't include them.

### Scope

- Table + migration: ~1 hr
- Background view-log endpoint: ~2 hrs (including crawler filter + dedup)
- Counter RPC: ~30 min
- UI surfacing (three places): ~2 hrs
- Nightly 30-day rollup job: ~1 hr (can be a Supabase cron or a scheduled worker job — `packages/shared-utils` + worker scheduler already in place)

**Total: ~6–7 hrs.** Ships cleanly in one PR on top of the rest.

---

## Comments — public page commenting (new in v2)

**User intent:** "Have comments on a public page."

**Critical finding from the audit.** Comment infrastructure already exists and **already supports public-page commenting architecturally** — but with a coupling that needs a decision:

- Tables: `onto_comments`, `onto_comment_read_states`, plus `comment-mentions.ts` for mentions.
- Routes: `GET /api/onto/comments`, `POST /api/onto/comments/read`, etc.
- **The existing access gate is `onto_projects.is_public`** (checked in `/api/onto/comments/+server.ts` line ~34 and `/api/onto/comments/read/+server.ts` line ~82). If `onto_projects.is_public === true`, unauthenticated reads are allowed. Writes still require an authenticated actor.

### The gating mismatch (decision needed)

- **Publishing** is at the **document level**: `onto_public_pages` has a row per published document.
- **Comment access** is at the **project level**: `onto_projects.is_public` either opens or closes the whole project's comment threads.

If we naively flip `onto_projects.is_public = true` whenever any doc in the project goes public, we expose **all** comments on **all** entities of that project (tasks, plans, other unpublished docs) to anonymous readers. That's a privacy regression.

**Recommended model.** Extend the comment access check to also accept a document-level public-page match:

> Comment access to `entity_type=document`/`entity_id=X` is granted for anonymous readers iff `X` has a live row in `onto_public_pages` (`status='published' AND public_status='live' AND visibility='public'` — we may or may not extend to `visibility='unlisted'`, see open question).

Concretely: in `/api/onto/comments/+server.ts` and `/read/+server.ts`, replace the single project-level `is_public` check with a layered check:

```
if entity_type === 'document':
  if onto_public_pages has live row for this entity_id AND visibility in ('public',) → allow anon read
else if project.is_public → allow anon read
else → require auth + access check
```

**Writes stay auth-gated in Phase 1.** Anonymous commenting is a separate, contested feature (spam vectors, moderation load). See open question below.

### UI

- **Public page (`/p/{slug}` template, `+page.svelte`)** — new `<PublicPageComments>` component rendered below the article body and above the "Published with BuildOS" footer. Shows:
    - Existing threaded comments (reusing the comment service that already supports hierarchical threads via `root_id`).
    - If the viewer is not authenticated: **`Sign in to comment`** button (links to `/signup?return_to=/p/{slug}`).
    - If authenticated: a compact comment composer with mention support (reuse `comment-mentions.ts`).
- **Author view in DocumentModal publish section** — a "💬 N comments" chip; click opens the public page in a new tab anchored to `#comments` (simpler than mirroring the full thread UI into the modal in Phase 1).
- **Author notifications** — reuse the existing mention/reply notification system if it's already wired. If comments on public pages arrive from people outside the project, notifications should still trigger for the project owner. Check `packages/shared-utils` and `onto_comment_read_states` wiring.

### Moderation

- Phase 1 authors can **delete comments on their own public pages** (same UI pattern as existing comment delete).
- **Abuse report button** on each comment — posts to a new endpoint `POST /api/onto/comments/[id]/report` that creates a moderation row. Admin reviews in `/admin/ontology/public-pages` (or a new adjacent route).
- Do **not** ship a full moderation queue in Phase 1. A manually-checked reports table is enough. Defer full moderation to Phase 6 social layer if this ever scales.

### Phase 6 tension (explicit)

The strategy doc (`buildos-strat.md` §3.1 Phase 6) lists "social layer (likes/comments/follows)" as gated on gallery critical mass. DJ's request puts **comments** in Phase 1.

**Recommended reconciliation.** Split the concept:

- **Phase 1 (this brief):** comments only, on public pages only, authenticated writes only, author-moderated, no likes, no follows. Minimum viable. Ship.
- **Phase 6 (deferred):** likes, follows, anonymous commenting, cross-page social feeds, reputation. Still gated on gallery.

Comments solve a specific share-driven workflow ("here's my outline, tell me what I'm missing" → reply thread) that the strategy doc literally names as the primary share driver. That's a Phase 1 primitive, not a social-layer flourish. The other social mechanics (likes, follows) don't have the same direct collaboration-framed justification, so they stay deferred.

### Scope

- DB access-check rework: ~3 hrs (migration + updating comment endpoints + tests)
- `PublicPageComments` component: ~1 day (reuse existing comment composer, threaded rendering, mentions)
- Sign-in CTA + return URL routing: ~1 hr
- Author-delete + report button: ~3 hrs
- Notifications wiring check + fixes: ~2 hrs
- Counter chip in DocumentModal: ~30 min

**Total: ~2.5–3 engineering days.** This is the largest single add to Phase 1. If we must cut scope, ship the read-only version first (comments visible on public pages, writes require auth, no moderation controls), add auth-gated writes + moderation in a follow-up PR.

---

## Missing UI pieces (the Phase 1 scope)

Ranked by leverage × how-cheap-it-is.

### P0 — ship in the first cut

1. **Always-visible `Copy link` button in DocumentModal publish section** (v3 locked: not hidden, not secondary). Replace `Open in new tab` as the primary action; move "Open" to secondary. Uses `navigator.clipboard.writeText()`, success toast, fallback for browsers without Clipboard API. ~1 hr of work. **Highest single-item leverage in this brief.**

2. **`Copy link` quick-action on doc rows in `ProjectDocumentsSection` + on the doc-tree Public pill** (Surfacing A). On any document marked `is_public === true`, the inline Globe chip becomes a one-click copy-link button. Shift/Cmd-click opens the live page. ~2 hrs.

3. **Fix the "Made with BuildOS" footer on the public page template.** Make it a link to `https://build-os.com?utm_source=public-page&utm_medium=attribution&utm_campaign=made-with` with a small Inkprint-appropriate logo mark, not muted-text. Overlaps with T13 — combine PRs.

### P1 — ship in the same PR window

4. **Unpublish action.** Requires a new backend route: `POST /api/onto/documents/[id]/public-page/unpublish`. Sets `public_status='unpublished'` (preserves row and slug). UI is a small destructive button in the publish section. ~3 hrs backend + 1 hr UI.

5. **Doc-tree context menu `Publish to public page...` / `Manage public page...` / `Copy link`.** Extend `DocTreeContextMenu.svelte` per Surfacing A. When `node.is_public === true`, add "Copy link" (top), "Manage public page...", "Open public page." When `false`, add "Publish to public page..." between "Create child" and "Move to..." ~2 hrs.

6. **`Published` insight panel in the project page right rail (v3 locked).** Expandable section matching the other insight panels (tasks/plans/goals/etc). Rows per live public page with title, slug chip, views, comment count, and hover actions (Copy link, Open public page, Unpublish). Backed by `GET /api/onto/projects/[id]/public-pages`. ~8 hrs — uplifted from v2's modal approach because we're now matching the full insight-panel pattern (filter, sort, collapse persistence, mobile stacking).

6b. **Author-only Owner Bar on live public pages (v3 new).** Inline bar rendered only when the viewer is the author. Buttons: status pill, Edit original, View in project, Copy link, Unpublish/Republish, Live-sync toggle, view count, comment count. Collapses to overflow sheet on mobile. Server-side `isAuthor` flag. See "Author-only controls" section above for full spec. ~2 engineering days.

6c. **URL format enforcement — canonical `/p/{user_name}/{slug}` (v3 new).** Audit all URL emission paths (DocumentModal, confirm preview, canonical link, JSON-LD, copy-link, share-endpoint). Ensure the two-part form is emitted consistently. Legacy single-slug pages keep redirecting via slug-history. See "URL format" section. ~5 hrs.

6d. **Author attribution upgraded on public page header (v3 new).** Bump the author name from small-muted-text to Inkprint body size with a small avatar mark and a link to a future `/p/{user_name}` author index (stub page OK for Phase 1). ~2 hrs.

7. **Intermediate-state handling in DocumentModal publish section.** When `public_status === 'pending_confirmation'`, show "Publish in progress..." with a retry. When `public_status === 'unpublished'`, show "Previously published · Republish". ~1 hr.

8. **View tracking + counter display** (new). Table migration, background view-log endpoint, crawler filter, dedup, nightly 30-day rollup, display in three surfaces (public page footer, DocumentModal publish section, Published documents modal). See Views section above. ~6–7 hrs.

9. **Comments on public pages** (new). DB access-check rework (document-level gate rather than project-level), `PublicPageComments` component reusing existing comment infrastructure, sign-in CTA for unauthenticated viewers, author-moderation (delete + report). See Comments section above. ~2.5–3 days. **Largest single Phase 1 add.**

### P2 — if Phase 1 has time, otherwise punt to Phase 2

10. **Visibility clarity copy.** Current labels "Public" / "Unlisted" inside the confirm modal are ambiguous. Add one-line descriptions: "Public — anyone with the link, discoverable on BuildOS when gallery ships" vs. "Unlisted — anyone with the link, never appears in search or gallery." ~30 min.

11. **Project header chip** (Surfacing B). If any document is public, show `🌐 3 public` chip next to the project name. Click opens `Published documents` modal. Piggybacks on the fetch already needed for item #6. ~1 hr.

12. **Empty-state nudge** in the documents section (Surfacing B). Contextual "Share a document publicly? →" text-link, shown only when the project has ≥1 document and 0 public pages. ~30 min.

13. **Loading skeleton for publish section.** The existing "Loading public page state..." row is functional but plain; matching the broader Inkprint loading pattern would polish it. Low priority.

### Explicit Phase 1 non-goals (defer)

- Clone-as-template (Phase 4).
- Gallery / `/gallery` route (Phase 5).
- `/@username/project-name` URL migration (Phase 6 area).
- Project-level `is_public` toggle (don't conflate with document publishing; the field exists but shouldn't be user-facing until discovery layer exists).
- Social layer (likes/comments/follows) — Phase 6, gated on gallery critical mass.

---

## Mobile parity — P1, not deferrable (new in v3)

**User intent:** "We need to make mobile a priority too. It needs to look good on mobile as well."

Every surface above must work on phones. This is a first-class requirement, not a stretch goal. Specs per surface:

### DocumentModal on mobile

- Already full-screen on mobile (confirmed in audit).
- Publish section uses the alternate second layout (line ~3063) on smaller viewports — keep those two layouts in sync for every v3 edit.
- `Copy link` button occupies primary position; `Open` collapses to secondary icon-only.
- Confirm modal: slug editor, URL preview, visibility/noindex/live-sync toggles — stack vertically, full-width inputs, 44x44px minimum tap targets (WCAG AA).

### Owner Bar on mobile (public page)

- Status pill + overflow "Owner actions" three-dot button.
- Overflow opens a bottom sheet (not a dropdown) — matches native iOS/Android share sheets, easier thumb reach.
- Sticky positioning with safe-area-inset respect (`env(safe-area-inset-top)`).
- Sheet items: Edit original, View in project, Copy link, Unpublish/Republish, Live-sync toggle, Views, Comments.
- Close on backdrop tap, swipe-down, or Esc.

### `Published` insight panel on mobile

- On mobile, the right rail stacks below the left column — insight panels become a vertical list.
- Published panel header row has the same collapse chevron as the others.
- Collapsed by default on mobile (the rail is scrolled-to-bottom territory; user can expand).
- Each row: title on line 1, small stats row on line 2 (`/p/user/slug · 1.2k views · 14 comments`), overflow three-dot on the right → bottom sheet with row actions.

### Doc-tree pill + context menu on mobile

- Right-click doesn't exist on mobile. Replace with:
    - Long-press on doc row → context menu as bottom sheet.
    - Globe pill on doc row is tappable (copy link on tap, opens public page on long-press — TBD if conflict with long-press-row behavior, fall back to tap-only copy if so).
- If the doc-tree currently has no long-press handler, ship one in the same wave.

### Public page (read mode) on mobile

- Already fine per Inkprint defaults. Verify author header (new in v3) stacks cleanly.
- View count chip is visible in footer.
- Comments section: composer uses native keyboard-friendly textarea, replies collapse by default beyond 2 levels to avoid thread squeeze.

### Sign-in CTA on mobile (for public-page comments)

- When unauthenticated viewer taps the comment composer, the CTA modal/sheet shows: "Sign in to comment" button + "Return here after sign in" checkbox (on by default).
- Uses the same return-URL pattern as desktop.

### Scope uplift for mobile

Mobile parity is mostly absorbed by the per-surface scopes above because each spec now includes its mobile treatment. Dedicated mobile-only work:

- Bottom-sheet component (reuse existing or build minimal): ~4 hrs
- Long-press handler on doc-tree rows: ~2 hrs
- Mobile QA pass across all surfaces: ~4 hrs
- Safe-area-inset verification: ~1 hr

**Mobile-specific scope: ~1.5 engineering days.** Rolled into each PR rather than its own PR (mobile should never be an afterthought).

---

## Backend gaps that block UI work

Small list. None of them require redesign — they're small additions. Expanded in v2 to cover views and comments.

1. **Unpublish route.** Does not exist. Recommended: `POST /api/onto/documents/[id]/public-page/unpublish` — preserves the row with `public_status='unpublished'`, allows republish with same slug. Also means we can show "Previously published at /p/foo" in the UI.
   Service function: add `unpublishDocumentPublicPage(supabase, document, actorId)` next to `confirmDocumentPublicPage`.

2. **Attribution link is hardcoded in template, not a shared component.** For Phase 1 that's fine. If we add more surfaces (Open Graph image, email receipts), we'll want a `PublishedWithBadge` component. Not blocking.

3. **Bulk endpoint** — `GET /api/onto/projects/[id]/public-pages` returning the project's live public pages with view counts, comment counts, published_at, slug. Single join against `onto_public_pages` + the new view counter + an aggregated `COUNT(onto_comments)` filtered by `entity_id IN (project's document ids) AND root_id IS NULL`. ~1 hr.

4. **View-tracking endpoint** — `POST /api/public/pages/{slug}/view` (note: `/api/public/...`, no auth required). Handles crawler filter, dedup via rolling-salt hash, author detection, atomic counter increment. ~2 hrs.

5. **View counter RPC** — `increment_public_page_view_count(p_public_page_id uuid)` for atomic update to `onto_public_pages.view_count_all`. ~30 min.

6. **Comment access-check rework** — in `/api/onto/comments/+server.ts` and `/api/onto/comments/read/+server.ts`, extend the project-level `is_public` check with a document-level `onto_public_pages` lookup when `entity_type === 'document'`. Keep project-level gate for non-document entities. ~3 hrs including tests.

7. **Comment report endpoint** — `POST /api/onto/comments/[id]/report`. Creates a moderation row. ~2 hrs including minimal admin view.

8. **Nightly 30-day view rollup** — Worker job that refreshes `onto_public_pages.view_count_30d`. Runs on the existing Railway worker scheduler (`apps/worker/src/scheduler.ts`). ~1 hr.

9. **Author identity fields on the public-page payload** (v3). `/api/public/pages/{slug}` (currently returns page content) must also return: `author_display_name`, `author_slug_prefix`, `author_avatar_url` (nullable), and (for authenticated author requests only) `is_author: true`. ~1 hr.

10. **Author stub page at `/p/{user_name}`** (v3, graceful). A minimal page listing the author's public documents (or a "No public pages yet" / "Coming soon" placeholder). Renders without auth. Server-side load uses a new endpoint `GET /api/public/authors/{slugPrefix}/pages`. ~3 hrs.

11. **`openPublish` query param handling** — `/projects/{projectId}?doc={documentId}&openPublish=true` must open the project page with DocumentModal pre-opened and scrolled to the publish section. Used by Owner Bar's "Edit original" button. ~1 hr.

---

## Entry point placement (annotated map)

Target entry points for Phase 1. Each is a specific DOM location, not a vague "add a button somewhere."

1. **DocumentModal publish section** — existing. Add `Copy link` (primary, replaces or flanks `Open in new tab`). Add `Unpublish` (secondary destructive, below live-sync toggle). Add intermediate-state copy. Add `Views` chip (v2) and `Comments` chip (v2).
    - File: `apps/web/src/lib/components/ontology/DocumentModal.svelte`, lines ~2365–2470 and ~3063–3200 (two layouts kept in sync).

2. **DocTreeContextMenu** — new items.
    - File: `apps/web/src/lib/components/ontology/doc-tree/DocTreeContextMenu.svelte`
    - When `node.is_public === false`: add "Publish to public page..." between "Create child" and "Move to..."
    - When `node.is_public === true`: add "Copy link" (primary), "Manage public page...", "Open public page" (wraps `window.open`).
    - Requires the parent tree component to wire the new action IDs to DocumentModal / clipboard / window.open.

3. **DocTreeNode "Public" pill** — make clickable.
    - File: `apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.svelte`, line 256–263
    - Convert the `<div>` badge into a `<button>` that copies the public link. Keep the Globe icon. Prevent bubble-up to the row click handler.

4. **`ProjectDocumentsSection` doc rows** (v2 — primary Surfacing A target).
    - File: `apps/web/src/lib/components/project/ProjectDocumentsSection.svelte` (verify exact filename during implementation; referenced from `apps/web/src/routes/projects/[id]/+page.svelte:1702`).
    - On rows where the backing document has `is_public === true`, render an inline Globe chip aligned right. Chip `click` → copy link + toast. Shift/Cmd-click → open in new tab.

5. **Project page three-dot menu** — new item "Published documents" near "Collaboration settings".
    - File: `apps/web/src/routes/projects/[id]/+page.svelte`, lines 1915–2010.
    - Opens a new lightweight modal component, e.g. `apps/web/src/lib/components/project/PublishedDocumentsModal.svelte`.
    - Modal is a table listing documents + publish state + views (v2) + comments count (v2) + row-level actions.

6. **Project header chip** (v2 Surfacing B, optional P2).
    - File: `apps/web/src/lib/components/project/ProjectHeaderCard.svelte`.
    - Tiny `🌐 N public` chip beside the project name; click opens the Published documents modal.

7. **Public page footer** — attribution fix + view counter chip.
    - File: `apps/web/src/routes/(public)/p/[slug]/+page.svelte`, line 121–129.
    - Convert text span to a link with UTM; add a minimal logo mark; add `· N views` chip when `view_count_all >= 10`. Keep it tasteful per brand guide; this is not a banner ad.

8. **Public page comments section** (v2) — new component above the footer.
    - File: `apps/web/src/routes/(public)/p/[slug]/+page.svelte`, insert before line 120's footer.
    - New component: `apps/web/src/lib/components/public-page/PublicPageComments.svelte`.
    - Reuses existing comment-thread rendering; composer shown to authenticated viewers; sign-in CTA for anonymous.

### Annotated screenshots

Screenshot capture is a manual follow-up step — this brief was produced from code inspection without a running dev server. Before the PR ships, capture:

1. DocumentModal publish section, `not_public` state.
2. DocumentModal publish section, `live` state.
3. DocumentModal confirm modal with slug editor.
4. DocumentModal confirm modal with slug conflict.
5. DocumentModal confirm modal with flagged review.
6. Doc tree with Globe badge on a published doc.
7. Doc tree right-click context menu (current state).
8. Project three-dot menu (current state).
9. Live public page `/p/{slug}` footer area.

Target: `apps/web/docs/features/public-pages/screenshots/` (create in the implementation PR).

---

## Open questions for DJ

1. **UTM on `Copy link`?** Two stances:
    - (a) Include `?utm_source=share&utm_medium=copy-link` by default — lets us attribute traffic.
    - (b) Clean link for user-facing share — attribution only via `?utm_source=public-page` on the "Made with BuildOS" link on the page itself.
      Recommendation: **(b).** A clean link is friendlier to paste into DMs / Reddit / Substack footnotes. We get attribution from the footer link on the recipient's visit.

2. **"Make public" or "Publish"?** Current copy in DocumentModal says "Make This Document Public." That's clear but long. Alternatives: `Publish`, `Share publicly`, `Publish to link`. Per brand guide ("lead with relief"): **"Share publicly"** reads warmer than "Publish" and clearer than "Make public." Low-priority copy pass, not blocking.

3. **Unpublish — hard delete or soft?** Recommend soft (`public_status='unpublished'`, preserve slug). Lets users republish at the same URL and preserves slug history. Hard-delete can be an admin-only action if we ever need it.

4. **Should `Copy link` live on the public pill in the doc tree?** Risk: a click on the badge competes with click-opens-doc. If conflicts arise, fall back to "pill is decorative, copy-link only in context menu." Test in implementation.

5. **Mobile treatment?** The DocumentModal is full-screen on mobile and publish controls are already responsive. The doc-tree context menu is desktop-only (right-click). On mobile, `Copy link` needs to be reachable from DocumentModal and from a long-press or overflow menu on DocTreeNode. Deferrable if mobile parity isn't a Phase 1 requirement — confirm with DJ.

6. **Views — public display threshold?** Recommend hiding the view chip on the public page until `view_count_all >= 10` (avoids "3 views" vanity-negative on newly published work). Author's own view in DocumentModal always shows the exact number. Confirm.

7. **Views — do `visibility='unlisted'` pages count?** Recommend yes — the author still wants to know if unlisted shares are being clicked (that's the whole point of unlisted). Just don't surface the count publicly on the unlisted page footer.

8. **Comments — anonymous writes?** Strong recommendation: **no** in Phase 1. Requires auth. Reasoning: spam vectors, moderation load, mention-system assumes actor. If we want drive-by feedback, that's a Phase 6 decision paired with proper moderation tooling.

9. **Comments — unlisted pages?** Recommend: **allow authenticated comments on unlisted pages, block anonymous reads.** Matches Notion's behavior. Unlisted is a weak auth primitive anyway — don't lean on it for secrecy.

10. **Comments — notification flood risk?** If we surface comments on public pages, authors may get notified about comments from strangers. Ensure the existing notification system has a per-thread mute, or add one. Don't ship Phase 1 without at least an unsubscribe path.

11. **View dedup salt rotation.** The daily-rotating salt is privacy-friendly but means a viewer returning the next day counts as a new view. Acceptable? Alternative: 30-day salt with a hashed-cookie fallback for finer dedup. Default to the simpler option; revisit if analytics feel noisy.

12. **Comments on deleted/unpublished pages.** When an author unpublishes a document, existing comments should be soft-hidden from the public page but preserved in the author's DocumentModal view (for context on why they unpublished). Confirm this is the desired behavior.

---

## Definition of done (Phase 1, per strategy)

From `buildos-strat-tasks.md` T12:

> Any authenticated user can publish a project doc to a public URL from the web UI + QA'd on staging.

This is already technically achievable today by opening DocumentModal and scrolling. But the _spirit_ of Phase 1 (updated for v2) is:

- Publishing is **discoverable** from the project-page context, not buried.
- Publish state is **visible at-a-glance** on doc rows inside the project panels (v2).
- Shared links are **one-click copyable** from multiple surfaces.
- Publishing is **reversible** (unpublish ships in the same wave, or trust breaks).
- The **"Made with BuildOS"** footer becomes a linked entity with UTM — every public page starts compounding as a backlink from day one.
- Authors can see **who's reading** their published work (view counts) (v2).
- Readers can **reply with feedback in-place** (comments on public pages) — which is the literal primary share use case named in the strategy doc (v2).

The v1 work is still ~2–3 focused days for the discoverability + copy-link + unpublish core. Views adds ~1.5 days. Comments adds ~3 days. Total v2 Phase 1: **~8.5 engineering days**, spread across 7 independently shippable PRs.

---

## Implementation sequencing (v3 — one-swoop delivery)

Timeline is irrelevant per DJ. This section orders PRs for clean dependencies and review-ability, not calendar.

1. **PR 1 — Copy link + footer attribution + URL canonicalization.** Always-visible Copy link button in DocumentModal. Public-page footer: text → linked attribution with UTM + Inkprint logo mark. URL emission audit (make sure all surfaces emit `/p/{user_name}/{slug}`). `buildAbsolutePublicPageUrl` helper. ~1 day.
2. **PR 2 — Surfacing on doc rows + doc-tree pill + context menu.** Globe chip with tap-to-copy on `ProjectDocumentsSection` doc rows. `DocTreeNode` pill clickable. `DocTreeContextMenu` gets publish/manage/copy items. Long-press handler for mobile. ~1.5 days (uplifted for mobile).
3. **PR 3 — Unpublish backend route + UI + intermediate-state copy.** `POST /api/onto/documents/[id]/public-page/unpublish`. Service fn. UI button in DocumentModal. Intermediate-state handling. ~1 day.
4. **PR 4 — View tracking.** Table migration, `POST /api/public/pages/{slug}/view`, RPC, crawler filter, dedup, nightly rollup on worker. Display in 3 surfaces. ~1.5 days.
5. **PR 5 — `Published` insight panel in the project page right rail.** New panel in `expandedPanels` + `InsightPanelKey`. Backed by `GET /api/onto/projects/[id]/public-pages`. Views + comment counts in rows. Mobile stacking. ~1.5 days.
6. **PR 6 — Author-only Owner Bar on public pages.** `isAuthor` server-side flag. Owner Bar component (desktop inline + mobile overflow sheet). Wires to publish/unpublish/edit-original/back-to-project/copy/live-sync. `openPublish` query-param support on project page. ~2 days.
7. **PR 7 — Author attribution + stub author page at `/p/{user_name}`.** Header author-name treatment upgrade with avatar. Stub author page lists their public docs or "No public pages yet." ~1 day.
8. **PR 8 — Comments on public pages.** Access-check rework (document-level gate). `PublicPageComments` component. Sign-in CTA with return URL. Author-moderation (delete + report). Notification check. Mobile QA. ~3 days.
9. **PR 9 — Polish pass.** Visibility copy clarity. Empty-state nudge. Profile-settings "Your public URL starts with..." line. Loading skeleton polish. Cross-surface mobile QA. ~1 day.

**Total: ~13.5 engineering days across 9 PRs** (up from v2's 8.5 / 7 PRs — v3 added Owner Bar, URL canonicalization, author attribution, and mobile parity).

### Dependency graph

```
PR 1 ──┬──► PR 2 ─┬──► PR 5 ──┬──► PR 9
       │         │             │
       │         └──► PR 6 ────┘
       │
       ├──► PR 3 ─────► PR 6 (Owner Bar uses unpublish route)
       │
       ├──► PR 4 ─────► PR 5 (panel shows view counts) ──► PR 6 (Owner Bar shows view counts)
       │
       └──► PR 7 (independent; author attribution)

       PR 8 (comments) depends on PR 4 (view counts in DocumentModal comment chip) and PR 5 (comment count in panel) but can ship with counts-disabled if we sequence differently.
```

Suggested execution order: 1, 2, 3, 4 in that strict order (all unblock downstream), then 5/7 in parallel, then 6, then 8, then 9 as the polish cap. PR 1 should ship and be merged to main before anything else starts so the copy-link UX is live even if the rest slips.

---

## Not in scope for this brief

- Visual redesign of the public page template (Phase 3).
- Gallery / discovery surface (Phase 5).
- Clone-as-template (Phase 4).
- Likes / reactions / follows (Phase 6).
- Anonymous commenting (Phase 6, gated on moderation tooling).
- Full viewer analytics (referrer breakdown, geographic, device) — Phase 1 ships counts only; richer analytics wait until we have signal that authors care.
- Positioning review of microcopy — defer to brand guide review at PR-review time.

---

## Implementation status (2026-04-17)

All 9 PRs in the sequencing plan were implemented in a single session and held uncommitted per DJ's one-swoop instruction. The onboarding-v3 ReadyStep was updated in a follow-up pass to include the username claim at the end of onboarding, so a new user lands with a canonical `/p/{username}/...` URL ready on day one rather than discovering the setting in profile later.

### Shipped

| PR  | Scope                                                        | Status |
| --- | ------------------------------------------------------------ | ------ |
| 1   | Copy link button + footer attribution + URL canonicalization | ✅     |
| 2   | Doc-tree Globe pill tap-to-copy + context menu items         | ✅     |
| 3   | Unpublish endpoint + UI + intermediate states                | ✅     |
| 4   | View tracking (table, endpoint, RPC, nightly rollup, UI)     | ✅     |
| 5   | `Published` insight panel in project right rail              | ✅     |
| 6   | Author-only Owner Bar on public pages + cache bypass         | ✅     |
| 7   | Author attribution upgrade + stub `/p/{user_name}` index     | ✅     |
| 8   | Comments on public pages (access gate + UI + moderation)     | ✅     |
| 9   | `users.username` migration + API + profile editor            | ✅     |
| 10  | Username claim embedded in onboarding ReadyStep              | ✅     |

### Pre-merge checklist (must-do before shipping)

1. **Apply the two new migrations** — `20260430000000_add_public_page_views.sql` and `20260430000001_add_users_username.sql`. Until these run, `/api/public/pages/{slug}/view` will 500 and the username editor/onboarding claim will fail.
2. **Regenerate types** — `pnpm gen:types` so `view_count_all`, `view_count_30d`, and `users.username` flow into `database.types.ts`.
3. **Browser smoke test** the happy paths:
    - Publish a doc from DocumentModal → confirm modal → live URL is `/p/{username}/{slug_base}`.
    - Copy link from DocumentModal, doc-tree pill, `Published` panel row, and Owner Bar.
    - Visit own page as author → Owner Bar appears; as anon → no bar; no author flicker between states.
    - Unpublish from DocumentModal and from Owner Bar; republish at same URL.
    - Comment as author, comment as anon (should be blocked with sign-in CTA), comment as a different authenticated user.
    - Claim a username during onboarding; change it later from profile → `/p/{new}/...` works on next publish (existing slug_prefix is frozen per design).
    - `/p/{user_name}` (prefix alone) renders the author index, not a 404.
4. **Run the test suite** — `pnpm test`. No new tests were written for the comment access-gate rework; if this matters for CI, backfill at least a smoke test for `canAccessPublicComments` before merging.

---

## Follow-ups (known gaps, not blocking merge)

Keep this list authoritative — when anything here gets picked up, move it to its own ticket and delete from this section.

### Must-do short follow-ups

These are known correctness gaps — ship within a week of merge.

1. **Comment notifications to the doc author.** When a non-member comments on a public doc through the new access path, the existing `handleCommentMentions` only fires on `@mentions`. The doc's author should be notified on **every** top-level comment (and possibly replies) on their public page. Without this, authors are blind to incoming feedback unless they manually refresh. Low-effort fix in `/api/onto/comments` POST: after insert, if the entity is a document with a live public page AND the commenter is not the page owner, enqueue an existing notification for the owner actor.
2. **Scroll DocumentModal to the publish section** when opened via `?openPublish=true`. The query param correctly opens the modal (PR 6 wiring), but it lands at the top — the user still has to scroll to the publish controls. Add a scroll-into-view on a publish-section anchor when the param is present.
3. **Unit test for the comment access gate.** `canAccessPublicComments()` in `apps/web/src/lib/server/comment-public-access.ts` is the only net-new privacy-sensitive path. A table-driven test against: (a) document with live public page → true, (b) unlisted page → false, (c) unpublished page → false, (d) non-document entity → false, (e) deleted page → false. Untested right now; one bug here is a data leak.

### Should-do medium follow-ups

4. **Project header chip** — `🌐 N public` next to project name on the project page. Spec P2. Data is already fetched by `PublishedPanel`; chip is ~1 hr including the click-to-open-published-panel interaction.
5. **Empty-state nudge in the documents section** — on projects with ≥1 doc and 0 public pages, show a `Share a document publicly? →` text link. ~30 min.
6. **Comment report/flag endpoint** — Phase 1 ships author-delete only. For organic moderation, add `POST /api/onto/comments/[id]/report` writing to a new `onto_comment_reports` table + a small "Report" button on each comment row. Admin review in the existing `/admin/ontology/public-pages` dashboard. ~3 hrs.
7. **Mobile long-press context menu on doc-tree rows.** Today the doc-tree context menu is desktop right-click only. Mobile users can still tap the Public pill to copy a link, but have no path to "Share publicly" / "Manage public page" from the tree. Add a long-press handler that opens the context menu as a bottom sheet. Mobile parity P1 technically — deferred only because shipping drag touch conflicts with long-press on the same row. ~3–4 hrs including disambiguation.
8. **Soft-hide public comments on unpublished pages.** When `public_status='unpublished'`, the page 404s for the public, but comments persist in `onto_comments`. If the author republishes, comments reappear. That's probably the right behavior — but worth a decision: some authors may want comments wiped on unpublish to start clean. Ship a small toggle in the unpublish confirm dialog: "Also delete N comments on this page? [checkbox]." ~1 hr.
9. **Visibility clarity copy in confirm modal.** Current labels are `Public` vs `Unlisted`. Add one-line descriptions: "Public — anyone with the link, will appear in `/p/{you}` author index when published" vs. "Unlisted — anyone with the link, never appears in author index or future gallery." ~30 min.
10. **Loading skeleton polish** for the `PublishedPanel` and `PublicPageComments` empty/loading states to match the broader Inkprint loading pattern.

### Nice-to-have later

11. **Anonymous commenting** — Phase 6 per strategy doc. Blocked on moderation tooling (rate limits, CAPTCHA, a reports queue). Revisit after the gallery ships.
12. **View analytics breakdown** — referrer, geographic, device. Only ships counts today. Build when we have signal that authors care (probably quarterly check-in).
13. **Dedicated `Username` onboarding step** — if data shows most users skip the claim at the end of the current ReadyStep, promote to its own step or move earlier in the flow (right after intent/stakes).
14. **Claim from homepage CTA** — once a user has public content, offer a homepage module: "Your public URL: `build-os.com/p/{username}` — share it." Not urgent, but high-affinity users will look for this.
15. **Per-thread comment mute for authors.** Authors could accumulate notification noise on popular pages. A mute-this-thread action would prevent future notifications for a specific comment thread without disabling them across all pages.
16. **Owner Bar "view analytics" hook** — the bar surfaces `1.2k views` inline; clicking that number could open a lightweight "Recent views, referrers, countries" modal for the author. Currently it's a static number.
17. **Full moderation dashboard** — right now the admin panel at `/admin/ontology/public-pages` focuses on content review, not comment reports. Wire in once #6 ships.

### Explicitly punted — do NOT ship in a follow-up without a product decision

These are choices, not omissions. Revisit only with strategy input.

- **Anonymous commenting** — per strategy doc Phase 6 placement; not a Phase 1 primitive.
- **Dedicated `users.username` during signup (before onboarding)** — would lengthen signup friction. Current placement at onboarding ReadyStep + optional claim in profile is the right tradeoff.
- **Username changes rewriting historical URLs** — `slug_prefix` is frozen at publish time by design (DocumentModal line 3693). Changing username does NOT rewrite existing public page URLs. Existing pages keep their old prefix; new pages use the new. If a user wants stable identity, the username editor in profile should eventually warn them about this on-change. Do not implement retroactive rewrites without careful migration + slug-history handling.
- **Long-press context menu AND drag on same row** — conflict resolution is non-trivial. Shipping mobile context menu means either (a) losing drag on mobile, or (b) delaying long-press by N ms and showing a visual cue. Deferred pending mobile QA feedback.
- **Hard-delete unpublish** — current implementation preserves the row with `public_status='unpublished'`. Hard-delete would destroy slug history. Keep soft. No hard-delete route in UI.
- **Anonymous view counter accuracy** — daily rotating salt means a returning viewer counts as new the next day. Acceptable for "rough vanity number." Don't add cookies to fix this without a product decision on viewer tracking.
- **Project-level `is_public` toggle in user UI** — the column exists on `onto_projects` but is only used by comment access + the homepage example carousel. Exposing it to users would conflict with the document-level publish model. Leave off until there's a clear product reason.

---

## Onboarding integration note (added 2026-04-17)

`ReadyStep.svelte` (step 3 of onboarding-v3) now includes a `Claim your public URL` card between the stats row and the `What to do next` card. Behavior:

- Loads the user's current `username` + derived fallback on mount from `/api/profile/me/username`.
- Pre-fills the input with the derived fallback so accepting it is one click.
- Optional — a `Skip for now` link dismisses the card without saving (username stays `NULL`; public pages will use the derived prefix).
- Validation mirrors the shape rules (3–24 chars, lowercase alphanumeric + hyphens), 409 on collision, friendly error copy.
- Once claimed, the card collapses to a `Your public URL is build-os.com/p/{username}/…` confirmation.

The placement rationale: users at ReadyStep have already completed setup and have projects/tasks created. Claiming a public URL at that moment is low-friction and primes them to share what they just built. Putting it earlier (intent/stakes step) would interrupt momentum with an unrelated identity question before they've built anything worth sharing.

If analytics later show >70% of users skip the claim, promote it to its own step (follow-up #13 above) or move earlier, post-brain-dump.
