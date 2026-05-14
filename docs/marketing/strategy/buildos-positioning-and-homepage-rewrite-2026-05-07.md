---
title: 'BuildOS Positioning & Homepage Rewrite — 2026-05-07'
created: 2026-05-07
last_updated: 2026-05-09
status: handoff-ready
owner: DJ Wayne
related_docs:
    - /docs/marketing/strategy/buildos-marketing-strategy-2026.md
    - /docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md
    - /docs/marketing/strategy/thinking-environment-creator-strategy.md
    - /docs/marketing/strategy/how-to-explain-buildos-2026-05-11.md
preview_route: /landing-v2
path: docs/marketing/strategy/buildos-positioning-and-homepage-rewrite-2026-05-07.md
---

# BuildOS Positioning & Homepage Rewrite

This is the working doc behind the homepage redesign at `/landing-v2`. It captures the philosophy, the wedge, the audience decisions, and the punch list.

The page is the artifact. This doc is the receipts.

---

## 0. Handoff status & next moves (2026-05-09)

> **Read this first if you're picking up this work.** The page is real and viewable at `/landing-v2` (marked `noindex`). This section is your entry point. Sections 1–8 below are the historical record of how we got here.

### What's been built

Two artifacts:

1. **`apps/web/src/routes/landing-v2/+page.svelte`** — the redesigned homepage. Eight sections (§01 → §08) with a branching decision-tree visual at §02 → §03/§04.
2. **This doc** — the strategy under the rewrite, the decisions, the punch list.

Decisions 1–9 (Section 3) capture the strategic conversation that produced the page. The philosophy in Section 1 came directly from DJ's voice in conversation: _framework for the person, harness for the agent, same context drives both._ Don't rewrite it; expand it (see "Recommended next moves" below).

### Most recent direction (the last thing DJ said before handoff)

DJ asked for a **decision-tree visual where lines actually trace** from §02A and §02B card centers down to §03 and §04 respectively. He specified §03 should be narrowed to ~70% width so the §02B → §04 rail can pass cleanly through the right gutter. Implemented in Decision 9 / current code. **He has not yet reviewed the latest iteration in a browser.** That is the first job for whoever picks this up.

### Open questions awaiting DJ's input

These are unanswered at the moment of handoff:

1. **Landing dots** — each rail terminates with a small filled circle (`w-2 h-2 rounded-full bg-foreground/50`). Too subtle, just right, or remove?
2. **§03's left-flush feel** — heading and flow chart now occupy the left ~70% of max-w-6xl on lg+. Does that read as "intentionally narrowed for the bypass" or just "off-center"?
3. **Vertical rail alignment** — the rail percentages (`top-[22%] h-[8%]` for LEFT, `top-[22%] bottom-[17%]` for RIGHT) are estimated. After browser review, may need tuning. If section content lengths change later, retune.
4. **Mobile / tablet (< lg)** — rails are hidden below `lg`, §03 returns to full width, entry chips align normally. Confirm the fallback reads cleanly.

Plus the older questions in Section 7 (background contrast on §02, the §02 question wording, the daily-brief explainer, whether to introduce a "Bill" agent persona).

### Recommended next moves (in order)

1. **Walk DJ through `/landing-v2` in dev.** `pnpm dev --filter=web` then visit `http://localhost:5173/landing-v2`. Get his answers to the four questions above. Tune percentages or kill the landing dots accordingly.
2. **Lock the H1.** Current candidate: _"Talk to BuildOS, see your thoughts organized."_ (Section 6 has alternatives.) The linter changed "stuff" → "thoughts" mid-conversation; DJ kept "thoughts." Confirm.
3. **Write the philosophy blog** at `apps/web/src/content/blogs/philosophy/framework-and-harness-the-buildos-philosophy.md`. Section 1 is your source material. Both the §02B card CTA and §04's closing line gesture at this blog. Once it exists, §02B's CTA can dual-link (scroll to #agents AND link to the blog).
4. **Reconcile nav.** `apps/web/src/lib/components/layout/Navigation.svelte` still has "How it works" + "Under the hood" tabs from the live homepage (the dual-mechanism slabs Decision 1 dropped). Drop "Under the hood." Consider replacing both with a single "Philosophy" link once the blog ships.
5. **Write the writer case study** for §07 (current placeholder). ~600–900 words, 4-month arc. The placeholder copy is roughly the right voice — use it as the seed.

After those: §06 mock UIs (Day 1 / Week 3 / Month 2 future-pacing timeline) currently use inline HTML approximations — could be replaced with real product screenshots. Then YouTuber case study (secondary). Then promote `/landing-v2` to `/`.

### Files touched in this work session

| File                                                                             | Purpose                  |
| -------------------------------------------------------------------------------- | ------------------------ |
| `apps/web/src/routes/landing-v2/+page.svelte`                                    | The redesigned homepage. |
| `docs/marketing/strategy/buildos-positioning-and-homepage-rewrite-2026-05-07.md` | This doc.                |

Live `apps/web/src/routes/+page.svelte`, `Navigation.svelte`, and the rest of the live site are **untouched**. The redesign is fully isolated.

### Page anatomy (current state)

```
§01  Hero — "Talk to BuildOS, see your thoughts organized."
     ↓
§02  Split — "Do you work with AI agents yet?"
     ├─[ §02A — No ]────────┐                ┌──[ §02B — Yes ]
     │                       │                │
     │                       ▼ LEFT rail      │ RIGHT rail
     │                       │ (lg+ only)     │ (lg+ only)
     │             ↓ from §02A — no           │
     │            ┌──────────────────┐        │
     │            │ §03 The loop     │        │ (rail passes
     │            │ (70% width on    │        │  through right
     │            │  lg+, left-flush)│        │  gutter on lg+)
     │            │                  │        │
     │            │ flow chart       │        │
     │            │ (4 moments)      │        │
     │            └──────────────────┘        │
     │                                        ▼
     │                          ↓ from §02B — yes
     │                         ┌────────────────────┐
     │                         │ §04 Same context   │
     │                         │ 3-col chart        │
     │                         │ Framework / Shared │
     │                         │ context / Harness  │
     │                         └────────────────────┘
     ↓ (both branches converge back into universal content)
§05  What it holds (data model — 8-card grid)
§06  What it becomes (Day 1 / Week 3 / Month 2 future pacing)
§07  Case study (writer placeholder)
§08  Three options + final CTA
```

### Where the rail visual actually lives in code

Rails are positioned in a single layer wrapping §02 → §04. To find current line numbers:

```bash
grep -n "<section id=\|BRANCH WRAPPER\|END BRANCH WRAPPER" \
  apps/web/src/routes/landing-v2/+page.svelte
```

Key elements:

- **Wrapper:** `<div class="relative">` opens just before §02's section comment; closes just before §05's section comment.
- **Rail layer:** inside the wrapper, `<div aria-hidden="true" class="hidden lg:block absolute inset-0 pointer-events-none z-[1]">` containing `<div class="mx-auto max-w-6xl h-full">` then `<div class="relative h-full mx-4">` then an SVG with `viewBox="0 0 100 100" preserveAspectRatio="none"`. SVG draws both rails as `<path>` elements so dashes flow continuously around the right-angle corners (CSS `border-dashed` breaks dashes at every join). HTML `<span>` dots sit alongside the SVG (not as `<circle>` inside it) so they stay perfectly round under the SVG's non-uniform stretch.
- **LEFT rail (SVG path):** `d="M 25,27 L 25,31.5"` — straight vertical from §02A card-bottom (x=25%, y=27%) to §03 entry chip (x=25%, y=31.5%). `vector-effect="non-scaling-stroke"` keeps stroke 2px regardless of the viewport.
- **RIGHT rail (SVG path):** `d="M 75,27 L 75,29 L 90,29 L 90,75"` — drops a hair from §02B (x=75%, y=27%→29%), turns right to clear §03's 78%-wide card (line to x=90%, y=29%), then drops past §03's bottom and lands at §04's chip (line to x=90%, y=75%).
- **§03 78%-width card:** `lg:max-w-[78%] rounded-lg border border-border bg-background shadow-ink-strong tx tx-frame tx-weak p-5 sm:p-8 space-y-8` wrapping the heading + flow chart. The right ~22% of section content area stays empty as a clean gutter for the RIGHT rail.
- **§04 full-width card:** `rounded-lg border border-border bg-background shadow-ink-strong tx tx-frame tx-weak p-5 sm:p-8 space-y-6` wrapping the heading + 3-col chart + closing caption. Spans the full content area (wider than §03 — wider card, more horizontal breathing room for the architecture chart).
- **§03 entry chip:** wrapped in a grid that mirrors §02 (`lg:grid lg:grid-cols-2 lg:gap-5`); chip in left column with `lg:flex lg:justify-center` so it's centered under the LEFT rail at x=25%. Chip wrapper has `relative` and a child `-top-4 h-4` dashed landing extension.
- **§04 entry chip:** anchored to a 20%-wide column on the parent's right edge (`lg:absolute lg:right-0 lg:top-0 lg:w-[20%] lg:flex lg:justify-center`), so chip auto-centers at x=90% to land on the RIGHT rail's terminus. On mobile the outer's `flex justify-end` keeps the chip right-aligned. The chip's text uses `whitespace-nowrap` to prevent wrapping inside the column.

**Tuning:** Horizontal coords are now anchored: §03 right edge = 78%, rail bypass = 90%, §04 chip center = 90%. If you change §03's max-width, also update the rail's `90` (in the SVG `d`), the RIGHT landing dot's `left-[90%]`, and the §04 chip column's `lg:w-[20%]` (column width = 2 × (100% - chip_center%)). Vertical percentages (`27`, `29`, `31.5`, `75` in the SVG) are tuned for current content lengths at desktop ≈1440 wide (wrapper renders ~2775px tall). If §02 / §03 / §04 grow or shrink substantially, measure the wrapper and retune those values to land each rail at the card-bottom edge and entry-chip extension.

### Conventions to preserve

- **Inkprint texture system.** `tx-bloom` (creative/relief), `tx-grain` (execution/technical), `tx-frame` (canon/structure), `tx-pulse` (urgency/today), `tx-thread` (relationships), `tx-strip` (header band). See `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`.
- **Svelte 5 runes.** Never use the legacy reactive syntax. For dynamic icon rendering, the codebase pattern is `{@const Icon = item.icon}` then `<Icon class="..." />`, not `<svelte:component>` (deprecated in Svelte 5).
- **No emojis** in code or copy unless DJ explicitly asks.
- **Tabs for indentation.** Prettier config: tabs, single quotes, no trailing commas, 100 char print width.
- **No new docs without being asked.** This handoff section was explicitly requested.

### Voice / tone notes for whoever's picking this up

DJ thinks in long, exploratory paragraphs and often dictates via voice memo — expect run-on syntax, mid-sentence pivots, and typos. (Notable example from this session: "Bill and Wes" turned out to be a voice-typo for "BuildOS". When in doubt about an unfamiliar reference, ask before building on it.)

He values, in observable order from the conversation:

- **Plain language over positioning language.** "Talk to BuildOS, see your thoughts organized" beat "thinking environment for people making complex things." If you find yourself writing a B2B-deck sentence, simplify.
- **Concrete examples over abstractions.** The novelist with Maya / Ch. 12 / "Fading Crown" / queen-loses-magic is the running example throughout the page. Reuse it; don't invent new ones unless you have a reason.
- **Asymmetric, opinionated design.** He explicitly said: "It's okay if we don't have a symmetric display." The §03/§04 asymmetry (temporal flow vs. structural chart) is intentional.
- **Honest pushback when his instinct is leading somewhere weak.** During this session I pushed back on the two-persona _hero_ split (a known anti-pattern); he kept the underlying split idea but moved it from hero to §02 — which is what we built. He'll respect a clear "here's why I'd push back" and will redirect if his instinct still wins.

Don't yes-and into bad territory.

---

## 1. The contrarian thesis (philosophy)

Most AI tools assume the goal is **delegation**: the agent does the work, the user steps back. That assumption is wrong for creative and complex work, because the work _is_ the thinking.

BuildOS is built on the opposite assumption:

> **Humans and agents should work in parallel, off the same context.**

Two surfaces, one product:

- **Framework — for the person.** A structured way to think, decide, and ship. The daily brief. The return-and-update ritual. The reason you open the app tomorrow.
- **Harness — for the agent.** Persistent project memory, structured tool calls, the context an agent needs to actually be useful in production rather than parlor-trick useful.

Both read from the same project state. Both make progress. Neither is abstracted away.

### Why this is defensible

- **An agent can clone a workflow in a weekend. It can't clone a worldview.** The competitive moat is the assumption underneath the product, not the features on top.
- **The economics flip.** If the harness and the context engineering are right, cheap models stay productive. BuildOS doesn't compete on model quality. It competes on _context quality_ — which you control.
- **The aha moment is checkpoint behavior.** Beta users don't delegate to BuildOS — they return to it daily, update it, then go act. That's a system-of-record relationship, not a tool relationship. Once it holds your project, you don't leave.

### What BuildOS deliberately does _not_ do

- Does not abstract the user out of the work.
- Does not pretend the agent is the doer and the human is the manager.
- Does not require the user to maintain a manual second brain — context is captured as you talk.
- Does not chase the agentic-workflow founder market. (Crowded. Not the wedge.)

> **Reserve a blog post — `framework-and-harness-the-buildos-philosophy.md` — to expand this section. The homepage points at it; the blog carries the weight.**

---

## 2. The wedge

BuildOS is for **the long tail of creative people whose projects don't fit any vertical AI tool.**

The current AI productivity space splits three ways:

| Lane                    | Examples                            | What they serve                   |
| ----------------------- | ----------------------------------- | --------------------------------- |
| Generic AI productivity | Notion AI, Mem, Reflect             | Horizontal, no project shape      |
| Vertical creator AI     | Sudowrite, Descript, Opus Clip      | Deep on one creative format       |
| AI agent platforms      | Lindy, Cursor, Replit Agent, Claude | Technical, founder/builder market |

The gap nobody is naming: **AI for projects that are multi-modal and idiosyncratic.** The novelist who's also building a Substack. The YouTuber writing a book. The course creator with a podcast feeding the course feeding the newsletter. They have five vertical tools and no place where the _whole project_ lives.

That's BuildOS-shaped. That's the front door.

### Audience callouts (concrete, on the page)

Authors · YouTubers · Podcasters · Course creators

(We keep the literal list. It's more concrete than abstract category language and gives the reader an anchor.)

### Secondary audience: builders working with agents

Real, valuable, but **not the hero.** Caught by the §02 split (right side) and the philosophy blog. The hero speaks to the long-tail creator.

---

## 3. Homepage architecture (decisions)

### Decision 1 — Drop the dual `[How it works] [Under the hood]` mechanism slabs

They're labeled as different things and overlap. Both lead with mechanism, which is the generic-SaaS posture. Replaced with a §-numbered narrative spine.

### Decision 2 — Lead with the simplest possible promise

H1 candidate: **"Talk to BuildOS, see your thoughts organized."**

This came from DJ's own words. It's verb-noun-verb-noun. It's plain. It's not "thinking environment for people making complex things" — that's positioning language for B2B decks. The hero is the front door for a long-tail creator who's tired of tabs.

Subhead carries the parallel-work concept in human language:

> "A thinking environment where you and your agents work the same project, off the same context. You stay in the work. Your agents stay useful. Both of you make progress in parallel."

### Decision 3 — Use the §-numbered two-card split (§02) for audience self-selection

Modeled on the Stakes "do you know the Enneagram?" pattern. One question, two paths, no abandonment.

- **§02A — No** → for the creator who hasn't gone deep on AI. Plain language. Outcome promise. CTA: "Start with one project."
- **§02B — Yes** → for the technical reader. Framework + harness. Mini "type cards" mirroring the Stakes pattern (Framework / Harness / Shared context). CTA: "Read: Framework + Harness."

This solves the two-persona problem without splitting the hero. The hero is for the creator. The split section captures the technical reader without losing the creator.

### Decision 4 — The mechanism stays (§03 What it holds)

DJ explicitly said: don't withhold mechanism. The 8-card data model (Projects / Goals / Plans / Tasks / Milestones / Documents / Risks / Flexible structure) stays, but condensed.

### Decision 5 — Future-pacing timeline (§04 What it becomes) is the new spine

Most SaaS pages show feature, feature, feature. BuildOS shows **what one project looks like over time.** Three stages with mock UIs:

- **Day 1 — first brain dump.** Idea → basic project structure.
- **Week 3 — momentum visible.** Active project view, tasks done, recents, decisions captured.
- **Month 2 — the daily ritual.** Daily brief in inbox + in-app, calendar synced. The return-and-update behavior made visible.

**This is the moat made visible.** "Context compounds over time" is an abstract claim. The timeline is the evidence.

### Decision 6 — Case study, primary first

- **Primary: writer writing a book** (4-month arc). On-thesis with the long-tail creative wedge, harder for vertical AI to serve, more emotionally resonant.
- **Secondary: YouTuber growing a channel.** Better for social distribution. Ship after the writer one.

Page currently has a **placeholder card** for the writer case study. Real case study to be written.

### Decision 7 — Keep three-options + final CTA

Already works. No changes. (Now numbered §07 after the §03 insertion.)

### Decision 8 — Add a §03 "The loop" flow chart for the non-AI-agents reader

Sits right after the §02 split, scoped to the §02A ("No") path. A vertical, time-stamped flow chart with paired columns — **You** (left, what you say) and **BuildOS** (right, what it does) — connected by directional arrows. Four moments:

1. **Day 1.** Brain dump → project created. Project, docs, tasks, goal materialize.
2. **1 week later.** Brain dump → project updates. Maya doc updated, queen-motive doc created, beta-reader task added.
3. **Daily brief (next morning).** BuildOS sends. Same content in inbox + app. Arrow flips left to show direction.
4. **Later that day.** Brain dump completes a task. Ch. 12 visibly checked off, beta-reader pass moved +1 week, "tighter" captured as a note.

Why it earns its section: the §02A card promises "you talk, we organize, you come back tomorrow" — but doesn't show the _mechanism_. The flow chart is the mechanism. It's the most concrete pedagogical element on the page and demonstrates the brain-dump-as-conversation loop without explaining it.

Originally planned as a future §03B mirror — instead built as the asymmetric §04 below (see Decision 9).

### Decision 9 — Make §02 a real branching tree with continuous rails

The §02 split is no longer just an audience self-selector with two CTAs. It's a true decision-tree node with two **physically continuous lines** that branch at §02 and arrive at their respective destinations:

- **LEFT rail:** drops from the bottom-left corner of §02A's card area down into §03's heading area. Short — terminates at the entry chip on §03.
- **RIGHT rail:** drops from the bottom-right corner of §02B's card area, runs all the way down past §03 entirely, and arrives at the top of §04. Skirts §03 in the right gutter without interrupting it.
- **§03 entry chip:** top-left, reads `↓ from §02A — no` (`tx-bloom`). The LEFT rail visually lands here.
- **§04 entry chip:** top-right, reads `↓ from §02B — yes` (`tx-grain` + accent dot). The RIGHT rail visually lands here.
- **Asymmetric on purpose.** No-path gets a temporal flow chart (the loop). Yes-path gets a structural architecture chart (3-column: framework / shared state / harness). User explicitly asked for asymmetry — "skip to where you want to see stuff and see what's relevant to you."

§04 content (built):

- **Section title:** "You and your agents, on the same project."
- **3-column chart:** Framework (you) ↔ Shared project state ↔ Harness (your agent). Middle card uses accent border to signal it's the central node. Each side card shows a concrete example (your brain dump on the left, the agent's action on the right; both contribute to the middle).
- **Closing line:** "An agent can clone a workflow in a weekend. It can't clone a worldview. The moat is the shared context layer — and you control it."

Rail technical notes (for future maintainers):

- §02, §03, §04 are wrapped in a single `<div class="relative">` (BRANCH WRAPPER) so absolutely-positioned rails can span across section boundaries.
- The rail layer is `<div class="hidden lg:block absolute inset-0 pointer-events-none">` containing an inner `mx-auto max-w-6xl px-4 h-full relative`. Rails are positioned relative to this inner content-width container so they align with the centers of §02A and §02B cards (which sit in a 2-col grid inside the same max-w-6xl).
- **LEFT rail:** `absolute left-[25%] top-[22%] h-[8%]`. Tracks down from §02A card-center bottom and lands at §03's entry chip area.
- **RIGHT rail:** `absolute right-[25%] top-[22%] bottom-[17%]`. Tracks down from §02B card-center bottom, runs the entire height of §03 in its right gutter, and lands at §04's entry chip area.
- Each rail terminates with a small `w-2 h-2 rounded-full bg-foreground/50` "landing dot" so the arrival reads as deliberate.
- Both: `border-l-2 border-dashed border-foreground/50`.
- §03's heading + flow chart are wrapped in an inner `<div class="space-y-8 lg:max-w-[70%]">` (default left-flush block layout). On lg+, this leaves the right ~30% of max-w-6xl free as a clean gutter for the RIGHT rail to run through. The §03 entry chip is OUTSIDE this 70% wrapper, with `lg:pl-[24%]` so it lands directly under the LEFT rail.
- §04's entry chip uses `flex justify-end lg:pr-[24%]` so it lands directly under the RIGHT rail.
- Vertical percentages (`top` / `bottom` / `h`) are approximate (§02 ≈ 22-25% of wrapper, §03 ≈ 50-55%, §04 ≈ 22-25%). If section content changes substantially, tune those values.
- Visible `lg+` only. On smaller screens, the entry chips on §03 (top-left, `lg:pl-[24%]` no-ops) and §04 (top-right, `lg:pr-[24%]` no-ops) become normal aligned chips and carry the branching narrative without rails — acceptable degradation.
- Earlier iterations used (a) short fork stubs with chip labels at the bottom of §02 and (b) edge-aligned rails at `left-4` / `right-4`. Both replaced once it was clear the rails should physically trace from §02A and §02B card centers down to their respective destinations — that's the difference between a labelled fork and an actual decision-tree diagram.

---

## 4. Page structure as built (in `/landing-v2`)

```
§01  Hero          — H1 "Talk to BuildOS, see your thoughts organized." + demo card
§02  Split         — "Do you work with AI agents yet?" → 2 cards + visual fork
§03  The loop      — Flow chart (Day 1 / 1 wk / brief / later) — for §02A readers
                    [right rail visualizes §02B bypassing this section]
§04  Same context  — 3-column chart (Framework / Shared state / Harness) — for §02B
§05  Hold          — What's inside (data model, condensed)
§06  Become        — Day 1 / Week 3 / Month 2 future-pacing timeline
§07  Case study    — Writer, 4 months (placeholder for now)
§08  Three options + final CTA
```

What got cut from the live homepage:

- The "Built by DJ Wayne, USMC Scout Sniper..." paragraph (move to /about; doesn't belong in the front door)
- The lazy-loaded PublicProjectView (still valuable; consider re-introducing after §04 timeline as the "real one in action" proof)
- The featured-blog-posts section (separate concern; can return as §05.5 if we want)
- The two redundant nav anchors

---

## 5. Punch list (sequenced)

Work through in order. Each is small and ships independently.

- [ ] **P0 · Review `/landing-v2` in the browser.** Sanity-check the texture and copy at desktop + mobile.
- [ ] **P0 · Lock the H1.** Confirm "Talk to BuildOS, see your thoughts organized." ships, or pick an alternative below.
- [ ] **P1 · Write the philosophy blog** (`framework-and-harness-the-buildos-philosophy.md`) — the deep-water companion piece §02B links to.
- [ ] **P1 · Resolve the nav.** Drop "Under the hood" from `Navigation.svelte`; replace "How it works" with a single anchor (e.g. "How it works" → `#how`) or replace both with "Philosophy" pointing at the blog.
- [ ] **P1 · Write the writer case study.** Real content for §07. ~600–900 words. 4-month arc. Pull screenshots from a real BuildOS project if possible.
- [ ] **P2 · Decide whether to re-add the lazy `PublicProjectView`** after §06. Strong case for keeping it as the "okay, here's a real one" proof.
- [ ] **P2 · Build the YouTuber case study** for §07 (rotate with the writer one, or stack).
- [ ] **P2 · Visual polish on the §06 mock UIs.** Right now they're inline HTML/CSS approximations of the real product. Consider real screenshots once the case-study novelist's project is shaped enough.
- [ ] **P3 · Promote `/landing-v2` to `/`** once the punch list is green. Archive the old `+page.svelte` to `apps/web/src/routes/_archive/landing-v1/+page.svelte` for reference.
- [ ] **P3 · Remove `noindex` meta** from the new landing page when it goes live.

---

## 6. Hero alternatives (in case Q1 of the punch list rejects the candidate)

In rough order of preference:

1. **"Talk to BuildOS, see your thoughts organized."** _(recommended; current candidate)_
2. **"The project that holds your project."**
3. **"Stop losing the thread between sessions."**
4. **"Your project, in one place. Your agents, on the same page."**
5. **"For projects that don't fit anywhere else."** _(more wedge-forward, less benefit-forward)_

Ship #1 unless we want to A/B.

---

## 7. Open questions

- **Should the §02 split section have a darker / inverted background** to mirror the Stakes screenshot more literally? Currently using `bg-card/40` for subtle contrast. Could go fully inverted.
- **Should the §02 question itself change?** "Do you work with AI agents yet?" is direct and audience-self-selecting, but feels slightly leading. Alternatives: "How do you work with AI?" / "Are you building with agents?" / "Do you already use AI for your projects?"
- **When does Bill make an appearance, if at all?** (Note: original conversation reference to "Bill and Wes" was a typo for BuildOS. No agent persona yet — but worth deciding whether to introduce one as part of the mystique angle later.)
- **Where does the daily brief live in nav?** The Month-2 stage shows it, but the live product feature isn't visible from the public pages. May warrant a `/daily-brief` explainer.

---

## 8. What this doc is _not_

- Not the philosophy blog. That's a separate file (P1 above).
- Not the guerrilla content campaign. That's `docs/marketing/social-media/publish-kits/2026-03-12-buildos-guerrilla-seed-campaign.md`.
- Not the brand voice spec. That's `docs/marketing/brand/brand-guide-1-pager.md`.

This doc is one thing: the strategy _under_ the homepage rewrite, and the punch list to ship it.
