<!-- design/insights-ryo-lu.md -->

# Ryo Lu Design Insights & Principles

> Head of Design at Cursor, formerly at Notion. Known for building "Real OS" - a personal retro operating system built entirely with Cursor.

---

## Table of Contents

1. [Core Design Philosophy](#core-design-philosophy)
2. [Systems Thinking](#systems-thinking)
3. [Building with AI](#building-with-ai)
4. [The Future of Interfaces](#the-future-of-interfaces)
5. [Practical Workflow Tips](#practical-workflow-tips)
6. [Advice for Designers](#advice-for-designers)
7. [Product Development Principles](#product-development-principles)
8. [Key Quotes](#key-quotes)

---

## Core Design Philosophy

### Simplicity Over Minimalism

Ryo makes a critical distinction between **simplicity** and **minimalism**:

- **Minimalism** = Fewer options, fewer decisions, isolating to a small group of users
- **Simplicity** = Core concepts are simple, but they combine and multiply into emergent complexity

> "At the core of what you're doing is really simple concepts where the architecture of things are really simple. But each of them combine and they're layered. They multiply, they emerge in complexity so it scales and works better for more people."

**The Pattern:**

- Build robust, flexible low-level primitives
- Let them combine to serve anyone, do anything, build anything
- Examples: Notion (blocks, pages, databases) / Cursor (code, agent, models, tools)

### "Living Tools" vs Static Design

Ryo rejects the idea of "final" designs:

> "In my career as a professional product designer, the thing I hate the most is people want the design to be final. 'Where's the final version of this mock? If you don't have it, I won't start building it.' That doesn't make sense because the first mock is never right."

**Key insight:** Tools should be **living** - they evolve with use, context, and the people using them.

### Soul in Software

- Every detail matters
- Don't accept whatever "purple gradient" the AI gives you
- AI output is the **beginning**, not the end
- Put your soul into the bricks you build

---

## Systems Thinking

### Unifying Concepts

Ryo's first major contribution at Cursor was unifying five separate concepts (tab, command K, chat, composer, agent) into **one thing**.

**The Process:**

1. Understand the whole system - know every bit of it
2. Consume information from outside (users, bug reports, feedback) AND inside (the actual code)
3. Come up with better models
4. Don't get rid of things - **unify** them
5. Build layers of the same thing

> "Instead of five discrete little things, you just make the circle big. It's now one thing. But there are still ways for people to do the five discrete things. Maybe instead of just five things, now there's N things."

### Concepts That Never Change

When building for an uncertain future, identify:

- What are the concepts that will **never change**?
- What are the most essential patterns in the whole system?
- How do they translate between each other?

**Example:** Whether you're on mobile, web, background agent, or IDE - they're conceptually the same things in different forms.

### The To-Do List Revelation

When designing multi-agent task management:

> "I was like, 'Oh shit, it's to-do list all over again.' I've done this so many times. Every single time we're back to the to-do list. In a list view, grid view, column, kanban board - the same thing. The only difference is these things might be done by the agent."

**Takeaway:** Universal patterns persist. Identify them and build around them.

---

## Building with AI

### The Vibe Coding Workflow

Ryo's creative process with AI:

1. **Start with "slop"** - AI output is never good on first try
2. **Poke at it** with little prompts
3. **Refine iteratively** - sculpt like clay
4. **Don't fake it** - work with real code, real data, real states

> "Before people had to write docs, PRDs, make plans in Linear, draw pixels in Figma, stitch everything with a process. Now it's almost like sculpting. You get something, then you poke at it. Maybe get rid of certain parts. Maybe re-wrangle. Maybe say 'do it again, again, again, do it five times. Pick the right one.'"

### Why Code Over Figma for Prototypes

- **Real interactions** - can't fake AI responses, chat states, dynamic content
- **Feel it** - the only thing that matters for interactions like "stop and queue"
- **Scales** - as codebase gets complex, Cursor has tools to cover it
- **No limitations** - code is the material, you can do whatever

> "It's impossible to move the needle in Figma for anything with AI output. It's impossible."

### The "One Shot" Evolution

Early AI coding: Required specific technical instructions (use Bun, use Shadcn, mention codebase details)

Now: Can do almost anything one-shot and just tweak a little

**Key insight:** As models improve, the gap between idea and reality approaches zero.

### Building Real OS: A Case Study

How Ryo built 130k lines of code as a solo side project:

1. Started with ONE app (soundboard)
2. Asked AI to make it "more retro Mac OS-y"
3. "Put it in a window" → "Make a menu bar" → "Why only one app?"
4. Each step, redesigned the architecture with the agent
5. Pure vibes, no plans

**Time comparison:** ChatGPT estimated it would take "months or years with tens of people" - Ryo did it in 1-2 months of vibe coding.

---

## The Future of Interfaces

### Personalization as the Antidote

Problem: Products at scale lose soul by dumbing down for universal appeal.

Solution: **Personalization** - the interface changes based on who you are.

> "The ideal interface is different for every single person. Instead of designing exactly how this piece of UI will look, you are actually designing a container."

### Designing Containers, Not Screens

The designer's role shifts:

- **Before:** Design exact pixel states for universal understanding
- **After:** Design the essential patterns and their possible configurations

> "Coming up with the right set of blocks for AI to wield for each user dynamically is probably more important now than at any point ever in designing digital products."

### Dynamic, Not Arbitrary

Important distinction on AI-generated UIs:

> "Arbitrary generating UI that even the creators cannot control or predict is not a good thing. It creates chaos."

**Better approach:** AI reconfigures existing primitives based on user context, not generating random interfaces.

### Forms That Haven't Changed

Despite all the AI hype, fundamental interaction patterns persist:

- To-do lists
- Visual, list, card, table views
- How people process information

> "The forms we interact with haven't changed much and they don't need to."

---

## Practical Workflow Tips

### Information Gathering

Ryo absorbs signal from everywhere:

- Twitter, Slack, user reports, feedback
- "It's like training a model - feeding data, building intuition"
- The more you see, the better your priorities and sense become

### Filtering Feedback

Build an internal "processor" to filter noise:

- Most little decisions in isolation don't matter
- Direction, concepts, ideas matter more than exact execution
- Get a sense of what the person **really wants**, not their proposed solution
- Ignore solutions that aren't important (even your own)

### The Walk-and-Type Method

For conceptual work:

- Take walks around the office
- Type ideas on phone (Notion) as bullet lists
- Capture conceptual stuff while moving
- Return for visual problems that need 2D space/pixel placement

### Tools for Different Problems

| Problem Type                        | Tool                  |
| ----------------------------------- | --------------------- |
| Conceptual thinking, ideas          | Walking + phone notes |
| Layout exploration, visual patterns | Figma                 |
| Interactions, AI states, prototypes | Cursor/code           |
| Documentation, specs                | Plan mode in Cursor   |

### The Plan Mode Workflow

1. Switch to plan mode
2. Agent does research, thinks of questions for ambiguous things
3. Agent writes detailed spec in markdown
4. Review and modify like a Google doc
5. Hit "build" - flips to building mode
6. Agent implements the spec

> "The spec is not dead. It's AI-assisted, you review it, then the agent does the work."

---

## Advice for Designers

### Getting Started

1. **Download Cursor**
2. **Start simple** - don't plug Figma workflow in immediately
3. **Explore with the agent** - learn software concepts
4. **Don't be afraid** - if stuck, ask agent to fix or explain

### What to Learn

Not: Exact TypeScript syntax

**Yes:**

- How to structure components
- How things flow together (props, etc.)
- Software architecture concepts

> "We're basically writing software in a proxy. The end result of our work is still code that gets changed."

### The Designer Revolution

Ryo predicts designers will "revolt" as they gain these skills:

**Old way:** Designer screenshots "here's wrong, here's wrong, here's the spec, here's my redline" → back to engineer → loop again

**New way:** Designer comes in, does "fix this, fix this, fix this" → sends to Cursor in Slack → boom, fixed

### Why Prototyping in Code Matters

> "It just feels a lot more real than some pictures in Figma."

Benefits:

- Interact with live states of the app
- Real data, real behaviors
- No proxy artifacts or representations

---

## Product Development Principles

### How Cursor Ships

- No long-term roadmaps
- No "planning theater" with yearly plans and Northstar Figmas
- Fast feedback loops, talk to users
- Fuzzy direction + present state + small aligned steps

> "Because the world is changing faster and faster, it's more important to be flexible and not prescriptive of each thing you're gonna do."

### Roles Are Muddy

At Cursor:

- Designer/PM/Engineer distinctions blur
- Everyone does what matches their unique strength
- Use the agent to tie everything together
- Assemble people together when needed

> "We're just builders. We have ideas. We want to build the best thing together."

### Shipping Philosophy

1. Engineer builds something or has an idea
2. Makes a prototype (maybe janky)
3. See promise → make it better
4. Ship to nightly users first
5. Iron out bugs
6. Ship to consumers
7. Enterprise gets slowest/most stable

### The "Serving Everyone" Principle

Build mechanisms for people to move along the spectrum:

- Manual control ←→ Full automation
- Expert coders ←→ Vibe coders

> "You might get it wrong, then you build mechanisms for people to move progressively. You don't want to nudge people completely."

---

## Key Quotes

### On Building

> "I have an idea. I'll draw some sketches. I'll maybe verbally describe it to the agent. Maybe I'll take a picture of a napkin sketch. And then boom, done. That's it."

### On Roles

> "I started building things without knowing the distinctions between a designer, engineer, a PM. I just made stuff myself. I designed the thing in my mind. I coded it. And I just felt this whole thing doesn't make sense."

### On AI Output

> "You always start with slop with AI and then you refine it. AI output is the beginning, not the end."

### On the Future

> "The interface will just become how you think and I think it will just get closer to you. Maybe we don't operate from proxy devices. Maybe it's even closer - floating in my mind instead of on a screen."

### On What Matters

> "The importance of language. That is actually a big part of my job now - clarifying concepts and ideas into their simplest form that doesn't change."

---

## Summary: Ryo's Design Tenets

1. **Think in systems, not features** - unify, don't fragment
2. **Build flexible primitives** - simple cores that combine into complexity
3. **Work with the real material** - code, not proxies
4. **Start with slop, refine with soul** - AI is the beginning
5. **Design for personalization** - containers over static screens
6. **Move fast, stay flexible** - no planning theater
7. **Blur the roles** - everyone is a builder
8. **Serve the spectrum** - manual to automated, expert to beginner
9. **Universal patterns persist** - to-do lists never die
10. **Put your soul in it** - don't accept mediocre AI output
