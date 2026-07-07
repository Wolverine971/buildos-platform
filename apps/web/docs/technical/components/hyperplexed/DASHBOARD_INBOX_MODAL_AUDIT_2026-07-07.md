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
- **Dismiss feedback reveal** - dismiss feedback fields now sit behind an explicit disclosure that
  opens by default only when feedback already exists. -> P7+P13

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
