---
skill_id: content-strategy-beyond-blogging
name: Content Strategy Beyond Blogging
catalog_line: 'Plan content strategy around intent, identity, distribution, and durable point of view.'
description: Build content strategy around intent, identity, distribution, and durable point of view instead of generic blog volume. Use when planning content for SaaS, creators, local services, founder-led brands, or agent-assisted publishing systems.
skill_type: strategy
altitude: domain
activation: progressive
categories:
    - marketing-and-content
preserve_markdown: true
dependencies:
    - id: hook_craft_short_form
      owns: Line-level hook and opening craft — the opening, first 1-5 seconds, lede, or first line.
    - id: viral_video_script_structure
      owns: Script and post structure — packaging, outline, intro, body, outro, value loops, rehooks.
    - id: story_driven_content_craft
      owns: Structuring non-fiction as curiosity loops — rhythm, tone, visual hooks, story-craft diagnostics.
    - id: algorithm_aware_publishing
      owns: Publishing decisions on interest-media platforms — platforms, topics, cadence, algorithm fit, brand-safe distribution; game-specific publishing tactics (Pillar 0).
legacy_paths:
    - content-strategy-beyond-blogging
    - marketing-and-content.content-strategy-beyond-blogging.skill
    - docs/research/youtube-library/skill-drafts/content-strategy-beyond-blogging/SKILL.md
child_skills:
    - id: hook_craft_short_form
      name: Hook Craft For Short-Form
      summary: Draft, audit, and rewrite hooks for short-form video, blog leads, social posts, demo openers, and pitch openings.
      when_to_load:
          - When the opening, first 1-5 seconds, lede, or first line is the bottleneck.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/hook_craft_short_form/SKILL.md
    - id: viral_video_script_structure
      name: Viral Video Script Structure
      summary: Write or audit short-form and long-form video scripts using packaging, outline, intro, body, outro, value loops, and rehooks.
      when_to_load:
          - When the body, retention path, script order, or end-to-end video structure is the bottleneck.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/viral_video_script_structure/SKILL.md
    - id: story_driven_content_craft
      name: Story-Driven Content Craft
      summary: Structure non-fiction content as curiosity loops with rhythm, tone, visual hooks, and story-craft diagnostics.
      when_to_load:
          - When a draft has a thesis but feels flat, confusing, slow, or structurally weak.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/story_driven_content_craft/SKILL.md
    - id: algorithm_aware_publishing
      name: Algorithm-Aware Publishing
      summary: Plan and audit publishing decisions on interest-media platforms without becoming captured by feed mechanics.
      when_to_load:
          - When choosing platforms, topics, publishing cadence, algorithm fit, or brand-safe distribution tactics.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/algorithm_aware_publishing/SKILL.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/content_strategy_beyond_blogging/SKILL.md
---

# Content Strategy Beyond Blogging

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: strategy, so Judgment carries the weight (Core Principles, Format Decisions,
  Opening Rules — the decision spine). Procedure is the ordered Strategy Workflow. Routing declares the
  family / child-skill ownership map, referenced by the `→` marker in the workflow. No Knowledge block: the
  declarative material here is decision criteria, not lookup grounding.
-->

## Identity

Use this skill to help an agent choose the right content system for the job. The agent should not default to "publish more blogs." It should match content type to intent, build a memorable position, and design distribution around how people and algorithms actually discover work.

This is a **strategy** skill at **domain** altitude: its substance is decision heuristics — which content system, format, and positioning fit the job — not a fixed runbook. It is also the **family parent** of the content-craft skills, and routes to them for line-level mechanics; that routing role is secondary to its decision spine and is declared in **Routing**.

<!-- Secondary type: orchestration (family parent / child-skill router). Dominant type is strategy per §2.2 — the body is decision heuristics, not delegation. -->

## Activation

- Plan a content strategy for a product, creator, local service, or founder-led brand
- Decide whether a topic should become a blog, service page, short video, social post, long-form essay, quiz, or guide
- Diagnose high-traffic content that does not convert
- Turn a creator or founder's story into a sharper content identity
- Build a content distribution plan from existing source material
- Repurpose transcripts into posts, clips, articles, or skills

Do not use this skill when the user only needs a single article draft with no strategy decision.

## Judgment

The decision spine. When the workflow branches, this is what you reason with.

### Core Principles

1. **Intent decides format.** Do not publish an informational blog when search results show buyers want a service page, map result, product page, or assessment.
2. **Goal completion beats dwell time.** The first paragraph or first seconds should answer the searcher's immediate need.
3. **Identity compounds.** Viewers and readers return for a point of view, not interchangeable lessons.
4. **Word of mouth needs a sentence.** If a fan cannot describe the project simply, the strategy is too vague.
5. **Volume buys data, not identity.** Repetition can surface patterns, but positioning gives the work memory.
6. **Distribution can be manufactured.** Treat reach metrics skeptically and build durable channels that do not depend entirely on algorithmic feeds.
7. **Coherent breadth at the publication level, narrow discipline at the post level.** A solo creator burns out narrow-niching at the publication level over 5+ years; broad-but-coherent positioning (e.g., "product, growth, career, startups" as one cluster, or "thinking environment for people building complex things" as one stance) is more durable. But every individual post stays narrow — single idea, single avatar — for algorithmic legibility. Both rules at once. Confusing them produces either burnout (over-narrow at the publication) or unfocused posts (over-broad at the unit).

### Format Decisions

- Local commercial intent: service hub pages, not generic blogs.
- Early SaaS validation: organic short-form or community posts before slow SEO.
- Deep trust: long-form video, essay, case study, or documented work.
- Lead qualification: assessment or scorecard.
- Product education: guide, tutorial, demo, or comparison page.
- Founder/creator moat: point-of-view content with personal relationship to the topic.
- **Solo-operator cadence:** atomic posts — single-idea, repeated formats, one variable per post. Justin Welsh's $5M Saturday Solopreneur newsletter and 800K-follower LinkedIn flywheel run on this pattern: same daily structure, three workdays per week, 30-min daily engagement. The format pattern _is_ the brand cue.
- Repurposing: extract clips and posts only after the core idea is clear.

### Opening Rules

- Lead with the universal version of the story.
- Delay niche filters until the audience cares.
- Answer the visitor's immediate question quickly.
- Avoid company history, generic definitions, and "committed to excellence" openings.
- Do not lead with every storyline at once.

## Procedure

Ordered sequence and intent only. Ownership of any routed layer is declared in **Routing**, referenced by the `→` marker — steps without a marker are owned here.

0. **Pick the content game first.** Five games run on social media simultaneously: Mainstream Fame (#1), Category Fame (#2), Intuitive Products (#3), Explanatory Products (#4), Authority Building (#5). Games #1 and #2 monetize via the media layer (you are the product); games #3, #4, #5 monetize off-platform via the offering layer. Pure virality is correct for #1 and #2; for #3, #4, #5 it actively poisons the next several pieces. Tag every channel — and ideally every piece — with its game before the rest of this workflow runs. For game-specific publishing tactics, defer to `algorithm-aware-publishing` (Pillar 0). → `algorithm_aware_publishing`
1. **Name the audience identity.** Who is this for, and what do they believe about themselves?
2. **Name the desired emotion.** What should the audience feel after consuming it: relief, urgency, capability, trust, ambition, recognition, anger, hope?
3. **Name the action.** What should they do next: call, subscribe, try, buy, share, save, reply, take a quiz, or change behavior?
4. **Match format to intent — then run the CCN sanity check.** Inspect the query or feed context; choose the format the audience and platform are already rewarding. Then ask: would this idea work for **C**ore viewers (already in the niche), **C**asual viewers (adjacent interest), and **N**ew viewers (no context) simultaneously? If only Core, the upside is capped at the existing audience size. If all three pass, the piece can break out of the niche. Most "Core-only" ideas should be repackaged before publishing — same insight, framed for a Casual viewer.
5. **Choose one storyline.** Do not dump every value proposition into the opening. Lead with the most universal story, then layer specificity.
6. **Build the link or distribution graph.** For websites, connect hubs, subpages, and detail pages. For social, connect recurring formats, series, and call-backs.
7. **Create a memorable phrase.** Write the one-sentence explanation a fan would say to a friend.
8. **Ship, measure, and classify.** Track which identity, emotion, action, hook, and format each piece used. Improve the system, not just one asset.

## Routing

Ownership map for the content family. This skill owns the strategy layer; the child skills own the line-level mechanics. One concept, one owner — everyone else routes here.

| Concern                                                                        | Owner                          | This skill retains                               |
| ------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------ |
| Content strategy: intent, identity, emotion, action, distribution, positioning | **this skill**                 | full ownership                                   |
| Hook / opening line craft                                                      | `hook_craft_short_form`        | strategic opening angle only                     |
| Script / post structure                                                        | `viral_video_script_structure` | nothing — pure defer                             |
| Story craft & structural diagnostics                                           | `story_driven_content_craft`   | nothing — pure defer                             |
| Platform / topic / cadence / game-specific publishing tactics (Pillar 0)       | `algorithm_aware_publishing`   | game and format classification at strategy level |

## Contract

Return:

- audience identity
- desired emotion
- desired action
- format recommendation
- opening angle
- content hierarchy or series plan
- distribution path
- one-sentence word-of-mouth phrase
- measurement plan
- next three assets to create

## Policy

- Do not confuse traffic with qualified demand.
- Do not write blogs for local service intent unless search results prove blogs win.
- Do not chase short-form ubiquity without a durable point of view.
- Do not manufacture vulnerability; structure honest personal stakes where they matter.
- Do not let AI produce a pile of assets before the strategy has identity, emotion, and action.
- Do not judge creator or brand health by view count alone.

## Provenance

Distilled from a stack of complementary creator-economy and publishing voices:

- Caleb Ulku, [Blogging is Dead, Do This Instead](https://www.youtube.com/watch?v=EIFXxiunKoE) — intent-decides-format, the Core 30 service-hub structure, goal-completion-beats-dwell-time.
- Creator Support / Colin & Samir, [He Posted 1,200 Videos in 2 Years and Missed the Whole Point](https://www.youtube.com/watch?v=EO5aIpt1t3Y) — Identity × Emotion × Action, word-of-mouth tagline, decentralized-sitcom thinking.
- Your Average Tech Bro, [Ultimate Social Media Marketing Guide for SaaS](https://www.youtube.com/watch?v=fBTs-RID8Bg) — algorithm warmup, hook-plus-demo, brand-vs-founder-account decisions.
- Devin Nash, [Exposing the New Manufactured Viral Content Economy](https://www.youtube.com/watch?v=-5lqJF5BTvo) — interest-media reframe, distribution-can-be-manufactured guardrail.
- Oren John, [The Art of Yapping](https://www.youtube.com/watch?v=CS0A4hJfcy4) — talk-to-camera scripting and short-form video craft.
- **Paddy Galloway** ([Creator Science Podcast](https://podcast.creatorscience.com/paddy-galloway-2/)) — the **CCN sanity check** in step 4 (Core / Casual / New audience-fit filter); the non-linear-returns-of-packaging insight; the principle that strategy doesn't apply equally at every channel-stage. Local analysis: `docs/marketing/growth/research/youtube-transcripts/2026-04-29-paddy-galloway-youtube-packaging-ANALYSIS.md`.
- **Justin Welsh** ([Better Humans Podcast / Pathless Path](https://www.youtube.com/watch?v=kXAQfx8usl8)) — the **atomic-post Format Decision**; LinkedIn → newsletter → product flywheel; three-day workweek as a content-cadence constraint. Local analysis: `docs/marketing/growth/research/youtube-transcripts/2026-04-29-justin-welsh-solopreneur-playbook-ANALYSIS.md`.
- **Lenny Rachitsky** ([1M+ Newsletter](https://www.youtube.com/watch?v=JFX869KrDGM)) — the **broad-but-coherent positioning at the publication level** (Core Principle #7), reconciled with narrow discipline at the post level. 8 of his top 10 posts are guest contributions, refined through 5–6 editor-led drafts. Local analysis: `docs/marketing/growth/research/youtube-transcripts/2026-04-29-lenny-rachitsky-1m-newsletter-ANALYSIS.md`.
