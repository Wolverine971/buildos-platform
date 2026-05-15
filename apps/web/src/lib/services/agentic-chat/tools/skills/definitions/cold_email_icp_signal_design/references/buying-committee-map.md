---
doc_type: skill-reference
skill: cold_email_icp_signal_design
reference: buying-committee-map
visibility: internal
publish: false
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/references/buying-committee-map.md
---

# Buying Committee Map

Use when a segment is being approved for B2B outreach, when the agent must choose who to write first, or when a reply has come in and the next action depends on the responder's role.

A modern B2B buying committee has 5-16 people across up to 4 functions, with 6-10 typical. Cold outreach to a single named contact is gambling. The skill returns a committee map for every B2B segment.

Sources: 30 Minutes to President's Club, Brent Adamson (_Challenger Customer_), John McMahon (MEDDIC originator), Gartner B2B Buying Journey research.

## Reference Numbers (Gartner)

- 5-16 stakeholders per typical B2B purchase, 6.8 median.
- Each member brings 4-5 independent pieces of research.
- 74% of buyer teams show unhealthy conflict during the decision process (2025 update).
- 61% of buyers prefer a rep-free experience (2025 update).
- Buyers spend only 17% of journey in vendor conversation.

Implication: the seller's job is enabling consensus across the committee, not convincing one person. The cold email is one input the committee will reference long after the email is sent.

## Role Taxonomy

Every B2B segment definition includes the expected role map below. Roles are not titles - they are functions inside the committee.

### Champion (per John McMahon's stricter MEDDIC bar)

A real champion has all three:

1. Power — can move budget and people inside the org.
2. Personal win — a tangible career or operational gain from your deal closing.
3. Will fight for you when you are not in the room.

Anyone missing all three is a coach or a contact. Coaches share information. Champions move deals. Misclassifying a coach as a champion is the most common reason "engaged" cold prospects do not close.

### Economic Buyer

The only person who can create or reallocate budget. Typically more senior than the champion. Cold outreach to the economic buyer requires a business-case framing, not a personal-win framing.

### User

The person who will live with the product day-to-day. Often the loudest voice on requirements and the strongest blocker if not consulted. Frequently distinct from the champion.

### Blocker

Anyone whose interest opposes the change. Long-tenured incumbent loyalist, the procurement gatekeeper, the security lead, the legal counsel. Detect early. Name them in the buyer-benefit framing as part of the failure mode.

### Mobilizer / Talker / Blocker (Brent Adamson cut)

Cross-reference the role taxonomy with Adamson's behavioral cut:

| Archetype | Behavior                                                                     | Outreach implication                                                                                     |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Mobilizer | Drives change. Has a problem they want solved and political will.            | The ideal first cold-outreach target. New-in-role buyers are statistically more likely to be Mobilizers. |
| Talker    | Friendly, engages, but does not drive change. Often mistaken for a champion. | The seductive trap. Test: ask them to do something inside their org. If they cannot, they are a Talker.  |
| Blocker   | Actively resists change.                                                     | Name as the failure mode in buyer-benefit framing. Do not pretend they are not there.                    |

## Golden Path (30MPC)

The optimal sequence of stakeholder conversations from cold start to close.

### Top-Down

Start at the executive level, request introductions to department leads, then circle back with recommendations.

Use when:

- Strategic / single-target outreach.
- Founder-led outreach.
- PR / podcast pitches (the host is the executive).
- Investor outreach.
- Recruiting senior hires.

Risks: executive ghosts. Need a strong anchor and a Mafia-Offer-quality reason.

### Bottom-Up

Win the champion first, move horizontally to department leads, then drive upward to power with their consensus backing.

Use when:

- Volume B2B SaaS.
- Most cold-email-initiated motions.
- Categories where the user-level pain is most acute.

Risks: champion lacks power. McMahon's three-test gate filters out non-champions before investing further.

## Buyer-Benefit Framing for Loop-Ins

The 30MPC pattern for asking a champion to bring in a senior stakeholder:

1. Reflect their stake: "It sounds like you really care about getting this right."
2. Name the failure mode: "When [decision category] decisions skip [stakeholder role], they typically blow up because [reason]."
3. Ask for the loop-in as risk reduction: "Could we pull [stakeholder] into the next call and work on this together?"

For cold email, the same pattern operates in the _first_ message. Name the failure mode of single-stakeholder buying for the prospect's category; ask for the loop-in as the next step instead of "a meeting."

## Committee Map Output Contract

Every segment definition returns:

```yaml
buying_committee:
    expected_size: integer (5-16)
    primary_function_count: integer (1-4)
    roles:
        - role: champion
          typical_title: string
          typical_seniority: string
          mcmahon_test_required: true | false
        - role: economic_buyer
          typical_title: string
          typical_seniority: string
        - role: user
          typical_title: string
        - role: blocker
          typical_function: procurement | security | legal | finance | incumbent | other
          framing: how this blocker will be named in buyer-benefit framing
    golden_path: top_down | bottom_up
    first_outreach_target: role (champion | economic_buyer | user)
    rationale: short justification
```

## Failure Modes

Reject the segment or downgrade the campaign if:

- **No champion test possible.** If the segment has no recognizable champion role with power + personal win + willingness to fight, the bottom-up Golden Path collapses. Switch to top-down or disqualify.
- **Committee size unknown.** If the agent cannot estimate committee size from segment data, the campaign is unscoped. Use a research-mode message before a buying-mode message.
- **Single-contact campaign in B2B.** If the campaign plan targets only one role per account in a B2B segment, default to recommending at least two backup contacts per account. Cite Gartner's 6.8-buyer / 74%-conflict data as the rationale.
- **Coach mistaken for champion.** If reply data shows a "warm" responder who fails the three-test bar, route the next outreach to a different power contact rather than treating the coach as the champion.
- **No Mobilizer signal.** If the segment has no new-in-role tag or other Mobilizer-creation signal, the cold start is harder. Consider waiting for a Mobilizer to enter the account rather than forcing a campaign.

## Mode-Specific Adjustments

The committee map varies by outreach mode:

| Mode                 | Typical committee shape                 | First outreach target                     |
| -------------------- | --------------------------------------- | ----------------------------------------- |
| High-volume B2B SaaS | 6-10 across 2-3 functions               | Champion / user (Bottom-Up)               |
| Strategic enterprise | 10-16 across 3-4 functions              | Executive / economic buyer (Top-Down)     |
| Founder-to-founder   | 1-3 (the founder + COO if there is one) | The founder (Top-Down, no intermediaries) |
| Investor (cold)      | 1-3 (partner + supporting check-writer) | The partner directly                      |
| Recruiting           | 1 (the candidate)                       | The candidate                             |
| PR / podcast         | 1-2 (host + producer)                   | The host                                  |
| Partnership          | 3-5 (partnerships lead + product + GTM) | Partnerships lead                         |
| Customer research    | 1 (the participant)                     | The participant                           |

For non-B2B-SaaS modes, the committee map collapses but the Champion test (power + personal win + willingness to fight) still applies wherever there is more than one stakeholder.
