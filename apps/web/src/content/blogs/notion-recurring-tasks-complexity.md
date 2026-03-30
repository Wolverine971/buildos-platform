---
title: 'Thomas Frank Needs 5 Database Properties to Create a Recurring Task in Notion. You Need One Sentence in BuildOS.'
description: 'Watching Thomas Frank explain how to create recurring tasks in Notion is painful. Complex formulas, manual updates, and database properties, all to do what should take 5 seconds.'
slug: 'notion-recurring-tasks-complexity'
publishDate: '2025-10-29'
author: 'DJ Wayne'
category: 'Comparison'
tags: ['notion', 'productivity', 'complexity', 'recurring-tasks', 'simplicity', 'organization']
featured: true
draft: false
seo:
    title: 'Why Creating Recurring Tasks in Notion Is Absurdly Complex | BuildOS Alternative'
    description: 'Thomas Frank needs 5 database properties, complex formulas, and manual updates to create recurring tasks in Notion. BuildOS does it with one sentence.'
    keywords:
        [
            'Notion recurring tasks',
            'Notion complexity',
            'Thomas Frank Notion',
            'recurring tasks app',
            'simple task management',
            'Notion alternative',
            'simple productivity tools'
        ]
path: apps/web/src/content/blogs/notion-recurring-tasks-complexity.md
---

<!--
BLOG TODO - 2026-03-30
Priority: Highest

Why this needs work:
- This post currently overstates Notion's limitations around recurring tasks.
- Current Notion docs now include database automations and recurring-template behavior.
- The "Notion still cannot really automate this" framing is no longer reliable enough for a live comparison post.

What to update:
- Reframe from "Notion cannot do recurring tasks" to "Notion can do them, but the setup/maintenance cost is still much higher than BuildOS."
- Re-check every sentence that implies impossible / unsupported / not automatable.
- Keep the simplicity argument, but make it honest against current Notion capabilities.
- Verify that every BuildOS recurrence example used here is supported exactly as written.

Things to explore:
- Is the strongest angle now setup friction, maintenance burden, or natural-language scheduling?
- Should Thomas Frank remain the lead hook, or should this become a broader "recurring tasks should not feel like system design" article?
- Would a comparison against current Notion automations be more credible than centering an older tutorial?

Current source checks:
- https://www.notion.com/en-gb/help/database-automations?nxtPslug=database-automations
- https://www.notion.com/help/category/notion-ai
-->

I watched [Thomas Frank's YouTube short](https://youtube.com/shorts/yYNbf__-gx4) on creating recurring tasks in Notion.

And I felt **physical pain**.

Not because Thomas did anything wrong. He's brilliant. But because what he's explaining is the kind of workaround-heavy setup Notion users have often had to build for something that should feel much simpler.

Let me show you what I mean.

## One Notion Way: A 5-Property, Multi-Formula Journey to Insanity

According to [Thomas Frank's comprehensive tutorial](https://thomasjfrank.com/how-to-create-recurring-tasks-repeat-due-dates-in-notion/), here's one common way users have set up recurring tasks in Notion:

### Required Database Properties (5 of them)

1. **Due** (Date field) - Your current task deadline
2. **Next Due** (Formula field) - Calculates when the task should recur
3. **Recur Interval (Days)** (Number field) - How many days between occurrences
4. **Type** (Select field) - Distinguishes "One-Time" from "Recurring" tasks
5. **State** (Formula field) - Visual status indicator (color-coded circles)

### The Formula Complexity

**Next Due Formula**: A nested conditional monster with approximately **15+ operations** that handles:

- Tasks due today/future (simple interval addition)
- Overdue tasks (complex math dividing days elapsed by interval)
- Accounting for the `now()` function always including time values

**State Formula**: A three-level nested if-statement displaying white/green/red/blue circles based on due date relationships.

### The Workflow

1. Duplicate the template into your workspace
2. Modify view filters for assignees
3. Create custom date-range views (example: one-week filter)
4. Add tasks with Type and other properties
5. Set Recur Interval for recurring tasks
6. **Manually update Due dates after completion** ⚠️

### The Critical Limitation In This Workflow

Here's Thomas Frank's own words:

> "It's not possible to automate checkbox completion with date updates because Notion properties cannot be changed by both manual editing and formulas/automation simultaneously."

**Translation: in this workflow, you have to manually update the due date every time you complete a recurring task.**

Notion has added newer automation features since this tutorial, but the broader problem remains: recurring tasks in Notion still tend to push users toward building and maintaining a system instead of simply stating what they want.

## This Is Not a Power User Feature. This Is Product Failure.

Let me be crystal clear: **Recurring tasks should not require formulas.**

They shouldn't require:

- Database schema design
- Property configuration
- Formula debugging
- Template duplication
- Manual date updates

**They should just... work.**

## The BuildOS Way: "Create a recurring task for X"

Here's the entire workflow in BuildOS:

**You say**: "Create a recurring task to review my goals every Monday"

**AI does**:

- Creates the task
- Sets it to recur weekly on Mondays
- Adds it to your project
- Done

**Time elapsed**: 5 seconds

**Properties configured**: 0

**Formulas written**: 0

**Manual updates required**: 0

**Existential dread**: 0

### Actually, Let's Get More Complex

Want to get fancy? Try this:

**You say**: "I need to review quarterly goals every 3 months starting next week, follow up with my team lead every Tuesday, and do a quick check-in with clients every other Friday"

**BuildOS creates**:

- Quarterly goal review (every 3 months, starts next week)
- Team lead follow-up (weekly on Tuesdays)
- Client check-in (bi-weekly on Fridays)

All three recurring tasks. All properly scheduled. All intelligent.

**Formula complexity**: Still zero.

## Why This Matters More Than You Think

### The Cognitive Load Tax

Every minute spent learning Notion formulas is a minute not spent doing actual work.

Every property you configure is cognitive load you're carrying.

Every manual update is a chance to forget, to fall behind, to feel like you're failing at a "productivity" tool.

**For anyone struggling with organization, this complexity isn't just annoying. It's a barrier to getting things done.**

### The Expertise Barrier

Thomas Frank is literally one of the world's top Notion experts. He's created comprehensive tutorials, templates, and courses.

**And even he can't make recurring tasks fully automatic in Notion.**

If Thomas Frank hits a wall with Notion's limitations, what hope does a regular user have?

### The Tool Serving Itself

Notion has become a tool that requires you to serve it, rather than serving you.

You're not organizing your tasks. You're architecting a task management system. You're a database administrator for your own to-do list.

**This is backwards.**

## The Philosophy Gap

### Notion's Philosophy: "Give Users Infinite Flexibility"

- Blank slate approach
- Database-first design
- Formula-driven logic
- Manual everything
- Power through complexity

**Result**: Users spend more time building systems than using them.

### BuildOS Philosophy: "Remove All Friction"

- Natural language first
- AI-powered intelligence
- Automatic structure
- Zero setup
- Power through simplicity

**Result**: Users capture thoughts and get organized in seconds.

## Real Talk: When Notion Makes Sense

Notion isn't bad. It's powerful for:

- Team wikis and documentation
- Rich content creation
- Collaborative databases
- Complex information architecture

**But for recurring tasks?** Using Notion for recurring tasks is like using a Swiss Army knife to hammer a nail. Yes, it _can_ work, but there are better tools.

## The Reality Check for Disorganized Minds

Let's talk about what happens when someone who struggles with organization encounters Notion's recurring task setup:

### Scenario 1: The Optimistic Start

1. **Day 1**: "I'm going to set up the perfect recurring task system!"
2. **Day 1, Hour 2**: Still reading Thomas Frank's tutorial
3. **Day 1, Hour 4**: Trying to understand the formula
4. **Day 2**: Distracted by something else
5. **Day 30**: Recurring tasks still not set up
6. **Day 60**: Gave up on Notion entirely

### Scenario 2: The Template User

1. Duplicates Thomas Frank's template
2. Tries to customize it
3. Breaks the formula
4. Can't figure out what went wrong
5. Abandons the template
6. Back to scattered Apple Notes

### Scenario 3: The BuildOS User

1. Opens BuildOS
2. Says what they need
3. It's done
4. Gets back to actual work

**One of these is designed for how human brains actually work. The others are designed for... database administrators?**

## The "But I Like Complexity" Argument

I hear you. Some people genuinely enjoy setting up complex systems. They find it satisfying, even meditative.

**That's totally valid.**

But here's the thing: that preference becomes a **barrier to entry for everyone else**.

When recurring tasks require formula expertise, you've created a system that excludes:

- People who struggle with organization and executive function
- Non-technical users
- Anyone who just wants to get stuff done
- Busy professionals who don't have time for database design

**Complexity as a feature is actually exclusion as a design choice.**

## What Thomas Frank's Tutorial Actually Reveals

Thomas Frank's tutorial isn't a testament to Notion's power. It's a **diagnostic report** of Notion's failure to solve a basic productivity need.

Think about it:

- **Email**: Has recurring sends (newsletters)
- **Calendar**: Has recurring events (meetings)
- **Banking**: Has recurring transfers (autopay)
- **Notion**: Requires 5 properties, custom formulas, and manual updates

**One of these is not like the others.**

## The Path Forward

### If You're Deep in Notion

You don't have to abandon Notion entirely. Use it for what it's good at:

- Documentation
- Knowledge bases
- Team collaboration
- Rich content

But for task management, especially recurring tasks, consider tools built specifically for that purpose.

### If You're Looking for Simple

BuildOS is built on one principle: **Natural language should be enough.**

No formulas. No properties. No setup.

Just say what you need, and it happens.

### If You Struggle with Organization

You already know the pain of tools that demand organization _before_ they help you get organized.

BuildOS flips that script. It meets you in the chaos and creates structure from it.

## The Real Question

**How many hours have you lost to tool complexity?**

Hours watching tutorials. Hours configuring properties. Hours debugging formulas. Hours feeling inadequate because you can't master a "simple" productivity tool.

Those hours are gone. But future hours don't have to be.

## What BuildOS Users Say

_"I spent a weekend trying to set up recurring tasks in Notion. BuildOS did it in 10 seconds."_ - Former Notion power user

_"Thomas Frank's tutorials are amazing, but they made me realize I was learning database design when I just wanted to remember to water my plants."_ - Overwhelmed entrepreneur

_"The fact that recurring tasks are this hard in Notion is insane. BuildOS just works."_ - Product manager who switched

**The pattern is clear: Complexity isn't a feature. It's a bug.**

## Try It Yourself

Want to see how simple recurring tasks should be?

[**Try BuildOS free →**](/auth/register)

Create a recurring task in one sentence. No formulas. No properties. No tutorial required.

If it takes more than 30 seconds, we've failed.

Spoiler: It won't.

---

## One Final Thought

**Thomas Frank is not the problem. He's solving the problem Notion created.**

His tutorials exist because Notion made simple things complex. He's a brilliant teacher making the best of a flawed system.

But you don't have to accept that system.

You can choose tools that respect your time, your brain, and your actual goals.

**You can choose simplicity.**

That's what we're building at BuildOS.

Come see the difference.

[**Start your free trial →**](/auth/register)
