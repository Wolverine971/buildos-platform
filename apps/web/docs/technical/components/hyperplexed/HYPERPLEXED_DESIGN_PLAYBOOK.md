<!-- apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_DESIGN_PLAYBOOK.md -->

# Hyperplexed Design Playbook

> Distilled UI/UX taste and method extracted from the [Hyperplexed](https://www.youtube.com/@Hyperplexed)
> YouTube channel, for use when auditing and polishing BuildOS surfaces.
>
> **Source:** 13 transcribed videos (the design-judgment "I Redesigned Popular Websites" series, the
> bad-UI/good-UX commentary videos, and the signature interaction-effect tutorials) plus frame review
> of two videos. Raw transcripts live in `./transcripts/`.
>
> **Why this exists:** Hyperplexed is the clearest working demonstration of _front-end taste_ on YouTube —
> not "here's a framework," but "here's exactly why this looks wrong and here's the small change that fixes it."
> His redesign videos narrate the _reasoning_ behind every micro-decision, which is precisely what an audit needs.
> Captured 2026-06-26.

---

## 0. How Hyperplexed actually works (the method)

These four habits matter more than any single rule. They're how he _finds_ the problems below.

1. **One feature at a time, top to bottom.** He breaks a page into discrete features and fixes each in isolation
   before moving on. He never tries to "redesign the page" — he redesigns the header, then the search, then the
   filters, then the bottom bar. _Audit the same way: enumerate surfaces, then go region by region._
2. **"All big problems are just small problems in disguise."** Build the crudest working version first (a white
   square that follows the mouse), then layer refinements one at a time. Every polished effect is a stack of
   tiny, individually-obvious steps. _When something feels too broken to fix, you haven't decomposed it yet._
3. **Steal taste from the best, on purpose.** He doesn't invent aesthetics — he keeps a reference library and
   adapts. Named references: **Linear, Vercel, Superlist, Mobbin, Google's Android app-drawer rounding,
   YouTube Music's subtle background gradients, Discord's vertical nav, Vercel's gradient-in-text/border.**
   He treats **Linear and Vercel as the explicit bar for "exceptional UI."**
4. **Two goals held together: "make it look good AND make it easy to use."** He refuses to optimize one at the
   expense of the other. Decluttering is in service of usability, not just minimalism.

---

## 1. The taste checklist (use this as the audit rubric)

Each item is a recurring, named complaint from the redesign videos. These are the things his eye catches.

### Alignment & geometry

- [ ] **Alignment is sacred — it's his #1 recurring complaint.** Anything that doesn't align with something else
      reads as a defect. Classic example: a label wraps to a second line and pushes its image out of alignment
      with its row → switch the card to landscape and enforce a char-limit/ellipsis instead of letting it wrap.
- [ ] **A label must never knock its icon out of alignment.** When one item in an icon row has extra text and the
      rest don't, the icon shifts and the row looks broken. Fix the data, not by eyeballing.
- [ ] **Consistent corner-radius language.** Don't round most components and leave one square (his Google-doodle
      complaint). Advanced move: the **Android app-drawer trick** — larger radius on outer corners, smaller on
      inner corners, with a small gap between grouped elements.
- [ ] **`box-sizing: border-box`** so padding/border don't blow out intended widths (his nav-section thirds).

### Spacing & density

- [ ] **Even padding on all sides.** "The spacing around your search bar is different on each side" is an instant tell.
- [ ] **Kill unnecessary vertical space.** Narrow menus force text to wrap and waste height; widen the container.
- [ ] **No orphan padding.** Delete defensive padding that only existed for one edge case (the iOS fixed-bottom
      gap that "looks absolutely awful on phones where it's not necessary").
- [ ] **Don't squeeze images** with uneven padding above/below — size them so they "feel like they belong."

### Hierarchy & grouping

- [ ] **Differentiate with size/weight/color, not more elements.** Shrink a clumsy parenthesized date into a
      subtitle; style city/state/zip as subtext under the main address. "Don't make everything the same size and color."
- [ ] **Logo/element proportion must feel balanced** relative to neighbors (logo too big vs. the search bar).
- [ ] **Group by meaning; add separation between distinct actions.** "Even a tiny bit more separation clears
      things up" — if the brain should treat two things as separate actions, space them apart. Conversely, group
      things that belong together (content-interaction nav vs. personal/account nav at the bottom).
- [ ] **Don't co-locate items with different behavior** (a TV-shows tab living among movie _filters_ but acting
      like a _navigation_ link).

### Decluttering & consolidation

- [ ] **Reduce competing/redundant elements.** Three visible scrollbars → his single biggest annoyance. Collapse
      into one **"Filters" button that expands**, with **selected-state chips** below it.
- [ ] **Merge duplicate paths.** Two buttons that go to the same screen → one. Remove redundant tabs/text/labels.
- [ ] **Chips beat tabs+scroll-arrows** for filter sets — "a lot cleaner."

### Color & icons

- [ ] **Restrained, purposeful color.** One accent, applied where the eye needs it, balanced against branding.
      He frequently goes **dark theme**. Gradients only when _subtle_ (background wash, text/border accent,
      fade-out overlapping a seam). **Red + bold + caps promo text = off-putting.**
- [ ] **Icons: one uniform set, meaningful, contained.** "It's crazy how much of a difference better icons can
      make." Keep icons inside a fixed container so layout never depends on icon size/shape. Thin, consistent style.

### Readability & images

- [ ] **Contrast for overlaid text.** Text on an image needs a darken/scrim behind it.
- [ ] **No too-bright text on a clashing background** ("extraordinarily bright and difficult to read").
- [ ] **Let images own their space**, overlap info on a scrim, and carve out space for action buttons within the image.

### Overflow & responsiveness (never leave it to chance)

- [ ] **Explicit overflow handling:** ellipsis / char-limit for long labels. "It seems silly to leave it up to chance."
- [ ] **Make scrollability obvious:** a distinct container so a cut-off edge clearly signals "more," or dynamically
      adjust padding so the last item aligns with the device edge.
- [ ] **Thumb ergonomics:** move primary actions (search) "closer to where the hand naturally rests," stick on
      scroll. Reconsider always-visible side nav on phones (toggle instead). Watch fixed-bottom cutoff on iOS.

---

## 2. Interaction & motion principles

From the effect tutorials and his most mature (2026) bad-UI/UX videos.

- **Motion should feel natural, not literal.** Never snap 1:1 to the cursor — add slight lag/easing so it
  "chills out and lags behind." Use `element.animate()` with a short duration + `fill: forwards`.
- **Constrain motion to its purpose.** The magic wand isn't free-roam: amplified horizontally near edges,
  limited vertically, rotates within a fixed ~20° range. Constraints make it feel _designed_.
- **Idle life.** A slow infinite rotate/scale/morph keeps a hero element feeling alive at rest.
- **Predictive physics for drag.** Use recent pointer velocity to compute a simulated resting place (throwable bubble).
- **The signature cursor-glow** (the "Linear/Vercel" feel): radial-gradient on a `::before`, position fed from
  `getBoundingClientRect()` on `mousemove` into CSS custom props, opacity transitioned in/out (~500ms). The
  **1px lit border** is faked by exposing a sliver around opaque content via z-index — and **neighboring cards
  react too**, driven by a single listener on the wrapper.
- **Polish = the unglamorous states.** Even his _joke_ bad-UI project ships a success screen, a "generate new
  code" action, and a hint affordance. His bar: "passable on sites known for exceptional UI such as Linear, Vercel."

### Accessibility & restraint (his most mature take — weight these heavily)

- **Respect `prefers-reduced-motion`** → fall back to simple fade-ins.
- **Full keyboard operability is "next level," not optional:** tab to focus, space/enter to toggle, delete to
  remove, arrows to reposition, ctrl+arrow for max jumps. _"I am a developer and therefore need to operate
  this entire flow via my keyboard."_
- **Hate gratuitous overlays.** "I hate anything that sits on top of the UI unnecessarily." A persistent on-screen
  toggle with an easily-accessible alternative is "purely an annoyance." If an overlay must exist, make it
  movable/dismissible and delightful.

---

## 3. Applying this to BuildOS

BuildOS's design system is **Inkprint** (`apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`):
texture-based tokens (`bg-card`, `text-foreground`, `shadow-ink`, `tx-bloom`, `tx-grain`), light + dark required.
Hyperplexed's rubric is highly compatible — Inkprint already favors restraint, a controlled palette, and
texture-as-accent. The playbook adds _precision_ to the things Inkprint leaves to judgment.

**Highest-leverage Hyperplexed lenses for a BuildOS audit:**

1. **Alignment & even padding sweep** — go region by region on the busiest surfaces (project page, dashboard,
   brain-dump modal, agentic-chat panels) and flag any element that doesn't align to a shared grid/edge, and any
   asymmetric padding. This is his #1 instinct and usually the cheapest, highest-impact fix.
2. **Declutter via consolidation** — look for redundant nav/tabs, duplicate paths to the same view, and visible
   scroll regions that could become a Filters-button + chips pattern.
3. **Hierarchy by type, not addition** — demote secondary metadata to subtext (size/weight/color) instead of
   adding containers or dividers.
4. **Icon uniformity** — BuildOS routes lucide icons through `src/lib/icons/lucide.ts`; check for mixed icon
   weights/styles and icons whose label-presence shifts a row.
5. **Overflow is explicit** — audit every label/title that can run long for ellipsis/char-limit, especially in
   cards and lists.
6. **Motion restraint + a11y** — respect `prefers-reduced-motion`; verify keyboard operability of any
   custom-interaction surface; remove any always-on overlay that has an easy alternative.
7. **One signature delight, done well** — if BuildOS wants a "premium" moment, the cursor-glow card grid is the
   canonical Linear/Vercel-tier effect, but it must degrade to fade-ins under reduced-motion.

**Next step (separate session): the live audit.** This playbook is the rubric; the audit needs real screens.
Run the web app (`pnpm dev --filter=web`, localhost:5173), capture the key surfaces, and grade each region
against §1–§2. Cross-reference the existing `DESIGN_AUDIT_2026-06-12.md` and `MOBILE_EXPERIENCE_AUDIT_2026-06-12.md`
so findings stack instead of duplicate.

---

## 4. Video index (what's in `./transcripts/`)

**Tier 1 — design judgment (the taste core):**

- `redesign-rottentomatoes-craigslist`, `redesign-amazon-google`, `redesign-costco-dominos`,
  `redesign-quora-steam` — the four "I Redesigned Popular Websites" episodes; richest reasoning.
- `bad-ui-professional-grade`, `terrible-ux-exceptional` — what makes UX bad, and his accessibility-forward bar.
- `optimal-website-header`, `easiest-website-menu`, `perfect-website`, `website-theme-1996` — anatomy of
  clean headers/menus/grids and the magic-wand reveal.

**Tier 2 — interaction polish:**

- `hover-effect-asap` (signature multi-card cursor glow), `addicting-interactivity` (mouse-trail gallery),
  `website-feature-demands` (lagging blurred blob follower).

**Not yet transcribed** (~7 Tier-2 effect tutorials) — deferred when the YouTube timed-text endpoint
rate-limited the batch; re-pull later with the `youtube-transcript` skill (sequential, ≤2 parallel):
`frontend-skills-to-the-moon`, `how-to-slay-with-css`, `extraordinary-from-ordinary`,
`unfiltered-frontend-thought`, `mouse-trailer-intelligent`, `explosive-hover-effect`, `effect-shouldnt-be-possible`.
The 1hr polyrhythm visualizers, particle-art, AI-tracker, and parody videos were intentionally skipped
(entertainment, not design lessons).
