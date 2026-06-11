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
2. Score all 8 dimensions using the Taste Scorecard section below (0–2 each): two-people test, bridge integrity, them>you ratio, readability, ask/trust proportion, proof integrity, voice/automation smell, mode dignity.
3. Check the auto-fail list. Any auto-fail → verdict is do-not-send regardless of total score; name the auto-fail and stop polishing.
4. Run the screenshot test on the full draft: would a serious operator be embarrassed if the recipient screenshotted this and posted it?
5. Map score to verdict per the scorecard cut lines (pass / revise / do-not-send) and say that the cut lines are internal defaults, not industry standards.
6. If dimensions 1, 2, 7, or 8 failed — or any auto-fail fired — load `cold_email_taste_review.fake_warmth_and_rewrites` and attach the matching named rewrite move to each failure (artifact-first, progress-first, causal bridge, assumptive, numbered fork).
7. For do-not-send verdicts with structural causes, route instead of line-editing: offer problem → `cold_email_offer_lab`, anchor/bridge problem → `cold_email_research_anchors`, full rebuild → `cold_email_outreach_compiler`.
8. Return the highest-risk line and its smallest fix.

## Taste Scorecard

When grading any draft: score all eight dimensions, then check auto-fails, then run the screenshot test, then map to a verdict. A score without a named fix is not a review.

Framing metric for every verdict (keep verbatim):

```text
qualified conversations started per unit of market trust consumed
```

Never grade an email on whether it will get sent or opened at volume. Grade it on whether it starts a qualified conversation without burning trust the sender cannot recover.

### Governing Sources

- Becc Holland — personalization vs. relevance (`source-analyses/becc-holland-personalization-to-relevance.md`).
- Sam McKenna — Show Me You Know Me, authenticity bridge, semantic-fit failures (`source-analyses/sam-mckenna-show-me-you-know-me-ai-era.md`).
- Connor Murray — assumptive language, one-phone-screen rule (`source-analyses/connor-murray-cold-email-assumptive-cadence.md`).
- Austin Schneider / Instantly — artifact-over-call, 2026 filter context (`source-analyses/austin-schneider-engagement-first-cold-email-2026.md`).
- Aaron Shepherd — follow-up don'ts, guilt language (`source-analyses/aaron-shepherd-volume-front-end-offer.md`).
- Jason Bay / Florin Tatulea — word counts, mobile-shaped bodies (`source-analyses/florin-tatulea-reply-method-cold-email-showdown.md`).
- Justin Jackson — small asks, screenshot behavior, fake-warmth clichés.
- April Dunford — proof reserved for the specific differentiated claim.
- Mailshake State of Cold Email 2025 — robot-register rule (508-respondent survey, methodology stated, self-reported).
- Lavender Cold Email 101 + benchmark — readability and length lifts (231,818 emails / ~50k inboxes; sample stated, selection bias not characterized: treat all Lavender numbers as **directional-vendor**, never as governing thresholds).
- Muck Rack pitching guide + checklist, Mom Test (Fitzpatrick), Michael Seibel / YC — mode dignity.
- RecruitingDaily/Recruiterflow — 3:1 them>you ratio (50k-email claim, methodology not stated: named-practitioner pattern, not a governing threshold).

### The Scorecard (8 dimensions, 0–2 each, 16 max)

Score 2 = pass, 1 = partial, 0 = fail. Every 0 or 1 must be reported with the failed dimension named and a specific rewrite move attached.

| #   | Dimension                                     | 2 (pass)                                                                                                                                             | 0 (fail)                                                                                              | Source                                                                                                                                                                                                                            |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Two-people test** (personalization honesty) | Anchor line could only be about this recipient, OR is honestly graded as 1:many relevance with a strong trigger-based signal                         | "Personalized" opener that could be sent to two people unchanged; decorative detail                   | Becc Holland: "If you can send the same email to two people, it is relevance — not personalization"                                                                                                                               |
| 2   | **Bridge integrity**                          | Remove the hook and the outreach reason collapses — the anchor _causes_ the email                                                                    | Hook is removable; personal detail with no business consequence ("fellow eagle," shared school alone) | McKenna authenticity bridge; her Turkish-military-"training" context-miss example; strategic-outreach audit question                                                                                                              |
| 3   | **Them > you ratio**                          | ≥3:1 "you/your" vs "we/our/I"; first sentence proves relevance before introducing the sender                                                         | Email opens with sender bio; "we help companies…"                                                     | RecruitingDaily/Recruiterflow 3-to-1 golden ratio (practitioner pattern); Lavender teardown framing "a little more them > you"                                                                                                    |
| 4   | **Readability**                               | ≤100 words (volume) / ≤170 (strategic, recruiting); 3rd–5th-grade reading level; 1-sentence paragraphs; fits one phone screen                        | Wall of text; 10th-grade+ register; jargon                                                            | Lavender (directional-vendor): 3rd–5th-grade level +67% replies, short mobile-shaped emails +83% replies, first opens ~8x more likely on phone; Bay 50–100 words; Murray one-phone-screen rule                                    |
| 5   | **Ask/trust proportion**                      | Smallest useful yes; artifact before meeting; ask helps the buyer make progress                                                                      | "Worth a chat?"; calendar link on first touch; Zoom-with-a-stranger ask at zero trust                 | Justin Jackson: "A Zoom meeting with a stranger is a tremendous ask. Keep your request small."; Schneider: "booking a call is not valuable… solve the problem with an actual action"                                              |
| 6   | **Proof integrity**                           | Proof matched to the exact claim; customers named only with permission; verifiable                                                                   | Unsupported ROI ("457%"-style claims), vague "teams like yours," fabricated mutual contact            | Dunford: reserve proof for the specific differentiated claim; Steli analysis critical treatment of marketing-anecdote numbers                                                                                                     |
| 7   | **Voice / automation smell**                  | Reads like a person typed it; no "I hope this finds you well," no "just checking in," no theatric prepositioning                                     | Marketing-automation register; AI-template fingerprint; fake-casual                                   | Mailshake: "If your email could've been written by a robot, it's getting deleted by a human"; Jackson on "I trust this email finds you well" ×5; Shepherd follow-up don'ts; Greenhouse: "hope all is well… doesn't sound sincere" |
| 8   | **Mode dignity**                              | PR: serves the recipient's audience; recruiting: candidate-centered with honest constraints; research: discloses intent; investor: factual, non-hype | Audience-irrelevant pitch; hidden sales motive in a research ask; hype                                | Muck Rack ("don't try to dazzle them, give it to them straight"); Mom Test; Seibel/YC                                                                                                                                             |

## Auto-Fails (any one → do-not-send, regardless of total score)

Auto-fails are non-negotiable. A 15/16 draft with one auto-fail is still do-not-send.

1. Fabricated research, proof, metrics, or mutual contact.
2. A research ask hiding a pitch (Mom Test violation).
3. Guilt or insult anywhere in the thread — "probably bad timing," "just nudging," "I guess you're not interested" (Shepherd).
4. Misleading subject — "Re:"/"Fwd:" on a first touch (Greenhouse).
5. Fake warmth (see the fake-warmth detector module) — manufactured familiarity is a dishonest frame, not a style problem.
6. Any claim that would embarrass the sender if screenshotted.

## Screenshot Test and Verdict Mapping

### The Screenshot Test (named test — keep the name)

> Would a serious operator be embarrassed if the recipient screenshotted this and posted it publicly?

Justin Jackson literally does this to bad cold emails. Run it on the full draft after scoring. Check specifically for: fake warmth, oversized ask, automation fingerprints, unsupported claims, guilt language. A screenshot-test failure is auto-fail #6.

### Cut Lines and Verdict Mapping

> **Internal calibration — not industry standard.** The eight dimensions are sourced as cited above; these cut lines are our own defaults to tune. Revisit after N campaigns of real send data. Say this when reporting a verdict.

| Total score           | Verdict         | Required output                                                                                                                                                                                                                           |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥13 and no auto-fail  | **pass**        | Verdict + any 1-point dimensions noted as optional polish                                                                                                                                                                                 |
| 9–12 and no auto-fail | **revise**      | Each failed dimension named + the specific rewrite move per failure (use the rewrite-pattern module) + highest-risk line                                                                                                                  |
| ≤8                    | **do-not-send** | Do not line-edit. Name the structural failure (usually offer, bridge, or honesty) and route: offer problem → `cold_email_offer_lab`; anchor/bridge problem → `cold_email_research_anchors`; full rebuild → `cold_email_outreach_compiler` |
| Any auto-fail         | **do-not-send** | Name the auto-fail explicitly. Do not polish around it — a dishonest frame cannot be fixed by fluent copy                                                                                                                                 |

Verdict-reporting rules:

- Report all eight per-dimension scores, even passing ones.
- Every dimension scored 0 or 1 gets a named fix — the move, not "improve this."
- Always include the single highest-risk line in the draft and its smallest fix.
- When the failure is in dimensions 1, 2, 7, or 8, load the fake-warmth and rewrites module for the pattern library and worked examples.

## Output Contract

- Per-dimension scores: all 8, each 0–2, failed dimensions named
- Auto-fail flags: which (if any) fired, quoted from the draft
- Screenshot test result
- Verdict: pass, revise, or do-not-send (with the internal-calibration caveat on cut lines)
- For every dimension scored 0 or 1: the specific named rewrite move, not generic advice
- Highest-risk line and its smallest fix
- Routing recommendation when the failure is structural

## Worked Example

Condensed from a full review of a fake-warmth first-touch sales email sent as variants to ~80 marketing leads; the input is in `evals.md` Task 1. Match this shape and rigor.

**Input — Subject: "Quick question?"**

> Hi Sarah, I hope this email finds you well! I loved your recent post — so insightful. As a fellow dog mom I just had to reach out. 😊
> I was hoping to set up some time to show you how Acme helps marketing teams like yours boost campaign output by 312% while cutting busywork in half.
> Worth a quick chat next week? I'll keep checking in if I don't hear back! — Warmly, Jess

**Mode:** Volume sales, first touch, zero trust (T0). **Honest answer up front: No. Do not send this.** Multiple auto-fails fire, so the verdict is do-not-send regardless of total score. North star applied throughout: qualified conversations started per unit of market trust consumed — at 80 recipients, every flaw is multiplied by 80.

**Per-dimension scores (0–2 each, 16 max):**

| #   | Dimension                | Score | Why                                                                                                                                                                                                                          |
| --- | ------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two-people test          | **0** | "I loved your recent post" names no post and no point; "fellow dog mom" has no business consequence. Both lines could go to any two people unchanged — and variants are going to 80. Relevance theater, not personalization. |
| 4   | Readability              | **2** | ~70 words, short paragraphs, one phone screen. The only pass — which is part of the problem: fluent enough to feel sendable.                                                                                                 |
| 5   | Ask/trust proportion     | **0** | "Set up some time" + "quick chat next week?" is a meeting-first ask at zero trust. No smaller yes, no artifact.                                                                                                              |
| 7   | Voice / automation smell | **0** | "I hope this email finds you well!" is the canonical robot greeting; "I'll keep checking in if I don't hear back!" pre-announces a guilt-nudge cadence.                                                                      |

_(…4 further dimensions — bridge integrity 0, them>you 0, proof integrity 0, mode dignity 0 — scored in the same shape.)_ **Total: 2/16.**

**Auto-fail flags (any one = do-not-send; three fire):**

1. **Fake warmth** — _"I loved your recent post — so insightful"_ (unanchored flattery); _"As a fellow dog mom I just had to reach out. 😊"_ (manufactured kinship — warmth that survives a mail merge is fake by definition).
2. **Claims that would embarrass the sender if screenshotted** — _"boost campaign output by 312%"_: unverifiable precision metric, no source, no named customer.
3. **Guilt-cadence flag** — _"I'll keep checking in if I don't hear back!"_ pre-commits to the nudge loop.

**Subject — reject (sales mode):** "Quick question?" hits the explicit cliché reject list and the question-subject rule (Lavender data; directional-vendor, ranked warning, not a hard threshold).

**Screenshot test: fail.** Two of the 80 recipients comparing identical "fellow dog mom" emails is one public screenshot away from a burned domain.

**Verdict: do-not-send** — triggered by the auto-fails, and independently by the 2/16 total (≤8 structural band). _Calibration caveat (required): the cut lines (≥13 pass, 9–12 revise, ≤8 do-not-send) are internal defaults, not industry standards. Auto-fails are non-negotiable regardless of score._

**Named rewrite moves per failure** (a ≤8 draft is not line-edited; moves are named for completeness):

| Failed dimension | Named move                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 & 2            | Decorative hook → causal bridge — or drop the 1:1 costume and run honest 1:many relevance off a real trigger signal.                                                                |
| 3 & 5            | Feature-first → progress-first + meeting-first → artifact-first ("I wrote a 3-point check for [specific bottleneck]. Want me to send it?").                                         |
| 7                | Guilt follow-up → numbered fork (+ strip the robot greeting). Do not "fix" the passive time ask with the assumptive move — assumptive belongs at earned trust, not T0 volume sends. |

_(…remaining failed dimensions handled the same way — dimension 6 gets "cut the claim", never a polish move; dimension 8 gets honest framing.)_

**Highest-risk line:** _"As a fellow dog mom I just had to reach out. 😊"_ — the screenshot magnet. **Smallest fix:** delete it entirely; the email's reason to exist must come from a causal bridge, not borrowed warmth.

**Routing (structural failure — do not line-edit):** full rebuild → `cold_email_outreach_compiler` (recommended); offer problem → `cold_email_offer_lab`; anchor/bridge problem → `cold_email_research_anchors`.

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

- Reference modules: `cold_email_taste_review.fake_warmth_and_rewrites` (explain and fix failures in dimensions 1, 2, 7, 8). The taste scorecard, auto-fails, screenshot test, and verdict mapping are inline above (folded into the shell 2026-06-11).
- Dimension sources: Becc Holland, Sam McKenna, Connor Murray, Austin Schneider, Aaron Shepherd, Jason Bay/Florin Tatulea, Justin Jackson, April Dunford, Mailshake 2025, Lavender (directional-vendor), Muck Rack, Mom Test, Seibel/YC. Full citations live in the Governing Sources section above and the fake-warmth reference module.
- Maintainers: enrichment lineage and the threshold-calibration flag live in `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` (not available at runtime).
