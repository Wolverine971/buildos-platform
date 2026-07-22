<!-- apps/web/docs/technical/components/hyperplexed/PROJECT_WORKSPACE_V2_AUDIT_2026-07-18.md -->

# Project Workspace V2 — Hyperplexed Audit and Prototype

**Surface:** `/projects-v2/[id]`  
**Audited:** 2026-07-18  
**Implementation:** `apps/web/src/routes/projects-v2/[id]`

## Outcome

The prototype turns the project page from a sequence of equally weighted sections into one
cohesive operating workspace. It keeps the existing Kanban board and document system, but gives
each kind of project information a clear job:

- **Work** is the default view for deciding what needs attention and moving tasks.
- **Overview** explains the project: brief, dates, goals, plans, milestones, risks, events, and
  project memory.
- **Docs** is a focused document workspace with the real tree and recent-document context.
- **Activity** owns change history rather than competing with the work surface.

The route reuses the production project loader, access checks, streaming full-data request, task
mutations, document editor, graph, and BuildOS chat. It is a live real-data prototype rather than a
static mock.

## Data inventory

| Data                                               | User question                               | Placement                                               |
| -------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Project name, status, description, dates, progress | What is this and where does it stand?       | Persistent workspace header; extended brief in Overview |
| Next step                                          | What should happen next?                    | High-emphasis header callout                            |
| Tasks and task coverage                            | What needs doing, and what needs attention? | Work signals and full Kanban board                      |
| Goals and plans                                    | What are we trying to achieve and how?      | Overview / Direction                                    |
| Milestones                                         | What is approaching?                        | Overview / Timeline                                     |
| Risks                                              | What could derail the project?              | Overview / Watchlist                                    |
| Documents and context document                     | Where is the project knowledge?             | Docs workspace; project memory in Overview              |
| Events and activity                                | What is coming up or changed?               | Overview / Timeline and Activity                        |
| Entity search                                      | How do I jump to one known item?            | Persistent below the project header                     |
| Graph and agent chat                               | How do I explore or ask across the project? | Persistent named header actions                         |

The canonical full-project contract also supports images and ancillary ontology data, while the
current V2 initial payload intentionally omits images. Those are not given a standalone top-level
destination until they have a project-specific user job; adding every available entity would
recreate the original equal-weight navigation problem.

## Diagnosis

The current page has strong individual pieces, especially the task board and documents tree, but its
information architecture makes the project feel like a collection of modules:

1. Header, pulse, memory, entity pills, board, and documents appear in a long sequence.
2. Entity pills treat fundamentally different jobs as peers: tasks, goals, plans, risks, milestones,
   events, and documents all compete for attention.
3. Strategic context and operating work are separated by scroll distance instead of organized into
   deliberate modes.
4. Counts communicate quantity, but not urgency or the decision the user should make next.
5. Primary actions and navigation use several visual grammars, weakening the feeling of one
   workspace.

## Research synthesis

The information architecture combines four recurring product patterns:

- [Linear's project overview](https://linear.app/docs/project-overview) groups summary, properties,
  resources, documents, and milestones while leaving issue execution in its own view.
- [Asana's project overview](https://help.asana.com/s/article/project-overview-tab) is a central
  brief/resources/milestones hub.
- [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project?apiVersion=2022-11-28)
  supports multiple views over the same project data instead of stacking every representation.
- [Notion's project guidance](https://www.notion.com/help/guides/project-management-that-evolves-with-your-team)
  recommends several saved views over a shared project system and connects projects to their tasks
  and documents.

For BuildOS, the synthesis is a persistent project shell with job-based modes. The page is not a
dashboard of every entity; it is a decision surface that changes lens while preserving context.

## Hyperplexed findings

### Tier 1 — cheap, high-impact

- **P3 / shared shell:** one aligned header, search surface, and content frame.
- **P4 / hierarchy:** project identity, next move, and progress lead; supporting metadata recedes.
- **P6 / labels:** `Work`, `Overview`, `Docs`, and `Activity` describe user intent directly.
- **P8 / discoverability:** Graph and Ask BuildOS remain named, visible actions.
- **P1 / overflow:** mode navigation scrolls on narrow screens; content grids collapse before
  constraining data-heavy children.

### Tier 2 — structural

- Replace the entity-pill constellation with four modes that each own a distinct user job.
- Make the proven Kanban board the default operating surface.
- Put goals, plans, milestones, risks, and dates into a project snapshot instead of separate
  destinations.
- Give documents a full workspace instead of making them the tail of a long page.
- Keep streaming, skeleton-first hydration and progressive task buckets (**P20**).
- Keep counts next to the view that owns their meaning rather than duplicating totals everywhere
  (**P22**).

### Tier 3 — polish

- Roving keyboard tabs, visible focus states, labeled icon actions, 44px minimum primary targets, and
  reduced-motion behavior improve control quality (**P11 / P13**).
- Motion is restrained to hierarchy and view feedback. A decorative signature flourish is deferred
  until an authenticated visual pass can prove it adds value.

## Prototype details

- The route delegates to the production `/projects/[id]` loader, so permissions and real ontology
  data remain canonical.
- Direct project changes reset the prototype's state through a keyed route wrapper.
- Task creation, editing, completion, drag-and-drop moves, and progressive bucket loading use the
  existing production flows.
- Documents use the current tree, editor modal, creation, move, archive, permissions, and polling
  behavior.
- Goals, plans, milestones, risks, events, tasks, documents, and the project itself use the
  production entity modals inside the V2 workspace. Shallow URL state keeps those editors
  deep-linkable and makes browser Back/swipe close the current editor instead of leaving the
  project.
- Graph and Ask BuildOS lazy-load their existing production experiences.

## Tier 1 follow-up — 2026-07-18

The first audit follow-up tightened semantics, converted passive status into action, and normalized
the reused widgets without changing the workspace's core information architecture:

- Renamed `Progress` to `Task completion`, matching the value actually shown.
- Replaced the exclusive “In motion” bucket count with a direct count of loaded tasks whose state is
  `in_progress`. A trailing `+` and supporting copy disclose when the task window is partial.
- Split overdue and blocked work into separate actions instead of presenting one ambiguous
  “blocked or overdue” number.
- Made all three Work signals operational: `Now` focuses the in-progress column, overdue and blocked
  actions focus their matching columns, and `Next checkpoint` opens the milestone.
- Added explicit `Show all` / `Show fewer` controls wherever Overview previously truncated goals,
  plans, milestones, risks, or events without disclosure.
- Restored Graph access on mobile while keeping the compact header.
- Normalized the Kanban, document tree, entity search, and activity strip to BuildOS icon aliases,
  semantic micro-type, 44px interactive targets, visible focus, and reduced-motion behavior.

### Deliberate trade-offs

- State counts are derived from the currently loaded task window, so partial coverage is disclosed
  instead of implying false precision or forcing an eager full-board fetch.
- Overview remains curated to five items per strategic section and four events on first paint; the
  new controls make the limit explicit while preserving scan speed.
- Work signals navigate into the existing Kanban rather than introducing a second filtered task
  surface, keeping task mutation and drag behavior canonical.
- Graph is available on mobile, but remains a modal secondary tool rather than another primary mode.

## Tier 2 follow-up — 2026-07-18

The structural follow-up finishes the workspace model instead of treating V2 as a visual shell over
the classic project page:

- Added native create flows for goals, plans, milestones, risks, and events directly from their
  Overview sections.
- Added native editing for the project, goals, plans, milestones, risks, events, tasks, and
  documents. Search, Graph, Activity, Work, and Overview now converge on the same editor behavior
  instead of routing secondary entities back to `/projects/[id]`.
- Added shallow `entity` / `entity_id` URL state. Editors are shareable, direct links hydrate
  correctly, and browser Back/swipe closes an editor before leaving the workspace.
- Promoted Docs from a nested collapsible section to a dedicated always-open workspace variant.
  Move and archive use the production document controllers, while viewer roles retain read/public
  actions without seeing mutation actions or drag-and-drop affordances.
- Expanded Activity from a six-item pulse preview into a real change-history view. Workspace mode
  keeps individual log entries, requests 20 at a time, exposes `Load more`, and lets the user expand
  the upcoming-event list.

### Deliberate trade-offs

- The workspace reuses production modals rather than building inline forms. This preserves mature
  validation and mutation behavior, at the cost of not yet offering spreadsheet-style inline
  editing.
- Entity state lives in query parameters instead of parallel nested routes. That keeps one stable
  workspace shell and supports deep links, while requiring shallow-history synchronization in the
  client.
- Activity is paginated in bounded 20-entry requests rather than eagerly loading the full project
  log. This protects first-paint and network cost, with one explicit action required for older
  history.
- The dedicated Docs view still shares the production tree component. V2 gains a cleaner workspace
  and permission-aware actions without forking document behavior or changing the classic route's
  default collapsible presentation.
- Project deletion remains disabled in the V2 project editor. Editing belongs in this workspace;
  destructive project lifecycle management remains deliberately outside this iteration.

## Tier 3 follow-up — 2026-07-19

The polish pass adds one restrained signature interaction, then spends the rest of its budget on
control quality:

- Added a cursor-lit accent edge and low-opacity radial wash to the three Work signal cards at the
  time (**P14**). The 2026-07-22 Tilda reassessment below supersedes this choice and removes the
  signal-card layer entirely.
- Completed the tab contract with stable tab/panel IDs, `aria-labelledby`, focusable panels, visible
  focus, and a 180ms reduced-motion-gated panel entry (**P11 / P13**).
- Reworked document-tree rows so drag, expand, open, and public-link actions are sibling controls
  rather than nested interactive elements. Primary controls now use 44px targets and consistent
  focus treatment.
- Made document actions available from the keyboard with `Shift+F10` / the Context Menu key.
  Context menus now expose menu/menuitem/separator semantics, focus the first action, support
  Arrow/Home/End navigation, close on Escape or Tab, and remain clamped to the viewport.
- Normalized unlinked and archived disclosures, polling notices, loading skeletons, cut/undo
  feedback, touch affordances, and reduced-motion behavior.
- Removed the misleading unlinked-document “Link to tree” action. It only opened the document;
  editors can still drag an unlinked document into the real tree.
- Closed a viewer-role gap: an empty Docs workspace no longer offers a create action when the user
  cannot edit.
- Named Activity regions and view controls according to their workspace job instead of retaining
  the generic “Project pulse” label.

### Deliberate trade-offs

- The signature effect was initially limited to the three decision cards. The later reassessment
  found that even this restrained flourish strengthened the wrong layer, so hierarchy and the
  Kanban now provide the surface's signature instead.
- Reusing the production document tree means these control improvements also benefit its classic
  consumers. The cost is slightly taller rows, which trades some desktop density for reliable
  keyboard and touch targets.
- The tree keeps `bind:this` references where direct element geometry, drag targeting, or menu focus
  is required. Converting those mature interaction paths to attachments would add churn without a
  user-visible Tier 3 gain.
- The Kanban remains horizontally scrollable on narrow screens. Collapsing six task states into a
  single column would make the board fit, but would remove the cross-state spatial model users
  already understand.

## Tilda principles reassessment — 2026-07-22

The follow-up audit applies Tilda's proximity, Fitts's Law, emphasis, whitespace, palette,
primitives, consistency, modularity, anchor-object, and reading-pattern principles to the
authenticated live workspace. The complete evidence, scorecard, layout, and trade-offs are in
[`PROJECT_WORKSPACE_V2_TILDA_REASSESSMENT_2026-07-22.md`](./PROJECT_WORKSPACE_V2_TILDA_REASSESSMENT_2026-07-22.md).

Tier 1 shipped as a hierarchy correction:

- `Active now` is derived from the real in-progress task bucket and opens the actual task.
  `Recommended next` remains project guidance and has an explicit `Plan` action through the
  project-aware BuildOS chat.
- The persistent shell now uses one compact identity row, a flat focus band, and a concise status
  line instead of a large identity block, next-move card, and four-cell summary.
- Search vocabulary and adjacent actions change with Work, Overview, Docs, and Activity. Duplicate
  Work, Overview, and Docs create/edit actions were removed from their content shells.
- The three Work signal cards and cursor glow were removed. The Kanban is now the anchor object,
  bounded by lines and whitespace rather than another elevated card.
- Task cards have no visible resting elevation; hover, keyboard focus, drag, and completion own the
  elevation feedback.
- Narrow screens start with `In progress`, then Scheduled and Overdue, with horizontal snap points.
  Desktop preserves the familiar Backlog-first order.
- Workspace micro-labels use neutral muted foreground instead of small accent text, clearing the
  contrast concern while reserving accent for state and progress.

### Measured result

- At 1801 × 831, the project header bottom moved from approximately **409 px to 329 px** and the
  Kanban top from approximately **619 px to 421 px**.
- At the audited 520 × 1125 CSS viewport, the header bottom moved from approximately **583 px to
  379 px** and the Kanban top from approximately **939 px to 459 px**.
- The mobile page has no viewport-level horizontal overflow. The internal Kanban remains
  horizontally scrollable, uses `x mandatory` snap behavior, and begins visually with
  `In progress`.
- The live populated project showed different strings for the actual active task and the
  recommended next move, confirming that the new labels expose rather than conceal that semantic
  distinction.

## Tilda Tier 2 follow-up — 2026-07-22

The second Tilda pass applies the same hierarchy correction inside Overview, Docs, and Activity:

- **Overview** now leads with one full-width project brief and a quiet semantic metadata rail.
  Direction, Milestones, Watchlist, Coming up, and Project memory are flat chapters separated by
  rules and whitespace rather than a dashboard of nested cards.
- **Project memory** has a flat workspace variant and no longer repeats the recommended next step
  already owned by the persistent focus band.
- **Docs** presents recent documents before the tree on phones as a horizontally snapping quick-
  access rail. Desktop keeps the tree primary and uses a quiet ruled recent-context sidebar.
- **Activity** presents history as a continuous timeline and upcoming work as a sibling due-next
  list. Mobile retains the History / Up next switch, while workspace rows keep 44 px-plus targets,
  aligned time cues, and bounded loading.

### Measured result

- The 1440 × 900 Overview panel contains **zero shadowed descendants**; its leading brief measured
  approximately **113 px** high.
- At 390 × 844, Overview's brief measured approximately **230 px** with no page overflow. Project
  memory has no shadow or radius and no duplicated `Next step` label.
- At the same phone viewport, Docs places recent context at approximately **559 px** and the tree at
  approximately **671 px**. The recent rail reports `x mandatory` snapping and no page overflow.
- At 1440 × 900, the Docs recent-context sidebar has a 1 px left rule and no shadow. Its rows retain
  focusable targets without card elevation.
- Activity's workspace shell has no radius or shadow. Mobile upcoming rows measured approximately
  **58 px** high and produced no viewport overflow.

### Deliberate trade-offs

- The production document tree stays hierarchical because that hierarchy is content, not
  decorative containment.
- Desktop Activity keeps history and upcoming work in separate columns; they answer different
  questions and should not be merged into one misleading chronology.
- The implementation keeps accessible target height even where visual chrome is removed, so the
  result is quieter without becoming harder to operate.
- The final Tier 2 visual pass used the production components with representative fixture data
  after the local authenticated session expired. Populated history remains covered by focused
  component tests; persistence smoke still belongs on a disposable authenticated project.

## Edge-state hardening follow-up — 2026-07-22

The next audit pass closed the remaining visual-extreme work without changing the workspace data
contract:

- Long project names now stay inside a shrink-safe header path and truncate before displacing the
  adjacent status and actions. The document title uses the finished product name rather than the
  internal prototype label.
- Long, multiline project briefs use progressive disclosure: five lines initially, then a 44 px
  `Read full brief` / `Show less` control. The full source text remains in the document.
- Direction labels and totals now match the entities actually rendered in that chapter.
- Empty Overview chapters are flat 44 px rows rather than bordered placeholder cards.
- Empty Docs workspaces hide the redundant recent-document region and let the production tree own
  the single empty state.
- Focused tests now cover long, dense, and empty workspace fixtures. At 390 × 844, the empty
  Overview had no viewport overflow, all five flat placeholders measured 44 px, and the panel had
  zero shadowed descendants.

The trade-off remains deliberate: empty chapters stay visible for orientation, dense direction
lists retain their five-item initial limit, and long briefs remain one explicit action away instead
of consuming the entire first viewport.

## Verification

- Vitest: **423 files and 2,621 tests passed**.
- Focused Tier 3 Vitest pass: **4 files and 26 tests passed**, including context-menu keyboard
  navigation, document-row interaction structure, Activity semantics, and project interaction
  regressions.
- Authenticated real-data visual passes completed in both light and dark mode. Desktop and mobile
  Work, Overview, Docs, and Activity were inspected against the populated BuildOS project. The page
  has no viewport-level horizontal overflow; the Kanban keeps its intentional internal horizontal
  scroll.
- Live browser checks confirmed tab/panel semantics, cursor-effect activation, `Shift+F10`, initial
  menu focus, Arrow navigation, Escape dismissal, both Activity modes, and real document/entity
  modal open/close behavior.
- Graph was exercised in spring and hierarchical layouts at desktop and mobile widths. Ask BuildOS
  was opened and closed at both widths without sending a message. No browser console errors were
  recorded.
- The final pass fixed two live-only edge cases: shallow entity URLs now preserve the visible
  workspace tab, and the Overview columns now use shrink-safe grid children instead of clipping a
  desktop-width layout on mobile.
- The official Svelte analyzer found and verified the keyed loading-state correction and reports no
  Tier 3 correctness issues. Its remaining `bind:this` suggestions are intentional for drag
  geometry, menu focus, and roving tab references.
- `pnpm --filter @buildos/web check`: **0 errors and 0 warnings** across the full workspace.
- Prettier: all Tier 3 Svelte and test files pass formatting.
- `git diff --check`: clean.
- Invalid project identifiers reach the real loader guard and return HTTP 400.

## Deferred validation

- Live persistence smoke for Kanban moves, document reordering, and entity saves should use a
  disposable test project; the audit intentionally did not mutate the populated BuildOS project.
- A future authenticated smoke pass should repeat these edge states with disposable persisted data.
  The component-level long, dense, and empty cases are now covered; this remaining check is about
  persistence and production session integration rather than layout discovery.
