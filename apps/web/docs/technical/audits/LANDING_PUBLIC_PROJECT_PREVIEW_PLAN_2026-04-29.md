<!-- apps/web/docs/technical/audits/LANDING_PUBLIC_PROJECT_PREVIEW_PLAN_2026-04-29.md -->

# Landing Public Project Preview — Implementation Plan

**Created:** 2026-04-29
**Drives:** Fix 3 + Fix 7-redux from [`MARKETING_SITE_FIXES_HANDOFF_2026-04-29.md`](./MARKETING_SITE_FIXES_HANDOFF_2026-04-29.md)
**Target:** `apps/web/src/routes/+page.svelte` (unauthenticated landing) + new public preview component

This doc is the implementation plan for the read-only "see what BuildOS looks like inside" preview. It replaces the existing `ExampleProjectGraph.svelte` slot on the landing with a richer preview that surfaces the same data the authenticated project page shows, without leaking auth/edit affordances.

---

## Goal

Give a first-time visitor a believable look at what a real BuildOS project looks like — header, next step, documents, goals/plans/milestones/tasks/risks rail, and the graph — using the 6 hand-curated public ontology projects already in the database (Project Hail Mary, Apollo Program, ASOIAF Writing, ACOTAR Writing, Manhattan Project, Washington Campaign).

This is the strongest possible "show, don't tell" — the actual product, with real data, rendering on the landing page.

## Decisions captured

| Decision                     | Choice                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where it lives               | Embedded on the unauthenticated landing page (replaces current `ExampleProjectGraph` section)                                                                                        |
| How visitors switch projects | **Dropdown showing all 6 projects by name** (not the current shuffle button)                                                                                                         |
| Component reuse              | **Build new presentational components**. Do NOT try to share the authenticated `ProjectHeaderCard` / `ProjectInsightRail` / `ProjectDocumentsSection` — too much edit/auth coupling. |
| Data source                  | Existing `/api/public/projects` and `/api/public/projects/[id]/graph` — no new API routes for Phase 1                                                                                |
| Phasing                      | Phase 1: landing embed only. Phase 2 (later): standalone `/examples/[id]` shareable URLs.                                                                                            |

## Phasing

### Phase 1 — Landing embed (this PR)

Ship a new `PublicProjectView.svelte` that:

- Loads the list of 6 public projects on mount
- Renders a project-page lookalike for the first/selected one
- Lets the visitor pick a different project from a dropdown
- Replaces the current `ExampleProjectGraph` section on `+page.svelte`
- Eager-loads for unauthenticated visitors (kills the IntersectionObserver gate)

### Phase 2 — Shareable URLs (separate PR, defer)

- New route `/examples/[slug]` (or `/examples/[id]`) hosting the same component
- Per-project OG meta tags
- "Share this example" button on the landing embed that links out

Out of scope for Phase 1: do not pre-build Phase 2 plumbing.

## Data sources (already exist)

```
GET /api/public/projects
  → { success, data: { projects: PublicProject[] } }

GET /api/public/projects/[id]/graph?viewMode=full
  → {
      source: { projects, edges, tasks, documents, plans, goals, milestones, risks },
      graph,
      stats,
      project: { id, name, description, props, state_key, start_at, end_at },
      metadata
    }
```

The `source` payload contains everything we need to render the full preview. No new endpoints required for Phase 1.

## Component architecture

```
src/lib/components/landing/
├── ExampleProjectGraph.svelte       (DELETE — replaced)
└── public-project-preview/          (NEW — folder for the preview suite)
    ├── PublicProjectView.svelte         host, data fetch, dropdown, layout
    ├── PublicProjectHeader.svelte       icon + name + commander + timeline + "next step" card
    ├── PublicProjectStatsRow.svelte     entity counts (forked from ExampleProjectGraph stats row)
    ├── PublicProjectDocsList.svelte     read-only document list (no tree, no edit)
    ├── PublicProjectInsightRail.svelte  collapsible stacks: goals / milestones / plans / tasks / risks
    ├── PublicProjectGraphPanel.svelte   wraps existing OntologyGraph with read-only wrapper
    └── lib/
        └── public-project-types.ts      shared types (PublicProject, PublicProjectFullData)
```

**Reused upstream:**

- `OntologyGraph` (the cytoscape graph engine — already used)
- `NodeDetailsPanel` (read-only — already used)
- `ProjectIcon` (no auth coupling — safe to reuse)
- Lucide icons (Target, Flag, Calendar, ListChecks, FileText, AlertTriangle, Scale)

**Not reused (forked visually instead):**

- `ProjectHeaderCard` — has back button, menu, NextStepDisplay (auth-coupled)
- `ProjectInsightRail` — 600 lines, edit-coupled
- `ProjectDocumentsSection` — uses `DocTreeView` which calls auth APIs

## UI structure (the new section on the landing)

```
┌──────────────────────────────────────────────────────────────────┐
│ [Section header]                                                 │
│  • • • EXAMPLE PROJECT                                           │
│  See how a thinking environment connects complex work.           │
│  This is a real project rendered inside BuildOS. Pick one ↓      │
│                                                                  │
│  [ Project: Project Hail Mary ▾ ]  [ Open in BuildOS → ]         │
├──────────────────────────────────────────────────────────────────┤
│ [Project header card]                                            │
│  [icon]  Project Hail Mary                                       │
│         Led by Dr. Ryland Grace · 2026 - 2030                    │
│         "Solve the Astrophage crisis and save Earth's biosphere" │
│         ─────────────────────────────────────────────            │
│         NEXT STEP: Decode the Eridian beacon transmission        │
├──────────────────────────────────────────────────────────────────┤
│ [Stats row] 4 Goals · 8 Milestones · 3 Plans · 24 Tasks · 6 Docs │
├──────────────────────────────────────────────────────────────────┤
│ [Docs list]    [Insight rail]                                    │
│  📄 Doc 1       ▾ Goals (4)                                      │
│  📄 Doc 2       ▸ Milestones (8)                                 │
│  📄 Doc 3       ▾ Plans (3)                                      │
│                 ▸ Tasks (24)                                     │
│                 ▸ Risks (2)                                      │
├──────────────────────────────────────────────────────────────────┤
│ [Graph panel]                                                    │
│  [interactive cytoscape graph — same as today]                   │
└──────────────────────────────────────────────────────────────────┘
```

Mobile: stacks vertically. Docs and Insight Rail collapse to single column under the stats row. Graph keeps its own height.

## Step-by-step build order

1. **Create folder + types file** (`public-project-preview/` + `lib/public-project-types.ts`).
2. **Build `PublicProjectView.svelte`** — host. Fetches the list, manages dropdown selection, fetches the selected project's full payload, renders children.
3. **Build `PublicProjectHeader.svelte`** — icon + name + commander/timeline + description + read-only next-step text. No "Next" generation, no back button, no menu.
4. **Build `PublicProjectStatsRow.svelte`** — port the stats row from `ExampleProjectGraph.svelte:341-396` as a standalone component.
5. **Build `PublicProjectDocsList.svelte`** — flat list of documents from `source.documents` with title, type/icon, short snippet. No tree, no folders, no edit.
6. **Build `PublicProjectInsightRail.svelte`** — collapsible stacks for goals / milestones / plans / tasks / risks. Each item is read-only; tap to scroll / highlight only (no modal, no graph linkage in Phase 1).
7. **Build `PublicProjectGraphPanel.svelte`** — wraps the existing `OntologyGraph` with the same UX as today (click node → side panel on desktop, tap to expand on mobile). Forked from `ExampleProjectGraph.svelte:399-533`.
8. **Wire it into `+page.svelte`** — replace the current `<div bind:this={exampleGraphTarget}>...{ExampleProjectGraphComponent}` block (`+page.svelte:654-669`) with a direct mount of `PublicProjectView` (eager — no IntersectionObserver for unauth visitors).
9. **Remove the old `ExampleProjectGraph.svelte` import + IntersectionObserver gate** in `+page.svelte:188-211` (only for unauth path).
10. **Verify the section ID is `#example`** for the existing hero CTA `#examples` and any internal links to keep working.
11. **Run `pnpm typecheck` + `pnpm lint`** in `apps/web` and fix anything red.
12. **Test in dev** in both light and dark mode, desktop + mobile breakpoints.

## File-by-file changes

| File                                                                                         | Change                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/components/landing/public-project-preview/PublicProjectView.svelte`        | NEW                                                                                                                                                                                       |
| `apps/web/src/lib/components/landing/public-project-preview/PublicProjectHeader.svelte`      | NEW                                                                                                                                                                                       |
| `apps/web/src/lib/components/landing/public-project-preview/PublicProjectStatsRow.svelte`    | NEW                                                                                                                                                                                       |
| `apps/web/src/lib/components/landing/public-project-preview/PublicProjectDocsList.svelte`    | NEW                                                                                                                                                                                       |
| `apps/web/src/lib/components/landing/public-project-preview/PublicProjectInsightRail.svelte` | NEW                                                                                                                                                                                       |
| `apps/web/src/lib/components/landing/public-project-preview/PublicProjectGraphPanel.svelte`  | NEW                                                                                                                                                                                       |
| `apps/web/src/lib/components/landing/public-project-preview/lib/public-project-types.ts`     | NEW                                                                                                                                                                                       |
| `apps/web/src/lib/components/landing/ExampleProjectGraph.svelte`                             | DELETE                                                                                                                                                                                    |
| `apps/web/src/routes/+page.svelte`                                                           | EDIT — remove `ExampleProjectGraph` lazy-load wiring; mount `PublicProjectView` directly under the Hero (or keep current position; see below); ensure `#example` id is on the new section |

## Section position on the landing

Per Fix 3 in the audit: **move it up to immediately after the Hero**, before "How It Works." That gives the demo first-impression weight. Verify the hero CTA `href="#how"` still resolves, and add an in-component `id="example"` so existing anchor links keep working.

## Acceptance criteria

- Landing page (logged-out) renders the new preview between Hero and "How It Works."
- Dropdown lists all 6 public projects by name and switches the rendered project on change.
- Selected project shows: header card, stats row, documents list, insight rail (with all 5 entity types as collapsible groups), and the interactive graph.
- Graph keeps its current behavior: click node → side panel on desktop, tap → expand on mobile.
- No "Loading example project graph…" placeholder visible to unauthenticated visitors after first paint.
- Authenticated dashboard render is unaffected (component is only mounted when `!isAuthenticated`).
- Both light and dark mode render correctly.
- Mobile breakpoint stacks gracefully; no horizontal overflow.
- `pnpm typecheck` + `pnpm lint` clean in `apps/web`.
- No new API routes added.
- Bundle size for unauth visitors does not regress by more than ~150KB (the graph chunk was already loaded eagerly under Fix 3).

## Out of scope for Phase 1

- Standalone shareable `/examples/[id]` route (Phase 2).
- Per-project OG meta tags / SEO (Phase 2).
- Linking insight-rail items to graph nodes / cross-highlighting (nice-to-have, defer).
- Editing affordances of any kind.
- Document content rendering (just titles + snippets — no full doc body).
- Translations / i18n.

## Open questions / decisions to make in-flight

1. **Default selected project:** "Project Hail Mary" (most universally recognizable creator-facing example) or random per visit? → **Default to "Project Hail Mary"** for predictable first-load. Visitor can switch.
2. **"Open in BuildOS" CTA destination:** `/auth/register` (signup-driver) vs. `/projects/[id]` (only works for authed users). → **`/auth/register?ref=example-{id}`** — drives signup, preserves intent for post-signup landing.
3. **Description placement:** in the header card, or as a subtitle above stats? → **In header card**, with `line-clamp-2` so long descriptions don't blow up the layout.

## Risks

- **OntologyGraph component is heavy** (cytoscape + layout). It currently lazy-loads via dynamic import. We need to keep that dynamic import to avoid blowing up bundle size — only the wrapper is eager; the graph engine itself can still chunk-split.
- **Public API may not include all needed fields** for some entity types. Verify on the first project load that all 5 entity types render with what `source` returns; if a field is missing (e.g. milestone state), surface gracefully (skip, don't crash).
- **Document tree is intentionally not in scope.** If visitors find the flat list underwhelming, that's a Phase 1.5 follow-up — don't bloat scope.

## Phase 2 preview (what's next, not now)

- New route file `apps/web/src/routes/examples/[slug]/+page.svelte` that mounts `PublicProjectView` with a fixed `projectId`.
- Slugs map: `hail-mary`, `apollo`, `manhattan`, `washington`, `asoiaf`, `acotar`.
- Per-project OG image generation (later).
- "Share this example" button on the landing embed that copies the URL.
- Sitemap entries for the 6 example pages.

Total Phase 2: ~1–2 days after Phase 1 lands.
