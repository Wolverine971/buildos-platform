---
name: Cold Email Deliverability Readiness
description: Child skill for checking sender trust, cold-domain readiness, inbox caps, warmup, bounce risk, and complaint safeguards before scaled cold outreach.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.deliverability
    - cold_email_outreach.sender_readiness
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_deliverability_readiness/SKILL.md
---

# Cold Email Deliverability Readiness

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: procedure, so Procedure carries the weight; Activation, Contract, and Policy
  round it out. No siblings are routed to, so there is no Routing block. The provider/compliance gate
  matrix lives inline under Knowledge: the readiness decision is this skill's whole job, so every standard
  use needed it — it was folded in from the former references/provider-requirement-matrix.md (2026-08-13).
-->

## Identity

Sender-trust and deliverability gate run before scaled cold outreach. This is a **procedure** skill at **task**
altitude, operating as a child of `cold_email_engagement_first_outreach`. Use this child skill when scaled
sending, cold domains, inbox health, or low opens matter. It checks sender trust, cold-domain readiness, inbox
caps, warmup, bounce risk, and complaint safeguards, then returns a pass / blocked / manual-only readiness
decision with the required fixes before scale.

## Activation

- The user wants to send at volume
- Sending domains or inboxes are new
- SPF/DKIM/DMARC, warmup, complaints, bounces, spam placement, or server-level rejections are unknown (as of Nov 2025 Google rejects non-compliant bulk mail outright; Microsoft rejects unauthenticated 5k+/day senders with `550 5.7.515`)
- Open rate dropped or replies disappeared
- The campaign may exceed manual one-off sending

## Procedure

1. Identify sender identity, domains, inboxes, and planned volume.
2. Apply the Provider Requirement Matrix (Knowledge block below) when making a scaled-send readiness decision.
3. Check SPF, DKIM, DMARC, sender identity, unsubscribe/suppression, warmup, bounce risk, complaint history, recipient geography, and consent posture.
4. Apply conservative caps: about 30 emails per inbox per day to start, 50 max without evidence, 5 inboxes per domain, about 250 per domain per day.
5. Decide status: pass, blocked, or manual-only.
6. Return required fixes before scale.

## Contract

- Status
- Domain/inbox inventory
- Daily cap
- Warmup status
- Complaint/bounce risk
- Missing checks
- Required fixes
- Manual-only recommendation if needed

## Policy

- Do not recommend volume sending without verified sender health.
- Do not increase volume to fix low replies.
- Do not ignore complaints or bounce warnings.
- Do not use deliverability as a substitute for relevance.

## Knowledge

**Provider Requirement Matrix.** Use this when volume, cold domains, sender trust, or compliance boundaries matter. Recheck official provider/regulator sources before operational send recommendations because requirements change. Provider data below is a source snapshot dated 2026-06-10.

### Provider Matrix

| Area                  | Google/Gmail                                                                                                                                                        | Yahoo                                                                                                                  | Microsoft Outlook                                                                                                                               | Cold Email Decision                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk threshold        | 5,000+ messages/day to personal Gmail from same primary domain triggers bulk-sender status.                                                                         | Treat high volume as needing authentication, reputation, and unsubscribe hygiene.                                      | 5,000+ messages/day to Outlook.com domains triggers SPF/DKIM/DMARC enforcement.                                                                 | If near 5,000/day to any major mailbox provider, run full bulk-sender readiness before scale.                                                                                                            |
| Enforcement mode      | As of Nov 2025, Google rejects non-compliant bulk mail at the SMTP server level (not just spam-foldering). Postmaster Tools v2 reports binary Pass/Fail compliance. | Expect rejection-style enforcement to follow the Google/Microsoft direction; verify current Yahoo policy before scale. | As of 2025, Microsoft rejects unauthenticated senders at 5,000+/day with error `550 5.7.515` (Junk-foldering began 2025-05-05, then rejection). | Treat authentication/compliance failure as a hard send block — mail is rejected at the server, not merely junked. In 2026, low opens are more likely a compliance/placement failure than a copy failure. |
| SPF                   | Required for bulk senders.                                                                                                                                          | Required/best practice.                                                                                                | Required for high-volume senders.                                                                                                               | Block scale until SPF passes for every sending domain/provider.                                                                                                                                          |
| DKIM                  | Required for bulk senders.                                                                                                                                          | Required/best practice.                                                                                                | Required for high-volume senders.                                                                                                               | Block scale until DKIM signs correctly.                                                                                                                                                                  |
| DMARC                 | Required for bulk senders with at least `p=none`; From alignment matters.                                                                                           | Required/best practice.                                                                                                | Required for senders at 5,000+/day; failures rejected with `550 5.7.515` (as of 2025).                                                          | Block scale until DMARC exists and aligns with sender identity.                                                                                                                                          |
| Forward/reverse DNS   | Google requires valid PTR and matching forward DNS for sending IPs.                                                                                                 | Sender infrastructure should identify sending sources clearly.                                                         | Sender reputation depends on clean authenticated infrastructure.                                                                                | For shared ESPs, verify provider handles this. For owned infrastructure, block until DNS is correct.                                                                                                     |
| TLS                   | Google requires TLS for bulk senders.                                                                                                                               | Use modern authenticated mail infrastructure.                                                                          | Use compliant authenticated mail infrastructure.                                                                                                | Block if sender cannot confirm TLS support through ESP/MTA.                                                                                                                                              |
| Header accuracy       | Google flags malformed or deceptive headers/content.                                                                                                                | Sender identity and message authenticity matter.                                                                       | Authentication and non-deceptive identity matter.                                                                                               | Reject deceptive From, Re:, Fwd:, hidden content, spoofed identity, or unclear sender.                                                                                                                   |
| One-click unsubscribe | Required for marketing/promotional bulk mail and must be honored quickly.                                                                                           | Required/recommended for bulk and commercial senders.                                                                  | High-volume senders should support compliant unsubscribe practices.                                                                             | For scaled cold campaigns, include unsubscribe handling and suppression workflow.                                                                                                                        |
| Complaint rate        | Google says keep user-reported rate below 0.1% and avoid 0.3% or higher.                                                                                            | Complaints affect reputation and delivery.                                                                             | Reputation/complaints affect junking and blocking.                                                                                              | Stop or narrow if complaints rise. Do not increase volume to compensate.                                                                                                                                 |

### Compliance Boundary Matrix

| Region/Source               | Baseline Requirements                                                                                                                       | Cold Email Decision                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| FTC CAN-SPAM, United States | Accurate header/from info, non-deceptive subject, clear sender identity, physical postal address, clear opt-out, timely opt-out processing. | No deceptive packaging. Include required identity/opt-out mechanics for commercial email.                       |
| ICO PECR, UK                | Electronic mail marketing rules distinguish consent, soft opt-in, corporate subscribers, and individual subscribers.                        | If UK/EU recipients are involved and consent basis is unclear, route to legal/compliance review or manual-only. |
| CRTC CASL, Canada           | Consent, identification, and unsubscribe requirements apply; rules are stricter than U.S. CAN-SPAM.                                         | If Canadian recipients are involved and consent basis is unclear, block scale until reviewed.                   |

### Pass / Block / Manual-Only

Pass for scaled sending only when SPF, DKIM, DMARC, sender identity, unsubscribe/suppression, bounce/complaint monitoring, list source, recipient geography, and consent posture are known.

Block scale for missing authentication, spoofed or unclear identity, no opt-out/suppression path, unknown risky geography, complaint/bounce spikes, or attempts to fix low replies by increasing volume. As of Nov 2025 (Google server-level rejection) and 2025 (Microsoft `550 5.7.515`), missing authentication means rejection at the server, not spam-folder placement — there is no partial-delivery middle ground at volume.

Manual-only is acceptable for one-off strategic, investor, or relationship emails where volume is negligible and the sender is real.
