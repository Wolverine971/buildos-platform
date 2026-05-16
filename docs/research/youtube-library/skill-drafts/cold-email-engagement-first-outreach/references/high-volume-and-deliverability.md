---
doc_type: skill-reference
skill: cold-email-engagement-first-outreach
reference: high-volume-and-deliverability
purpose: Deep guidance for high-volume cold email, deliverability, offer tests, list hygiene, and back-end qualification.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/high-volume-and-deliverability.md
---

# High-Volume and Deliverability

Read this when the user is launching a large cold campaign, testing offers at scale, diagnosing deliverability, or asking how much infrastructure is needed.

## Governing Sources

- Austin Schneider / Instantly: engagement-first infrastructure and 2-touch volume cadence.
- Aaron Shepherd / GrowthFlare: volume-as-data, front-end offers, casual scripts, back-end qualification.
- Mitchell Keller: infrastructure redundancy, offer testing, list hygiene, speed-to-reply.
- Provider requirement matrix: official Google/Yahoo/Microsoft plus FTC/ICO/CRTC readiness gates.

When making pass / blocked / manual-only decisions, read `references/deliverability-provider-requirement-matrix.md`.

## High-Volume Operating Model

High-volume outreach is not "spray and pray." It is instrumented market testing:

1. Build enough sending capacity to avoid sender damage.
2. Segment to one persona x one signal.
3. Test one offer variable at a time.
4. Use a front-end artifact, not a meeting ask.
5. Stop after two touches.
6. Recycle non-responders into a new angle.
7. Filter quality after replies with forms and fast routing.

## Infrastructure Checklist

Minimum floor:

- SPF, DKIM, DMARC configured.
- Sender identity accurate and non-deceptive.
- Unsubscribe/suppression path for commercial volume.
- Spam complaints under 0.1%.
- Recipient geography and consent posture known.
- Max 5 inboxes per domain.
- Start around 30 emails per inbox per day.
- Do not exceed 50 per inbox per day without evidence.
- Rough ceiling: 250 emails per domain per day.
- At least two weeks of warmup; 21-28 days is safer for aggressive campaigns.
- Inbox rotation enabled.
- Backup inboxes/domains available before sending.

Conservative ramp:

- Warm first.
- Go live at low daily volume.
- Increase only if opens, replies, bounces, and complaints stay healthy.
- If complaints or spam placement rise, stop and narrow the list/offer before increasing volume.

## List Hygiene

Do:

- Verify emails before sending.
- Remove obvious invalids and role-based addresses unless intentionally targeting them.
- Clean bounce-prone data sources.
- Segment by persona and signal before copywriting.
- Track source quality by list provider or enrichment method.

Be cautious with:

- Security gateways such as Proofpoint, Mimecast, Barracuda when a source layer warns they are harming placement.
- Personal emails unless the use case and privacy posture support them.
- Resellers or low-cost inbox providers without health monitoring.

Never:

- Mix personas in one campaign.
- Increase volume to fix low replies.
- Keep sending after a deliverability warning because copy "should work."

## Offer Testing

Use high volume to learn what the market wants. Hold variables steady.

Good offer test:

- 30-40 word offer statement.
- One pain, outcome, or worldview variable.
- Same CTA across variants.
- One persona x one signal.
- Enough sends to see signal.

Weak offer test:

- Multiple pains, guarantees, social proof, and CTAs mixed together.
- Different list quality per variant.
- Different sender domains per variant without accounting for placement.
- Tiny list used to declare a winner.

Positive reply rate is the early signal. If positive replies are low, change the offer or segment before rewriting every line.

## Front-End Artifact

A front-end artifact should be:

- Free or near-free.
- Specific.
- Custom.
- Cheap for the sender to produce.
- Useful even if the recipient never buys.

Examples:

- 100 verified leads plus a sample sequence.
- Free Google Business Profile optimization.
- Positioning audit.
- Funnel teardown.
- Three buying signals.
- Benchmark snapshot.

Default CTA:

```text
would that be worth sharing more?
```

or

```text
want me to send it?
```

## Body Pattern

Use casual, low-friction body copy:

```text
First name,

if I could send over [specific artifact] for [specific situation], would that be worth sharing more?
```

Guardrails:

- No fake one-to-one intimacy.
- No "noticed your post" unless actually verified.
- No full pitch.
- No calendar link first.
- No long paragraph.

## Cadence

Default:

- Day 0: initial.
- Day +3: one-line restatement or alternate angle.
- Stop.
- Recycle non-responders into a different campaign with a different opener/offer.

Do not run 7-touch or 14-touch sequences at volume. The deliverability cost is higher than the reply lift.

## Back-End Qualification

Volume creates noisy replies. Filter after reply:

- Name.
- Business email.
- Phone.
- Company URL.
- Revenue/deal-size band.
- What they want help with.
- Optional qualifying constraint tied to the offer.

Replies that pass get fast follow-up. Replies that fail are politely closed or routed to lower-touch nurture.
