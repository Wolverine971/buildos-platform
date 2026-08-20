<!-- apps/web/docs/technical/components/hyperplexed/PROJECTS_LIST_PAGE_AUDIT_2026-06-26.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-15; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Projects **List** Page — Hyperplexed Design Audit

> Second live application of the [Hyperplexed Design Playbook](./HYPERPLEXED_DESIGN_PLAYBOOK.md).
> Surface: **Projects index** — `apps/web/src/routes/projects/+page.svelte` and its list/filter child
> components. (Companion to [`PROJECT_PAGE_AUDIT_2026-06-26.md`](./PROJECT_PAGE_AUDIT_2026-06-26.md),
> which covered the project **detail** page.)
> Method: audited Hyperplexed-style — **region by region, top to bottom** — grading rendered markup
> against the §1/§2 rubric. Captured 2026-06-26.
>
> **Scope caveat:** static markup audit (the DOM each component emits + its Tailwind/Inkprint classes),
> not a screenshot audit. High confidence on structure (alignment, padding symmetry, overflow, radius,
> motion gating, keyboard a11y, icon-set uniformity). Color/contrast calls in dark mode want a live pass.
>
> **Cross-reference:** the detail-page audit already shipped a shared helper
> `lib/components/project/v2/board-a11y.ts` (`handleRovingTabKeydown` + reduced-motion-aware
> `slideMotion`) and locked a two-radius rule. **This page predates those conventions and adopts none of
> them** — most fixes below are "apply the rule you already wrote, here too."

---

## Surfaces audited

| #   | Surface                                              | File                                                         |
| --- | ---------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Page header + Graph/Overview view toggle (admin)     | `+page.svelte:572-620`                                       |
| 2   | New-Project action row                               | `+page.svelte:656-666`                                       |
| 3   | Stats grid (Current Work · Tasks · Docs · Active)    | `+page.svelte:669-738`                                       |
| 4   | Status count strip (click-to-quick-filter by state)  | `+page.svelte:741-766`                                       |
| 5   | Search & Filters panel (collapsible)                 | `+page.svelte:769-918`, `FilterGroup.svelte`                 |
| 6   | Project rows + recency grouping + secondary sections | `ProjectStateRow.svelte`, `CollapsibleStateSection.svelte`   |
| 7   | Empty states + skeletons                             | `+page.svelte:622-636,925-964`, `ProjectListSkeleton.svelte` |
| 8   | Graph view (admin)                                   | `+page.svelte:1040-1153`                                     |

---

## The headline: strong list rows, weak controls

The **content layer is genuinely good**. `ProjectStateRow` is alignment-safe the way Hyperplexed wants:
`min-w-0` wrappers, `truncate` on title/description/next-step/counts, a `shrink-0` right cluster, and an
arrow that reveals via **opacity** on hover/focus so it never shifts layout (`ProjectStateRow:88-108,129-141`).
Rows are real `<a href>` links (keyboard-operable) and carry a `:focus-visible` affordance. That's the
hard part, and it's done.

The defects cluster almost entirely in the **control chrome above the list** — the toggles, chips, and
filter buttons. And they're the _same five systemic patterns the detail-page audit already named_, just
on a surface that never received the fix. So this is a **"propagate the conventions" audit**, not a new
diagnosis. The one genuinely new finding is **icon-set inconsistency** (§N1).

---

## Part 1 — Systemic patterns (same rules as the detail audit; apply them here)

### S2. ⛔ "Selected" is signaled **four different ways** on one screen _(highest leverage here)_

**Rubric:** Readability (active vs inactive must be obvious) + Color (one restrained accent).

This page stacks four independent "active control" treatments within ~600px of vertical space:

| Control                               | Active treatment                                            | Ref                     |
| ------------------------------------- | ----------------------------------------------------------- | ----------------------- |
| Header Graph/Overview toggle          | `bg-accent text-accent-foreground shadow-ink`               | `+page.svelte:597-599`  |
| Status count strip                    | `bg-accent/15 text-accent font-semibold`                    | `+page.svelte:753`      |
| Ownership segmented (All/Mine/Shared) | `bg-card text-foreground shadow-ink` (no accent)            | `+page.svelte:844`      |
| State/Context/Scale/Stage chips       | `border-accent bg-accent text-accent-foreground shadow-ink` | `FilterGroup.svelte:40` |

Four "you-selected-this" languages: solid-accent, accent-tint, neutral-card, and bordered-accent. The
detail audit's S2 fix was "pick **one** active treatment and apply it identically to every tab/pill."
That same convention should govern this page. Recommend: solid-accent fill for the two true _toggles_
(header view, ownership), accent-tint for the multi-select _filter chips + count strip_ — i.e. two
deliberate tiers (mode vs filter), not four accidental ones.

### S3. `focus-visible` rings are missing on **every control except the list rows**

**Rubric:** Motion & A11y — _"operate this entire flow via my keyboard."_

`ProjectStateRow` models the right pattern (`:focus-visible` inset accent shadow). Nothing else copies it.
All of these carry only `pressable` (a press-scale token, **not** a focus token):

- Header view-toggle buttons (`+page.svelte:596,608`)
- Status count-strip buttons (`+page.svelte:752`)
- Filters-panel toggle (`+page.svelte:772`)
- Ownership segmented buttons (`+page.svelte:842`)
- FilterGroup chips (`FilterGroup.svelte:38`)
- Clear-all-filters button (`+page.svelte:909`)
- CollapsibleStateSection header toggle (`CollapsibleStateSection.svelte:63`)

**Note (accuracy):** unlike the detail page, there is **no roving-tabindex-without-arrows bug** here — the
count strip and segmented controls are independent `<button>`s, each Tab-reachable. So the keyboard gap is
narrower: it's purely the **missing focus ring**, not unreachable elements. Fix is one `focus-visible:ring-2
focus-visible:ring-ring` utility swept across the seven controls above. (Optional polish: give the two
segmented controls real `role="tablist"`/`radiogroup` + arrow keys via the existing
`handleRovingTabKeydown` helper — but that's an enhancement, not a blocker.)

### S4. Corner-radius drifts below the locked two-radius rule

**Rubric:** Geometry — consistent corner-radius language. (Detail audit locked: `rounded-lg`
cards/containers/dropdowns, `rounded-md` inner controls/chips/skeleton placeholders.)

Offenders that use **bare `rounded`** where the rule says `rounded-md`:

- Status count-strip buttons — `rounded` (`+page.svelte:752`)
- Ownership segmented inner buttons — `rounded` (`+page.svelte:842`)
- Inline fallback-skeleton placeholders — `rounded` (`+page.svelte:630-632`)

Plus one container/inner inversion: the **stats-grid skeleton bars** use bare `rounded` (`:679,696,713,730`)
while `ProjectListSkeleton` correctly uses `rounded-md` (`ProjectListSkeleton:18-22`) — two skeleton
languages on one page (see §S-NEW below).

### S5. `prefers-reduced-motion` is **never** gated on this page

**Rubric:** Motion & A11y — respect reduced-motion.

The detail page gates its hydration fades on `prefersReducedMotion`; **this page imports no such guard at
all.** Everything animates unconditionally:

- `animate-spin` title loader (`+page.svelte:580`)
- `animate-pulse` on all stats skeletons + inline fallback skeleton (`:679,696,713,730,629`)
- `transition-transform` chevrons — filters panel (`:791`) and CollapsibleStateSection (`:87`)
- `transition-all duration-200` filter-panel grid collapse (`:799`) and header toggle (`:596,608`)

**Fix:** `motion-reduce:animate-none` on the spinner + pulses; `motion-reduce:transition-none` on the
chevrons and the collapse grid. (No `transition:slide` here, so `slideMotion()` isn't needed — the CSS
`motion-reduce:` variants cover it.)

---

## Part 1b — New systemic finding unique to this page

### N1. ⛔ Mixed icon sets — hand-rolled inline SVGs amid an all-lucide page

**Rubric:** Color & Icons — _"one uniform icon set... it's crazy how much of a difference better icons
can make."_

The page imports lucide icons (`LoaderCircle, Plus, SlidersHorizontal, ChevronDown`) and uses lucide
throughout the rows/chips — then **hand-rolls two raw `<svg>` paths**:

- The search-field magnifier (`+page.svelte:813-826`) — should be lucide `Search`.
- The empty-state folder glyph (`+page.svelte:932-945`) — should be lucide `Folder`/`FolderOpen`.

These render at a different stroke weight/optical style than the lucide set sitting inches away, and they
bypass the `src/lib/icons/lucide.ts` alias the rest of the app routes through. Swap both to lucide for a
uniform stroke language. (Cheap, high "polish" signal — exactly his "better icons" point.)

---

## Part 2 — Per-surface findings

Severity: **High** = breaks readability/behavior-legibility or blocks keyboard use · **Med** = polish
gap · **Low** = nitpick. Items folded into S2–S5 / N1 are tagged and not repeated in full.

### Surface 1 — Header + view toggle (admin)

| Sev | Region        | Defect                                                                                    | Fix                                |
| --- | ------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| Med | View toggle   | No `focus-visible` ring (→S3); active uses solid-accent — one of four active styles (→S2) | Ring + unify active treatment      |
| Low | Title spinner | `animate-spin` ungated (→S5)                                                              | `motion-reduce:animate-none`       |
| Low | Toggle a11y   | `<nav>` + `aria-pressed` buttons; functions as a tablist but isn't one                    | Optional `role="tablist"` + arrows |

**Strengths:** micro-label pattern + `text-accent` restraint; title `line-clamp` not needed (single word);
toggle container is correct `wt-card` (rounded-lg) wrapping `rounded-md` inner buttons — radius rule
already satisfied _here_.

### Surface 2 — New-Project action row

| Sev | Region       | Defect                                                                                                                                     | Fix                                      |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Med | Button style | Six one-off color overrides on `<Button variant="outline">` (`border-accent/30 bg-card text-accent…` `:662`) re-implement a variant inline | Promote to a real Button variant / token |
| Low | Placement    | Primary creation action is a small outline button parked top-right — hardest mobile thumb reach, low prominence                            | Consider sticky/bottom create on mobile  |

**Strengths:** `whitespace-nowrap` so the label never wraps; lucide `Plus` icon (uniform).

### Surface 3 — Stats grid

| Sev | Region          | Defect                                                                                                                                       | Fix                                                             |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Low | Texture variety | Four different textures across four sibling cards (`tx-frame/grain/thread/pulse` `:671,688,705,722`) read as decorative variety, not meaning | Use one texture; reserve variation for the accented ACTIVE card |
| Low | Skeleton bars   | Bare `rounded` + ungated `animate-pulse` (→S4, S5)                                                                                           | `rounded-md` + `motion-reduce:`                                 |

**Strengths:** disciplined hierarchy — only the ACTIVE card carries accent (`border-accent/30 bg-accent/5`

- accent number), so the eye lands on the one meaningful stat; micro-label sizing consistent across all four;
  zero-layout-shift skeletons sized to the real numbers.

### Surface 4 — Status count strip

| Sev | Region         | Defect                                                                                                                                                | Fix                                                                              |
| --- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Med | Duplicate path | Filtering by state lives **twice** for admins — this strip (single-select quick filter) _and_ the "State" FilterGroup (multi-select) inside the panel | Merge: make the strip the canonical state filter, or drop "State" from the panel |
| Med | Active style   | `bg-accent/15 text-accent` — third of four active treatments (→S2)                                                                                    | Unify                                                                            |
| Low | Geometry/focus | Bare `rounded` (→S4); no `focus-visible` (→S3)                                                                                                        | `rounded-md` + ring                                                              |

**Strengths:** counts ignore the state filter so users see how much work sits elsewhere and can swap —
genuinely good IA; `disabled` on zero-count states with muted styling; `aria-pressed` wired.

### Surface 5 — Search & Filters panel

| Sev | Region              | Defect                                                                                                  | Fix                                |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Med | Search icon         | Hand-rolled inline `<svg>` magnifier amid all-lucide page (→N1)                                         | lucide `Search`                    |
| Med | Ownership segmented | `bg-card` active (no accent) = 2nd-of-4 active styles (→S2); inner `rounded` (→S4); no focus ring (→S3) | Unify active + `rounded-md` + ring |
| Med | Filter chips        | 4th active style (→S2); no focus ring (→S3)                                                             | Unify + ring                       |
| Low | Search field        | `rounded-lg` input vs `rounded-md` inner-control rule; no clear-(✕) button unlike the detail combobox   | Confirm radius intent; add clear   |
| Low | Panel motion        | Collapse `transition-all` + chevron `transition-transform` ungated (→S5)                                | `motion-reduce:transition-none`    |

**Strengths:** the whole filter set is correctly consolidated behind **one expandable "Search & Filters"
button with a selected-count badge** — this is _exactly_ Hyperplexed's "collapse into one Filters button
that expands, with selected-state chips" pattern, done right (`:769-795`). `aria-expanded`/`aria-controls`
wired; `FilterGroup` cleanly de-duplicates four filter blocks.

### Surface 6 — Project rows + recency + secondary sections

| Sev | Region           | Defect                                                                                                                                                                                                                               | Fix                                                                            |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Low | Title/chip wrap  | Title+chip+shared-badge container is `flex-wrap` (`ProjectStateRow:49`) — on narrow widths the chip drops below the title, raising row height                                                                                        | Keep title on its own line; chips below by design, or `flex-nowrap` + truncate |
| Low | Hover-only arrow | Arrow is `opacity:0` until hover/focus — never appears on touch (`ProjectStateRow:129-141`)                                                                                                                                          | Fine (row is the link); optional always-on at low opacity on mobile            |
| Low | Section toggle   | CollapsibleStateSection header lacks `focus-visible` (→S3); chevron ungated (→S5)                                                                                                                                                    | Ring + `motion-reduce:`                                                        |
| Low | Code dup         | `.project-recency-separator` style block + recency-render path duplicated in both `+page.svelte:1164` and `CollapsibleStateSection:96-113,128`; the primary tier renders inline, so the component's recency path is effectively dead | Consolidate into one component path                                            |

**Strengths:** this is the well-built surface — overflow handled everywhere (`truncate` ×4 fields,
`min-w-0`, `shrink-0` right cluster), real `<a>` links, opacity-reveal arrow (no layout shift),
size-based hierarchy (`text-xl` primary / `text-lg` secondary), contained `ProjectIcon`, and a
`:focus-visible` affordance the rest of the page should copy.

### Surface 7 — Empty states + skeletons

| Sev  | Region            | Defect                                                                                                                                                                                                                                                                                                                                                         | Fix                                                                              |
| ---- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| High | Skeleton mismatch | Two different skeleton shapes for the same content: the **inline fallback** (when `projectCount` is 0/unknown) is a **3-col grid of cards** (`:627-635`), but the real list is a **vertical dossier list** and `ProjectListSkeleton` matches it. The fallback guarantees a layout-shape jump — contradicting the file's own "Zero layout shift" header comment | Make the fallback render `ProjectListSkeleton` (or a 3-row vertical placeholder) |
| Med  | Empty-state icon  | Hand-rolled folder `<svg>` (→N1)                                                                                                                                                                                                                                                                                                                               | lucide `Folder`                                                                  |
| Low  | Fallback skeleton | Bare `rounded` + ungated `animate-pulse` (→S4,S5)                                                                                                                                                                                                                                                                                                              | `rounded-md` + `motion-reduce:`                                                  |

**Strengths:** `ProjectListSkeleton` is shape-accurate (`rounded-md`, dossier rows); "No projects yet" is a
proper unglamorous state with icon + copy + primary CTA; the empty copy correctly branches on
"no projects at all" vs "filters hide everything."

### Surface 8 — Graph view (admin)

Low priority (admin-gated). Loading/error/empty states are all present and tailored — good unglamorous-state
coverage. Only carryover: the controls/details panels and graph card inherit S3/S5 gaps if their child
components do; out of scope for this list-page pass.

---

## Part 3 — Recommended fix sequence (one convention at a time)

Each clears multiple Part-2 rows. Most are "import the rule the detail audit already wrote."

1. **S2 — collapse four active styles into two tiers** (mode toggles vs filters). Highest taste payoff;
   touches header toggle, count strip, ownership segmented, FilterGroup.
2. **S3 — `focus-visible` ring sweep** across the seven controls (copy `ProjectStateRow`'s pattern). One
   utility, applied everywhere.
3. **N1 — swap the two inline SVGs to lucide** (`Search`, `Folder`). Cheap, visible uniformity win.
4. **Surface 7 High — unify the loading skeleton** so the fallback matches the vertical list (kills the
   layout-shape jump the file claims it prevents).
5. **S4 — sweep bare `rounded` → `rounded-md`** on count strip, ownership buttons, both skeleton sets.
6. **S5 — `motion-reduce:` variants** on the spinner, pulses, chevrons, and collapse grid (this page gates
   nothing today).
7. **Cleanups:** dedupe the State filter (count strip vs FilterGroup), promote the New-Project button's
   inline color overrides to a variant, consolidate the duplicated recency-separator path.

---

## Part 4 — How this stacks with the detail-page audit

The two audits **rhyme**, which validates the rubric as a repeatable instrument: S2 (active-state
inconsistency), S3 (focus rings), S4 (radius), and S5 (reduced-motion) recur on both surfaces. That's the
Hyperplexed thesis in practice — _"the same small problem wearing different costumes."_ The fixes shipped
for the detail page (the `board-a11y.ts` helper, the two-radius rule, the one-active-treatment rule) are
**conventions the whole app should inherit**, and this page is the next place to apply them.

Two things are genuinely _better_ here than on the detail page: the filter set is already consolidated into
the canonical "one Filters button + count badge + chips" pattern, and the list rows are overflow-/keyboard-
clean out of the box. Two things are _new_: the **icon-set inconsistency** (N1) and the **skeleton-shape
mismatch** (Surface 7 High) — neither appeared on the detail page.

**Next step:** the live dark-mode screenshot pass — confirm the four-active-style collision actually reads
as confusing in pixels (it should), and the stats-grid texture variety call.

---

## Part 5 — Fixes applied (2026-06-26)

Full pass shipped. `svelte-check` clean (0 errors / 0 warnings); Prettier clean. Touched:
`+page.svelte`, `FilterGroup.svelte`, `Button.svelte`, `CollapsibleStateSection.svelte`,
`ProjectListSkeleton.svelte`.

**Systemic:**

- **S2** ✅ Collapsed four active treatments into **two deliberate tiers**: _mode toggles_ (header
  view + ownership segmented) use the solid-accent fill `bg-accent text-accent-foreground shadow-ink`;
  _filter selections_ (status count strip + Context/Scale/Stage chips) use accent-tint
  `bg-accent/15 text-accent` (`border-accent/40` on chips). FilterGroup's old solid-accent active state
  was swapped to the tint tier.
- **S3** ✅ `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset` swept across every
  bare-`pressable` control: header toggle, count strip, filters-panel toggle, ownership segmented,
  FilterGroup chips, clear-filters, and the CollapsibleStateSection header. (No roving-tab bug existed,
  so no keydown helper was needed — confirmed during the audit.)
- **S4** ✅ Bare `rounded` → `rounded-md` on the count strip, ownership buttons, and stats-grid skeleton
  bars. (`ProjectListSkeleton` was already correct.)
- **S5** ✅ Page now respects reduced motion via `motion-reduce:` variants: `animate-none` on the title
  spinner + all skeleton pulses; `transition-none` on the filter-panel collapse grid, header toggle, and
  both chevrons.
- **N1** ✅ Hand-rolled inline `<svg>`s replaced with lucide `Search` (search field) and `Folder`
  (empty state), routed through the standard alias.

**Surface fixes:**

- **Surface 7 High** ✅ The inline fallback skeleton (3-col card grid) now renders `ProjectListSkeleton`
  — same vertical dossier shape as the real list, killing the loading-shape jump.
- **Stats grid** ✅ Texture restraint: cards 1–3 unified to `tx-frame`; the accented ACTIVE card keeps
  its distinct `tx-pulse`.
- **Surface 2 (decided w/ owner)** ✅ New-Project button's six inline accent overrides promoted to a
  reusable `accent` Button variant (`bg-card text-accent border-accent/30` + accent-tint hover).
- **Surface 4 (decided w/ owner)** ✅ Duplicate state filter removed: the always-visible status count
  strip is now the canonical (single-select) state filter; the panel's admin-only multi-select State
  chips were dropped (and the now-unused `availableStates` derived removed). Panel covers
  Context/Scale/Stage only.

**Deferred (low-value / latent):** ProjectStateRow title+chip `flex-wrap` height on very narrow widths;
the latent duplicated `.project-recency-separator` path inside `CollapsibleStateSection` (dead in current
usage — primary tier renders inline); the New-Project mobile thumb-reach placement (a UX change, not a
taste defect). Graph view (Surface 8) left out of scope. Confirm the texture + active-tier calls on the
live dark-mode screenshot pass.

---

## Part 6 — Purpose simplification follow-up (2026-08-14)

### Locked purpose

> Find the project you want to continue, or start a new one.

The authenticated before-pass confirmed that the previous page made four competing systems equally
prominent before the first project: creation, workspace metrics, lifecycle counts, and collapsed
search/filter controls. The follow-up makes the route a project launcher instead of a workspace
dashboard while preserving the underlying data, creation flow, navigation, filters, and admin graph.

### Shipped

- **Header + creation (P1/P4/P6/P13):** removed the `YOUR WORKSPACE` eyebrow, changed the supporting
  line to “Pick up where you left off, or start something new,” and moved the existing agent-chat-backed
  `New project` action into the header. The lazy import and `/projects/create` fallback are unchanged;
  the shared Button primitive retains a 44 px target.
- **One launcher control surface (P4/P7/P8/P13):** search is always visible. `Filters` is a separate,
  keyboard-operable disclosure containing status, ownership, and admin ontology facets. Status choices
  use one URL-synced scope (`current`, `all`, or one lifecycle state), and active filters remain visible
  as individually clearable 44 px chips.
- **List structure (P1/P4/P6/P8):** removed the four metric cards and the always-visible lifecycle
  count strip. Planning and Active now form the default `Current work` list, with every visible row in
  one `updated_at`-descending sequence. The arbitrary 7-day/30-day separators and their duplicated
  render path were removed.
- **Resume-oriented rows (P1/P4/P6):** each row now shows project identity, at most one state/shared
  signifier, one resume cue (`next_step_short` preferred, description fallback), and a relative update
  label backed by `<time datetime>` plus an exact timestamp tooltip. Task/goal/plan/document totals are
  no longer rendered.
- **Historical work (P4/P7/P8):** Completed is one closed-by-default disclosure under the default
  launcher. Completed, Paused, Cancelled, Planning, Active, All, and Current remain directly selectable
  in Filters and deep-linkable with `?state=`. Default search intentionally spans all lifecycle states
  so a known paused or completed project does not disappear.
- **Admin graph (P4/P8):** removed the Graph/Overview mode toggle from the normal launcher. The existing
  admin-only `/projects?view=graph` deep link still loads the graph and now has a clear `Back to projects`
  action. No graph queries or graph components changed.

### Product decisions resolved from evidence

- **Default scope:** `Current work` means Planning + Active. It is the only default lifecycle slice.
- **Creation label:** `New project`. The subcopy describes the result, not a new creation mode; the
  underlying agent-chat creation behavior remains exactly as before.
- **Metrics:** removed from this launch surface. Server-side counts and summary fields remain intact;
  no unproven metrics destination was invented.
- **Search:** global across states only while the default Current scope is selected. Choosing an
  explicit lifecycle state scopes search to that state.
- **Recent subset:** not introduced. No evidence supported a safe cutoff, so all current projects stay
  available in one recency-sorted list.
- **Paused:** filter-only, not a second default disclosure. **Completed:** the one default historical
  disclosure. **Cancelled:** filter-only.

### Open product decision

The permanent home for the admin ontology graph is still unresolved. Evidence supports removing it
from the everyday launcher, but not choosing a new admin navigation destination. The direct deep link
is preserved until that owner/destination decision is made.

### Verification

- Authenticated Chrome pass against the current checkout at `localhost:5176`:
    - desktop dark: `screenshots/projects-list-purpose/after-desktop-dark.png`
    - desktop light: `screenshots/projects-list-purpose/after-desktop-light.png`
    - 390 px phone dark/light: `screenshots/projects-list-purpose/after-phone-dark-390.png` and
      `after-phone-light-390.png`
    - before evidence: `before-desktop-dark.png` and `before-phone-dark.png`
- Confirmed no horizontal overflow at a measured 391 CSS px viewport.
- Confirmed keyboard Tab reaches Filters from Search and Enter opens/closes the disclosure.
- Confirmed `?state=completed`, `?state=paused`, global search finding a paused project, active-filter
  clearing, collapsed Completed, the unchanged `New project flow` agent-chat modal, and the admin-only
  `?view=graph` direct route plus return action.
- Focused project-list logic tests cover scope normalization/matching and relative-time labels.
- No files under `/projects/[id]` or `/projects-v2/[id]` changed.

---

## Part 7 — Color and collaboration hierarchy follow-up (2026-08-14)

The first launcher pass exposed one remaining hierarchy problem: lifecycle chips and next-step text
still borrowed accent/semantic color even though neither item represented an alert or primary action.
That made repeated rows compete with the header action and created a green/yellow/orange color clash.

### Shipped

- **Neutral lifecycle tags (P3/P4):** list-row state chips now use one understated neutral treatment
  (`border`, muted surface, muted text) with normal capitalization and medium weight. Lifecycle meaning
  remains readable and accessible without assigning every row a semantic color.
- **Restrained resume cue (P4/P9):** removed the visible `Next:` prefix. A muted `ListTodo` icon marks
  true next steps; description fallbacks use `AlignLeft`. Screen readers still receive the hidden
  `Next step:` label. Resume text, row arrows, and row hover borders no longer use the accent color.
- **Collaboration metadata (P4/P9):** accepted project membership is resolved with one batched,
  project-scoped query after the streamed summaries load. Projects with more than one active member
  show neutral `Has collaborators` metadata with the relative update time. Shared-with-me projects
  remain truthfully flagged if the membership lookup fails; pending invitations do not count as
  collaborators.
- **Information hierarchy:** project title remains the strongest row signal, state is a quiet local
  qualifier, the resume cue is secondary, and recency/collaboration form one tertiary metadata group.
  Orange remains reserved for the page-level creation action and existing global navigation state.

### Verification

- Authenticated desktop and measured 391 CSS px phone passes in light and dark mode.
- No horizontal overflow; long names and resume cues truncate without displacing metadata.
- Live rows confirmed solo, owned-with-collaborators, and shared-with-me cases.
- Focused project-list suite: 6 tests passing, including collaboration derivation and failure fallback.
- Svelte analyzers: no component issues. Full web `svelte-check`: 0 errors / 0 warnings.
- No application console errors; the occupied shared Vite HMR websocket port produced the expected
  development-only reconnect warning.

### Product decisions

No new unresolved product decision was required. “Has collaborators” means at least two accepted,
active project members; an unaccepted invitation is not presented as a collaborator. The previously
recorded admin-graph destination remains the only open `/projects` launcher decision.

---

## Part 8 — Stable recency-column follow-up (2026-08-14)

The final hierarchy pass makes row recency a fixed spatial standard instead of responsive metadata
that moves between corners. This improves high-density scanning without adding another visual system.

### Shipped

- **One metadata anchor (P1/P4):** the relative update time now owns the top-right corner of every
  project row at every breakpoint. When a project has collaborators, `Has collaborators` sits directly
  beneath it in the same right-aligned column.
- **Metadata, not another badge (P4/P9):** collaboration uses a small neutral icon and muted text with
  no border, fill, or semantic color. The lifecycle state remains the row's only chip.
- **One navigation affordance (P4/P7):** removed the redundant hover-only trailing arrow. The entire
  row remains a link with the existing hover/focus treatment, so the right edge can carry information
  instead of competing decoration.
- **Compact phone behavior (P1/P6):** the same top-right hierarchy is retained at a measured 391 CSS
  px width. Long project titles truncate earlier by design; resume cues retain their own full-width
  line below and the existing title tooltip preserves the full project name.

### Verification

- Authenticated desktop light/dark and measured 391 CSS px phone light passes confirmed the same
  top-right recency/collaboration order and no horizontal overflow.
- Focused project-list suite: 6 tests passing. Svelte analyzer: no issues or suggestions. Full web
  `svelte-check`: 0 errors / 0 warnings.
- No files under `/projects/[id]` or `/projects-v2/[id]` changed by this work.

### Product decisions

No new unresolved product decision was required. Further reduction of the weak paper texture would be
a brand-density preference rather than an evidence-backed hierarchy fix, so it remains unchanged.

---

## Part 9 — Alignment and dense-launcher follow-up (2026-08-14)

### Tier 1 — shipped

- **Remove the phantom icon gutter (P1/P9):** `ProjectIcon` is intentionally disabled globally, but
  each launcher row still rendered an empty flex child and its gap. Removing that dead slot aligns the
  title and resume cue to the card's real content inset and returns 10–12 px to long names.
- **Use dense-mode row padding (P1):** removed the desktop-only `p-4` override so launcher rows use the
  same 12 px inset at every breakpoint. Solo rows now measure 77 px instead of 85 px; collaborator rows
  measure 82 px instead of 90 px while retaining the same two-line hierarchy.
- **Neutralize section metadata (P4/P6):** `Current work`, its count, and its helper now use neutral
  metadata styling. The helper was shortened to `Planning and active · Newest updates first`, leaving
  accent color to actions, selected controls, and global navigation.
- **Remove dead row chrome:** removed the unused `group` class and the redundant wrapper left behind by
  the disabled icon slot.

### Tier 2 — no additional fix justified

Creation, visible search, the one Filters disclosure, recency ordering, and the Completed disclosure
now form a coherent launcher. Consolidating them further would hide useful behavior or change product
scope rather than clean the existing hierarchy.

### Tier 3 — intentionally deferred

No signature effect was added. The weak Inkprint texture is the surface's one remaining brand texture;
additional hover lighting, motion, or decoration would compete with list scanning.

### Verification

- Authenticated desktop and measured 391 CSS px phone passes in light and dark mode.
- Project title and resume cue share the same content edge; the former empty child measured 0 px but
  still consumed the 12 px flex gap before removal.
- No horizontal overflow at 391 CSS px. The right-aligned recency/collaboration column and existing
  title/resume truncation remain intact.
- Browser console contained only the known development HMR websocket collision; no application error
  was introduced.
- Focused project-list suite: 6 tests passing. Targeted ESLint: clean. Full web `svelte-check`: 0
  errors / 0 warnings.
