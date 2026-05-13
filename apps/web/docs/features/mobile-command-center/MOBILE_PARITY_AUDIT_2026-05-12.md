<!-- apps/web/docs/features/mobile-command-center/MOBILE_PARITY_AUDIT_2026-05-12.md -->

# Project Detail — Mobile Parity Audit (2026-05-12)

Snapshot of how the `/projects/[id]` mobile experience compares to the v2 desktop redesign that landed May 8–9, 2026, plus the prioritized fix list.

## Source files

- Page: `apps/web/src/routes/projects/[id]/+page.svelte`
- v2 components (`apps/web/src/lib/components/project/v2/`)
    - `PulseStrip.svelte` — shared mobile + desktop
    - `EntityTabStrip.svelte` — shared mobile + desktop
    - `TaskKanbanBoard.svelte` — desktop only
    - `MobileTaskBoard.svelte` — mobile only (added 2026-05-12)
- Docs section: `apps/web/src/lib/components/project/ProjectDocumentsSection.svelte` (shared mobile + desktop)
- Legacy component still used by `/projects/[id]/old`: `MobileCommandCenter.svelte`

## What rendered before the audit (snapshot for context)

### Mobile (`< sm`)

1. Two action tiles: Recent Chats, Events
2. `MobileCommandCenter` rows: Goals → Tasks+Plans → Risks+Documents → Events
3. `ProjectHistorySection` (compact)

### Desktop (`sm+`)

1. `PulseStrip` — Recently Done + Up Next (side-by-side at `md+`)
2. `EntityTabStrip` — pill tabs for Briefs · Chats · Graph · Goals · Milestones · Plans · Risks · Events
3. `TaskKanbanBoard` — 7-column kanban: Backlog · In Progress · Scheduled · Overdue · Blocked · Done · Archived
4. `ProjectDocumentsSection` — new `DocTreeView`

## What renders now (post-audit)

`PulseStrip`, `EntityTabStrip`, and `ProjectDocumentsSection` are each rendered once and shared across viewports (CSS-toggled internally where layouts differ). Each viewport gets one tasks surface tailored to it.

### Mobile (`< sm`)

1. `PulseStrip` — segmented Recent / Up next tabs in a single card
2. `EntityTabStrip` — full pill row (Briefs · Chats · Graph · Goals · Milestones · Plans · Risks · Events), wraps onto multiple rows; expandable pills open inline, action pills (Chats, Events) open modals
3. `MobileTaskBoard` — full-width collapsible Tasks card with horizontal status-tab strip (Overdue · In progress · Scheduled · Blocked · Backlog · Done · Archived). Default tab: In progress. Default expanded.
4. `ProjectDocumentsSection` — shared with desktop

### Desktop (`sm+`)

1. `PulseStrip` — Recently Done + Up Next side-by-side at `md+`
2. `EntityTabStrip` — same shared instance as mobile
3. `TaskKanbanBoard` — 7-column kanban with drag-and-drop
4. `ProjectDocumentsSection` — shared with mobile

### Retired

- `MobileCommandCenter` is no longer rendered by the new project page. Only the legacy `/projects/[id]/old` route still references it.
- The two top-of-page mobile action tiles (Recent Chats, Events) are gone — their functions are covered by the equivalent action pills in `EntityTabStrip`.
- `ProjectHistorySection` is gone from mobile — PulseStrip's Recent tab covers the activity-log signal.
- `CommandCenterDocumentsPanel.svelte` deleted (was orphaned after Tier 3).

## Gaps (snapshot at audit time — all resolved)

The table below is the original audit. Every row has been addressed by one of the tiers below; see the Fix plan and Progress log sections.

| #   | Gap                                                  | Severity | Notes                                                                                                                                                           |
| --- | ---------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No PulseStrip on mobile                              | **High** | "Recently done" + "Up next" is the highest-value daily-driver pane on desktop. Mobile gets zero of this signal.                                                 |
| 2   | No Briefs entry point on mobile                      | **High** | Briefs are only reachable through `EntityTabStrip` on desktop. Regression vs. v1.                                                                               |
| 3   | No Graph access on mobile                            | Medium   | Same reason — only inside `EntityTabStrip`.                                                                                                                     |
| 4   | No slip-detection for tasks                          | Medium   | `MobileCommandCenter` shows a flat task list. Overdue tasks read identically to fresh todos. Desktop kanban has dedicated Overdue + Scheduled buckets.          |
| 5   | No standalone Milestones panel                       | Medium   | Mobile explicitly removed Milestones as a top-level panel (`MobileCommandCenter.svelte:38`). Desktop keeps both nested-in-goals AND a top-level Milestones tab. |
| 6   | Documents component split                            | Medium   | Desktop uses `ProjectDocumentsSection` (new `DocTreeView`). Mobile still uses `CommandCenterDocumentsPanel`. The new one is already `sm:`-responsive.           |
| 7   | Activity surfaced via legacy `ProjectHistorySection` | Low      | Desktop replaced this with PulseStrip's "Recently done" — a more action-oriented view of the same log.                                                          |
| 8   | IA duplication on mobile                             | Low      | Events appears as both a top tile and inside `MobileCommandCenter` row 4. `EntityTabStrip` collapsed this on desktop.                                           |

## Fix plan

Tiered by ROI. Each tier should be shippable on its own.

### Tier 1 — Close the daily-driver gap

- [x] **Mobile PulseStrip** — `PulseStrip` now renders two layouts CSS-toggled by viewport: a segmented `Up next` / `Recent` tab card on mobile, and the existing two-column board at `sm+`. Page hoists `PulseStrip` above both mobile/desktop branches so it renders once. Default mobile tab is "Up next" because that's the actionable view when opening a project on a phone. (Shipped 2026-05-12.)

### Tier 2 — Restore missing entry points

- [x] **Briefs on mobile** — `EntityTabStrip` gained a `visibleTabs` whitelist prop. Page renders a slim mobile-only `EntityTabStrip` below `PulseStrip` with `visibleTabs={['briefs', 'graph']}`. Pills expand in place. (Shipped 2026-05-12.)
- [x] **Graph on mobile** — included in the same mobile `EntityTabStrip` instance. Graph view inherits its responsive `ProjectGraphSection` controls. (Shipped 2026-05-12.)

### Tier 3 — Unify tasks & docs

- [x] **Mobile task slip-detection** — new `MobileTaskBoard` component. Single Tasks card with a horizontally-scrollable status-tab strip under the header (Overdue · In progress · Scheduled · Blocked · Backlog · Done · Archived). Default selected tab is "In progress" (right at-a-glance view on mobile). Tab strip shows per-status counts so slipping work is visible even when the tab isn't selected; Overdue gets a rose-tinted count chip when populated. Same bucketing rules as `TaskKanbanBoard`. No drag (touch can't trigger HTML5 drag); tap a card → opens edit modal. Archived lazy-loads on first selection of its tab. (Shipped 2026-05-12.)
- [x] **Documents** — `ProjectDocumentsSection` is now hoisted out of both viewport branches and renders once at the bottom of the page on mobile and desktop. `CommandCenterDocumentsPanel` removed from `MobileCommandCenter`. (Shipped 2026-05-12.)
- [x] **Standalone Milestones** — added `'milestones'` to the mobile `EntityTabStrip` `visibleTabs` whitelist. Now shows Briefs · Graph · Milestones. (Shipped 2026-05-12.)
- [x] **Trim `MobileCommandCenter`** — removed Tasks + Documents panels. New row layout: Goals → Plans+Risks → Events. Unused props pruned from both `+page.svelte` callers (new + classic). (Shipped 2026-05-12.)
- [x] **Drop `ProjectHistorySection` on mobile** — PulseStrip's "Recent" tab covers the activity-log signal, so the legacy history pane was removed entirely from the mobile branch. (Shipped 2026-05-12.)

### Tier 4 — Polish

- [x] **Dedupe Events / Chats entry points** — mobile action tiles removed. `EntityTabStrip` is now the single nav surface for Chats and Events (action pills open the same modals). (Shipped 2026-05-12.)
- [x] **Retire `MobileCommandCenter` on the new page** — `EntityTabStrip` now covers Goals/Milestones/Plans/Risks/Events on mobile via its wrapping pill row. The component file is kept for the legacy `/projects/[id]/old` route, but `+page.svelte` no longer imports or renders it. (Shipped 2026-05-12.)
- [x] **Delete orphaned `CommandCenterDocumentsPanel.svelte`** — file removed; zero remaining references. (Shipped 2026-05-12.)

## Progress log

- **2026-05-12** — Audit written.
- **2026-05-12** — Tier 1 shipped: mobile-optimized PulseStrip (segmented tabs, "Up next" default), hoisted above mobile + desktop branches in `projects/[id]/+page.svelte`. PulseStrip tests updated to use `getAllByText` since both layouts now co-exist in the DOM.
- **2026-05-12** — Tier 2 shipped: `EntityTabStrip` gained a `visibleTabs` whitelist prop; mobile now renders a slim instance with `['briefs', 'graph']` below PulseStrip. Briefs + Graph are reachable on mobile again. Pills expand inline (no modal redirect).
- **2026-05-12** — Tier 3 shipped: new `MobileTaskBoard` with bucketed slip-detection (Overdue auto-hides when empty). Mobile EntityTabStrip whitelist extended to include `milestones`. `ProjectDocumentsSection` hoisted out of viewport branches → single instance for both. `MobileCommandCenter` trimmed (Tasks + Documents removed, restructured to Goals / Plans+Risks / Events). `ProjectHistorySection` dropped from mobile since PulseStrip "Recent" covers it. Classic view (`/projects/[id]/old`) caller updated to match the slimmer `MobileCommandCenter` prop surface.
- **2026-05-12** — `MobileTaskBoard` redesigned: switched from vertical-stacked collapsible sections to a single full-width Tasks card with a horizontal status-tab strip under the header (default tab: In progress). Tab strip uses a dedicated `overflow-x-auto` scroll viewport around a `w-max min-w-full` flex strip so the seven tabs scroll cleanly on touch. Header is now click-to-toggle (collapsible) with a rotating chevron; `+ New` stays separate. Mobile branch's stray `grid` class on the wrapper was removed (implicit `auto` tracks were baking in min-content width and pushing the layout off-viewport).
- **2026-05-12** — Tier 4 shipped: `EntityTabStrip` hoisted out of viewport branches → one shared instance for mobile + desktop. Mobile action tiles (Recent Chats, Events) removed since EntityTabStrip's action pills cover the same modals. `MobileCommandCenter` import + usage removed from new page (kept intact for `/old`). Orphaned `CommandCenterDocumentsPanel.svelte` deleted. Unused `MessagesSquare` + `CalendarClock` imports pruned. Final mobile layout: PulseStrip → EntityTabStrip → MobileTaskBoard → ProjectDocumentsSection.
