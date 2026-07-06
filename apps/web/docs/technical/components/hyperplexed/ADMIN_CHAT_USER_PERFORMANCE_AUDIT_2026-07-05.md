<!-- apps/web/docs/technical/components/hyperplexed/ADMIN_CHAT_USER_PERFORMANCE_AUDIT_2026-07-05.md -->

# Admin Chat User Performance - Audit And Refactor Plan

> Route-level audit for `/admin/chat/users`, captured 2026-07-05.
>
> Scope:
>
> - `apps/web/src/routes/admin/chat/users/+page.svelte`
> - `apps/web/src/lib/server/admin-chat-user-analytics.ts`
> - `apps/web/src/routes/api/admin/chat/users/**/+server.ts`
>
> Method: static code and markup audit against the
> [Hyperplexed Design Playbook](./HYPERPLEXED_DESIGN_PLAYBOOK.md) and
> [Hyperplexed Fix Patterns](./HYPERPLEXED_FIX_PATTERNS.md), plus backend maintainability and privacy
> review.

## Current State

- `+page.svelte` was 2,698 lines at audit time, 2,677 lines after the first Phase 1 cleanup,
  2,013 lines after the first Phase 2 extraction pass, and 1,834 lines after the table/mobile-card
  extraction pass, 1,746 lines after the filter extraction pass, and 834 lines after the drawer
  extraction pass, and 712 lines after export-helper extraction.
- `ChatUserDetailDrawer.svelte` is 316 lines after extracting the 288-line redacted session timeline
  component, the 196-line entity changes component, the 78-line issue clusters component, and the
  47-line tools/errors component, the 35-line summary cards component, the 59-line comparison panel,
  the 33-line activity timeline, and the 202-line recent sessions list.
- `chat-user-export.ts` is 232 lines for pure CSV/JSON file builders and the thin browser download
  helper; `chat-user-export.test.ts` is 200 lines.
- `admin-chat-user-analytics.ts` was 3,013 lines at audit time, 3,096 lines after the first Phase 3
  redaction extraction, and 2,973 lines after query parser extraction. `redaction.ts` is 35 lines,
  `redaction.test.ts` is 30 lines, `query.ts` is 142 lines, and `query.test.ts` is 112 lines.
- The three route handlers are thin and consistent: admin gate, query parsing, service call,
  redaction assertion, response.
- Focused backend/API tests exist and pass:
  `./node_modules/.bin/vitest run src/lib/server/admin-chat-user-analytics/query.test.ts src/lib/server/admin-chat-user-analytics/redaction.test.ts src/lib/components/admin/chat-users/chat-user-export.test.ts src/lib/server/admin-chat-user-analytics.test.ts src/routes/api/admin/chat/users/server.test.ts`
  -> 5 files, 38 tests passed after Phase 3 query extraction.
- `NODE_OPTIONS='--max-old-space-size=8192' ./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`
  -> 0 errors and 0 warnings after Phase 3 query extraction.
- No Svelte/UI test exists for this page. Current frontend regressions would mostly be caught by
  manual QA or full `svelte-check`, not by focused page tests.
- The implementation spec for this feature is currently untracked, so this audit is a separate
  tracking artifact rather than an edit to that spec.

## Verdict

This surface is functionally useful and the route handlers are in good shape, but both the frontend
page and backend service are carrying too many concerns in one file.

The highest-risk file is not the Svelte route by itself. It is the backend analytics service because
it owns query loading, rollup math, redaction, detail payloads, and redacted session timeline logic in
one module. The UI then duplicates most response types locally and adds more derived product logic on
top. That makes future changes expensive because a developer has to understand the full stack before
making a small UI or metric change.

## Phase 1 Progress - 2026-07-05

Shipped:

- Route icons now import from `$lib/icons/lucide`.
- Repeated KPI/section/table label longhands now use `.micro-label` with local weight/color
  overrides.
- Skeleton loading states now include `motion-reduce:animate-none`.
- User-detail and redacted-session fetch URLs encode path segments.
- List, detail, and redacted-session requests now ignore stale responses and stale errors.
- Redacted session API requests now parse and pass `slow_threshold_ms`; the backend timeline severity
  uses the selected threshold instead of the hard-coded default.
- Added focused service/API coverage for redacted-session threshold propagation and timing severity.

Still open:

- Remaining component extraction, raw command control cleanup, shared DTO split, page-level UI tests,
  and live visual verification.

## Phase 2 Progress - 2026-07-05 to 2026-07-06

Shipped:

- Added `src/lib/components/admin/chat-users/chat-user-types.ts` for frontend DTO reuse.
- Added `src/lib/components/admin/chat-users/chat-user-ui.ts` for pure formatting, badge,
  comparison, issue-cluster, and entity-link helpers.
- Extracted `ChatUserKpiStrip.svelte`.
- Extracted `ChatUserLeaderboards.svelte`, including stronger focus-visible/touch-target styling for
  leaderboard row buttons.
- Extracted `ChatUsersTable.svelte`.
- Added `ChatUsersMobileCards.svelte` as the phone-width fallback for the wide users table. -> P12
- Extracted `ChatUserFilters.svelte`; search remains visible while secondary filters collapse behind
  a Filters button, with active chips for clearing individual filters. -> P7
- Extracted `ChatUserDetailDrawer.svelte`; the drilldown now has `role="dialog"`, `aria-modal`,
  labelled title/subtitle, Escape close, focus trap, focus restore, portal rendering, and body scroll
  lock, with background content marked inert while open. -> P13
- Extracted `ChatRedactedSessionTimeline.svelte` for the selected redacted-session summary, turn list,
  entity-change chips, and safe event timeline.
- Extracted `ChatEntityChanges.svelte` for entity-group selection, filtered safe entity refs, and
  session timeline shortcuts.
- Extracted `ChatIssueClusters.svelte` for grouped safe error summaries; its timeline shortcut now
  uses the shared `Button` primitive. -> P13
- Extracted `ChatToolsAndErrors.svelte` for the drawer's top tools and recent safe error summaries.
- Extracted `ChatUserSummaryCards.svelte` for the drawer's four summary KPI cards.
- Extracted `ChatUserComparisonPanel.svelte` for cohort-baseline metrics.
- Extracted `ChatUserActivityTimeline.svelte` for daily activity rows.
- Extracted `ChatUserSessionsList.svelte` for queue status, session badges, metrics, and project
  chips.
- Converted the recent-session timeline action to the shared `Button` primitive, added focus-visible
  treatment to session links, and encoded the full-session audit URL. -> P13
- Replaced repeated drawer alert-badge helper calls with a single derived value.
- Added `chat-user-export.ts` for pure users CSV, users JSON, and user-detail JSON file builders.
- Added `chat-user-export.test.ts` coverage for CSV escaping, nested user summary columns, filename
  sanitization, and detail JSON context.

Still open:

- Page-level UI tests and live visual verification.

## Phase 3 Progress - 2026-07-06

Shipped:

- Extracted the recursive forbidden-key privacy guard into
  `src/lib/server/admin-chat-user-analytics/redaction.ts`.
- Kept the existing `assertAdminChatUserAnalyticsRedacted` service export stable so API routes and
  existing tests do not need import changes.
- Added `redaction.test.ts` coverage for safe aggregate payloads, nested forbidden-key paths, and
  array-contained raw tool payloads.
- Extracted query parsing, bounded request defaults, sort allow-lists, and
  `DEFAULT_SLOW_THRESHOLD_MS` to `src/lib/server/admin-chat-user-analytics/query.ts`.
- Kept the existing parser exports stable from `admin-chat-user-analytics.ts` so API route imports do
  not need to change yet.
- Added `query.test.ts` coverage for list, detail, and redacted-session query parsing fallbacks and
  clamps.

Still open:

- Shared DTO split, row loaders, rollup core, detail builder, redacted-session builder, and broader
  backend module tests.

## Findings

### Tier 1 - cheap, high-impact fixes

- **Icon import path bypasses the repo convention.**
  The page imports directly from `lucide-svelte` instead of `$lib/icons/lucide.ts`
  (`+page.svelte:6-20`). This violates the BuildOS icon wrapper convention. -> P9
  Status: fixed in Phase 1.

- **Micro-label classes are repeated inline.**
  The route repeatedly uses `text-xs uppercase tracking-wide text-muted-foreground` for labels
  (`+page.svelte:1319`, `1524`, `1840`, and many later section headings). Replace these with
  `.micro-label` plus optional weight/color classes. -> P5
  Status: fixed for KPI, table, drawer, and section labels in Phase 1.

- **Some raw buttons and links bypass the Button primitive.**
  Sort headers, leaderboard rows, "Inspect timeline", entity group buttons, and inline audit links use
  raw controls with weaker focus/tap guarantees (`+page.svelte:1220`, `1529`, `2036`, `2451`,
  `2559`, `2670`). Route obvious commands through `Button`; if a control must stay raw, copy the
  primitive's focus-visible and 44px target contract. -> P13

- **Reduced-motion gating is incomplete.**
  Loading skeletons use `animate-pulse` without `motion-reduce:animate-none`
  (`+page.svelte:1675`, `1871`, `2136`). -> P11
  Status: fixed in Phase 1.

- **User ID is not encoded for user-detail fetches.**
  `loadRedactedSession` encodes both URL segments, but `loadUserDetail` interpolates `userId`
  directly (`+page.svelte:597`). Encode it for symmetry and defensive correctness. -> new P?
  Status: fixed in Phase 1.

- **Detail and session fetches can race.**
  `loadUsers` has a request-id guard, but `loadUserDetail` and `loadRedactedSession` do not
  (`+page.svelte:578`, `610`). Rapid drawer/session changes can let stale responses overwrite newer
  selections. Use request IDs or `AbortController`. -> new P?
  Status: fixed in Phase 1 with request IDs for list, detail, and redacted-session loads.

### Tier 2 - structural frontend issues

- **The table has no mobile card fallback.**
  The main table uses `overflow-x-auto` and `min-w-[1500px]` (`+page.svelte:1638-1639`). This is
  acceptable for a first desktop admin cut, but it fails the admin-console standard established in
  prior audits. Add a `md:hidden` user-card list and keep the table `hidden md:table`. -> P12
  Status: fixed in Phase 2 with `ChatUsersMobileCards.svelte`.

- **The filter bar is a permanent wall of controls.**
  The filters occupy a large always-visible grid (`+page.svelte:1380-1520`). Keep search visible,
  collapse secondary filters behind a "Filters" button, and show active chips below it. -> P7
  Status: fixed in Phase 2 with `ChatUserFilters.svelte`.

- **The backend returns seven leaderboards while the UI renders four.**
  The response type includes `most_requests_responses`, `most_created_entities`, and
  `most_error_impacted` (`+page.svelte:143-150`), and the backend builds them
  (`admin-chat-user-analytics.ts:1876-1893`), but the UI stops after Longest Threads
  (`+page.svelte:1522-1600`). Either render all seven or remove the unused fields from the contract.
  -> P8/new P?

- **The drawer is hand-rolled and lacks modal semantics.**
  The overlay and `<aside>` are rendered directly (`+page.svelte:1828-1837`) without an explicit
  dialog role, `aria-modal`, Escape handling, focus trap, focus restore, or inert outside content.
  Use an existing drawer/modal primitive or add the missing interaction contract. -> P13
  Status: fixed in Phase 2 with `ChatUserDetailDrawer.svelte`.

- **Alert badge and issue-cluster builders live in the route.**
  `buildUserAlertBadges`, `buildSessionAlertBadges`, `normalizeIssueMessage`, and
  `buildIssueClusters` (`+page.svelte:1031-1149`) are pure product logic and should be extracted and
  unit-tested. This is especially important because they summarize errors and drive escalation labels.
  -> new P?

- **Frontend types duplicate backend response types.**
  `UserMetric`, `SessionMetric`, `UsersResponse`, `UserDetail`, and `RedactedSession` are declared
  locally in the page (`+page.svelte:26-308`) while similar exported types live in the backend service
  (`admin-chat-user-analytics.ts:5-466`). Move shared API DTO types to a non-server module and import
  them from both sides. -> new P?

### Tier 3 - backend/service maintainability

- **`admin-chat-user-analytics.ts` is doing too many jobs.**
  The service contains exported API types, query parsing, Supabase row loading, row paging/chunking,
  rollup builders, redacted session timeline construction, and privacy assertion logic in one
  3,013-line file. The most important internal seams are below. -> new P?
    - query parsing and constants (`admin-chat-user-analytics.ts:526-617`, `1060-1118`)
    - fetch helpers and row loaders (`admin-chat-user-analytics.ts:1120-1171`, `2797-3013`)
    - user/session rollup core (`admin-chat-user-analytics.ts:1173-2005`)
    - redacted session timeline builder (`admin-chat-user-analytics.ts:2014-2545`)
    - detail response builder (`admin-chat-user-analytics.ts:2555-2627`)
    - privacy assertion (`admin-chat-user-analytics.ts:573-586`, `1040-1058`)

- **Slow-threshold behavior is inconsistent.**
  List and user-detail calls pass `slow_threshold_ms` (`+page.svelte:540`, `594`), but the redacted
  session endpoint accepts no threshold query. The redacted timeline severity uses the backend default
  threshold (`admin-chat-user-analytics.ts:2339`, `2441`). If an admin selects 5s or 20s, the session
  timeline warning state does not match the selected threshold. -> new P?
  Status: fixed in Phase 1 with API parser, route forwarding, builder parameter, and tests.

- **Privacy redaction is strong but broad and centralized.**
  `FORBIDDEN_PAYLOAD_KEYS` and recursive assertion are valuable, and the tests cover raw key leakage.
  But keeping redaction inside the same large service makes it harder to audit independently. Extract a
  small redaction module with focused tests. -> new P?

- **Row loading is app-level aggregation with row caps.**
  The service fetches many related sources and aggregates in TypeScript. This is acceptable for phase
  one, but the row cap warning should remain visible and an RPC/materialized summary should be planned
  if this page becomes hot. -> new P?

### Tier 4 - verification and test gaps

- **There is no page-level UI test.**
  Add tests for rendering KPIs, filter URL state, table sort, drawer open/close, redacted timeline load,
  alert badges, and issue clusters.

- **No live visual pass has been captured.**
  This audit is static. A browser pass should capture desktop and phone widths, light and dark mode,
  after the first frontend extraction.

## Phased Fix Plan

### Phase 0 - Freeze behavior and define contracts

Goal: make later refactors mechanical and keep privacy guarantees intact.

- [ ] Decide whether the UI should render all seven leaderboards or the backend should return only the
      four currently rendered.
- [x] Decide whether the redacted session endpoint should accept `slow_threshold_ms`; recommendation:
      yes, to match the active page threshold.
- [ ] Add a small Svelte characterization test for the current page:
    - KPIs render.
    - URL filters hydrate.
    - sort header changes query state.
    - user drawer opens.
    - redacted timeline section renders after selecting a session.
    - alert badges and issue clusters render from fixture data.
- [x] Keep the existing backend/API tests as the baseline.

Verification:

- `./node_modules/.bin/vitest run src/lib/server/admin-chat-user-analytics.test.ts src/routes/api/admin/chat/users/server.test.ts`
  -> 2 files, 28 tests passed on 2026-07-05 after Phase 2 filter extraction.
- New page test command once added.

### Phase 1 - Cheap correctness and design-system cleanup

Goal: fix low-risk correctness/accessibility issues before moving code.

- [x] Import icons from `$lib/icons/lucide.ts`.
- [x] Replace repeated uppercase label longhands with `.micro-label`.
- [x] Add `motion-reduce:animate-none` to skeleton/pulse loading states.
- [x] Encode `userId` in the user-detail fetch URL.
- [x] Add request guards or `AbortController` for `loadUserDetail` and `loadRedactedSession`.
- [x] Pass `slow_threshold_ms` through the redacted session route if Phase 0 confirms the contract.
- [ ] Convert obvious raw command buttons to `Button` or add the primitive focus-visible contract.

Verification:

- Focused page tests.
- Focused backend/API tests.
    - `./node_modules/.bin/vitest run src/lib/server/admin-chat-user-analytics.test.ts src/routes/api/admin/chat/users/server.test.ts`
      -> 2 files, 28 tests passed on 2026-07-05 after Phase 2 filter extraction.
- `svelte-check` for touched files if feasible in the local environment.
    - `NODE_OPTIONS='--max-old-space-size=8192' ./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`
      -> 0 errors and 0 warnings on 2026-07-05.

### Phase 2 - Extract frontend components

Goal: reduce the page to a route orchestrator that owns state and composes focused UI regions.

Target structure:

```txt
apps/web/src/routes/admin/chat/users/+page.svelte
apps/web/src/lib/components/admin/chat-users/
  ChatUserKpiStrip.svelte
  ChatUserFilters.svelte
  ChatUserLeaderboards.svelte
  ChatUsersTable.svelte
  ChatUsersMobileCards.svelte
  ChatUserDetailDrawer.svelte
  ChatUserSummaryCards.svelte
  ChatUserComparisonPanel.svelte
  ChatUserActivityTimeline.svelte
  ChatUserSessionsList.svelte
  ChatRedactedSessionTimeline.svelte
  ChatIssueClusters.svelte
  ChatEntityChanges.svelte
  ChatToolsAndErrors.svelte
  chat-user-export.ts
  chat-user-ui.ts
```

Work:

- [x] Extract KPI strip.
- [x] Extract filter bar and collapse secondary filters into a filter panel with active chips. -> P7
- [x] Extract leaderboards; render or remove all response leaderboards based on Phase 0.
- [x] Extract desktop table and add mobile cards. -> P12
- [x] Extract drawer into a component with proper dialog semantics, Escape close, and focus restore.
      -> P13
- [x] Extract redacted session timeline.
- [x] Extract entity changes.
- [x] Extract issue clusters.
- [x] Extract tools and errors.
- [x] Extract summary cards.
- [x] Extract comparison panel.
- [x] Extract activity timeline.
- [x] Extract sessions list.
- [x] Extract issue cluster and alert badge helpers into `chat-user-ui.ts`.
- [x] Move export CSV/JSON helpers out of the page into `chat-user-export.ts`.
- [x] Add focused unit tests for `chat-user-export.ts`.
- [ ] Add focused unit tests for `chat-user-ui.ts` helpers.

Verification:

- `NODE_OPTIONS='--max-old-space-size=8192' ./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`
  -> 0 errors and 0 warnings after the export-helper extraction.
- `./node_modules/.bin/vitest run src/lib/components/admin/chat-users/chat-user-export.test.ts src/lib/server/admin-chat-user-analytics.test.ts src/routes/api/admin/chat/users/server.test.ts`
  -> 3 files, 31 tests passed after the export-helper extraction.
- Pending: page tests updated to target behavior rather than implementation details.
- Pending: manual keyboard pass through filter controls, table sort, drawer, session timeline, entity
  changes.

### Phase 3 - Split shared DTOs and backend service modules

Goal: make the backend domain rules independently testable and easier to review.

Target structure:

```txt
apps/web/src/lib/types/admin-chat-user-analytics.ts
apps/web/src/lib/server/admin-chat-user-analytics/
  query.ts
  redaction.ts
  row-loaders.ts
  rollups.ts
  detail.ts
  redacted-session.ts
  index.ts
```

Work:

- [ ] Move exported response/query row types to `src/lib/types/admin-chat-user-analytics.ts`.
- [x] Move query parsing and constants to `query.ts`.
- [x] Move `FORBIDDEN_PAYLOAD_KEYS` and recursive assertion to `redaction.ts`.
- [ ] Move `fetchPagedRows`, `fetchChunkedRows`, and `loadAnalyticsRows` to `row-loaders.ts`.
- [ ] Move `buildAdminChatUserAnalyticsCore` and rollup helpers to `rollups.ts`.
- [ ] Move `buildAdminChatUserDetail` and detail-only helpers to `detail.ts`.
- [ ] Move `buildAdminChatRedactedSession` and timeline event helpers to `redacted-session.ts`.
- [ ] Keep existing route imports stable through `index.ts` re-exports, then update imports after tests pass.

Verification:

- Existing `admin-chat-user-analytics.test.ts` split or expanded by module.
- Existing API route tests remain green.
- Add explicit tests for slow-threshold propagation, redacted session severity, and query parser
  fallbacks.
    - `./node_modules/.bin/vitest run src/lib/server/admin-chat-user-analytics/query.test.ts src/lib/server/admin-chat-user-analytics/redaction.test.ts src/lib/components/admin/chat-users/chat-user-export.test.ts src/lib/server/admin-chat-user-analytics.test.ts src/routes/api/admin/chat/users/server.test.ts`
      -> 5 files, 38 tests passed after the query extraction.

### Phase 4 - Backend performance and contract hardening

Goal: make the page viable as usage grows.

- [ ] Add instrumentation or timing around `loadAnalyticsRows`.
- [ ] Keep row-cap warnings visible and test truncated data health.
- [ ] If row caps are frequently hit, move heavy aggregation to RPC/materialized summaries.
- [ ] Add deterministic tie-breaker tests for all sort fields and leaderboards.
- [ ] Add contract tests that the frontend fixture conforms to shared DTO types.

Verification:

- Focused backend tests.
- Optional local admin-data smoke test if credentials and data are available.

### Phase 5 - Live visual QA and tracker closeout

Goal: confirm the cleaned-up surface behaves well in the browser.

- [ ] Run the admin route locally.
- [ ] Capture desktop and phone-width screenshots in light and dark mode.
- [ ] Verify table/mobile-card parity.
- [ ] Verify drawer keyboard behavior: open, tab loop, Escape, focus restore.
- [ ] Verify filters: collapsed state, active chips, URL state.
- [ ] Verify no raw transcript content is visible on `/admin/chat/users`.
- [ ] Update this audit doc with shipped items and verification results.
- [ ] Update `HYPERPLEXED_AUDIT_TRACKER.md` from pending to shipped/partial.

## Proposed Success Criteria

- `+page.svelte` is reduced to a thin route shell, ideally under 500-700 lines.
- `admin-chat-user-analytics.ts` is replaced by focused modules; no single backend module exceeds about
  800 lines unless it is a deliberate generated or data fixture file.
- All user-facing controls meet the Button primitive focus/tap/reduced-motion contract.
- Main table has a mobile-card fallback.
- The selected slow threshold affects list, detail, and redacted session warning states consistently.
- Privacy assertions remain active at service and route boundaries.
- Focused backend/API tests and page-level UI tests pass.
- Manual browser QA confirms desktop and mobile layouts.
