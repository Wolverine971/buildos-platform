<!-- apps/web/docs/technical/components/hyperplexed/DASHBOARD_INBOX_MODAL_AUDIT_2026-07-07.md -->

# Dashboard Inbox Modal Audit - 2026-07-07

## Scope

This pass covers the dashboard AI Inbox modal body and its directly embedded/shared subcomponents:

- `DashboardInboxModal.svelte`
- `InboxProjectBadge.svelte`
- `InboxChangeDetails.svelte`
- `InboxDismissFeedbackFields.svelte`
- `ChangeSetReview.svelte`
- `ChangeSetFailureSummary.svelte`
- `DocumentProposalDiff.svelte`
- `UnifiedDiffView.svelte`

The July 3 notification-modal pass fixed modal chrome, stacking behavior, and primary resolution
controls. This audit is the deferred content-body pass.

## Tier 1 - Shipped

- **Motion gating** - refresh spinner, loading skeletons, group selectors, change-detail chevrons,
  review bulk controls, segmented accept/dismiss controls, and diff expanders now use
  `motion-reduce:*` or primitive-backed reduced-motion behavior. -> P11
- **Primitive-equivalent controls** - raw group selectors, disclosure controls, bulk review actions,
  segmented per-change actions, diff expanders, and dismiss feedback fields now have 44px-safe hit
  areas where applicable plus visible focus rings. -> P13
- **Overflow-safe content** - inbox item titles, summaries, rationale, preview text, calendar
  suggestion descriptions, evidence chips, operation summaries, diff rows, and failure messages now
  clamp, truncate, or break words deliberately instead of leaving long data to chance. -> P1
- **Icon consistency** - inbox change details, document proposal diffs, and unified diff expanders now
  import lucide icons through `$lib/icons/lucide.ts`; fixed icon sizing/shrink behavior was tightened
  where rows depend on stable alignment. -> P9
- **Micro-label cleanup** - project badges and before/after proposal labels now use the shared
  `.micro-label` class instead of hand-rolled uppercase micro type. -> P5

## Tier 2 - Shipped

- **Item-body hierarchy** - item titles now lead each review row, with risk/source metadata demoted
  beneath the title and the longer rationale/preview blocks kept below that fixed order. -> P4+P6
- **Duplicate project paths** - project-scoped groups keep the single header `Open project` path and
  suppress repeated item-level project badges; cross-project/account groups still show item project
  context. -> P8+P4
- **Mobile group rail** - the group rail is now a real `tablist`/`tabpanel` pair with roving
  `tabindex`, selected state, and arrow/Home/End keyboard handling. -> P7+P13
- **Decision action grouping** - final decisions (`Accept`, `Dismiss`) are grouped separately from
  assistive/delay actions (`Chat`, `Snooze`) in both project-suggestion controls and embedded change
  review controls. `Later` was renamed to `Snooze`. -> P4+P6
- **Dismiss feedback reveal (superseded 2026-07-18)** - dismiss feedback fields originally sat
  behind an explicit disclosure that opened by default only when feedback already existed. The
  decision-note consolidation below removed this duplicate path. -> P7+P13

## Tier 3 - Shipped

- **Review-item spotlight** - the active review row now keeps full emphasis while sibling rows dim on
  hover or keyboard focus. This is CSS-only, avoids layout motion, and disables transition timing
  under `prefers-reduced-motion`. -> P16

## Remaining

- **Live authenticated visual verification** - still needs real AI Inbox desktop/iPhone captures in
  light and dark mode. Browser attempts on July 7 reached the public landing page at
  `localhost:5173` without an authenticated dashboard session.

## Verification

- `apps/web`: `pnpm check` - passed with 0 errors and 0 warnings immediately after Tier 3.
  A later repo-wide rerun is currently blocked by an unrelated dirty
  `src/routes/projects/[id]/+page.svelte` type error on `window.setTimeout`.
- `apps/web`: targeted Svelte diagnostics for `src/lib/components/dashboard`,
  `src/lib/components/inbox`, and `src/lib/components/notifications/types/agent-run` - passed with
  0 errors and 0 warnings after the final doc update.
- `apps/web`: `pnpm exec vitest run src/lib/components/notifications/types/agent-run/ChangeSetReview.test.ts src/lib/components/notifications/types/agent-run/AgentRunModalContent.test.ts` - passed, 3 tests.
- `apps/web`: targeted Prettier was run on the touched components.
- Repository root: targeted `git diff --check` passed for the touched inbox and audit files.

Live authenticated visual verification is still owed. The in-app browser loaded the public landing page
with a `Log in` CTA and no AI Inbox, so this pass did not capture real AI Inbox desktop/iPhone,
light/dark screenshots.

## Decision-note consolidation - 2026-07-18

Authenticated screenshots exposed two competing text-entry paths on each project finding: a one-line
response next to `Address`/`Dismiss`, plus a separate dismiss-reason disclosure and note.

### Shipped

- Findings now have one neutral `Decision note` field beside their actions. The same trimmed value is
  submitted as resolution context when the user selects `Address` and as feedback when they select
  `Dismiss`. The helper text makes the contract explicit: a note is required to address and optional
  to dismiss. -> P6
- The separate dismiss-feedback disclosure, reason selector, textarea, per-item state, and component
  were removed from both Dashboard AI Inbox and Project Inbox. Executable proposals retain their
  direct `Accept`/`Dismiss` controls; findings retain `Address`/`Dismiss` because there is no proposed
  mutation to accept. -> P6
- The feedback-memory path remains intact. A dismissal with text stores the note; a bare dismissal
  continues to receive the server-side `dismissed_without_note` fallback. The Project Inbox no longer
  treats text entered into a field labeled as dismissal feedback as a hidden clarification/delegation
  request. -> P6+P13
- Failed Address/Dismiss requests restore the optimistic card with its decision note intact, so users
  do not have to retype context after a transient error. -> P13

### Verification

- Focused component, inbox-decision API, and feedback-persistence suites: 21 tests passed.
- `pnpm --filter @buildos/web check`: 0 errors and 0 warnings.
- Official Svelte autofixer: shared finding control clean; targeted Prettier and `git diff --check`
  passed.
- The supplied authenticated desktop screenshots verified the before-state. A matching after-state
  capture remains owed.

## Mobile follow-up - 2026-07-09

The authenticated product report that the modal was still broken on mobile exposed a structural issue
the earlier static pass did not catch: at 390px, the base one-column CSS grid used an automatic minimum
track and expanded the review panel to about 770px. The modal clipped that oversized track, hiding the
right half of review content and every second action button.

### Shipped

- The phone grid now uses an explicit `minmax(0, 1fr)` track with `min-w-0` propagated through the
  group panel and item scroller. Review cards, action grids, and long user strings remain inside the
  viewport instead of being clipped. -> P1
- Mobile group navigation is now a compact horizontal chip rail with truncated labels and count badges;
  the desktop presentation remains the 240px vertical sidebar. A short selected-group summary replaces
  the duplicated long group title on phones. -> P4+P7
- Review items render as bounded Inkprint cards with consistent outer/inner radii and full-width fallback
  actions on phones, while desktop retains the dense divided list. -> P2+P12+P13
- The mobile sheet uses a safe-area-aware fixed review height and a single nested item scroller. Swipe
  dismissal and its drag handle are disabled for this information-dense review surface so scrolling long
  proposals cannot accidentally dismiss the sheet. -> P13

### Verification

- Temporary representative-data fixture covered multiple project groups, an account-level calendar
  suggestion, long titles/evidence labels, expandable proposal details, feedback controls, and all four
  decision actions. The fixture was removed after verification.
- Browser captures passed at 390x844 in light and dark mode, 320x568 in dark mode, and 1440x900 in light
  mode. Phone body width, review-card width, and action rows had no horizontal overflow; long expanded
  content scrolled inside the item pane and all actions remained reachable.
- `apps/web`: `NODE_OPTIONS='--max-old-space-size=8192' pnpm check` - passed with 0 errors and 0 warnings.
- Targeted Prettier and `git diff --check` passed for the implementation and audit files.

Authenticated real-data verification remains deferred because the local preview session redirected the
dashboard to login.

## Initial-load performance follow-up - 2026-07-10

The new global navigation entry exposed that opening AI Inbox launched two source-reconciling requests
at once: the modal's full payload request and a forced shared-count refresh. The modal also hydrated up
to 100 review records before showing useful data.

### Shipped

- The navigation open path no longer starts a parallel `/api/inbox/count` reconciliation. The modal's
  list response now carries the exact pending total and updates the shared badge from that same request,
  preserving one count owner without making a second backend path compete with first paint. -> P20+P22
- The global navigation preloads the cached modal import on idle, pointer hover, pointer down, and keyboard
  focus. Touch activation now warms the chunk before `click`, matching the dashboard preload contract. -> P20
- Initial hydration is bounded to 25 records. The modal shows `Showing X of Y`, keeps the exact total through
  optimistic decisions and close summaries, and exposes a 44px-safe `Load N more` action in 25-item steps. -> P20+P13
- The list service returns the exact filtered total with the bounded page. On payload requests, that count,
  decision-capability lookup, and source-payload hydration start together instead of adding a new serial
  count stage. -> P20
- Normal modal loads and load-more requests now use an indexed `repair=none` path: they retain bounded
  lifecycle cleanup for expired/snoozed rows but skip source-table backfill and per-row source
  reconciliation. The explicit Refresh/Retry control keeps the full repair path as a recovery affordance.
  -> P20
- Shared badge counts default to the same indexed fast path instead of scanning every source table after
  mount, realtime changes, or tab visibility. `repair=full` remains an explicit API mode for diagnostics
  and recovery. -> P20+P22
- Source payload tables hydrate in parallel, and unique project permission checks run concurrently instead
  of serially per project. Server Timing now exposes `inbox.index`, `inbox.lifecycle`,
  `inbox.hydrate_base`, `inbox.contexts`, and `inbox.projects` (plus full-repair phases when requested). -> P20
- Navigation, Dashboard, and Today now share a browser performance guardrail for the full click-to-data
  path. `buildos.ai_inbox.open_to_data.<source>` starts before lazy import and completes only after the
  modal's first loaded/empty state renders; failed and abandoned opens are cancelled. The initial budget is
  800 ms for each entry point. -> P20

### Verification

- `apps/web`: focused inbox/count/client-performance/authenticated-route Vitest suite - 42 tests passed.
- `apps/web`: `pnpm check` - passed with 0 errors and 0 warnings.
- Targeted Prettier and repository `git diff --check` passed.
- Authenticated click-to-data timing remains owed; the local in-app browser is signed out.
