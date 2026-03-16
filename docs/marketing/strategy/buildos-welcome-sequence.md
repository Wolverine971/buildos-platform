---
title: 'BuildOS Welcome Sequence'
created: 2026-03-16
status: current
owner: DJ Wayne
related_docs:
    - /docs/marketing/strategy/buildos-marketing-strategy-2026.md
    - /docs/marketing/content/drafts/why-i-built-buildos.md
    - /docs/user-guide/getting-started.md
    - /apps/web/docs/features/onboarding/README.md
path: docs/marketing/strategy/buildos-welcome-sequence.md
---

# BuildOS Welcome Sequence

## Purpose

The welcome sequence should help a new BuildOS signup do three things:

1. Start a first brain dump
2. Finish onboarding and enable one follow-through channel
3. Come back for a second session before the trial reminder sequence starts

This sequence is for real new users starting the 14-day trial. It is not a reactivation sequence, not a beta approval sequence, and not a last-chance conversion push.

## Implementation Snapshot

Live implementation status as of 2026-03-16:

- Trigger: starts when a new trial account successfully creates its `public.users` row during password registration or first-time Google OAuth registration.
- Source code: `/apps/web/src/routes/api/auth/register/+server.ts` and `/apps/web/src/lib/utils/google-oauth.ts`.
- Sequence state: stored in `public.welcome_email_sequences`, one row per user, with per-step sent and skipped timestamps.
- Delivery path: every step sends through `/apps/web/src/lib/services/email-service.ts` so `emails`, `email_recipients`, `email_logs`, and `email_tracking_events` stay in sync.
- Scheduling: Email 1 sends immediately. Emails 2-5 are evaluated hourly by `/apps/web/src/routes/api/cron/welcome-sequence/+server.ts` via `vercel.json`, with a local 9am-5pm send window.
- Live branching inputs: onboarding intent, onboarding completion, project count, daily brief email opt-in, SMS readiness, calendar connection, and whether the user appears to have returned for a later session.
- Current approximation: "returned for a second session" is inferred from `users.last_visit` being at least 12 hours after signup because there is not yet a dedicated session-count field.

---

## Positioning Guardrails

### What this sequence should sound like

- Direct
- Practical
- Builder-first
- Calm and useful
- Focused on relief, structure, and momentum

### What this sequence should not do

- Invent founder details, diagnoses, or fake app-failure counts
- Lead with "AI-powered productivity"
- Sound like a manifesto or movement recruitment pitch
- Use unsupported stats, testimonials, or customer titles
- Ask the user to learn the whole product before they get value

### Core message

BuildOS helps people turn messy thinking into structured work they can keep building on.

The first value moment is not "understanding the product."

The first value moment is:

**I dumped what was in my head and got something usable back.**

---

## Recommended Welcome Line

**Recommended:**

> Welcome to BuildOS. Start with the mess in your head. We'll help you turn it into a project you can actually move forward.

### Alternates

- Welcome to BuildOS. Talk through what you're working on, and we'll help you turn it into structure you can use.
- Welcome to BuildOS. Bring the messy version first. That's what this is built for.
- Welcome to BuildOS. If you've got too many ideas and not enough structure, start with one brain dump.

---

## Sequence Architecture

| Email | Timing / Trigger                                          | Goal                                             | Primary CTA                         |
| ----- | --------------------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| 1     | Immediately after signup                                  | Get the user to do one brain dump                | Start your first brain dump         |
| 2     | Day 1 if no project created                               | Remove blank-page anxiety; show what to dump     | Open BuildOS                        |
| 3     | Day 3 after signup                                        | Explain why BuildOS is different: it keeps state | Re-open your project                |
| 4     | Day 6 if onboarding or follow-through setup is incomplete | Move from capture to follow-through              | Set up daily brief or sync calendar |
| 5     | Day 9                                                     | Personal check-in + use-case relevance           | Reply or open BuildOS               |

**Handoff:** Day 11+ belongs to a separate trial reminder / conversion sequence.

---

## Behavioral Branches

### If the user has not created a first project

- Keep Email 2 focused on "what to put in your first brain dump"
- Keep Email 3 focused on "why BuildOS is better than another blank workspace"
- Use direct product-entry CTAs

### If the user created a first project but did not finish onboarding

- Swap CTA language from "start" to "finish setup"
- Emphasize notifications and ready-state completion

### If the user completed onboarding but has not returned

- Use Email 3 to push the second session:
    - open the same project
    - ask what changed
    - ask what should happen next

### If the user has notifications off

- Use Email 4 to push exactly one follow-through channel:
    - email daily brief first
    - SMS second
    - calendar sync if relevant to their workflow

### If the user already has a second session

- Email 5 becomes a personal reply/check-in email, not another activation push
- Current implementation approximates this branch from `users.last_visit` until a stronger session-return signal exists

---

## Personalization Inputs

Use what the onboarding flow already captures:

- `first_name`
- `onboarding_intent`
- `onboarding_stakes`
- whether the user created a project
- whether the user completed onboarding
- whether email daily brief is enabled
- whether SMS is enabled
- whether calendar is connected

### Intent copy hooks

- `organize`: "get everything you're juggling into one place"
- `plan`: "turn the thing you're trying to build into a real plan"
- `unstuck`: "get one clear next move instead of ten loose ones"
- `explore`: "start messy and see what becomes worth building"

---

## Email Drafts

### Email 1

**Timing:** Immediately after signup  
**Goal:** First brain dump  
**Subject options:**

- Welcome to BuildOS
- Start with one brain dump
- Bring the messy version first

**Draft:**

Hi [First Name],

Welcome to BuildOS.

The best way to understand it is not by reading about it. It's by using it once.

Start with the mess in your head:

- a project you're trying to move forward
- a pile of ideas you have not organized yet
- something you feel stuck on
- a bunch of loose notes you do not want to lose

Open BuildOS and talk through it the way you naturally would. Do not clean it up first.

That is the point.

BuildOS is built to take rough input and turn it into structure you can actually work from.

Start here:

[Start your first brain dump]

If you reply with what you're trying to build, I'll tell you the fastest way to start it in BuildOS.

DJ

---

### Email 2

**Timing:** Day 1, only if no project exists  
**Goal:** Remove blank-page anxiety  
**Subject options:**

- What to put in your first brain dump
- Not sure what to say? Start here
- You do not need a perfect input

**Draft:**

Hi [First Name],

If you opened BuildOS and thought "I should come back when I can explain this better," do not do that.

A good first brain dump sounds more like this:

"I'm trying to [goal]. These are the things already in motion. These are the loose ends. This is what's blocking me. These are the things I do not want to forget."

If you said you came to BuildOS to **[onboarding_intent_hook]**, use that as your starting point.

You do not need:

- a polished plan
- a clean list
- the right format

You just need a real starting point.

Open BuildOS and dump the messy version. Let the system do the organizing after.

[Open BuildOS]

DJ

---

### Email 3

**Timing:** Day 3 after signup
**Goal:** Explain the real differentiator: context that carries forward  
**Subject options:**

- Most tools make you start from zero
- Why BuildOS works better than another blank workspace
- The difference is memory

**Draft:**

Hi [First Name],

Most tools make you maintain the system.

You write notes in one place, tasks in another, talk to AI in another, and then you become the person responsible for stitching all of it back together.

That is the part BuildOS is trying to remove.

When you brain dump into BuildOS, the goal is not just to generate text once.

The goal is to create a project you can keep building on without starting from zero every time.

Try this:

1. Open the project you already started
2. Add whatever changed since the last time you touched it
3. Ask what the next move should be

That second session is where BuildOS starts to make sense.

[Re-open your project]

DJ

---

### Email 4

**Timing:** Day 6, when onboarding or follow-through setup is incomplete
**Goal:** Turn capture into follow-through  
**Subject options:**

- Capture is only half the system
- Set up one follow-through channel
- Make BuildOS show up when you need it

**Draft:**

Hi [First Name],

Getting your ideas out is step one.

Following through without having to remember everything yourself is step two.

That is where the rest of onboarding matters.

Pick one:

- turn on the email daily brief
- verify your phone if you want SMS nudges
- connect your calendar if time and deadlines are part of your workflow

You do not need to set up everything at once.

Just give BuildOS one way to help you stay in motion after the brain dump.

[Finish setup]

DJ

---

### Email 5

**Timing:** Day 9  
**Goal:** Personal check-in + use-case relevance  
**Subject options:**

- What are you building right now?
- If you reply, I'll point you in the right direction
- Where BuildOS fits best

**Draft:**

Hi [First Name],

By now you have probably felt one of two things:

1. "Okay, I get it now."
2. "I still do not know the best way to use this for my work."

If it is the second one, reply and tell me what you are trying to move forward.

BuildOS tends to click fastest for people who need to:

- turn scattered project thinking into a usable plan
- keep context attached to work across multiple sessions
- stop bouncing between notes, task lists, and stateless AI chats
- get one clear next move when everything feels equally urgent

You do not need a huge system.

You need one project in BuildOS that becomes more useful every time you come back to it.

[Open BuildOS]

Or just reply to this email with what you're building.

DJ

---

## Tone Notes

### Use

- "brain dump"
- "what you're building"
- "messy version"
- "start from zero"
- "one clear next move"
- "keep building on it"

### Avoid

- "cognitive sovereignty"
- "citizens"
- "empire builders"
- fake founder suffering
- inflated social proof
- long AI explanations in the opening paragraph

---

## Success Metrics

Track the sequence against actual activation behavior:

- first project created within 24 hours
- onboarding completion within 3 days
- second session within 7 days
- daily brief opt-in rate
- calendar connection rate
- reply rate on Email 5

Do not judge this sequence on opens alone. The point is product activation, not vanity metrics.

---

## Notes for Implementation

- Keep Email 1 plain-text or minimally formatted
- Use one CTA per email
- Do not send trial urgency messaging inside this sequence
- Prefer honest, low-hype subject lines over curiosity bait
- If product data exists, branch by user behavior rather than blasting everyone the same five emails
- Keep this doc aligned with the live implementation paths in:
    - `/apps/web/src/lib/server/welcome-sequence.logic.ts`
    - `/apps/web/src/lib/server/welcome-sequence.service.ts`
    - `/apps/web/src/routes/api/cron/welcome-sequence/+server.ts`

This should be the source of truth for future BuildOS welcome emails unless a later doc explicitly replaces it.

---

## Related Docs

- [BuildOS Marketing Strategy 2026](./buildos-marketing-strategy-2026.md)
- [Why I Built BuildOS](../content/drafts/why-i-built-buildos.md)
- [Getting Started with BuildOS](../../user-guide/getting-started.md)
- [Onboarding Feature README](../../../apps/web/docs/features/onboarding/README.md)
