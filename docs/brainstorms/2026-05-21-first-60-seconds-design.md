---
date: 2026-05-21
title: BuildOS First 60 Seconds — Design Brief
status: draft-for-riff
parent_strategy: docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md
target_phase: Phase B (4-8 weeks)
path: docs/brainstorms/2026-05-21-first-60-seconds-design.md
---

# First 60 Seconds — Design Brief

> Riffable design doc. Strong starting point, not a final spec.
> Goal: give DJ something concrete to react against and refine.

## The single sentence

A new user types a half-formed thought into a single input box, and 60 seconds later they're looking at a structured project — scaffolded by the AI, owned by them, ready to evolve.

## Why this is the most important design problem

Templates, forks, positioning, creator outreach — none of it matters if the first 60 seconds doesn't deliver "oh, this is different." Notion has spent 10 years failing this. ChatGPT solved it accidentally (one input box, instant response, forgotten next session). BuildOS has a real chance to nail it because the AI can take messy input and _produce structure_ — the actual magic of a thinking environment.

## What we're competing against (and why we win)

| App           | First 60 seconds               | What's wrong                                           |
| ------------- | ------------------------------ | ------------------------------------------------------ |
| Notion        | Blank page or template gallery | Cognitive load. User has to construct.                 |
| ChatGPT       | Single chat input → answer     | No durability. Forgotten next session.                 |
| Linear        | "Set up your workspace" funnel | Tool, not thinking environment.                        |
| Roam/Obsidian | Blank canvas + concept         | Steep learning curve.                                  |
| **BuildOS**   | One input → structured project | Combines ChatGPT's simplicity with Notion's durability |

The wedge: **ChatGPT's first 60 seconds, with Notion's permanence.**

## The 60-second flow

### 0-5 seconds: arrive

User sees a single large input box. Above it, one sentence:

> **What are you working on?**

Below the input, optionally: 2-3 example prompts as ghost text that rotate or appear as suggestions ("I want to launch a podcast in 90 days," "I'm trying to write a book but don't know where to start," "Help me plan our backyard renovation").

**What's not on the screen:**

- No template gallery
- No "choose your workspace" setup
- No tutorial modal
- No avatar / preferences / onboarding survey
- No "what's your use case" funnel
- No sign-in nag if they're already signed in

The whole UI is the input box for the first 5 seconds.

### 5-30 seconds: dump

User types or speaks (voice input is a strong activation accelerant — leverage the microphone). Output can be:

- 1 sentence ("I want to start a podcast")
- 3 paragraphs of messy thinking
- A list of half-formed ideas
- A copied email about a project they want to track
- A spoken stream-of-consciousness

The AI accepts whatever they give it. No format requirements.

### 30-45 seconds: AI works visibly

As the user finishes typing, the AI starts processing. Critical: **the AI's work is visible.**

Live streaming feedback:

- "Reading your thought..."
- "I see this is about [topic]..."
- "Pulling together a project structure..."

Not a spinner. Real progress, narrated. This builds trust that the AI is actually understanding, not just generating boilerplate.

### 45-60 seconds: the moment

A scaffolded project appears, with these elements visible at once:

**Project header:**

- Name (AI-suggested, editable in place)
- Goal (extracted from the brain dump, one sentence)
- Optional: "This looks like a [book / startup / podcast] project. Want to layer in the [Ferriss / YC / podcast-pro] scaffold?" (offered, not required)

**Plan view (right side or below):**

- 3-5 high-level phases the AI has identified
- Each phase has 2-3 initial tasks underneath

**Documents (left side or tab):**

- A "Brief" document containing the user's original brain dump (lightly cleaned up)
- A "Context" document with anything the AI identified as background/reference material

**Tasks (visible immediately):**

- 5-10 concrete next actions, ordered by what should happen first
- The most actionable one is highlighted: "Start here →"

**One AI chat affordance:**

- A persistent "Talk to your project" panel/button
- Used to refine, add, ask questions, expand any element

### The single emotional beat

The user should feel: _"I just gave it mess, and it gave me structure. That's exactly what I needed."_

Not: _"Wow, AI is impressive."_
Not: _"This is a productivity tool."_

Specifically: _the relief of having structure_. The product promise from the strategy doc is "turn messy thinking into structured work." This is where that promise has to land.

## Edge cases and how to handle them

### Empty input (15+ seconds of nothing)

Don't pressure. Offer a soft nudge:

> Try: "I'm trying to launch [thing] and don't know where to start."

Or surface a recent prompt from a public template — "Want to see how Tim Ferriss-inspired book planning works?" — as a guided alternative.

### Unstructured emotional dump ("idk just overwhelmed with everything")

AI does NOT try to turn this into a project immediately. Instead, asks one clarifying question:

> "I hear you. Let's untangle this. What's the one thing that's been on your mind the most?"

The clarification is itself part of the value. The user feels heard, not processed.

### Multiple projects in one input ("I have 3 things: launching X, hiring Y, planning Z")

AI detects this and offers:

> "Sounds like 3 different projects. Want me to create them all?"

If yes, creates all three. If no, asks which to start with.

### Already-structured input ("Here's my project plan for X with phases A, B, C")

AI doesn't reinvent. It mirrors the structure provided and adds polish:

- Picks up the phases as-is
- Suggests sub-tasks within each phase
- Flags missing pieces ("You mentioned phase B but didn't say what's in it — want me to suggest?")

### Agent-flavored input ("Connect to my Linear and import the auth migration project")

AI recognizes the integration intent:

> "I can connect Linear. Authorize that here →"

If integration ships, the project gets pre-populated from external data. If not yet shipped, fall back to a manual project scaffold with a "Linear connection coming soon" link.

## What gets cut from the first 60 seconds (and added later)

| Element                            | When it appears                                |
| ---------------------------------- | ---------------------------------------------- |
| Workspace / org settings           | Day 3 (when user has invited someone else)     |
| Theme / preferences                | Day 2 (after they've used it once)             |
| Integration setup (calendar, etc.) | When the user requests it                      |
| Tutorial / docs                    | Linked from project but never shown unprompted |
| Billing / plan info                | Hidden until necessary                         |
| Multi-project navigation           | Appears organically once they have 2+ projects |

## Key principles for the design

1. **One input box, no options.** Choice is friction. The AI handles the structuring.
2. **AI as compiler, not as chatbot.** Brain dump in → structured project out. The AI's output is _the product_, not a conversation about the product.
3. **Live, narrated feedback.** The user sees the AI working, not a spinner.
4. **Editable everything.** The AI's output is a starting point. Renaming, restructuring, deleting should all feel native.
5. **Templates are an add-on, not the entry point.** Offered after the scaffold is created, not before.
6. **Voice is a primary input mode**, not a secondary one. Especially for the messy brain dump.

## What we measure

Activation success = "user is still in the product after 5 minutes."

Specific events to track:

- Did the user complete a brain dump? (% who finished the input)
- Did the AI's scaffold appear? (technical success rate)
- Did the user edit any field in the scaffold? (engagement)
- Did the user create a second project within 24 hours? (retention signal)
- Did the user invite anyone or connect an agent within 7 days? (depth signal)

## What this enables downstream

If the first 60 seconds works:

- Template adoption becomes friction-free (user already has a structured project — templates layer in)
- Forking becomes natural (user understands what a "structured project" is, can recognize a good one in the wild)
- Agent integration is meaningful (the agent acts on a project that has real structure, not a blank slate)
- Creator outreach has a demo (DJ can show this in 60 seconds to anyone)

If the first 60 seconds doesn't work, _none_ of the downstream stuff saves the product.

## Open questions for DJ to riff on

1. **Voice or text as the default mode?** Voice is more activating but technically harder. Text is more universal but less magical.
2. **Should we show the AI working (streaming text) or batch the result?** Streaming feels alive but can feel slow. Batching feels instant but less trustworthy.
3. **Should template suggestions appear during the 60 seconds, or after?** Could be: "Here's your scaffold. Want to layer in [Ferriss's book template]?" — offered as enhancement, not initial choice.
4. **What about returning users?** The first 60 seconds for a new user is one design. The first 60 seconds for a returning user is different. What's the welcome-back experience? (Could be: "Yesterday you were working on X. Want to pick up there, or start something new?")
5. **Should we surface the brain dump as something the user can re-use?** Many users will type the same kind of stuff repeatedly. Keep a "brain dump history" they can refer to?
6. **How much of the AI work should be visible vs. invisible?** Showing the model's reasoning builds trust but adds noise. Hiding it feels magical but opaque.
7. **What's the _recovery_ experience if the AI scaffolds wrong?** "This isn't what I meant — try again" needs to be a 1-click action, not a re-input.

## The hardest single design call

**Should the AI ask a clarifying question, or just commit to a scaffold?**

Option A: AI scaffolds immediately, user edits if wrong (lower friction, higher chance of being slightly off)
Option B: AI asks 1-2 clarifying questions, then scaffolds (more friction, higher accuracy)

My instinct: **A by default, with B as a fallback for ambiguous inputs.** Commit to a scaffold first. Let the user edit. If the input is _too_ ambiguous to scaffold confidently, ask one question. Never more than one.

Reasoning: the magic moment is "I dumped, and structure appeared." Asking questions weakens the magic. But asking _one_ question is acceptable when the alternative is generating bad scaffolds 30% of the time.

## The 60-second demo script (for creator outreach)

The thing DJ should be able to show in a 60-second demo to anyone:

> "Open BuildOS. Type whatever's on your mind — I'll type 'I want to launch a podcast in 90 days but I don't know where to start.' Watch — the AI is reading it now, picking out the goal, sketching the phases, generating the first tasks. There. That's a structured project. I can edit anything. I can add a Tim Ferriss-inspired podcast template to deepen it. I can talk to it. I can come back tomorrow and pick up exactly where this is. That's BuildOS."

If this script is true and the demo works, the rest of the strategy clicks into place.
