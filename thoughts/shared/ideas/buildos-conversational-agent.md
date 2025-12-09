<!-- thoughts/shared/ideas/buildos-conversational-agent.md -->
# BuildOS Conversational Agent - Context & Vision Document

## The Problem We're Solving

BuildOS currently has a braindump flow where users input unstructured thoughts and the system automatically creates projects and tasks. While this works well, it lacks the nuance and clarification that comes from dialogue. Users often have incomplete ideas that would benefit from thoughtful questioning before crystallization into projects.

## The Core Philosophy: Talking vs Listening

The key insight driving this feature is that human communication has two fundamental modes:

**1. Talking Mode (Current Braindump):** Getting information out of your head without interruption. This is cathartic and necessary - people need to dump their thoughts without being interrupted by questions or structure.

**2. Listening Mode (New Agent):** Once thoughts are externalized, people shift into a receptive state where they're ready to refine, clarify, and structure their ideas through dialogue.

Most productivity apps fail because they interrupt the talking phase or skip the listening phase entirely. BuildOS will excel by respecting both modes.

## The Solution: An AI Agent That Actually Listens

We're building a conversational agent that:

- Lets users brain dump first (respecting the talking phase)
- Then asks intelligent, contextual questions (the listening phase)
- Gradually builds structured projects through natural dialogue
- Shows all operations transparently so users maintain control

## The 9 Core Dimensions Framework

BuildOS projects are built around a unique framework inspired by the Enneagram, recognizing that projects have 9 fundamental dimensions or concerns:

1. **Integrity & Ideals** - What does "done right" look like?
2. **People & Bonds** - Who's involved and how do they interact?
3. **Goals & Momentum** - What are the milestones and timeline?
4. **Meaning & Identity** - Why does this matter? What makes it unique?
5. **Reality & Understanding** - What's the current state and constraints?
6. **Trust & Safeguards** - What could go wrong? What's the backup plan?
7. **Opportunity & Freedom** - What options and experiments are possible?
8. **Power & Resources** - What budget, tools, and permissions are needed?
9. **Harmony & Integration** - How will progress be tracked and integrated?

The agent's intelligence comes from:

- Detecting which dimensions are relevant to each specific project
- Only asking about dimensions that matter (not all 9 for every project)
- Prioritizing questions from most to least important
- Accepting that users won't have all answers immediately

## Four Agent Modes

### 1. Project Create Mode

**Purpose:** Guide users from vague idea to structured project

**Flow:**

1. User opens agent and brain dumps their project idea
2. Agent listens without interruption (respecting talking mode)
3. Agent analyzes the dump to identify relevant dimensions
4. Agent asks 3-5 clarifying questions (simple projects) or 7-10 (complex projects)
5. User can answer, skip, or say "create project now" at any time
6. Agent builds project incrementally through draft system

**Key Innovation:** The agent works with drafts, allowing iterative refinement without committing to final structure prematurely.

### 2. Project Update Mode

**Purpose:** Efficiently update existing projects based on new information

**Flow:**

1. User describes what's changed or new
2. Agent immediately identifies affected areas
3. Operations execute without requiring confirmation
4. Changes appear in real-time in the operations log

**Philosophy:** Be efficient and action-oriented. Don't ask unnecessary questions.

### 3. Project Audit Mode

**Purpose:** Critical review to identify gaps and weaknesses

**Flow:**

1. Agent loads full project context
2. Analyzes across all 9 dimensions
3. Points out inconsistencies, missing info, unrealistic assumptions
4. Asks probing "what if" questions
5. Provides concrete recommendations

**Tone:** 7/10 harshness - direct and honest without being demoralizing. This is about making projects more robust and likely to succeed.

### 4. Project Forecast Mode

**Purpose:** Predict likely outcomes and scenarios

**Flow:**

1. User describes a situation or decision point
2. Agent generates three scenarios:
    - Optimistic (30% probability)
    - Realistic (50% probability)
    - Pessimistic (20% probability)
3. Identifies critical decision points and early warning signs

## The User Experience Vision

### Intelligent Entry Points

The agent is context-aware based on where the user is in the app:

- **Global pages** → Opens in project creation mode
- **Project pages** → Shows selector with Update/Audit/Forecast options
- **Task pages** → Opens in task update mode

### The Split Interface

```
┌─────────────────────────────────────────────────────┐
│  Past Chats │     Main Chat      │  Operations Panel │
│  (context)  │   (conversation)   │   (transparency)  │
└─────────────────────────────────────────────────────┘
```

**Left Panel:** Shows relevant past conversations about the current entity (project/task), allowing continuity across sessions.

**Center:** The main conversation with the agent, using natural language and streaming responses.

**Right Panel:** Split into two sections:

- **Top:** Completed operations log (what's been done)
- **Bottom:** Queued operations awaiting approval (what's about to be done)

### Progressive Disclosure & Control

Users can:

- Expand/collapse individual operations to see details
- Approve operations individually or in bulk
- Edit operations before execution
- See full diffs for updates
- Undo operations when possible

## Technical Architecture Highlights

### Draft System

Projects and tasks start as drafts that can be iteratively refined through conversation. This allows the agent to build understanding progressively without premature commitment.

### Operation Queue

All changes are queued as operations that can be reviewed, edited, and approved. This provides transparency and control while maintaining conversation flow.

### Intelligent Failure Recovery

When operations fail, the agent attempts to fix them automatically using LLM analysis. Only if that fails does it ask the user for help.

### Session Continuity

Chat sessions are linked to projects/tasks through many-to-many relationships, enabling rich context and conversation history.

### Reuse of Existing Systems

The agent integrates with the existing BrainDumpProcessor for handling large unstructured dumps, combining the best of both approaches.

## Why This Matters

This isn't just another chatbot bolted onto an app. It's a fundamental rethinking of how humans and AI collaborate on project management:

1. **Respects Human Psychology:** Acknowledges talking vs listening modes
2. **Builds Trust Through Transparency:** Every operation is visible and editable
3. **Adapts to Complexity:** Simple projects get simple flows, complex projects get deeper exploration
4. **Maintains Context:** Past conversations inform future interactions
5. **Preserves Agency:** Users can always take control, skip questions, or revert to classic mode

## Success Metrics

We'll know we've succeeded when:

- Users choose the agent over classic braindump >60% of the time
- Projects created through the agent have more complete dimension coverage
- The audit mode helps users identify and fix issues before they become problems
- Users report feeling like they have a "thought partner" not just a tool

## The Path Forward

The implementation spec that follows breaks this vision into 7 concrete phases, each building on the last. We start with the data foundation, build core services, add UI components, and progressively roll out to users with careful monitoring and iteration.

This agent represents BuildOS's evolution from a project management tool to an intelligent project thinking partner - one that listens first, asks thoughtful questions, and helps users build better projects through natural conversation.
