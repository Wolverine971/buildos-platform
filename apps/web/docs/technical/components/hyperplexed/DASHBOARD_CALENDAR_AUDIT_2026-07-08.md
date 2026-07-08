<!-- apps/web/docs/technical/components/hyperplexed/DASHBOARD_CALENDAR_AUDIT_2026-07-08.md -->

# Dashboard Calendar Hyperplexed Audit - 2026-07-08

Target: `/dashboard/calendar`

Primary files:

- `apps/web/src/routes/dashboard/calendar/+page.svelte`
- `apps/web/src/routes/dashboard/calendar/+page.server.ts`
- `apps/web/src/lib/components/scheduling/CalendarView.svelte`
- `apps/web/src/lib/components/scheduling/CalendarItemDrawer.svelte`
- `apps/web/src/lib/components/layout/Navigation.svelte` for the route-scoped chat label

Status: Phase 1 + Phase 2 + Phase 3 plus regression coverage shipped 2026-07-08. Authenticated screenshot
verification was waived by the user on 2026-07-08.

Live verification status: static + test verified. The local Vite server was already running on `localhost:5173`,
but the in-app browser redirected `http://localhost:5173/dashboard/calendar` to `/auth/login`. The authenticated
screenshot pass is intentionally skipped.

Prior art stacked:

- `DASHBOARD_AUDIT_2026-06-26.md` audited the home dashboard header and explicitly left secondary surfaces out.
- `MOBILE_EXPERIENCE_AUDIT_2026-06-12.md` previously named `CalendarItemDrawer` as a rogue overlay; the current
  drawer now has body scroll lock and stack-aware Escape handling, so this audit does not re-file that old issue.
- `HYPERPLEXED_FIX_PATTERNS.md` is the pattern source for P1-P18 citations.

## Regions

| #   | Region                         | Files                                                      |
| --- | ------------------------------ | ---------------------------------------------------------- |
| 1   | Page shell and route context   | `+page.svelte:671-756`, `Navigation.svelte:163-170`        |
| 2   | Filter panel                   | `+page.svelte:684-745`                                     |
| 3   | Calendar toolbar               | `CalendarView.svelte:631-716`                              |
| 4   | Day/week/month event rendering | `CalendarView.svelte:724-1165`                             |
| 5   | Detail drawer content          | `+page.svelte:771-1086`, `CalendarItemDrawer.svelte:41-84` |

## Tier 1 - cheap, high-impact (alignment/padding/labels)

- [Page shell] ✅ Shipped 2026-07-08. The calendar route used `container mx-auto max-w-6xl px-3 py-3 sm:px-5 sm:py-6`
  (`+page.svelte:672`) instead of the shared shell convention `max-w-7xl mx-auto px-2 sm:px-4 lg:px-6`.
  It now uses the shared shell scale. -> P3

- [Route context] ✅ Shipped 2026-07-08. The global chat launcher labelled `/dashboard/calendar` as "Projects chat"
  (`Navigation.svelte:169`). That is a context mismatch on a calendar-first surface; rename it to "Calendar chat"
  or fall back to "BuildOS chat" if the chat is not calendar-scoped. It now says "Calendar chat". -> P6

- [Filters] ✅ Shipped 2026-07-08. The closed filter state only said "Filters" (`+page.svelte:685-693`). The page
  now renders removable "off" chips below the header while the panel is closed, and each chip re-enables that
  hidden layer. -> P7

- [Filters and drawer labels] ✅ Shipped 2026-07-08. Small uppercase labels were hand-rolled in the filter panel, drawer subtitle,
  linked-entities heading, project heading, and calendar grid labels (`+page.svelte:701-705,914-918,1000-1004`,
  `CalendarItemDrawer.svelte:61-64`, `CalendarView.svelte:736-739,830-832,853-855,1002-1005`). These now use
  `.micro-label`. -> P5

- [Calendar toolbar] ✅ Shipped 2026-07-08. The icon-only refresh button relied on `title="Refresh calendar data"`
  with no explicit accessible name (`CalendarView.svelte:673-681`). It now has `aria-label="Refresh calendar"`.
  -> P13+P9

- [Motion] ✅ Shipped 2026-07-08. Several motion paths ignored `prefers-reduced-motion`: refresh spin (`CalendarView.svelte:681`), loading
  pulse (`CalendarView.svelte:720`), detail loading spinner (`+page.svelte:788`), drawer `fly`
  (`CalendarItemDrawer.svelte:49-50`), and broad `transition-all` on dense event chips
  (`CalendarView.svelte:870,902,1054,1083`). These now use `motion-reduce:*`, narrower transition utilities, or
  the shared `slideMotion()` helper. -> P11

## Tier 2 - structural within the surface (declutter/hierarchy)

- [Calendar items] ✅ Shipped 2026-07-08. The dashboard spec says task markers should be visually distinct with
  icon plus prefix label, but the rendered grid mostly showed title/time and color
  (`CalendarView.svelte:870-879,900-915,1051-1069,1080-1089,1132-1153`). Calendar cards and dense grid entries now
  use compact lucide-backed range/start/due marker badges so users can scan task semantics without opening the
  drawer. -> P9+P4+P6

- [Month overflow] ✅ Shipped 2026-07-08. Desktop month view rendered non-clickable "+N more" rows while hiding the
  actual overflow (`CalendarView.svelte:1046-1075`). Mobile month view rendered every event and still added a
  "+N more" line when there were more than three (`CalendarView.svelte:1132-1157`). Overflow counts now open the
  affected day view, and mobile month actually caps visible events before showing the count. -> P6+P8

- [Mobile month empty state] ✅ Shipped 2026-07-08. Mobile month view only rendered days from the current month that
  had events (`CalendarView.svelte:1097-1163`). If the month had no items, the calendar body became blank after the
  toolbar. Mobile month now has an explicit selected-month empty state. -> P12+P4

- [Detail drawer semantics] ✅ Shipped 2026-07-08. `CalendarItemDrawer` was a portal-mounted drawer with backdrop
  and Escape handling, but it was still not a dialog: no `role="dialog"`, no `aria-modal`, no `aria-labelledby`,
  and no focus trap/restore (`CalendarItemDrawer.svelte:43-84`). It now has dialog semantics, labelled title and
  subtitle, focus trap, focus restore, and background inert handling. -> P13

- [Drawer overflow] ✅ Shipped 2026-07-08. Drawer metadata rows could overflow on long calendar data: date range and location spans lack
  `min-w-0`/wrapping (`+page.svelte:843-881`), description is `whitespace-pre-wrap` without `break-words`
  (`+page.svelte:887-891`), and linked-entity rows put badges after truncating names without `min-w-0` on the row
  (`+page.svelte:920-990`). The drawer rows now use the P1 `min-w-0`/truncate/break-words contract. -> P1

- [Linked entities] ✅ Shipped 2026-07-08. Linked-entity rows used hover backgrounds (`+page.svelte:920-990`) but
  were plain `div`s with no action. They now render as quiet metadata rows without fake hover affordance. -> P13+P6

- [Icon convention] ✅ Shipped 2026-07-08. Calendar files imported icons directly from `lucide-svelte`
  (`+page.svelte:6-25`, `CalendarView.svelte:3-11`, `CalendarItemDrawer.svelte:3-4`) instead of the BuildOS icon
  wrapper in `$lib/icons/lucide.ts`. They now route through the wrapper. -> P9

## Tier 3 - polish/signature (motion/effects, at most one per surface)

- [Surface polish] Do not add a cursor-glow or other signature effect yet. This page is a dense utility surface,
  and the current problems are scan semantics, overflow honesty, and drawer a11y. If a later polish pass wants one
  earned delight, use an opacity-only spotlight on mobile day/week/month event lists after keyboard/focus parity is
  complete. -> P16

## Recommended Fix Order

1. ✅ Shipped 2026-07-08: P3/P6/P7/P5/P9/P11 toolbar, filter, icon-wrapper, and reduced-motion cleanup.
2. ✅ Shipped 2026-07-08: P13/P1 drawer primitive-equivalent semantics, focus, overflow, and quiet linked metadata.
3. ✅ Shipped 2026-07-08: P9/P4 task-marker scan semantics in `CalendarView`.
4. ✅ Shipped 2026-07-08: P6/P8/P12 month overflow honesty and mobile month empty state.
5. ✅ Waived 2026-07-08: authenticated desktop/iPhone light/dark screenshots.

## Implementation Log

- 2026-07-08: Phase 1 shipped. Files changed: `+page.svelte`, `CalendarView.svelte`,
  `CalendarItemDrawer.svelte`, `Navigation.svelte`. Verification: targeted Prettier passed;
  `pnpm --filter @buildos/web check` passed with 0 errors and 0 warnings.
- 2026-07-08: Phase 2 shipped. Files changed: `CalendarItemDrawer.svelte`, `+page.svelte`.
  Drawer now has dialog semantics, focus trap/restore, background inert handling, P1 overflow rows,
  and quiet linked-entity metadata. Verification: targeted Prettier passed; first `svelte-check` found
  one `aside role="dialog"` warning, fixed by switching the drawer shell to `div`; final
  `pnpm --filter @buildos/web check` passed with 0 errors and 0 warnings.
- 2026-07-08: Phase 3 shipped. Files changed: `CalendarView.svelte`. Calendar entries now expose range/start/due
  marker badges across day, week, month, and mobile lists; desktop/mobile overflow counts open the affected day;
  and mobile month has a real empty state. Verification: targeted Prettier passed; `git diff --check` passed;
  `pnpm --filter @buildos/web check` passed with 0 errors and 0 warnings.
- 2026-07-08: Follow-up regression coverage shipped. Files changed: `CalendarView.test.ts`. Added tests for
  task-marker labels, month overflow day drill-in, and empty mobile month state. Verification:
  `pnpm --filter @buildos/web test:run src/lib/components/scheduling/CalendarView.test.ts` passed 6 tests;
  `pnpm --filter @buildos/web check` passed with 0 errors and 0 warnings.

## Verification TODO

- None for this pass. Authenticated screenshot verification was waived by the user on 2026-07-08.
