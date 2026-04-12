<!-- apps/web/docs/technical/PWA_PULL_TO_REFRESH.md -->

# PWA Pull-To-Refresh

BuildOS supports pull-to-refresh only on installed mobile PWAs and only on pages that opt in.

## Why It Is Page-Scoped

Mobile browsers already own pull-to-refresh in normal browser tabs. BuildOS should not add a second refresh gesture there.

Installed PWAs are different: the browser chrome is removed, and native pull-to-refresh is unreliable or unavailable depending on platform. For installed PWAs, BuildOS provides its own gesture on pages where refreshing page data is useful.

The browser's exact native pull-to-refresh control is not exposed as a web API. In standalone PWA mode, BuildOS approximates the native/Instagram pattern by moving the opted-in page surface with resistance, showing a small spinner, holding the surface while the refresh promise runs, and then settling it back.

## Enabled Pages

Pull-to-refresh should only be mounted on pages with a clear data refresh action:

- Dashboard: `/`
- Projects list: `/projects`
- Project detail: `/projects/[id]`

Do not add it globally in `+layout.svelte`. New pages must opt in explicitly by mounting the shared component and passing the one refresh function for that page.

## Modal Rule

Pull-to-refresh must not start or complete while a modal is open.

Use two guards:

- Page state: pass `disabled={hasModalOpen || isLoading}` when the page already knows a modal is open.
- DOM state: the shared component also checks for `.modal-root`, `[role="dialog"]`, or `[aria-modal="true"]`.

The DOM guard protects pages that open shared modals outside the immediate page state.

## Refresh Ownership

Each page supplies exactly one `onRefresh` handler.

The shared component does not dispatch a global refresh event and does not run a fallback refresh. This avoids double-refresh behavior such as a page-specific API refresh and a SvelteKit invalidation running at the same time.

Examples:

- Dashboard uses the same handler as the refresh button.
- Projects list uses SvelteKit data invalidation.
- Project detail uses the existing project snapshot refresh function.

## Design Review

This is intentionally small:

- One shared component owns the gesture mechanics.
- Pages decide whether the gesture exists by wrapping their refreshable content in that component.
- Pages keep ownership of their refresh function.
- There is no root-layout route allowlist.
- There is no global refresh event bus.
- There is no fallback refresh that can accidentally run alongside a page refresh.

The only global PWA code left in `pwa-enhancements.ts` is setup work that is safe everywhere, such as theme color updates, badge syncing, install prompt handling, and the `pwa-installed` body class.

## Gesture Rules

The shared component should only arm the gesture when:

- The app is running as an installed PWA.
- The input is touch/coarse pointer.
- The document is scrolled to the top.
- No modal is open.
- The gesture starts outside interactive elements such as buttons, links, inputs, textareas, selects, editable regions, and `[data-pull-refresh-ignore]`.
- The drag is mostly vertical and passes the refresh threshold.
- No refresh is already running.

## Files

- Shared component: `apps/web/src/lib/components/pwa/PullToRefresh.svelte`
- PWA detection and safe-area setup: `apps/web/src/lib/utils/pwa-enhancements.ts`
- PWA visual styling: `apps/web/src/lib/styles/pwa.css`
- Dashboard mount: `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte`
- Projects list mount: `apps/web/src/routes/projects/+page.svelte`
- Project detail mount: `apps/web/src/routes/projects/[id]/+page.svelte`

## Maintenance Checklist

When adding pull-to-refresh to another page:

1. Confirm the page has one obvious refresh function.
2. Wrap the refreshable page content in `PullToRefresh`.
3. Pass all modal/loading state into `disabled`.
4. Do not add route allowlists to the root layout.
5. Test browser tab mode and installed PWA mode separately.
