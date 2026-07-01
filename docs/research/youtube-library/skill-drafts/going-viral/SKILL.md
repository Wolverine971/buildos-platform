---
name: Going Viral
description: >-
    Child skill under Content Strategy Beyond Blogging. Orchestration layer that plans, drafts, or audits a single
    piece of content per platform (TikTok, Instagram, Twitter/X, LinkedIn) by composing the sibling hook, script,
    story, and algorithm skills — and adds what no sibling owns: the seven editorial tensions that keep virality
    work honest, the sharing-psychology layer (Berger STEPPS, Eugene Wei status games), and per-platform 2025/2026
    algorithm intelligence held in reference modules. Use when planning/auditing one post, diagnosing a flop, or
    translating one idea natively across platforms. Refuses rage-bait, manufactured virality, and off-avatar hits.
skill_type: orchestration # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: content_strategy_beyond_blogging
depth: 1
preserve_markdown: true
dependencies:
    - id: algorithm_aware_publishing
      owns: >-
          Strategic layer (hero platform, six-month focus window, topic/avatar narrowing, content game);
          six-checkpoint viewer-psychology gate; Keep/Modify/Reject tactics filter; post-publish diagnostics
          (sample-200 test, tier scaling, three engagement signals, wrong-layer tweaks to avoid).
    - id: hook_craft_short_form
      owns: Line-level hook craft — six archetypes, slot grammar, four-mistake diagnostic.
    - id: viral_video_script_structure
      owns: >-
          Script and post structure — packaging → outline → intro → body → outro, 2-1-3-4 ordering,
          value loops, rehooks, native CTAs.
    - id: story_driven_content_craft
      owns: Structural rewrite passes — dance, rhythm, tone, direction, lens, hook; the dopamine ladder.
legacy_paths:
    - going-viral
    - docs/research/youtube-library/skill-drafts/going-viral/SKILL.md
reference_modules:
    - id: going_viral.tiktok
      name: TikTok / Short-Form Vertical
      summary: >-
          2025/2026 TikTok algorithm reality (completion ≥ ~70% for virality, native-beats-studio by 47%,
          tier testing 200 → 2M), one-second hook doctrine, visual → audio → visual sandwich, 60-second
          script compression, format winners and stale formats, retention mechanics, YouTube Shorts / Reels divergences.
      when_to_load:
          - When planning, drafting, or auditing a TikTok, YouTube Shorts, or other short-form vertical video.
          - When compressing a long-form idea into 15–60 seconds or picking the key visual.
      path: references/tiktok.md
    - id: going_viral.instagram
      name: Instagram
      summary: >-
          Mosseri PRIMARY interaction-rate-over-views currency, audition/graduation reach loop, trial-reels two-cadence
          play, Reels-vs-carousel decision rule, carousel and Stories structure, Instagram-specific anti-patterns.
          Fully provenance-tagged (PRIMARY / practitioner / internal-default) with an explicit REMOVED/CORRECTED audit trail.
      when_to_load:
          - When planning, drafting, or auditing Instagram Reels, carousels, single images, or Stories.
      path: references/instagram.md
    - id: going_viral.twitter
      name: Twitter / X
      summary: >-
          2025/2026 X physics (reply ≈ 150x a like, Grok rerank, ~10x premium reach gap, first 90–120 minutes,
          30–50% link penalty), the five-unit content map, X-flavored hook patterns, Bloom thread system, Naval
          aphorism architecture, Welsh atomic posts, Levels build-in-public, the reply game.
      when_to_load:
          - When writing single tweets, threads, atomic essays, build-in-public updates, or quote-takes on X.
      path: references/twitter.md
    - id: going_viral.linkedin
      name: LinkedIn
      summary: >-
          360Brew foundation-model ranking (dwell time, saves, meaningful comments over velocity), Hala Taha's
          four-step content gauntlet, golden 90 minutes, van der Blom signal weights and format data, Acosta SLAY
          framework, Welsh atomic structure, 9-slide carousel, LinkedIn-specific anti-patterns.
      when_to_load:
          - When writing or auditing LinkedIn posts, carousels, or a LinkedIn growth motion.
      path: references/linkedin.md
path: docs/research/youtube-library/skill-drafts/going-viral/SKILL.md
---

# Going Viral — How Ideas Travel

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: orchestration, so Judgment + Procedure + Routing carry the weight; Knowledge is
  deliberately thin (volatile platform facts live in the reference modules, each self-provenanced).
-->

## Identity

Per-piece integration layer over the content family. The public name is _Going Viral_ because that's the term
humans search; the substance is _ideas that travel_ — distinctive points of view that earn attention without
becoming algorithm-captured slop.

This is an **orchestration** skill at **domain** altitude. Its own knowledge is intentionally small: the siblings
hold the deep mechanics (hooks, scripts, story craft, algorithm strategy) and the reference modules hold the
volatile per-platform facts. What lives _only_ here, owned nowhere else, is three things: the **seven tensions**
(the editorial spine), the **sharing-psychology layer**, and the **cross-platform orchestration order** that
sequences every sibling per piece.

## Activation

**Use this skill to:**

- Plan a single post, video, thread, carousel, or long-form essay before drafting.
- Diagnose why a post that "should have worked" flopped (or one that shouldn't have, hit).
- Translate one idea across TikTok / Reels / X / LinkedIn natively (not by cross-posting).
- Answer a platform-named request ("how do I go viral on [platform]") where platform algorithm behavior matters.
- Audit a draft against the seven tensions before shipping.
- Decide whether to chase a viral idea that doesn't fit the avatar (usually: no).

**Do not use this skill for:** pure paid acquisition / performance ads; SEO blog content (→ `content_strategy_beyond_blogging`);
newsletter strategy (owned distribution, different physics); manufactured-virality or rage-bait playbooks (this skill
refuses those).

**Escalate straight to a sibling** when the request is narrowly about one layer — hooks → `hook_craft_short_form`;
story shape → `story_driven_content_craft`; script structure → `viral_video_script_structure`; multi-month algorithm
strategy → `algorithm_aware_publishing`. Full ownership map in **Routing**.

**Load a reference module** as soon as the platform is known: `going_viral.tiktok`, `going_viral.instagram`,
`going_viral.twitter`, or `going_viral.linkedin`. Do not emit platform-specific guidance (signals, formats, hook
thresholds, anti-patterns) without loading the matching module first — see **Policy**.

## Judgment

The decision spine. When the procedure branches, this is what you reason with.

### The seven tensions (the editorial spine)

The skill is interesting only if it _holds_ these tensions rather than picking a side. When two principles conflict,
name the tension in the output and pick deliberately. Never pretend the conflict doesn't exist.

1. **Manufactured virality vs. ideas that compound.** Devin Nash's manufactured-content critique vs. Kallaway /
   Kane / Hormozi teaching the same hooks for different ends. Where is the line?
2. **Algorithm-native craft vs. timeless story structure.** Kallaway and Jenny Hoyos beat the algorithm _with_ story
   (shock → intrigue → satisfy); Naval ignores it entirely with aphorism architecture and still travels. Both work.
3. **First three seconds vs. payoff vs. identity.** Hook bias is so strong now the field over-rotates on hooks at the
   cost of payoff. MrBeast's retention obsession is the corrective.
4. **Volume / consistency vs. distinctive POV.** Sahil Bloom (225 threads), Brock Johnson (post daily) vs. Caleb Ulku
   ("don't just publish more"). Reconcile per piece.
5. **Platform-native format vs. cross-posting.** Mosseri penalizes recycled/watermarked content; Justin Welsh atomizes
   one idea across LI/X/email. Both right at different scales.
6. **Founder voice vs. creator voice.** Pieter Levels' build-in-public reach vs. Dan Koe's mid-form mastery vs.
   Kallaway's polished content factory. Different audiences, different moats.
7. **2025/2026 algorithmic reality vs. 2019-era playbooks.** X Grok rerank; LinkedIn 360Brew; Mosseri's interaction-rate
   disclosures; TikTok US-data retraining. Most "viral playbooks" online predate all of this — treat them as unverified.

### Sharing psychology

**Status games drive sharing.** Berger's STEPPS (Social Currency, Triggers, Emotion, Public, Practical Value, Stories)
and Eugene Wei's "Status as a Service" converge: people share what makes them look good or look correct. Practical Value

- Social Currency is the cleanest non-rage-bait combo. Every piece must answer: **what status does the audience gain by
  sharing this?** If there's no answer, the piece is not ready.

## Procedure

Ordered sequence and intent only. _Who owns each step's mechanics is in **Routing**, referenced by the `→` marker —
never re-taught here._ Steps marked **[here]** are owned by this skill.

1. **Diagnose intent. [here]** Fill all four blanks; if you can't, the piece is not ready:
    - **avatar** — a single named person, not a segment.
    - **base pain** — in their language; one of the four horsemen (money, time, health, access) or a BuildOS-specific
      pain (overwhelm, mental clutter, context loss, decision fatigue).
    - **status / share-payoff** — what the audience gains by sharing (per Judgment → Sharing psychology).
    - **action** — the one thing the post should drive (read, save, share, reply, click, buy — never all).
2. **Lock platform + topic discipline.** → `algorithm_aware_publishing`. Then **load the matching reference module** here.
3. **Craft the hook.** → `hook_craft_short_form`. The loaded platform reference supplies the flavored archetype
   mappings and hook thresholds.
4. **Structure the piece.** → `viral_video_script_structure`. The platform reference supplies format-specific
   compression (60-second skeleton, 9-slide carousel, atomic essay).
5. **Run story-craft QA.** → `story_driven_content_craft`.
6. **Run the pre-publish gates.** → `algorithm_aware_publishing` (six-checkpoint psychology gate; Keep/Modify/Reject
   filter; dual audit — algorithm-clean AND BuildOS-thesis-coherent).
7. **Audit against the seven tensions. [here]** Walk all seven; for each that bites, name it and record the pick.
8. **Distribute and read the data.** → `algorithm_aware_publishing`. The platform reference supplies platform-specific
   timing and signal weights.
9. **Assemble the planning packet. [here]** Per the **Contract**, including the next two pieces in the series.

## Routing

Ownership map. The Procedure sequences; this table assigns. One concept, one owner — everyone else routes here.

| Step | Intent (what)                        | Owner (who)                    | This skill retains                                             |
| ---- | ------------------------------------ | ------------------------------ | -------------------------------------------------------------- |
| 1    | Diagnose intent (four blanks)        | **this skill**                 | full ownership                                                 |
| 2    | Platform + topic discipline          | `algorithm_aware_publishing`   | loading the correct reference module                           |
| 3    | Hook craft                           | `hook_craft_short_form`        | which platform-flavored archetype + threshold (from reference) |
| 4    | Script / post structure              | `viral_video_script_structure` | format-specific compression (from reference)                   |
| 5    | Story-craft rewrite passes           | `story_driven_content_craft`   | nothing — pure defer                                           |
| 6    | Psychology gate + Keep/Modify/Reject | `algorithm_aware_publishing`   | the BuildOS-thesis half of the dual audit                      |
| 7    | Seven-tensions audit                 | **this skill**                 | full ownership                                                 |
| 8    | Distribute + read diagnostics        | `algorithm_aware_publishing`   | platform timing + signal weights (from reference)              |
| 9    | Assemble packet                      | **this skill**                 | full ownership (see Contract)                                  |

## Contract

When planning a piece, return:

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
- BuildOS filter pass results (which tactics applied / modified / rejected)
- seven-tensions audit (which tensions bit, and the deliberate pick for each)
- next two pieces in the same series (so this isn't a one-off)

**For a flop diagnosis**, replace the packet with: which Procedure step failed first, the platform-specific signal
evidence (from the loaded reference), and the single upstream fix.

## Policy

- Do not emit platform-specific guidance (signals, formats, hook thresholds, anti-patterns) without loading the matching
  reference module first.
- Refuse manufactured contrarianism, rage-bait, fear, and drama as engagement levers in BuildOS-tagged work; flag them
  explicitly in any other work.
- Refuse off-avatar viral ideas: a 10M-view hit outside the avatar is worse than a 200K-view hit inside it — the broad
  hit corrupts the next posts' targeting.
- Do not pretend conflicting principles agree — name the tension and pick deliberately.
- Do not re-teach sibling material. Ownership is declared in **Routing**; violating it re-creates the mesh this
  structure exists to prevent.
- Do not recommend caption / hashtag / posting-time tweaking as a fix — wrong layer of the stack.
- Do not ship a hook whose body cannot pay it off, and never force cross-platform CTAs ("watch the full version on YouTube").
- Treat 2019-era playbook advice as unverified: every platform claim must trace to a 2025/2026 signal in a reference
  module or be flagged as stale.

## Knowledge

Deliberately thin. This is an orchestration skill; durable declarative grounding lives in the siblings, and volatile
per-platform facts live in the reference modules, each carrying its own provenance tags. The only stable knowledge that
belongs _here_ is the two frameworks already stated under **Judgment** (the seven tensions; STEPPS + Status as a Service),
because they are central, stable, and owned nowhere else.

Everything platform-specific — ranking signals, format hierarchies, thresholds, anti-patterns — is **out of scope for
this file by design**. Load the reference module. See `references/instagram.md` for the canonical provenance pattern
(PRIMARY / practitioner / internal-default, with an explicit REMOVED/CORRECTED audit trail); every reference module
should follow it.

## Provenance

- **Reference modules:** `going_viral.tiktok`, `going_viral.instagram`, `going_viral.twitter`, `going_viral.linkedin` —
  one per platform, each with verified 2025/2026 algorithm reality, hook mappings, format winners, and anti-patterns,
  provenance-tagged.
- **Primary sources:** Kane Kallaway (hooks, scripts, storytelling, algorithms — consumed via the sibling skills),
  Devin Nash (manufactured-virality counterweight), Jonah Berger (STEPPS), Eugene Wei (Status as a Service), plus
  platform-native voices per reference (Jenny Hoyos, Brendan Kane, MrBeast; Brock Johnson, Adam Mosseri, Lara Acosta;
  Sahil Bloom, Naval Ravikant, Justin Welsh, Pieter Levels; Hala Taha, Richard van der Blom).
- **Maintainers:** the canonical research draft with full lineage and pending-transcript TODOs lives at
  `docs/research/youtube-library/skill-drafts/going-viral/` (not available at runtime).
