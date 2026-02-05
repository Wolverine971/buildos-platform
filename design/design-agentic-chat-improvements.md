<!-- design/design-agentic-chat-improvements.md -->

# Agentic Chat Improvements - Brainstorm

**Date:** 2026-02-05
**Status:** Brainstorming / Investigation

---

## Problem Statement

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

## Related Files

- `design/research-beyond-prompt.md` - Research on LLM variable limits
- `design/research-learning.md` - Research on LLM iterative understanding
- `design/blog-gas-town.md` - Steve Yegge's Gas Town anti-marketing inspiration
- `apps/web/src/lib/services/agentic-chat/` - Current implementation
- `apps/web/docs/features/agentic-chat/` - Feature documentation
