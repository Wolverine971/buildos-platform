---
title: 'BuildOS Positioning & Homepage Rewrite — 2026-05-07'
created: 2026-05-07
status: working-draft
owner: DJ Wayne
related_docs:
    - /docs/marketing/strategy/buildos-marketing-strategy-2026.md
    - /docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md
    - /docs/marketing/strategy/thinking-environment-creator-strategy.md
preview_route: /landing-v2
path: docs/marketing/strategy/buildos-positioning-and-homepage-rewrite-2026-05-07.md
---

# BuildOS Positioning & Homepage Rewrite

This is the working doc behind the homepage redesign at `/landing-v2`. It captures the philosophy, the wedge, the audience decisions, and the punch list.

The page is the artifact. This doc is the receipts.

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

H1 candidate: **"Talk to BuildOS, see your stuff organized."**

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

### Decision 7 — Keep §06 three-options + final CTA

Already works. No changes.

---

## 4. Page structure as built (in `/landing-v2`)

```
§01  Hero  — H1 "Talk to BuildOS, see your stuff organized." + demo card
§02  Split — "Do you work with AI agents yet?" → 2 cards (No / Yes)
§03  Hold  — What's inside (data model, condensed)
§04  Become — Day 1 / Week 3 / Month 2 future-pacing timeline
§05  Case study — Writer, 4 months (placeholder for now)
§06  Three options + final CTA
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
- [ ] **P0 · Lock the H1.** Confirm "Talk to BuildOS, see your stuff organized." ships, or pick an alternative below.
- [ ] **P1 · Write the philosophy blog** (`framework-and-harness-the-buildos-philosophy.md`) — the deep-water companion piece §02B links to.
- [ ] **P1 · Resolve the nav.** Drop "Under the hood" from `Navigation.svelte`; replace "How it works" with a single anchor (e.g. "How it works" → `#how`) or replace both with "Philosophy" pointing at the blog.
- [ ] **P1 · Write the writer case study.** Real content for §05. ~600–900 words. 4-month arc. Pull screenshots from a real BuildOS project if possible.
- [ ] **P2 · Decide whether to re-add the lazy `PublicProjectView`** after §04. Strong case for keeping it as the "okay, here's a real one" proof.
- [ ] **P2 · Build the YouTuber case study** as the second §05 (rotate, or stack).
- [ ] **P2 · Visual polish on the §04 mock UIs.** Right now they're inline HTML/CSS approximations of the real product. Consider real screenshots once the case-study novelist's project is shaped enough.
- [ ] **P3 · Promote `/landing-v2` to `/`** once the punch list is green. Archive the old `+page.svelte` to `apps/web/src/routes/_archive/landing-v1/+page.svelte` for reference.
- [ ] **P3 · Remove `noindex` meta** from the new landing page when it goes live.

---

## 6. Hero alternatives (in case Q1 of the punch list rejects the candidate)

In rough order of preference:

1. **"Talk to BuildOS, see your stuff organized."** _(recommended; current candidate)_
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
