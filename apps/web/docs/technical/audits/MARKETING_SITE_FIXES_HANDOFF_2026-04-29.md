<!-- apps/web/docs/technical/audits/MARKETING_SITE_FIXES_HANDOFF_2026-04-29.md -->

# Marketing Site Design Fixes — Handoff

**Created:** 2026-04-29
**Source audit:** [`MARKETING_SITE_DESIGN_REVIEW_2026-04-29.md`](./MARKETING_SITE_DESIGN_REVIEW_2026-04-29.md)
**Skill applied:** `docs/research/youtube-library/skill-drafts/marketing-site-design-review/SKILL.md`
**Target:** `apps/web/src/routes/+page.svelte` (the unauthenticated landing page at https://build-os.com)

This is a handoff for an executing agent. The audit document explains the _why_ in detail. This document is the _what_ and _acceptance criteria_, ordered for sequential execution.

## How to use this doc

Each fix has:

- **Where** — exact file and line range
- **Problem** — what was wrong
- **Fix** — what to do
- **Acceptance criteria** — how the executing agent knows it's done
- **Effort** — rough sizing
- **Dependencies** — fixes that must land before/after

Pick fixes top-to-bottom; they are roughly priority-ordered. Foundational rules (4-pixel system, type roles, color proportions, hierarchy) already pass on this page — do not introduce off-scale spacing or new font roles while implementing fixes.

---

## Foundational Constraints (Hold These While Working)

These already pass on the current page. Maintain them on every fix:

- **Spacing scale:** every value must be a multiple of 4px. Use Tailwind's default scale (`gap-1`, `gap-2`, `gap-3`, `gap-4`, `gap-6`, `gap-8`, `gap-12`, `gap-16`, `gap-24`). No off-scale values.
- **Type scale:** stick to existing roles — `text-3xl sm:text-5xl` for h1, `text-2xl sm:text-3xl` for h2, `text-base font-semibold` for h3, `text-sm` for body, `text-[0.65rem] uppercase tracking-[0.18em]` for kicker labels. Do not invent new sizes.
- **Color discipline:** keep the 60/30/10 rule. Accent (`accent`, `accent/40`, `accent/5`) is reserved — only the Honest Comparison "Option 3" card and primary CTAs use it currently. Do not spread it.
- **Cohesion:** all card components share the scaffold `rounded-lg border border-border bg-card shadow-ink tx tx-* tx-weak p-4`. Match it for any new card.
- **Texture variance:** use `tx-frame`, `tx-grain`, `tx-bloom`, `tx-pulse`, `tx-thread`, `tx-static` on the `tx tx-* tx-weak` triplet. Vary across siblings, never break the cohesion.
- **Dark mode:** every change must work in both light and dark. Test both.

---

## Fix 1 — Add Testimonials Section (HIGH)

### Where

New section to insert in `apps/web/src/routes/+page.svelte` between the Examples section (ends ~line 652) and the Honest Comparison section (begins ~line 722).

### Problem

The landing page has zero social proof. No testimonials, no quotes, no customer logos, no "as seen in." A visitor's only evidence the product works is the founder bio. This is the largest single gap on the page.

### Fix

Add a full-width testimonial section. Persona-segmented (one quote per audience). Real sources, clickable to the original (Twitter post, LinkedIn comment, podcast clip — whatever exists). Use the same card scaffold.

**Structure:**

```
<section class="border-b border-border">
  <div class="mx-auto max-w-6xl px-4 py-8 sm:py-10 space-y-6">
    <div>
      <h2>What people are saying.</h2>
      <p>From authors, builders, and YouTubers using BuildOS to keep their context.</p>
    </div>
    <div class="grid md:grid-cols-3 gap-3 sm:gap-4">
      <!-- 3 testimonial cards, one per audience segment -->
      <!-- Each: kicker (audience), quote, name + role, link to source -->
    </div>
  </div>
</section>
```

If there are not yet 3 real testimonials available:

- Use 1–2 real testimonials and a "Trusted by N creators capturing X words/day" stat tile to fill the third slot
- Or use a logo strip (community logos: ProductHunt, IndieHackers, Twitter community names) as a "Trusted by" rail above the section instead of fake testimonials

**Do NOT fabricate testimonials.** If real ones do not exist, ask DJ Wayne for source quotes or fall back to the stats/logos approach.

### Acceptance criteria

- 3 distinct testimonial cards rendered between Examples and Honest Comparison
- Each card has: audience kicker, quote ≤30 words, attributed name + role, clickable link to source
- Section follows the existing card scaffold and texture variance pattern
- Light and dark mode both render correctly
- No fabricated testimonials — only real, verifiable quotes
- Section ID set to `#testimonials` for navigation

### Effort

1–2 days (mostly content collection; design is straightforward).

### Dependencies

None. Ship first.

---

## Fix 2 — Add Real Visuals to "How It Works" Cards (HIGH)

### Where

`apps/web/src/routes/+page.svelte:412-484` — the "From raw thinking to shipped work" section, three cards (`01 • Start`, `02 • Shape`, `03 • Drive`).

### Problem

The benefit section is text-only. No animations, no screenshots, no interactive elements. Per the source skill: _"static screenshots next to feature names is the canonical amateur tell."_ This is worse — there are no screenshots.

### Fix

Add a small visual artifact to each card. Two options, in order of preference:

**Option A (preferred): Lottie / CSS animations.** Each card gets a tiny inline animation (top-aligned, ~200×120px):

- Card 01 (Start): chat input with rough text being typed.
- Card 02 (Shape): morph from text-blob to structured outline (lines arranging themselves).
- Card 03 (Drive): a project tree with one task highlighted as "current."

**Option B (fallback): Static SVG illustrations.** Same three concepts, rendered as inline SVGs. Lighter and works without JS.

Either way, the visual goes ABOVE the kicker label, sized so the card grows in height by ~50%.

### Acceptance criteria

- Each of the 3 cards has a visual that demonstrates the step
- Visuals are NOT stock images, NOT logos, NOT placeholders
- Visuals are inline (no external image hosting unless it's a CDN with a known cache strategy)
- Bundle size impact ≤30KB total across the three visuals
- Light and dark mode versions both render correctly
- No layout shift on load (use `aspect-ratio` or fixed dimensions)
- Accessibility: animations respect `prefers-reduced-motion: reduce` and pause when reduced

### Effort

2–3 days (most time on the animation/illustration assets).

### Dependencies

None. Can run parallel to Fix 1.

### Stretch goal

Convert the 3-card layout to a "highlighter button" pattern: left-rail buttons (Start / Shape / Drive) + right-rail visual that swaps as the user clicks/hovers. Per the skill, this is the highest-leverage benefit-section pattern. Defer if it adds more than 1 extra day.

---

## Fix 3 — Surface the Example Project Graph (HIGH)

### Where

`apps/web/src/routes/+page.svelte:188-211` (the IntersectionObserver lazy-load), and `:654-669` (the placeholder section).

### Problem

The Example Project Graph is the single best pro-move on the page (interactive demo of a real BuildOS project). But it's gated behind viewport intersection, so:

- Visitors who don't scroll to it never see it
- The lazy-load shows "Loading example project graph..." which is generic and uninviting
- It currently sits below Examples, where it should be the _proof_ of Examples, not dessert

### Fix

Three changes, in order:

1. **Eager-load on the unauthenticated landing page.** Remove the IntersectionObserver gate for unauthenticated users. Authenticated users (who never see this section anyway) keep lazy.
    - In the script block: change the `onMount` that observes `exampleGraphTarget` to call `loadExampleProjectGraph()` immediately when `!isAuthenticated`.
2. **Replace the placeholder with a poster frame.** Instead of "Loading example project graph...", show a static screenshot of the graph (saved as a static asset) with a label _"Try the live project graph below ↓"_. The static poster swaps for the interactive component once it loads.
3. **Move the section earlier on the page.** Insert it directly after the Hero, before "How It Works." Rationale: a visitor who sees the demo first understands every subsequent section in context. Update the hero CTA `href="#how"` if it now skips this section, or leave alone since `#how` is now the second stop.

### Acceptance criteria

- Unauthenticated visitors see the graph (or its poster) above the fold of the second viewport
- No "Loading..." text visible to unauthenticated visitors at any point
- Authenticated users still get lazy-loading (no perf regression for the dashboard render)
- The graph component still mounts only once per visit (no double-init)
- Bundle size for unauthenticated users grows by less than 200KB
- Server-rendered version (with JS disabled) shows the poster image, not a blank section

### Effort

1 day.

### Dependencies

- Generate a static poster image of the project graph (ask DJ Wayne or screenshot the live component).

---

## Fix 4 — Convert Features Section to Bento-Box (MEDIUM-HIGH)

### Where

`apps/web/src/routes/+page.svelte:487-585` — the "Everything your project needs. One place." section.

### Problem

The 8 feature cards use a uniform 4-column grid (`grid sm:grid-cols-2 lg:grid-cols-4`). Per the source skill, uniform grids read as templated; bento-box grids (varied tile sizes) read as bespoke and signal product range.

### Fix

Convert to a bento layout. Suggested structure (12-column grid base):

```
Row 1: [Projects 6-col with mini visual] [Goals 3-col] [Plans 3-col]
Row 2: [Tasks 3-col] [Milestones 3-col] [Documents 6-col with mini visual]
Row 3: [Risks 3-col] [Flexible Structure 9-col wide tile with longer copy]
```

The 2 large tiles (Projects, Documents, Flexible Structure) earn their size by including a small visual artifact OR a longer descriptive paragraph. Smaller tiles keep the current icon + label + 1-line format.

Optional grouping: introduce 3 mini-section subheaders above each row:

- Row 1 = "The structure layer"
- Row 2 = "The execution layer"
- Row 3 = "The context layer"

### Acceptance criteria

- 8 feature cards rendered in a non-uniform grid
- At least 2 tiles span more than one column at desktop
- Each large tile has either a visual or a paragraph of copy that justifies the size
- Mobile layout (single column) still readable; bento collapses gracefully to stacked
- Cohesion preserved (shared scaffold, varied texture)

### Effort

1 day.

### Dependencies

- If using mini-visuals on the large tiles, depends on Fix 2's asset pipeline being established.

---

## Fix 5 — Add FAQ to Landing Page (MEDIUM-HIGH)

### Where

New section in `apps/web/src/routes/+page.svelte` between the (new) Testimonials section and the Honest Comparison section. Or just before the final CTA.

### Problem

The landing page has no FAQ. The pricing page has 4 FAQ items but visitors who don't reach `/pricing` never see them. Top objections (data ownership, ADHD-suitability, AI lock-in, cancel ease, pricing) are unaddressed.

### Fix

Add 4–6 FAQ items to the landing. Use real objections, honest answers. Brand-consistent design (`tx-frame` cards, NOT a default HTML accordion). Do NOT use the FAQ to sell — per the source skill, _"if you're using the FAQ to sell, the copy upstream is broken."_

**Suggested questions** (confirm with DJ Wayne):

1. _Do I own my data? Can I export it?_
2. _Is BuildOS made for ADHD or just productivity nerds?_
3. _What happens if I cancel?_
4. _Why a chat interface and not another notes app?_
5. _Is there a free tier?_
6. _How is this different from Notion / Obsidian / Reflect?_

Reuse the FAQ items already on `/pricing` where they overlap, but write in the same voice as the rest of the landing.

### Acceptance criteria

- 4–6 FAQ items rendered with the existing card scaffold
- Each question is a real visitor objection, not a sales prompt in disguise
- Each answer is concise (≤60 words), honest, no hedging
- Design matches the rest of the landing (no default browser accordion, no shadow-less collapsible)
- Section ID `#faq` for navigation
- Items are individually expandable (click to expand) OR all open by default — pick one and stick to it

### Effort

1 day.

### Dependencies

- Coordinate with the 4 existing FAQ items on `/pricing` so they aren't duplicated verbatim.

---

## Fix 6 — Hero Right-Zone Visual (MEDIUM)

### Where

`apps/web/src/routes/+page.svelte:369-407` — the "Rough brief → organized plan" diptych in the hero's right zone.

### Problem

The right-zone visual is a stylized text diptych — better than a static screenshot, but not as effective as a video or interactive demo. Per the source skill, _"interactive > video > screenshot"_ and _"static screenshots are an amateur tell for software."_

### Fix

Two options:

**Option A (preferred):** Replace with a 15–30s autoplay video (no audio, looped) showing a real brain-dump → structured-output transformation. Use the existing diptych as the poster frame so visitors with autoplay disabled still see the value-prop.

**Option B (lighter touch):** Keep the diptych as-is but animate the transformation — author brief on left fades/morphs into structured output on right on a 6-second loop. Adds motion without requiring video production.

Either way, respect `prefers-reduced-motion: reduce`.

### Acceptance criteria

- Right-zone shows motion or interactivity (not a static text card)
- Poster frame loads instantly (no flash of "loading")
- Bundle size impact ≤500KB if video, ≤30KB if SVG/CSS animation
- Reduced-motion: still readable and informative
- Mobile: degrades gracefully to a poster image (no autoplay video on mobile)

### Effort

1–2 days (longer if shooting product video).

### Dependencies

None. Can run parallel to other fixes.

---

## Fix 7 — Examples Cards Visual Pass (MEDIUM)

### Where

`apps/web/src/routes/+page.svelte:587-652` — the 4 audience cards (Authors, YouTubers, Podcasters, Course creators).

### Problem

Each card shows raw input → text bullet list. No real product visual. The skill calls "see it in action" sections that show only text a mixed signal — useful as case-study-lite but missing the "show, don't tell" pro pattern.

### Fix

Add one small product screenshot per card showing the BuildOS-organized output as it actually renders in the app. Position: below the existing two-column "Raw input / BuildOS organizes it into" diptych. Approx 200×100px, screenshot of the actual project view inside BuildOS for a corresponding example project.

If real screenshots don't exist for all 4 audiences yet, ship 2 with screenshots and 2 without rather than fabricate.

### Acceptance criteria

- At least 2 of 4 cards have a real product screenshot
- Screenshots are NOT mock-ups — real renders from the BuildOS app
- Card heights remain visually balanced (use placeholder of equal height for the cards without screenshots)
- Light and dark mode versions both available
- Screenshots are static (no motion) — that's fine for case studies

### Effort

2 days.

### Dependencies

- Real example projects must exist in the BuildOS database for each audience (or use sanitized real-user data with permission).

---

## Cross-Cutting Suggestion (Not a Fix — A Note)

The audit also noted that **layout effort drops** between the strong Hero and the weaker Benefit/Features/Examples sections, then recovers at the Honest Comparison. The 7 fixes above all address that drop directly — Fixes 2, 4, 7 add visual weight to the dipped sections; Fixes 1, 5 add new high-effort sections in the gap. The fixes are not independent — together they re-level the effort curve.

**Recommended execution order if you have to choose:** Fix 1 (testimonials) → Fix 3 (surface demo) → Fix 2 (visuals on benefit cards) → Fix 5 (FAQ) → Fix 4 (bento features) → Fix 6 (hero motion) → Fix 7 (examples screenshots).

This ships the biggest credibility gap (no social proof) first, surfaces the strongest pro-move next (the demo), then progressively re-levels the effort curve.

---

## Out of Scope for This Handoff

- **Mobile pass.** The current audit was desktop-first. A separate mobile-specific review should follow. Tap targets, mobile spacing, mobile-specific layout transitions are not addressed here.
- **Copy quality pass.** Several copy heuristics were noted in the audit (name the customer, lead with benefits not features) but a dedicated copy review is a separate skill.
- **Accessibility deep-dive.** The audit checked basic contrast and reduced-motion. A full WCAG 2.2 AA audit should follow before any major launch.
- **Performance.** Bundle size, LCP, CLS — not measured. Fix 3 in particular needs measurement before/after.

---

## Questions to Resolve Before Starting

1. Do real testimonials exist that DJ Wayne can share? (Blocks Fix 1)
2. Do real example projects exist in the database for each of the 4 audience cards? (Blocks Fix 7)
3. Is video production in-budget for Fix 6, or should we go with the lighter SVG/CSS animation option?
4. Should the FAQ on the landing page (Fix 5) be a different set of questions from the pricing page, or partial overlap?
