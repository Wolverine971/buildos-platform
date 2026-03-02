<!-- docs/specs/PUBLIC_PAGES_SPEC.md -->

# Public Pages Specification

## Status

| Attribute | Value                                                    |
| --------- | -------------------------------------------------------- |
| Status    | Draft                                                    |
| Date      | 2026-03-02                                               |
| Owner     | Platform + Web                                           |
| Scope     | `apps/web`, Supabase schema + RLS, public route delivery |

---

## 1. Summary

Add **Public Pages**: wiki-style pages that are publicly readable without BuildOS login, but authored and updated inside BuildOS projects.

A Public Page is a project document that has been explicitly made public:

- Public can read (no auth required).
- Only project members can edit/publish.
- First publish requires preview + confirmation.
- After confirmation, saves can update the live page immediately.
- Page supports markdown, images, links/citations, and byline/footer metadata.

---

## 2. Why This Feature

Current model supports `onto_projects.is_public`, but that is too coarse for this use case:

- It exposes project data at project scope, not page scope.
- Public-read behavior is tied to project-level visibility, not document-level publishing.
- Asset render endpoint (`/api/onto/assets/:id/render`) currently requires authentication, which blocks anonymous image rendering.

Public Pages needs **page-level publish control** with a fast anonymous read path.

---

## 3. Product Definition

### 3.1 Public Page

A Public Page is a first-class entity that points to an internal document and stores public delivery metadata.

- Editing happens in project document workflows.
- Initial publish requires explicit confirmation from a preview screen.
- Public URL resolves to the confirmed public page.

### 3.2 Live Document Behavior

After initial confirmation, a page can run in **live sync mode**:

- Saving the source document immediately updates the public page.
- Document modal clearly warns the user: "This is a live document."
- Publish state and sync status are visible in both the modal and doc tree.

---

## 4. Goals

- Public read access without auth.
- Keep authoring in existing project/document experience.
- Explicit publish/unpublish lifecycle.
- "Make this document public" entry point in `DocumentModal`.
- Confirmation preview required before first public publish.
- Immediate live updates when saving a live public document.
- Sidebar callout for live documents in `DocumentModal`.
- Doc tree flag (`is_public`) for quick visibility.
- Fast page load and image delivery.
- Built-in footer metadata: author/byline + last updated + source attribution.
- SEO-ready URL structure and metadata.

## 5. Non-Goals (v1)

- Public inline editing by anonymous users.
- Full Notion-style collaborative public editing.
- Custom domains (defer to v2).
- Version diff UI on public route.

---

## 6. URL Strategy

### 6.1 Canonical Route

Recommended canonical public URL:

`/p/{slug}`

Examples:

- `/p/project-monotology-overview`
- `/p/market-map-adhd-productivity`

Why:

- Short, memorable, shareable.
- Decoupled from internal UUIDs.
- Works even if project names change.

### 6.2 Slug Rules

- Global unique, lowercase kebab-case.
- Regex: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- Reserved slugs blocked (`admin`, `api`, `auth`, `projects`, etc.).

### 6.3 Slug History / Redirects

When slug changes:

- Preserve old slug in history table.
- Return `301` from old slug to current canonical slug.

---

## 7. Data Model

### 7.1 New Table: `onto_public_pages`

Stores publish state + read model.

Suggested columns:

- `id uuid primary key`
- `project_id uuid not null references onto_projects(id)`
- `document_id uuid not null references onto_documents(id)`
- `slug text not null unique`
- `title text not null`
- `summary text null`
- `status text not null check (status in ('draft','published','unpublished','archived'))`
- `visibility text not null check (visibility in ('public','unlisted')) default 'public'`
- `noindex boolean not null default false`
- `published_version_number int null`
- `published_content text null`
- `published_description text null`
- `published_props jsonb not null default '{}'::jsonb`
- `live_sync_enabled boolean not null default true`
- `public_status text not null default 'not_public' check (public_status in ('not_public','pending_confirmation','live','unpublished','archived'))`
- `last_live_sync_at timestamptz null`
- `last_live_sync_error text null`
- `created_by uuid not null references onto_actors(id)`
- `updated_by uuid not null references onto_actors(id)`
- `published_by uuid null references onto_actors(id)`
- `published_at timestamptz null`
- `last_unpublished_at timestamptz null`
- `deleted_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- One active public page per document:
  unique partial index on `(document_id)` where `deleted_at is null`.
- One active public page per slug:
  unique partial index on `(slug)` where `deleted_at is null`.

### 7.2 New Table: `onto_public_page_slug_history`

- `id uuid primary key`
- `public_page_id uuid not null references onto_public_pages(id)`
- `old_slug text not null`
- `new_slug text not null`
- `changed_by uuid not null references onto_actors(id)`
- `changed_at timestamptz not null default now()`

### 7.3 Optional Table (v1.1): `onto_public_page_citations`

If structured citations are needed beyond markdown links:

- `public_page_id`
- `source_id` (`onto_sources.id`)
- `ordinal`
- `label`
- `url_override`
- `snippet`

v1 can ship with citations in `published_props.citations` and formalize this table later.

### 7.4 Doc Structure Public Flag

Add a denormalized public flag in project doc structure metadata for fast tree rendering:

- `doc_structure` node extension:
    - `is_public: boolean`
    - `public_slug: string | null`
    - `public_status: 'not_public' | 'pending_confirmation' | 'live' | 'unpublished'`

Source of truth remains `onto_public_pages`; doc tree metadata is a synchronized cache for UI badges.

---

## 8. Auth, Access, and RLS

### 8.1 Read (Public)

Anonymous users can read only rows that are:

- `status = 'published'`
- `deleted_at is null`
- `visibility = 'public'`

No project membership required for these reads.

### 8.2 Write (Internal)

Create/update/publish/unpublish requires authenticated user with:

- `current_actor_has_project_access(project_id, 'write')` (or admin)

### 8.3 Important Constraint

Public Pages must **not** rely on `onto_projects.is_public` because that is project-wide visibility and can leak unrelated draft content.

---

## 9. Publish Lifecycle

### 9.1 Start from Document Modal

In `DocumentModal`, add a primary action in the sidebar:

- Button label: `Make This Document Public`
- Visible to users with write access
- Opens confirmation flow (not immediate publish)

### 9.2 Confirmation Preview (Required)

Flow:

1. User clicks `Make This Document Public`.
2. App opens a confirmation view/modal with:
    - public URL preview
    - rendered content preview
    - title/summary/slug
    - warning that this will be publicly accessible
3. User must explicitly click confirm.

No first-time publish occurs without this confirmation.

### 9.3 Confirm + Go Live

`POST /api/onto/public-pages/:id/publish` (or document-scoped confirm endpoint)

Actions:

1. Validate writer access.
2. Validate slug + visibility.
3. Generate public read model from current document.
4. Set:
    - `status='published'`
    - `public_status='live'`
    - `published_at`, `published_by`
    - `live_sync_enabled=true` (default)
5. Sync doc tree node `is_public=true`.

### 9.4 Live Save Propagation

When a source document is public and `live_sync_enabled=true`:

1. User edits + saves in `DocumentModal`.
2. Same save pipeline (or immediate async worker) updates public page payload.
3. Public page reflects the change immediately.
4. UI shows save + live sync confirmation ("Saved and published live").

### 9.5 Unpublish

`POST /api/onto/public-pages/:id/unpublish`

- Set `status='unpublished'`
- Set `public_status='unpublished'`
- Set doc tree `is_public=false`
- Public route returns 404

### 9.6 Live Indicator in Modal

If document is live public:

- Show sidebar callout:
    - Title: `Live Document`
    - Copy: `This document is public. Changes are published immediately when you save.`
- Show live URL and last live sync timestamp.

---

## 10. API Contracts

### 10.1 Internal APIs (authenticated)

- `POST /api/onto/projects/:projectId/public-pages`
    - Create page mapping for a document.
- `GET /api/onto/projects/:projectId/public-pages`
    - List page status for project.
- `PATCH /api/onto/public-pages/:id`
    - Update slug/title/summary/noindex/visibility.
- `POST /api/onto/public-pages/:id/publish`
    - Confirm and publish live.
- `POST /api/onto/public-pages/:id/unpublish`
    - Remove public availability.
- `GET /api/onto/public-pages/:id/preview`
    - Authenticated preview read model used by confirmation view.
- `GET /api/onto/documents/:id/public-page`
    - Returns public page state for modal/sidebar.
- `POST /api/onto/documents/:id/public-page/prepare`
    - Builds preview payload before confirmation.
- `POST /api/onto/documents/:id/public-page/confirm`
    - Confirms and makes document public.
- `POST /api/onto/documents/:id/public-page/live-sync`
    - Toggle live sync mode (optional if v1 ships with always-on live sync).

### 10.2 Public APIs (anonymous)

- `GET /api/public/pages/:slug`
    - Returns published page payload only.
- `GET /api/public/pages/:slug/meta`
    - Lightweight metadata endpoint for bots/preload (optional).

---

## 11. Rendering and Route Design

### 11.1 New Public Route

- `apps/web/src/routes/(public)/p/[slug]/+page.server.ts`
- `apps/web/src/routes/(public)/p/[slug]/+page.svelte`

Server load:

- No auth requirement.
- Fetch published payload by slug.
- Return 404 for missing/unpublished pages.
- Handle slug-history redirects.

### 11.2 Page Layout Requirements

The public page should include:

- Title + optional summary
- Main markdown content
- Inline images
- Citations/sources section
- Footer:
    - "Created by"
    - "Last updated"
    - optional "From project {name}"

### 11.3 Document Modal Requirements

`apps/web/src/lib/components/ontology/DocumentModal.svelte` must include:

- Sidebar action button: `Make This Document Public` (when not public).
- Sidebar live callout when public + live.
- Live URL display + copy action.
- Save feedback that distinguishes:
    - `Saved`
    - `Saved and published live`

### 11.4 Doc Tree Requirements

Doc tree views should show a public badge using doc structure metadata:

- Badge label: `Public`
- Optional state: `Pending Confirmation`, `Live`, `Unpublished`
- Drives quick recognition in hierarchy lists.

### 11.5 SEO

Use existing `SEOHead` conventions:

- canonical URL = `/p/{slug}`
- OpenGraph title/description
- optional JSON-LD (`Article` or `TechArticle`)
- `noindex` support via page setting

---

## 12. Images and Assets

### 12.1 Current Gap

`/api/onto/assets/:id/render` requires authentication, so anonymous public pages cannot render private asset links directly.

### 12.2 v1 Recommendation

Add public-safe asset rendering path tied to published page access:

- `GET /api/public/assets/:assetId/render?page={slug}`

Rules:

- Asset must be linked to page document (or listed in published page asset map).
- Page must be currently published and public.

Implementation options:

1. Fastest runtime path (recommended):
   copy published assets to a public bucket at publish time and serve direct CDN URLs.
2. Simpler initial path:
   generate signed URLs server-side per request with aggressive caching.

Given "needs to be fast", option 1 is preferred for v1.

---

## 13. Citations and Links

### 13.1 v1

- Support standard markdown links in content.
- If `onto_sources` are linked to the document, render a "Sources" block at bottom using `published_props.citations`.

### 13.2 Citation Model

Each citation entry should include:

- label
- url
- title (optional)
- publisher/domain (optional)
- accessed_at/published_at (optional)

---

## 14. Performance Plan

### 14.1 Read Path

Public route must avoid heavy project graph queries:

- One lookup by slug to a published page row.
- Avoid fetching full project entities.

### 14.2 Write Path (Live Sync)

Live save propagation target:

- Public update begins immediately on document save.
- If asynchronous fallback is used, p95 live update visibility should remain within a short SLA (define in implementation, e.g. < 2s).

### 14.3 Cache Strategy

Public page responses:

- `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`
- `ETag` from content hash

Public assets:

- Long-lived immutable URLs for published copies.

### 14.4 Hook Optimization

Current hook session resolution runs for most non-API routes.
Add skip logic for:

- `/p/*`
- `/api/public/pages/*`
- `/api/public/assets/*`

This removes unnecessary auth overhead from anonymous public traffic.

---

## 15. Security

- Sanitize markdown output (reuse existing markdown sanitizer).
- Validate slug ownership and uniqueness server-side.
- Enforce write permissions via project access function.
- Avoid service-role overuse on public endpoints.
- Rate-limit public read endpoints (IP-level guard).
- Add abuse monitoring for page scraping spikes.

---

## 16. Observability

Track:

- page views by slug
- p95/p99 latency for `/p/[slug]`
- cache hit ratio
- publish success/failure events
- stale/out-of-sync page count

Suggested event names:

- `public_page_published`
- `public_page_unpublished`
- `public_page_viewed`
- `public_page_slug_changed`
- `public_page_live_sync_succeeded`
- `public_page_live_sync_failed`

---

## 17. Rollout Plan

### Phase 1: Schema + Internal APIs

- Add `onto_public_pages` + slug history migrations.
- Add RLS policies.
- Add authenticated CRUD/publish endpoints.

### Phase 2: Public Delivery

- Add `/p/[slug]` route + `/api/public/pages/:slug`.
- Add public asset delivery path.
- Add footer metadata rendering.

### Phase 3: Editor Integration

- Add "Public Page" controls in document/project UI:
    - sidebar button (`Make This Document Public`)
    - confirmation preview flow
    - publish/unpublish
    - slug edit
    - live callout
    - save messaging for live sync
    - doc tree public badge

### Phase 4: SEO + Analytics

- Canonical tags, JSON-LD, sitemap inclusion.
- View analytics and publish telemetry.

---

## 18. Acceptance Criteria

1. Anonymous user can open `/p/{slug}` and view page content without login.
2. Anonymous user cannot access unpublished page slugs.
3. Project writer can publish a document to a public slug only after confirmation preview.
4. Editing and saving a live public document updates the public page immediately.
5. Public page displays title, content, images, citations, and footer metadata.
6. Slug rename issues 301 redirect from old slug to new slug.
7. Public page TTFB p95 remains within target under cache-warm traffic.
8. No private project entities are exposed through public page endpoints.
9. Document modal shows a "Live Document" sidebar callout for live public documents.
10. Doc tree visually marks public documents via `is_public` metadata.

---

## 19. Open Questions

1. Should `editor` role be allowed to confirm first-time public publish, or only `admin`/`owner`?
2. Should live sync be mandatory for public docs in v1, or user-toggleable per document?
3. Should unlisted pages (`visibility='unlisted'`) be excluded from sitemap by default?
4. Do we need scheduled publish/unpublish windows in v1?
