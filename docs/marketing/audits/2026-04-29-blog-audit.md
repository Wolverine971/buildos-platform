---
title: BuildOS Blog Audit & Gap Analysis
date: 2026-04-29
auditor: Claude (Opus 4.7) via 6 parallel auditor agents
scope: All 73 files in apps/web/src/content/blogs/
status: complete
path: docs/marketing/audits/2026-04-29-blog-audit.md
---

# BuildOS Blog Audit & Gap Analysis — 2026-04-29

73 files audited across 7 folders. An `AUDIT 2026-04-29` HTML comment block was appended to every file with per-file scoring and recommendations. This document is the cross-cutting synthesis.

---

## TL;DR

**Of 73 files, only ~14 are publishable, on-message, finished blogs.** The rest fall into four failure modes:

| Failure mode                                  | Count   | What it is                                                                                                                                    |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal scaffolding shipped to public folder | 21      | `-interview.md` files — lists of unanswered interview questions, `published:false`, but sitting in `/content/blogs/`                          |
| Empty stubs with real-looking SEO frontmatter | 9       | `_Content coming soon..._` body, with `excerpt`/`readingTime`/`priority` set as if real                                                       |
| Stale 2025-era strategy docs                  | 5       | `_index-*.md` files pinned to retired ADHD-first positioning                                                                                  |
| Voice/positioning misfits or factually broken | 8       | Real prose, but contradicts 2026 anti-AI / thinking-environment doctrine, or has fabricated testimonials, or claims features that don't exist |
| **Real, on-message, finished**                | **~14** | The actual catalog                                                                                                                            |

**Two single biggest hygiene problems:**

1. **21 `-interview.md` files in `/content/blogs/`.** These are draft-scaffolding documents — internal lists of "questions for the author to answer when writing the blog." They have `tags: ['planning', 'outline', 'internal']` and `excerpt: 'Internal planning document for blog post creation.'` Six folders contain them. They are protected only by `published: false` flags, but they are still loaded by the SvelteKit content tree. Verify the loader filters them out, then delete or move them to `/docs/marketing/drafts/`.

2. **9 empty stubs with elaborate SEO frontmatter.** Files like `calendar-integration-workflow.md`, `focus-time-optimization.md`, `phase-based-project-execution.md`, all four `product-updates/*.md`, and three philosophy stubs (`productivity-vs-busy-work.md`, `information-architecture-principles.md`, `personal-operating-system-manifesto.md`) have full SEO frontmatter (titles, excerpts, reading time, priority) but a body of `_Content coming soon..._`. Most have been sitting empty since 2025-10-23. Either finish them or delete them.

---

## The Catalog: Honest Inventory

### Top-tier (KEEP_AS_IS — flagship-quality, on-message, citable)

These are the bar. Everything else gets measured against them.

1. `philosophy/anti-ai-assistant-execution-engine.md` — 9/10. The flagship. Real HBR/NBER citations from 2026, sharp prose, anti-AI without being preachy.
2. `philosophy/social-media-is-dead-interest-media.md` — 9/10. Anti-feed cluster anchor.
3. `philosophy/what-a-thinking-environment-actually-is.md` — 9/10. Defines the category.
4. `philosophy/your-morning-without-the-algorithm.md` — 9/10. The morning-without-algorithm essay.
5. `buildos-vs-obsidian-knowledge-management.md` — 9/10. Best comparison piece. Steel-mans Obsidian first. Tuesday-morning opening that's a workshop in BuildOS voice. (Misplaced at root — should move to `/comparisons/` or `/case-studies/`.)
6. `philosophy/you-stopped-choosing-what-you-think-about.md` — 8/10.
7. `talking-listening-productivity-phases.md` — 8/10. Should move to `/philosophy/`. Currently `published: false`, ready to ship.
8. `agent-skills/google-calendar-for-ai-agents-search-before-you-create.md` — 8/10. Original technical thinking, distinctive voice.
9. `advanced-guides/debug-the-harness-not-the-model.md` — 8/10. Moved out of agent skills because it is a regular blog/framework article, not a portable skill.
10. `case-studies/buildos-vs-monday-thought-organization.md` — 7.5/10. Solid comparison; needs voice tightening.
11. `case-studies/buildos-vs-chatgpt-context-that-compounds.md` — 7/10.
12. `productivity-tips/tech-project-managers-guide.md` — 8/10. The PM-guide post that proves the productivity-tips folder _can_ be good when given a real audience.
13. `getting-started/first-project-setup.md` — 8/10.
14. `getting-started/under-the-hood.md` — 8/10.

### Tier 2 (LIGHT_EDIT — fix before next deploy)

15. `getting-started/daily-brief-guide.md` — 8/10 but needs "executive assistant" magic-AI metaphor cut and FOMO close softened.
16. `philosophy/compound-engineering-for-your-life.md` — 7/10. Solid but locked in Feb-2026 framing; doesn't crosswalk to current thinking-environment vocabulary.
17. `productivity-tips/context-engineering-101.md` — 7/10. Strong essay but leads with AI (violates anti-AI rule); should move to `/philosophy/` and re-title away from "101".
18. `productivity-tips/evolution-of-note-taking.md` — 7/10. Has a stale `<!-- BLOG TODO -->` block in the body.
19. `vision-deserves-better-operating-system.md` — 6/10. Two endings stitched together; needs a research citation; should move to `/philosophy/`.
20. `philosophy/future-of-personal-knowledge-management.md` — 6/10. Repeats an "80% of notes never get read" claim three times with no citation.
21. `productivity-tips/task-management-best-practices.md` — 6/10. Drifts into productivity-listicle voice; uses ❌/✅ emoji against brand guidelines.
22. `getting-started/how-buildos-works.md` — 6/10. FOMO close + executive-assistant magic-AI line.

### Tier 3 (REWRITE — fundamentally on-strategy but voice or content needs major work)

23. `case-studies/buildos-vs-notion-adhd-minds.md` — 4.5/10. **Currently published with six fabricated testimonials.** Highest reputational risk in the catalog.
24. `notion-recurring-tasks-complexity.md` — 5/10. Three more fabricated-looking testimonials. Premise factually eroded by recent Notion automation features. Its own internal TODO already flags rewrite.
25. `getting-started/who-is-buildos-for.md` — 4/10. ADHD-heavy, gag-list opener, doesn't lead with creator wedge that 2026 strategy has chosen.
26. `getting-started/effective-brain-dumping.md` — 6/10 but the brain dump is the _signature primitive_ of the product and this post documents it most weakly. Prescribes a contrived 20-minute timed session, barely mentions voice.
27. `getting-started/understanding-life-goals.md` — 5/10. Generic self-help-conference voice.
28. `philosophy/agentic-vrs-context-engineering.md` — 5/10. Pre-anti-AI strategy artifact; merge thesis into anti-ai-assistant-execution-engine.md and kill.

### Tier 4 (KILL — internal scaffolding, empty stubs, or category-fail)

#### `-interview.md` scaffolding (21 files — all KILL or move to `/docs/marketing/drafts/`)

| Folder             | Files                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| philosophy/        | future-of-personal-knowledge-management-interview.md, information-architecture-principles-interview.md, personal-operating-system-manifesto-interview.md, productivity-vs-busy-work-interview.md                   |
| productivity-tips/ | calendar-integration-workflow-interview.md, focus-time-optimization-interview.md, phase-based-project-execution-interview.md                                                                                       |
| advanced-guides/   | advanced-task-dependency-management-interview.md, api-integration-workflows-interview.md, custom-context-field-mastery-interview.md, power-user-automation-techniques-interview.md                                 |
| case-studies/      | academic-researcher-time-management-interview.md, creative-professional-project-organization-interview.md, remote-team-coordination-success-interview.md, startup-founder-productivity-transformation-interview.md |
| product-updates/   | build-os-beta-launch-interview.md, calendar-integration-announcement-interview.md, dynamic-context-feature-interview.md, phase-management-update-interview.md                                                      |
| (root)             | buildos-vs-monday-thought-organization-interview.md, buildos-vs-obsidian-knowledge-management-interview.md                                                                                                         |

These are all internal "Blog Interview Guide:" planning docs. They were never meant to ship. Move out of `/content/blogs/` immediately.

#### Empty stubs (9 files)

- `philosophy/personal-operating-system-manifesto.md` — title/H1 mismatch; superseded by `what-a-thinking-environment-actually-is.md`. KILL.
- `philosophy/information-architecture-principles.md` — superseded by thinking-environment post. KILL.
- `philosophy/productivity-vs-busy-work.md` — generic productivity territory. KILL or finish only if it has a strong unique angle.
- `productivity-tips/calendar-integration-workflow.md` — empty stub. KILL.
- `productivity-tips/focus-time-optimization.md` — empty stub. KILL or merge into a deep-work post.
- `productivity-tips/phase-based-project-execution.md` — **the one stub worth finishing.** Phase generation is unique BuildOS mechanic with no competitor parallel.
- `product-updates/build-os-beta-launch.md` — stale (BuildOS is past beta). KILL.
- `product-updates/calendar-integration-announcement.md` — feature shipped months ago. KILL.
- `product-updates/dynamic-context-feature.md` — feature name not surfaced in product UI. KILL.
- `product-updates/phase-management-update.md` — names features (`phases-only`, `schedule-in-phases`, `calendar-optimized`) that **do not appear anywhere in the codebase**. Either fictional or extremely renamed. KILL.

#### Whole categories that should not exist as-is

- **`/product-updates/`** — entire folder should be deleted. Replace with a `/changelog/` page. Product-update blog posts age into liabilities; changelogs age into trust.
- **`/advanced-guides/`** — entire folder should be deleted. Eight of nine files are scaffolding/stubs; the only real file (`troubleshooting-common-issues.md`) is a help-center doc misfiled as a blog. Plus the four planned topics (API, dependencies, custom fields, power-user automation) are built on premises that violate the anti-AI doctrine ("automate", "mastery", "power user") and partially claim product surfaces that don't exist (public API, webhooks, Zapier integrations).

#### Index files (5 files) — strategy docs masquerading as blogs

`_index-comparison.md`, `_index-entrepreneurship.md`, `_index-philosophy.md`, `_index-productivity.md`, `_index-technical.md`. All five are 200-400 line internal content-strategy planning docs sitting in `/content/blogs/`. They should move to `/docs/marketing/strategy/blog-content-plans/` and be rewritten against current 2026 doctrine. **Verify the SvelteKit content loader filters underscore-prefixed files** — otherwise these are publicly routable.

---

## Cross-Cutting Findings

### A. The dishonest-content cluster (highest reputational risk)

Three published or near-published blogs contain **fabricated testimonials** presented as real user voices:

1. `case-studies/buildos-vs-notion-adhd-minds.md` (currently `published: true`) — six anonymous, unattributable quotes ("It's like having an executive assistant who lives in my brain", "I forgot what it felt like to just... create.").
2. `notion-recurring-tasks-complexity.md` — three "user testimonials" that read fabricated (Former Notion power user / Overwhelmed entrepreneur / Product manager).
3. `case-studies/*-interview.md` outline drafts — list specific outcomes ("Published 3 papers vs. 1 in previous year", "Raised Series A", "Team grew from 5 to 15") as if they were findings before any interview was conducted.

**Action: pull the live Notion-ADHD post or strip the quotes immediately.** The other two are not yet `published: true` but the muscle memory needs to be broken.

### B. The fabricated-features cluster (technical credibility risk)

Multiple blogs claim BuildOS features or surfaces that **don't exist in the codebase**:

- **Public API + automation surface** (`advanced-guides/api-integration-workflows*`, `advanced-guides/power-user-automation-techniques*`) — claims OAuth client registration, API keys, webhooks, rate limits, SDKs, Zapier/Make integrations, integration marketplace. None of this exists. `/api/public/` is for marketing pages only.
- **Three named phase-generation strategies** (`product-updates/phase-management-update*`, `productivity-tips/phase-based-project-execution*`, `BLOG_CONTENT_STRATEGY.md`) — `phases-only`, `schedule-in-phases`, `calendar-optimized`. Zero hits in `apps/web/src/`. Either renamed, removed, or fabricated.
- **Critical-path / FS-SS-FF dependency engine** (`advanced-guides/advanced-task-dependency-management*`) — BuildOS has phases, not a true dependency graph or CPM engine.
- **User-defined custom-field schemas, context inheritance, automation rules, "context field API"** (`advanced-guides/custom-context-field-mastery*`) — auto-generated context from brain dumps exists; the rest is aspirational.

**Action: shipping any of these would create a "claims vs reality" gap that a single skeptical user could turn into a Reddit thread.** Don't finish these as-is.

### C. Title cannibalization & duplicate clusters

| Cluster                             | Files                                                                                                                                                                  | Recommendation                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Anti-AI thesis                      | `anti-ai-assistant-execution-engine.md` (2026, winner) + `agentic-vrs-context-engineering.md` (2025, kill) + `compound-engineering-for-your-life.md` (riff)            | Keep the anti-AI piece as canonical; kill `agentic-vrs-context-engineering`; light-edit compound-engineering to crosslink. |
| 2026 anti-feed cluster              | `your-morning-without-the-algorithm` + `social-media-is-dead-interest-media` + `what-a-thinking-environment-actually-is` + `you-stopped-choosing-what-you-think-about` | Designed overlap; functions as a series. Verify Google distinguishes them; consider a hub page.                            |
| Manifesto overlap                   | `personal-operating-system-manifesto.md` (stub) + `what-a-thinking-environment-actually-is.md`                                                                         | Superseded; kill the stub.                                                                                                 |
| PKM/IA stubs                        | `future-of-personal-knowledge-management.md` + `information-architecture-principles.md` (stub) + `personal-operating-system-manifesto.md` (stub)                       | Three drafts on overlapping ground; kill the two stubs.                                                                    |
| Comparison-template trio            | `buildos-vs-chatgpt-context-that-compounds` + `buildos-vs-monday-thought-organization` + `buildos-vs-notion-adhd-minds`                                                | Identical structural scaffolding + verbatim ASCII GOALS→PLANS→TASKS diagram. Extract the diagram to a shared MDX partial.  |
| Goals→Plans→Tasks→Documents diagram | Appears in `context-engineering-101`, `evolution-of-note-taking`, `task-management-best-practices`, philosophy posts, all 3 case-studies comparisons                   | Pick one canonical reference. Subtle mismatches (Milestones in/out, Plans = phases or not) actively confuse new readers.   |
| Project Lens "zoom levels" pitch    | `context-engineering-101`, `evolution-of-note-taking`, `task-management-best-practices`                                                                                | Three slightly different versions, no canonical source.                                                                    |
| Brain-dump explanation              | `effective-brain-dumping`, `how-buildos-works`, `first-project-setup`                                                                                                  | Decide which is canonical and link from the others.                                                                        |
| Calendar fork                       | `product-updates/calendar-integration-announcement*` (broken stubs) + `productivity-tips/calendar-integration-workflow*` (broken stubs)                                | Both forks broken; neither published. Pick one home and finish, or kill both.                                              |
| Phase-management fork               | `product-updates/phase-management-update*` + `productivity-tips/phase-based-project-execution*`                                                                        | Both reference fictional/unverified three-strategy taxonomy.                                                               |

### D. Voice drift signals (recurring patterns to grep out)

These appear across multiple files and contradict the anti-AI / thinking-environment voice:

- **"executive assistant who's been with you for years"** — magic-AI metaphor in `daily-brief-guide.md` and `how-buildos-works.md`.
- **"Every day you wait is context you don't have"** — FOMO close in `how-buildos-works.md` and `who-is-buildos-for.md`.
- **"Power user", "mastery", "unlock your other 80%", "insider secrets"** — productivity-porn vocabulary throughout `/advanced-guides/`.
- **"AI-powered", "AI does:" feature lists, "AI changes this equation"** — leading with AI in `notion-recurring-tasks-complexity`, `context-engineering-101`, `effective-brain-dumping`, `future-of-personal-knowledge-management`, `agentic-vrs-context-engineering`.
- **❌/✅ emoji** — `task-management-best-practices.md` (against brand guidelines).
- **In-body HTML draft notes** — three flagship 2026 philosophy posts have 80–100-line `<!-- ... -->` scaffolding blocks shipped inside the markdown body. Not rendered, but bloats the file and risks leaking via view-source.
- **"BuildOS hits different for ADHD minds"** — ADHD-first positioning that the 2026 strategy has retired in favor of creator wedges.

### E. Placement / taxonomy is broken

- Three "BuildOS vs X" comparison blogs are at root, two more are in `/case-studies/`. There is no `/comparisons/` folder. Decide: are comparisons a category or not? If yes, create the folder and move all five.
- `talking-listening-productivity-phases.md` has frontmatter `category: 'philosophy'` but lives at root.
- `vision-deserves-better-operating-system.md` has frontmatter `category: 'Philosophy'` but lives at root.
- `buildos-vs-obsidian-knowledge-management.md` has frontmatter `category: 'Comparison'` but lives at root.
- `notion-recurring-tasks-complexity.md` has `category: 'Comparison'` but lives at root.
- `context-engineering-101.md` is in `/productivity-tips/` but reads as philosophy.

The split looks unintentional — files were dropped at root and never moved into the categorical folders that exist for them. **Frontmatter category should determine folder, full stop.**

---

## Gap Analysis: What's NOT Being Said

### Topics the catalog claims to own but doesn't

These are differentiators repeated as marketing claims across many posts, but never given a canonical deep-dive:

1. **Voice-first capture** — "voice in, structure out" is repeatedly named as a distinctive BuildOS mechanic (`/buildos-vs-obsidian` post, `_index-productivity.md`). Has zero standalone post. **This is the most under-leveraged differentiator in the catalog.** A single well-written post showing a real voice memo on a walk → structured project would land harder than any of the planned `/advanced-guides/` posts.
2. **The brain-dump → structured project demo (worked example).** Every post describes the BuildOS flow; no post shows it end-to-end with a real (or realistic) transcript and the structured output side-by-side. The Obsidian comparison gestures at it; nothing fully delivers.
3. **The context-compiler workflow.** "Export your project context into ChatGPT/Claude/Cursor and skip 15 minutes of explaining yourself." Mentioned in the anti-AI exemplar; no how-to post. This is a real BuildOS power move — the genuine answer to the "advanced-guides" category that the current `/advanced-guides/` folder mistakenly tries to fill with API/automation fiction.
4. **Project memory across breaks ("the restart tax").** The Obsidian post identifies "restarting is 40% of the job" as the BuildOS wedge. No standalone post owns this thesis. It's the missing canonical "why your Monday morning is broken" post.
5. **Daily-brief mechanics deep-dive.** Briefs are mentioned in 4+ posts as a feature but never get their own deep-dive: how they're generated, what's in them, how to tune them, multi-project priority handling. The `daily-brief-guide.md` is solid as onboarding but doesn't go technical.

### Audience the strategy targets but the catalog doesn't address

The 2026 strategy positions **authors + YouTubers as the primary creator wedge**. The current catalog has zero blog posts written specifically for these audiences. Suggested:

6. **The novelist working a draft** — long-arc creative project, voice-memo capture, "where was I?" restart cost. Highest-fit case study available.
7. **The non-fiction author / newsletter operator** — research capture, outline iteration, scheduling against publishing cadence.
8. **The dissertation/thesis writer** — multi-year stateful work, literature-review capture, advisor handoffs.
9. **The solo YouTuber/podcaster** — episode pipelines, research dumps, recurring deadlines.
10. **The indie founder building one product solo** — DJ Wayne _himself_ is this archetype. A first-person _"How I run BuildOS on BuildOS"_ post is the most honest case study available today, and it's the best wedge for the founder/creator audience.

### Honest tradeoffs the catalog refuses to acknowledge

11. **When BuildOS does NOT work.** Highly visual projects, code-heavy work, team collaboration, hyper-structured workflows. Every post reads as if BuildOS solves all productivity problems. The Obsidian comparison post acknowledges this once ("there is no neutral tool") and that one paragraph is doing more credibility work than the rest of the catalog combined. **A short "what BuildOS isn't built for" post would buy more trust than five feature-tutorials.**

### Citation gaps

12. **Anti-AI thesis is asserted but rarely grounded in concrete agent-failure receipts.** The anti-AI flagship cites HBR/NBER, which is excellent. Most of the rest of the catalog asserts the thesis without receipts — a botched Claude scheduling, a ChatGPT plugin disaster, a real failed agent rollout. One agent-failure case study would harden the entire philosophy folder.

### Engineering-audience pillar half-built

13. **`/agent-skills/` has only 2 posts.** Both are excellent (8/10 each). The folder shows the right ambition but isn't a pillar yet. Either commit to 5+ posts (Gmail safe-sending, Drive context retrieval, OAuth-for-agents, the Founder Assistant Stack, Slack agent etiquette) or fold the two existing posts into `/technical/`.

---

## Recommended Action Plan (Prioritized)

### This week (hygiene — costs nothing, recovers credibility)

1. **Pull or strip fabricated testimonials from `case-studies/buildos-vs-notion-adhd-minds.md` (currently `published: true`).** Six anonymous quotes go.
2. **Strip in-body HTML draft-notes blocks** from the three 2026 anti-feed posts before next deploy.
3. **Verify the SvelteKit content loader excludes `_*.md` and `*-interview.md` files.** If not, add the filter immediately.
4. **Move all 21 `-interview.md` files** out of `/content/blogs/` to `/docs/marketing/blog-briefs/`.
5. **Move all 5 `_index-*.md` files** out of `/content/blogs/` to `/docs/marketing/strategy/blog-content-plans/`.
6. **Delete 9 empty stubs** with placeholder bodies (or, for `phase-based-project-execution.md`, finish it because that one is worth finishing).
7. **Delete the entire `/product-updates/` folder.** Replace with a simple dated changelog page.
8. **Delete 7 of 9 files in `/advanced-guides/`** (everything except `troubleshooting-common-issues.md`, which moves to a help-center route). Retire the folder concept.
9. **Move misplaced files to their categorical folders** based on frontmatter `category`:
    - `talking-listening-productivity-phases.md` → `/philosophy/`
    - `vision-deserves-better-operating-system.md` → `/philosophy/`
    - `buildos-vs-obsidian-knowledge-management.md` → new `/comparisons/` folder
    - `notion-recurring-tasks-complexity.md` → `/comparisons/`
    - `case-studies/buildos-vs-monday-thought-organization.md` → `/comparisons/`
    - `case-studies/buildos-vs-chatgpt-context-that-compounds.md` → `/comparisons/`
    - `productivity-tips/context-engineering-101.md` → `/philosophy/`
10. **Grep out and edit** these voice-drift phrases globally: "executive assistant", "Every day you wait is context you don't have", "AI does:" lists, ❌/✅ emoji.

After this round, the catalog drops from 73 files to roughly 30, and every remaining file is either ready to ship or a known light-edit target.

### Next 2 weeks (the missing canonical posts)

Write the 5 catalog-defining posts that should already exist:

11. **"Voice In, Structure Out: A Real Brain Dump on a 7-Minute Walk."** Voice-first capture as a worked example. Probably the highest-leverage post the catalog can produce.
12. **"The Restart Tax: Why Re-Entering Your Project Is 40% of the Job."** The canonical "why your Monday morning is broken" post.
13. **"How to Compile Your Project Context into ChatGPT/Claude in One Click."** The context-compiler workflow as a how-to. Replaces the `/advanced-guides/` folder concept.
14. **"What BuildOS Isn't Built For."** The honest-tradeoffs post. Highest credibility-per-word in the entire catalog plan.
15. **"How I Run BuildOS on BuildOS."** First-person DJ Wayne post — the only honest case study available today, and the right wedge for the founder/creator audience.

### Next month (creator wedge)

Write 2-3 posts specifically for the author/YouTuber/dissertation-writer audience the 2026 strategy targets. The persona-style case studies in `/case-studies/` (academic, creative-pro, startup-founder, remote-team) should be retired in favor of these specific creator archetypes.

### Ongoing (don't ship case studies before you have real users)

Resist the temptation to fill `/case-studies/` with personas before BuildOS has 3-5 real users on the record. Until then, the only honest case study is DJ Wayne writing in first person.

---

## Per-File Audit Comments

Every file in `/apps/web/src/content/blogs/` now has an `<!-- AUDIT 2026-04-29 -->` comment block at the end with file-specific scoring, recommendation, issues, gaps, and notes. To find them:

```bash
grep -A20 "AUDIT 2026-04-29" apps/web/src/content/blogs/<file>.md
```

Or list everything flagged for KILL:

```bash
grep -B1 "RECOMMENDATION: KILL" apps/web/src/content/blogs/**/*.md
```

---

_Audited by 6 parallel auditor agents on 2026-04-29. Voice exemplars used as bar: `philosophy/anti-ai-assistant-execution-engine.md` and `buildos-vs-obsidian-knowledge-management.md`. Strategy reference: `/docs/marketing/strategy/buildos-marketing-strategy-2026.md`, `/docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md`, `/CLAUDE.md`._
