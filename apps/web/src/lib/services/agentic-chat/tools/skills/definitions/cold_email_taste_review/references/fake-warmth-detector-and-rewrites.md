---
doc_type: skill-reference
skill: cold_email_taste_review
reference: fake-warmth-detector-and-rewrites
visibility: internal
publish: false
created: 2026-06-10
purpose: Fake-warmth pattern list, subject/preview rejection rules, five bad-to-good rewrite pairs, and expanded mode-dignity checks for explaining and fixing failed taste dimensions.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_taste_review/references/fake-warmth-detector-and-rewrites.md
---

# Fake-Warmth Detector and Rewrite Patterns

Load this when a draft fails scorecard dimensions 1 (two-people test), 2 (bridge integrity), 7 (voice), or 8 (mode dignity), or when the user asks "why is this bad." This module names the failure patterns and shows the move that fixes each one. Fake warmth is an auto-fail, not a style note — manufactured familiarity is a dishonest frame.

## Fake-Warmth Detector (named patterns to flag)

| Pattern                         | Example                                                                      | Why it fails                                                                                                               | Source                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Robot greeting                  | "I hope this email finds you well" / "Hope all is well"                      | Automation register; signals no human attention                                                                            | Justin Jackson (received it ×5 in one inbox sweep); Greenhouse: "doesn't sound sincere"; Lavender 101 cliché list           |
| Unanchored flattery             | "Loved your post" with no named post or point                                | Research theater — claims attention it cannot prove                                                                        | McKenna weak-vs-strong research table (`source-analyses/sam-mckenna-show-me-you-know-me-ai-era.md`)                         |
| Manufactured kinship            | "Fellow [anything]" / "saw we're both dog dads"                              | Personal detail with no business consequence; the LinkedIn-guru failure camp                                               | Connor Murray (`source-analyses/connor-murray-cold-email-assumptive-cadence.md`)                                            |
| Word-match without semantic fit | Anchoring on "training" when the post was about Turkish military service     | Keyword scraping posing as understanding — worse than no personalization                                                   | McKenna's "training" example                                                                                                |
| Guilt nudge                     | "Just checking in" / "just nudging" / "bumping this" / "probably bad timing" | Spends trust to relieve the sender's anxiety; gives the recipient nothing                                                  | Aaron Shepherd follow-up don'ts (`source-analyses/aaron-shepherd-volume-front-end-offer.md`); Black Swan taste implications |
| Compliment → pivot-to-pitch     | Praise paragraph, then "anyway, we sell…"                                    | Ulterior-motive pattern. Jackson: "the worst thing you could do is think: first I'll ask for advice, then ask them to buy" | Justin Jackson                                                                                                              |

Detection rule: if warmth would survive a mail-merge — same sentence, different recipient — it is fake. That is the two-people test applied to tone.

## Subject/Preview Rejection Rules

Taste review owns the _rejection_ list (the compiler owns construction). All numbers below are Lavender data (231,818-email dataset, sample stated, selection bias not characterized — **directional-vendor**; treat as ranked warnings, not governing thresholds).

Reject in sales modes:

- Questions in the subject (−56% opens), numbers (−46%), "?"/"!" punctuation (−36%).
- Title case throughout (no title case correlated −30% — write like a colleague, not a campaign).
- Recipient first name in the subject (−12% replies in sales mode).
- Padding 2 words to 4 (−17.5% replies). Target 1–3 words.
- Clichés: "Quick Question," "Thoughts?," "15 minutes?".
- Auto-fail territory (scorecard): fake "Re:"/"Fwd:" on a first touch.

Mode quarantine — do not cross-apply: in **recruiting mode**, candidate first name in the subject showed +16% opens in RecruitingDaily's 50k-candidate dataset (methodology not stated; practitioner pattern). Recruiting subject norms must not leak into sales-mode reviews, and vice versa.

## Bad → Good Rewrite Pairs (the five core moves)

Each pair names the move. When a dimension fails, prescribe the matching move — not generic "tighten this."

### 1. Meeting-first → artifact-first (fixes dimension 5)

- **Bad:** "Worth a chat next week?"
- **Good:** "I pulled a short note on [specific tradeoff]. Want me to send it?"
- The root rewrite pattern: replace the time ask with the smallest useful yes (see `cold_email_offer_lab` rubric).

### 2. Feature-first → progress-first (fixes dimensions 3 and 5)

- **Bad:** "We help teams automate [feature]."
- **Good:** "When teams hit [moment], [workaround] usually breaks because [tradeoff]. I can send the 3-point check we use to spot that."
- Source: Dunford/Moesta — open on the buyer's struggling moment, not the sender's capability.

### 3. Decorative hook → causal bridge (fixes dimensions 1 and 2)

- **Bad:** "Saw you like Rush. We sell sales training."
- **Good:** "Saw your interview where you described sales onboarding as 'getting the whole band in time.' That's why I'm writing: we found two onboarding gaps that show up when teams scale past 20 reps."
- The bridge test: remove the hook — if the email still works, the hook was decoration.

### 4. Passive → assumptive (fixes dimension 7)

- **Bad:** "I was hoping to set up some time…" / "If you're interested…"
- **Good:** "I'm looking to set some time…" / "Do either of these dates work for you?"
- Source: Murray's assumptive-language table. Note the trust gate: assumptive time asks belong at earned-trust levels (strategic accounts), not first-touch volume.

### 5. Guilt follow-up → numbered fork (fixes dimension 7 and auto-fail 3)

- **Bad:** "Just nudging you — probably bad timing."
- **Good:** the numbered fork with a dignified close-loop option, e.g.: "Quick one — reply with a number: 1) send the note, 2) wrong timing, circle back next quarter, 3) not relevant, I'll close the loop."
- Source: Shepherd (never guilt) + Steli Efti (low-friction forks; a clean no beats silence). Full fork library lives in `cold_email_reply_os`.

## Mode-Dignity Checks (expanded)

Dimension 8, one check set per mode. A draft can pass dimensions 1–7 and still fail here.

**PR / podcast** (Muck Rack guide + checklist):

- The pitch must serve the _recipient's audience_, not the sender. "Don't try to dazzle them, give it to them straight."
- Offer concrete topic angles or a source packet — inspire a story, don't demand a transaction.
- Fail: a product pitch wearing a story costume; relevance to the outlet asserted but not shown.

**Recruiting** (Gem, Greenhouse, RecruitingDaily):

- Candidate-centered: why _this person_, with honest constraints (comp band, level, location) stated, not hidden until the call.
- Fail: bait-and-switch role framing; "apply on the careers page" as the CTA; flattery that could be sent to any profile with the same job title.

**Customer research** (Mom Test):

- Disclose research intent. A research ask hiding a pitch is auto-fail 2, not a revise.
- Ask about their past behavior and current workarounds, not approval of the sender's idea. Compliments earned in the reply are weak evidence, not validation.

**Investor** (Seibel / YC):

- Factual and non-hype: problem, solution, launch status, traction, market, team. Numbers a diligence pass would confirm.
- No meeting-first ask — "Don't ask for a phone call or a meeting. Let me escalate things."
- Fail: superlatives in place of traction; "revolutionary"; pressure framing ("round closing fast") on a first touch.
