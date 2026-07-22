<!-- apps/web/docs/technical/components/hyperplexed/PROJECT_WORKSPACE_V2_TILDA_REASSESSMENT_2026-07-22.md -->

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
