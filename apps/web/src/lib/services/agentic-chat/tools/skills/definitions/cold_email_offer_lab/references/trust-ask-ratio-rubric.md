---
doc_type: skill-reference
skill: cold_email_offer_lab
reference: trust-ask-ratio-rubric
visibility: internal
publish: false
created: 2026-06-10
purpose: T0-T3 trust/ask ratio ladder with ask ceilings, the meeting-ask exception register, and false-positive checks for validating a proposed offer before copy is written.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_offer_lab/references/trust-ask-ratio-rubric.md
---

# Trust/Ask Ratio Rubric

Load this when sizing the smallest useful yes (workflow step 6) or judging whether a meeting ask is permissible. The governing metric is **qualified conversations started per unit of market trust consumed** — an oversized ask spends trust the campaign has not earned.

## Trust Ladder (T0–T3)

Internal calibration note: the trust-level ladder itself is an internal construction; the level behaviors are sourced as cited. Treat the ceilings as defaults to tune, not industry standards.

| Trust level                                   | Definition                                                                | Acceptable ask ceiling                                                                   | Source basis                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| T0 — true stranger, volume                    | No prior contact, no recognition                                          | Permission to send an artifact ("want it?") — nothing more. No calendar links, no Looms  | Schneider, Shepherd, Jackson                                                          |
| T1 — stranger w/ strong signal or recognition | Trigger-based relevance; or sender is recognizable from content/community | Artifact + optional soft fork; recruiting may offer 15-min call                          | Becc Holland trigger strength; Jackson "be recognizable" pre-warming; RecruitingDaily |
| T2 — engaged (replied, accepted artifact)     | They responded or consumed the artifact                                   | Two specific times for a short call; keep the artifact promise first                     | Reply-to-call frame (Reply OS)                                                        |
| T3 — strategic w/ earned research             | SMYKM-grade anchor on a high-value named target                           | Direct time ask is acceptable ("What does your availability look like later this week?") | Murray strategic bucket; McKenna executive mode                                       |

Rule of thumb: **the ask may never outrun the trust by more than one level**, and the artifact must be valuable _even if they never buy_ (the rubric's "useful before meeting" test).

## Meeting-Ask Exception Register

A meeting-first ask is acceptable only in these cases:

- **Murray-style enterprise outreach** where the sender genuinely owns the account relationship (T3).
- **Recruiting 15-min call** (RecruitingDaily counterpoint to artifact-only recruiting CTAs).

Never permissible:

- **Investors** — Seibel: "Don't ask for a phone call or a meeting. Let me escalate things."
- **PR / journalists** — Muck Rack: inspire a story, don't demand a transaction.
- **Customer research** — Mom Test: a meeting ask hides a pitch inside a research request.

## False-Positive Checks

Run these on every proposed offer before approving it:

- **Production cost** (Shepherd; rubric "cheap to deliver"): if the artifact takes >30 min per accepted reply to produce, it cannot back a volume campaign — reserve it for strategic mode or pre-build a template.
- **False-positive avoidance** (Rob Fitzpatrick, The Mom Test): collect evidence from past behavior, current spend, current workaround, urgency — never "would you use this?" in a first email; compliments are not validation.
- **Buyer-choice check** (April Dunford): "What buyer choice does this email help clarify?" If the artifact doesn't name or imply the current alternative, it's a brochure.
- **Struggling-moment check** (Bob Moesta): frame artifacts as help making progress at a named moment; "context creates value and contrast creates meaning."
