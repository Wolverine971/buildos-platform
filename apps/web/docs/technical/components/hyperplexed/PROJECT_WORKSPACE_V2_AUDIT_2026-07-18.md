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

- Added a cursor-lit accent edge and low-opacity radial wash to the three Work signal cards
  (**P14**). One pointer listener updates CSS custom properties for the group; touch input and
  reduced-motion preferences bypass the effect.
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

- The signature effect is limited to the three decision cards. There is no cursor trailer, gradient
  headline, animated app chrome, or competing effect elsewhere; hierarchy remains the visual
  signature.
- Neighbor cards share the cursor position so the signal row feels like one instrument panel. The
  accent is intentionally low contrast and does not communicate state.
- Reusing the production document tree means these control improvements also benefit its classic
  consumers. The cost is slightly taller rows, which trades some desktop density for reliable
  keyboard and touch targets.
- The tree keeps `bind:this` references where direct element geometry, drag targeting, or menu focus
  is required. Converting those mature interaction paths to attachments would add churn without a
  user-visible Tier 3 gain.
- The Kanban remains horizontally scrollable on narrow screens. Collapsing six task states into a
  single column would make the board fit, but would remove the cross-state spatial model users
  already understand.

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
- Visual tuning is still worth repeating against the remaining extremes: an empty workspace, an
  unusually long project name, and projects with many simultaneous risks or milestones. The current
  pass already covered a large board and a deep document tree.
