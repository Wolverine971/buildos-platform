---
name: Going Viral
description: >-
    Child skill under Content Strategy Beyond Blogging for making a specific piece of content travel on TikTok, Instagram, Twitter/X, or LinkedIn. Adds what the sibling hook/script/story/algorithm skills do not cover: verified 2025/2026 platform-specific algorithm intelligence (Mosseri's watch-time/likes-per-reach/DM-shares disclosure, LinkedIn's 360Brew model, X's Grok rerank and reply weights, TikTok completion thresholds, trial reels), the sharing-psychology layer (Berger's STEPPS, Eugene Wei's status games), and the seven tensions that keep virality work honest. Orchestrates the sibling skills per piece; refuses rage-bait and manufactured virality.
parent_id: content_strategy_beyond_blogging
depth: 1
preserve_markdown: true
legacy_paths:
    - going-viral
    - docs/research/youtube-library/skill-drafts/going-viral/SKILL.md
reference_modules:
    - id: going_viral.tiktok
      name: TikTok / Short-Form Vertical
      summary: 2025/2026 TikTok algorithm reality (completion ≥ ~70% for virality, native-beats-studio by 47%, tier testing 200 → 2M), one-second hook doctrine, visual → audio → visual sandwich, 60-second script compression, format winners and stale formats, retention mechanics, YouTube Shorts / Reels divergences.
      when_to_load:
          - When planning, drafting, or auditing a TikTok, YouTube Shorts, or other short-form vertical video.
          - When compressing a long-form idea into 15–60 seconds or picking the key visual.
      path: references/tiktok.md
    - id: going_viral.instagram
      name: Instagram
      summary: Mosseri's January 2025 ranking signals (watch time, likes-per-reach, DM shares), December 2025 raw-human-content shift, trial-reels two-cadence play, Reels-vs-carousel decision rule, carousel and Stories structure, Instagram-specific anti-patterns.
      when_to_load:
          - When planning, drafting, or auditing Instagram Reels, carousels, single images, or Stories.
      path: references/instagram.md
    - id: going_viral.twitter
      name: Twitter / X
      summary: 2025/2026 X physics (reply ≈ 150x a like, Grok rerank, ~10x premium reach gap, first 90–120 minutes, 30–50% link penalty), the five-unit content map, X-flavored hook patterns, Bloom thread system, Naval aphorism architecture, Welsh atomic posts, Levels build-in-public, the reply game.
      when_to_load:
          - When writing single tweets, threads, atomic essays, build-in-public updates, or quote-takes on X.
      path: references/twitter.md
    - id: going_viral.linkedin
      name: LinkedIn
      summary: 360Brew foundation-model ranking (dwell time, saves, meaningful comments over velocity), Hala Taha's four-step content gauntlet, golden 90 minutes, van der Blom signal weights and format data, Acosta SLAY framework, Welsh atomic structure, 9-slide carousel, LinkedIn-specific anti-patterns.
      when_to_load:
          - When writing or auditing LinkedIn posts, carousels, or a LinkedIn growth motion.
      path: references/linkedin.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/going_viral/SKILL.md
---

# Going Viral — How Ideas Travel

Per-piece integration layer over the content family. The public-facing name is _Going Viral_ because that's the search term humans use; the substance is _ideas that travel_ — distinctive points of view that earn attention without becoming algorithm-captured slop. The siblings hold the deep mechanics (hooks, scripts, story craft, algorithm strategy); this skill holds the seven tensions, the sharing-psychology layer, the cross-platform orchestration order, and the platform-specific 2025/2026 deep dives in its reference modules.

## When to Use

- Plan a single post, video, thread, carousel, or long-form essay before drafting.
- Diagnose why a post that "should have worked" flopped (or one that shouldn't have, hit).
- Translate a single idea across TikTok / Reels / X / LinkedIn natively (not by cross-posting).
- The request names a specific platform — "how do I go viral on [platform]" — and platform-specific algorithm behavior matters.
- Audit a draft for the seven tensions before shipping.
- Decide whether to chase a viral idea that doesn't fit the avatar (usually no).

Do not use this skill for: pure paid acquisition / performance ads; SEO blog content (use `content_strategy_beyond_blogging`); newsletter strategy (owned distribution, different physics); manufactured-virality or rage-bait playbooks (this skill explicitly refuses those). If a request is narrowly about hooks, story shape, script structure, or multi-month algorithm strategy, go straight to the sibling skill (escalation map in the Workflow).

## The Seven Tensions (the editorial spine)

The skill is interesting only if it holds these tensions, not if it picks a side:

1. **Manufactured virality vs. ideas that compound.** Devin Nash's manufactured-viral-content critique vs. Kallaway / Brendan Kane / Hormozi teaching the same hooks for different ends. Where is the line?
2. **Algorithm-native craft vs. timeless story structure.** Kallaway and Jenny Hoyos solve the algorithm with story (shock → intrigue → satisfy); Naval ignores it entirely with aphorism architecture and still goes viral. Both work.
3. **First three seconds vs. payoff vs. identity.** Hook bias is so strong now (Mosseri, TikTok creator portal, Kallaway) that the field over-rotates on hooks at the cost of payoff. MrBeast's retention obsession is the corrective.
4. **Volume / consistency vs. distinctive POV.** Sahil Bloom (225 threads), Brock Johnson (post daily) vs. Caleb Ulku ("don't just publish more blogs"). Reconcile.
5. **Platform-native format vs. cross-posting.** Mosseri penalizes TikTok watermarks; Justin Welsh atomizes one idea across LI/X/email. Both right at different scales.
6. **Founder voice vs. creator voice.** Pieter Levels' build-in-public reach (revenue tweets, scrappy demos) vs. Dan Koe's mid-form mastery vs. Kallaway's polished content factory. Different audiences, different moats.
7. **2025/2026 algorithmic reality vs. 2019-era playbooks.** X following-feed Grok rerank; LinkedIn's 360Brew foundation model; Mosseri's January 2025 ranking-signal disclosure (watch time / likes-per-reach / DM shares); TikTok's US-data retraining; Mosseri's December 2025 "raw, real human content" memo. Most "viral playbooks" online predate all of this.

When two principles conflict, name the tension and pick deliberately. Do not pretend it doesn't exist.

## Sharing Psychology

**Status games drive sharing.** Berger's STEPPS (Social Currency, Triggers, Emotion, Public, Practical Value, Stories) and Eugene Wei's "Status as a Service" both converge: people share what makes them look good or look correct. Practical Value + Social Currency is the cleanest combo for non-rage-bait creators. Every piece must answer: what status does the audience gain by sharing this?

## Workflow

1. **Diagnose intent.** Before any drafting, fill all four blanks — if you can't, the piece is not ready: the **avatar** (single named person, not a segment); the **base pain** in their language (one of the four horsemen: money, time, health, access — or BuildOS-specific: overwhelm, mental clutter, context loss, decision fatigue); the **status** the audience gains by sharing this (Berger: "the better something makes us look, the more likely we are to share it"); the **action** the post should drive (read more, save, share, reply, click, buy — never all of them).
2. **Pick the platform and topic discipline.** The strategic layer (hero platform, six-month focus window, topic / avatar narrowing, content game) belongs to `algorithm_aware_publishing` — defer to it for those decisions. Once the platform is known, load the matching reference module here: `going_viral.tiktok`, `going_viral.instagram`, `going_viral.twitter`, or `going_viral.linkedin`.
3. **Craft the hook.** Defer line-level hook work to `hook_craft_short_form` (six archetypes, slot grammar, four-mistake diagnostic). The loaded platform reference holds the platform-flavored archetype mappings and hook thresholds (one-second test, first-line-as-thumbnail, T1 rules).
4. **Structure the piece.** Defer script and post structure to `viral_video_script_structure` (packaging → outline → intro → body → outro, 2-1-3-4, value loops, rehooks, native CTAs). The platform reference holds the format-specific compression (60-second skeleton, 9-slide carousel, atomic essay).
5. **Run story-craft QA.** Defer the structural rewrite passes (dance, rhythm, tone, direction, lens, hook; dopamine ladder) to `story_driven_content_craft`.
6. **Run the pre-publish gates.** Defer the six-checkpoint viewer-psychology gate, the Keep / Modify / Reject tactics filter, and the dual audit (algorithm-clean AND BuildOS-thesis-coherent) to `algorithm_aware_publishing`.
7. **Audit against the seven tensions.** Walk all seven; for each that bites, name it in the output and record the deliberate pick.
8. **Distribute and read the data.** Defer post-publish diagnostics (sample-200 test, tier scaling, the three engagement signals, wrong-layer tweaks to avoid) to `algorithm_aware_publishing`. The platform reference holds platform-specific timing and signal weights.
9. **Assemble the planning packet** using the Output contract below, including the next two pieces in the same series so this isn't a one-off.

## Output

When using this skill to plan a piece of content, return:

- avatar (named, single person)
- base pain (in their language)
- status / share-payoff
- desired action
- platform (and why this one)
- topic-discipline keywords (3–5 in / 3 out)
- hook archetype + key visual
- script outline (packaging → outline → intro → body → outro)
- six-pass storytelling check results
- six-checkpoint viewer-psychology gate results
- BuildOS filter pass results (which tactics applied, modified, rejected)
- seven-tensions audit (which tensions bit, and the deliberate pick for each)
- next two pieces in the same series (so this isn't a one-off)

For flop diagnoses, replace the packet with: which step of the workflow failed first, the platform-specific signal evidence (from the loaded reference), and the single upstream fix.

## Guardrails

- Do not produce platform-specific guidance (signals, formats, hook thresholds, anti-patterns) without loading the matching platform reference module first.
- Refuse manufactured contrarianism, rage-bait, fear, and drama as engagement levers in BuildOS-tagged work; flag them explicitly in any other work.
- Refuse off-avatar viral ideas: a 10M-view hit outside the avatar is worse than a 200K-view hit inside it — the broad hit corrupts the next posts' targeting.
- Do not pretend conflicting principles agree — name the tension and pick deliberately.
- Do not re-teach sibling material: hooks → `hook_craft_short_form`; script structure → `viral_video_script_structure`; story craft → `story_driven_content_craft`; algorithm strategy, psychology gate, and Keep/Modify/Reject filter → `algorithm_aware_publishing`.
- Do not recommend caption / hashtag / posting-time tweaking as a fix — wrong layer of the stack.
- Do not ship a hook whose body cannot pay it off, and never force cross-platform CTAs ("watch the full version on YouTube").
- Treat 2019-era playbook advice as unverified: every platform claim must trace to the 2025/2026 signals in the reference modules or be flagged as stale.

## Notes

- Reference modules: `going_viral.tiktok`, `going_viral.instagram`, `going_viral.twitter`, `going_viral.linkedin` — one per platform, each with verified 2025/2026 algorithm reality, hook mappings, format winners, and anti-patterns.
- Primary sources: Kane Kallaway (hooks, scripts, storytelling, algorithms — consumed via the sibling skills), Devin Nash (manufactured-virality counterweight), Jonah Berger (STEPPS), Eugene Wei (Status as a Service), plus platform-native voices per reference (Jenny Hoyos, Brendan Kane, MrBeast; Brock Johnson, Adam Mosseri, Lara Acosta; Sahil Bloom, Naval Ravikant, Justin Welsh, Pieter Levels; Hala Taha, Richard van der Blom).
- Maintainers: the canonical research draft with full lineage and pending-transcript TODOs lives at `docs/research/youtube-library/skill-drafts/going-viral/` (not available at runtime).
