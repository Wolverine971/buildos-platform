<!-- apps/web/docs/technical/components/hyperplexed/PROJECT_WORKSPACE_V2_TILDA_REASSESSMENT_2026-07-22.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Project Workspace V2 — Tilda Principles Reassessment

**Surface:** `/projects-v2/[id]`

**Audited:** 2026-07-22

**Implementation:** `apps/web/src/routes/projects-v2/[id]`
**Companion audit:**
[`PROJECT_WORKSPACE_V2_AUDIT_2026-07-18.md`](./PROJECT_WORKSPACE_V2_AUDIT_2026-07-18.md)

## Outcome

The workspace has the right information architecture and the right core tools. Work, Overview,
Docs, and Activity are understandable jobs; the real Kanban board and document tree should remain.
The current weakness is the surface grammar around those tools: too many bordered, rounded,
shadowed containers compete for attention, and the header spends too much of the first viewport
restating project information before the user reaches the work.

The Tier 1 direction is therefore not a visual restyle. It is an information-hierarchy correction:

1. Separate **actual active work** from the project's **recommended next move**.
2. Compress the persistent project shell so operating content starts materially higher.
3. Give each workspace tab contextual search and actions.
4. Flatten the Work surface around the Kanban rather than wrapping the board in more dashboard
   cards.
5. Use elevation to communicate interaction state, not as the resting state of every object.
6. Put active work first on narrow screens and correct small accent-label contrast.

## Evidence from the live page

The authenticated production page was inspected with the populated BuildOS project at desktop and
mobile widths.

| Evidence                                   |    Desktop |     Mobile | Why it matters                                                               |
| ------------------------------------------ | ---------: | ---------: | ---------------------------------------------------------------------------- |
| Viewport inspected                         | 1801 × 831 | 520 × 1125 | Representative wide and narrow operating views                               |
| Project header bottom                      |    ~409 px |    ~583 px | The shell consumes too much attention before content                         |
| Entity search top                          |    ~433 px |          — | Search is a separate framed module rather than part of the active mode       |
| Kanban top                                 |    ~619 px |    ~939 px | Only ~212 px of the board is visible on desktop; mobile reaches it very late |
| Large rounded elements in loaded Work view |         68 |          — | Many are valid task cards, but nested card layers amplify containment        |
| Bordered elements in loaded Work view      |         74 |          — | Borders stop communicating grouping when almost everything has one           |
| Shadowed elements in loaded Work view      |         54 |          — | Resting elevation makes the interface feel heavier and less stateful         |

The highest-severity semantic issue is that two prominent surfaces labeled `NEXT MOVE` and `NOW`
repeat `project.next_step_short`, while the real task data contains a different task in
`in_progress`. Recommendation and execution are being presented as the same truth.

The measured small accent label on a card was approximately 10.4 px at **4.22:1** contrast. That is
below the 4.5:1 target for small text. Muted foreground on the same surface measured approximately
4.99:1 and is the safer semantic-label color.

## Research synthesis

This reassessment applies the requested
[Tilda Web Design Principles](https://tilda.education/en/web-design-principles), the
[Nielsen Norman Group visual-design principles](https://www.nngroup.com/articles/principles-visual-design/),
the [NN/g card-component guidance](https://www.nngroup.com/articles/cards-component/), and
[Material accessibility guidance](https://m1.material.io/usability/accessibility.html).

The sources converge on a practical rule for this product surface: hierarchy should come from
placement, typography, spacing, and selective emphasis before it comes from containers and effects.
Cards are useful for heterogeneous, independently actionable objects. Lists, bands, and whitespace
are more scannable for homogeneous status and metadata.

## Principle scorecard

| Principle             | Current assessment                                                                                                 | Tier 1 response                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Proximity             | Related data is grouped, but nested cards create several competing group boundaries.                               | Use one compact operating band, one contextual toolbar, and the board's native columns.        |
| Fitts's Law           | Important controls generally meet the 44 px target, but the static next-move card looks actionable without acting. | Make active work a real target; give the recommendation an explicit `Plan` action.             |
| Emphasis              | Ask BuildOS, Next Move, progress, active tab, signal glow, and New Task all compete.                               | Make active work the anchor; demote project-wide tools and remove the glow row.                |
| White Space           | Spacing is generous but cumulative, delaying the board and docs.                                                   | Preserve breathing room inside local groups while removing redundant outer padding and shells. |
| Color Palette         | The palette is restrained overall; accent is overused for tiny labels and multiple focal points.                   | Reserve accent for progress/state cues and use readable neutral text for micro-labels.         |
| Basic Layout Elements | Repeated rounded rectangles dominate the primitive vocabulary.                                                     | Reintroduce lines, flat bands, and whitespace as grouping tools.                               |
| Consistency           | Component styling is consistent, but semantic meaning is not: resting objects and active controls share elevation. | Tie elevation to hover, focus, drag, selection, and modal layers.                              |
| Modularity            | The four workspace modes are strong modules; the global search does not adapt to them.                             | Scope search vocabulary and creation/edit actions to the active tab.                           |
| Anchor Objects        | The board is the natural Work anchor, but three signal cards sit in front of it.                                   | Let the Kanban begin immediately beneath the contextual toolbar.                               |
| Z/F patterns          | This is a dense operating surface, so an F-pattern is more appropriate than a marketing-style Z-pattern.           | Identity and active work lead the first rows; tabs and tools lead into scan-friendly content.  |

## Approved Tier 1 implementation

### 1. Truthful active-now and recommended-next states

- Derive `Active now` from actual `in_progress` tasks.
- Make the active task openable and use a clear empty state when no task is active.
- Label `project.next_step_short` as `Recommended next`, not `Now`.
- Give the recommendation an explicit `Plan` action through the existing project-aware BuildOS
  chat.

This corrects hierarchy and action semantics (**P4, P6, P13, P22**).

### 2. Compact persistent shell

- Merge project navigation, identity, status, and secondary tools into one compact first row.
- Clamp the description to one line on larger screens and omit it from the constrained mobile
  shell.
- Replace the four-cell summary card with a concise status line for completion, attention, and the
  next checkpoint.
- Remove duplicated document/risk totals from the persistent header; their tabs own those counts.

This reduces shell weight while keeping essential orientation (**P3, P4, P22**).

### 3. Contextual tab toolbar

- Move search into the active workspace mode.
- Scope search types and placeholder language to Work, Overview, Docs, or Activity.
- Place `New task`, `Edit project`, or `New document` next to search only where relevant.
- Remove duplicated create/edit actions from the content cards that no longer own them.

This improves modularity, proximity, and target placement (**P3, P6, P13**).

### 4. Flat Work surface

- Remove the three signal cards and their cursor glow.
- Remove the Kanban's outer card treatment while preserving its familiar columns and task cards.
- Use lines and whitespace for the board boundary instead of another rounded, shadowed shell.

This keeps one earned anchor object and reverses a flourish that no longer improves comprehension
(**P2, P4, P14**).

### 5. Stateful elevation and mobile priority

- Remove resting task-card shadows; restore elevation on hover, keyboard focus, drag, and completion
  feedback.
- Start the narrow-screen board with `In progress`, followed by scheduled and overdue work, while
  preserving the familiar desktop column order.
- Add horizontal snap points so mobile users land on complete columns.
- Use neutral, passing-contrast micro-labels in this workspace.

This turns style into feedback and preserves the board's spatial model (**P1, P11, P13, P19**).

## Target layout

### Desktop

```text
← Projects   [icon] Project name · status · one-line description                 Graph

ACTIVE NOW  [actual in-progress task →]      RECOMMENDED NEXT  [project guidance] [Plan]
31% complete · 8 overdue · Next checkpoint Sep 29

Work        Overview        Docs 26        Activity
Search tasks…                                                  New task
───────────────────────────────────────────────────────────────────────────────
Backlog             In progress          Scheduled            Overdue        →
task                task                 task                 task
```

### Mobile

```text
← Projects                  Graph
[icon] Project name · status

ACTIVE NOW
[actual in-progress task →]

RECOMMENDED NEXT                         [Plan]
[project guidance]

31% complete · 8 overdue · Sep 29 checkpoint
Work   Overview   Docs 26   Activity      →
Search tasks…                     [+]
────────────────────────────────────
In progress         Scheduled          →
```

## Deliberate trade-offs

- The recommendation remains project-authored guidance rather than being guessed into a task
  relationship. `Plan` opens the existing project-aware agent instead of pretending the string is
  a structured entity.
- Desktop keeps the conventional Backlog-first board order. Only narrow screens prioritize current
  work, because their viewport can show roughly one column at a time.
- Task cards remain cards: each is an independently actionable, heterogeneous work object. The
  cleanup removes parent-card nesting and resting elevation instead of flattening the board into a
  table.
- Overview, Docs tree internals, and Activity-row density remain candidates for Tier 2. Tier 1
  first fixes the global hierarchy that affects every mode.

## Tier 2 implementation — shipped 2026-07-22

Tier 2 applies the same hierarchy correction inside the three remaining dense modes. Useful
boundaries remain, but each boundary now communicates structure instead of generic containment.

### 1. Overview becomes a project brief, not a card dashboard

- Let the description lead as one full-width brief with status, start, and target dates in a quiet
  metadata rail rather than three nested fields.
- Turn Direction, Milestones, Watchlist, and Coming up into flat chapters separated by rules and
  whitespace. Entity rows keep their full click targets, but lose the enclosing shadow/card layer.
- Keep Project memory as an independently actionable knowledge object, while removing repeated
  next-step copy already owned by the persistent focus band.

This strengthens proximity and F-pattern scanning while applying **P2, P4, P6, P13, and P22**.

### 2. Recent document context moves before the tree on mobile

- Place recently updated documents above the tree on narrow screens so users get immediate context
  before entering a potentially deep hierarchy.
- Render that context as a compact horizontal rail on mobile and a quiet ruled sidebar on desktop,
  instead of another shadowed card.
- Keep the production document tree as the authoritative document workspace and preserve all of its
  create, move, archive, keyboard, and permission behavior.

This improves mobile information scent without duplicating document ownership (**P1, P4, P13**).

### 3. Activity becomes a timeline and due-next list

- Present change history as a continuous timeline/list with one strong entity title, one actor/action
  line, and a separately aligned time cue.
- Present upcoming work as a sibling list rather than a second grid of mini-cards.
- Keep the mobile History / Up next switch because one list at a time is more usable at phone width;
  keep bounded loading and the existing `Load more` contract.

This makes chronology and action more scannable while preserving the Activity data model
(**P4, P11, P13, P20**).

### Tier 2 trade-offs to preserve

- Entity rows remain 44 px or taller. Reducing card chrome should not reduce target size.
- The document tree is not flattened; hierarchy is the content on that surface, not decorative
  containment.
- Activity keeps two columns on desktop because history and upcoming work answer different
  questions. Their visual treatment becomes quieter, but they are not merged into one chronology.
- Project memory remains available in Overview, but the persistent `Recommended next` band is the
  only place where project-authored next-step guidance is repeated globally.

### Tier 2 measured result

- **Overview:** the desktop panel contains zero shadowed descendants. Its full-width brief measured
  approximately **113 px** high at 1440 × 900; the same brief measured approximately **230 px** at
  390 × 844 as metadata stacked into a readable three-column rail. Direction, Milestones,
  Watchlist, Coming up, and Project memory use rules and whitespace rather than parent cards.
- **Project memory:** the flat variant has no shadow or radius, keeps a visible top rule, and omits
  the duplicated `Next step` block. The persistent focus band remains the single global owner of
  recommended-next guidance.
- **Docs:** at 390 × 844, recent context begins at approximately **559 px** and the document tree at
  approximately **671 px**. The recent-document rail uses `x mandatory` snapping and the page has
  no viewport-level overflow. At 1440 × 900, the recent context is a right-hand ruled sidebar with
  no shadow; the production tree remains the wide primary surface.
- **Activity:** the workspace shell and sections have no resting shadow or radius. Mobile upcoming
  rows measured approximately **58 px** high, retain their full-width targets, and align relative
  time on a separate right edge. The page has no viewport-level overflow.
- The visual pass used the real production components with representative fixture data because the
  local browser session did not have an authenticated project session. Activity history therefore
  remained covered by its focused component tests rather than a populated live-history screenshot;
  no production route or data contract was replaced by the fixture.

## Edge-state hardening — shipped 2026-07-22

The post-Tier 2 review exercised the states most likely to break a restrained workspace: no project
content, unusually long identity copy, and dense direction lists.

- The project identity now has a complete shrink-safe flex path, so a long project name truncates
  inside the available header width instead of pushing status or primary controls off-screen. The
  browser title also uses the production-facing `Project · BuildOS` form rather than calling the
  page a prototype.
- Briefs longer than 320 characters or spanning at least five lines start at a five-line summary.
  A 44 px `Read full brief` control exposes the complete text and can collapse it again. Short
  briefs remain untouched, so progressive disclosure adds no ceremony to normal projects.
- Direction now reports the actual goal and plan totals. Its supporting copy no longer claims that
  milestones live in the section when they have their own chapter.
- Empty Overview chapters use flat 44 px rows instead of five dashed mini-cards. This preserves
  orientation and icon cues without making absence the dominant visual object.
- An empty Docs workspace no longer repeats `No documents yet` in a second recent-context region or
  reserve an empty desktop sidebar. The document tree keeps sole ownership of that state.

### Edge-state evidence

- At 390 × 844, the empty Overview had no viewport overflow. Its five empty rows each measured
  **44 px**, with no border, radius, or shadow; the full Overview contained zero shadowed
  descendants.
- Focused component tests cover the long-name/long-brief disclosure, a 12-goal/8-plan direction
  list, the five-item initial goal limit and explicit expansion, flat empty rows, and the absence of
  a redundant recent-documents region.
- The representative fixture was temporary and used only for local visual inspection. It was not
  added to the product route map, and the permanent tests render the production workspace
  component directly.

### Edge-state trade-offs

- The long brief is visually clamped, not truncated at the data layer; assistive technology and the
  disclosure control retain access to the complete project-authored text.
- Dense direction lists still begin with five goals and five plans. Showing everything by default
  would make Overview a second backlog, while the explicit count and `Show all` action preserve
  completeness.
- Empty chapters remain present rather than disappearing. Their flat rows explain the information
  architecture and next expected content without recreating a dashboard of empty cards.

## Verification result

- The official Svelte analyzer reports no correctness issues in the three edited components. Its
  remaining suggestions describe existing intentional patterns: roving-tab element references,
  debounced async search state, optimistic task mirrors, and reassigned `Set` instances.
- `pnpm --filter @buildos/web check`: **0 errors and 0 warnings**.
- Focused `PulseStrip` tests: **4 tests passed**, covering workspace labels, empty and populated
  history states, and bounded `Load more` behavior.
- Full web Vitest run: **426 files and 2,661 tests passed**.
- Prettier and `git diff --check`: clean for the touched files.
- Authenticated desktop and narrow-screen passes covered Work plus the contextual Overview, Docs,
  and Activity toolbars. No application console errors were recorded; the local preview did log a
  Vite websocket connection failure unrelated to the page.
- At 1801 × 831, the project header ends at approximately **329 px** and the Kanban begins at
  approximately **421 px**, compared with ~409 px and ~619 px before this pass.
- At the audited 520 × 1125 CSS viewport, the project header ends at approximately **379 px** and
  the Kanban begins at approximately **459 px**, compared with ~583 px and ~939 px before this pass.
- The narrow page has no viewport-level horizontal overflow. The Kanban has its intended internal
  overflow, reports `x mandatory` scroll snapping, and visually orders `In progress`, Scheduled,
  Overdue, then Backlog.
- The populated project renders different actual and recommended text, proving the semantic split:
  `Finish and ship the 9takes homepage reimagination` versus
  `Finish homepage reimagination, then clear one supervised publish-gate blocker.`
- The neutral micro-label color measures approximately **5.26:1** on the live light focus band. The
  same design tokens calculate to approximately **6.16:1** in dark mode, both above the 4.5:1 target
  for small text.

## Persistent shell simplification — shipped 2026-08-14

A subsequent review with a populated 90-item project showed that the July shell correction stopped
one layer too early. `Active now`, `Recommended next`, completion, overdue, and blocked signals still
formed two navigation-like bands before the actual workspace tabs. On Docs and Activity in
particular, those execution signals made the primary mode switcher look tertiary.

The approved Tier 1 follow-up makes the persistent shell answer only two questions: which project is
open, and which workspace mode is active.

- Removed the global Active now / Recommended next band. Work and Overview remain the semantic owners
  for execution focus and project guidance respectively (**P3, P4, P22**).
- Removed the global completion, overdue, blocked, and milestone summary row. Those signals no longer
  compete with navigation or appear on modes that cannot resolve them (**P4, P22**).
- Moved Work, Overview, Docs, and Activity immediately beneath project identity in their own quiet
  ruled surface. Tabs now have 48 px targets, a stronger active rule, and an active count treatment
  without adding another card container (**P3, P13, P19**).
- Added one compact `Brief` action that opens the canonical START HERE/context document through the
  existing document modal and URL-owned entity history. It does not clone document content into a new
  persistent surface (**P6, P8, P13, P20**).
- Demoted Graph from an outlined peer action to a ghost secondary tool while preserving its named
  desktop affordance and 44 px icon target on constrained widths (**P4, P8, P13**).
- Left the four tab interiors and their contextual toolbars unchanged. This pass deliberately proves
  the shell hierarchy before relocating execution signals inside Work or reconciling the Overview
  description with START HERE.

### Follow-up verification

- Focused workspace tests cover the simplified shell, absence of the two removed bands, tab order,
  and the Brief shortcut's document URL contract: **4 tests passed**.
- The official Svelte analyzer completed without a correctness finding;
  `pnpm --filter @buildos/web check` reports **0 errors and 0 warnings**. Prettier and
  `git diff --check` are clean for the touched files.
- The authenticated 9takes Docs workspace was verified at the app's 1920 × 1200 desktop rendering.
  The project header ends at approximately **217 px**, the 49 px tab row spans **168–216 px**, and
  the contextual toolbar begins at approximately **241 px**. Neither removed band exists in the DOM.
- At the audited 520 × 1125 narrow rendering, the header ends at approximately **187 px**, tabs span
  **138–186 px**, and the contextual toolbar begins at approximately **199 px**. The page has no
  viewport-level horizontal overflow; Brief and Graph each retain a **44 × 44 px** target.
- Activating `Brief` opened `START HERE - 9takes` in the production document modal and added
  `entity=document&entity_id=<context-document>` while preserving `view=docs`, confirming that the
  shortcut does not disrupt the selected workspace mode or Back-owned modal history.
- Desktop and narrow dark-mode captures are complete. A refreshed light-mode capture remains owed;
  the only browser-console findings were existing Vite development warnings about Node modules being
  externalized, with no application error emitted by this interaction.

## Work workflow simplification — shipped 2026-08-14

The populated 9takes board made the remaining recognition problem concrete: seven peer columns mixed
four persisted workflow states with two due-date views and one storage state. `Scheduled`, `Overdue`,
and `Archived` looked like places work moved through even though the first two are derived from dates
and the last is secondary recovery/storage. The Work tab now matches the familiar workflow users
already recognize.

- Replaced the seven always-visible columns with `Backlog → In progress → Blocked → Done`. Scheduled
  todo work remains in Backlog; overdue work remains in its persisted workflow stage, with its date
  signal on the card. Existing PATCH, archive, restore, optimistic-update, and completion-feedback
  paths remain unchanged (**P4, P6, P22**).
- Moved `Overdue` and `Scheduled` into one Filters disclosure. Selected filters remain visible as
  removable chips, support an OR combination, and retain their authoritative derived-bucket counts
  (**P7, P13, P22**).
- Moved `Archived` behind a secondary 44 px disclosure. Opening it lazy-loads the existing archive
  endpoint and restores the fifth drop target only when someone is intentionally managing removed
  work (**P8, P13, P20**).
- Tightened task cards to a two-line title, one-line description, and one capped metadata row. The
  desktop board now uses all available width for four equal lanes; narrow screens keep snap scrolling
  and begin with In progress before Backlog (**P1, P4, P13**).
- Replaced per-derived-bucket pagination controls with one board-level `Load more` action that retains
  the existing bucket API underneath. When a due filter is active, pagination narrows to the selected
  derived buckets rather than loading unrelated work (**P6, P20**).

### Work follow-up verification

- Three focused board tests cover workflow grouping, combined due filters with visible chips, and
  lazy Archived loading. Together with the five workspace-shell tests, the focused workspace set is
  **8 tests**.
- On the authenticated 9takes project, the default 55-task board grouped into Backlog 27, In progress
  4, Blocked 2, and Done 20 while reporting the existing partial window as 53/55 loaded. Filtering the
  ten overdue tasks yielded 8 / 1 / 1 / 0 across those same four stages; Scheduled reported one task.
- At the default 1890 px desktop viewport, all four lanes measured approximately **298.5 px** and the
  board scroller's client width equaled its scroll width (**1230 px**), so the primary workflow no
  longer hides off-screen.
- At the browser's constrained **487 px** phone rendering, the page had no viewport-level overflow;
  the board retained `x mandatory` snap scrolling, opened on In progress, and the icon-only Archived
  control measured **44 × 44 px**.
- Desktop and phone-width captures were inspected in light and dark mode. Filter, selected-chip,
  Archived, empty-lane, and partial-pagination states were exercised. Console findings were limited
  to existing local Vite websocket and background polling failures; no Work-board application error
  appeared.

## Overview project-map simplification — shipped 2026-08-15

Once the persistent `Brief` action owned Daily Brief and START HERE, the Overview tab still repeated
the project description, status/dates, START HERE memory, and upcoming events before or alongside its
structural content. That made Overview feel like another summary dashboard instead of a distinct,
recognizable mode.

- Kept the familiar `Overview` tab label, but named the interior `Project map` and gave it one plain
  purpose line: see the project's direction, milestones, and risks in one place (**P4, P6**).
- Removed the repeated project brief and status/date rail. Daily context and canonical project context
  remain available through `Brief / Start Here`; the header still owns project identity (**P3, P22**).
- Removed the flat Project memory copy of START HERE and the `Coming up` event chapter. Docs owns
  knowledge and Activity owns events/change history, so each workspace mode now has one job (**P6,
  P22**).
- Renamed `Watchlist` to the literal `Risks`, matching the underlying entity and making the section
  predictable before it is opened (**P6**).
- Replaced the five empty chapter placeholders with three compact, actionable states for Direction,
  Milestones, and Risks. Secondary setup actions retain 44 px targets and visible focus without
  adding card chrome (**P4, P13**).

### Overview follow-up verification

- Five focused workspace tests pass, including non-duplication of Brief/Activity content, dense
  Direction disclosure, and the compact three-state empty map.
- Prettier and `git diff --check` are clean. The official Svelte analyzer reported only the
  component's pre-existing shallow-history `resolve()` warnings and mature `bind:this` suggestions;
  it found no Overview-specific issue.
- The final package-wide Svelte check reports **0 errors and 0 warnings**. A stale classic-page prop
  from the Work refactor was removed during this pass so the shared desktop board contract remains
  valid in both project routes.
- Authenticated desktop and phone-width visual verification remains owed. The local browser reached a
  connection-refused page before the dev server restarted, after which its URL safety policy blocked
  re-navigation; no alternate browser or bypass was used.

## Docs workspace simplification — shipped 2026-08-18

The Docs tab still split attention between the document tree and a duplicate Recently Updated rail,
then added card chrome, content-presence dots, three levels of automatic expansion, and an open
Archived section. The result looked like a dashboard about documents instead of the familiar place
where people find, open, create, and organize them.

- Renamed the interior from `Project knowledge` to the literal `Project documents` and added one
  purpose line: find, open, and organize the knowledge behind this project (**P4, P6**).
- Removed the Recently Updated / Quick access duplicate. Search and the canonical tree remain the
  only primary discovery surfaces, so a document no longer appears twice in the same viewport
  (**P6, P22**).
- Let the tree occupy the full workspace width and replaced the rounded, elevated workspace card
  with a quiet ruled surface. The classic collapsible Documents section keeps its existing card
  treatment on the original project route (**P2, P3, P22**).
- Removed the decorative content-presence dot while retaining useful Updated metadata and the
  exceptional Public action/badge (**P4, P8**).
- Reduced automatic tree disclosure from three levels to one for this workspace and collapsed
  Archived by default. Both nested and archived documents remain available through explicit,
  familiar disclosure controls; saved user expansion state still takes precedence (**P4, P7,
  P13**).
- Preserved search, New document, opening, drag/reorder, context actions, public sharing, move,
  archive, Unlinked recovery, Archived recovery, polling, and the existing document modals
  (**P13, P20**).

### Docs follow-up verification

- The focused set now has **14 passing tests**: six workspace-shell/content tests, three Work-board
  tests, three document-row control tests, and two new tree progressive-disclosure tests.
- The official Svelte analyzer found no issue in the three shared Docs components. Its findings in
  the workspace component are the existing shallow-history `resolve()` warnings and mature
  `bind:this` suggestions; the full web `svelte-check` reports **0 errors and 0 warnings**.
- Authenticated local verification on the populated Fading Crown project confirmed one **1230 px**
  full-width tree at the 1280 px desktop viewport, eight rendered rows with a **44 px** minimum row
  height, and no Recent rail or content dots.
- At the audited **390 × 844 px** viewport, the document tree measured **372 px** inside the page and
  the document search measured **320 px**. The document hierarchy remained readable with **zero
  horizontal overflow**.
- Console findings were limited to the existing Vite websocket collision and development-time
  module-externalization warnings; no Docs workspace application error appeared.

## Activity chronology simplification — shipped 2026-08-18

Activity already had the right two-part model—past changes beside dated work—but several labels and
controls obscured it. A full-width project-entity finder did not search the activity feed, `Up next`
also contained overdue items, bare numeric counts had no meaning until interpreted, and `via api`
exposed implementation detail in almost every seeded history row.

- Removed the shared entity-search toolbar from Activity. Work, Overview, and Docs retain contextual
  search, while Activity now begins directly with the chronology it owns (**P6, P22**).
- Tightened the purpose line to `See what changed and what is scheduled.` The two desktop regions
  remain Change history and Schedule, preserving a familiar past/future scan (**P4, P6**).
- Renamed `Up next` to `Schedule`, paired it with the calendar icon, and described it as overdue and
  upcoming project dates. Late items no longer sit under a future-only label (**P6, P9**).
- Replaced bare `29` / `7` header numbers with `29 changes` / `7 items`, while keeping compact counts
  inside the narrow History / Schedule switch (**P4**).
- Hid implementation-only `api` and `form` source labels. Human-meaningful provenance such as chat,
  brain dump, and agent call remains visible (**P4, P6**).
- Flattened the hydration placeholder to the same ruled surface as the loaded workspace. Existing
  history pagination, chronological rows, date sorting, overdue emphasis, entity opening, mobile
  roving tabs, reduced-motion behavior, and 44 px targets remain intact (**P2, P11, P13, P20**).

### Activity follow-up verification

- The focused workspace set now has **21 passing tests**: seven workspace tests, six Activity/Pulse
  tests, three Work-board tests, three document-row tests, and two tree-disclosure tests.
- The official Svelte analyzer found no Activity-specific correctness issue. Its remaining output is
  the workspace's existing shallow-history `resolve()` warnings plus mature async-load, reassigned
  state, `Set`, and `bind:this` suggestions. The full web `svelte-check` reports **0 errors and 0
  warnings**.
- Authenticated local verification on Fading Crown confirmed **29 changes** and **7 scheduled items**
  at the 1280 px desktop viewport, with no project search, `Up next`, or `via api` copy and **zero
  horizontal overflow**.
- At **390 × 844 px**, History and Schedule render as 44–45 px roving tabs. Schedule rows measure
  **58 px**, late and future dates remain aligned on the right edge, and the page has **zero
  horizontal overflow**.
- Console findings were limited to the existing Vite websocket collision and development-time
  module-externalization warnings; no Activity application error appeared.

## Overview trajectory and Activity chat reentry — shipped 2026-08-26

The production `/projects/[id]` workspace now makes project progress visible and restores project
conversation continuity without turning Overview back into a card dashboard.

- Reordered the workspace tabs to `Overview → Tasks → Docs → Activity`, made Overview the default
  when no `view` query parameter is present, and renamed the visible `Work` label to the literal
  `Tasks`. The existing `view=work` URL value remains valid for backward-compatible deep links
  (**P6, P13**).
- Added one flat `Project trajectory` surface to Overview. It uses the exact task-window bucket
  totals to render a completion dial and proportional task distribution, so the visual remains
  truthful even when the task records themselves are progressively loaded (**P4, P20, P22**).
- Added a derived trajectory signal that reports completed, planning, clear, or needs-attention
  states from overdue/blocked task totals, missed milestones, and open high-impact risks. It does
  not claim a forecast or invent a completion date (**P4, P19, P22**).
- Added a horizontally scrollable milestone timeline that places the task snapshot's current date
  between project start/target and nearby dated milestones. Milestone points retain 44px-plus
  targets and open the canonical milestone editor (**P1, P8, P13**).
- Added a `Recent chats` region to Activity using the existing project-scoped, access-checked recent
  chats endpoint. Rows show the conversation title, summary, focus, and recency, then reopen the
  saved session in the existing Agent Chat modal (**P4, P8, P13, P20**).

### Verification

- Official Svelte analyzer: both new components report zero issues or suggestions. The workspace
  component reports only its existing shallow-history `resolve()` and mature `bind:this`
  advisories.
- Focused Vitest: **3 files / 10 tests pass**, covering tab order/default state, exact chart totals,
  chart and milestone actions, recent-chat summary/reopen behavior, and the existing workspace edge
  states.
- `pnpm check`: **0 errors and 0 warnings**. Prettier and `git diff --check` are clean for the
  implementation pass.
- Authenticated desktop/phone light/dark visual capture remains owed; this pass verified layout
  contracts statically and through rendered component tests but did not claim a live screenshot
  pass.

## Project search responsiveness and correctness — shipped 2026-08-26

The Tasks search could enter a misleadingly permanent loading state and could return no matches for
tasks already visible on the board. The failure had two independent causes: the debounced Svelte
effect tracked only whether a query was searchable, so changing one valid query to another did not
start a new request; and the generic ontology RPC creator-scoped task matches that should instead be
visible to every project member.

- Made the normalized query, project ID, and active entity types explicit synchronous dependencies
  of the debounced search effect. Every query change now invalidates and aborts the prior request,
  preventing stale results or loading state from surviving a new search (**P4, P20, P22**).
- Added a five-second request deadline with a clear `Try again` action. A delayed backend can no
  longer leave the compact workspace toolbar spinning indefinitely, and reduced-motion loading
  behavior remains intact (**P11, P13, P20**).
- Routed ordinary Tasks-tab text search through a direct, access-checked project task query. This
  searches member-visible titles and descriptions without the creator-only blind spot or the extra
  generic ontology work; task-bucket vocabulary still uses the existing ranked bucket search
  (**P6, P13, P20, P22**).
- Added an explicit accessible name to the combobox while preserving arrow-key selection, Escape,
  clear, result badges, and canonical task opening (**P9, P13**).

### Search verification

- Focused Vitest: **2 files / 11 tests pass**, including consecutive valid queries, stalled-request
  timeout/retry, member-visible task matching, access denial, result ranking, and task-bucket search.
- Official Svelte analyzer reports zero issues. Its suggestions are the expected debounce/fetch
  lifecycle assignments inside the component's request effect.
- Authenticated live verification on the populated BuildOS project returned the correct `twitter`
  results in **880 ms**, then replaced them with the correct `reactivation` results in **734 ms** in
  the same field.
- Scoped ESLint and Prettier checks pass. The full web check reaches an unrelated existing
  `cycles.profile_settings` `FeatureName` mismatch in `admin/feature-flags/+page.svelte`; the search
  files introduce no reported diagnostic.

## Mobile hierarchy and obstruction cleanup — shipped 2026-08-26

An independent adversarial review and a live phone-width pass found that the right information was
present, but the page repeated its structure before revealing it. The Overview intro repeated the
selected tab, six task buckets competed with the completion visual, the signal row restated the
Direction/Risks sections, Docs and Activity repeated their tab names, and the global notification
stack covered the lower quarter of the mobile viewport.

- Removed the visible `Project map`, `Project documents`, and `Project activity` introductions.
  Screen-reader-only panel headings preserve the tabpanel outline where needed, while visible
  content now begins with `Progress`, the document tree, or `Recent chats` (**P4, P6, P22**).
- Renamed the visual surface from `Project trajectory` to the direct `Progress`, moved its status
  into one wrapping line, and removed the duplicate goal/plan/risk signal row (**P4, P6**).
- Collapsed the six implementation buckets into four exact, mutually exclusive business segments:
  Done, In progress, Needs attention (blocked + overdue), and Not started (backlog + scheduled).
  Zero-value segments stay in the chart's accessible label but do not consume visual legend space
  (**P4, P9, P19, P22**).
- Made the four workspace tabs label-only below `sm`, distributed them across the available width,
  hid the scrollbar, and scrolls the selected tab into view after keyboard or pointer selection.
  The tab semantics, roving keys, and 44px-plus targets remain intact (**P1, P9, P13**).
- Reduced the Direction, Milestones, Risks, and Task board headings to one useful line each. Counts
  are retained when they carry information; explanatory subtitles and decorative icon containers
  were removed (**P4, P6, P22**).
- Replaced the mobile notification card stack with one `Review N updates` control. It expands to the
  full, scroll-contained stack on demand and leaves the existing desktop stack unchanged (**P1,
  P11, P13, P20**).
- Resolved all workspace shallow-history destinations through SvelteKit's `resolve()` helper while
  preserving the existing query parameters and modal back-stack behavior (**P13, P20**).

### Mobile cleanup verification

- Independent review agreed on the Tier 1 priorities: remove duplicate introductions and signals,
  use four task segments, allow status text to wrap, compact the board header, and guarantee the tab
  row can reveal its active item.
- At the audited phone viewport, the tab row has **zero internal overflow**, the page has **zero
  horizontal overflow**, and the Progress surface fell from **689 px to 532 px**. The milestone
  timeline now enters the first viewport and the full Overview fell from **1932 px to 1618 px**.
- The collapsed notification surface measures **45 px** high; expansion to **276 px** remains
  reachable and scroll-contained. Docs, Tasks, and Activity also retain zero page-level horizontal
  overflow.
- Authenticated desktop dark, desktop light, and phone dark captures pass. The live populated Tasks
  search returned the correct `twitter` matches and cleared its loading state in **318 ms**.
- Focused Vitest: **5 files / 15 tests pass**. The official Svelte analyzer reports zero issues in
  the route, progress, recent-chat, and notification components; its remaining Task board output is
  mature state/effect and mutable-collection guidance unrelated to this heading-only change.
- Full web `svelte-check`: **0 errors and 0 warnings**. Scoped ESLint, Prettier, and
  `git diff --check` also pass.
