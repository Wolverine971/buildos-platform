<!-- apps/web/docs/technical/components/hyperplexed/MOBILE_TIER1_CROSS_SURFACE_FIX_2026-07-10.md -->

# Mobile Tier 1 Cross-Surface Fix — 2026-07-10

## Objective

Resolve the five highest-priority mobile composition gaps identified in the BuildOS mobile audit.
This pass targets overflow, information hierarchy, and access to dense controls. Touch-target sizing is
intentionally outside scope.

The phone composition should behave like a compact command center: the primary scan path remains
visible, secondary controls are reachable without consuming the whole viewport, and long values
degrade predictably instead of widening the page.

## Shipped fixes

| Surface                  | Mobile failure                                                                                  | Shipped composition                                                                                                                                                                                        | Patterns   |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Briefs History           | The filter panel existed, but its only trigger was inside the desktop action row.               | Added a visible mobile filter trigger, active-filter count, removable search/date chips, and a clear-all action. The compact desktop trigger now also communicates active/open state.                      | P7, P8     |
| Today all-day events     | Long event and project names could make the pill wider than the viewport.                       | Bounded every pill to its parent, added the zero-minimum flex chain, preserved the calendar glyph, and independently truncated event/project labels while retaining the full value in the title.           | P1         |
| Onboarding progress      | Empty balancing space compressed and visually offset the progress rail on phones.               | Removed the dead spacer, gave the rail the full header width, shortened `Project Capture` to `Capture`, and placed steps in four equal columns.                                                            | P1, P3, P6 |
| Notifications            | Title, summary, status, and time competed in one desktop-style row.                             | Switched the title block to a mobile-first vertical hierarchy, kept status/time in a compact metadata row, and bounded long title, summary, body, and URL values. Desktop retains the split metadata rail. | P1, P4     |
| Agent chat activity tabs | The tab strip silently depended on horizontal scrolling, and large counts widened tabs further. | Uses four equal mobile columns, restores the desktop scrolling row at `sm`, truncates labels safely, and caps visible badges at `99+` while retaining exact accessible counts.                             | P1, P8     |

## Verification

- Scoped Prettier pass completed for all changed Svelte and test files.
- `ProgressIndicatorV3.test.ts`: compact labels, full-width/equal-column rail, and completed-step
  navigation.
- `AgentChatActivityTabs.test.ts`: four-column mobile strip, four tabs, count cap, exact accessible
  count, and tab activation.
- Follow-up Vitest result: 3 files, 9 tests passed, including the next History mobile batch.
- Full `pnpm check`: 0 errors and 0 warnings.

## Follow-up — next batch started

The History page was the next clean, high-traffic command-center surface. Its type-filter rail now uses
three equal phone columns instead of silent horizontal scrolling, every tab exposes a bounded count,
large stat values cannot widen their four-column grid, and the mobile microcopy floor is 10 px. Exact
counts remain available in accessible tab labels and stat titles. See the follow-up in
`HISTORY_PAGE_AUDIT_2026-06-26.md`.

## Remaining verification

Authenticated before/after screenshots at 320 px and 390 px, in light and dark mode, remain pending
for Briefs, Today, Notifications, and the agent-chat host. The onboarding and agent-tab component
contracts are covered statically, but should be included in that live pass.
