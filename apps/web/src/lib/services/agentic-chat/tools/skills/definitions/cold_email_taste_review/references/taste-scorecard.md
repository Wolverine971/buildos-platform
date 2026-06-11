---
doc_type: skill-reference
skill: cold_email_taste_review
reference: taste-scorecard
visibility: internal
publish: false
created: 2026-06-10
purpose: The 8-dimension taste scorecard with auto-fails, the screenshot test, and verdict mapping for grading any cold email draft before send.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_taste_review/references/taste-scorecard.md
---

# Taste Scorecard

Load this when grading any draft. Score all eight dimensions, then check auto-fails, then run the screenshot test, then map to a verdict. A score without a named fix is not a review.

Framing metric for every verdict (keep verbatim):

```text
qualified conversations started per unit of market trust consumed
```

Never grade an email on whether it will get sent or opened at volume. Grade it on whether it starts a qualified conversation without burning trust the sender cannot recover.

## Governing Sources

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

## The Scorecard (8 dimensions, 0–2 each, 16 max)

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

## The Screenshot Test (named test — keep the name)

> Would a serious operator be embarrassed if the recipient screenshotted this and posted it publicly?

Justin Jackson literally does this to bad cold emails. Run it on the full draft after scoring. Check specifically for: fake warmth, oversized ask, automation fingerprints, unsupported claims, guilt language. A screenshot-test failure is auto-fail #6.

## Cut Lines and Verdict Mapping

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
