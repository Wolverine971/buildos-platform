<!-- apps/web/docs/technical/components/hyperplexed/ENTITY_MODAL_DETAILS_DRAWER_ROLLOUT_2026-08-04.md -->

# Entity modal details drawer rollout — 2026-08-04

## Outcome

Secondary entity controls now share the document modal's content-first interaction: desktop modals open with their right rail closed, and one persistent vertical `DETAILS` tab opens the rail from the same right edge. This removes default visual noise without moving the controls into the already-busy modal header.

## Covered surfaces

- Task, goal, milestone, plan, event, risk, and project edit modals
- Plan creation's secondary timeline/template-guidance rail
- Time-block details and session controls
- Document modal remains the reference implementation and already uses the same right-edge behavior

The final static breadth scan found no other modal sidebar layouts outside the already-converted document modal.

## Shared contract

- Closed by default for every mounted modal session
- 44px right-edge tab with a stable vertical `DETAILS` label
- 20rem desktop / 24rem wide-desktop drawer that compresses the main column instead of covering it
- A width-only grid spacer keeps closed rail content from inflating modal height or pushing comments down
- Horizontal-only clipping contains drawer motion without cutting off vertical controls or card shadows
- Synchronized 280ms seam/drawer motion with a reduced-motion escape hatch
- `aria-controls`, `aria-expanded`, `aria-hidden`, and `inert` keep the closed desktop rail out of the interaction path
- Existing mobile content remains inline; time-block controls retain their existing details-first mobile order
- Existing forms, save association, comments ordering, cards, and linked-entity behavior remain intact

## Applied patterns

- P1 content-first overflow-safe layout
- P2/P23 one consistent hierarchy and edge handle
- P9 Lucide-only control iconography
- P11 reduced-motion-safe synchronized transitions
- P13 explicit names, control relationships, and hidden-panel interaction safety

## Verification

- Svelte autofixer: clean for every touched `.svelte` file
- Focused regression suites: 21/21 passing across the shared rollout, desktop/mobile task interaction, modal-session reset, and project form suites
- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings on the final rerun
- Targeted ESLint: 0 errors; 5 pre-existing unused-code warnings outside this rollout
- Production client/server compilation completed; Vercel adapter packaging later stalled after existing optional Sharp-platform warnings and was terminated
- Authenticated desktop light/dark and phone screenshots remain pending

## Dense scroll-body follow-up — 2026-08-12

Task Edit, Plan Edit, and Goal Edit were re-audited alongside the document reference surface. The shared desktop drawer now uses a sticky, viewport-bounded shell with one `min-h-0 flex-1 overflow-y-auto` content region, scroll containment, and a stable scrollbar gutter. This keeps the drawer label and edge handle stationary while long controls, linked records, images, and activity remain reachable.

The three reviewed edit modals now opt into a compact desktop drawer label. Linked Entities starts closed, disclosure rows use tighter vertical spacing, and Plan/Goal disclosures use the same reduced-motion-safe slide behavior already used by Task. Redundant nested “Controls / operations” card headers were removed from Plan and Goal so the first useful control appears sooner. Mobile details remain inline.

Applied patterns: P1/P4/P6 overflow and density, P11 motion consistency, P13 explicit panel relationships, and P23 compact edge controls.

Follow-up verification:

- Svelte autofixer: clean for the shared drawer, Task Edit, Plan Edit, and Goal Edit
- Focused regression suites: 31/31 passing across the shared drawer, Task Edit interaction, and Document modal
- Full `svelte-check`: no diagnostics in the touched modal files; the repository-wide command is currently blocked by one unrelated existing `{@const}` placement error in `routes/dashboard/calendar/+page.svelte`
- Authenticated local desktop functional verification passed on real Task, Plan, and Goal records at 1280×720. Each drawer opened from the edge handle, kept its label fixed, exposed a 421px independent scroll viewport, reached its measured scroll maximum (Task 205px, Plan 85px, Goal 106px), and left Linked Entities closed initially. Task closed/open/end-of-scroll screenshots were inspected; light-theme and phone captures remain pending.

## Minimal header follow-up — 2026-08-18

Task, goal, plan, risk, milestone, event, and project editors now use one
`EntityModalHeader` identity shell based on the document modal's compact geometry. Each header is a
single row containing only its fixed icon, overflow-safe title, and existing modal-wide actions.
State, priority, impact, due/sync indicators, and created/updated dates remain in their owning forms
or Details surfaces instead of being duplicated in the modal chrome.

The follow-up audit also gives every custom-header dialog an explicit accessible name, and names the
Event editor's external-calendar icon action for assistive technology.

The document modal remains independent and unchanged. Its breadcrumb, lifecycle badge, timing/save
state, overflow menu, Document Interact action, and close action are intentional workspace context.

Applied patterns: P1/P4/P6/P9/P13/P25.

Verification: Svelte autofixer clean across the shared family; 33/33 focused header, drawer, Task,
and Project tests pass; full `svelte-check` reports 0 errors and 0 warnings. Refreshed authenticated
desktop/phone light/dark screenshots remain pending.
