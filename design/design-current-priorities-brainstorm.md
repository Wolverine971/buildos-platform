<!-- design/design-current-priorities-brainstorm.md -->

# Current Priorities - Brainstorm

**Date:** 2026-02-05
**Status:** Brainstorming / Investigation

---

## Overview

A collection of current priorities and strategic thinking for BuildOS.

---

## Agentic Chat Problem

The agentic chat flow is failing. It's doing too much, it's too complicated.

---

## Proposed Solutions

### 1. HTML-Style Prompt Sectioning

**Idea:** Use HTML-like tags to clearly separate different parts of the prompt, helping the LLM distinguish between:

- Instructions
- Context
- Data pieces

**Why:** Clear structural boundaries may help the LLM process different sections appropriately rather than conflating them.

**Next Steps:**

- [ ] Design tag syntax for prompt sections
- [ ] Implement in prompt generation service
- [ ] Test with current failing scenarios

---

### 2. Reduce Variable Overload (Chunking)

**Source:** `design/research-beyond-prompt.md`

**Key Insight:** When LLMs are asked to consider too many variables simultaneously, they start failing.

**Solution:**

- Chunk up complex requests
- When there are too many variables, ping back to the user for clarification
- Don't ask the LLM to do everything at once

**Next Steps:**

- [ ] Identify threshold for "too many variables"
- [ ] Implement user clarification triggers
- [ ] Redesign prompts to be more focused

---

### 3. Planning Loop - Partial Success, Document Struggles

**Current State:** The planning loop where an LLM creates a plan and tasks out to different agents _kind of_ works, but struggles specifically with document interactions.

**Root Cause - Competing Data Models:**

| Model                         | Description                          | Issue                        |
| ----------------------------- | ------------------------------------ | ---------------------------- |
| **Ontology Graph**            | Things are linked together           | Works for relationships      |
| **Documents (doc_structure)** | JSON column in `onto_projects` table | Not fully linked to ontology |

**Document Structure Intent:**

- Documents naturally have nesting
- As you explore different parts of a project, the doc structure should fill out organically
- Doc structure houses all the context on different areas of a project

**The Conflict:** Two systems that don't fully integrate - graph-based ontology vs. nested document JSON.

**Next Steps:**

- [ ] Audit how document operations interact with ontology
- [ ] Determine if models need unification or better bridging
- [ ] Clarify which model the agent should prioritize when

---

### 4. Human-in-the-Loop for Semantic Divergence

**Source:** `design/research-learning.md`

**Key Insights:**

- LLMs are wordsmiths - excellent at semantic patterns and token prediction
- But they need iterative flow to understand what needs to happen next
- Good at pattern matching, but may not understand the _underlying problem_ being solved
- Sometimes requires human direction to navigate

**Implication:** LLM should give options, user picks which direction to pursue.

**Why This Matters:** This is why many agentic chat systems ask clarifying questions - it puts the user in the loop when the agent could go down multiple rabbit holes.

**Implementation Direction:**

- When agent detects high ambiguity or multiple valid paths → ask clarifying questions
- Don't assume the path forward when variables multiply
- Build in explicit decision points for the user

**Next Steps:**

- [ ] Define triggers for when to ask clarifying questions
- [ ] Design UX for presenting options to user
- [ ] Integrate with existing planning loop

---

## Summary of Action Areas

1. **Prompt Structure** - Add HTML-style tags for clear section boundaries
2. **Variable Chunking** - Don't overload the LLM; break up complex requests
3. **Data Model Clarity** - Resolve ontology vs. doc_structure tension
4. **User Decision Points** - Ask clarifying questions when paths diverge
5. **Anti-Marketing** - Be honest about rough edges (inspired by Gas Town)
6. **Twitter Strategy Pivot** - Build network of peers, not just follow big accounts
7. **Host a Hackathon** - Find space, find people, send invites, make it happen

---

---

## 5. Anti-Marketing Strategy

**Inspiration:** Steve Yegge's Gas Town launch (`design/blog-gas-town.md`)

**Yegge's Golden Rules:**

> 1. Do not use Gas Town if you do not juggle at least five Claude Codes at once, daily.
> 2. Do not use Gas Town if you care about money.
> 3. Do not use Gas Town.

**Why It Works:**

- Brutal honesty disarms skepticism
- Warnings create curiosity ("why would they say NOT to use it?")
- Filters for the right early adopters (people who can handle rough edges)
- Builds trust through transparency
- Psychologically, being told "don't" makes people want to try it more

**BuildOS Version - Ideas:**

- "BuildOS is fragile. There are bugs. Things break."
- "Don't use BuildOS if you need polish."
- "BuildOS is for people who can handle rough edges."
- "This is early. Really early."

**Why This Is Honest:**

- The product IS still being built
- There ARE bugs
- It IS hard to use
- Being upfront about this is both honest marketing AND a filter for the right users

**Next Steps:**

- [ ] Write anti-marketing copy for landing page
- [ ] Add honest warnings to onboarding
- [ ] Consider a "Golden Rules" section for BuildOS

---

## 6. Twitter Strategy Pivot

**Current Approach (Not Working):** Just looking at big accounts and trying to engage.

**New Approach:** Build a network of peers. Find collaborators. Find future customers.

### Step 1: LSI Keyword Research

Stop scrolling feeds. Start **searching** for conversations in the niche.

**Search Terms to Explore:**
- Context engineering
- AI agents
- LLMs / large language models
- Brain dump / brain dumping
- "Notion is too complex" / Notion frustration
- Context overload / context switching
- ADHD productivity
- Second brain
- Personal knowledge management
- Agentic workflows
- AI-assisted planning

**Action:** Do a proper LSI keyword analysis. Find all the terms people use when talking about these problems.

---

### Step 2: Find Small Creators at Your Level

**The Goal:** Find up-and-comers building similar things. Support them → they support you.

**Where to Find Them:**
- Search results for niche keywords
- Who's replying to big accounts (the watering hole)
- Indie hackers building in public
- People with 500-5K followers posting about AI/productivity

**What to Look For:**
- Building something in the space
- Posting regularly
- Not already famous
- Seems approachable / would appreciate engagement

---

### Step 3: Big Accounts as Watering Holes

**Insight:** Big accounts aren't for direct engagement. They're for **finding people**.

Who comments on @karpathy, @sama, @simonw, etc.? Those commenters are:
- Paying attention to the same things you are
- Potentially building related things
- Signal of interest in the space

**Action:** When you see a thoughtful comment on a big account, click through. See what they're building. Add to your radar.

---

### Step 4: Build Mini Dossiers

Not for everyone - just for the promising accounts at your level.

**What to Track:**
- What are they building?
- What's their angle/niche?
- How can I support them?
- Could they be a user of BuildOS?
- Could they be a collaborator?
- What do we have in common?

---

### Step 5: The End Goals

1. **Build a network** of indie hackers / builders at your level
2. **Find collaborators** - people to build with, cross-promote with
3. **Find future customers** - people who might use BuildOS
4. **Develop partnerships** - eventually, not immediately

---

### The Mindset Shift

| Old Approach | New Approach |
|--------------|--------------|
| Follow big accounts | Search for niche conversations |
| Try to get noticed by celebrities | Find peers and support them |
| Consume content | Create relationships |
| Random engagement | Strategic network building |
| Looking up | Looking sideways |

---

## 7. Host a Hackathon

**Goal:** Organize and host an in-person hackathon.

### Action Items

- [ ] **Find a space** - coworking space, office, community venue, etc.
- [ ] **Find co-hosts/collaborators** - people who want to do this with you
- [ ] **Create proper invitations** - not just casual mentions, real invites
- [ ] **Build a guest list** - who to invite (ties into Twitter network building)
- [ ] **Set a date** - commit to a timeline
- [ ] **Define the theme/focus** - AI agents? Productivity tools? Open?

### Why This Matters

- Builds community in-person (stronger than online)
- Creates content opportunities
- Finds potential collaborators/users for BuildOS
- Establishes you as a connector in the space

---

## Related Files

- `design/research-beyond-prompt.md` - Research on LLM variable limits
- `design/research-learning.md` - Research on LLM iterative understanding
- `design/blog-gas-town.md` - Steve Yegge's Gas Town anti-marketing inspiration
- `apps/web/src/lib/services/agentic-chat/` - Current implementation
- `apps/web/docs/features/agentic-chat/` - Feature documentation
