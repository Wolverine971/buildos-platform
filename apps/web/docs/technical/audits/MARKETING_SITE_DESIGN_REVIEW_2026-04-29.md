<!-- apps/web/docs/technical/audits/MARKETING_SITE_DESIGN_REVIEW_2026-04-29.md -->

# Marketing Site Design Review — build-os.com

**Audit date:** 2026-04-29
**Skill applied:** `docs/research/youtube-library/skill-drafts/marketing-site-design-review/SKILL.md`
**Reviewer:** Test run of the new skill against the live BuildOS marketing site.
**Scope:** Landing page (`/`), with cross-references to `/about` and `/pricing`.
**Source reviewed:** `apps/web/src/routes/+page.svelte` (789 lines) + live render at https://build-os.com.

This is both a real audit of the BuildOS marketing surface and a test of whether the skill produces useful, specific, prioritized findings.

---

## Foundational Rule Pass

| Rule                                                         | Status                | Notes                                                                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4-pixel mathematical system                                  | ✅ Pass               | Tailwind base = 4px. All gap/space/padding values are scale-compliant (`gap-3`, `py-8`, `mt-2`, `px-4`, `space-y-6`). No off-scale values found.                                                           |
| Type roles only (h1/h2/h3 + body + button + label)           | ✅ Pass               | One h1, multiple h2s as section titles, h3 for cards. Tiny uppercase tracking labels (`text-[0.65rem] uppercase tracking-[0.18em]`) are a fifth role used consistently — acceptable as a "kicker" pattern. |
| Line-height inversely proportional                           | ⚠️ Partial            | Hero h1 gets `leading-[1.05]` ✅. Body uses `leading-relaxed` (~1.625) ✅. But h2/h3 inherit defaults — explicit per-role line-heights would be tighter.                                                   |
| Body contrast ≥ 4.5:1                                        | ⚠️ Needs verification | Default `text-muted-foreground` on `bg-card` may dip below 4.5:1 in light mode. Verify with axe / WebAIM.                                                                                                  |
| 60/30/10 color proportion                                    | ✅ Pass               | Dominant: card/foreground neutrals (~60%). Secondary: muted-foreground (~30%). Accent: only on Option 3 card and link underlines (~10%). Disciplined.                                                      |
| Hierarchy ranking (one primary, few secondary, rest uniform) | ✅ Pass               | Hero h1 is clearly primary. Section h2s are secondary and visually identical. Cards are uniform.                                                                                                           |
| Layout effort uniformity                                     | ⚠️ Partial            | See "Effort drop-off" below.                                                                                                                                                                               |
| Cohesion (same-type components match)                        | ✅ Pass               | All cards use the same scaffold: `rounded-lg border border-border bg-card shadow-ink tx tx-* tx-weak p-4`. Strong cohesion.                                                                                |

---

## Section Scorecard

| Section                               | Present?                                | Amateur Tells                                                     | Pro Moves Present                                                                               | Verdict                                 |
| ------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| Hero                                  | ✅                                      | None major                                                        | Two-zone split, named customer, primary+secondary CTA                                           | **Strong**                              |
| Portfolio                             | N/A                                     | —                                                                 | —                                                                                               | Not applicable to SaaS landing          |
| Case Study                            | ✅ (as Examples grid)                   | Text-only, no real visuals                                        | Audience-segmented, raw-input → output diptych                                                  | **Mixed**                               |
| Benefit (How It Works)                | ✅                                      | Text-only cards, no animation, no interactive visuals             | 3-step structure, kicker labels, texture variance                                               | **Weak — missing visuals**              |
| FAQ                                   | ❌ on landing                           | Hidden on `/pricing` only                                         | —                                                                                               | **Missing**                             |
| Features (Under the Hood)             | ✅                                      | Uniform 4-column grid, short copy, no visuals beyond icons        | Iconified, semantic ordering                                                                    | **Weak — uniform grid is amateur tell** |
| Demo                                  | ⚠️ (Example Project Graph, lazy-loaded) | Lazy-loaded means many visitors miss it; no preview before scroll | When loaded, it is interactive                                                                  | **Weak — discovery problem**            |
| Product Page (e-commerce)             | N/A                                     | —                                                                 | —                                                                                               | Not applicable                          |
| Comparison ("You have three options") | ✅                                      | None major                                                        | Bold problem framing, your column emphasized (`border-accent/40 bg-accent/5`), single clear CTA | **Strong**                              |
| Testimonial                           | ❌                                      | Zero social proof anywhere                                        | —                                                                                               | **Missing — biggest gap**               |
| Contact / Final CTA                   | ✅                                      | None major                                                        | Primary+secondary, side by side, same shape, different weights                                  | **Strong**                              |
| Pricing teaser                        | ❌ on landing                           | Forces visitors to second page                                    | —                                                                                               | **Missing**                             |

---

## Per-Section Findings

### Hero — Strong

**File:** `apps/web/src/routes/+page.svelte:311-409`

**What works:**

- Two compositional zones (text left, demo right) — passes the skill's "cap at two zones" rule cleanly.
- Headline `Turn messy thinking into structured work` uses the `tx-bloom` underline overlay to make "structured work" visually dominant — good highlighting without size escalation.
- Customer named in copy: _"Built for authors, YouTubers, and builders"_ — passes "name the customer" rule.
- Primary CTA (`Start in chat`) and secondary CTA (`See how it works`) — same shape, different weights. Passes scorecard.
- Author bio (DJ Wayne, Marine sniper → engineer) injects credibility without taking the H1 slot.

**Issues:**

1. **The right-zone visual is conceptual, not real product.** It's a stylized diptych ("Author brief" → "Structured by BuildOS") rendered in cards, not a real product screenshot or video. The skill says: _"Static screenshots are an amateur tell for software. Ship a video/interactive demo."_ This visual is **better** than a screenshot (it shows the transformation) but still **less than** a 5–10 second product video.
    - **Fix:** Replace the right-zone visual with an autoplay video (15–30s, no audio) of an actual brain-dump → structure transformation. Keep the diptych as a poster frame.
    - **Priority:** Medium.
2. **Two body paragraphs in the hero** — the marketing pitch (60 words) plus the founder story (35 words). The hero rule says one message. The founder paragraph competes for attention.
    - **Fix:** Move the founder paragraph to a thin trust-bar below the hero or onto `/about`. Keep only the value-prop paragraph in the hero.
    - **Priority:** Low (founder credibility is genuinely useful here, but it dilutes hero focus).

### Benefit Section: "From raw thinking to shipped work" — Weak

**File:** `apps/web/src/routes/+page.svelte:412-484`

**What works:**

- 3-step structure (Start / Shape / Drive) is clear.
- Kicker labels (`01 • Start`) give scan-pattern anchors.
- Texture variance per card (`tx-bloom`, `tx-grain`, `tx-pulse`) adds personality without breaking cohesion.

**Issues:** 3. **Cards are text-only — no animations, no in-place visuals, no interactive demos.** This is the canonical amateur tell from Pro vs Amateur Design: _"Static screenshots next to feature names is the canonical amateur tell."_ You don't even have screenshots — just text.

- **Fix:** Each card needs a small visual artifact:
    - Card 01 (Start): tiny chat-input animation showing rough text being typed.
    - Card 02 (Shape): tiny morph from text-blob to structured outline.
    - Card 03 (Drive): tiny example of "current task" highlighted within a project tree.
- **Priority:** **HIGH.** The benefit section is 60–70% of a homepage's job per the skill. This is the weakest link.

4. **No "highlighter button" pattern.** The skill calls out the in-line button-highlighter pattern (buttons inside paragraph copy that swap a right-side visual) as the most effective benefit-section move.
    - **Fix:** Reorganize this section as left-rail buttons (Start / Shape / Drive) + right-rail visual that swaps as the user clicks. Keeps the 3-step structure and adds the interactivity.
    - **Priority:** Medium.

### Features: "Everything your project needs. One place." — Weak

**File:** `apps/web/src/routes/+page.svelte:487-585`

**What works:**

- Icons + label + 1-line description per card — clean.
- 8 cards covers the data model semantically (Projects, Goals, Plans, Tasks, Milestones, Documents, Risks, Flexible Structure).
- Icons match line-height of labels — good detail.

**Issues:** 5. **Uniform 4-column grid is the amateur tell.** Per Pro vs Amateur Layouts: rigid uniform grid = amateur. Bento-box grid (varied tile sizes) = pro.

- **Fix:** Convert to bento. Suggested layout:
    - Row 1: Projects (large 2-col tile with mini visual) + Goals (1-col) + Plans (1-col).
    - Row 2: Tasks (1-col) + Milestones (1-col) + Documents (large 2-col tile with mini visual).
    - Row 3: Risks (1-col) + Flexible Structure (3-col wide tile).
- **Priority:** Medium-High.

6. **Section copy is short and dense — doesn't earn the "long and dense" pro pattern.** Visitors who reached this section want detail.
    - **Fix:** Add a short paragraph of explainer per _category_ (Projects+Goals+Plans = the structure layer; Tasks+Milestones = the execution layer; Documents+Risks+Flexible Structure = the context layer). Group the 8 cards under 3 mini-headers.
    - **Priority:** Low-Medium.

### Examples: "See it in action" (4 audience cards) — Mixed

**File:** `apps/web/src/routes/+page.svelte:587-652`

**What works:**

- Audience-segmented (Authors, YouTubers, Podcasters, Course creators) — addresses persona-specific motivators.
- Raw-input → BuildOS-output diptych within each card mirrors the hero pattern (good rhyme).
- Texture variance per card (`tx-frame`, `tx-grain`, `tx-thread`, `tx-bloom`).

**Issues:** 7. **Every card is text-only.** No visuals of actual product output. Per skill: _"Pro case studies have bold visuals."_

- **Fix:** Add one small product-screenshot per card showing the "BuildOS organizes it into" output rendered as it actually appears in the app.
- **Priority:** Medium.

8. **The "See in action" promise isn't delivered.** Visitors expect to _see_ it; they get more text.
    - **Fix:** Stack the Example Project Graph immediately after this section, not lazy-loaded behind a viewport observer.
    - **Priority:** High (related to issue 9 below).

### Demo: Example Project Graph — Weak Discovery

**File:** `apps/web/src/routes/+page.svelte:654-669`

**What works:**

- It is a real interactive demo. Passes the skill's _"Interactive > video > screenshot"_ rule.
- Lazy-loaded for performance.

**Issues:** 9. **The lazy-load gate hides the demo from anyone who doesn't scroll to it.** Per skill: _"Let visitors try the product before signup."_ If the trigger fires only when the section enters the viewport, slow-scrollers and bouncers never see it.

- **Fix options (pick one):**
    - Eager-load on the `/` route for unauthenticated users; lazy-load only when below the fold for authenticated users.
    - Add a poster frame inside the lazy section so the user sees a visual stub before the JS loads.
    - Move the section earlier (above the Examples cards) so it's the proof, not the dessert.
- **Priority:** **HIGH.** This is your strongest pro-move and visitors are missing it.

10. **No "preview" call-out.** A visitor who reaches the section sees "Loading example project graph..." which is generic.
    - **Fix:** Replace the loading placeholder with a poster image (a screenshot of the graph) and a label _"Try the live project graph below ↓"_.
    - **Priority:** Medium.

### Comparison: "You have three options" — Strong

**File:** `apps/web/src/routes/+page.svelte:722-770`

**What works:**

- Bold problem framing: _"Two of them leave your thinking scattered. One starts compounding today."_ — passes "lead with a bold problem statement" rule.
- Option 3 visually emphasized (`border-accent/40 bg-accent/5 shadow-ink-strong`) — passes "your column gets distinct color, weight, or background" rule.
- Single bold CTA after — passes "single bold CTA at the bottom" rule.

**Issues:**

- None significant. This is the strongest section on the page against the skill.

### Final CTA — Strong

**File:** `apps/web/src/routes/+page.svelte:772-785`

**What works:**

- Primary `Start in chat` + secondary `Learn more`, side by side, same shape, different weights.
- Same buttons as the hero — repeats the path of least resistance.

**Issues:**

- None significant.

---

## Critical Missing Sections

### 1. Testimonials / Social Proof — **MISSING ENTIRELY**

**Severity:** **Highest.** This is the biggest gap.

The skill scorecard names testimonials as a section type. Per Pro vs Amateur Design: _"A lackluster testimonial section can massively diminish the social proof of your website. An amazing one can add a huge amount of credibility."_ Per Pro vs Amateur Layouts: _"Full-width section, persona-segmented categories, clickable links to real sources."_

The BuildOS landing page has **zero testimonials, zero quotes, zero "as seen in", zero customer logos.** A visitor's only evidence that this thing works is the founder bio.

**Fixes (in order of effort):**

- **Right now:** Add 3 hand-curated quote tiles between the Examples section and the Honest Comparison section. Persona-segment them: one author, one builder, one YouTuber.
- **Soon:** Add a "Trusted by" strip with 4–6 customer/community logos (even if early-stage — _"X creators have brain-dumped Y million words"_ works as social proof if logos aren't available yet).
- **Long-term:** Persona-segmented testimonial section with clickable links to the real source (Twitter post, blog comment, podcast).

**Priority:** **HIGH.**

### 2. FAQ on Landing — **MISSING**

**Severity:** Medium-High.

The skill says: _"The FAQ is not a hidden benefit section. Match the FAQ's design energy to the rest of the site. Answer the real objections honestly."_

The landing page has none. The pricing page has 4 FAQ items but visitors who never reach `/pricing` never see them. Top objections (data ownership, cancel ease, AI lock-in, ADHD-suitability) are unaddressed.

**Fix:** Add a 4–6 item FAQ to the landing page just before the final CTA. Brand-consistent design (`tx-frame` cards, not a default accordion). Real objections, honest answers. Do not use it to sell.

**Priority:** Medium-High.

### 3. Pricing Teaser on Landing — **MISSING**

**Severity:** Medium.

Visitors who want to see the price have to navigate to `/pricing`. That's a friction point in a category where price transparency is a trust signal.

**Fix:** Single-line pricing strip near the final CTA: _"$20/mo · 14-day free trial · No credit card to start."_ Three trust signals in nine words.

**Priority:** Medium.

---

## Cross-Cutting Layout Findings

### Effort drop-off?

Mostly no — sections are uniformly cared-for. The two exceptions:

- The **Features grid** drops effort by using a uniform 4-column grid with no visuals.
- The **Examples grid** drops effort by using text-only cards.

If the user lands on the page and reads the hero (high effort), then scrolls to the benefit section (medium effort, text-only), then to features (uniform grid, no visuals), the effort _visibly decreases_. The Honest Comparison section recovers it. But the dip is detectable and is exactly the "amateur tell" the skill warns about.

### Bento-box opportunity

The Under-the-Hood and Examples sections are both candidates for bento conversion. The Honest Comparison section is already varied enough (Option 3 visually distinct).

### "Real visuals beat stock" check

There are **no stock images** anywhere. ✅ Pass.

But there are also **no real product screenshots or videos** in the static page. The Example Project Graph is interactive but lazy-loaded. So the page shows neither stock nor real visuals — it shows stylized text representations. This is unusual and somewhat bold (the design language is that the _texture_ is the visual identity), but it sacrifices "show, don't tell."

---

## Top 7 Highest-Impact Fixes (Prioritized)

| #   | Fix                                                                                   | Priority    | Effort   | Section                                     |
| --- | ------------------------------------------------------------------------------------- | ----------- | -------- | ------------------------------------------- |
| 1   | Add testimonials / social proof section (3 quote tiles minimum)                       | HIGH        | 1–2 days | New section between Examples and Comparison |
| 2   | Add real visuals (animations or product screenshots) to the 3 Benefit cards           | HIGH        | 2–3 days | How It Works                                |
| 3   | Eager-load (or poster-frame) the Example Project Graph; move it earlier on the page   | HIGH        | 1 day    | Demo / Example                              |
| 4   | Convert Features section from uniform 4-column grid to bento-box                      | MEDIUM-HIGH | 1 day    | Under the Hood                              |
| 5   | Add a 4–6 item FAQ section before the final CTA                                       | MEDIUM-HIGH | 1 day    | New section                                 |
| 6   | Replace hero right-zone diptych with autoplay video (or keep diptych as poster frame) | MEDIUM      | 1–2 days | Hero                                        |
| 7   | Add small product visual to each of the 4 Examples cards                              | MEDIUM      | 2 days   | Examples                                    |

---

## Skill Self-Assessment (Meta)

**Did the skill produce useful output?** Yes. It surfaced 10 specific findings across 7 sections plus 3 missing-section gaps, all tied to source heuristics. The findings are actionable (each names file/line, fix, and priority).

**Where the skill needs work:**

1. **No "missing section" check.** The skill assumes the sections it lists are present. The biggest BuildOS gap (no testimonials) was almost missed because the skill walks present sections, not absent ones. **Recommended addition:** "Pre-walk: Which of the 11 section types are missing from this page? Treat presence as a 0/1 score, then walk for quality."
2. **No "effort drop-off curve" measurement.** The skill mentions effort uniformity as a guardrail but doesn't tell the agent how to score it. **Recommended addition:** A 1–5 effort score per section, with the curve plotted/listed so visible drop-offs flag automatically.
3. **No mobile pass.** The skill is implicitly desktop-focused. Mobile-specific layout heuristics (stacked vs side-by-side, tap-target size, mobile-specific spacing) aren't called out. **Recommended addition:** A short Mobile Pass subsection.
4. **No copy-quality guardrail.** The skill is design-focused but the Pro-vs-Amateur examples include several copy heuristics ("name the customer," "lead with benefits not features," "selling in the FAQ"). These are scattered across sections. **Recommended addition:** A consolidated Copy Pass.
5. **Lazy-load discovery problem isn't directly named.** The skill says "let visitors try the product" but doesn't flag _"if your demo is gated behind viewport intersection, half your visitors won't see it."_ This BuildOS issue would have been missed by a strict reading. **Recommended addition:** A "demo discoverability" check.
6. **Skill output format works.** The structured scorecard + per-section findings + roll-up format produced a usable audit. Keep this.

**Verdict:** Skill v1 is shippable. v1.1 should add: missing-section pre-walk, effort-drop-off scoring, mobile pass, copy pass, and demo-discoverability check.

---

## Source Attribution

This review applied the skill at `docs/research/youtube-library/skill-drafts/marketing-site-design-review/SKILL.md`, which is itself distilled from six DesignSpo videos and Daniel Priestley's $1M landing page video. Source analyses live in `docs/research/youtube-library/analyses/` (six `2026-04-29_designspo-*_analysis.md` files).
