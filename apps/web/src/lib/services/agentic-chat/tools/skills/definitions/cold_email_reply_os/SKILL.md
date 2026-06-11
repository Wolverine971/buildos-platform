---
name: Cold Email Reply OS
description: Child skill for classifying cold outreach replies into a 12-class taxonomy, routing objections through a 7-route table, reviving silence with numbered forks, and answering within SLA so trust is preserved after a recipient responds or goes quiet.
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.reply_os
    - cold_email_outreach.objection_handling
reference_modules:
    - id: cold_email_reply_os.objection_routes
      name: Objection Route Table
      summary: 7-objection route table with labels and calibrated questions, Gong 7-step async adaptation, and the objection-bank template structure (acknowledge -> label -> one contrast/artifact -> smallest calibrated question).
      when_to_load:
          - When the reply is an objection, skepticism, competitor-chosen, or a send-info brushoff.
      path: references/objection-route-table.md
      visibility: internal
    - id: cold_email_reply_os.fork_library
      name: Numbered Fork Library
      summary: Three named forks (qualification, ghosted-thread, Hail Mary) with full text, fork discipline rules, and silence-revival cadence by mode.
      when_to_load:
          - When silence revival or a numbered fork is the chosen move (workflow steps 2, 7).
      path: references/numbered-fork-library.md
      visibility: internal
    - id: cold_email_reply_os.tactical_empathy_routes
      name: Tactical Empathy Routes
      summary: Route table and label -> calibrated question patterns for objections, silence, skepticism, angry replies, and ambiguous replies.
      when_to_load:
          - When a reply is skeptical, tense, ambiguous, negative, silent, or objection-heavy and you need label and question phrasing.
      path: references/tactical-empathy-routes.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_reply_os/SKILL.md
---

# Cold Email Reply OS

Use this child skill after sending, when a reply arrives, a thread goes quiet, or objections need routing. The discipline this skill enforces is **classify first**: every reply gets a taxonomy class before any draft, route, or fork. A route without a taxonomy class is not a route. Replies are scarce trust signals — the north star is qualified conversations started per unit of market trust consumed.

## When to Use

- The user has a reply and needs the next response
- The prospect went silent after interest
- The user needs objection handling
- The user wants a low-friction numbered fork
- The user needs reply-to-call handling without pressure

## Workflow

1. Classify the reply. Assign exactly one of the 12 classes from the detection cues in `## Reply Taxonomy (12 classes)` below. If ambiguous (class 12), the only move is one calibrated question — do not assume intent.
2. Route by class. Objection, skeptical, competitor-chosen, or send-info-brushoff → load `cold_email_reply_os.objection_routes` and pick the matching route row. Silence or revival → load `cold_email_reply_os.fork_library` and pick one of the three named forks. For label and calibrated-question phrasing on tense or ambiguous replies, load `cold_email_reply_os.tactical_empathy_routes`.
3. Preserve the original promise. If they asked for info, send the artifact, not a brochure.
4. Draft the response in the response shape: one label, one answer or artifact, one calibrated question or next step. Never two CTAs.
5. Set owner and first-response SLA from `## SLA Matrix` below; flag same-day classes (yes/interested, send info, angry/opt-out) explicitly.
6. Handle special handoffs: a left-company auto-reply fires the trigger workflow to `cold_email_icp_signal_design` (see `## Left-Company Trigger Handoff`); an opt-out suppresses the address immediately.
7. If silent after meaningful time, use one respectful numbered fork — one fork per thread, ever — and set the revival cadence by mode from the fork library.
8. Log the exchange: class, route, objection language verbatim (buyer language feeds `cold_email_learning_review`).

## Reply Taxonomy (12 classes)

The goal of the email is a response. The goal of reply handling is to preserve momentum without forcing the wrong next step. Replies are scarce trust signals — route them the same day. Silence is the only dead state.

Classify before you draft anything. A route without a taxonomy class is not a route.

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

## Output Contract

- Reply class (one of the 12, named)
- Intent level
- Chosen route or fork (named row/fork from the loaded reference)
- Response draft (label + answer/artifact + one next step)
- Artifact to send, if promised
- Owner and SLA note (who responds, by when)
- Stop or follow-up rule (cadence by mode, or suppression)
- Buyer-language log line for the learning review

## Worked Example

Condensed from a full classify-and-respond run on a "send me some info" reply to a strategic first touch; the input thread is in `evals.md` Task 1. Match this shape: class before draft, route row named, one CTA, log line at the end.

**Input:** First touch (strategic, 8 hand-picked accounts) offered Dana, VP RevOps, a 2-page pipeline-review teardown ("Want me to send the Meridian-relevant version?"). Her reply: _"Thanks Alex. Sounds interesting — send me some info and I'll take a look when I get a chance."_ The sender's instinct: send the company deck and ask if she's free Thursday or Friday for a call.

**1. Classification (before any draft):** Class **2 — Send info** ("send me some info" is the detection cue). Intent: **medium-high**. Not class 1 (yes/interested) — "when I get a chance" is deferral language, so handle it as the **send-me-info-as-brushoff** pattern from the objection route table. A route without a taxonomy class is not a route; the class came first.

**2. Owner + SLA:** Sender or assistant, **same business day** — send-info is a same-day class. Reply while the thread is warm.

**3. Route (objection route table, brushoff row):** No label needed. Send the **real artifact + one-line fork: active vs. polite-no**. Two corrections to the sender's plan, by rule:

- **Deck refused — artifact, not brochure.** The email promised the Meridian-relevant 2-page teardown. Send exactly that; substituting a company deck breaks the original promise ("send the promised artifact, never a brochure").
- **Call ask refused.** "Free Thursday or Friday?" is a call push after weak interest — guardrail violation. Reply-to-call is reserved for clear interest. It would also make two CTAs; never two CTAs.

**4. Response draft** (artifact + one calibrated question, what/how only, never "why"):

```text
Here it is — the 2-page teardown, with the Meridian pod-structure notes on page 2.

No deck and no drip sequence behind this. One question so I don't clutter your
inbox: should I close the loop after this, or is the noisy-pipeline-review
problem still live this quarter?

— Alex
```

The question is the route row's active-vs-polite-no fork: either answer is useful, and "close the loop" gives her a dignified no.

**5. Stop / follow-up rule:** If silence follows the artifact, strategic cadence allows up to 4 touches over ~7–8 days, then stop. The ghosted-thread numbered fork stays in reserve — **one fork per thread, ever** — so it is not spent here while the thread is live.

**6. Buyer-language log (for `cold_email_learning_review`):** class 2 send-info-brushoff · route: artifact + active-vs-polite-no fork · verbatim: _"Sounds interesting — send me some info and I'll take a look when I get a chance."_ — deferral phrasing, no named pain; grade as weak evidence until behavior follows.

**Output contract check:** class ✓ intent ✓ route row named ✓ draft ✓ artifact ✓ owner/SLA ✓ stop rule ✓ log line ✓.

## Guardrails

- Do not respond without classifying first; a route without a taxonomy class is not a route.
- Honor a no.
- Do not guilt, pressure, or insult the recipient.
- Do not push a call after weak interest.
- Do not call without context in sensitive markets.
- Do not leave high-intent replies overnight when the motion depends on calls.
- Do not debate angry replies or continue after opt-out.
- Never ask "why" in an objection reply — what/how questions only.
- One fork per thread, ever.
- Do not counter-pitch a competitor-chosen reply; run the Hail Mary learning move instead.
- Do not cite list-email stats (e.g. Hormozi speed-to-contact) as cold-email SLA facts.

## Notes

- The reply taxonomy and SLA material is inline in this shell (sections `## Reply Taxonomy (12 classes)` through `## Angry Or Opt-Out Replies`) because classification is unconditional — every use of this skill starts there. Only the conditional material (objection routes, numbered forks, tactical-empathy phrasing) lives in `references/`.
- Sources for the inline taxonomy/SLA sections: Close/Steli Efti (reply forks, follow-up calendar discipline), Mailshake State of Cold Email 2025 / Michael Hanson ("If a lead replies to a cold email, typically the answer won't be 'let's have a meeting.' It may be 'we're using a competitor' or 'speak to X person.'"), Gong (skeptical buyers are serious buyers — negative sentiment increases toward purchase), Craig Elias (trigger-event selling — referrals and left-company bounces are warm surface area), Mom Test/Fitzpatrick (compliments are weak evidence).
- Sources named inline in the references: Steli Efti/Close (forks, follow-up calendar), Gong (objection process, skeptic-signal data), Black Swan Group (labels, calibrated questions), Connor Murray (objection bank, cadence), Craig Elias (trigger events), Austin Schneider (volume touch decay). Async objection adaptations of call-era sources are flagged as derivation inside the modules.
- Maintainers: enrichment lineage lives at `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` and the draft references at `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/` (not available at runtime).
