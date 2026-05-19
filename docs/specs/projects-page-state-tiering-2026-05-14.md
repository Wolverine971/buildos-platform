<!-- docs/specs/projects-page-state-tiering-2026-05-14.md -->

# Projects Page State Tiering Spec

Date: 2026-05-14

## Implementation Progress

Started: 2026-05-14

**Decisions locked in:**

- Section order: **Current Work (Planning + Active merged)** → Completed → Cancelled → Paused
- Planning and Active render as one combined "Current Work" section, mixed by `updated_at desc`; each row's state chip distinguishes Planning vs Active
- Recency separators (7d / 30d) apply to the combined Current Work section; secondary tiers stay flat
- Shared projects: inline `Shared: editor` / `Shared: viewer` chip on rows; new Owned / Shared / All ownership filter; no top-level `SHARED WITH ME` group
- Secondary tiers collapse by default when count > 3

**Chunks:**

- [x]   1. Canonical state config (`apps/web/src/lib/config/project-states.ts`)
- [x]   2. `ProjectStateChip.svelte` (`apps/web/src/lib/components/projects/ProjectStateChip.svelte`)
- [x]   3. `ProjectStateRow.svelte` (`apps/web/src/lib/components/projects/ProjectStateRow.svelte`)
- [x]   4. `CollapsibleStateSection.svelte` (`apps/web/src/lib/components/projects/CollapsibleStateSection.svelte`)
- [x]   5. Refactor `/projects/+page.svelte` to tiered state view (1528 → 1089 lines; svelte-check clean)
- [x]   6. Tests for the project-states config helpers (`apps/web/src/lib/config/project-states.test.ts`, 12 tests passing)
- [x]   7. `pnpm check` clean (0 errors / 0 warnings) and `pnpm lint` reports no issues in any file touched by this change. Pre-existing repo-wide warnings and the unrelated `guardrails:server-routes` failure are untouched.

**Completed: 2026-05-14**

**Files added:**

- `apps/web/src/lib/config/project-states.ts`
- `apps/web/src/lib/config/project-states.test.ts`
- `apps/web/src/lib/components/projects/ProjectStateChip.svelte`
- `apps/web/src/lib/components/projects/ProjectStateRow.svelte`
- `apps/web/src/lib/components/projects/CollapsibleStateSection.svelte`

**Files modified:**

- `apps/web/src/routes/projects/+page.svelte` (1528 → 1089 → 1163 lines after Current Work merge)

**Revision 2026-05-14a:** Planning and Active merged into one "Current Work" section per user direction. Previously rendered as two stacked primary tiers; now mixed by `updated_at` with the state chip distinguishing them. Empty-state copy added when both Planning and Active are empty but filters/secondary tiers have results.

**Revision 2026-05-14b (review polish):**

- Status count strip now ignores the active state filter so users can see counts in other states and quick-switch between them. Achieved by splitting `filteredProjects` into `projectsMatchingNonStateFilters` (search + ownership + facets) and `filteredProjects` (the prior list + state filter applied). `stateCounts` is now derived from `projectsMatchingNonStateFilters`.
- "No current work" empty block is suppressed when the user has explicitly filtered to a secondary state (e.g. clicking `Completed` in the strip) — gated by a new `primaryFilterActive` derived value.
- `pnpm check` still 0 / 0, 12 / 12 tests still pass, no lint regressions in any file touched by this change.

## Purpose

Make `/projects` easier to scan by organizing projects by lifecycle state first. Planning and active projects should dominate the page because they represent current work. Cancelled, completed, and paused projects should remain available, but should not compete visually with current work.

## Current State

The current `/projects` page is organized primarily by ownership and recency:

- `MY PROJECTS`
- `SHARED WITH ME`
- `PAUSED`

This creates several problems:

- Project state is not visible on most project rows.
- `planning`, `active`, `completed`, and `cancelled` projects can be mixed together in the main sections.
- `activeFilteredProjects` only removes `paused`, so completed and cancelled projects still count as active-page inventory.
- Paused projects are separated, but cancelled and completed projects are not.
- The state filter is available, but it is secondary and uses raw available states rather than a clear lifecycle view.
- Recency separators compete with lifecycle status, even though state is the stronger organizing signal.

The dashboard is closer to the desired behavior:

- It derives `activeProjects` from `analytics.recent.projects`.
- It treats `completed`, `cancelled`, `archived`, and `paused` as terminal or inactive.
- It mostly shows active work by default and only falls back to recent projects if there are no active projects.

## Product Goals

- Make the status of every project obvious.
- Put `planning` and `active` projects first.
- Keep inactive projects accessible without letting them dominate the page.
- Make shared ownership visible inside each state tier rather than using ownership as the top-level grouping.
- Keep search and filters working across all tiers.
- Keep dashboard behavior focused on active work.

## Non-Goals

- No ranking system yet.
- No new backend tables or columns.
- No separate pause workflow.
- No calendar side effects from project status changes.
- No change to project detail behavior beyond reflecting the selected status.

## Proposed Page Structure

Replace the current ownership-first grouping with state-first sections in this order:

1. Planning
2. Active
3. Cancelled
4. Completed
5. Paused

Planning and Active are primary tiers. They should be expanded by default and visually strongest.

Cancelled, Completed, and Paused are secondary tiers. They should appear below the primary tiers with lower visual weight. If there are many projects, make these sections collapsible by default.

## State Definitions

Use a canonical state config in `apps/web/src/routes/projects/+page.svelte` or extract it to a small helper if reused:

```ts
const PROJECT_STATE_ORDER = ['planning', 'active', 'cancelled', 'completed', 'paused'] as const;

const PROJECT_STATE_META = {
	planning: {
		label: 'Planning',
		tier: 'primary',
		description: 'Projects being shaped before execution.'
	},
	active: {
		label: 'Active',
		tier: 'primary',
		description: 'Projects currently in motion.'
	},
	cancelled: {
		label: 'Cancelled',
		tier: 'secondary',
		description: 'Stopped projects kept for reference.'
	},
	completed: {
		label: 'Completed',
		tier: 'secondary',
		description: 'Finished projects kept for history.'
	},
	paused: {
		label: 'Paused',
		tier: 'secondary',
		description: 'Temporarily shelved projects hidden from active work.'
	}
} as const;
```

## Row Design

Every project row should include:

- Project icon
- Project name
- State chip
- Shared chip when applicable
- Updated timestamp
- Description
- Entity counts: tasks, goals, plans, docs
- Optional next-step preview if available

State chips should use restrained semantic styling:

- Planning: accent or warning-tinted chip
- Active: success-tinted chip
- Cancelled: destructive-muted chip
- Completed: success-muted or neutral-success chip
- Paused: muted/neutral chip

Avoid making the whole page visually noisy. The chip should carry the state signal; the row should stay readable.

## Section Behavior

Each state section should:

- Show the state label and count.
- Show a short helper line only when useful.
- Sort rows by `updated_at` descending.
- Hide the section if it has zero projects and no state filter is active.
- Show an empty-state message when the user explicitly filters to a state with no results.

Primary tiers:

- Planning and Active should always render before inactive tiers.
- If both are empty, show a clear current-work empty state and then show inactive tiers below.

Secondary tiers:

- Cancelled, Completed, and Paused should be visually quieter.
- Consider default-collapsing each secondary tier when count is above a small threshold, e.g. `> 3`.
- Counts should remain visible even when collapsed.

## Ownership Handling

Do not use `MY PROJECTS` and `SHARED WITH ME` as top-level sections in the new view.

Instead:

- Include shared projects in their correct state tier.
- Show a `Shared` chip on shared rows.
- Include access role in the chip when useful, e.g. `Shared: editor`.
- Optional future enhancement: add an ownership filter, but do not make it a top-level grouping.

## Stats

The current stats should stop counting inactive projects as active-page inventory.

Recommended stats:

- Current work: `planning + active`
- Planning
- Active
- Inactive: `cancelled + completed + paused`

If keeping the existing four-card layout:

- Projects -> current work count
- Tasks -> tasks for planning + active projects
- Docs -> docs for planning + active projects
- Active -> active project count

Add a compact status count strip near filters:

`Planning 6 · Active 8 · Cancelled 2 · Completed 4 · Paused 5`

This gives the user a full inventory without making inactive work dominant.

## Search And Filters

Search should continue to search all projects.

State filters should use canonical state ordering:

1. Planning
2. Active
3. Cancelled
4. Completed
5. Paused

When a state filter is selected:

- Only matching sections should render.
- Section order should still follow canonical state order.
- Counts should reflect the filtered search result.

Optional but useful:

- Support `?state=planning`, `?state=active`, etc.
- Dashboard links can use `/projects?state=active` or `/projects?state=planning`.
- The status count strip should act as quick filters.

## Dashboard Alignment

Dashboard should remain focused on current work.

No major dashboard layout change is required right now because it already filters active-facing projects well.

Expected dashboard behavior:

- Main project section should show `planning` and `active` projects.
- It should not show `paused`, `completed`, or `cancelled` projects unless it is in fallback mode.
- If fallback mode displays inactive projects, each inactive row must show its state chip.
- The `All projects` link should take the user to `/projects`, where the full tiered view is available.

Implementation note:

- Confirm `isActiveProjectState` treats `planning` and `active` as active-facing.
- Confirm `paused`, `completed`, and `cancelled` are inactive.
- This is already mostly true in `AnalyticsDashboard.svelte` and `user-dashboard-analytics.service.ts`.

## Implementation Plan

1. Add canonical project state metadata.
2. Replace `activeFilteredProjects` and `pausedFilteredProjects` with a grouped state model:

```ts
const projectsByState = $derived.by(() => {
	const groups = new Map<ProjectState, OntologyProjectSummary[]>();
	for (const state of PROJECT_STATE_ORDER) groups.set(state, []);
	for (const project of filteredProjects) {
		const state = PROJECT_STATE_ORDER.includes(project.state_key as ProjectState)
			? (project.state_key as ProjectState)
			: 'planning';
		groups.get(state)?.push(project);
	}
	for (const projects of groups.values()) {
		projects.sort((a, b) => parseProjectUpdatedAt(b) - parseProjectUpdatedAt(a));
	}
	return groups;
});
```

3. Extract repeated project row markup into a local snippet or component:

```svelte
{#snippet projectRow(project, variant)}
	<!-- icon, title, state chip, shared chip, updated, description, counts -->
{/snippet}
```

4. Render sections from `PROJECT_STATE_ORDER`.
5. Style primary tiers more prominently than secondary tiers.
6. Replace recency separators with updated timestamps and optional stale chips.
7. Update stats to use planning + active as current work.
8. Keep graph view unchanged.
9. Add tests for grouping, counts, and state visibility if the project page has existing test coverage; otherwise add focused helper tests if grouping is extracted.

## Acceptance Criteria

- Every visible project row shows its state.
- Planning projects appear before active projects.
- Active projects appear before cancelled, completed, and paused projects.
- Cancelled, completed, and paused projects do not appear in primary current-work sections.
- Shared projects appear inside the correct state section with a shared chip.
- Search still works across all projects.
- State filters render sections in canonical order.
- Stats represent current work, not all historical projects.
- Dashboard continues to show active-facing projects by default.

## Open Questions

- Should `cancelled` come before `completed` permanently? This spec follows the requested order.
- Should secondary tiers be collapsed by default always, or only when they exceed a count threshold?
- Should `planning` projects count as active-facing everywhere in dashboard analytics? Current behavior effectively does this unless a backend RPC overrides it.
