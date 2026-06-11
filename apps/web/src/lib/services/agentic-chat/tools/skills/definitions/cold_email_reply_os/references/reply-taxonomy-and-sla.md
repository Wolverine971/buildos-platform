---
doc_type: skill-reference
skill: cold_email_reply_os
reference: reply-taxonomy-and-sla
visibility: internal
publish: false
created: 2026-06-10
purpose: Canonical 12-class reply taxonomy with detection cues, the owner/SLA matrix, same-day routing rules, reply-to-call frame, and the left-company trigger handoff.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_reply_os/references/reply-taxonomy-and-sla.md
---

# Reply Taxonomy and SLA

Load this when classifying a reply (workflow step 1) or setting owner and SLA (workflow step 6). Classify before you draft anything. A route without a taxonomy class is not a route.

## Governing Sources

- Close/Steli Efti: reply forks, follow-up calendar discipline.
- Mailshake State of Cold Email 2025 (Michael Hanson): "If a lead replies to a cold email, typically the answer won't be 'let's have a meeting.' It may be 'we're using a competitor' or 'speak to X person.'"
- Gong: skeptical buyers are serious buyers — negative sentiment increases toward purchase.
- Craig Elias: trigger-event selling — referrals and left-company bounces are warm surface area.
- Mom Test (Fitzpatrick): compliments are weak evidence.

## Principle

The goal of the email is a response. The goal of reply handling is to preserve momentum without forcing the wrong next step. Replies are scarce trust signals — route them the same day. Silence is the only dead state.

## Reply Taxonomy (canonical, 12 classes)

| #   | Class                                            | Detection cues                                             | Intent                                                                                    |
| --- | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Yes / interested                                 | "send it," "tell me more," asks a question about the offer | High                                                                                      |
| 2   | Send info                                        | "send me something," "what's the pricing"                  | Medium-high                                                                               |
| 3   | Numbered response                                | replies "1"/"2"/"3" to a fork                              | Per option                                                                                |
| 4   | Not now / timing                                 | "next quarter," "after [event]"                            | Medium (timeline data — Moesta)                                                           |
| 5   | Already solved / competitor                      | names incumbent or "we're covered"                         | Low-medium (objection-discovery value — Close Hail Mary)                                  |
| 6   | Objection (budget / priority / risk / switching) | substantive pushback                                       | Medium                                                                                    |
| 7   | Skeptical                                        | "does this actually…," challenge to claim                  | Medium (serious buyers get critical — Gong: negative sentiment increases toward purchase) |
| 8   | Wrong person / referral                          | "talk to X," "not my area"                                 | Routing value (Elias: a referral target is warmer than a cold name)                       |
| 9   | Compliment-no-action                             | "great email!" with no movement                            | Weak evidence (Mom Test: tag compliments weak)                                            |
| 10  | Angry / opt-out                                  | "stop emailing me," unsubscribe                            | Stop                                                                                      |
| 11  | Auto-reply / OOO / left-company                  | bounce text                                                | "Left company" = trigger event for the ICP child (Elias bounce surface)                   |
| 12  | Ambiguous                                        | unclassifiable one-liner                                   | Ask one calibrated question; do not assume                                                |

## SLA Matrix

Speed rationale: replies are scarce trust signals; route same day. Do not leave high-intent replies overnight when the motion depends on calls. Do-not-import note: Hormozi's 391% speed-to-contact stat is inbound list-email territory — never cite it as a cold-email SLA fact.

| Reply class                  | Owner                              | First response SLA                            | Notes                                                                                                                                    |
| ---------------------------- | ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Yes / interested, numbered 1 | Sender (human)                     | Same business day; within 1–2h if call motion | Keep artifact promise before any meeting push                                                                                            |
| Send info                    | Sender or assistant                | Same business day                             | Send the promised artifact, never a brochure                                                                                             |
| Objection / skeptical        | Sender (human — judgment required) | Within 1 business day                         | Use the objection route table (load `cold_email_reply_os.objection_routes`)                                                              |
| Wrong person / referral      | Sender                             | Within 1 business day                         | Thank, ask routing question, log new contact                                                                                             |
| Not now                      | Sender                             | Within 2 business days                        | Ask permission for a specific future touch; calendar it (Close follow-up guide: "I'll put that in my calendar and ping them in 14 days") |
| Angry / opt-out              | Sender                             | Same day                                      | Two lines max, confirm stop, suppress address                                                                                            |
| Left-company auto-reply      | System → ICP child                 | n/a                                           | Fire trigger workflow (Elias)                                                                                                            |
| Ambiguous                    | Sender                             | 1 business day                                | One calibrated question only                                                                                                             |

Compliment-no-action (class 9) and OOO auto-replies carry no SLA: tag the compliment as weak evidence and move on; resume cadence after an OOO return date.

## Same-Day Routing

For high-intent replies:

- Alert the sender immediately.
- Enrich account context and phone only if allowed.
- Reply while intent is fresh.
- If a call is appropriate, offer 2-3 specific times.
- Keep the artifact promise before pushing the meeting.

Do not leave high-intent replies in the inbox overnight when the campaign depends on booked calls.

## Reply-to-Call

Use when the buyer has shown clear interest and the sales motion supports calls.

Safe frame:

```text
Makes sense. I can send the snapshot first.

If it looks relevant, I have [time 1] or [time 2] open tomorrow to walk through what I found.
```

Avoid:

- Pushing a call after a weak reply.
- Calling without context in sensitive markets.
- Using "my assistant told me" unless that sender model is real and approved.

## After Verbal Interest

Once someone agrees to a meeting, follow up until it is booked or they decline.

Good follow-up assets:

- The promised artifact.
- Short relevant proof.
- A concrete agenda.
- Two specific time options.

Avoid generic "checking in."

## Left-Company Trigger Handoff

A "left company" auto-reply is not a dead address — it is two trigger events (Elias): the departed person is landing somewhere new with fresh budget and old pain, and the old seat has a successor in their decision window. Hand both to `cold_email_icp_signal_design` as trigger-event inputs; do not handle them inside the reply thread.

## Angry Or Opt-Out Replies

Use a short dignified close:

```text
Understood. I will not follow up.
```

Do not defend, debate, explain intent, or ask one more question after an opt-out. Suppress the address.
