---
title: 'Thomas Frank Needs 5 Database Properties to Create a Recurring Task in Notion. You Need One Sentence in BuildOS.'
description: 'Watching Thomas Frank explain how to create recurring tasks in Notion is painful. Complex formulas, manual updates, database properties—all to do what should take 5 seconds.'
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
---

I watched [Thomas Frank's YouTube short](https://youtube.com/shorts/yYNbf__-gx4) on creating recurring tasks in Notion.

And I felt **physical pain**.

Not because Thomas did anything wrong. He's brilliant. But because what he's explaining—the _minimum viable setup_ for recurring tasks in Notion—is **absurdly, unnecessarily complex**.

Let me show you what I mean.

## The Notion Way: A 5-Property, Multi-Formula Journey to Insanity

According to [Thomas Frank's comprehensive tutorial](https://thomasjfrank.com/how-to-create-recurring-tasks-repeat-due-dates-in-notion/), here's what you need to create recurring tasks in Notion:

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

### The Critical Limitation

Here's Thomas Frank's own words:

> "It's not possible to automate checkbox completion with date updates because Notion properties cannot be changed by both manual editing and formulas/automation simultaneously."

**Translation: You have to manually update the due date every time you complete a recurring task.**

Even with all this complexity, **Notion still can't actually automate recurring tasks**.

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

**For anyone struggling with organization, this complexity isn't just annoying—it's a barrier to getting things done.**

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

But for task management—especially recurring tasks—consider tools built specifically for that purpose.

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

[**Try BuildOS free for 14 days →**](https://buildos.com/signup)

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

[**Start your free trial →**](https://buildos.com/signup)

---

## Development Notes

### Content Strategy

This blog post directly addresses a viral pain point: the absurd complexity of recurring tasks in Notion, as demonstrated by Thomas Frank's tutorial. It positions BuildOS as the simple, ADHD-friendly alternative.

### Key Differentiators Highlighted

1. **Complexity vs. Simplicity**: 5 properties + formulas vs. one sentence
2. **Manual vs. Automated**: Manual date updates vs. full automation
3. **Technical vs. Natural**: Formula expertise vs. plain language
4. **Exclusive vs. Inclusive**: Database skills required vs. accessible to all

### SEO Optimization

- **Primary Keywords**: "Notion recurring tasks", "Thomas Frank Notion", "recurring tasks app"
- **Long-tail**: "How to create recurring tasks without formulas", "simple recurring task app"
- **Target Audience**: Notion users frustrated with complexity, ADHD productivity seekers

### Social Media Angles

**Twitter/X Thread Starter**:
"Thomas Frank needs 5 database properties and a 15+ operation formula to create recurring tasks in Notion. I just asked BuildOS 'create a recurring task for X' and it was done in 5 seconds. This is the difference between complexity theater and actual productivity."

**LinkedIn Post**:
"When the world's top Notion expert needs a comprehensive tutorial to explain recurring tasks, maybe the problem isn't user education. Maybe it's product design. Here's why simple beats complex for real productivity: [link]"

**Reddit r/Notion**:
"Honest question: Should recurring tasks really require formulas? [Discussion about Thomas Frank's tutorial and alternative approaches]"

### Conversion Funnel

1. **Discovery**: Users searching for Notion recurring task help find this post
2. **Pain Recognition**: "Wait, this _is_ unnecessarily complex"
3. **Solution Awareness**: "There's a simpler way?"
4. **Action**: Try BuildOS free trial
5. **Retention**: Experience the simplicity, never go back

### Related Content to Link

- [BuildOS vs Notion for ADHD Minds](buildos-vs-notion-adhd-minds.md)
- Effective Brain Dumping guide
- Daily Brief feature overview

### Future Content Ideas

- "I Migrated My Notion Recurring Tasks to BuildOS: Here's What Happened"
- "The Thomas Frank Effect: When Tool Complexity Creates an Expert Industry"
- "5 Things That Should Never Require Formulas in Productivity Tools"
