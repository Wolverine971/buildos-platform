<!-- docs/marketing/RETARGETING_CAMPAIGN_STRATEGY.md -->

# BuildOS Retargeting Campaign Strategy (V2)

_Manual founder-led reactivation pilot for dormant signups_

**Status:** Draft - Ready for pilot implementation  
**Owner:** DJ Wayne  
**Motion:** Manual founder-led campaign  
**Primary goal:** Reactivate dormant signups and learn why they bounced  
**Secondary goal:** Build a proof base for a future automated sequence

---

## Pilot Goal

This is not a broad lifecycle email automation.

This is a **manual founder-led reactivation pilot** for people who tried BuildOS early, did not stick, and have likely never experienced the current product.

The pilot exists to answer three questions:

1. Will dormant signups come back if the message is honest and specific?
2. What is the first meaningful thing they do after they come back?
3. What objections or expectations still block activation?

---

## Constraints

### What we know

- Many dormant users saw an earlier, weaker version of BuildOS
- The product has materially changed
- BuildOS already has tracked email send/open/click infrastructure
- BuildOS already has activity signals for chat sessions, brain dumps, project activity, and briefs

### What we do NOT know

- Original acquisition source for these users
- Reliable customer quotes we can ethically use in outbound messaging
- Whether the best reactivation trigger is return session, first action, or multi-day usage

### Non-goals for v1

- Proving acquisition-source performance
- Running a 5-email automated sequence
- Using testimonials or attributed quotes without explicit permission

---

## Messaging Principles

1. **No fake proof**
    - No placeholder testimonials
    - No attributed quotes unless the user explicitly approved it
    - No "someone said..." copy if it cannot be traced to a real person and a saved permission state

2. **Lead with honesty**
    - Acknowledge that the early product was not strong enough
    - Do not over-defend the past
    - Do not oversell "better AI"

3. **Show what changed**
    - Real-time project visibility
    - Brain dump to structured project flow
    - Context that persists across sessions
    - Multi-user collaboration
    - Calendar integration where relevant

4. **Ask for one small test**
    - The call to action is not "adopt BuildOS"
    - The call to action is "try one brain dump again and see if it feels different"

5. **Founder voice beats brand voice**
    - Plain text
    - Short
    - Low pressure
    - Easy to reply to

---

## Audience Definition

### Required criteria

Include users who meet all of the following:

- Signed up at least 180 days ago
- No meaningful activity in the last 30 days
- Valid email address
- Not unsubscribed
- Not bounced
- Not an internal, admin, or test account

### "Meaningful activity" for v1

Treat the following as product activity:

- `agent_chat_sessions`
- `onto_braindumps`
- `onto_project_logs`
- `ontology_daily_briefs`

### Prioritization segments

For the first pilot, prioritize users in this order:

1. **Tried briefly, then disappeared**
    - Best fit for "you saw an early version" messaging
2. **Signed up, barely used it**
    - Good second segment, but message may need more product explanation
3. **Used it for a while, then went dormant**
    - Useful later, but the bounce reason may be more complex than "product was early"

### Fields available for segmentation now

Use these if helpful:

- Signup/account creation date
- Recent email history
- `onboarding_intent`
- `onboarding_stakes`
- Beta status
- Recent project/chat/braindump/brief activity

### Fields not available for v1

Do not reference or depend on:

- `original_source`
- Facebook/Instagram acquisition source
- Any external join not stored in BuildOS

---

## Proof Strategy

Because v1 has no approved testimonials, proof must come from the product itself.

### Allowed proof assets

- A short demo video or GIF
- A screenshot sequence showing brain dump -> project/task output
- A concise "what changed" before/after list
- A concrete product test the user can run in 5 minutes

### Not allowed

- Placeholder testimonials
- Anonymous quotes presented as direct quotes
- "User Name" / "Title / Company" placeholders
- Implied endorsements

### Proof collection rule for future versions

If a reactivated user sends strong positive feedback, ask directly:

> "Would you be okay if I used that as a short quote? I can keep it anonymous if you prefer."

Do not use the quote unless the user says yes.

---

## V1 Campaign Shape

### Format

- Manual founder-led
- Plain-text or plain-looking email
- Small batches
- Three touches maximum

### Timing

- **Touch 1:** Day 0
- **Touch 2:** Day 3 or 4
- **Touch 3:** Day 7 to 10

### Batch size

- Start with **25 users**
- Only expand if deliverability and replies look healthy

---

## Founder-Led 3-Touch Sequence

### Touch 1: Honest Re-introduction

**Goal:** Re-open the relationship with honesty and one simple test  
**Send to:** Entire pilot batch  
**CTA:** Try one brain dump again

**Subject direction:**

- `You tried BuildOS early. It's different now.`
- `BuildOS was rough when you tried it.`
- `Quick note from the founder`

**Body structure:**

- Acknowledge they tried an early version
- Admit it was not ready enough
- Name 2-3 concrete improvements
- Ask for one 5-minute retry
- Offer a reply path if they want to tell you why they bounced

**Template:**

```text
Hi [First Name],

You tried BuildOS a while back, and I think it is fair to say the product
was still early.

Since then, the biggest change is that BuildOS now does a much better job
turning a brain dump into an actual project you can keep working inside,
instead of making you start from scratch again every time.

If you are open to it, try one brain dump again here:
[link]

If it still does not feel useful, reply and tell me why. I read every reply.

DJ
```

### Touch 2: What Changed

**Goal:** Replace hype with proof  
**Send to:** Non-repliers who have not yet returned  
**CTA:** Watch the demo or try the product test

**Subject direction:**

- `What changed in BuildOS`
- `The product is different in 3 important ways`
- `Before you ignore this, here is the fast version`

**Body structure:**

- Short list of what changed
- One demo asset
- One product test
- Optional direct app link

**Template:**

```text
Hi [First Name],

Very short version of what changed:

1. Brain dumps now turn into real project structure faster
2. The project keeps context between sessions
3. You can update the same project instead of restarting every time

If you want the quickest proof, watch this:
[demo link]

If you would rather test it yourself, use this:
[app link]

Suggested test: talk through one active project for 2 minutes, then come
back tomorrow and ask what is next.

DJ
```

### Touch 3: Direct Founder Follow-up

**Goal:** Get a reply or close the loop respectfully  
**Send to:** Engaged non-converters or priority users, not the entire batch by default  
**CTA:** Reply with current use case or opt out implicitly

**Subject direction:**

- `Worth one more look?`
- `Should I stop emailing you about this?`
- `Can I help you test whether BuildOS is a fit?`

**Body structure:**

- Short personal check-in
- Ask what they are trying to organize now
- Offer to tell them whether BuildOS is actually a fit
- Make it easy to ignore

**Template:**

```text
Hi [First Name],

Last note from me on this.

If you want, reply with the project or mess you are trying to organize right
now and I will tell you honestly whether current BuildOS is a fit.

If not, no worries. I will leave it there.

DJ
```

---

## Sequence Branch Rules

Because this is founder-led, the sequence should branch manually.

- **If user replies:** stop the sequence and respond manually
- **If user returns and takes action:** stop the sequence
- **If user opens or clicks but does nothing:** eligible for Touch 2
- **If user never opens:** do not automatically keep pushing; decide manually
- **If user unsubscribes or bounces:** suppress immediately

Touch 3 should be reserved for:

- users who replied partially but did not return
- users who clicked or watched the demo but did not act
- users you want to reach personally because the account looks promising

---

## Attribution Spec

### Send path

Even though this is a manual founder-led campaign, send through the **BuildOS tracked email system**, not raw Gmail, so the pilot stays measurable.

### Existing tracking infrastructure

The current system already records:

- `emails`
- `email_recipients`
- `email_tracking_events`

These already support:

- send logging
- open tracking
- click tracking
- recipient-level delivery state

### Metadata to stamp on every send

Store these values in `emails.template_data` and/or `email_logs.metadata`:

- `campaign_id`
- `cohort_id`
- `step`
- `variant`
- `batch_id`
- `send_type` = `manual_founder_led`
- `holdout` = `true|false`
- `conversion_window_days`

### Link parameters

All links in the pilot should include:

- `utm_source=retargeting`
- `utm_medium=email`
- `utm_campaign=buildos-reactivation-founder-pilot`
- `utm_content=step-1|step-2|step-3`
- `campaign_id=<campaign_id>`
- `cohort_id=<cohort_id>`
- `step=<step>`
- `variant=<variant>`

### Attribution rule for v1

Use a simple **last retargeting touch within window** model.

- `return_session` attribution window: 14 days
- `first_action` attribution window: 14 days
- `multi_day_usage` attribution window: 30 days

If multiple pilot emails were sent, attribute the outcome to the most recent eligible send before the event.

If the user is in holdout, count the outcome as organic.

---

## Reactivation Funnel

Track all three layers of reactivation.

| Metric              | Definition                                   | Primary Source                                                            | Window        |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------- | ------------- |
| **Open rate**       | Recipient opened the email                   | `email_recipients.opened_at`, `email_tracking_events`                     | Per send      |
| **Click rate**      | Recipient clicked a tracked link             | `email_tracking_events`                                                   | Per send      |
| **Reply rate**      | User replied to the founder email            | Manual founder review                                                     | Per batch     |
| **Return session**  | First observed post-send visit/activity      | Prefer `users.last_visit`; fallback to earliest post-send activity record | 14 days       |
| **First action**    | First post-send brain dump or project action | `onto_braindumps`, `onto_project_logs`                                    | 14 days       |
| **Multi-day usage** | Activity on 2+ distinct days after send      | Union of activity tables below                                            | 14 to 30 days |

### Activity tables for post-send behavior

Use the same product activity sources already used in engagement reporting:

- `agent_chat_sessions`
- `onto_braindumps`
- `onto_project_logs`
- `ontology_daily_briefs`

### Important measurement note

`return_session` may be somewhat coarse in v1 because true passive visits are harder to reconstruct than append-only activity. If visit-level session logging is incomplete, treat the earliest observed post-send activity as the return timestamp and document the limitation.

---

## Experiment Design

### Cohort freeze

Before the first send, freeze one eligible cohort snapshot for the pilot.

Each user in that cohort should be assigned:

- `campaign_id`
- `cohort_id`
- `batch_id`
- `holdout`
- optional `segment`

### Holdout

Use a simple no-email control group.

- If cohort size is under 100 users: hold out **10 users**
- If cohort size is 100+ users: hold out **10%**

The holdout gets:

- no founder-led retargeting email during the test window
- the same downstream behavior measurement as the send group

### Randomization

Randomize send order inside the eligible cohort before batching.

Do not hand-pick only the most promising users for the send group or the test becomes misleading.

### What matters most in v1

Because this is a small founder-led pilot, evaluate:

1. Directional lift versus holdout
2. Quality of replies
3. First-action rate after return
4. Whether multi-day usage appears at all

Do not over-index on statistical confidence in the first pilot batch.

---

## Post-Click Experience

Do not send dormant users straight into a generic app experience with no context.

### Minimum viable returning-user path

The destination should clearly answer:

- what changed
- what to try first
- what result to expect

### Required elements

- Short "what changed" section
- One primary CTA: `Try your brain dump`
- One recommended test
- Optional founder video/demo
- Campaign parameters preserved through login if possible

### Fallback if no dedicated returning-user page exists yet

If a custom returning-user page is not built for v1:

- use Touch 2 to send the user to a demo first
- use the app link as the secondary CTA
- do not pretend the generic app landing flow is optimized for reactivation

---

## Operational Runbook

### Before sending

1. Freeze the eligible cohort
2. Assign holdout users
3. Prioritize the first 25-user batch
4. Prepare:
    - Touch 1 template
    - Touch 2 template
    - Touch 3 template
    - one demo asset
    - one direct app/test link
5. Confirm reply inbox is monitored by the founder

### During the batch

1. Send Touch 1 through the tracked BuildOS email system
2. Monitor opens, clicks, replies, and actions for 72 hours
3. Send Touch 2 only to the relevant non-converters
4. Use Touch 3 selectively, not as a blanket send

### After the batch

Review:

- open rate
- click rate
- reply rate
- return session rate
- first action rate
- multi-day usage rate
- lift versus holdout
- common reply themes

Capture qualitative notes:

- why they originally bounced
- what confused them now
- what improved enough to get a second look
- what still feels weak

---

## Guardrails

- Maximum three touches per user in v1
- Suppress after any unsubscribe, bounce, or clear negative reply
- Keep the email voice low-pressure
- Do not use broad hype language
- Do not claim the product is "ready for everyone"
- Do not use unapproved customer quotes

---

## Exit Criteria For V1

Move beyond the founder-led pilot only if these are true:

- deliverability looks healthy
- the founder inbox can keep up with replies
- there is positive lift versus holdout on at least one meaningful reactivation metric
- there are enough real replies to improve the copy honestly
- there is at least some evidence of multi-day usage, not just clicks

If those conditions are not met, revise the message, audience definition, or post-click experience before scaling.

---

## Related Documents

- Onboarding behavioral seed spec: `/docs/specs/ONBOARDING_BEHAVIORAL_SEED_SPEC.md`
- Email flow spec: `/apps/web/docs/design/email-flow-spec.md`
- Email system architecture: `/apps/web/docs/technical/architecture/email-system.md`
- Anti-AI marketing strategy: `/docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md`
- Retargeting pilot runbook: `/docs/marketing/RETARGETING_PILOT_RUNBOOK.md`
- Retargeting pilot email copy: `/docs/marketing/RETARGETING_PILOT_EMAIL_COPY.md`

---

_Last updated: 2026-03-16 by Codex_
