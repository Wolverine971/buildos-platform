<!-- docs/reports/blog-priority-audit-2026-03-30.md -->

# Blog Priority Audit - 2026-03-30

## Scope

This audit reviews the current BuildOS blog inventory in `apps/web/src/content/blogs`, verifies high-risk comparison claims against current official sources as of **March 30, 2026**, and prioritizes what should be updated, completed, or left alone.

## What Changed Since the 2026-03-28 Audit

- `tech-project-managers-guide.md` is already published and should not be in the "publish immediately" bucket anymore.
- `buildos-vs-chatgpt-context-that-compounds.md` now covers ChatGPT Projects, so the earlier "missing Projects" warning is outdated.
- `anti-ai-assistant-execution-engine.md` no longer has the obvious internal dev-notes problem.
- `buildos-vs-monday-thought-organization.md` is now live, which raises the urgency because its pricing claims are public and time-sensitive.

## Highest Priority: Live Posts With Accuracy Risk

### 1. `notion-recurring-tasks-complexity.md`

Path: `apps/web/src/content/blogs/notion-recurring-tasks-complexity.md`

Why this is first:

- The post's core thesis is now partially outdated.
- It says Notion still cannot really automate recurring tasks, but current Notion documentation includes database automations and recurring-template behavior.
- This is a live comparison post, so stale claims create credibility damage faster than stale positioning language.

What needs to change:

- Reframe the comparison away from "Notion cannot do this" toward "Notion can do this, but the workflow is still heavier and more system-design-oriented than BuildOS."
- Update the Thomas Frank angle so it does not overstate the current limitation.
- Keep the simplicity argument, but make it honest against current Notion capabilities.
- Re-check every sentence that implies impossible/not supported/not automatable.

Things to explore:

- What is the strongest current comparison angle: setup friction, maintainability, natural-language input, or cross-project context?
- Does BuildOS actually support every recurrence example used in the article as written?
- Should this remain a Thomas Frank-led hook, or should it become a broader "why recurring tasks still feel like system administration" piece?

Current verification notes:

- Notion database automations: [Notion Help](https://www.notion.com/en-gb/help/database-automations?nxtPslug=database-automations)
- Notion AI / current workspace-wide AI positioning: [Notion AI Help](https://www.notion.com/help/category/notion-ai)

### 2. `buildos-vs-monday-thought-organization.md`

Path: `apps/web/src/content/blogs/case-studies/buildos-vs-monday-thought-organization.md`

Why this is second:

- It is live and contains time-sensitive pricing claims about both Monday.com and BuildOS.
- It currently says BuildOS has a free tier with 5 projects, which conflicts with the current pricing page.
- Monday.com pricing and packaging changed from the assumptions in the post.

What needs to change:

- Update Monday.com pricing and seat language.
- Remove or replace the "BuildOS has a free tier - 5 projects" line.
- Align all BuildOS pricing/trial claims with the current pricing page.
- Re-check whether "no direct integration yet" and CSV export wording still match product reality.

Things to explore:

- Should this post become less price-led and more "team execution vs solo thinking" led?
- Is Monday.com still the right competitor for the current creator-first positioning?
- Would a creator-focused comparison perform better than this one in the near term?

Current verification notes:

- Monday pricing page: [monday.com pricing](https://monday.com/pricing)
- Monday seat rules and bucket pricing: [monday.com support](https://support.monday.com/hc/en-us/articles/4405633151634-Plans-and-pricing-for-monday-com)
- Current BuildOS pricing page: `apps/web/src/routes/pricing/+page.svelte`

### 3. `buildos-vs-chatgpt-context-that-compounds.md`

Path: `apps/web/src/content/blogs/case-studies/buildos-vs-chatgpt-context-that-compounds.md`

Why this is third:

- It is directionally strong, but some specifics are outdated because ChatGPT Projects and Memory have expanded.
- The post still understates what Projects now do and likely overstates the narrowness of memory.
- Comparison content goes stale quickly, so even a recent update can age fast.

What needs to change:

- Rewrite the memory section so it reflects current OpenAI wording around saved memories, chat history, and project memory.
- Keep the core BuildOS argument focused on relational structure, execution, and durable project state.
- Remove or soften claims that imply ChatGPT Projects are just lightweight folders.
- Add a clearer "use both" framing that feels current, not defensive.

Things to explore:

- Is the strongest BuildOS edge here "structured execution" or "work graph + context persistence"?
- Should the post acknowledge shared projects and app links directly to avoid sounding behind?
- Would a title shift help, since "more than memory" is still true but now incomplete?

Current verification notes:

- ChatGPT Projects: [OpenAI Help - Projects in ChatGPT](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt)
- ChatGPT Memory: [OpenAI Help - What is Memory?](https://help.openai.com/en/articles/8983136-what-is-memory%23.gz)

### 4. `buildos-vs-notion-adhd-minds.md`

Path: `apps/web/src/content/blogs/case-studies/buildos-vs-notion-adhd-minds.md`

Why this is fourth:

- It is still one of the stronger long-form comparison posts, but its framing is no longer well aligned with the current homepage and creator-first positioning.
- It makes broad claims about Notion AI being page-level and about ADHD behavior that need tightening.
- The testimonials and numbers are persuasive, but many of them read like marketing copy rather than grounded evidence.

What needs to change:

- Reduce ADHD-first positioning from headline/primary frame to a supporting angle unless the strategy explicitly returns there.
- Rework the Notion AI section so it reflects current workspace-wide AI positioning.
- Replace or qualify testimonial-style quotes that read invented or too polished.
- Bring the examples closer to creators, authors, YouTubers, and builders.

Things to explore:

- Is there a better title that still captures search demand without narrowing the audience too aggressively?
- Should this be split into two pieces: Notion comparison + separate ADHD-friendly positioning piece?
- Which claims need source support vs. founder/opinion framing?

Current verification notes:

- Homepage positioning now leads with creators/builders: `apps/web/src/routes/+page.svelte`
- Notion AI current positioning: [Notion AI Help](https://www.notion.com/help/category/notion-ai)

### 5. `evolution-of-note-taking.md`

Path: `apps/web/src/content/blogs/productivity-tips/evolution-of-note-taking.md`

Why this is fifth:

- It is not structurally broken, but it contains stale BuildOS pricing.
- It also carries older category language like "AI-powered organization" and heavier ontology wording that now feels less landing-page aligned.
- This is a relatively easy cleanup with good ROI.

What needs to change:

- Update BuildOS pricing from `$12/mo` to the current `$20/month` with `14-day free trial`.
- Re-scan for category language that feels older than the current "thinking environment / organized plans / creator productivity" positioning.
- Refresh tool descriptions where needed so Notion/AI sections do not feel frozen in early 2025.

Things to explore:

- Does this piece want a stronger creator-centered ending?
- Should the GTD / Zettelkasten / Obsidian / Notion table be simplified to reduce generic "productivity history" energy?
- Is "From Paper to AI-Powered Organization" still the best title?

Current verification notes:

- Current BuildOS pricing page: `apps/web/src/routes/pricing/+page.svelte`

## Strong Next Drafts To Finish

### `talking-listening-productivity-phases.md`

- Best near-finished unpublished piece.
- Strong original idea.
- Fits the current voice and creator/thinker positioning better than many older comparison posts.
- Recommended action: finish for publish, add CTA, and tighten the ending.

### `creative-professional-project-organization.md`

- Best new case study target because it matches the homepage's creator wedge.
- Existing interview guide is strong and reusable.
- Recommended action: write this before lower-value comparison cleanup once the urgent accuracy fixes are done.

### `startup-founder-productivity-transformation.md`

- Still worth writing, especially if founder audience remains core.
- Lower immediate leverage than the creative case study because the homepage is now more explicitly creator-led.

### `buildos-vs-obsidian-knowledge-management.md`

- Worth salvaging eventually.
- Not urgent because it is still a draft, but it needs a real completion pass, not small edits.
- Main issue is embedded placeholders and unfinished research prompts.

## Lower Priority Positioning Cleanup

### `vision-deserves-better-operating-system.md`

- Not the most factually risky post, but it feels the most off-strategy.
- Heavy "empire", "operating system", and abstract infrastructure language.
- Implies more collaborative/shared-memory behavior than the current external positioning should probably promise.

### `who-is-buildos-for.md`

- Broad and energetic, but too wide for current focus.
- Homepage now has a much sharper creator/builder voice than this post.

### `how-buildos-works.md`

- Still useful, but should eventually be simplified to better match current landing language.
- Main issue is feature density and older framing, not urgent factual error.

## Posts To Leave Alone For Now

- `getting-started/first-project-setup.md`
- `getting-started/daily-brief-guide.md`
- `philosophy/anti-ai-assistant-execution-engine.md`
- `advanced-guides/troubleshooting-common-issues.md`
- `productivity-tips/tech-project-managers-guide.md`

These are good enough to stay live while higher-risk posts get attention.

## Stubs Not Worth Prioritizing Right Now

- Product update stubs from October 2025
- Remote-team case study
- Academic-researcher case study
- Most niche advanced-guide stubs
- Personal operating system manifesto stub

## Recommended Order Of Work

1. Rewrite `notion-recurring-tasks-complexity.md`
2. Fix factual/pricing issues in `buildos-vs-monday-thought-organization.md`
3. Refresh `buildos-vs-chatgpt-context-that-compounds.md`
4. Reframe `buildos-vs-notion-adhd-minds.md`
5. Clean up `evolution-of-note-taking.md`
6. Finish and publish `talking-listening-productivity-phases.md`
7. Write `creative-professional-project-organization.md`
8. Write `startup-founder-productivity-transformation.md`
