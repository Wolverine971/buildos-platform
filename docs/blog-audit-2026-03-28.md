<!-- docs/blog-audit-2026-03-28.md -->

# Blog Content Audit — 2026-03-28

## Summary

| Category          | Published | Drafts (w/ content) | Empty Stubs | Total  |
| ----------------- | --------- | ------------------- | ----------- | ------ |
| Root comparisons  | 4         | 3                   | 0           | 7      |
| Getting Started   | 7         | 0                   | 0           | 7      |
| Philosophy        | 4         | 0                   | 3           | 7      |
| Product Updates   | 0         | 0                   | 4           | 4      |
| Productivity Tips | 4         | 1                   | 3           | 8      |
| Case Studies      | 0         | 0                   | 4           | 4      |
| Advanced Guides   | 1         | 0                   | 4           | 5      |
| **Total**         | **20**    | **4**               | **18**      | **42** |

18 of 42 files (43%) are empty stubs with "Content coming soon..."

---

## Systemic Issues (Affect Multiple Posts)

- [ ] **"Build OS" vs "BuildOS" naming** — inconsistent across ~6 posts. Needs a single pass to standardize.
- [ ] **Internal dev notes still in published files** — `anti-ai-assistant-execution-engine.md` has a massive "Blog Development Notes" section (SEO keywords, competitor positioning, content gaps). `notion-recurring-tasks-complexity.md` and `buildos-vs-chatgpt-context-that-compounds.md` also have internal notes published.
- [ ] **CTA link chaos** — some posts link to `/auth/register`, others to `buildos.com/signup`, others to `buildos.dev`. Standardize to `/auth/register`.
- [ ] **"Chief of staff" metaphor** overused across 6+ posts. Pick one and cut the rest.
- [ ] **Fabricated statistics** — `buildos-vs-notion-adhd-minds.md` has invented numbers ("73% of productivity time," "18x more ideas," "15 hours/month"). Credibility risk.
- [ ] **Creator personas (authors, YouTubers) are absent** — 2026 strategy says these are the primary audience wedge, but zero blog posts feature them.
- [ ] **"Context compounds" / "context infrastructure"** is the closing message of nearly every post — strategy says this is moat language that belongs after interest, not as the front door.

---

## No Changes Needed

These posts are solid. Use as templates for future writing.

| Post                               | Path                                               | Why it works                                                                        |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| First Project Setup                | `getting-started/first-project-setup.md`           | Clear, practical, "just start talking." Zero jargon. Recently updated.              |
| Daily Brief Guide                  | `getting-started/daily-brief-guide.md`             | Shows real brief example. Practical. Relief-first. Recently updated.                |
| Compound Engineering for Your Life | `philosophy/compound-engineering-for-your-life.md` | External reference grounds the concept. Shows, doesn't tell. Best philosophy post.  |
| Context Engineering 101            | `productivity-tips/context-engineering-101.md`     | Cites real sources (Lutke, Karpathy, Gartner). Honest tradeoffs. Strong mid-funnel. |
| Troubleshooting Common Issues      | `advanced-guides/troubleshooting-common-issues.md` | Purely practical. Builds trust. No hype.                                            |

---

## Publish Immediately

- [ ] **Tech Project Managers Guide** (`productivity-tips/tech-project-managers-guide.md`) — Best piece in the entire blog. 5,000 words, deeply researched (Shape Up, Morgan Cohn, Fowler, Cagan). Barely mentions BuildOS until the end. Perfect anti-AI strategy execution. Add a publish date and flip `draft: false`.

---

## Quick Fixes (30 min each)

- [ ] **Anti-AI Assistant Execution Engine** (`philosophy/anti-ai-assistant-execution-engine.md`) — Remove the massive internal "Blog Development Notes" section still in the published file. Fix links from `buildos.dev` to relative.
- [ ] **BuildOS vs ChatGPT** (`buildos-vs-chatgpt-context-that-compounds.md`) — Remove embedded HTML review comments. Address Custom GPTs/Projects gap.
- [ ] **Notion Recurring Tasks** (`notion-recurring-tasks-complexity.md`) — Remove development notes section at bottom. Fix CTA to `/auth/register`.
- [ ] **Effective Brain Dumping** (`getting-started/effective-brain-dumping.md`) — Fix "Build OS" naming inconsistency. Update CTA.
- [ ] **Understanding Life Goals** (`getting-started/understanding-life-goals.md`) — Replace "ontology" with plain language.
- [ ] **Under the Hood** (`getting-started/under-the-hood.md`) — Add a note at top marking it as deep-dive content, not first-contact.
- [ ] **Evolution of Note-Taking** (`productivity-tips/evolution-of-note-taking.md`) — Verify $12/mo pricing. Replace "AI-native" language.
- [ ] **Task Management Best Practices** (`productivity-tips/task-management-best-practices.md`) — Fix "Build OS" naming. Consider adding creator-specific examples.
- [ ] **Future of Personal Knowledge Management** (`philosophy/future-of-personal-knowledge-management.md`) — Update author bio from "designed for ADHD minds" to "thinking environment" language. Check if Mem reference is stale.
- [ ] **Agentic vs Context Engineering** (`philosophy/agentic-vrs-context-engineering.md`) — Fix "Build OS" naming and `buildos.dev` links. Mark clearly as deep-dive content.

---

## Major Updates Needed

- [ ] **BuildOS vs Notion (ADHD)** (`buildos-vs-notion-adhd-minds.md`) — Fabricated statistics throughout ("73%," "18x," "15 hours/month"). ADHD-first framing conflicts with current "thinking environment" strategy. Remove fake stats, reframe with ADHD as supporting angle not headline. Fix "early access list" CTA.
- [ ] **Vision Deserves a Better OS** (`vision-deserves-better-operating-system.md`) — "Empire building" language is grandiose and conflicts with relief-first positioning. "Context mesh," "continuity layer," "context graph" front-loaded (strategy says hold back). Implies team features ("Collaborate with Memory") that may not exist. CTA links to `buildos.com/signup`. Tone down and align with current positioning.
- [ ] **BuildOS vs ChatGPT** (`buildos-vs-chatgpt-context-that-compounds.md`) — Never addresses Custom GPTs/Projects (huge credibility gap flagged in its own review comments). ChatGPT memory specs likely outdated. "Chief of staff" metaphor used 3x. Redundant "One More Thing" section.
- [ ] **How BuildOS Works** (`getting-started/how-buildos-works.md`) — "Context infrastructure for the AI era" is exactly what strategy says to hold back. "9 Ways to Chat" section is feature soup. Some links go to `buildos.dev`. Founder voice is strong — preserve that, cut the jargon.
- [ ] **Who is BuildOS For?** (`getting-started/who-is-buildos-for.md`) — Casts too wide a net (PhD students to wedding planners). Should lead with creators (authors, YouTubers) per 2026 strategy, then expand. Trim overly long lists.

---

## Needs Completion (Good Concept, Half-Written)

- [ ] **Talking/Listening Productivity Phases** (`talking-listening-productivity-phases.md`) — Strong original framework about talking (brain dumping) vs listening (feedback) phases. Currently filled with HTML comment placeholders and research questions. Worth completing — aligns well with "thinking environment" positioning.
- [ ] **BuildOS vs Obsidian** (`buildos-vs-obsidian-knowledge-management.md`) — Decent "Curator vs. Achiever" structure but title leads with "AI-Powered" (violates anti-AI strategy). HTML comment placeholders throughout. Reframe title and complete.
- [ ] **BuildOS vs Monday.com** (`buildos-vs-monday-thought-organization.md`) — Riddled with placeholders. Monday.com serves teams, BuildOS serves individuals — the positioning gap is so wide this post may not be worth completing. Consider killing.

---

## Empty Stubs — Triage

### Worth Writing (Align with Current Strategy)

- [ ] **Productivity vs Busy Work** (`philosophy/productivity-vs-busy-work.md`) — "Productivity theater" is a strategic enemy. Strong concept.
- [ ] **Creative Professional Case Study** (`case-studies/creative-professional-project-organization.md`) — Creator audience = primary wedge.
- [ ] **Startup Founder Case Study** (`case-studies/startup-founder-productivity-transformation.md`) — Founder persona aligns.
- [ ] **Calendar Integration Workflow** (`productivity-tips/calendar-integration-workflow.md`) — Practical utility content.

### Delete (Don't Align or Redundant)

- [ ] `case-studies/remote-team-coordination-success.md` — Implies team features that may not exist
- [ ] `advanced-guides/api-integration-workflows.md` — Too technical for current audience
- [ ] `advanced-guides/power-user-automation-techniques.md` — Optimization porn
- [ ] `philosophy/personal-operating-system-manifesto.md` — "Operating system" is explicitly flagged as language to avoid in strategy
- [ ] `product-updates/build-os-beta-launch.md` — Dated stub from Oct 2025, no longer relevant
- [ ] `product-updates/calendar-integration-announcement.md` — Dated stub from Oct 2025
- [ ] `product-updates/dynamic-context-feature.md` — Dated stub from Oct 2025
- [ ] `product-updates/phase-management-update.md` — Dated stub from Oct 2025
- [ ] `case-studies/academic-researcher-time-management.md` — Edge case persona, low priority
- [ ] `productivity-tips/focus-time-optimization.md` — Generic topic, no differentiator
- [ ] `productivity-tips/phase-based-project-execution.md` — Generic topic
- [ ] `advanced-guides/advanced-task-dependency-management.md` — Too niche
- [ ] `advanced-guides/custom-context-field-mastery.md` — Technical jargon in the title
- [ ] `philosophy/information-architecture-principles.md` — Academic, doesn't match positioning

### Note on Interview Variants

Most stubs have `-interview.md` companion files (interview guides). If you delete a stub, delete its interview variant too.

---

## New Content Gaps

These don't exist yet but are needed based on current strategy:

- [ ] **Creator-focused content** — Zero posts feature authors or YouTubers despite being the primary audience wedge
- [ ] **"Thinking environment" positioning piece** — No post directly introduces the core category
- [ ] **Real user testimonials** — Several posts use fabricated quotes. Need genuine social proof.
- [ ] **Show-don't-tell demo content** — Before/after brain dump transformations, brief examples, workflow walkthroughs (first-project-setup is the template)

---

## Individual Post Scorecards

### Root-Level Comparison Posts

| Post                      | Quality | Positioning | Update                                          |
| ------------------------- | ------- | ----------- | ----------------------------------------------- |
| BuildOS vs Notion (ADHD)  | 4/5     | 3/5         | Major — fake stats, ADHD-first framing          |
| BuildOS vs Monday.com     | 2/5     | 3/5         | Major — incomplete, may kill                    |
| BuildOS vs Obsidian       | 3/5     | 3/5         | Major — incomplete, AI-leading title            |
| BuildOS vs ChatGPT        | 4/5     | 3/5         | Major — Custom GPTs gap, stale specs            |
| Notion Recurring Tasks    | 4/5     | 4/5         | Minor — remove dev notes, fix CTA               |
| Vision Deserves Better OS | 4/5     | 3/5         | Major — grandiose language, false team features |
| Talking/Listening Phases  | 3/5     | 4/5         | Major — needs completion                        |

### Getting Started

| Post                     | Quality | Positioning | Update                                  |
| ------------------------ | ------- | ----------- | --------------------------------------- |
| Who is BuildOS For?      | 4/5     | 3/5         | Minor — resequence for creator audience |
| Effective Brain Dumping  | 4/5     | 4/5         | Minor — naming, CTA                     |
| How BuildOS Works        | 4/5     | 3/5         | Minor — cut jargon, keep founder voice  |
| First Project Setup      | 5/5     | 5/5         | None                                    |
| Daily Brief Guide        | 5/5     | 4/5         | None                                    |
| Under the Hood           | 4/5     | 2/5         | Minor — mark as deep-dive               |
| Understanding Life Goals | 4/5     | 3/5         | Minor — replace "ontology"              |

### Philosophy

| Post                               | Quality | Positioning | Update                                       |
| ---------------------------------- | ------- | ----------- | -------------------------------------------- |
| Anti-AI Execution Engine           | 4/5     | 3/5         | Quick fix — remove internal dev notes        |
| Agentic vs Context Engineering     | 4/5     | 2/5         | Minor — mark as deep-dive, fix links         |
| Compound Engineering for Your Life | 5/5     | 4/5         | None                                         |
| Future of PKM                      | 4/5     | 3/5         | Minor — update bio, check stale refs         |
| Information Architecture           | 1/5     | N/A         | Delete (empty stub)                          |
| Personal OS Manifesto              | 1/5     | N/A         | Delete (empty stub, title violates strategy) |
| Productivity vs Busy Work          | 1/5     | N/A         | Write (strong concept, aligns with strategy) |

### Productivity Tips

| Post                           | Quality | Positioning | Update                                  |
| ------------------------------ | ------- | ----------- | --------------------------------------- |
| Context Engineering 101        | 5/5     | 3/5         | None (position as mid-funnel)           |
| Task Management Best Practices | 4/5     | 4/5         | Minor — naming fix                      |
| Evolution of Note-Taking       | 4/5     | 3/5         | Minor — verify pricing, cut "AI-native" |
| Tech Project Managers Guide    | 5/5     | 4/5         | Publish immediately                     |
| Calendar Integration Workflow  | 1/5     | N/A         | Write (practical utility)               |
| Focus Time Optimization        | 1/5     | N/A         | Delete (generic stub)                   |
| Phase-Based Project Execution  | 1/5     | N/A         | Delete (generic stub)                   |

### Case Studies (All Stubs)

| Post                  | Quality | Recommendation                             |
| --------------------- | ------- | ------------------------------------------ |
| Creative Professional | 1/5     | Write (creator audience = primary wedge)   |
| Startup Founder       | 1/5     | Write (founder persona aligns)             |
| Academic Researcher   | 1/5     | Delete (edge case)                         |
| Remote Team           | 1/5     | Delete (implies nonexistent team features) |

### Advanced Guides

| Post                  | Quality | Recommendation             |
| --------------------- | ------- | -------------------------- |
| Troubleshooting       | 4/5     | None                       |
| Task Dependency Mgmt  | 1/5     | Delete (niche stub)        |
| API Integration       | 1/5     | Delete (too technical)     |
| Custom Context Fields | 1/5     | Delete (jargon stub)       |
| Power User Automation | 1/5     | Delete (optimization porn) |
