<!-- apps/web/docs/technical/audits/ROUTE_DATA_REACTIVITY_FIX_PLAN_2026-04-28.md -->

# Route Data Reactivity Fix Plan

Date: 2026-04-28

## Context

The audit found two Svelte 5 route-data risks:

- `apps/web/src/routes/projects/[id]/+page.svelte` initializes large local state from `data` once.
- `apps/web/src/routes/projects/[id]/tasks/[task_id]/+page.svelte` initializes task detail state from `data` once.

SvelteKit can reuse a route component instance when route params change or data is invalidated. `$state(data...)` initializers only run once, so reused instances can show stale project/task data unless the component explicitly handles incoming `data` changes.

## Status

- Task detail page: fixed on 2026-04-28. It now uses derived route data with local refresh overrides, resets route-scoped workspace/modal state when the project/task key changes, and guards async workspace/refresh updates from stale route responses.
- Project page: still outstanding.

## Completed Task Page Strategy

The task detail page had the smaller state surface and was fixed first.

For `projects/[id]/tasks/[task_id]/+page.svelte`:

1. Add a route key based on `data.project.id` and `data.task.id`.
2. Keep route-owned values reactive by deriving them from `data` unless a local refresh override exists:
    - `project`
    - `task`
    - `plans`
    - `goals`
    - `documents`
    - `milestones`
    - `projectTasks`
3. Reset route-scoped UI state that cannot safely carry across tasks:
    - save/delete errors
    - delete confirmation
    - workspace loaded state and selected workspace document
    - autosave timer and unsaved workspace content
4. Preserve view preferences and panel expansion state unless the UX intentionally wants a full reset.
5. Guard async workspace and refresh responses so a stale response cannot repopulate the page after route navigation.

Implemented shape:

```ts
const project = $derived(projectOverride ?? data.project);
const task = $derived(taskOverride ?? data.task);

$effect(() => {
	const nextKey = `${data.project?.id ?? ''}:${data.task?.id ?? ''}`;
	if (nextKey === lastRouteDataKey) return;
	lastRouteDataKey = nextKey;

	untrack(() => {
		resetRouteDataOverrides();
		resetRouteScopedState();
	});
});
```

## Project Page Strategy

The project page should be handled more deliberately because it mixes server data, skeleton hydration, optimistic updates, modal state, document tree state, filters, graph preferences, and panel expansion.

Use one of these approaches:

### Option A: Keyed Child Component

Create a lightweight route wrapper that passes `data` into a keyed project page body:

```svelte
{#key data.projectId}
	<ProjectPageBody {data} />
{/key}
```

This is the safest route-param fix because Svelte fully remounts state when the project id changes. It avoids accidentally preserving the previous project's local state.

Tradeoff: this requires moving the current page body into a component, so the patch is larger.

### Option B: Route-Keyed Reinitializer

Keep the single page file, but add an explicit project-key effect:

1. Track `lastProjectDataKey`, usually `data.projectId`.
2. When it changes, replace all server-owned entity collections:
    - `project`
    - `tasks`
    - `documents`
    - `images`
    - `plans`
    - `goals`
    - `milestones`
    - `risks`
    - `events`
    - `contextDocument`
    - `publicPageCounts`
    - `currentProjectActorId`
3. Rebuild document tree seed from the incoming data.
4. Reset route-scoped modal state and selected entity ids.
5. Reset hydration state from the new route data.
6. Preserve purely user-level display preferences:
    - graph hidden preference
    - panel expansion if desired
    - task filters only if they are not entity-id-specific

Avoid a broad effect that syncs on every `data` change. It can overwrite optimistic edits after mutations and cause hard-to-debug UI jumps.

## Verification Plan

For both pages:

1. Run `pnpm --filter=@buildos/web check`.
2. Add or update a Svelte/component test that mounts with one `data` object, rerenders with another route key, and asserts the rendered ids/names update.
3. Manually navigate:
    - project A to project B
    - task A to task B within the same project
    - task A to task in another project
4. Check that open modals and autosave state do not leak across route changes.

## Priority

1. Fix task detail page first.
2. Fix project page with the keyed child component if time allows.
3. If the keyed extraction is too large, use the route-keyed reinitializer as an interim fix.
