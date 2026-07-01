---
name: Usability Quick Research
description: >-
    Child skill under Build Quality UI/UX for decision-first lightweight UX research. Sizes the bet before picking a method (bet-size → method matrix), enforces hypothesis-not-validation discipline, runs Krug-style 3-user moderated tests with a leading-question lint, audits old research and participant quality, and returns a research plan with stop conditions instead of a report.
skill_type: strategy # procedure | strategy | reference | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: build_quality_ui_ux
depth: 1
preserve_markdown: true
legacy_paths:
    - product-and-design.usability-evaluation-and-quick-research.skill
    - product-and-design/usability-evaluation-and-quick-research
    - docs/research/youtube-library/skill-drafts/usability-evaluation-and-quick-research/SKILL.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/usability_quick_research/SKILL.md
---

# Usability Quick Research

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: strategy, so Judgment carries the weight: the decision spine (bet-size →
  method matrix, question-quality ladder, survey guardrail, cross-rules) lives there. The Workflow, the
  3-user test script, and the leading-question lint are the Procedure (a strategy skill may carry one).
  There is no Routing block (this skill routes to no sibling) and no standalone Knowledge block — its
  declarative grounding is fused into the decision criteria it serves and is provenanced in Provenance.
-->

## Identity

Use this child when a UI decision needs user evidence instead of another internal opinion. Operating thesis (Hall): research is the act of becoming informed enough to make a better decision — start with goals and decisions, never with methods. Never answer "what research method should we use?" until the decision and unknowns are named.

This is a **strategy** skill at **domain** altitude: its dominant job is to _decide_ how big the bet is and which is the smallest credible method, sizing risk before any method is picked; the ordered Workflow and the fill-in test script are the secondary procedure that serves that decision.

## Activation

- Planning quick research, interview questions, usability tests, prototype tests, assumption checks, or lightweight synthesis.
- The user asks how to validate a screen, reduce UX risk, learn from users, or run a practical usability pass without a large research program.
- A design review depends on unknown user goals, language, confidence, or task success.
- Stakeholders are resisting research, leaning on old research, or asking for validation after a decision is already made.

## Judgment

### Bet Size → Method Selection

"The amount of research depends on how large the decision is, how much is already known, and how uncertain the team is" — Hall states this verbatim (BayCHI primary source), so the bet-size grouping is now a primary rule, not a derivation. Method rows are drawn from the Hall/Krug method catalog; Krug's reversibility limit on small-sample testing sets the High-tier floor.

| Bet size   | Decision profile                                                                          | Smallest credible methods                                                                                                                                   | Floor                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Low**    | Reversible, cheap to be wrong, ships this week                                            | Desk/topical research, old-research audit, trunk test, heuristic pass, support-log or analytics review, competitive teardown                                | Self-serve, same day; no recruiting required                                                                                                                       |
| **Medium** | Sprint-level; reversible but costly to redo                                               | 3-user moderated think-aloud test (script below), 1–2 semi-structured user interviews, prototype/Figma walkthrough with 2 users, card sort for IA questions | Hypothesis + disconfirming-evidence list written before contact; real or explicitly-justified proxy participants                                                   |
| **High**   | Expensive to reverse: pricing, payment flows, security UX, repositioning, platform choice | All of the above, repeated rounds, plus quantitative companions (task success rate, time-on-task, error rate) on larger samples; stakeholder research first | 3 users is NOT enough at this tier (Krug's own limit). Multiple rounds + quant evidence before committing; named decision-maker sign-off on the disconfirming list |

Cross-rules:

- When stakeholders resist "research," reframe around bet size and decision risk. Hall's sourced reframe: "All business is about making bets on human behavior" (WSJ, via Hall) — this takes certainty off the table and reframes research as placing a better-informed bet, not seeking proof. Better-informed decisions, higher chance of success, lower risk.
- Two data types → method (Hall): there are only two kinds of data, and the data type picks the method. A **quantitative** question (how many / how much) needs a quantitative method; a **qualitative** question (why / what you didn't think to ask) needs a qualitative method. "You cannot math your way to why." Qualitative is the only method that surfaces "what you didn't think to ask" — surveys and analytics cannot. High-bet tiers often need both ("you need to know what's happening and how much"), but quant tells you whether something matters, never why.
- Old research is not automatically authoritative: audit it against today's question, evidence quality, date, participant fit, and decision relevance before reusing it.
- Participant quality is the insight quality: every plan names who qualifies, why they represent the target, and what proxy limitations remain.
- When users misunderstand a UI, pair research with copy and label review — interface quality is language quality.
- Recommend a cadence, not a one-off study, when the user asks how to institutionalize research.

### Survey guardrail (Hall, 2nd-edition surveys chapter)

Before recommending a survey at any tier, run it through this test. Surveys feel objective because you can count the answers — but you may just be counting the lies.

- **Answerable-truthfully-and-willingly test.** A survey question is valid only if the respondent (a) knows the answer truthfully and (b) is willing to give it. Good: factual, knowable questions ("How many kids under 18 live in your home?"). Fails the willingness test: sensitive questions (income). Fails the truthfully test: anything asking people to predict their own behavior or rate feelings.
- **No feature-ranking.** People cannot rank features, and prioritizing the product is the designer's paid job — a feature-ranking survey or dot-vote outsources the decision to people who can't and shouldn't make it. Reject it; route the question to qualitative behavior observation instead.
- **Do not turn feelings into math.** Satisfaction/1–10/"rate how easy" scales are invalid — "no human has feelings in 10 degrees of granularity." Defer to qualitative for the why.
- **Large N ≠ statistical confidence.** Surveying 1,000 people is not statistical confidence; "anecdotes you can count is not the same as quantitative data." Real probabilistic sampling requires target population → sampling frame → representative sample, plus handling non-response and self-selection bias. Absent that, a large-N survey gives no more valid conclusions than talking to 12 well-screened users — so prefer the qualitative round unless the survey clears the test above.

## Procedure

1. Name the decision first (Hall's sequence): define goals, define success, identify what must be known, identify driving assumptions — then choose a method. Answer the decision-first questions: What will change based on the learning? What does the team currently believe? What would change the team's mind (disconfirming evidence)? How big is the bet?
2. Estimate bet size (low / medium / high) from reversibility, cost of being wrong, and how much is already known. Every research plan must carry a bet-size estimate.
3. Brainstorm questions, not ideas: produce a ranked unknowns list before any solution ideas. Rank by Hall's question-quality ladder — a **good** question is specific, actionable, practical, and within your means; the **great** question is "What do we really know vs. what are we just assuming?"; the **best** question is "the unknown that carries the most risk." Research the best question (highest-risk unknown) first. Separate discovery questions from evaluative usability questions. One primary research question per round, at most 1–2 secondary.
4. Pick the smallest credible method from the bet-size → method matrix in **Judgment** above. If buy-in or alignment is weak, research the organization first: stakeholder interviews and decision-maker mapping before user studies.
5. Write the hypothesis and the disconfirming-evidence list before any user contact. If you cannot write what would change your mind, you are running validation theater, not research.
6. Prepare neutral prompts (run the leading-question lint), representative participants or named proxies with explicit limitations, and observable success criteria.
7. Run sessions, then retro within 24 hours: did anything disconfirm? Synthesize into decisions, design changes, risks, confidence level, and open questions — not a report.

### Moderated 3-User Test Script (fill-in)

Protocol rules from Krug's rocket-surgery canon: 3 users per round, hour-long one-on-one think-aloud sessions, test scenarios not features, tester is a guide not a helper, recordings watched by the whole team, monthly recurring cadence beats heroic late testing.

1. **Setup (before recruiting):** Decision: `___`. Bet size: `___`. Hypothesis: `___`. Disconfirming evidence that would change our mind: `___`. Primary research question: `___`. Secondary (≤2): `___`.
2. **Recruit:** 5 to seat 3 (some no-show). Who qualifies and why: `___`. Proxy limitations: `___`. Incentive: `___`. At least 1 in 3 sessions with churned or struggling users — do not recruit only happy users.
3. **Warm-up (≈5 min):** context questions about their situation and current behavior; no product pitch, no explaining what the product does.
4. **Scenarios (3–4, ≈40 min):** each is a goal ("plan your week"), never a feature instruction ("click the brain-dump button"). Observable success criterion per scenario: `___`.
5. **Moderation:** ask them to narrate their thinking; the narration is the data. Do not help unless they are truly stuck, and only after a long pause — the friction is the data; smoothing it over destroys it.
6. **Wrap-up (≈10 min):** what surprised you? What did you expect to happen that didn't? What would you tell a colleague this is for?
7. **Retro within 24 hours:** did anything disconfirm the hypothesis? If several sessions in a row confirm everything, treat it as a red flag — either the hypothesis was trivially true or the sessions were structured to confirm.

### Leading-question lint

Run every scripted prompt through this before the session. The governing rule is Hall's: a prompt that cannot elicit disconfirming evidence is validation theater — rewrite it. Items marked (default) are internal-practice defaults derived from that rule, not verbatim from sources.

- Reject prompts that embed the team's preferred answer, framing, or feature name.
- Reject future hypotheticals ("Would you use…?", "Would X be useful?") — replace with past behavior: "Walk me through the last time you…". (Hall: what you need to know ≠ what you ask; "Nobody can predict their own behavior," so the worst market-research question is "How likely are you to adopt my product in the next six months?" — re-source the prompt to observed past behavior.)
- Reject valence-loaded words that presuppose a reaction: easy, simple, intuitive, love, annoying. (default)
- Reject yes/no prompts where "yes" confirms the hypothesis; prefer open "how/what/walk me through". (default)
- Reject double-barreled prompts asking two things at once. (default)

## Contract

Every research plan this skill produces must contain, in order:

| Field                   | Required answer                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision at stake       | What will change based on the learning?                                                                                                                     |
| Bet size                | Low, medium, or high risk/cost — with one line of justification.                                                                                            |
| Current belief          | What does the team think is true?                                                                                                                           |
| Unknowns                | Ranked list of what must be learned next.                                                                                                                   |
| Disconfirming evidence  | What would change the team's mind?                                                                                                                          |
| Method + why            | Smallest credible method from the matrix, and why a lighter one won't answer the question.                                                                  |
| Participants or proxies | Who qualifies, why they represent the target, remaining proxy limitations.                                                                                  |
| Script / instrument     | Linted prompts or the filled-in 3-user script above.                                                                                                        |
| Analysis plan           | How sessions become decisions: retro within 24h, disconfirmation check, synthesis into decisions/changes/risks.                                             |
| Stop conditions         | Research ends when the named decision can be made at the stated confidence, or disconfirming evidence forces a plan revision — not when a report is "done". |

## Policy

- Do not use research as validation theater. Hall: "validation" is a forbidden word — "all validation means is prove me right because we're launching next week." Start with what you need to know, not what you hope to prove; refuse to run a study structured to confirm a decision already made.
- Do not pick a method before the decision, bet size, and unknowns are named.
- Do not overbuild a research plan when three good sessions would answer the current design risk — and do not stop at three users for high-bet, hard-to-reverse decisions.
- Do not recruit poor-fit participants and treat their feedback as truth; do not recruit only happy users.
- Do not accept old research as automatically useful. Audit it against today's question first.
- Do not fight for "research" as a label when stakeholders care about risk, confidence, and better decisions.
- Do not fabricate quantitative thresholds (heuristic severity scores, SUS/SEQ benchmarks) — those instruments are unsourced; see **Provenance**.

## Provenance

- **[PRIMARY]** Sourced: Erika Hall decision-first model, bet-size rule, organizational-research-first, old-research audit, participant/proxy rules (`docs/research/youtube-library/analyses/2026-05-15_erika-hall_research-at-scale_analysis.md`); Krug rocket-surgery 3-user protocol, scenario/moderation rules, method catalog (`docs/research/youtube-library/analyses/2026-04-30_usability-research-canon_krug-hall_analysis.md`); Hall BayCHI "Even More Just Enough Research" — verbatim bet-size rule, "all business is making bets on human behavior," validation-as-forbidden-word, good/great/best question-quality ladder, "walk me through your last…" + worst-question example, two-data-types → method rule, and the surveys-chapter guardrail (`docs/research/youtube-library/analyses/2026-06-11_erika-hall_even-more-just-enough-research_analysis.md`).
- The bet-size → method matrix groups sourced methods by sourced rules; the matrix preamble and the future-hypothetical lint item are now Hall-primary (BayCHI). Remaining lint items marked (default) are internal-practice defaults, not verbatim canon.
- **Enrichment 2026-06-11:** added Hall BayCHI primary source — upgraded the bet-size matrix preamble and the future-hypothetical lint item from derived/(default) to Hall-primary; added the survey guardrail (answerable-truthfully-and-willingly test, no feature-ranking, large-N ≠ confidence) and the two-data-types → method cross-rule; re-sourced the stakeholder reframe to "all business is making bets on human behavior," strengthened the validation-theater guardrail with the forbidden-word quote, and added the good/great/best question-quality ladder to workflow step 3.
- **[internal-default] Named gaps (do not invent numbers for these):** NN/g heuristic evaluation severity scoring is not yet sourced; SUS/SEQ/PSSUQ quantitative thresholds and benchmarks (Sauro & Lewis) are not yet sourced. Both are queued acquisitions in the 2026-06-11 gap plan. Until sourced, recommend the instrument by name only and defer scoring.
