---
skill_id: algorithm-aware-publishing
name: Algorithm-Aware Publishing
description: Plan and audit publishing decisions on interest-media platforms with full awareness of the matching loop, viewer psychology, and BuildOS's anti-feed brand stance. Use when picking a hero platform, narrowing a topic, scoring whether to publish a specific piece, deciding what to keep / modify / reject from creator-economy tactics, or running a dual audit (algorithm-clean AND brand-coherent) on a draft.
skill_type: combo
categories:
    - marketing-and-content
parent_id: content_strategy_beyond_blogging
depth: 1
preserve_markdown: true
legacy_paths:
    - algorithm-aware-publishing
    - marketing-and-content.algorithm-aware-publishing.skill
    - docs/research/youtube-library/skill-drafts/algorithm-aware-publishing/SKILL.md
reference_modules:
    - id: algorithm_aware_publishing.content_games
      name: 'Pillar 0: The Five Content Games'
      summary: The strategic decision above the matching loop — five-game table and diagnostic, Trust Formula (Minutes × Relevance × Usefulness), Off-Target Cost Heuristic, Ironman 46M-views-zero-customers anecdote, and the BuildOS Game #4 + #5 hybrid classification with the ~3:1 channel ratio.
      when_to_load:
          - Before tagging any piece or channel with its content game, or setting the game ratio.
          - When evaluating a viral-looking idea that might be off-target for the avatar.
          - At the start of any publishing-strategy planning run.
      path: references/content-games.md
    - id: algorithm_aware_publishing.matching_loop_platforms
      name: Matching Loop, Platforms, and Plan / Diagnose Workflows
      summary: The matching-loop mental model (multimodal fingerprint, ~200-stranger sample, tier scaling), the two creator levers, the islands-not-ecosystem rule, the cross-platform signal-weight table with BuildOS hero-platform candidates, the 10-step Plan A Publishing Strategy workflow, and the Diagnose A Flopped Piece workflow.
      when_to_load:
          - When planning a publishing strategy, hero platform, topic + avatar pairing, or calibration window.
          - When checking topic-mapping or avatar discipline, or translating tactics across platforms.
          - When diagnosing why a published piece flopped.
      path: references/matching-loop-and-platforms.md
    - id: algorithm_aware_publishing.quality_gate_tactics
      name: Quality Gate, Keep / Modify / Reject Catalog, and Score Workflow
      summary: The four-attribute engagement filter, Trust Formula scoring rubric with the ~30/125 ship threshold, six-checkpoint sequence, gate-2 trust hierarchy, the full Keep (12) / Modify (5) / Reject (1) tactic catalog plus the out-of-scope comment-driver stack, and the 9-step Score A Specific Piece workflow with the CCN check.
      when_to_load:
          - When scoring a specific draft before publishing.
          - When applying the four-attribute filter, Trust Formula, six checkpoints, or trust hierarchy.
          - When deciding whether a creator-economy persuasion tactic is keep, modify, or reject for BuildOS.
      path: references/quality-gate-and-tactics.md
    - id: algorithm_aware_publishing.buildos_dual_audit
      name: BuildOS Dual Audit, Operating Rules, and Sources
      summary: The full Kane-audit and BuildOS-audit checklists, the nine BuildOS-specific operating rules (game hybrid, offering-is-BuildOS, anti-synthetic-volume, quiet-half base with 37signals and Justin Welsh existence proofs, author layer), and complete source attribution.
      when_to_load:
          - Before any ship / rewrite / kill decision — the dual audit is mandatory.
          - When answering BuildOS brand-coherence questions or applying the operating rules.
          - When tracing the provenance of a rule in this skill.
      path: references/buildos-dual-audit.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/algorithm_aware_publishing/SKILL.md
---

# Algorithm-Aware Publishing

Use this skill to publish into interest-media platforms without becoming captured by them. The platforms are matching engines, not megaphones — every video is fingerprinted multimodally, tested on a sample of ~200 mostly-non-followers, and either boosted, retried, or killed based on the response. The creator's only real leverage is to make matching easy (narrow topic + consistent avatar) and to make the sample stay (genuinely useful content for that avatar).

The hard part for BuildOS is that **the same playbook that wins distribution also includes tactics that violate the brand**. This skill encodes the dual audit: every published artifact must be (a) clean on the matching loop AND (b) routing attention toward the BuildOS interest-media diagnosis, not away from it. Algorithm-aware without being algorithm-captured.

The deep rules live in reference modules. The skill body holds the discipline, the mode dispatch, the output contract, and the guardrails; load the references before producing decisions.

## When to Use

- Pick a hero platform for a six-month focus window.
- Narrow or defend a topic / avatar pairing across many posts.
- Score whether to publish a specific piece — does it strengthen or pollute the matching loop?
- Decide what to keep, modify, or reject from creator-economy tactics (manufactured FOMO, comment bait, urgency stacks, re-stoked pain at close).
- Audit a published piece that flopped — diagnose where in the loop it broke (topic mapping / sample group / engagement signals).
- Run the dual audit (Kane mechanics + BuildOS thesis) on a draft before ship.
- Plan rented → owned ramps (feed → newsletter → product) as the actual brand strategy, not a side benefit.
- Build a "winners library" of outlier videos in the niche before brainstorming.

Do not use this skill for hook craft (defer to `hook-craft-short-form`), narrative shape (defer to `story-driven-content-craft`), script structure (defer to `viral-video-script-structure`), or upstream "what to publish" thesis selection (defer to `nonfiction-writing-from-lived-conviction` and `content-strategy-beyond-blogging`). This skill is the distribution and brand-coherence layer above all of those.

## Core Principles

1. **Social media is no longer social. It is media.** The 2020 TikTok-driven shift collapsed the social graph as a primary distribution input. Every major feed runs on audience matching, regardless of follow relationship.
2. **The platform's only goal is session length.** Distribution decisions serve one objective: keep the user on the app longer so more ads run. Reframe "will the algorithm like this?" → "will the next viewer stay on the platform longer because of this?"
3. **Audience matching is the highest-leverage lever.** Narrow topic + single avatar consistently across many posts. Mixing topics produces a blended fit score and poisons the next several videos.
4. **On-target virality beats pure virality.** A 200K-view hit inside the avatar is a better business outcome than a 10M-view hit that spans disjoint groups — the broad hit corrupts your next-video targeting.
5. **Treat platforms as islands.** Cross-platform forced ramps nuke engagement. Build world-cohesion across islands; don't force discovery between them. The only sanctioned ramp is rented → owned.
6. **Value does not accrue at the media layer.** AdSense and brand deals will not produce real money. Use media to manufacture attention; route attention to owned offerings (BuildOS itself, in this case).
7. **Honest signals over manufactured signals.** Watch time and completion are aligned with quality; comment bait, manufactured FOMO, and faux credibility are not. The brand cannot survive feed-style manipulation even when feed-style manipulation works.
8. **The dual audit is non-negotiable.** Algorithm-clean is necessary. BuildOS-thesis-coherent is also necessary. Either one alone is failure.
9. **Stop tweaking the wrong layer.** Posting time, hashtags, captions don't matter. Topic precision, hook quality, and the four engagement attributes do.

## Workflow

The four pillars run in order — Pillar 0 (content game) is the strategic decision _above_ the matching loop; skip it and you optimise the wrong system.

1. Identify the mode: **plan** a publishing strategy, **score** a specific draft, or **diagnose** a flopped piece.
2. In every mode, load `algorithm_aware_publishing.content_games` first and tag the channel or piece with its game (#3 / #4 / #5 / hybrid with a declared piece-level pick). Untagged work does not advance. For BuildOS, confirm the Game #4 + #5 hybrid and the ~3:1 #5:#4 ratio.
3. **Plan mode:** load `algorithm_aware_publishing.matching_loop_platforms` and run the 10-step Plan A Publishing Strategy workflow — hero platform, topic + avatar in writing, winners library, visual/verbal signature, rented → owned ramp, 30-post calibration window, pre-publish gates.
4. **Score mode:** load `algorithm_aware_publishing.quality_gate_tactics` and run the 9-step Score A Specific Piece workflow — topic-mapping check, avatar check with the Off-Target Cost Heuristic, non-follower opening test + CCN parse, four-attribute filter or Trust Formula, six-checkpoint walk, trust-hierarchy check, Keep/Modify/Reject scan.
5. **Diagnose mode:** load `algorithm_aware_publishing.matching_loop_platforms` and run the Diagnose A Flopped Piece workflow — locate the first failed step of the loop (topic-mapping / sample-found / sample-engaged / tier-scaled), stop there, and name the upstream fix.
6. Before any ship / rewrite / kill decision, load `algorithm_aware_publishing.buildos_dual_audit` and run both audits — Kane (algorithm-clean) and BuildOS (brand-coherent). Both must pass, every time.
7. Assemble the output: a publishing decision packet for plan/score runs, or a diagnostic report for flop runs (contracts below).

## Output

Return a publishing decision packet:

- **Game tag** — #3 / #4 / #5 (or hybrid with declared piece-level pick); off-target cost analysis if any axis is unusual
- **Hero platform** — chosen with rationale; calibration-window status (post # of 30)
- **Topic + avatar** — narrow, in writing, defended across the prior 20 pieces
- **Trust Formula score** (Game #5 only) — Minutes / Relevance / Usefulness on 1–5 scale, multiplied; pass/fail vs. 30 threshold
- **Topic-mapping check** — visuals / transcript / metadata aligned (yes/no per axis)
- **Non-follower opening test** — pass / fail with notes
- **Four-attribute engagement filter** — topic relevance / non-obvious + implementable / high absorption / short distance to implement (each yes/no)
- **Six-checkpoint walk** — first failed gate, if any
- **Trust artifacts at gate 2** — testimonial / self-proof / following / gap-evidence / common ground / studio quality (which are present)
- **Keep/Modify/Reject scan** — which tactics in use; modifications applied; reject-tagged patterns absent
- **Kane audit result** — pass / fail per axis
- **BuildOS audit result** — conviction-from-real / no manufactured FOMO / urgency / faux credibility / honest close / routes to BuildOS / metrics-invisible test passed
- **Rented → owned ramp** — destination after this post (email / BuildOS / community)
- **World-building cohesion** — visual / verbal / aesthetic continuity with prior pieces on this island
- **Cross-platform note** — native version exists per island, no forced ramps
- **Decision** — ship / rewrite / kill, with the named rewrite focus

For audit-mode runs on flopped content, replace the packet with a **diagnostic report**: which step of the matching loop failed (topic-mapping / sample-found / sample-engaged / tier-scaled), which gate of the six-checkpoint sequence broke, the wrong-layer tweaks to avoid, and the specific upstream fix.

## Guardrails

- **Do not produce outputs without loading the matching reference module first.** Game tags need `content_games`; planning and flop diagnosis need `matching_loop_platforms`; draft scoring needs `quality_gate_tactics`; every ship decision needs `buildos_dual_audit`.
- **No publishing without a game tag.** Every piece declares Game #3, #4, #5, or hybrid before any other check. Untagged pieces don't advance.
- **No mixed-game pieces.** Game #5 essays don't drill product features; Game #4 demos don't drift into philosophy. Split or kill.
- **No off-target viral chases regardless of view potential.** A 10M-view hit to the wrong audience corrupts the next 10 pieces. Apply the Off-Target Cost Heuristic; refuse unless the cost is explicitly justified.
- **No view-count reporting as channel health for Game #5 content.** Use cohort-level trust signals (returning-viewer minutes, BuildOS sign-ups attributed to content, comment specificity, newsletter open-rate per piece).
- **No mixed-topic publishing on the hero platform.** Split accounts before mixing topics.
- **No optimisation for existing followers in the first 200 views.** Design the opener for the non-follower sample.
- **No caption / hashtag / posting-time tweaking.** Wrong layer.
- **No manufactured FOMO, jealousy, or urgency.** The anti-feed brand cannot weaponise feed-style emotion.
- **No re-stoked pain at close** (the Reject-tagged trick #16). Trust the viewer to choose.
- **No comment-bait stack.** Hard contrarian stance + amplified language + cult-brand targeting + manufactured emotion = manipulation even when it works.
- **No studio polish substituting for proof.** High fidelity but human.
- **No cross-platform forced ramps.** "Watch the full version on [other platform]" nukes engagement and breaks trust. Native execution per island.
- **No external URLs in feed posts.** Platforms suppress link-bearing content. Treat link drops as paid expense.
- **No reliance on AdSense / brand deals as the income strategy.** Media layer captures little; offering layer captures most.
- **No "be everywhere" strategy.** One hero platform + email. Six months. No exceptions for solo / small operators.
- **No pivot mid-calibration window.** Each topic pivot resets the matching loop. Pay through 30 calibration posts.
- **No publishing without the dual audit passed.** Algorithm-clean AND BuildOS-coherent. Both, every time.
- **No publishing a piece that wouldn't be worth publishing if metrics were invisible.** This is the brand's truth-test.

## Notes

- Reference modules: `algorithm_aware_publishing.content_games` (Pillar 0 game decision), `algorithm_aware_publishing.matching_loop_platforms` (Pillar 1 + platform table + plan/diagnose workflows), `algorithm_aware_publishing.quality_gate_tactics` (Pillar 2 + Keep/Modify/Reject catalog + score workflow), `algorithm_aware_publishing.buildos_dual_audit` (Pillar 3 + operating rules + source attribution).
- Pairs with `hook-craft-short-form` (opener), `story-driven-content-craft` (curiosity-loop architecture, dopamine ladder, 7-mistakes filter), `viral-video-script-structure` (the body the algorithm reads), `nonfiction-writing-from-lived-conviction` (the lived-experience source upstream of any post), and `content-strategy-beyond-blogging` (the format-vs-intent layer).
- Full source attribution (Kallaway videos + email, BuildOS internal essays, Galloway / Welsh / DHH sharpeners, underlying analyses, combo index) lives in `algorithm_aware_publishing.buildos_dual_audit`.
