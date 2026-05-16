---
doc_type: skill-reference
skill: cold-email-engagement-first-outreach
reference: deliverability-provider-requirement-matrix
visibility: internal
publish: false
created: 2026-05-16
source_snapshot: 2026-05-15
purpose: Tactical provider, sender, and compliance matrix for cold email deliverability readiness.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/deliverability-provider-requirement-matrix.md
---

# Deliverability Provider Requirement Matrix

Use this when volume, cold domains, sender trust, or compliance boundaries matter. Recheck official provider/regulator sources before operational send recommendations because requirements change.

## Source Cards

- Google sender guidelines: `source-materials/cleaned/web/google-email-sender-guidelines.md`
- Google sender FAQ: `source-materials/cleaned/web/google-email-sender-guidelines-faq.md`
- Yahoo best practices: `source-materials/cleaned/web/yahoo-sender-best-practices.md`
- Yahoo FAQ: `source-materials/cleaned/web/yahoo-sender-faq.md`
- Microsoft Outlook Postmaster: `source-materials/cleaned/web/microsoft-outlook-postmaster.md`
- Postmark deliverability guide hub: `source-materials/cleaned/web/postmark-deliverability-guides.md`
- FTC CAN-SPAM: `source-materials/cleaned/web/ftc-can-spam-guide.md`
- ICO PECR electronic mail: `source-materials/cleaned/web/ico-pecr-electronic-mail-marketing.md`
- CRTC CASL FAQ: `source-materials/cleaned/web/crtc-casl-faq.md`

## Provider Matrix

| Area                  | Google/Gmail                                                                                | Yahoo                                                                             | Microsoft Outlook                                                                      | Cold Email Decision                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Bulk threshold        | 5,000+ messages/day to personal Gmail from same primary domain triggers bulk-sender status. | Treat high volume as needing authentication, reputation, and unsubscribe hygiene. | 5,000+ messages/day to Outlook.com domains triggers stricter requirements.             | If near 5,000/day to any major mailbox provider, run full bulk-sender readiness before scale.              |
| SPF                   | Required for bulk senders.                                                                  | Required/best practice.                                                           | Required for high-volume senders.                                                      | Block scale until SPF passes for every sending domain/provider.                                            |
| DKIM                  | Required for bulk senders.                                                                  | Required/best practice.                                                           | Required for high-volume senders.                                                      | Block scale until DKIM signs correctly.                                                                    |
| DMARC                 | Required for bulk senders with at least `p=none`; From alignment matters.                   | Required/best practice.                                                           | Required for high-volume senders.                                                      | Block scale until DMARC exists and aligns with sender identity.                                            |
| Forward/reverse DNS   | Google requires valid PTR and matching forward DNS for sending IPs.                         | Sender infrastructure should identify sending sources clearly.                    | Sender reputation depends on clean authenticated infrastructure.                       | For shared ESPs, verify provider handles this. For owned infrastructure, block until DNS is correct.       |
| TLS                   | Google requires TLS for bulk senders.                                                       | Use modern authenticated mail infrastructure.                                     | Use compliant authenticated mail infrastructure.                                       | Block if sender cannot confirm TLS support through ESP/MTA.                                                |
| RFC/header accuracy   | Google flags malformed or deceptive headers/content.                                        | Sender identity and message authenticity matter.                                  | Authentication and non-deceptive identity matter.                                      | Reject deceptive From, Re:, Fwd:, hidden content, spoofed identity, or unclear sender.                     |
| One-click unsubscribe | Required for marketing/promotional bulk mail and must be honored quickly.                   | Required/recommended for bulk and commercial senders.                             | High-volume senders should support compliant unsubscribe practices.                    | For scaled cold campaigns, include unsubscribe handling and suppression workflow.                          |
| Complaint rate        | Google says keep user-reported rate below 0.1% and avoid 0.3% or higher.                    | Complaints affect reputation and delivery.                                        | Reputation/complaints affect junking and blocking.                                     | Stop or narrow if complaints rise. Do not increase volume to compensate.                                   |
| Monitoring            | Google Postmaster Tools for compliance/reputation.                                          | Yahoo sender guidance and complaint/reputation monitoring where available.        | Outlook Postmaster/SNDS context where relevant, but do not overfit portal admin pages. | Track bounces, complaints, positive replies, bad-fit replies, unsubscribes, and mailbox-provider symptoms. |

## Compliance Boundary Matrix

| Region/Source               | Baseline Requirements                                                                                                                       | Cold Email Decision                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| FTC CAN-SPAM, United States | Accurate header/from info, non-deceptive subject, clear sender identity, physical postal address, clear opt-out, timely opt-out processing. | No deceptive packaging. Include required identity/opt-out mechanics for commercial email.                       |
| ICO PECR, UK                | Electronic mail marketing rules distinguish consent, soft opt-in, corporate subscribers, and individual subscribers.                        | If UK/EU recipients are involved and consent basis is unclear, route to legal/compliance review or manual-only. |
| CRTC CASL, Canada           | Consent, identification, and unsubscribe requirements apply; rules are stricter than U.S. CAN-SPAM.                                         | If Canadian recipients are involved and consent basis is unclear, block scale until reviewed.                   |

## Pass / Block / Manual-Only

Pass for scaled sending only when:

- SPF, DKIM, and DMARC are verified for every sending domain.
- Sender identity is real, accurate, and not deceptive.
- Unsubscribe and suppression handling exists.
- Bounce/complaint monitoring exists.
- List source, region, and consent posture are known.
- Segment is narrow enough to justify the outreach.

Blocked until fixed:

- Missing SPF, DKIM, or DMARC.
- Spoofed, shared, or unclear sender identity.
- No opt-out/suppression path for commercial volume.
- Unknown recipient geography for risky jurisdictions.
- High complaint rate, unexplained bounce spike, or obvious bad-fit list.
- User wants to solve low replies by increasing volume.

Manual-only:

- One-off strategic/investor/relationship email where sender health is not fully documented but volume is negligible.
- High-risk legal jurisdiction where the value of outreach is high but consent basis needs review.
- New domain or inbox where the sender is not ready for automation.

## Tactical Defaults

- Start volume conservatively: around 30 emails/inbox/day, max 50 without evidence.
- Keep roughly 5 inboxes/domain and about 250 emails/domain/day as a cautious operational ceiling unless the deliverability child skill has stronger internal data.
- Use official provider thresholds as hard gates; use cold-email vendor volume numbers only as directional heuristics.
- If provider rules conflict with growth tactics, provider rules win.

## What Not To Do

- Do not use testing-tool scores as proof that a campaign deserves to send.
- Do not treat authentication as permission to send irrelevant email.
- Do not use hidden HTML, deceptive subject prefixes, spoofing, or fake personal context.
- Do not keep sending to learn after complaints or opt-outs signal trust loss.
