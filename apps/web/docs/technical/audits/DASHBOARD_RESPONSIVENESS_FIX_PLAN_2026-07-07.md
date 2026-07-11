<!-- apps/web/docs/technical/audits/DASHBOARD_RESPONSIVENESS_FIX_PLAN_2026-07-07.md -->

# Dashboard Responsiveness Fix Plan - 2026-07-07

## Context

The logged-in dashboard feels slow around clicks, modal opens, refreshes, and route changes. The first audit was a static/source audit because the available browser session was unauthenticated and rendered the public landing page on localhost and production. The issues below are therefore code-path findings, not browser timing measurements from a signed-in account.

## Primary Findings

1. Dashboard refresh is too broad. `apps/web/src/routes/+page.svelte` calls `invalidateAll()` from the dashboard refresh handler, which can rerun root layout auth, pending invites, billing, agent status, and dashboard analytics work.
2. The dashboard starts extra client fetches immediately after mount. `AnalyticsDashboard.svelte` loads the AI inbox count with `/api/inbox/count?status=pending&limit=5000`, and the backend path can reconcile/backfill and select broad inbox rows.
3. The overdue banner fetches project batches immediately whenever analytics reports overdue tasks, even though the initial analytics payload already has the overdue count needed to render the banner.
4. The daily brief area does sequential client work for timezone, today's brief, and ensure-today behavior.
5. Lazy modals avoid initial bundle cost, but the first click on daily brief chat, overdue triage, and dashboard inbox can still wait on chunk import plus data fetch.
6. Dashboard links mostly use normal anchors, so slow route loading can feel like the click did nothing until the next page commits.
7. Local dev responsiveness was affected by a stale Vite/HMR port conflict. Vite moved from 5173 to 5174, while the fixed HMR port `24678` was already in use.

## Phase 0 - Baseline Before Deeper Changes

Goal: capture repeatable timings before optimizing data contracts or backend logic.

- Use a signed-in browser session and record dashboard navigation, refresh, project-card click, dashboard inbox open, overdue triage open, and brief chat open.
- Capture Chrome performance traces or Playwright timings for time to first dashboard paint, click-to-route-commit, click-to-modal-visible, and dashboard network waterfall.
- Add temporary console timing only if traces are hard to capture in the authenticated session.

Exit criteria:

- We have at least one desktop timing pass and one mobile-width timing pass.
- The slowest requests and slowest click paths are identified by route/API name.

## Phase 1 - Quick Wins

Goal: improve perceived responsiveness and remove obviously unnecessary invalidation without changing the dashboard data model.

- Replace dashboard `invalidateAll()` refresh with targeted `invalidate('dashboard:analytics')`.
- Keep invite decline invalidation scoped to `app:invites`, and avoid broad invalidation after invite accept.
- Add immediate pending feedback for dashboard route links and `goto()` buttons so clicks acknowledge before route data finishes loading.
- Make the Vite HMR port configurable with `VITE_HMR_PORT=auto` to avoid stale local port conflicts.
- Keep all changes low risk and isolated to dashboard entry points and dev-server config.

Exit criteria:

- Refresh no longer reruns every root/layout loader.
- Dashboard cards, activity rows, chat rows, and major dashboard buttons show immediate pending feedback on primary clicks.
- Local dev can avoid fixed HMR port collisions without editing source.

Implementation log:

- 2026-07-07: Dashboard refresh now invalidates only `dashboard:analytics`.
- 2026-07-07: Invite accept no longer uses `invalidateAll`; it fires `app:invites` invalidation in parallel with project navigation.
- 2026-07-07: Dashboard cards, activity rows, chat rows, project buttons, and calendar navigation now set immediate pending feedback.
- 2026-07-07: `VITE_HMR_PORT=auto` can disable the fixed HMR port when local port `24678` is occupied.

## Phase 2 - Reduce Post-Mount Fetch Pressure

Goal: make initial dashboard load lighter after the page has rendered.

- Change the AI inbox count endpoint or dashboard call site so count work uses a cheap aggregate/count path instead of fetching up to 5000 rows.
- Defer overdue project-batch loading until the user expands or opens overdue triage, or load only a very small summary in the initial pass.
- Audit `DashboardBriefWidget.svelte` for sequential fetches and combine or parallelize where possible.
- Add abort controllers/request tokens to avoid stale post-mount fetches updating state after rapid navigation.

Exit criteria:

- The dashboard initial waterfall has fewer post-mount requests.
- The inbox count and overdue summary requests are bounded by cheap queries.

Implementation log:

- 2026-07-07: Inbox count now uses exact count queries against the inbox index plus a limited lightweight breakdown query instead of the full `listInboxItems` path.
- 2026-07-07: Dashboard inbox-count breakdown is capped at `limit=1000`; exact total remains uncapped by that breakdown limit.
- 2026-07-07: Dashboard mount no longer fetches overdue project-batch summaries immediately. Full overdue batches load when the triage modal opens.
- 2026-07-07: `DashboardBriefWidget` no longer performs a separate user-timezone Supabase lookup on mount; `ensure-today` remains the canonical timezone correction path.
- 2026-07-07: Dashboard inbox count, overdue batch refresh, and daily-brief fetches now guard against stale post-mount responses with abort controllers and/or request tokens.
- 2026-07-10: Shared inbox counts now default to the indexed inbox read model plus bounded lifecycle cleanup; source-table backfill is reserved for explicit `repair=full` recovery instead of every post-mount/realtime/visibility count.

## Phase 3 - Modal And Navigation Responsiveness

Goal: reduce click-to-visible latency on common interactions.

- Preload modal chunks on idle or pointer hover for likely next actions: inbox, overdue triage, and brief chat.
- Split modal open state from modal data loading so the shell appears immediately with an internal loading state.
- Add route-level pending indicators where global navigation currently feels silent.
- Check reduced-motion behavior for all new pending and loading states.

Exit criteria:

- First modal open feels immediate even if data is still loading.
- Route transitions have visible, consistent feedback.

Implementation log:

- 2026-07-07: Started Phase 3 by extracting reusable lazy modal loaders and preloading dashboard modal chunks on idle.
- 2026-07-07: Added hover/focus preloading for daily brief, AI inbox, and overdue triage actions so the likely next modal is warmed before click.
- 2026-07-07: Added pointer-down preloading for the same modal actions so touch users also warm lazy chunks before the click handler opens the modal.

## Phase 4 - Backend And Data Optimization

Goal: remove structural causes of slow dashboard requests.

- Profile `loadUserDashboardAnalytics()` and the root layout loaders for duplicated user/account/invite/billing work.
- Optimize inbox count and overdue-task queries with count-only SQL/RPC paths.
- Check indexes for dashboard-heavy predicates such as user ownership, project state, task due date/state, invite status, and inbox status.
- Consider splitting heavy dashboard analytics into cacheable or independently invalidated resources.

Exit criteria:

- Dashboard refresh is bounded to the data that changed.
- Slow backend paths have explainable query plans and index coverage.

Implementation log:

- 2026-07-07: Started Phase 4 by threading the onboarding project-visibility preflight actor id into `getUserDashboardAnalytics`, avoiding a duplicate `ensureActorId` call for onboarding users who already have projects.
- 2026-07-07: Finished Phase 4 backend/index pass with targeted dashboard indexes in `supabase/migrations/20260707010000_dashboard_responsiveness_indexes.sql` for pending inbox counts, open due tasks, and active chat-session activity ordering.
- 2026-07-10: AI Inbox's interactive list path now skips source backfill and per-row source reconciliation, while manual Refresh preserves full repair. Source payload tables and unique-project access checks hydrate concurrently.

## Phase 5 - Guardrails

Goal: keep the dashboard from regressing.

- Add lightweight performance marks around dashboard load, refresh, and modal open paths.
- Add one smoke or Playwright check that asserts dashboard interactions acknowledge quickly.
- Document acceptable request budgets for the logged-in dashboard.
- Re-run the signed-in baseline after each phase.

Exit criteria:

- Future dashboard regressions are visible during local testing or CI.
- The dashboard has a repeatable performance checklist.

Implementation log:

- 2026-07-07: Started Phase 5 with browser performance marks/measures for dashboard mount, refresh, daily brief modal open, brief chat modal open, dashboard inbox open, overdue triage open, and calendar navigation.
- 2026-07-07: Dashboard performance entries use the `buildos.dashboard.*` prefix so local traces and future smoke tests can filter dashboard-only timings.
- 2026-07-07: Finished the first Phase 5 guardrail by extracting the dashboard performance tracker into `src/lib/utils/dashboard-performance.ts`, adding budget constants, and covering the mark/measure contract with `src/lib/utils/dashboard-performance.test.ts`.
- 2026-07-10: Inbox list/count backend phases now emit Server Timing entries for indexed reads, lifecycle cleanup, hydration, contexts, projects, and opt-in repair work.
- 2026-07-10: Navigation, Dashboard, and Today now emit `buildos.ai_inbox.open_to_data.<source>` from activation through the first rendered inbox data state, with an 800 ms initial budget and cancelled failure/abandon paths.

Current client-side budget targets:

- Dashboard mounted mark: observe during traces; investigate if first useful signed-in paint exceeds 1500 ms on a warm local run.
- Dashboard refresh: 1200 ms.
- Daily brief modal open: 350 ms.
- Brief chat modal open: 500 ms.
- Dashboard inbox modal open: 500 ms.
- Overdue triage modal open: 500 ms.
- Calendar route open acknowledgement: 1000 ms.

## Phase 6 - Signed-In Baseline And Regression Automation

Goal: move from source-level optimization to repeatable signed-in timing evidence.

- Run the dashboard with a signed-in account and capture the `buildos.dashboard.*` browser measures plus the `Server-Timing` header.
- Convert the manual timing pass into a browser smoke check once the repo has an authenticated browser-test harness.
- Compare the signed-in waterfall against the budget constants in `src/lib/utils/dashboard-performance.ts`.
- Only make deeper data-contract changes after the signed-in trace identifies the next slow path.

Implementation log:

- 2026-07-07: Started Phase 6 by centralizing dashboard budget names and limits in `src/lib/utils/dashboard-performance.ts`, so both manual traces and future browser automation share the same contract.

## Verification Notes

- Initial audit could not use a signed-in dashboard session, so Phase 0 remains required before backend/data-model changes.
- Phase 1 is intentionally safe to start immediately because it narrows invalidation and improves click acknowledgement without changing persisted data or server contracts.
- 2026-07-07: Focused inbox tests passed with `pnpm exec vitest run src/lib/server/inbox.service.test.ts src/routes/api/inbox/count/server.test.ts`.
- 2026-07-07: Full web check passed with `pnpm run check`.
- 2026-07-07: Focused route/inbox regression tests passed with `pnpm exec vitest run src/routes/__tests__/authenticated-pages.test.ts src/lib/server/inbox.service.test.ts src/routes/api/inbox/count/server.test.ts`.
- 2026-07-07: Full web check passed again with `pnpm run check` after Phase 3 completion and Phase 4 actor-id reuse.
- 2026-07-07: Focused route/inbox regression tests passed again after Phase 4 indexes and Phase 5 marks with `pnpm exec vitest run src/routes/__tests__/authenticated-pages.test.ts src/lib/server/inbox.service.test.ts src/routes/api/inbox/count/server.test.ts`.
- 2026-07-07: Full web check passed with `pnpm run check` after Phase 5 instrumentation.
- 2026-07-07: Scoped whitespace checks passed for dashboard-touched files; the dashboard migration timestamp was moved to `20260707010000` to avoid colliding with the existing `20260707000000_history_page_perf_rpc.sql` migration.
- 2026-07-07: Phase 5 tracker guardrail passed with `pnpm exec vitest run src/lib/utils/dashboard-performance.test.ts`.
- 2026-07-07: Expanded focused dashboard suite passed with `pnpm exec vitest run src/lib/utils/dashboard-performance.test.ts src/routes/__tests__/authenticated-pages.test.ts src/lib/server/inbox.service.test.ts src/routes/api/inbox/count/server.test.ts`.
- 2026-07-07: Full web check passed with `pnpm run check` after finishing Phase 5 and starting Phase 6 budget centralization.
- 2026-07-07: Post-Phase 5 bug pass found no dashboard-performance defects in the tracker, call sites, abort guards, or modal preload paths.
- 2026-07-07: Re-ran the expanded focused dashboard suite; 23 tests passed with `pnpm exec vitest run src/lib/utils/dashboard-performance.test.ts src/routes/__tests__/authenticated-pages.test.ts src/lib/server/inbox.service.test.ts src/routes/api/inbox/count/server.test.ts`.
- 2026-07-07: Re-ran full web check; `pnpm run check` passed with 0 errors and 0 warnings.
