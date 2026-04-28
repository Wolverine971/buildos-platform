---
title: "Debug The Harness, Not The Model: An Agent Skill From Anthropic's Claude Code Team"
description: 'A portable agent skill for working with frontier LLMs: when the model does something weird, ask it why, fix the harness, and strip prompt scaffolds every time a new model ships.'
author: 'DJ Wayne'
date: '2026-04-27'
lastmod: '2026-04-27'
changefreq: 'monthly'
priority: '0.8'
published: false
tags: ['agent-skills', 'agent-engineering', 'llm', 'harness', 'evals', 'claude-code', 'buildos']
readingTime: 9
excerpt: 'Cat Wu, head of product for Claude Code, calls model introspection one of her most underrated techniques. This is the operating model: ask the model why it failed, fix the harness, and remove crutches every time a new model ships.'
skillId: 'agent-engineering/debug-the-harness-not-the-model'
skillType: 'soft'
skillCategory: 'agent-engineering'
providers: ['Claude', 'OpenAI', 'any frontier LLM']
compatibleAgents: ['BuildOS-compatible agents', 'Claude Code', 'Codex', 'portable Agent Skills']
stackWith: ['Eval-driven product development', 'Founder assistant stack']
skillSource: 'docs/marketing/growth/research/youtube-transcripts/2026-04-24_PplmzlgE0kg.md'
installHint: '.agents/skills/debug-the-harness-not-the-model/SKILL.md'
sourceTitle: "How Anthropic's product team moves faster than anyone else | Cat Wu (Head of Product, Claude Code)"
sourceCreator: "Lenny's Podcast"
sourceUrl: 'https://www.youtube.com/watch?v=PplmzlgE0kg'
sourceChannelUrl: 'https://www.youtube.com/@LennysPodcast'
path: apps/web/src/content/blogs/agent-skills/debug-the-harness-not-the-model.md
---

Most teams treat agent failures the same way they treat code bugs: stare at the trace, guess at a fix, push a patch. With LLM-powered products, that loop is almost always wrong. The model already knows more about what it just did than your stack trace does. You just have to ask it.

This skill is built around one of the more underrated techniques used inside Anthropic's Claude Code team: when the model does something unexpected, ask the model to introspect on its own behavior, and use the answer to fix the harness around it.

It pairs with a second habit you should adopt the moment a new model ships: read your entire system prompt and delete every line the smarter model no longer needs.

Both habits push in the same direction. Stop trying to out-guess the model. Treat the model as a collaborator who can tell you why your wrapper is leading it astray.

## Source Attribution

This skill was distilled from [How Anthropic's product team moves faster than anyone else | Cat Wu (Head of Product, Claude Code)](https://www.youtube.com/watch?v=PplmzlgE0kg) on [Lenny's Podcast](https://www.youtube.com/@LennysPodcast).

The technique appears around the 51-minute mark, when Cat describes it as one of the things she does most often when a model behaves in an unexpected way, and again at the 60-minute mark when she walks through how the team rereads the entire system prompt every time a new model ships.

## What This Skill Is For

Use this skill when you build, maintain, or debug a product that runs on a frontier LLM and you have any kind of harness around it: a system prompt, sub-agents, tool definitions, retrieval pipeline, or skill files.

**Trigger phrases**

- "the model is doing X but I want it to do Y"
- "this used to work and now it's worse"
- "the agent skipped a step"
- "the prompt is getting too long"
- "we just upgraded to a new model"
- "I don't understand why it picked that tool"
- "users are complaining about a regression"

**Jobs to be done**

- Diagnose unexpected agent behavior without re-running the full task five times.
- Decide whether the fix belongs in the model, the system prompt, the tool definitions, or the sub-agent boundary.
- Audit a long-lived system prompt for stale instructions.
- Decide what to remove on a model upgrade, not just what to add.

**When not to use it**

- You are debugging deterministic, non-LLM code. Read the trace.
- The failure is a wholesale capability gap that no prompt rewrite will close. Wait for the next model.
- You have not yet shipped the feature once. Build a working baseline first; introspection without a baseline is theater.

## The Operating Model

Most agent failures fall into one of three buckets:

1. **The harness misled the model.** Confusing system prompt, missing context, an unhelpful tool description, a sub-agent that swallowed responsibility for verification.
2. **The model lacks the capability.** The current model truly can't do this task reliably yet.
3. **The user prompt was bad.** Underspecified or contradictory.

Without asking the model, you can't easily tell which one you're in. With model introspection, you can usually rule out at least one.

The mental shift is: **the failure is not the answer to your question.** The model's explanation of the failure is the answer. The trace tells you that something went wrong. The model can often tell you why.

Cat describes a classic case: the agent makes a frontend change, runs tests, but never opens the UI. Asking the model directly produces answers like "I delegated the verification to a sub-agent and didn't check its work" or "I missed that frontend verification was part of this task." Both point at the harness, not the model. One you fix with a sub-agent boundary change, the other with a prompt edit.

The second habit is the long-lived counterpart. System prompts grow over time. Each crutch you add was reasonable when you added it. Smarter models stop needing those crutches. If you never strip them, your prompt becomes a museum of fixes for problems you no longer have, and it costs tokens, attention, and clarity every single call.

## The Skill In Three Steps

### 1. When something looks wrong, ask the model why

Pick the conversation where the unexpected behavior happened. In the same session if you can, ask something like:

- "Walk me through your reasoning for the last response."
- "Why did you skip running the UI test before reporting done?"
- "What part of the system prompt or tool description made you think you should do X?"
- "If you had to pick the single thing that misled you, what would it be?"

Resist the urge to argue with the answer. You're not negotiating; you're collecting evidence.

### 2. Decide where the fix goes

Map the introspection answer to one of these buckets:

| The model says...                                  | Fix goes in                                   |
| -------------------------------------------------- | --------------------------------------------- |
| "The system prompt told me to skip verification"   | System prompt                                 |
| "I didn't see a tool for that"                     | Tool definitions / availability               |
| "I delegated to a sub-agent who didn't check"      | Sub-agent contract or verification boundary   |
| "The user's request was ambiguous"                 | Prompt template / clarifying-question pattern |
| "I genuinely don't know how"                       | Capability gap — wait, or change the task     |
| "I didn't realize that step was part of this task" | Task framing in system prompt or skill file   |

If the model gives a vague answer, push back: "Be more specific. Quote the line or tool that misled you." Models will often produce a verbatim citation if you ask.

### 3. After the fix, verify it on a tiny eval

Don't just patch and move on. Capture the failure as a test case. You don't need a hundred evals — Cat is explicit that ten great ones beat a hundred mediocre ones. The eval is the receipt for your fix and the early warning for the next regression.

## The New-Model Audit

Run this every time you upgrade the model behind your product.

1. Read the entire system prompt out loud, top to bottom. Yes, out loud.
2. For every paragraph, ask: "Does this smarter model still need this reminder?"
3. Pay particular attention to phrases like "remember to", "don't forget", "make sure to", "always", "never". Most are crutches for older models.
4. Delete or shorten anything the model no longer needs.
5. Re-run your eval set after the cuts. If a metric drops, restore the most relevant crutch. If nothing drops, ship the lighter prompt.

The Claude Code team treats this audit as a release-day ritual, not a "when we have time" task. The benefit compounds: a leaner prompt is faster, cheaper, easier to read, and less likely to fight a smarter model's instincts.

A good rule of thumb: if a smarter model already does the thing naturally, scaffolding for it doesn't help and often hurts. The to-do-list pattern Claude Code added for early models became unnecessary by Opus 4. The team kept it as a UX surface but stopped requiring it in the prompt.

## The Portable Skill Definition

Copy this into `.agents/skills/debug-the-harness-not-the-model/SKILL.md` and adapt to your stack.

```markdown
---
name: debug-the-harness-not-the-model
description: When an LLM-powered agent behaves unexpectedly, ask the model to introspect, route the fix to the right layer (prompt, tools, sub-agent, capability), and on every model upgrade strip prompt scaffolds the smarter model no longer needs. Use when an agent regresses, picks the wrong tool, skips a step, or after upgrading to a new model.
---

# Debug The Harness, Not The Model

You are working on or with an LLM-powered product. When the agent behaves unexpectedly, treat its own explanation as primary debugging evidence.

## When To Use This Skill

Trigger this skill when:

- An agent skipped a step, ran the wrong tool, or produced a bad answer that you can reproduce.
- A previously-working flow regressed.
- You upgraded the underlying model in the last 7 days.
- Your system prompt has grown to over 1,500 tokens and you have not audited it recently.
- A user complained about a specific failure and you have the conversation.

Do not trigger this skill when:

- You are debugging deterministic non-LLM code. Read the trace.
- The product has never worked end to end once. Build a baseline first.
- You believe the failure is a capability gap and no prompt change will fix it.

## Core Workflow

### Step 1 — Ask the model why

In the failing conversation, ask the model directly:

- "Walk me through your reasoning for the last decision."
- "What in the system prompt or tools made you choose that path?"
- "If one specific instruction or tool misled you, which one?"

Collect the explanation. If vague, push for a verbatim quote of the misleading instruction.

### Step 2 — Route the fix

Map the model's answer to the correct layer:

- Misleading instruction → system prompt edit.
- Wrong or missing tool → tool definition, description, or availability.
- Delegated work that wasn't verified → sub-agent contract or final-verification step.
- Ambiguous user prompt → user prompt template or a clarifying-question step.
- "I genuinely don't know how" → capability gap; do not patch, log it.

### Step 3 — Capture the failure as an eval

Add a small eval that reproduces the failure. Aim for ten great evals total, not a hundred mediocre ones. Treat each new failure as a chance to grow the set.

## The New-Model Audit

Every time you upgrade the model:

1. Read the entire system prompt top to bottom.
2. For every paragraph, ask whether the smarter model still needs this reminder.
3. Delete or shorten anything labeled with "remember to", "always", "never", "don't forget" that the new model already follows on its own.
4. Run the eval set. If something regresses, restore the most relevant scaffold. If nothing regresses, ship the lighter prompt.

## Decision Heuristics

- Prefer one introspection question over five guesses.
- Prefer deletion over addition when working on a long-lived prompt.
- Trust verbatim citations of the prompt over vague self-justifications.
- Treat the to-do-list crutch as the canonical example: scaffolding that helped Sonnet 4 may hurt Opus 4.6.
- A 95%-reliable automation is not an automation. Push to 100% by capturing the last 5% as evals and prompt fixes.

## Stop Conditions

Stop and ask a human if:

- Two introspection rounds give contradictory answers.
- The model explicitly says it lacks a capability that you cannot give it.
- A prompt edit fixes the eval but breaks two other evals.
- The fix would require you to ship customer data into the system prompt.

## Examples

### Example 1 — Skipped frontend verification

The agent makes a frontend change, runs unit tests, reports done. The UI is broken.

Ask: "Why did you skip opening the UI to verify the change?" Model says: "I delegated UI verification to the verifier sub-agent, and I didn't check whether it ran." Fix: tighten the sub-agent contract — verifier must report a checked status, primary agent must not report done without it.

### Example 2 — Model invents a tool

The agent describes calling a tool you don't have. Ask: "Where did you see that tool?" Model says: "The system prompt mentioned `search_repo` in the example, so I assumed it existed." Fix: remove the example or make it real.

### Example 3 — Model upgrade audit

You move from Sonnet 4 to Opus 4.6. Read the prompt. Delete the paragraph that says "before answering, write a step-by-step plan in a to-do list". Re-run evals. Plan-quality eval is unchanged; latency drops 12%; ship.

## References

- Source: [How Anthropic's product team moves faster than anyone else | Cat Wu (Head of Product, Claude Code)](https://www.youtube.com/watch?v=PplmzlgE0kg) — Lenny's Podcast.
- Companion skill: eval-driven development; ten great evals beat a hundred mediocre ones.
```

## How To Use It In BuildOS

BuildOS runs an agentic-chat surface, a brain-dump pipeline, daily briefs, and a project ontology — every one of those is a harness around a frontier model. This skill is how we keep them honest as models change underneath us.

A practical example: when the brain-dump processor stopped extracting tasks for a particular kind of stream-of-consciousness input, the right move was not to rewrite the extraction prompt from scratch. It was to ask the model in the failing session what made it skip those candidates. The answer pointed at one bullet in the system prompt that, with the newer model, was being read as an exclusion rule rather than a guideline. One-line edit. Eval added.

You can apply the same loop to your own BuildOS workspace if you wire your agents into shared context — calendar, notes, brain dumps. When the agent does something off, capture the conversation, ask it why in the next turn, and treat the answer as your debugging signal.

## Failure Modes

Without this skill, agent teams tend to fail in the same handful of ways.

**They argue with the trace.** They look at the model output, decide what they think went wrong, and patch the prompt. They never check whether their theory matches the model's actual reasoning. Half the time it doesn't.

**They only add, never remove.** System prompts accrete crutches over months. New crutches get added on top of stale ones. Token cost grows. Conflicts between instructions grow. The smarter model fights its own scaffolding.

**They treat 95% as done.** Cat is blunt about this: a 95% automation is not an automation. The last 5% is where the user notices, and it's also where the most valuable evals come from.

**They mistake personality for performance.** When a model upgrade changes the agent's tone, teams pile on prompt instructions trying to recover the old vibe. They miss that the model's underlying behavior may already be better — they're just attached to the old surface.

**They never build a small eval set.** Without ten good evals, you cannot tell whether your fix actually fixed anything. Introspection without an eval is just better-informed guessing.

## Source Notes

- [Lenny's Podcast — Cat Wu, Head of Product, Claude Code](https://www.youtube.com/watch?v=PplmzlgE0kg) — primary source.
- The introspection technique appears explicitly at the 51:15 timestamp ("The emerging skills PMs need for AI companies") and again at 1:00:44 ("How new models force product changes").
- The "ten great evals over hundreds" guidance appears at 55:00 ("Why building evals is underappreciated").
- The 95%-isn't-an-automation rule is at 1:09:18 ("Why 95% automation isn't good enough").
- The system-prompt audit ritual is at 1:02 in the same segment.
