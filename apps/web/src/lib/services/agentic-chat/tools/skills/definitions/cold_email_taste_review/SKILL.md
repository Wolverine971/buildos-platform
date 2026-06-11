---
name: Cold Email Taste Review
description: Child skill for scoring whether a cold email draft is specific, proportionate, credible, and reputation-safe enough for a serious sender to send — including "tighten this up" or "is this good?" requests on an existing draft. 8-dimension scorecard, auto-fails, screenshot test, and named rewrite moves per failure; routes structural failures to the compiler instead of line-editing.
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.taste_review
    - cold_email_outreach.shame_function
reference_modules:
    - id: cold_email_taste_review.taste_scorecard
      name: Taste Scorecard
      summary: The 8-dimension scorecard (0–2 each) with auto-fails, the screenshot test, cut lines, and verdict mapping for grading any draft.
      when_to_load:
          - When grading any draft — load before assigning scores or a verdict.
      path: references/taste-scorecard.md
      visibility: internal
    - id: cold_email_taste_review.fake_warmth_and_rewrites
      name: Fake-Warmth Detector and Rewrite Patterns
      summary: Named fake-warmth patterns, subject/preview rejection rules, five bad-to-good rewrite pairs, and expanded mode-dignity checks for PR, recruiting, research, and investor modes.
      when_to_load:
          - When the draft fails dimensions 1, 2, 7, or 8, or any auto-fail fires.
          - When the user asks why an email is bad or how to fix a failed dimension.
      path: references/fake-warmth-detector-and-rewrites.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_taste_review/SKILL.md
---

# Cold Email Taste Review

Use this child skill when reputation risk is the main question. The north star is qualified conversations started per unit of market trust consumed — never emails sent. A score without a named fix is not a review.

## When to Use

- The draft may sound generic, pushy, automated, or fake-warm
- The personalization may be decorative
- The ask may exceed the trust earned
- Proof, claims, or tone may embarrass the sender if screenshotted
- The user asks whether the email is good, tasteful, or safe to send

## Workflow

1. Identify the mode (volume, strategic, investor, recruiting, PR/podcast, research) and trust level — the scorecard's readability limits, ask ceilings, and subject rules are mode-keyed. Trust ladder shorthand (full T0–T3 rubric lives in `cold_email_offer_lab`): T0 = cold first touch, T1 = they replied or engaged once, T2 = ongoing thread or referral, T3 = prior relationship. First-touch cold = T0 unless evidence says otherwise.
2. Load `cold_email_taste_review.taste_scorecard` and score all 8 dimensions (0–2 each): two-people test, bridge integrity, them>you ratio, readability, ask/trust proportion, proof integrity, voice/automation smell, mode dignity.
3. Check the auto-fail list. Any auto-fail → verdict is do-not-send regardless of total score; name the auto-fail and stop polishing.
4. Run the screenshot test on the full draft: would a serious operator be embarrassed if the recipient screenshotted this and posted it?
5. Map score to verdict per the scorecard cut lines (pass / revise / do-not-send) and say that the cut lines are internal defaults, not industry standards.
6. If dimensions 1, 2, 7, or 8 failed — or any auto-fail fired — load `cold_email_taste_review.fake_warmth_and_rewrites` and attach the matching named rewrite move to each failure (artifact-first, progress-first, causal bridge, assumptive, numbered fork).
7. For do-not-send verdicts with structural causes, route instead of line-editing: offer problem → `cold_email_offer_lab`, anchor/bridge problem → `cold_email_research_anchors`, full rebuild → `cold_email_outreach_compiler`.
8. Return the highest-risk line and its smallest fix.

## Output Contract

- Per-dimension scores: all 8, each 0–2, failed dimensions named
- Auto-fail flags: which (if any) fired, quoted from the draft
- Screenshot test result
- Verdict: pass, revise, or do-not-send (with the internal-calibration caveat on cut lines)
- For every dimension scored 0 or 1: the specific named rewrite move, not generic advice
- Highest-risk line and its smallest fix
- Routing recommendation when the failure is structural

## Guardrails

- Do not polish a fundamentally dishonest frame.
- Auto-fails are non-negotiable — a high total score never overrides an auto-fail.
- Fake warmth is an auto-fail, not a style note. Do not let fake personalization survive because the copy is fluent.
- A score without a named fix is not a review.
- Do not approve unsupported metrics or customer claims.
- Do not ignore the recipient's dignity when they say no.
- Do not approve media outreach that serves the sender but not the recipient's audience.
- Do not approve feature-first copy when the stated offer is a buyer-choice artifact.
- Do not cross-apply mode benchmarks (recruiting subject norms vs. sales subject norms).
- Never optimize for emails sent — the north star is qualified conversations started per unit of market trust consumed.
- Scorecard cut lines are internal defaults — say so when reporting a verdict.

## Notes

- Reference modules: `cold_email_taste_review.taste_scorecard` (grade any draft), `cold_email_taste_review.fake_warmth_and_rewrites` (explain and fix failures in dimensions 1, 2, 7, 8).
- Dimension sources: Becc Holland, Sam McKenna, Connor Murray, Austin Schneider, Aaron Shepherd, Jason Bay/Florin Tatulea, Justin Jackson, April Dunford, Mailshake 2025, Lavender (directional-vendor), Muck Rack, Mom Test, Seibel/YC. Full citations live in the reference modules.
- Maintainers: enrichment lineage and the threshold-calibration flag live in `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` (not available at runtime).
