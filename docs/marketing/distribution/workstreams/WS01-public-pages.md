<!-- docs/marketing/distribution/workstreams/WS01-public-pages.md -->

---
id: WS01
title: Public Pages as Distribution Surface
wave_span: 1-4
status: in-progress
owner: DJ
related_tasks: [T02, T12, T13, T21, T22, T26, T29, T30, T31]
cross_workstreams: [WS02, WS04, WS07]
last_updated: 2026-04-17
---

# WS01 — Public Pages as Distribution Surface

> [← Index](../README.md) · [Conventions](../CONVENTIONS.md) · [Strategy](../../../../buildos-strat.md#31-public-pages-as-a-first-class-distribution-surface) · [Task List](../../../../buildos-strat-tasks.md)

## One-line goal

Turn every BuildOS project into a shareable, cloneable, cite-able public artifact — the Notion/Figma/Linear viral surface — aligned with the thinking-environment positioning.

## Why this is a work stream

Public pages compound across every other channel: SEO surface, LLM citation surface, social share surface, user acquisition, product showcase. Strategy ranks this the single highest-leverage move. The backend scaffold is ~70% built; the user-facing surface is not.

## Status dashboard

| Task | Title | Type | Wave | Effort | Status | Spec |
|------|-------|------|------|--------|--------|------|
| T02 | End-user publish UX audit | R | 1 | 4 h | ✅ 2026-04-16 | [phase-1-ui-brief.md](../../../../apps/web/docs/features/public-pages/phase-1-ui-brief.md) |
| T12 | Phase 1 — end-user publish UI | C | 2 | ~13.5 eng days | 🟡 ready | same brief (v3 locked, 9 PRs) |
| T13 | "Made with BuildOS" attribution verify | C | 2 | 1 h | ⚪ | inline below |
| T26 | Seed 10–20 public projects for gallery | W | 3 | 2 d | ⚪ | inline below |
| T21 | Phase 3 — visual design audit | C | 3 | 1 wk | ⚪ | inline below |
| T22 | Phase 4 — clone-as-template | C | 3 | 1–2 wk | ⚪ | inline below |
| T29 | Phase 5 — discovery gallery | C | 4 | 2 wk | ⚪ | inline below |
| T30 | `/@username/project-name` migration | C | 4 | 1 wk | ⚪ | inline below |
| T31 | Phase 6 — social layer | C | 4+ | multi-wk | ⏸ | inline below |

## Required reading

- [Brand guide](../../brand/brand-guide-1-pager.md) — visual direction ("working surface, not a dashboard")
- [Thinking-environment strategy](../../strategy/thinking-environment-creator-strategy.md)
- Inkprint design system: `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- Existing scaffold audit: see task T02 research in the brief linked above

## Scope

**In scope:**
- Any user-generated artifact (projects, documents, ontology snapshots) as a public URL
- Discovery + virality mechanics (clone, gallery, attribution)
- URL design and canonicalization
- Visual polish of the public-page template

**Out of scope:**
- Marketing site pages (`/how-it-works`, `/changelog`, `/compare`) — see WS05, WS07
- JSON-LD on marketing pages — see WS02
- Public repo README — see WS06

## Dependency chain within this work stream

```
T02 (done) ──► T12 (ready) ──► T13 ──► T21 ──► T26 ──► T29 ──► T31
                           └─► T22 ──┤
                                     └─► T30 (can parallel with T29)
```

T12 is the gate for everything else. Ship it first.

## Cross-workstream dependencies

- **WS02 (GEO):** T12 output surfaces should carry `Article` JSON-LD (scaffold already does — verify during T12 QA). T13 attribution adds a backlink every public page contributes to our domain authority.
- **WS04 (content):** T26 seed projects double as Reddit share material for WS03 T27 and proof assets for WS04 T15.
- **WS07:** `/how-it-works` should link to the gallery (T29) once it exists.

## Output artifacts

| Artifact | Location |
|----------|----------|
| Phase 1 UI brief (T02 output) | `apps/web/docs/features/public-pages/phase-1-ui-brief.md` |
| Phase 1 code | distributed across `apps/web/src/lib/components/`, `routes/(public)/p/`, `routes/api/onto/documents/[id]/public-page/` |
| Phase 3 design audit | `apps/web/docs/features/public-pages/phase-3-design-audit.md` (future) |
| Phase 4 clone spec | `apps/web/docs/features/public-pages/phase-4-clone-spec.md` (future) |
| Gallery route | `apps/web/src/routes/(public)/gallery/` (future) |

## Task briefs

### T02 — End-user publish UX audit ✅

Spec drafted 2026-04-16. See [phase-1-ui-brief.md](../../../../apps/web/docs/features/public-pages/phase-1-ui-brief.md). Key finding: `DocumentModal` already contains ~95% of the publish UI. Phase 1 is discoverability + sharing + attribution + mobile parity — not rebuild.

### T12 — Phase 1 end-user publish UI 🟡

**Source:** the v3 brief at [phase-1-ui-brief.md](../../../../apps/web/docs/features/public-pages/phase-1-ui-brief.md).

**Scope (locked in brief):** copy-link · footer attribution · URL canonicalization to `/p/{user_name}/{slug}` · `Published` insight panel in project right rail · unpublish · view tracking · author-only Owner Bar on public pages · author attribution stub (`/p/{user_name}`) · comments on public pages · mobile parity · polish.

**Delivery:** 9-PR sequence per brief's Implementation Sequencing section.

**Done when:** any authenticated user can publish, share-link, unpublish, comment on, and view stats for a project doc from desktop + mobile web, QA'd on staging.

**Assign to:** `compound-engineering:workflows:work` agent; require DJ review on each PR.

### T13 — "Made with BuildOS" attribution 🟡

**Goal:** every public page renders a tasteful "Made with BuildOS" footer linking to the homepage with UTM params (`utm_source=public-page&utm_medium=attribution`).

**Action:**
1. Read `apps/web/src/routes/(public)/p/[slug]/+page.svelte` and `/p/[slugPrefix]/[slugBase]/+page.svelte`
2. If attribution missing or weak, add per Inkprint design system tokens (no sparkle, no hype, one small line)
3. Verify link resolves with UTM params

**Can run in parallel with T12 PRs** since it touches the public template only.

### T21 — Phase 3 visual design audit ⚪

**Goal:** Public page template looks like a Notion-level shared document and aligns with brand visual direction ("working surface, studio desk, editorial wall") — not a CRM export.

**Action:**
1. Screenshot current public page
2. Compare against brand guide visual direction
3. Apply Inkprint tokens; use `design-update` skill
4. Have `compound-engineering:design:design-implementation-reviewer` agent audit

**Depends on T12 for the layout to audit against.**

### T22 — Phase 4 clone-as-template ⚪

**Goal:** "Use this as a template" action on public pages. Preserves structure; clears personal data; creates a new authenticated project for the viewer.

**Key UX decisions to capture in spec:**
- What "personal data" means (free-text fields: clear; tag taxonomy: keep; task titles: clear content but keep shape?)
- How clone count is tracked (per-page counter on `onto_public_pages`?)
- How to display social proof ("X people used this template") without gaming

**Assign to:** `compound-engineering:workflows:plan` first to write the spec, then `workflows:work` to build.

### T26 — Seed 10–20 public projects for gallery ⚪

**Goal:** Before the gallery (T29) ships, populate it with real DJ projects worth reading.

**Target mix (creator-framed per brand guide):**
- 1 book project structure (fiction or non-fiction)
- 1 YouTube-series production plan
- 1 podcast season plan
- 1 newsletter editorial pipeline
- 1 course production plan
- 1 launch plan
- 1 research-heavy project
- 3–4 more from DJ's real ongoing work

**Framing per project:** collaboration-seeking, not vanity. "Here's my launch plan — tell me what I'm missing" reads very differently from "Look at my project."

**Depends on T12 (publish UI exists) + T13 (attribution visible).**

### T29 — Phase 5 discovery gallery ⚪

**Goal:** Public route `/gallery` or `/showcase` with filterable project index.

**Filter dimensions:** creator type (book / video series / podcast / newsletter / launch / research), depth (quick-brief / full project), freshness.

**Seed:** T26 outputs.

### T30 — `/@username/project-name` URL migration ⚪

**Goal:** Upgrade canonical URL structure from `/p/{slug}` to `/@username/project-name` for memorability and personal-brand compounding.

**Plan:**
- 301 redirects from old `/p/{slug}` URLs
- Slug conflict resolution (already has scaffold via `onto_public_page_slug_history`)
- Username reservation flow

**Run only after Phase 5 stabilizes.**

### T31 — Phase 6 social layer ⏸

**Gate:** do not build until the gallery has sustained activity. Empty social layers actively hurt the product.
**Decision revisit:** day 270 from strategy kickoff.

## Agent assignment notes

- **Code tasks (T12, T13, T21, T22, T29, T30, T31):** `compound-engineering:workflows:work`. Brief with link to this file + the Phase 1 UI brief. Review every PR against brand guide before merge.
- **Content task (T26):** DJ-personal. The projects must be real and useful; they can't be agent-drafted.
- **Design audit (T21):** `compound-engineering:design:design-implementation-reviewer` after T21 code lands.

Every PR touching a public page must also pass: JSON-LD validator (T12 only), accessibility audit (any new surface), mobile render check.

## Open questions

1. **Slug length cap.** Brief locks `/p/{user_name}/{slug}` but doesn't specify max length. Check against URL-length norms + SEO best practice.
2. **Username reservation at sign-up.** Does new-user flow claim a username now, or only at first publish? Decision belongs to T12 or T30.
3. **Clone attribution.** When a user clones a template, does the cloned project link back to the original? (Probably yes for attribution/backlink purposes, but needs UX design.)

## Change log

- **2026-04-17** — Work stream created. T02 marked complete. T12 unblocked and ready.
- **2026-04-16** — T02 spec (phase-1-ui-brief.md v3) drafted and locked at 9 PRs / ~13.5 eng days.
