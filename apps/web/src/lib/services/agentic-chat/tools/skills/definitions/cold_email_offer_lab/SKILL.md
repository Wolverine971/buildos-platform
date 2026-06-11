---
name: Cold Email OfferLab
description: Child skill for designing or repairing the cold outreach offer before copy is written — separates the core offer from a front-end artifact, picks mode-appropriate artifacts, sizes the smallest useful yes against a T0-T3 trust ladder, and runs false-positive checks on the result.
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.offer_lab
    - cold_email_outreach.offer_creation
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_offer_lab/SKILL.md
---

# Cold Email OfferLab

Use this child skill when the offer is missing, meeting-first, too large for cold trust, or not artifact-shaped. The north star is qualified conversations started per unit of market trust consumed: the offer is the largest lever on both halves of that ratio.

## When to Use

- The user says "I want meetings" but has no front-end offer
- The current CTA is "worth a chat?"
- The campaign has low positive reply rate
- The user has an offer but no useful artifact
- The segment is new and needs offer hypotheses
- A meeting-first ask needs a permissibility ruling

## Workflow

1. Identify the mode (high-volume B2B, strategic B2B, tangible product, investor, recruiting, PR/podcast, customer research, founder-to-founder) and name the persona, moment, pain, and desired outcome.
2. Apply the six-test artifact filter from the Offer Design Rubric (below) to anything already on the table; use its rewrite patterns when the existing offer is meeting-first or feature-first.
3. Name the buyer's current alternative, workaround, or tradeoff.
4. Separate the core offer from the cold front-end artifact. The front-end offer is a no-commitment test drive of the core service, never the core service itself.
5. Generate 2-3 artifact hypotheses keyed to the mode using the Offer Artifact Library by Mode (below). Match the artifact to what is actually being sold (data product → snapshot; service → teardown; SaaS → 3 signals; advisory → note).
6. Using the Trust/Ask Ratio Rubric (below), assign the trust tier (T0-T3) and choose the smallest useful yes within that tier's ask ceiling. If a meeting ask is proposed, allow it only if it appears in the exception register.
7. Run the false-positive checks (below): production cost (>30 min per accepted reply disqualifies volume use), Mom Test evidence standard, Dunford buyer-choice check, Moesta struggling-moment check.
8. Add proof only if it is true, relevant, approved, and matched to the exact claim.
9. Return one recommended artifact offer and backup tests using the output contract.

## Offer Design Rubric

### Governing Source Cards

- April Dunford sales pitch structure: buyer choice, alternatives, differentiated value, proof.
- Bob Moesta demand-side sales: struggling moment, buyer progress, switching timeline.
- Rob Fitzpatrick / Mom Test: avoid compliments and hypotheticals; look for real behavior.
- Challenger Customer: support a Mobilizer with internally useful material.

### Artifact Test

A cold artifact is good when it passes all six:

| Test                  | Pass Standard                                                        |
| --------------------- | -------------------------------------------------------------------- |
| Buyer progress        | Helps the recipient make progress on a current struggle or decision. |
| Alternative-aware     | Names or implies the current workaround, incumbent, or tradeoff.     |
| Useful before meeting | Has standalone value even if the recipient never buys.               |
| Cheap to deliver      | Sender can produce it quickly after a reply.                         |
| Proof-matched         | Any proof supports the exact claim, not generic credibility.         |
| Smallest yes          | Recipient can say yes without committing to a meeting.               |

### Artifact Families

- Diagnostic: "I can send the 3 friction points I found."
- Tradeoff memo: "I can send the one-page comparison of [current path] vs [alternative]."
- Benchmark snapshot: "I can send the benchmark cut for teams at your stage."
- Signal report: "I can send the 5 accounts showing [trigger]."
- Internal enablement: "I can send the note your team could use to pressure-test this internally."
- Source packet: for PR/podcast, "I can send angles, data, and a short source packet."
- Research summary: "I can send the anonymized summary after the interviews."

### Rewrite Pattern

Meeting-first:

```text
Worth a chat next week?
```

Artifact-first:

```text
I pulled a short note on [specific tradeoff/current struggle].
Want me to send it?
```

Feature-first:

```text
We help teams automate [feature].
```

Progress-first:

```text
When teams hit [moment], [current workaround] usually breaks because [tradeoff].
I can send the 3-point check we use to spot that.
```

### Disqualifiers

- The artifact is just a pitch deck, Loom, calendar link, or brochure.
- The recipient must attend a meeting to get any value.
- The offer depends on unsupported ROI claims.
- The artifact would be expensive to personalize at the planned volume.
- The ask hides a sales pitch inside a research request.
- The offer cannot explain what alternative or current struggle it is helping with.

## Offer Artifact Library by Mode

This library supplies the candidates; the six-test rubric above filters them.

### Core Offer vs Front-End Artifact

The central distinction (Aaron Shepherd): "Nothing in a cold email strategy is more important than your offer." The front-end offer is a no-commitment **test drive** of the core service — never the core service itself.

| Core offer (too big for cold)                                   | Front-end offer (size of yes a stranger gives)                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| "Turn your experience into a client-generating book in 60 days" | "Free strategic book positioning audit — teardown of your existing messaging"                                           |
| "Done-for-you book that unlocks speaking gigs in 90 days"       | "Book topic validation — 15 min, validates your idea against your market" / "Seven-figure founder book-funnel teardown" |

Shape requirements (Shepherd): free or near-free · specific deliverable (audit/teardown/sample, not "let's chat") · custom to the recipient · opens the loop to the core offer.

Austin Schneider's hard line: "Booking a call is not valuable. Sending a Loom video is not valuable in 2026… solve the problem with an actual action." Examples: SEO agency → free Google Business Profile optimization; cold-email agency → 100 verified leads + sample sequence; branding agency → free positioning teardown.

### Artifact Library by Mode

Each row: artifact candidates + the smallest useful yes phrased as the CTA. (Sources: Aaron Shepherd, Austin Schneider, Challenger Customer, 30MPC, Florin Tatulea, Michael Seibel/YC, Gem/Greenhouse/RecruitingDaily, Sahil Bloom, Kai Davis, Muck Rack/PR News, Rob Fitzpatrick's Mom Test.)

| Mode                        | Artifacts                                                                                                                                                                                                                                       | Smallest useful yes                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High-volume B2B             | Diagnostic audit, benchmark cut, signal report ("the 5 accounts showing [trigger]"), verified-lead sample, teardown                                                                                                                             | "want me to send it?" / "would that be worth sharing more?"                                                                                                                              |
| Strategic B2B               | Mobilizer-forwardable: tradeoff memo, risk map, buying-committee question set, internal narrative draft, benchmark for their stage — equip the Mobilizer with "insight, tradeoff clarity, and internal-coaching material" (Challenger Customer) | "want the internal version?" / "worth sending the two-page note?"                                                                                                                        |
| Physical / tangible product | Sample                                                                                                                                                                                                                                          | "Can I send samples?" (Florin Tatulea's winning McDonald's-round CTA)                                                                                                                    |
| Investor                    | The email itself is the artifact: problem, solution, launch status, traction, market, team, contrarian insight; optional standard-format deck                                                                                                   | "Would it be worth sending the deck?" / "Does this fit what you like to see?" — Seibel: "Don't ask for a phone call or a meeting. Let me escalate things."                               |
| Recruiting                  | Role note with honest constraints (comp/level/location), hiring-manager context, "first 100 days" doc for candidates pitching themselves                                                                                                        | "open to seeing the role note?" — note RecruitingDaily's counterpoint that a 15-min call is an acceptable recruiting CTA; never "apply on the careers page," never a take-home first     |
| PR / podcast                | Source packet (data, quotes, visuals, expert availability), 2–3 concrete topic angles ("choice of yeses"), pre-vetted expert, local sourcing help                                                                                               | "want the angle list?" / "which topic fits your audience?" — "inspire a story rather than demand a transaction" (Muck Rack / PR News)                                                    |
| Customer research           | Anonymized findings summary, benchmark of peers, early access, honest counter-gift                                                                                                                                                              | "mind if I send 3 questions?" / interview ask with disclosed intent (Mom Test)                                                                                                           |
| Founder-to-founder          | Specific note/draft/gut-check on their thing; genuine advice request (small)                                                                                                                                                                    | "Want me to send the note?" / "Open to a quick gut check?" — "a genuine request for advice is a good way to create a connection" (Jackson); mock-up-of-the-service pattern (Sahil Bloom) |

### CTA Fits the Product

Match the artifact to what is actually being sold (Florin Tatulea):

| Selling      | Artifact  |
| ------------ | --------- |
| Data product | Snapshot  |
| Service      | Teardown  |
| SaaS         | 3 signals |
| Advisory     | Note      |

### Production-Cost Rule

(Shepherd; extends the rubric's "cheap to deliver" test.) If the artifact takes **>30 min per accepted reply** to produce, it cannot back a volume campaign — reserve it for strategic mode or pre-build a template.

### Mode Quarantine

Do not let mode-specific permissions leak: recruiting's 15-min-call allowance and PR's one-follow-up rule stay in their modes. Direct time asks are banned in investor and PR modes regardless of how strong the email is.

## Trust/Ask Ratio Rubric and False-Positive Checks

The governing metric is **qualified conversations started per unit of market trust consumed** — an oversized ask spends trust the campaign has not earned.

### Trust Ladder (T0–T3)

Internal calibration note: the trust-level ladder itself is an internal construction; the level behaviors are sourced as cited. Treat the ceilings as defaults to tune, not industry standards.

| Trust level                                   | Definition                                                                | Acceptable ask ceiling                                                                   | Source basis                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| T0 — true stranger, volume                    | No prior contact, no recognition                                          | Permission to send an artifact ("want it?") — nothing more. No calendar links, no Looms  | Schneider, Shepherd, Jackson                                                          |
| T1 — stranger w/ strong signal or recognition | Trigger-based relevance; or sender is recognizable from content/community | Artifact + optional soft fork; recruiting may offer 15-min call                          | Becc Holland trigger strength; Jackson "be recognizable" pre-warming; RecruitingDaily |
| T2 — engaged (replied, accepted artifact)     | They responded or consumed the artifact                                   | Two specific times for a short call; keep the artifact promise first                     | Reply-to-call frame (Reply OS)                                                        |
| T3 — strategic w/ earned research             | SMYKM-grade anchor on a high-value named target                           | Direct time ask is acceptable ("What does your availability look like later this week?") | Murray strategic bucket; McKenna executive mode                                       |

Rule of thumb: **the ask may never outrun the trust by more than one level**, and the artifact must be valuable _even if they never buy_ (the rubric's "useful before meeting" test).

### Meeting-Ask Exception Register

A meeting-first ask is acceptable only in these cases:

- **Murray-style enterprise outreach** where the sender genuinely owns the account relationship (T3).
- **Recruiting 15-min call** (RecruitingDaily counterpoint to artifact-only recruiting CTAs).

Never permissible:

- **Investors** — Seibel: "Don't ask for a phone call or a meeting. Let me escalate things."
- **PR / journalists** — Muck Rack: inspire a story, don't demand a transaction.
- **Customer research** — Mom Test: a meeting ask hides a pitch inside a research request.

### False-Positive Checks

Run these on every proposed offer before approving it:

- **Production cost** (Shepherd; rubric "cheap to deliver"): if the artifact takes >30 min per accepted reply to produce, it cannot back a volume campaign — reserve it for strategic mode or pre-build a template.
- **False-positive avoidance** (Rob Fitzpatrick, The Mom Test): collect evidence from past behavior, current spend, current workaround, urgency — never "would you use this?" in a first email; compliments are not validation.
- **Buyer-choice check** (April Dunford): "What buyer choice does this email help clarify?" If the artifact doesn't name or imply the current alternative, it's a brochure.
- **Struggling-moment check** (Bob Moesta): frame artifacts as help making progress at a named moment; "context creates value and contrast creates meaning."

## Output Contract

- Mode
- Core offer
- Pain hypothesis
- Artifact offer (the recommended front-end artifact)
- Why the artifact is useful before a meeting
- Current alternative or tradeoff
- Trust tier (T0-T3) and the chosen smallest useful yes
- False-positive check results (production cost, Mom Test, buyer-choice, struggling-moment)
- Production cost and delivery path
- Proof slot
- Follow-up path after reply
- Test metric

## Guardrails

- Do not accept a meeting as the offer by default; a meeting-first ask is permitted only when it appears in the meeting-ask exception register (owned enterprise relationship at T3; recruiting 15-min call).
- The offer must be artifact-shaped: a specific deliverable (audit, teardown, sample, note, benchmark, angle list), not "let's chat."
- Do not let the ask outrun the trust tier by more than one level.
- Do not use a Loom, deck, or calendar link as the cold value unless the mode specifically supports it.
- Do not create artifacts the sender cannot deliver, or artifacts costing >30 min per accepted reply in a volume campaign.
- Do not use unsupported ROI or outcome claims.
- Do not hide a sales pitch inside a research ask (Mom Test).
- Do not offer a feature walkthrough when the buyer needs help making a choice (Dunford).
- Do not let mode permissions leak across modes: no direct time asks in investor or PR modes; recruiting benchmarks and allowances stay in recruiting.
- Do not import list-email or opt-in newsletter tactics as cold-email offer advice.

## Notes

- All reference content is folded inline: the Offer Design Rubric (six-test filter, families, rewrites), the Offer Artifact Library by Mode (mode-keyed artifacts, core-vs-front-end), and the Trust/Ask Ratio Rubric (T0-T3 ladder, exception register, false-positive checks) fire on every offer construction, so they live in this shell rather than in reference modules.
- Primary sources: Aaron Shepherd (front-end offer), Austin Schneider (deliverable-not-a-meeting), April Dunford (buyer choice), Bob Moesta (struggling moment), Rob Fitzpatrick's Mom Test (false positives), Challenger Customer (Mobilizer material), Michael Seibel/YC (investor mode), Kai Davis and Muck Rack (PR/podcast mode).
- Maintainers: enrichment lineage lives at `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` (not available at runtime).
