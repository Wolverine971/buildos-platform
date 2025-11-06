# BuildOS Web Audit (2025-11-06)

## TL;DR

- Ontology pages lean on REST round-trips to our own API and scattered Supabase calls, creating avoidable latency and duplicating logic.
- The admin dashboard ships an entirely client-driven analytics fetch that fans out to 14 endpoints on every refresh without cancellation or caching.
- Agent chat remains gated behind `dev` builds, with unfinished wiring and long-lived services that never dispose, so the flow is effectively dormant.

## Remediation Progress (2025-11-06)

- Done: Centralized common gradient patterns into reusable utilities (`gradient-icon-primary`, `gradient-card-primary`, `gradient-glow-primary`) and refactored AgentChat/ChatModal to consume them, replacing the hand-authored 150+ character Tailwind strings.
- Done: Wrapped AgentChat debug logging in `if (dev) console.debug` so non-error noise stays out of production consoles while keeping local diagnostics available.
- Done: Normalized admin subscription metrics so RPC responses (arrays/strings/nulls) coerce into numbers, preventing dashboard crashes from `.toFixed` on undefined.
- Next: Continue migrating marketing/onboarding surfaces to the shared gradient utilities as those layouts are refreshed.

## Priority Findings

### 1. Server loads double-hop through REST instead of shared data access

- `apps/web/src/routes/ontology/+page.server.ts:32` and `apps/web/src/routes/ontology/create/+page.server.ts:26` fetch `/api/onto/*` over HTTP from the server load. This bypasses Supabase typing, costs an extra request, and makes it harder to surface precise error states.
- Recommendation: move shared data loaders into a service that both the API route and `load` call. Inject Supabase directly inside the load function to avoid the extra hop and simplify error handling.
- **Status:** Done - Implemented shared services (e.g., `ontology-projects.service.ts`, `ontology-template-catalog.service.ts`) and updated both server loads and API routes to consume them directly.

### 2. Projects API issues N+1 queries for counts

- `apps/web/src/routes/api/onto/projects/+server.ts:57-78` counts tasks and outputs per project inside `Promise.all`, so a team with 40 projects triggers 80 additional Supabase round-trips every dashboard view.
- Recommendation: project the aggregated counts server-side (`select(*, tasks:count(*))` or `rpc` returning totals) or pre-compute in a materialized view. Cache actor id lookups so `ensure_actor_for_user` is not executed on every request.
- **Status:** Done - Project and dashboard now reuse `fetchProjectSummaries`, which aggregates counts in a single Supabase query.

### 3. Admin analytics fan-out on the client

- `apps/web/src/routes/admin/+page.svelte:205-265` calls 14 endpoints per refresh from the browser and re-runs the whole set whenever the timeframe changes or auto-refresh is toggled (`setInterval(loadAnalytics, 30000)` at line 200). There is no `AbortController`, so slow responses race with new ones, and first paint is empty because nothing is rendered during SSR.
- Recommendation: shift the initial fetch into a server `load`, expose a consolidated analytics endpoint for the heavy metrics, and wire an abort/cancel guard for overlapping requests. Also remove the unused `refreshInterval` state (`apps/web/src/routes/admin/+page.svelte:40`).
- **Status:** Done - Added `dashboard-analytics.service.ts`, `/api/admin/analytics/dashboard`, SSR hydration, and abort-aware refreshing in `admin/+page.svelte`.

### 4. Agent chat modal hidden in production & context wiring unfinished

- Navigation still guards the modal with `{#if showChatModal && dev}` (`apps/web/src/lib/components/layout/Navigation.svelte:864`), so end users never see it. There is also a lingering `// TODO: Pass projectId and chatType` at line 233.
- Recommendation: lift the gating to a feature flag or remove it entirely once ready. Complete the context plumbing so `project`/`task` routes pass identifiers to the modal.

### 5. Agent chat retains resources after close

- `voiceRecordingService.initialize` is invoked inside `onMount` without a matching teardown (`apps/web/src/lib/components/agent/AgentChatModal.svelte:333-364`), so microphone streams and listeners persist after the modal is destroyed.
- `SSEProcessor.processStream` (`apps/web/src/lib/utils/sse-processor.ts:44-92`) never exposes a cancellation hook, so closing the modal mid-stream cannot terminate the fetch.
- Recommendation: implement `onDestroy` to call a `voiceRecordingService.destroy()` (adding that method if missing) and pass an `AbortController` through to `SSEProcessor`.

### 6. User-visible copy shows replacement characters

- Strings such as ``addActivityMessage(`?? Generated executor instructions`)`` and ``addActivityMessage(`� Step ${data.step?.stepNumber} complete`)`` (`apps/web/src/lib/components/agent/AgentChatModal.svelte:712` and `:770`) render as literal question marks. Comments like `// ? Extract from ApiResponse.data wrapper` (`apps/web/src/routes/ontology/+page.server.ts:48` and `ontology/create/+page.server.ts:42`) have the same encoding artifact.
- Recommendation: replace these placeholders with actual icons (Lucide components or Tailwind badge styles) and clean the comments to avoid confusing glyphs.
- **Status:** Done - Normalized the affected messages/comments in AgentChat, ontology routes, and related markdown content.

## Additional Observations

### Performance & responsiveness

- `OntologyGraph.svelte` rebuilds and re-layouts the entire Cytoscape instance on every data change (`apps/web/src/lib/components/ontology/graph/OntologyGraph.svelte:296-301`). For large ontologies this is expensive; consider diffing nodes/edges or memoizing layout per mode.
- The dashboard `filteredProjects` path in `+page.svelte` sorts and filters derived arrays on every reactive change. Memoize the available facets or pre-compute them server-side if project counts grow.
- Admin analytics fetches large unbounded datasets (e.g., brain dumps and project updates) just to compute top lists. Tighten the Supabase selects (`limit`, `select count(*)`) before returning to the client.

### Styling & Tailwind hygiene

- Agent chat ships a 200+ line `:global(.agent-markdown ...)` block (`apps/web/src/lib/components/agent/AgentChatModal.svelte:1440-1660`) that reimplements what `@tailwindcss/typography` already gives via `prose` classes. Consolidating on Tailwind utilities would shrink CSS and make dark-mode handling consistent.
- **Status:** Done - Replaced the custom rules with Tailwind typography classes and removed the global stylesheet from AgentChatModal.

### Outdated or unused paths

- Agent chat still references the legacy `general` context inside `CONTEXT_DESCRIPTORS` with a note to "use global instead" (`apps/web/src/lib/components/agent/AgentChatModal.svelte:78-101`). If that mode is deprecated, remove it from the selector and backend routes.
- Verify whether all admin sub-route APIs (e.g., `/api/admin/errors`) have corresponding UI surfaces; the main dashboard currently fetches only the unresolved list.

### Cleanup opportunities

- Remove orphaned state like `refreshInterval` (`apps/web/src/routes/admin/+page.svelte:40`). Console logging noise is now gated behind `dev` checks and uses `console.debug` instead of `console.log`.
- Extract reusable Supabase helpers (facet loading, template grouping) into shared modules instead of duplicating across load functions.

## Suggested Next Steps

1. Refactor ontology data fetching to share Supabase queries between server load and API handlers, eliminating the REST loop and N+1 counts.
2. Redesign the admin analytics fetch: aggregate server-side, hydrate initial state during SSR, and add cancellation for interval refreshes.
3. Finish and ship the AgentChatModal flow by removing the `dev` guard, cleaning glyphs, and adding lifecycle cleanup.
4. Trim CSS by leaning on Tailwind typography utilities for markdown rendering and promote recurring Tailwind patterns to component-level variants.
5. Audit lingering legacy contexts/services (e.g., `general` chat context) and remove or isolate them behind explicit feature flags.
