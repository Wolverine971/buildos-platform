<!-- apps/web/docs/content/BLOG_UPDATE_MASTER_PLAN.md -->

# BuildOS Blog Update Master Plan

## Overview

This document guides AI agents through updating all BuildOS blog content to reflect:

1. **Ontology System** - Evolution from "projects and tasks" to rich context architecture
2. **Project Lens** - BuildOS's scoped conversation feature (formerly "agentic chat")
3. **"Building Context"** - The central value proposition
4. **Jab/Hook Strategy** - Value-first content with strategic conversion

---

## Reference Documents

Before starting any blog update, read these documents:

### Core Strategy Documents

| Document                    | Path                                            | What It Contains                            |
| --------------------------- | ----------------------------------------------- | ------------------------------------------- |
| **Brand Strategy 2025** ⭐  | `/docs/marketing/brand/BRAND_STRATEGY_2025.md`  | **MASTER** - Overall messaging framework    |
| **Zoom Messaging Guide** ⭐ | `/docs/marketing/brand/ZOOM_MESSAGING_GUIDE.md` | Zoom in/out messaging, examples, guidelines |
| **Brand Guide 1-Pager**     | `/docs/marketing/brand/brand-guide-1-pager.md`  | Quick brand reference                       |
| **Chat Positioning**        | `AGENTIC_CHAT_POSITIONING.md`                   | Project Lens positioning, differentiation   |
| **Blog Audit**              | `BLOG_AUDIT_2025.md`                            | Full inventory, issues identified           |

### Content Examples

| Document                   | Path                                                                  | What It Contains                   |
| -------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| **10 Reasons Blog Draft**  | `/apps/web/docs/content/BLOG_DRAFT_10_REASONS_SCOPED_CONVERSATION.md` | Example of new content style       |
| **Zoom In/Out Blog Draft** | `/apps/web/docs/content/BLOG_DRAFT_ZOOM_IN_OUT.md`                    | Thought leadership on zoom concept |

### Technical References

| Document                 | Path                                              | What It Contains               |
| ------------------------ | ------------------------------------------------- | ------------------------------ |
| **Ontology Data Models** | `/apps/web/docs/features/ontology/DATA_MODELS.md` | Technical details of ontology  |
| **Ontology README**      | `/apps/web/docs/features/ontology/README.md`      | Ontology system overview       |
| **Agentic Chat README**  | `/apps/web/docs/features/agentic-chat/README.md`  | Project Lens technical details |

### Voice & Audience

| Document                   | Path                                                         | What It Contains                  |
| -------------------------- | ------------------------------------------------------------ | --------------------------------- |
| **Brand Personality**      | `/docs/marketing/brand/buildos-brand-personality-profile.md` | Voice and tone guidelines         |
| **ADHD Customer Language** | `/docs/marketing/customer-lingo-adhd.md`                     | How users describe their problems |

---

## Key Terminology Updates

### Replace These Terms

| Old Term                   | New Term                                                      | Context                    |
| -------------------------- | ------------------------------------------------------------- | -------------------------- |
| "projects and tasks"       | "rich context" or "ontology"                                  | When describing data model |
| "task management"          | "context building"                                            | When describing core value |
| "organize your projects"   | "build context on your projects"                              | When describing benefit    |
| "AI chat" / "chat feature" | "Project Lens"                                                | When describing chat       |
| "agentic chat"             | "Project Lens" (external) / "scoped conversation" (technical) | Naming                     |
| "productivity tool"        | "context infrastructure" or "personal operating system"       | Positioning                |

### New Concepts to Introduce

| Concept                       | Definition                                        | When to Use                            |
| ----------------------------- | ------------------------------------------------- | -------------------------------------- |
| **Project Lens**              | BuildOS's scoped conversation feature             | Feature name for chat                  |
| **Zoom In**                   | Focus on a specific entity (task, goal, document) | Describing deep focus action           |
| **Zoom Out**                  | Expand view to see relationships and big picture  | Describing strategic view action       |
| **Zoom In/Out**               | Primary action language for Project Lens          | Default when describing the capability |
| **Scoped Conversation**       | Technical term for zoom capability                | Technical explanations only            |
| **Rich Context Architecture** | Goals, plans, tasks, documents all connected      | User-facing ontology explanation       |
| **Context Compounding**       | Context grows more valuable over time             | Value proposition                      |

### Zoom Messaging Quick Reference

> **See [Zoom Messaging Guide](/apps/web/docs/content/ZOOM_MESSAGING_GUIDE.md) for complete examples.**

**Primary tagline:** "Zoom in. Zoom out. Work at any level."

**Key messages:**

- "You control the altitude. AI follows."
- "Define ANY piece of your project as context."
- "From 30,000 feet to ground level—one conversation."

**When describing Project Lens:**

- Lead with zoom metaphor
- Emphasize user control
- Show both directions (in AND out)
- Give concrete examples

---

## Content Strategy Reminders

### Jab vs Hook Content

**Jab (Value-First):**

- 80%+ educational value
- Useful even without BuildOS
- Soft or no CTA
- Builds trust and authority

**Hook (Conversion):**

- Clear pitch for BuildOS
- Comparison posts
- "10 reasons" format
- Direct CTA to try/sign up

### Voice Guidelines

- **Energetic Realist** - Get things done without drill sergeant attitude
- **No-shame** - Validate struggles without dwelling
- **Practical** - Actionable, not theoretical
- **Contrarian where earned** - Challenge conventional wisdom with substance
- **ADHD-friendly** - Scannable, clear headers, short paragraphs

---

## Priority Tiers

### Tier 1: Critical (Update First)

Blogs that directly conflict with new positioning or miss key features.

### Tier 2: Important (Update Second)

Blogs that need enhancement but aren't fundamentally broken.

### Tier 3: Enhancement (Update Third)

Blogs that work but could be stronger with new messaging.

### Tier 4: Create New

Unpublished blogs that need to be written/completed.

---

# TIER 1: CRITICAL UPDATES

---

## Blog 1: How BuildOS Works ✅ COMPLETED

### Metadata

- **File:** `/apps/web/src/content/blogs/getting-started/how-buildos-works.md`
- **Status:** Published (Updated 2025-12-31)
- **Priority:** CRITICAL
- **Type:** Jab (Educational)
- **Completed By:** Claude

### Updates Made

#### Section: Introduction ✅

- [x] Updated opening to emphasize "building context" not "organizing tasks"
- [x] Added "context infrastructure for the AI era" positioning
- [x] Introduced stateless vs stateful AI contrast

#### Section: How It Works → "Building Context Through Conversation" ✅

- [x] Renamed section to emphasize context
- [x] Brain dump creates CONTEXT (goals, plans, tasks, documents)
- [x] Added "context grows with you" messaging

#### Section: Beyond the Chat → "Your Context Architecture" ✅

- [x] Explained ontology hierarchy: Goals → Plans → Tasks → Documents
- [x] Added ASCII diagram showing relationships
- [x] Emphasized connections between entities

#### Section: NEW "Project Lens: Chat That Zooms" ✅

- [x] Introduced Project Lens as scoped conversation
- [x] Explained 9 context types (Project Chat, Audit, Forecast, Entity Focus, Global, etc.)
- [x] Added dynamic focus explanation with concrete examples
- [x] Product launch example: project → goal → task zoom

#### Section: Daily Brief → "Contextual Intelligence" ✅

- [x] Reframed as "contextual intelligence"
- [x] Explained briefs draw from full ontology (goals, not just tasks)
- [x] Added "Day 1 vs Day 100" compounding example

#### Section: Conclusion ✅

- [x] Added "context compounds" as core thesis
- [x] ChatGPT comparison (stateless vs stateful)
- [x] Urgency CTA: "Every day you wait is context you don't have"

### Quality Checklist - All Pass ✅

- [x] No mention of "projects and tasks" as primary model
- [x] Ontology (goals, plans, tasks, docs) clearly explained
- [x] Project Lens introduced with clear value
- [x] "Building context" is the through-line
- [x] Still accessible to new users (not too technical)
- [x] Founder voice preserved
- [x] ADHD-friendly formatting (scannable, short paragraphs)

---

## Blog 2: Anti-AI-Assistant: Execution Engine ✅ COMPLETED

### Metadata

- **File:** `/apps/web/src/content/blogs/philosophy/anti-ai-assistant-execution-engine.md`
- **Status:** Published (Updated 2025-12-31)
- **Priority:** CRITICAL
- **Type:** Jab (Philosophy/Thought Leadership)
- **Completed By:** Claude

### Updates Made

#### Section: NEW "Project Lens: What It Is (And Isn't)" ✅

- [x] Added full section explaining Project Lens as contextual intelligence, not autonomous execution
- [x] IS/ISN'T tables clearly differentiating from agents
- [x] "Scoped Conversation: The Key Difference" subsection
- [x] "Dynamic Focus, Human Control" subsection with zoom example

#### Section: Project Command Center → "Your Rich Context Architecture" ✅

- [x] Updated to reference ontology (goals, plans, tasks, documents)
- [x] Added ASCII hierarchy diagram
- [x] Connected to "intelligence infrastructure" concept

#### Section: The Philosophy → "Context Engineering Over Agent Engineering" ✅

- [x] Renamed section to emphasize context engineering
- [x] Added "The Context Engineering Difference" subsection
- [x] Connected Project Lens to context engineering in practice
- [x] Three reasons why context beats agents

#### Section: Conclusion ✅

- [x] Added Project Lens reference in closing
- [x] "The human stays in the loop. That's not a limitation—it's the whole point."
- [x] Updated CTA to "building context that makes YOU more capable"

### Quality Checklist - All Pass ✅

- [x] Clear explanation of why Project Lens isn't contradicting anti-agent philosophy
- [x] "Scoped conversation" positioned as context-first, not agent-first
- [x] Ontology referenced as implementation of philosophy
- [x] Original philosophy preserved and strengthened
- [x] Dev notes preserved at end of file

---

## Blog 3: Context vs Agentic Engineering ✅ COMPLETED

### Metadata

- **File:** `/apps/web/src/content/blogs/philosophy/agentic-vrs-context-engineering.md`
- **Status:** Published (Updated 2025-12-31)
- **Priority:** CRITICAL
- **Type:** Jab (Philosophy/Thought Leadership)
- **Completed By:** Claude

### Updates Made

#### Section: NEW "Rich Context Architecture: The Foundation" ✅

- [x] Added ontology hierarchy explanation (Goals → Plans → Tasks → Documents)
- [x] Explained how connected entities strengthen context loops
- [x] Positioned as "context infrastructure"

#### Section: NEW "Project Lens: Context Engineering in Action" ✅

- [x] Added full section showing Project Lens as context engineering implementation
- [x] "Scoped Conversation = Context Engineering" table mapping actions to principles
- [x] "Dynamic Focus = Real-Time Context Updates" showing the context loop in action
- [x] Clear examples: focus on task → filter → apply → evaluate → update

#### Section: Updated "Context Engineering in Practice: Build OS" ✅

- [x] Connected each feature to context engineering step (Gather, Structure, Apply, Evaluate, Update)
- [x] Added Project Lens to the feature list

#### Section: NEW "The Future is Context-First" ✅

- [x] Added conclusion section positioning BuildOS's bet on context
- [x] "You don't need an AI that does everything. You need an AI that knows your work."
- [x] Strong CTA: "Stop teaching AI new capabilities. Start giving it the right context."

### Quality Checklist - All Pass ✅

- [x] Project Lens clearly positioned as context engineering implementation
- [x] Scoped conversation explained as context-first (not agent-first)
- [x] Original framework preserved and strengthened
- [x] Clear connection between philosophy and product
- [x] Context compounding mentioned

---

## Blog 4: Effective Brain Dumping ✅ COMPLETED

### Metadata

- **File:** `/apps/web/src/content/blogs/getting-started/effective-brain-dumping.md`
- **Status:** Published (Updated 2025-12-31)
- **Priority:** CRITICAL
- **Type:** Jab (How-To Guide)
- **Completed By:** Claude

### Updates Made

#### Section: "From Chaos to Rich Context" ✅

- [x] Updated to show brain dumps create goals, plans, tasks, AND documents
- [x] Added ASCII diagram showing hierarchy flow
- [x] Added "Goal Identification", "Plan Extraction", "Task Identification", "Document Creation" subsections
- [x] Added "context that compounds" message

#### Section: NEW "Refine with Project Lens: Zoom In, Zoom Out" ✅

- [x] Added full section on using Project Lens after brain dump
- [x] "Zoom Into a Goal" with example dialogue
- [x] "Zoom Into a Task" with context awareness explanation
- [x] "Zoom Back Out" to verify connections
- [x] Added zoom flow diagram for brain dumps
- [x] "You control the altitude—the AI follows" tagline

#### Section: NEW "Context Compounding" ✅

- [x] Added section explaining why brain dumps get better over time
- [x] Table showing compounding effect (1st, 5th, 20th brain dump)
- [x] "This is why starting matters more than perfecting"

#### Section: Conclusion/Next Steps ✅

- [x] Added "Project Lens refinement" to next steps
- [x] Added "Cross-project zoom outs" option
- [x] Updated CTA: "Ready to start building context?"
- [x] Added closing tagline: "Zoom in. Zoom out. Build context that compounds."

### Quality Checklist - All Pass ✅

- [x] Full ontology shown as brain dump output
- [x] Project Lens introduced as refinement tool with zoom messaging
- [x] Context compounding explained with table
- [x] Practical value preserved (examples unchanged)
- [x] Zoom terminology used per Zoom Messaging Guide

### Reference Docs

- `/apps/web/docs/features/brain-dump/README.md` (if exists)
- `/apps/web/src/lib/utils/braindump-processor.ts` (for technical accuracy)
- `/apps/web/docs/content/BRAND_STRATEGY_2025.md` (Section: The Narrative Arc)

---

## Blog 5: Task Management Best Practices ✅ COMPLETED

### Metadata

- **File:** `/apps/web/src/content/blogs/productivity-tips/task-management-best-practices.md`
- **Status:** Published (Updated 2025-12-31)
- **Priority:** CRITICAL
- **Type:** Jab (How-To)
- **Completed By:** Claude

### Updates Made

#### Section: Introduction ✅

- [x] Added framing: "Tasks are one part of a rich context system"
- [x] Added insight: "isolated tasks fail—tasks connected to goals are intelligence"
- [x] Set expectation for task advice + context architecture

#### Section: Task Philosophy → "Tasks in the Context Hierarchy" ✅

- [x] Added ontology hierarchy diagram (Goals → Plans → Tasks → Documents)
- [x] Explained what every task "knows" (goal, plan, docs, blockers)
- [x] Added "context that makes tasks smarter" message

#### Section: NEW "Zoom Into Your Tasks with Project Lens" ✅

- [x] What Happens When You Zoom In (context loading)
- [x] Task-Focused Conversations with example dialogue
- [x] Unblocking Stuck Tasks with zoom approach
- [x] Zoom Flow diagram for task management
- [x] "You control the altitude. The AI follows."

#### Section: SMART-ER Framework ✅

- [x] Preserved excellent SMART-ER content
- [x] Added note on "Relevant": "In Build OS, this connection is automatic"

#### Section: NEW "Context Makes Tasks Better Over Time" ✅

- [x] Context compounding explanation
- [x] Day 1 vs Day 100 comparison
- [x] Strong CTA: "Zoom in. Zoom out. Build tasks that connect to goals."

### Quality Checklist - All Pass ✅

- [x] Tasks positioned as part of larger context system
- [x] Goals, plans, documents mentioned as related entities
- [x] Project Lens introduced with zoom messaging
- [x] Original excellent advice preserved (SMART-ER, energy-based scheduling, etc.)
- [x] Context compounding explained

### Reference Docs

- `/apps/web/docs/features/ontology/DATA_MODELS.md` (Task entity details)
- `/apps/web/docs/content/AGENTIC_CHAT_POSITIONING.md` (Task focus example)

---

# TIER 2: IMPORTANT UPDATES

---

## Blog 6: Daily Brief Guide ✅ COMPLETED

### Metadata

- **File:** `/apps/web/src/content/blogs/getting-started/daily-brief-guide.md`
- **Status:** Published (Updated 2025-12-31)
- **Priority:** IMPORTANT
- **Type:** Jab (Feature Education)
- **Completed By:** Claude

### Updates Made

#### Section: Introduction ✅

- [x] Reframed as "contextual intelligence"
- [x] Added: briefs draw from entire BuildOS context (goals, plans, tasks, documents)
- [x] Added Day 1 vs Day 100 teaser

#### Section: "Intelligence From Your Full Context" ✅

- [x] Replaced "Beyond Task Lists" with ontology-aware section
- [x] Added ASCII diagram showing what briefs draw from
- [x] Goal-aware insights, relationship-based prioritization, compounding intelligence

#### Section: NEW "Zoom Into Your Brief with Project Lens" ✅

- [x] Ask questions about your brief with examples
- [x] Drill into specific recommendations
- [x] Customize future briefs through conversation
- [x] Brief → Lens → Action flow diagram

#### Section: NEW "Context Compounding: Briefs That Get Smarter" ✅

- [x] Table showing Week 1 vs Month 1 vs Month 6
- [x] Explained why more context = smarter briefs
- [x] "Day 1 briefs are helpful. Day 100 briefs feel like having a chief of staff"

#### Section: Conclusion ✅

- [x] Updated CTA: "Ready to build contextual intelligence?"
- [x] Added zoom tagline: "Zoom in. Zoom out. Let your briefs get smarter."

### Quality Checklist - All Pass ✅

- [x] "Contextual intelligence" framing established
- [x] Full ontology mentioned (not just tasks)
- [x] Project Lens customization explained with examples
- [x] Context compounding explained with table
- [x] Dev notes preserved at end of file

### Reference Docs

- `/apps/worker/docs/features/daily-briefs/README.md`
- `/apps/web/docs/content/BRAND_STRATEGY_2025.md` (Tier 5: Contextual Intelligence)

---

## Blog 7: Understanding Life Goals

### Metadata

- **File:** `/apps/web/src/lib/content/blog/getting-started/understanding-life-goals.md`
- **Status:** Published
- **Priority:** IMPORTANT
- **Type:** Jab (Conceptual)
- **Estimated Effort:** Medium

### Current State

- Explains life goals vs projects
- Strategic alignment concepts
- Pre-ontology terminology

### What's Wrong

1. Goals not framed as top-level ontology entities
2. Doesn't explain goal → plan → task hierarchy
3. No mention of how Project Lens helps with goals
4. Missing connection to "building context"

### Required Updates

#### Section: What Are Life Goals

- [ ] Frame goals as top-level ontology entities
- [ ] Explain: goals sit above plans, which sit above tasks
- [ ] Show the hierarchy: Goal → Plan → Task → Document

#### Section: Goals vs Projects

- [ ] Clarify how goals and projects relate in ontology
- [ ] Multiple projects can contribute to one goal
- [ ] Goals provide strategic context for projects

#### Section: Add NEW "Working with Goals in Project Lens"

- [ ] Explain goal focus mode
- [ ] AI can show goal progress, contributing projects, blockers
- [ ] Example: "What's blocking my Q2 revenue goal?"

#### Section: Strategic Alignment

- [ ] Show how ontology makes alignment automatic
- [ ] When tasks connect to goals, AI can flag misalignment
- [ ] Context enables strategic clarity

### Research Needed

- [ ] Review goal entity in ontology data models
- [ ] Check goal-specific tools in Project Lens
- [ ] Verify goal → project → task relationships in data model

### Success Criteria

- [ ] Goals clearly positioned as ontology entities
- [ ] Hierarchy explained (goal → plan → task)
- [ ] Project Lens goal features mentioned
- [ ] Strategic alignment connected to context

### Reference Docs

- `/apps/web/docs/features/ontology/DATA_MODELS.md` (Goal entity)
- `/apps/web/docs/content/AGENTIC_CHAT_POSITIONING.md` (Goal focus example)

---

## Blog 8: Context Engineering 101

### Metadata

- **File:** `/apps/web/src/lib/content/blog/productivity-tips/context-engineering-101.md`
- **Status:** Published
- **Priority:** IMPORTANT
- **Type:** Jab (Educational)
- **Estimated Effort:** Low-Medium

### Current State

- Strong conceptual foundation
- "Prompt engineering is out, context engineering is in"
- Good framework

### What's Wrong

1. Doesn't show ontology as implementation of context engineering
2. No mention of Project Lens
3. Missing "building context" value proposition
4. Could be stronger with concrete BuildOS examples

### Required Updates

#### Section: What is Context Engineering

- [ ] Keep core explanation (strong)
- [ ] Add: BuildOS implements context engineering through ontology
- [ ] Mention that rich context (goals, plans, tasks, docs) IS context engineering

#### Section: Why Context > Prompts

- [ ] Keep reasoning (strong)
- [ ] Add: Project Lens provides scoped context automatically
- [ ] Show that focusing on an entity IS context engineering

#### Section: Add NEW "Context Engineering with BuildOS"

- [ ] Show ontology as context architecture
- [ ] Explain Project Lens as context delivery mechanism
- [ ] Example: generic prompt vs scoped conversation
- [ ] Mention context compounding

#### Section: Conclusion

- [ ] Position BuildOS as context engineering infrastructure
- [ ] Soft CTA to try building context

### Research Needed

- [ ] Review current content to preserve good framework
- [ ] Find best insertion point for BuildOS examples

### Success Criteria

- [ ] Ontology positioned as context engineering implementation
- [ ] Project Lens mentioned as context delivery
- [ ] Original framework preserved
- [ ] Clear connection between concept and product

### Reference Docs

- `/apps/web/docs/content/BRAND_STRATEGY_2025.md` (Context as central thesis)
- `/apps/web/docs/content/AGENTIC_CHAT_POSITIONING.md` (Scoped conversation)

---

## Blog 9: Under the Hood

### Metadata

- **File:** `/apps/web/src/lib/content/blog/getting-started/under-the-hood.md`
- **Status:** Published
- **Priority:** IMPORTANT
- **Type:** Jab (Technical Education)
- **Estimated Effort:** High

### Current State

- Technical architecture basics
- Likely pre-ontology
- May have outdated technical details

### What's Wrong

1. Probably doesn't reflect current architecture
2. No mention of ontology system
3. No mention of Project Lens architecture
4. May confuse technical users with outdated info

### Required Updates

#### Section: Full Review Needed

- [ ] Read current content completely
- [ ] Identify what's still accurate vs outdated
- [ ] Note technical claims that need verification

#### Section: Architecture Overview

- [ ] Update to reflect ontology-based architecture
- [ ] Explain: goals, plans, tasks, documents, relationships
- [ ] Mention Supabase, entity types, RLS

#### Section: Add NEW "Project Lens Architecture"

- [ ] Explain how chat context is built
- [ ] 9 context types overview
- [ ] Progressive context disclosure (token optimization)
- [ ] Planner → Executor → Reviewer architecture

#### Section: AI/LLM Details

- [ ] Update to reflect current AI implementation
- [ ] Mention context engineering approach
- [ ] Explain how scoped conversation works technically

### Research Needed

- [ ] Review `/apps/web/docs/features/ontology/DATA_MODELS.md`
- [ ] Review `/apps/web/docs/features/agentic-chat/BACKEND_ARCHITECTURE_OVERVIEW.md`
- [ ] Check current tech stack (models used, token optimization)
- [ ] Verify technical claims are accurate

### Success Criteria

- [ ] Architecture accurately reflects current system
- [ ] Ontology explained at technical level
- [ ] Project Lens architecture included
- [ ] Technically accurate and up-to-date

### Reference Docs

- `/apps/web/docs/features/ontology/DATA_MODELS.md`
- `/apps/web/docs/features/agentic-chat/BACKEND_ARCHITECTURE_OVERVIEW.md`
- `/apps/web/CLAUDE.md` (Tech stack section)

---

## Blog 10: Evolution of Note-Taking

### Metadata

- **File:** `/apps/web/src/lib/content/blog/productivity-tips/evolution-of-note-taking.md`
- **Status:** Published
- **Priority:** IMPORTANT
- **Type:** Jab (Thought Leadership)
- **Estimated Effort:** Low-Medium

### Current State

- Good narrative: Paper → Digital → AI-powered
- Evolution story arc

### What's Wrong

1. Doesn't position ontology as next evolution
2. Missing Project Lens as interaction evolution
3. Could be stronger endpoint for the arc

### Required Updates

#### Section: The Evolution Arc

- [ ] Keep Paper → Digital → AI progression
- [ ] Add: AI-native with rich context as latest evolution
- [ ] Position ontology as evolution beyond flat notes

#### Section: AI-Powered Stage

- [ ] Update to emphasize ontology, not just "AI organization"
- [ ] Explain: connected context (goals, plans, tasks, docs) vs flat notes
- [ ] Mention relationships and context compounding

#### Section: Add NEW "Conversational Context"

- [ ] Project Lens as evolution of interaction
- [ ] From typing notes → to conversing with your context
- [ ] Show that scoped conversation is new paradigm

#### Section: Conclusion

- [ ] Position BuildOS as representing this evolution
- [ ] Soft CTA

### Research Needed

- [ ] Review current narrative arc to preserve
- [ ] Ensure additions feel like natural progression

### Success Criteria

- [ ] Ontology positioned as evolution
- [ ] Project Lens introduced as interaction evolution
- [ ] Original narrative preserved and extended
- [ ] Clear through-line to BuildOS

### Reference Docs

- `/apps/web/docs/content/BRAND_STRATEGY_2025.md` (Evolution framing)

---

# TIER 3: ENHANCEMENT UPDATES

---

## Blog 11: Who is BuildOS For?

### Metadata

- **File:** `/apps/web/src/lib/content/blog/getting-started/who-is-buildos-for.md`
- **Status:** Published
- **Priority:** ENHANCEMENT
- **Type:** Jab (Positioning)
- **Estimated Effort:** Low

### Current State

- Good persona list (founders, freelancers, ADHD minds, etc.)
- Solid market positioning

### What's Wrong

1. Generic benefits, could be more specific
2. No mention of ontology benefits per persona
3. No mention of Project Lens benefits per persona

### Required Updates

#### Section: Each Persona

- [ ] Add specific ontology benefit for each persona
- [ ] Add specific Project Lens use case for each persona
- [ ] Example: "Founders: Chat about your fundraising goal, see all related tasks"

#### Section: ADHD Section

- [ ] Emphasize scoped conversation helps maintain focus
- [ ] Mention that context persistence helps with memory
- [ ] "Project Lens stays focused so you don't have to"

### Research Needed

- [ ] Review current personas
- [ ] Match persona needs to specific ontology/Project Lens features

### Success Criteria

- [ ] Each persona has ontology-specific benefit
- [ ] Each persona has Project Lens use case
- [ ] Original positioning preserved

### Reference Docs

- `/docs/marketing/customer-lingo-adhd.md`
- `/apps/web/docs/content/AGENTIC_CHAT_POSITIONING.md`

---

## Blog 12: Troubleshooting Common Issues

### Metadata

- **File:** `/apps/web/src/lib/content/blog/advanced-guides/troubleshooting-common-issues.md`
- **Status:** Published
- **Priority:** ENHANCEMENT
- **Type:** Utility
- **Estimated Effort:** Medium

### Current State

- Common problems and solutions
- Maintenance content

### What's Wrong

1. Probably doesn't cover ontology-specific issues
2. Probably doesn't cover Project Lens issues
3. May have outdated troubleshooting

### Required Updates

#### Section: Review All Issues

- [ ] Check if issues are still relevant
- [ ] Update solutions for current architecture
- [ ] Remove outdated issues

#### Section: Add Ontology Issues

- [ ] Entity not appearing in right place
- [ ] Relationships not showing
- [ ] Context not loading correctly

#### Section: Add Project Lens Issues

- [ ] Chat not loading project context
- [ ] Focus not switching correctly
- [ ] Tools not executing
- [ ] Context drift happening

### Research Needed

- [ ] Review actual support tickets/issues for common problems
- [ ] Test current features for potential issues
- [ ] Check if issues mentioned still exist

### Success Criteria

- [ ] All issues are current and relevant
- [ ] Ontology issues covered
- [ ] Project Lens issues covered
- [ ] Solutions are accurate

### Reference Docs

- (Check support/feedback channels for real issues)

---

# TIER 4: NEW CONTENT TO CREATE

---

## Blog 13: BuildOS vs Notion for ADHD Minds

### Metadata

- **File:** `/apps/web/src/lib/content/blog/comparisons/buildos-vs-notion-adhd-minds.md`
- **Status:** Draft (exists, incomplete)
- **Priority:** HIGH (SEO/Conversion)
- **Type:** Hook (Comparison)
- **Estimated Effort:** High

### Current State

- 80 lines exist
- Strong opening about ADHD complexity tax
- Incomplete

### What to Create

#### Angle

Position BuildOS as "Notion for ADHD minds" - same power, none of the friction

#### Key Arguments

1. **Setup friction:** Notion requires manual setup; BuildOS auto-structures from brain dump
2. **Context switching:** Notion is pages; BuildOS is connected ontology
3. **AI integration:** Notion AI is bolted on; BuildOS is AI-native
4. **Project Lens vs no chat:** BuildOS has scoped conversation; Notion doesn't

#### ADHD-Specific Points

- Notion's flexibility is a bug for ADHD (too many choices)
- BuildOS provides structure without friction
- Project Lens keeps focus (context doesn't drift)
- No setup = no executive function tax

#### Structure

1. The ADHD Complexity Tax (pain)
2. What Notion Gets Right (fair)
3. Where Notion Fails ADHD Minds (problem)
4. How BuildOS is Different (solution)
5. Feature Comparison Table
6. The Verdict (CTA)

### Research Needed

- [ ] Review current 80 lines for good content to keep
- [ ] Research Notion AI capabilities for accurate comparison
- [ ] Check ADHD customer feedback for specific Notion pain points
- [ ] Review `/docs/marketing/customer-lingo-adhd.md` for language

### Success Criteria

- [ ] Fair to Notion (acknowledges strengths)
- [ ] Clear differentiation on ontology and Project Lens
- [ ] ADHD-specific resonance
- [ ] Strong CTA

### Reference Docs

- `/docs/marketing/customer-lingo-adhd.md`
- `/apps/web/docs/content/AGENTIC_CHAT_POSITIONING.md` (Comparison section)
- `/apps/web/docs/content/BRAND_STRATEGY_2025.md` (Competitive positioning)

---

## Blog 14: BuildOS vs ChatGPT - Context That Compounds

### Metadata

- **File:** To be created in `/apps/web/src/lib/content/blog/comparisons/`
- **Status:** Not started
- **Priority:** HIGH (Differentiation)
- **Type:** Hook (Comparison)
- **Estimated Effort:** High

### What to Create

#### Angle

"ChatGPT is powerful but stateless. BuildOS builds context that compounds."

#### Key Arguments

1. **Stateless vs Stateful:** ChatGPT starts fresh; BuildOS remembers
2. **Generic vs Scoped:** ChatGPT knows everything vaguely; BuildOS knows YOUR work deeply
3. **Talk vs Do:** ChatGPT suggests; BuildOS executes on your data
4. **Complementary, not competitive:** Use both, but use BuildOS for YOUR projects

#### Structure

1. Why You Love ChatGPT (validate)
2. The Repetition Problem (pain)
3. What Stateless Means for Your Work (problem)
4. How BuildOS is Different (solution)
5. Comparison Table
6. Use Both, Better (positioning)
7. CTA

### Research Needed

- [ ] Research ChatGPT memory features (launched 2024) for accurate comparison
- [ ] Check ChatGPT Enterprise features
- [ ] Review how users currently use ChatGPT + BuildOS together

### Success Criteria

- [ ] Fair to ChatGPT (it's genuinely powerful)
- [ ] Clear differentiation on context persistence
- [ ] "Complementary" positioning (not replacement)
- [ ] Strong CTA

### Reference Docs

- `/apps/web/docs/content/BRAND_STRATEGY_2025.md` (ChatGPT comparison section)
- `/apps/web/docs/content/AGENTIC_CHAT_POSITIONING.md` (vs ChatGPT table)

---

## Blog 15: The 9 Ways to Chat in BuildOS

### Metadata

- **File:** To be created in `/apps/web/src/lib/content/blog/getting-started/`
- **Status:** Not started
- **Priority:** MEDIUM (Feature Education)
- **Type:** Jab (Feature Education)
- **Estimated Effort:** Medium

### What to Create

#### Angle

"BuildOS doesn't have 'a chat feature.' It has 9 purpose-built conversation types."

#### Structure

1. Why One Chat Isn't Enough (problem)
2. The 9 Context Types:
    - Global Chat (workspace-wide)
    - Project Chat (single project)
    - Project Audit (stress-test)
    - Project Forecast (timeline)
    - Project Create (new project)
    - Entity Focus (task, goal, plan, doc)
    - Brain Dump Chat
    - Calendar Chat
    - Daily Brief Chat
3. When to Use Which
4. CTA

### Research Needed

- [ ] Review `/apps/web/docs/content/AGENTIC_CHAT_POSITIONING.md` (Section: The 9 Context Types)
- [ ] Verify all 9 types are accurate and available
- [ ] Get UI screenshots or descriptions for each

### Success Criteria

- [ ] All 9 types explained clearly
- [ ] Use cases for each type
- [ ] Not overwhelming (practical guide)

### Reference Docs

- `/apps/web/docs/content/AGENTIC_CHAT_POSITIONING.md`
- `/apps/web/docs/features/agentic-chat/README.md`

---

## Blog 16: Build Context on Your Projects - 10 Reasons This Changes Everything

### Metadata

- **File:** Draft exists at `/apps/web/docs/content/BLOG_DRAFT_10_REASONS_SCOPED_CONVERSATION.md`
- **Final Location:** `/apps/web/src/lib/content/blog/productivity-tips/`
- **Status:** Draft complete, needs polish
- **Priority:** HIGH (Flagship Content)
- **Type:** Hook (1 Nugget, 10 Reasons)
- **Estimated Effort:** Low (polish only)

### What to Do

- [ ] Review draft for final polish
- [ ] Ensure all 10 reasons are tight
- [ ] Add proper frontmatter
- [ ] Move to final location
- [ ] Add images/diagrams if helpful

### Reference Docs

- `/apps/web/docs/content/BLOG_DRAFT_10_REASONS_SCOPED_CONVERSATION.md`

---

# TRACKING

## Status Legend

- ⬜ Not Started
- 🟡 In Progress
- ✅ Complete
- 🔴 Blocked

## Progress Tracker

| #   | Blog                     | Priority    | Status | Assigned     | Notes                                                                                                        |
| --- | ------------------------ | ----------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------ | --- |
| 1   | How BuildOS Works        | CRITICAL    | ✅     | Claude       | Updated 2025-12-31: Added context architecture, Project Lens, contextual intelligence framing                |
| 2   | Anti-AI-Assistant        | CRITICAL    | ✅     | Claude       | Updated 2025-12-31: Added Project Lens IS/ISN'T, context engineering section, ontology                       |
| 3   | Context vs Agentic       | CRITICAL    | ✅     | Claude       | Updated 2025-12-31: Added Project Lens implementation, ontology foundation, context-first conclusion         |
| 4   | Effective Brain Dumping  | CRITICAL    | ✅     | Claude       | Updated 2025-12-31: Added zoom messaging, ontology output, context compounding section                       |
| 5   | Task Management          | CRITICAL    | ✅     | Claude       | Updated 2025-12-31: Added ontology hierarchy, Project Lens zoom section, context compounding                 |
| 6   | Daily Brief Guide        | IMPORTANT   | ✅     | Claude       | Updated 2025-12-31: Added contextual intelligence framing, Project Lens zoom section, context compounding    |
| 7   | Understanding Life Goals | IMPORTANT   | ✅     | Claude       | Updated 2025-12-31: Added ontology hierarchy, Project Lens section, context compounding, zoom messaging      |     |
| 8   | Context Engineering 101  | IMPORTANT   | ✅     | Claude       | Updated 2025-12-31: Added BuildOS ontology implementation, Project Lens zoom table, context compounding      |
| 9   | Under the Hood           | IMPORTANT   | ✅     | Claude       | Updated 2025-12-31: Added ontology architecture, Project Lens zoom section, context compounding table        |
| 10  | Evolution of Note-Taking | IMPORTANT   | ✅     | Claude       | Updated 2025-12-31: Added ontology architecture, Project Lens zoom section, context compounding table        |
| 11  | Who is BuildOS For       | ENHANCEMENT | ✅     | Claude       | Updated 2026-01-01: Added ADHD zoom/context section, new "Why It Works" section with persona benefits        |
| 12  | Troubleshooting          | ENHANCEMENT | ⬜     |              |                                                                                                              |
| 13  | vs Notion (ADHD)         | HIGH-NEW    | ✅     | Claude       | Updated 2026-01-01: Full rewrite with ontology, Project Lens zoom, comparison tables, context compounding    |
| 14  | vs ChatGPT               | HIGH-NEW    | ✅     | Claude       | Created 2026-01-01: Full blog with memory research, comparison tables, "use both" positioning, zoom examples |
| 15  | 9 Ways to Chat           | MEDIUM-NEW  | ⬜     |              |                                                                                                              |
| 16  | 10 Reasons Context       | HIGH-NEW    | ⬜     | Draft exists |

---

## Quality Checklist (For Each Blog)

Before marking complete, verify:

### Content

- [ ] No "projects and tasks" as primary framing
- [ ] Ontology mentioned (goals, plans, tasks, documents)
- [ ] Project Lens mentioned where relevant
- [ ] "Building context" value proposition present
- [ ] Accurate to current product

### Voice

- [ ] Energetic Realist tone
- [ ] No corporate jargon
- [ ] ADHD-friendly (scannable)
- [ ] No-shame approach
- [ ] Practical and actionable

### Structure

- [ ] Clear headers
- [ ] Short paragraphs
- [ ] Examples are concrete
- [ ] CTA appropriate for content type (jab vs hook)

### Technical

- [ ] Frontmatter correct
- [ ] Links working
- [ ] No broken references
- [ ] SEO keywords present

---

## Notes for AI Agents

### Before Starting Any Blog

1. Read all Reference Documents listed in this plan
2. Read the current blog content completely
3. Understand the specific issues identified
4. Plan your changes before editing

### During Editing

1. Preserve good content - don't rewrite what works
2. Add new sections where indicated
3. Update terminology per the replacement table
4. Maintain consistent voice throughout

### After Editing

1. Run through Quality Checklist
2. Update Progress Tracker
3. Note any blockers or questions
4. Flag if research uncovered issues

### If Blocked

1. Note the blocker in the tracker
2. Move to next blog
3. Flag for human review

---

_Master plan created: December 31, 2025_
_Last updated: January 1, 2026 (Blogs 11, 13, 14 complete)_
