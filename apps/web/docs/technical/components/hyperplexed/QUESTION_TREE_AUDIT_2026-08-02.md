<!-- apps/web/docs/technical/components/hyperplexed/QUESTION_TREE_AUDIT_2026-08-02.md -->

# Question Tree Hyperplexed Audit - 2026-08-02

Target: `/admin/experiments/question-tree` and its run viewer at
`/admin/experiments/question-tree/[runId]`

Primary files:

- `apps/web/src/routes/admin/experiments/question-tree/+page.svelte`
- `apps/web/src/routes/admin/experiments/question-tree/[runId]/+page.svelte`
- `apps/web/src/lib/components/admin/question-tree/QuestionTreeCanvas.svelte`
- `apps/web/src/lib/components/admin/question-tree/QuestionTreeNode.svelte`
- `apps/web/src/lib/components/admin/question-tree/QuestionTreeInspector.svelte`
- `apps/web/src/lib/components/admin/question-tree/QuestionTreeViewportAnchor.svelte`

Status: audit complete; approved remediation implemented locally and verified.

Live verification status: authenticated production data was inspected in Chrome on the launch page
and a 100-node failed run. Desktop and phone-width compositions were captured in light and dark mode.
The document reported zero horizontal overflow at the tested widths. The default authenticated viewport
was 1123 x 893 CSS pixels; responsive overrides were also checked (Chrome's active page scaling reported
1920 x 1200 and 520 x 1125 CSS-pixel viewports for the desktop and phone presets).

Prior art stacked:

- `ADMIN_PAGES_AUDIT_2026-06-26.md` established the admin console's responsive and primitive standards.
- `HYPERPLEXED_FIX_PATTERNS.md` is the source for P1-P22 citations.
- No prior Question Tree-specific Hyperplexed audit or tracker row existed.

## Implemented remediation - 2026-08-02

- **Mouse and keyboard graph parity:** click, drag-to-pan, scroll zoom, pinch zoom, double-click zoom,
  minimap panning, and the 44 px flow controls remain available to pointer users. The 101-node tab
  sequence was replaced with one labeled search combobox that supports Arrow Up/Down, Enter, Escape,
  result counts, and mouse-selectable results. Selecting by either path centers the graph on the node.
- **Legible graph working view:** large trees now open on the root and first two depths instead of
  fitting the entire poster. `Fit view` remains the explicit overview action. Selection and hover
  spotlight the ancestor path plus immediate children while unrelated branches dim; reduced motion
  disables the transition and running-edge animation.
- **Graph accessibility cleanup:** layout-only handles are presentation-only, edges and nodes no longer
  generate hundreds of tab stops, node connection is disabled, controls are 44 x 44 px, and the minimap
  hides below `sm`. The canvas retains an explicit pointer-navigation description.
- **Responsive master-detail:** the 400 px inspector remains inline on `xl`. Smaller viewports open the
  shared focus-trapped bottom sheet only after a user selects a node, with bounded scrolling, close and
  focus restoration behavior. Closing it no longer leaves a multi-thousand-pixel inspector appended to
  the document.
- **Hierarchy and density:** six metric cards became one four-value summary band with progressively
  disclosed run details; activity became a compact four-row timeline with a terse live announcement;
  the complete terminal synthesis is grouped in one native disclosure; proposal rationale and target
  claims moved behind native disclosures.
- **Copy and visual system:** back-label truthfulness, humanized statuses/policy, readable duration and
  cost formatting, `.micro-label`, `rounded-lg`, quieter model-only context, one-accent explanation,
  two-line run-question clamping, shared Button usage, and 44 px custom controls were applied.
- **Root semantics:** an answerless seed is now explained as the research origin instead of displaying
  the contradictory `completed` / `No answer yet` state.
- **Second-pass hardening:** viewport work now survives reactive refreshes instead of losing a pending
  fit or selected-node center operation; Dagre layout is derived only from tree structure instead of
  rerunning on hover; control and retry mutations always queue a fresh reconciliation fetch; the canvas
  exposes a named region; and inspector statuses and latency no longer leak machine formatting.

The keyboard recommendation was deliberately implemented as an equivalent node explorer rather than
turning the canvas into a keyboard-only surface. This preserves the user's requested cursor/mouse
navigation while eliminating the original tab trap.

## Current strengths

- The surface is visually coherent with Inkprint in both themes. Panel edges align, color contrast is
  broadly sound, and the responsive shell does not leak horizontal overflow.
- Long recent-run titles and node questions already use clamping, and fixed-size icons generally keep
  row geometry stable. That is a good P1 foundation.
- The recent-runs rows scan well: status, timestamp, question, progress, depth, and cost are ordered
  consistently.
- The graph is the earned visual centerpiece; the surrounding chrome is restrained and the inspector
  keeps detailed content out of the node cards.
- Most explicit motion paths already respect reduced motion: spinners, pulses, and node-arrival motion
  are gated.

## Regions

| #   | Region                                 | Primary source                                             |
| --- | -------------------------------------- | ---------------------------------------------------------- |
| 1   | Page shell and header                  | index `+page.svelte:107-113`; run `+page.svelte:475-535`   |
| 2   | New-run form                           | index `+page.svelte:115-196`                               |
| 3   | Run explanation                        | index `+page.svelte:198-224`                               |
| 4   | Recent runs                            | index `+page.svelte:227-298`                               |
| 5   | Run actions and metrics                | run `+page.svelte:482-561`                                 |
| 6   | Execution activity and terminal states | run `+page.svelte:563-682`                                 |
| 7   | Synthesis                              | run `+page.svelte:684-719`                                 |
| 8   | Search and canvas                      | run `+page.svelte:721-776`; `QuestionTreeCanvas.svelte`    |
| 9   | Node inspector                         | run `+page.svelte:777-787`; `QuestionTreeInspector.svelte` |
| 10  | Run footer                             | run `+page.svelte:791-799`                                 |

## Tier 1 - cheap, high-impact (alignment/padding/labels)

- [Run header] **T1-1. Fix the back label.** The back link points to the Question Tree index but
  inherits the label `Admin Dashboard`, so the destination and label disagree. Pass
  `backLabel="Question Tree"` (or `All runs`). -> P6

- [Labels and status copy] **T1-2. Humanize the technical labels before restyling.** Recommended
  renames: `Model lane` -> `Model`, `Node ceiling` -> `Max nodes`, `Run contract` -> `How it works`,
  `Live websocket` -> `Updates connected`, `completed partial` -> `Partial`, and `quota paused` ->
  `Paused - quota`. For terminal runs, `Live execution` should become `Run activity`. These changes
  remove jargon and stop transport health from reading as execution health. -> P6

- [Header overflow] **T1-3. Bound the user-supplied root question in the page header.** The run title
  uses the complete question as an unconstrained wrapping description (`[runId]/+page.svelte:476-480`).
  It consumed four lines in the phone pass and repeats again in the selected root. Clamp it to two
  lines with a title/expand affordance, or make the question the H1 and demote `Question Tree run` to
  metadata. -> P1+P4

- [Micro-type] **T1-4. Replace hand-rolled uppercase labels with `.micro-label`.** The launch label,
  `Run contract`, six metric labels, synthesis labels, node labels, and inspector section headings
  each restate slightly different `text-2xs`/tracking/weight combinations. Use the shared class and
  vary only semantic color where needed. -> P5

- [Radius language] **T1-5. Remove the `rounded-xl` outliers.** The question textarea
  (`+page.svelte:139`) and graph nodes (`QuestionTreeNode.svelte:49-55`) use `rounded-xl` while the
  surface otherwise speaks `rounded-lg` containers and `rounded-md` inner controls. -> P2

- [Controls] **T1-6. Route ordinary buttons through `ui/Button.svelte`.** Start, refresh, run controls,
  inspector close/retry, active-agent chips, activity cards, and search-result chips are hand-rolled.
  Several are 32-40 px high and have no explicit `focus-visible` ring; the shared primitive guarantees
  44 px targets, focus treatment, press behavior, and motion gating. Start with destructive/run controls
  and the 32 px inspector close button. -> P13+P9

- [Search] **T1-7. Give the graph search an accessible name.** The wrapping `<label>` has no text and
  the searchbox exposes no accessible name in the rendered tree (`[runId]/+page.svelte:730-740`). Add
  a visible or screen-reader-only label; keep the placeholder as a hint, not the name. -> P13

- [Launch hierarchy] **T1-8. Demote the permanent model-only disclaimer.** The amber warning block is
  visually louder than the configuration fields even though it is stable product context, not a
  recoverable warning. Render it as quiet helper text with an info icon, reserving warning tint for a
  quota or validation state. -> P4+P19

- [Run explanation] **T1-9. Use one accent for the three explanatory rails.** Orange, blue, and green
  imply three semantic states where the content is simply three parts of one contract. One accent (or
  fixed lucide icon containers) makes the card calmer and keeps semantic colors available for actual
  run state. -> P9+P19

- [Root inspector] **T1-10. Do not label the seed as an unanswered answer.** The default root inspector
  shows status `completed` beside `No answer yet.` The root does not produce an answer; omit that section
  and rename `Produced questions` to `Branches` or `First questions`. -> P6+P4

- [Formatting] **T1-11. Normalize machine values.** The index uses five decimal places for cost, the run
  uses six, and the footer exposes `paid_floor_strict` plus latency in raw seconds. Use one cost formatter,
  humanize the model policy, and format 590.5 s as 9m 51s. -> P6+P4

- [Motion] **T1-12. Gate the remaining graph motion.** Running edges set `animated: true`
  (`QuestionTreeCanvas.svelte:79-90`) without a reduced-motion branch. Keep the already-correct node
  arrival gate and disable edge animation when reduced motion is requested. -> P11

## Tier 2 - structural within the surface (declutter/hierarchy)

- [Run metrics] **T2-1. Consolidate the six metric cards into one summary band.** Six separate panels
  create container noise on desktop and six full-width stops on mobile (`[runId]/+page.svelte:552-561`).
  Use one panel with a 2 x 3 phone grid and 3 x 2 / 6-column desktop layout, using dividers and type
  hierarchy instead of six shadows. -> P4+P3

- [Execution activity] **T2-2. Make disclosure state-aware and remove duplicate failure reporting.** A
  terminal failed run currently shows `failed` in metrics, a red failure event, the full error again in
  a warning banner, and a retry action. Keep one authoritative failure summary. For active runs, keep the
  latest three events visible; for terminal runs, collapse the full six-event timeline behind a
  `Show activity` control. Neutralize completed historical events and reserve strong semantic tint for the current
  state or error. -> P4+P6+P19

- [Live region] **T2-3. Do not make the whole activity card grid an `aria-live` region.** Realtime updates
  can cause a screen reader to re-announce a rich region containing multiple buttons. Move announcements
  into one terse `role="status"` line (for example, `Node 42 answered; 2 questions added`) and leave the
  timeline static. -> P13

- [Initial graph camera] **T2-4. Open at a legible working zoom, not a 100-node poster.** `fitView` includes
  every node (`QuestionTreeCanvas.svelte:104-110`), so a large completed tree renders as unreadable
  thumbnails. Default to the root plus the first one or two depths at a readable zoom; retain `Fit view`
  and the minimap as explicit overview tools. Search or a selected activity should focus the matching
  node and its local branch. -> new P? (legible working viewport)

- [Graph keyboard model] **T2-5. Replace the 101-tab sequence with one composite navigation model.** Live
  inspection found 101 graph nodes, each `role="group" tabindex="0"`, producing 206 focusable descendants
  in the canvas. Use a roving-tab tree model (one tab stop; arrows move parent/sibling/child; Enter opens)
  or set canvas nodes non-focusable and provide an equivalent keyboard-first node explorer. Give each
  focusable node an accessible name and restore focus when the inspector closes. -> P13

- [Decorative handles] **T2-6. Remove connection handles from the accessibility tree.** The read-only graph
  exposes hundreds of generic `Handle` controls even though users cannot connect nodes. Mark handles
  presentation-only/hidden from assistive technology and set the flow's connectability contract to false
  while preserving edge anchors visually. -> P13

- [Mobile master-detail] **T2-7. Turn the inspector into a mobile sheet instead of appending it below the
  canvas.** The phone pass produced a 3,583 px page: a full graph followed by the entire root inspector and
  four dense proposal cards. On mobile, start with no node selected; opening a node should launch the
  shared dialog/sheet treatment with focus trap, Escape/close, focus restore, and a bounded scroll region.
  Keep the 400 px side inspector on `xl`. -> P13 + new P? (responsive master-detail)

- [Mobile canvas controls] **T2-8. Shrink the control footprint, not the targets.** The interactive minimap
  covers a large share of the phone canvas while the four Svelte Flow controls measured only 26 x 26 px.
  Hide/collapse the minimap below `sm` behind one `Overview` action and restyle the remaining controls to
  44 px targets. -> P7+P13

- [Search as navigation] **T2-9. Promote search into the accessible wayfinding path.** For a 100-node tree,
  search is more usable than panning. Return a count, render a semantic results list, support arrow/Enter,
  focus the selected node at readable zoom, and clear the query without losing selection. The current
  tiny result chips are below the tap-target contract (`[runId]/+page.svelte:742-757`). -> P13+P4

- [Inspector density] **T2-10. Show proposal identity first and disclose rationale second.** Each proposal
  card simultaneously shows purpose, gain, status, question, why-it-matters, and target claim
  (`QuestionTreeInspector.svelte:146-187`). Keep the question plus 2-3 compact metadata points visible;
  place rationale/target under an expandable `Details` disclosure. This materially shortens both the
  desktop rail and mobile sheet. -> P4+P7

## Tier 3 - polish/signature (motion/effects, at most one per surface)

- [Research tree] **T3-1. Make branch focus the one signature delight.** On node hover, keyboard focus, or
  selection, emphasize its ancestor path and immediate children while dimming unrelated branches to about
  45% opacity. Pair hover and focus-visible states, keep all text readable, and make the transition instant
  under reduced motion. This improves comprehension instead of adding decorative cursor effects. -> P16+P11

- [Restraint] Do not add cursor glow, trailers, gradient text, or more pulsing. The graph already earns the
  signature role; polish should make its structure easier to read. -> P14-P18 restraint

## Recommended fix order

1. **Accessibility contract:** T1-6, T1-7, T2-3, T2-5, T2-6, T2-8, then keyboard/focus regression tests.
2. **Mobile master-detail and graph comprehension:** T2-7, T2-4, T2-9.
3. **Cheap visual/copy sweep:** T1-1 through T1-5, then T1-8 through T1-12.
4. **Density pass:** T2-1, T2-2, T2-10.
5. **One signature refinement:** T3-1 only after keyboard parity is complete.

The recommended first implementation batch is the accessibility contract plus mobile inspector. It
changes the page from visually good to operationally polished; the copy/radius cleanup can ship in the
same pass with low risk.

## Verification notes

- Authenticated production launch and 100-node detail states were inspected before implementation on
  2026-08-02 at desktop and phone widths in light and dark mode.
- Authenticated local after-state verification used the 101-node partial run at desktop and phone widths.
  Both launch and detail pages reported zero document-level horizontal overflow.
- The graph measured 101 nodes, **0 node tab stops**, 4 remaining focusable graph controls, 0 exposed
  `Handle` roles, and four 44 x 44 px controls. The minimap remained available on desktop and was hidden
  on phone width.
- Keyboard verification searched a two-result query, used Arrow Down and Enter, centered Node 4, updated
  the inspector, and dimmed 96 unrelated nodes. Mouse verification clicked a visible graph node, selected
  Node 5, updated the inspector, and spotlighted its local branch.
- The mobile inspector measured 1,114 px inside a 1,266 px viewport, with no horizontal overflow and no
  visible duplicate desktop inspector. Closing the sheet restored the normal document; clicking the graph
  reopened the sheet on the selected node.
- The completed-run synthesis was rechecked after the full thesis, answer, confidence buckets, evidence,
  disagreements, next-research, and limitations sections were added; the disclosure remains visually
  coherent and keeps the graph as a separate bounded workspace.
- The second-pass desktop run reported zero horizontal overflow, 101 graph nodes, 0 node tab stops,
  0 handle tab stops, and four 44 px controls. Mouse selection centered Node 2 and updated the inspector;
  keyboard search/Enter centered a matching branch; the zoom control updated the viewport transform.
- Official Svelte analyzer: edited components have no issues; the remaining native Map/Set and
  third-party viewport-effect suggestions were reviewed and are intentional. Full
  `pnpm --dir apps/web check`: **0 errors, 0 warnings**. Scoped ESLint and Prettier pass. Focused tests:
  **8 files / 18 tests passed**, including viewport cancellation, inspector formatting, export bundle,
  export route, realtime reconciliation, retry, creation, and PostgreSQL normalization coverage.

## Implementation log

- 2026-08-02: audit and authenticated production baseline completed.
- 2026-08-02: approved Tier 1-3 cleanup implemented and authenticated local desktop/mobile after-state
  verified, with pointer navigation explicitly preserved alongside the composite keyboard explorer.
- 2026-08-02: second-pass hardening fixed camera cancellation, hover-layout churn, post-mutation refresh
  races, and remaining machine-formatted inspector values; static, focused, database, and authenticated
  desktop interaction checks rerun cleanly.
