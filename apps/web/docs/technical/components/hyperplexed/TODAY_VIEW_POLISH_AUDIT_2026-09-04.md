# Today page polish — 2026-09-04

Scope: `/today`, `TodayAgendaRow.svelte`, and `WhatChangedSection.svelte`. Builds on the [original task affordance pass](../../../features/today-view/TODAY_VIEW_2026-07-09.md). Implementation authorized by the request for a more cohesive page.

## Tier 1 — alignment and readability

- Header: dominant Today title, secondary date/counts, separate next event, shorter “Plan my day” action. → P4/P6/P9
- Toolbar: quiet review/overdue controls, primitive refresh/send buttons, single row down to 320 CSS px. → P2/P8/P13
- Typography: consistent section headings and capture micro-label; readable body text and 16px phone input. → P4/P5
- Agenda: untimed tasks no longer reserve a blank time rail; timed labels move above cards on phones. Wrapping titles and 44px completion/chat targets. → P1/P4/P9/P13

## Tier 2 — page hierarchy

- Place schedule/tasks before recent activity, which previously pushed the agenda below the fold. → P4/P8
- Give capture, empty states, and agenda consistent card/border/radius treatment. Retain the graph-paper input. → P2/P4
- Open task details from its title with a small edit indicator; retain separate project links and chat. → P6/P13/P20
- Group activity in a divided panel, with actor/type/time below entity names. Preserve expansion, links, and chat callbacks. → P1/P2/P4

The intentional `max-w-3xl` reading column expands the prior `max-w-2xl` within the existing app shell (P3 adaptation).

## Tier 3 — polish

Reserve accent emphasis for primary action and current event. Remove repetitive state badges and card textures. No new animation; refresh remains reduced-motion gated. → P4/P9/P11/P26

## Verification

- Web Svelte check: zero errors/warnings. Existing agenda component test passes. Scoped Prettier and whitespace checks pass.
- Autofixer run on all three components: remaining advice concerns existing route-link conventions and unchanged timer/Map/Set patterns; no unrelated migration applied.
- Authenticated desktop and 390 CSS px light/dark screenshots captured inline. Desktop dark before screenshot captured; other before-mode captures not taken.
- At 320 CSS px, document width equals viewport width and all four toolbar controls share the same top position. No overflow at 390 or 1440 either.
- Task title opens its modal; closing returns to Today. Activity collapse/reopen checked. Original dark theme restored and viewport override cleared.

First-project, clear-day, degraded-feed, and all-day states reviewed in markup, not exercised with new live data. No backend, shared UI primitive, or notification-stack changes.

## Density follow-up — user correction

High information density is a requirement for Today. The initial polish pass used too much vertical space; this follow-up supersedes its spacing and row layout choices. Keep this surface compact in future polish work.

- Put date beside Today where space allows and reduce header/toolbar padding. Keep counts visible. → P3/P4/P6
- Return capture to a single compact input surface, retaining its accessible heading and voice controls. → P4/P6
- Use tight two-line agenda rows: title, then inline state/time/project metadata. Restore the time rail at phone widths. Titles can occupy two lines on phones, one on desktop; full titles remain available through task details and the title tooltip. → P1/P4/P8
- Use compact controls for fine pointers; keep 44px icon hit areas for coarse pointers. Inline text links use 24px targets. This is an intentional density adaptation to P13.
- Put activity metadata beside entity names on desktop, with a compact second line on phones. Tighten project-group spacing. → P1/P4

Measured on the same authenticated account, before/after this correction (CSS pixels, rounded):

| Region             | Initial polish | Dense follow-up |
| ------------------ | -------------: | --------------: |
| Header             |            181 |              95 |
| Capture            |             99 |              47 |
| Typical task row   |            121 |              53 |
| Eight-task section |           1062 |             480 |
| Recent activity    |           1327 |             612 |

The task section is 55% shorter without reducing its title font size. The eight tasks fit in the verified 900px desktop viewport. Desktop and phone light/dark rendering checked; 320px, 390px, and 1440px layouts have no document overflow. Pointer-coarse sizing reviewed in CSS; viewport testing used the desktop browser's pointer. Component test and scoped formatting pass; Svelte autofixer reports only the existing conventions noted above.
