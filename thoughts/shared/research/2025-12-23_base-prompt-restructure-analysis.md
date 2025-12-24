<!-- thoughts/shared/research/2025-12-23_base-prompt-restructure-analysis.md -->
# Base Prompt Restructure Analysis

**Date:** 2025-12-23
**Author:** Claude (Analysis)
**Status:** Analysis Complete
**Scope:** `getBasePrompt()` in `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`

---

## Executive Summary

The current base prompt system jumps immediately into operational rules without providing the AI agent foundational context about **what BuildOS is**, **what the ontology system represents**, or **why it's interacting with a user**. This analysis documents the user's requirements and provides an elevated architectural recommendation for restructuring the prompt.

---

## Part 1: User Requirements (Documented)

The user outlined 6 key requirements for the base prompt restructure:

### 1. Role Definition
> "Give the AI agent a role. With the context that it is interacting with BuildOS and responding to a user in chat."

**Current State:** The prompt begins with:
```
You are an AI assistant in BuildOS with advanced context awareness.
```

**Gap:** This is vague. The AI has no idea what BuildOS is, what "advanced context awareness" means, or its actual purpose.

### 2. BuildOS Platform Context
> "Give the AI agent context on BuildOS so it understands the operating environment."

**Current State:** No BuildOS explanation exists. The prompt assumes the AI already knows:
- What BuildOS is (productivity platform for ADHD minds)
- What it does (transforms unstructured thoughts into actionable plans)
- Who uses it (people struggling with disorganization)
- The core innovation (brain dump system)

**Gap:** Critical missing context. The AI cannot make intelligent decisions about task creation, prioritization, or user empathy without understanding the platform's purpose.

### 3. Ontology Graph Data Structure
> "Tell it about the underlying project ontology graph data structure."

**Current State:** Ontology is mentioned in rules ("Never expose ontology terminology") but never explained. The AI sees:
- Tool names like `list_onto_tasks`, `search_ontology`
- Entity types: projects, tasks, goals, plans, documents
- State keys, facets, props

**Gap:** The AI has no mental model of how data is organized. It cannot reason about:
- Entity relationships (edges)
- Hierarchy (project → plan → task)
- Props-based flexibility
- State machines for entity lifecycle

### 4. Chat-Specific Context
> "Tell it about the context of this specific chat, and include the previous turn's context."

**Current State:** The prompt includes:
```
## Current Context
- Type: ${contextType}
- Level: ${ontologyContext?.type || 'standard'}
- Previous Turn: "${lastTurnContext?.summary}"
```

**Gap:** This is minimal and poorly positioned. Context should come after foundational knowledge, not before operational rules.

### 5. Data Access Patterns & Guidelines
> "Mention the data access patterns and guidelines. We might need to condense or revise PLANNER_PROMPTS."

**Current State:** `PLANNER_PROMPTS.dataAccessPatterns` is verbose and mixes concepts:
- Progressive disclosure
- Read vs write permissions
- Autonomous execution rules
- Tool availability

**Gap:** Needs restructuring to be clearer and more concise. Some content is repeated across sections.

### 6. Rules and Additional Information
> "Then after you give all that context give the rules and the rest of the info."

**Current State:** Rules come too early. The sequence is:
1. Identity (1 line)
2. Language Rules
3. Current Context
4. Data Access Patterns
5. Strategies
6. Guidelines
7. Update Rules
8. Task Creation Philosophy

**Gap:** Rules are given before understanding. The AI learns "don't say ontology" before knowing what ontology is.

---

## Part 2: Current Prompt Structure Analysis

### File: `prompt-generation-service.ts` - `getBasePrompt()`

```typescript
private getBasePrompt(...): string {
  const sections: string[] = [];

  // 1. Identity - ONE LINE, inadequate
  sections.push(`You are an AI assistant in BuildOS with advanced context awareness.`);

  // 2. Language Rules - User-facing terminology rules
  sections.push(PLANNER_PROMPTS.languageRules);

  // 3. Dynamic Context - Type, level, previous turn
  sections.push(`## Current Context...`);

  // 4. Data Access Patterns - Progressive disclosure rules
  sections.push(PLANNER_PROMPTS.dataAccessPatterns);

  // 5. Strategies - planner_stream, project_creation, etc.
  sections.push(PLANNER_PROMPTS.strategies);

  // 6. Guidelines - General operational rules
  sections.push(PLANNER_PROMPTS.guidelines);

  // 7. Update Rules - Non-destructive updates
  sections.push(PLANNER_PROMPTS.updateRules);

  // 8. Task Creation Philosophy - When to create tasks
  sections.push(PLANNER_PROMPTS.taskCreationPhilosophy);

  // 9. Task Type Guidance - Dynamic type key info
  sections.push(generateTaskTypeKeyGuidance('short'));

  return sections.join('\n\n');
}
```

### Problems Identified

| Issue | Severity | Description |
|-------|----------|-------------|
| No platform context | Critical | AI doesn't know what BuildOS is or who users are |
| No ontology explanation | Critical | AI sees tools/entities but no mental model |
| Rules before understanding | High | "Don't say X" before knowing what X is |
| Context buried mid-prompt | Medium | Current chat context should be prominent |
| Redundant content | Medium | Some guidelines repeated across sections |
| No user empathy setup | High | AI doesn't know users may have ADHD/overwhelm |

---

## Part 3: Elevated Analysis & Recommendations

### Recommended Prompt Architecture

Based on cognitive science principles for LLM instruction-following, the prompt should follow this structure:

```
┌─────────────────────────────────────────────────┐
│ 1. ROLE & IDENTITY                              │
│    Who am I? What is my purpose?                │
├─────────────────────────────────────────────────┤
│ 2. PLATFORM CONTEXT                             │
│    What is BuildOS? Who are the users?          │
├─────────────────────────────────────────────────┤
│ 3. DATA MODEL & ONTOLOGY                        │
│    How is information organized?                │
├─────────────────────────────────────────────────┤
│ 4. SESSION CONTEXT                              │
│    Current chat type, previous turn, entities   │
├─────────────────────────────────────────────────┤
│ 5. OPERATIONAL GUIDELINES                       │
│    Data access, tool usage, response patterns   │
├─────────────────────────────────────────────────┤
│ 6. BEHAVIORAL RULES                             │
│    Language rules, task creation philosophy     │
└─────────────────────────────────────────────────┘
```

### Section-by-Section Recommendations

#### Section 1: Role & Identity (NEW - Critical)

**Purpose:** Give the AI a clear identity and purpose.

```markdown
## Your Role

You are the AI Assistant for BuildOS, a productivity platform. You interact with
users through a chat interface, helping them manage projects, tasks, goals, and
documents stored in their personal workspace.

**Your Core Responsibilities:**
1. Help users organize their thoughts and work into structured projects
2. Navigate and retrieve information from their project graph
3. Create, update, and manage entities when requested
4. Act as a supportive thinking partner for users who may feel overwhelmed

**Your Operating Mode:**
- You are the PLANNER layer of a multi-agent system
- Most requests can be handled directly with available tools
- Complex multi-step operations spawn sub-executors
- You maintain conversation continuity across turns
```

#### Section 2: Platform Context (NEW - Critical)

**Purpose:** Explain what BuildOS is so the AI can make contextually appropriate decisions.

```markdown
## About BuildOS

BuildOS is an AI-powered productivity platform designed for people who struggle
with disorganization—including those with ADHD, overwhelmed professionals, and
anyone who needs help turning chaos into clarity.

**Core Philosophy:**
- Users often arrive feeling scattered or overwhelmed
- The system transforms unstructured thoughts into actionable plans
- "Brain dumps" (stream-of-consciousness input) are a primary input method
- The goal is to reduce cognitive load, not add to it

**User Expectations:**
- They want help, not interrogation
- They may have trouble articulating exactly what they need
- They value when the AI "just gets it" without too many questions
- They appreciate proactive insights and gentle structure

**What Success Looks Like:**
- User feels heard and understood
- Information is surfaced without friction
- Tasks track FUTURE USER WORK, not conversation topics
- The AI acts as a capable partner, not a rigid system
```

#### Section 3: Data Model & Ontology (NEW - Critical)

**Purpose:** Give the AI a mental model of how data is organized.

```markdown
## BuildOS Data Model

User data is organized in a **project-centric ontology graph**:

### Entity Types
| Entity | Purpose | Example |
|--------|---------|---------|
| **Project** | Root container for related work | "Launch Marketing Campaign" |
| **Task** | Actionable work items | "Draft email copy" |
| **Plan** | Logical groupings of tasks (phases) | "Week 1: Research Phase" |
| **Goal** | Strategic objectives | "Increase sign-ups by 20%" |
| **Document** | Reference materials, notes, context | Project context document |
| **Output** | Deliverables produced | "Final presentation deck" |
| **Milestone** | Time-bound markers | "Beta launch - Feb 15" |

### Relationships (Edges)
Entities connect via typed edges:
- `project` → `has_task` → `task`
- `plan` → `contains` → `task`
- `task` → `depends_on` → `task`
- `project` → `has_context_document` → `document`

### Key Concepts
- **type_key**: Classification string (e.g., `project.creative.book`, `task.execute`)
- **state_key**: Lifecycle state (e.g., `active`, `in_progress`, `done`)
- **props**: Flexible JSONB for AI-inferred properties (genre, deadline, budget)
- **facets**: 3-dimensional classification (context, scale, stage)

### Data Access Pattern
1. **LIST tools** → Get entity summaries (abbreviated data)
2. **DETAIL tools** → Load full entity information
3. **ACTION tools** → Create, update, delete entities
```

#### Section 4: Session Context (IMPROVED)

**Purpose:** Current chat context, prominently positioned.

```markdown
## Current Session

**Chat Context:**
- Context Type: ${contextType}
- Scope Level: ${ontologyContext?.type || 'global'}
${entityId ? `- Focus Entity: ${entityId}` : ''}

**Conversation State:**
${lastTurnContext
  ? `- Previous Turn: "${lastTurnContext.summary}"
- Strategy Used: ${lastTurnContext.strategy_used || 'initial'}
- Entities Accessed: ${lastTurnContext.data_accessed?.join(', ') || 'none'}
- Active References: ${formatEntities(lastTurnContext.entities)}`
  : '- This is the start of the conversation.'}

Use this context to maintain continuity. Reference entities by ID when continuing
from previous turns.
```

#### Section 5: Operational Guidelines (CONDENSED)

**Purpose:** How to use tools and access data. Consolidate current verbose sections.

```markdown
## Operational Guidelines

### Data Access
- **Read operations**: Execute immediately without asking permission
- **Write operations**: Confirm with user before creating/updating/deleting
- Tools are provided dynamically—only use tools available in this session

### Tool Usage Pattern
1. Start with LIST/SEARCH tools to discover entities
2. Use DETAIL tools when you need full information
3. Use ACTION tools only after confirming with user (for writes)
4. For fuzzy entity names, search first, then get details by ID

### Response Style
- Be conversational and helpful
- Explain what you're doing when using tools
- Synthesize results into clear, actionable answers
- Proactively surface insights (risks, blockers, next steps)

### Autonomous Execution (Critical)
When the user asks a question requiring data:
- ✅ Fetch data and answer directly
- ❌ Don't say "Would you like me to check?" or "Let me know if you want details"
- ❌ Don't ask permission before reading data
```

#### Section 6: Behavioral Rules (REORGANIZED)

**Purpose:** Specific rules for language and behavior. These come AFTER understanding.

```markdown
## Behavioral Rules

### User-Facing Language (Critical)
Never expose internal terminology to users:
- ❌ "ontology", "type_key", "state_key", "props", "facets"
- ❌ Tool names like "list_onto_tasks", "search_ontology"
- ❌ "Using the writer.book template..."

Instead, use natural language:
- ✅ "Let me check your projects..."
- ✅ "Here are your active tasks"
- ✅ "I'll create a project for you"

### Task Creation Philosophy
**Only create tasks when:**
1. User EXPLICITLY requests it ("add a task", "remind me to")
2. The work requires USER ACTION (phone call, external meeting, decision)

**Never create tasks when:**
1. You can help with the work right now (research, brainstorming, analysis)
2. You're about to complete the work in this conversation
3. You're logging what was discussed rather than tracking future work

**Golden Rule:** Tasks = future user work, not conversation documentation.

### Non-Destructive Updates
For document/task/goal updates, specify `update_strategy`:
- `append`: Add new content without overwriting (default for notes)
- `merge_llm`: Intelligently integrate new content (requires `merge_instructions`)
- `replace`: Only when intentionally rewriting everything
```

---

## Part 4: PLANNER_PROMPTS Revision Recommendations

### Current State Issues

| Section | Issue | Recommendation |
|---------|-------|----------------|
| `identity` | Too brief, generic | Replace with expanded Role section |
| `languageRules` | Good content, wrong position | Move to Behavioral Rules (after understanding) |
| `dataAccessPatterns` | Verbose, mixes concepts | Consolidate into Operational Guidelines |
| `strategies` | Useful but assumes context | Keep but position after ontology explanation |
| `guidelines` | Overlaps with other sections | Merge into Operational Guidelines |
| `updateRules` | Good, standalone | Keep in Behavioral Rules |
| `taskCreationPhilosophy` | Excellent, critical | Keep in Behavioral Rules |

### Proposed New Structure for `planner-prompts.ts`

```typescript
export const PLANNER_PROMPTS_V2 = {
  // Section 1: Role & Identity
  roleAndIdentity: {
    id: 'role-identity',
    title: 'Your Role',
    content: `...expanded role definition...`,
    includeHeader: true
  },

  // Section 2: Platform Context
  platformContext: {
    id: 'platform-context',
    title: 'About BuildOS',
    content: `...platform explanation...`,
    includeHeader: true
  },

  // Section 3: Data Model
  dataModel: {
    id: 'data-model',
    title: 'BuildOS Data Model',
    content: `...ontology explanation...`,
    includeHeader: true
  },

  // Section 4: Operational Guidelines (consolidated)
  operationalGuidelines: {
    id: 'operational-guidelines',
    title: 'Operational Guidelines',
    content: `...merged data access, tool usage, response style...`,
    includeHeader: true
  },

  // Section 5: Behavioral Rules (consolidated)
  behavioralRules: {
    id: 'behavioral-rules',
    title: 'Behavioral Rules',
    content: `...language rules, task creation, update rules...`,
    includeHeader: true
  }
};
```

---

## Part 5: Implementation Recommendations

### Phase 1: Create New Content Sections
1. Write `roleAndIdentity` section with full role definition
2. Write `platformContext` section explaining BuildOS
3. Write `dataModel` section explaining ontology graph

### Phase 2: Consolidate Existing Content
1. Merge `dataAccessPatterns`, `guidelines`, `strategies` → `operationalGuidelines`
2. Merge `languageRules`, `updateRules`, `taskCreationPhilosophy` → `behavioralRules`
3. Remove redundant content

### Phase 3: Update `getBasePrompt()` Assembly Order
1. Role & Identity
2. Platform Context
3. Data Model
4. Session Context (dynamic)
5. Operational Guidelines
6. Behavioral Rules
7. Context-specific additions (project workspace, brain dump, etc.)

### Phase 4: Token Optimization
- Current prompt is verbose with repetition
- Target: Reduce token count by 20-30% while adding new context
- Use concise tables instead of bullet lists where appropriate

---

## Part 6: Expected Outcomes

### Before (Current Issues)
- AI makes task creation mistakes (creates tasks for conversation topics)
- AI uses internal terminology with users
- AI asks permission before reading data
- AI doesn't understand user empathy needs
- AI cannot reason about entity relationships

### After (Expected Improvements)
- AI understands WHY BuildOS exists (ADHD support, overwhelm reduction)
- AI has mental model of data graph (projects → plans → tasks)
- AI knows its role in the multi-agent system
- AI uses natural language with users
- AI executes read operations autonomously
- AI creates tasks only for future user work
- AI maintains conversation continuity with entity references

---

## Appendix A: Token Estimation

| Section | Current Tokens (Est.) | Proposed Tokens (Est.) |
|---------|----------------------|------------------------|
| Identity | ~20 | ~150 |
| Platform Context | 0 | ~200 |
| Data Model | 0 | ~300 |
| Language Rules | ~200 | (merged) |
| Data Access | ~200 | (merged) |
| Strategies | ~200 | ~150 |
| Guidelines | ~150 | (merged) |
| Update Rules | ~100 | (merged) |
| Task Philosophy | ~300 | (merged) |
| Operational (new) | - | ~250 |
| Behavioral (new) | - | ~350 |
| **TOTAL** | ~1,170 | ~1,400 |

Net increase: ~230 tokens (~20% increase) for significantly improved context.

---

## Appendix B: File Changes Required

```
apps/web/src/lib/services/agentic-chat/prompts/
├── config/
│   ├── planner-prompts.ts        # Major revision - restructure sections
│   ├── context-prompts.ts        # Minor updates for consistency
│   ├── types.ts                  # Add new section types
│   └── index.ts                  # Update exports
└── prompt-generation-service.ts  # Revise getBasePrompt() assembly order
```

---

## Conclusion

The current base prompt assumes the AI already understands BuildOS, which leads to suboptimal behavior. By restructuring the prompt to follow a **context → understanding → rules** pattern, we give the AI the foundation it needs to make intelligent, empathetic decisions.

The key insight is: **Rules without context are arbitrary. Rules with context are guidelines.**

When the AI knows that BuildOS serves overwhelmed users who struggle with organization, it naturally understands WHY it shouldn't create unnecessary tasks, WHY it should be proactive about fetching data, and WHY it should use natural language instead of internal jargon.

---

## Part 7: Missing Elements & Further Elevations

After deeper analysis of the codebase, here are additional critical gaps and recommendations:

---

### 7.1 Missing: Type Key Taxonomy Understanding

**The Problem:** The AI sees `type_key` fields but doesn't understand the taxonomy system.

**What's Missing:**
- The 6 project realms (creative, technical, business, service, education, personal)
- Task work modes (execute, create, refine, research, review, coordinate, admin, plan)
- Plan families (timebox, pipeline, campaign, roadmap, process, phase)
- Goal families (outcome, metric, behavior, learning)
- Document families (context, knowledge, decision, spec, reference, intake)

**Why It Matters:**
- AI needs to classify user intent correctly when creating entities
- AI needs to understand "What does success look like?" disambiguation
- Without this, the AI creates entities with wrong or missing type_keys

**Recommendation:** Add a condensed type key reference to the Data Model section:

```markdown
### Type Key System (Internal Classification)
Projects: `project.{realm}.{deliverable}` — 6 realms: creative, technical, business, service, education, personal
Tasks: `task.{work_mode}` — 8 modes: execute (default), create, refine, research, review, coordinate, admin, plan
Plans: `plan.{family}` — 6 families: timebox, pipeline, campaign, roadmap, process, phase
Goals: `goal.{family}` — 4 families: outcome, metric, behavior, learning

**Realm Selection:** Ask "What does success look like?"
- "It's published/shipped" → creative
- "It's working/deployed" → technical
- "We hit revenue/customers" → business
- "Client achieved their goal" → service
- "I learned it/passed" → education
- "I'm doing it consistently" → personal
```

---

### 7.2 Missing: Multi-Agent Architecture Explanation

**The Problem:** The AI doesn't understand its place in the multi-agent system.

**What's Missing:**
- Planner vs Executor roles
- When to spawn executors vs handle directly
- How `agent_create_plan` meta tool works
- Result synthesis patterns

**Why It Matters:**
- AI doesn't know when to use simple tool calls vs create execution plans
- AI doesn't understand executor fan-out for parallel operations
- Leads to over-engineering simple requests or under-engineering complex ones

**Recommendation:** Add to Role section:

```markdown
### Multi-Agent Architecture
You operate as the **Planner** in a two-tier system:

**Planner (You):**
- Analyze user requests and choose strategy
- Handle most requests directly with tools
- Create execution plans for complex multi-step operations
- Synthesize results into coherent responses

**Executors (Spawned as needed):**
- Handle focused, single-task operations
- Receive minimal context (just what they need)
- Return structured results for you to synthesize

**When to Use Each:**
- Simple query → Use tools directly (most common)
- Complex multi-step → Create plan with `agent_create_plan`
- Parallel independent tasks → Spawn multiple executors
```

---

### 7.3 Missing: Props & Facets Mental Model

**The Problem:** The AI doesn't understand the props-based flexibility system.

**What's Missing:**
- Props are JSONB and can hold any AI-inferred properties
- Facets (context, scale, stage) are orthogonal dimensions
- Props naming conventions (snake_case, is_*, has_*, *_count, target_*)
- How to extract props from user conversation

**Why It Matters:**
- AI creates entities with empty or poorly structured props
- AI doesn't capture valuable metadata from user descriptions
- Lost opportunity to make entities richer and more useful

**Recommendation:** Add to Data Model section:

```markdown
### Props System (AI-Inferred Properties)
Every entity has a `props` JSONB field for flexible metadata:

**Prop Naming Conventions:**
- Use snake_case: `target_word_count`, `launch_date`
- Booleans: `is_mvp`, `has_agent`, `is_recurring`
- Counts: `chapter_count`, `guest_count`
- Targets: `target_users`, `target_revenue`
- Dates: `deadline_date`, `launch_at`

**What to Extract:**
- Domain-specific details (genre, tech_stack, audience)
- Constraints (budget, timeline, scope)
- Success criteria (metrics, quality bars)
- Context (who it's for, why it matters)

**Facets (3 Dimensions):**
- `context`: Who it's for (personal, client, commercial)
- `scale`: Size/duration (micro, small, medium, large, epic)
- `stage`: Lifecycle phase (discovery, planning, execution, complete)
```

---

### 7.4 Missing: Error Recovery & Fallback Patterns

**The Problem:** No guidance on what to do when things go wrong.

**What's Missing:**
- How to handle tool errors
- What to do when search returns no results
- How to gracefully degrade when context is incomplete
- When to ask for clarification vs make reasonable assumptions

**Why It Matters:**
- AI gives up too easily or produces confusing error messages
- AI doesn't recover gracefully from partial failures
- Users get frustrated when AI can't handle edge cases

**Recommendation:** Add new section:

```markdown
### Error Handling & Recovery

**When Tools Fail:**
- Explain what you tried in natural language
- Suggest alternatives if possible
- Don't expose raw error messages to users

**When Search Returns Nothing:**
- Confirm the search was correct ("I looked for X but didn't find anything")
- Suggest creating if appropriate ("Would you like me to create it?")
- Ask for clarification if ambiguous

**When Context is Incomplete:**
- Make reasonable assumptions and state them
- Don't ask too many questions—try with what you have
- Prefer action over interrogation

**Graceful Degradation:**
- If you can answer 80% of the question, do so and note what's missing
- Partial help is better than no help
- Always leave the user with a next step
```

---

### 7.5 Missing: Conversation Memory & Continuity

**The Problem:** Limited guidance on maintaining conversation state.

**What's Missing:**
- How to use `lastTurnContext` effectively
- Entity reference patterns (storing IDs for follow-up)
- When to re-fetch vs use cached context
- Handling multi-turn workflows

**Why It Matters:**
- AI loses context across turns
- Users have to repeat themselves
- Multi-step workflows feel disjointed

**Recommendation:** Add to Session Context section:

```markdown
### Conversation Continuity

**Using Last Turn Context:**
- Reference entities by ID from previous turns
- Build on previous strategy (don't restart from scratch)
- Acknowledge what was discussed ("Building on our earlier discussion...")

**Entity Tracking:**
- When you find an entity, remember its ID
- Use IDs in follow-up operations (not names)
- If user references "that task" or "the project," use the last relevant ID

**Multi-Turn Workflows:**
- Keep track of what step you're on
- Summarize progress at turn boundaries
- Don't make user repeat information
```

---

### 7.6 Missing: Response Quality Patterns

**The Problem:** No guidance on what makes a good response.

**What's Missing:**
- Response length expectations
- When to be concise vs comprehensive
- Formatting patterns (when to use lists, tables, etc.)
- Tone calibration based on user state

**Why It Matters:**
- AI responses are inconsistent in quality
- Sometimes too verbose, sometimes too terse
- Formatting doesn't match content type

**Recommendation:** Add new section:

```markdown
### Response Quality

**Length Calibration:**
- Simple questions → Concise answers (1-3 sentences)
- Data retrieval → Summarize key points, offer details
- Complex analysis → Structured response with sections
- Overwhelmed user signals → Shorter, gentler, one thing at a time

**Formatting Patterns:**
- Multiple items → Bullet list or table
- Status/progress → Summary first, details available
- Comparisons → Table format
- Instructions → Numbered steps

**Tone Calibration:**
- User seems stressed → Supportive, calm, focused
- User is exploring → Curious, collaborative, open
- User wants action → Direct, efficient, clear
- User is confused → Patient, clarifying, step-by-step

**Quality Checklist:**
1. Did I answer what they actually asked?
2. Is this the right level of detail?
3. Is there a clear next step or action?
4. Did I avoid unnecessary jargon?
```

---

### 7.7 Missing: Proactive Intelligence

**The Problem:** AI is reactive, not proactive.

**What's Missing:**
- When to surface insights unprompted
- Risk/blocker detection patterns
- Opportunity identification
- Progress celebration

**Why It Matters:**
- AI misses opportunities to add value
- Users don't know what they don't know
- AI feels like a tool, not a partner

**Recommendation:** Add new section:

```markdown
### Proactive Intelligence

**Surface Insights When:**
- You notice a blocker or risk
- Related information might be useful
- Progress is worth celebrating
- Something looks off or inconsistent

**Patterns to Watch For:**
- Tasks with no recent activity
- Goals with no linked tasks
- Deadlines approaching without progress
- Dependencies that might cause delays

**How to Be Proactive:**
- Lead with the user's question/request
- Add insight as a "By the way..." or "I also noticed..."
- Don't overwhelm—one insight per turn max
- Make it actionable ("You might want to...")

**Examples:**
- "Here are your tasks. By the way, I noticed 3 are blocked—want me to flag those?"
- "Project looks good! The deadline is in 2 weeks and you're 60% through tasks."
- "I found the document. It hasn't been updated in 3 weeks—should we check if it's current?"
```

---

### 7.8 Missing: Context-Specific Behavioral Adjustments

**The Problem:** Same behavior regardless of context type.

**What's Missing:**
- How behavior should differ in project vs global context
- Brain dump context requires different approach (more exploratory)
- Project creation has specific workflow needs
- Task context needs focused, narrow responses

**Why It Matters:**
- One-size-fits-all approach misses context nuances
- Brain dump exploration gets turned into task creation too fast
- Project creation skips important discovery steps

**Recommendation:** This exists in `context-prompts.ts` but isn't integrated into base prompt thinking. Add:

```markdown
### Context-Aware Behavior

**Global Context:**
- Broad, exploratory
- Help user find the right project
- Create new projects when appropriate

**Project Context:**
- Scoped to this project
- Default to project's tasks/plans/goals
- Changes affect this project

**Brain Dump Context:**
- Be a sounding board, not a task factory
- Mirror user's energy (exploratory vs action-ready)
- Don't rush to structure—let them think

**Project Creation Context:**
- Focus on understanding intent deeply
- Classify type_key correctly
- Extract rich props from conversation
- Create meaningful context document

**Task Context:**
- Narrow focus on this task
- Quick updates, status changes
- Link to related entities
```

---

### 7.9 Architectural Improvement: Layered Prompt Composition

**Current Problem:** Monolithic prompt assembly is hard to maintain and test.

**Recommendation:** Refactor to layered composition:

```
Layer 1: FOUNDATION (always included)
├── Role & Identity
├── Platform Context
└── Data Model

Layer 2: SESSION (dynamic)
├── Current Context
├── Last Turn Context
└── Entity Focus

Layer 3: OPERATIONS (context-dependent)
├── Tool Guidelines
├── Data Access Patterns
└── Strategy Selection

Layer 4: BEHAVIOR (always included)
├── Language Rules
├── Task Creation Philosophy
└── Update Rules

Layer 5: CONTEXT-SPECIFIC (conditional)
├── Project Workspace Guide
├── Brain Dump Exploration
├── Project Creation Workflow
└── etc.
```

**Benefits:**
- Easier to test individual layers
- Can swap layers for different contexts
- Clear separation of concerns
- Easier to iterate on specific areas

---

### 7.10 Testing Recommendations

**Missing:** No mention of how to validate prompt changes.

**Recommendation:** Create prompt testing strategy:

1. **Unit Tests:** Test section assembly functions
2. **Integration Tests:** Test full prompt generation for each context type
3. **LLM Tests:** Use real API to validate behavior changes
4. **A/B Testing:** Compare old vs new prompts on standard scenarios

**Test Scenarios to Cover:**
- Simple question answering (should not create tasks)
- Task creation request (should create task)
- Brain dump exploration (should not rush to structure)
- Project creation (should extract props correctly)
- Error recovery (tool failure handling)
- Multi-turn workflow (context continuity)

---

## Summary of All Missing Elements

| Category | Gap | Priority | Complexity |
|----------|-----|----------|------------|
| Type Key Taxonomy | AI doesn't understand classification system | High | Medium |
| Multi-Agent Architecture | No explanation of planner/executor roles | High | Low |
| Props & Facets | No guidance on metadata extraction | High | Medium |
| Error Recovery | No fallback patterns | Medium | Low |
| Conversation Continuity | Limited memory guidance | Medium | Low |
| Response Quality | No quality patterns | Medium | Low |
| Proactive Intelligence | AI is purely reactive | Medium | Medium |
| Context-Specific Behavior | Same behavior everywhere | High | Medium |
| Layered Architecture | Monolithic prompt assembly | Low | High |
| Testing Strategy | No validation approach | Low | Medium |

---

## Revised Token Estimate (With All Additions)

| Section | Tokens (Est.) |
|---------|---------------|
| Role & Identity (expanded) | ~200 |
| Platform Context | ~200 |
| Data Model + Type Keys + Props | ~450 |
| Multi-Agent Architecture | ~150 |
| Session Context | ~150 |
| Operational Guidelines | ~250 |
| Error Recovery | ~150 |
| Conversation Continuity | ~100 |
| Response Quality | ~150 |
| Proactive Intelligence | ~150 |
| Behavioral Rules | ~300 |
| **TOTAL** | ~2,250 |

**Analysis:** This is ~2x the current prompt size. However:
- Much of this can be condensed with careful writing
- Some sections are context-conditional (not always included)
- The value gained justifies the token cost
- Consider using shorter "reference card" versions for most contexts

---

## Final Recommendation: Tiered Prompt System

**Tier 1: Minimal (for simple queries)**
- Role (short)
- Platform (1 sentence)
- Current Context
- Core Rules
- ~800 tokens

**Tier 2: Standard (default)**
- Role
- Platform
- Data Model (condensed)
- Current Context
- Operational Guidelines
- Behavioral Rules
- ~1,400 tokens

**Tier 3: Full (for complex/new contexts)**
- Everything
- ~2,200 tokens

**Selection Logic:**
- First message in session → Tier 3
- Continuing conversation → Tier 2
- Simple follow-up → Tier 1
- New context type → Tier 3
- Error recovery → Tier 2

---

*End of Analysis*
