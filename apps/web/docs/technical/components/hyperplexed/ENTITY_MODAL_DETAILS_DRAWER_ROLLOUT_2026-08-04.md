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
