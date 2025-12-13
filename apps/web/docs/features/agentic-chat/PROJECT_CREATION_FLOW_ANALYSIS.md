# Project Creation Flow Analysis

## Document Purpose

This document provides a comprehensive analysis of the current project creation flow in the agentic chat system. It traces the entire flow from frontend to database, identifying all components involved, their responsibilities, and the sequence of operations.

---

## Executive Summary

The project creation flow is a **multi-layered, multi-step process** that involves:

- **3 distinct analysis/decision points** spread across different services
- **2 clarification mechanisms** (pre-strategy and post-strategy)
- **6+ services** coordinating to create a project
- **Multiple LLM calls** at different stages

The flow can be summarized as:

```
Frontend → API Endpoint → Orchestrator → Strategy Analysis → [Clarification?] →
Plan Generation → Tool Execution → API Endpoint → Database
```

---

## Component Overview

### Key Files Involved

| Component                 | File Path                                                                | Responsibility                                                                      |
| ------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Frontend Modal            | `src/lib/components/agent/AgentChatModal.svelte`                         | User interface, sends messages to API                                               |
| API Endpoint              | `src/routes/api/agent/stream/+server.ts`                                 | HTTP streaming endpoint, initializes orchestrator                                   |
| Orchestrator              | `src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts` | Main coordination, strategy selection, stream handling                              |
| Strategy Analyzer         | `src/lib/services/agentic-chat/analysis/strategy-analyzer.ts`            | Determines which strategy to use (planner_stream, project_creation, ask_clarifying) |
| Project Creation Analyzer | `src/lib/services/agentic-chat/analysis/project-creation-analyzer.ts`    | Analyzes if sufficient context exists for project creation                          |
| Prompt Generation         | `src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`     | Builds system prompts with context                                                  |
| Enhanced Prompts          | `src/lib/services/agentic-chat/prompts/project-creation-enhanced.ts`     | Project creation specific prompts                                                   |
| Plan Orchestrator         | `src/lib/services/agentic-chat/planning/plan-orchestrator.ts`            | Creates and executes multi-step plans                                               |
| Tool Execution Service    | `src/lib/services/agentic-chat/execution/tool-execution-service.ts`      | Validates and executes tool calls                                                   |
| Tool Executor             | `src/lib/services/agentic-chat/tools/core/tool-executor.ts`              | Actual tool implementations                                                         |
| Tool Definitions          | `src/lib/services/agentic-chat/tools/core/tool-definitions.ts`           | Tool schemas and metadata                                                           |
| Instantiation API         | `src/routes/api/onto/projects/instantiate/+server.ts`                    | HTTP endpoint for project creation                                                  |
| Instantiation Service     | `src/lib/services/ontology/instantiation.service.ts`                     | Database operations for project creation                                            |

---

## Detailed Flow Analysis

### Phase 1: Frontend → API

```
User types message in AgentChatModal.svelte
    ↓
onSendMessage() triggered
    ↓
fetch('/api/agent/stream', { method: 'POST', body: { message, contextType: 'project_create' } })
    ↓
API endpoint receives request
```

**Key Context Passed:**

- `contextType: 'project_create'` - Signals this is a project creation flow
- `message` - User's raw input
- `sessionId` - Chat session identifier
- `entityId` - Optional, used when in project context

### Phase 2: Orchestrator Initialization

```typescript
// In agent-chat-orchestrator.ts
async *processMessage(message, context, plannerContext, callback) {
    // 1. Build planner context with available tools
    // 2. Check context type
    // 3. Route to appropriate handler
}
```

**Critical Decision Point 1: Context Type Check**

The orchestrator checks `context.contextType`:

- If `'project_create'` → Goes to project creation flow
- Otherwise → Goes to standard planner stream

### Phase 3: Strategy Analysis (First LLM Call)

```
StrategyAnalyzer.analyzeUserIntent()
    ↓
If contextType === 'project_create':
    ↓
analyzeProjectCreationIntent()
    ↓
ProjectCreationAnalyzer.analyzeIntent()
```

**This involves:**

1. **Quick Heuristic Analysis** - Fast keyword-based check
    - Looks for type indicators (app, book, website, etc.)
    - Looks for deliverable indicators (build, create, launch, etc.)
    - Calculates confidence score

2. **LLM Analysis** (if heuristics inconclusive)
    - Sends accumulated context to LLM
    - LLM returns:
        - `hasSufficientContext: boolean`
        - `confidence: number`
        - `clarifyingQuestions?: string[]`
        - `inferredProjectType?: string`

**Critical Decision Point 2: Clarification Loop**

```typescript
// Maximum 2 rounds of clarification
if (roundNumber >= 2) {
    // Proceed with available info, use inference
    return { hasSufficientContext: true, ... }
}

if (!hasSufficientContext) {
    return {
        primary_strategy: ChatStrategy.ASK_CLARIFYING,
        clarifying_questions: [...],
        ...
    }
}
```

**Clarification Metadata Tracked:**

- `roundNumber` - Current clarification round (0, 1, or 2)
- `accumulatedContext` - All user messages combined
- `previousQuestions` - Questions already asked
- `previousResponses` - User's answers

### Phase 4: Strategy Selection Result

The `StrategyAnalyzer` returns one of:

| Strategy           | When Used                   | Next Step                  |
| ------------------ | --------------------------- | -------------------------- |
| `PROJECT_CREATION` | Sufficient context detected | → Plan Generation          |
| `ASK_CLARIFYING`   | Missing critical info       | → Return questions to user |
| `PLANNER_STREAM`   | General queries (fallback)  | → Standard planner flow    |

### Phase 5: Plan Generation (Second LLM Call)

When `PROJECT_CREATION` strategy is selected:

```typescript
// PlanOrchestrator.createPlan()
const plan = await this.generatePlanWithLLM(intent, strategy, plannerContext, context);
```

**Plan Generation System Prompt includes:**

- Available tools list with summaries
- Project creation requirements:
    - Must call `create_onto_project` tool
    - Must include context document
    - Type key classification required
    - Props extraction required

**Generated Plan Structure:**

```typescript
{
    steps: [
        {
            stepNumber: 1,
            type: 'research' | 'action' | 'analysis' | 'synthesis',
            description: string,
            tools: ['create_onto_project'],
            executorRequired: boolean,
            dependsOn: number[]
        }
    ],
    reasoning: string
}
```

### Phase 6: Plan Execution

```typescript
// PlanOrchestrator.executePlan()
for (const step of plan.steps) {
	if (step.tools.length > 0) {
		// Execute tools directly
		for (const toolName of step.tools) {
			const result = await this.toolExecutor(toolName, args, context);
		}
	}
}
```

### Phase 7: Tool Execution - create_onto_project (Third LLM Interaction)

When `create_onto_project` is called:

```typescript
// ChatToolExecutor.createOntoProject()
async createOntoProject(args: CreateOntoProjectArgs) {
    // 1. Check for clarifications (if any)
    if (args.clarifications?.length) {
        return { clarifications: args.clarifications, ... }
    }

    // 2. Build context document
    const contextDocument = buildContextDocumentSpec(args);

    // 3. Call instantiation API
    const data = await this.apiRequest('/api/onto/projects/instantiate', {
        method: 'POST',
        body: JSON.stringify(spec)
    });

    // 4. Return with context_shift for frontend
    return {
        project_id: data.project_id,
        counts: data.counts,
        context_shift: {
            new_context: 'project',
            entity_id: data.project_id,
            ...
        }
    }
}
```

**Tool Arguments Expected:**

```typescript
{
    project: {
        name: string,           // Required
        type_key: string,       // Required - project.{realm}.{deliverable}
        description?: string,
        props?: {
            facets?: { context?, scale?, stage? },
            // Domain-specific props extracted from conversation
        },
        start_at?: string,
        end_at?: string
    },
    goals?: [...],
    tasks?: [...],
    plans?: [...],
    documents?: [...],
    context_document?: {
        title: string,
        body_markdown: string
    },
    clarifications?: [...]  // If more info needed
}
```

### Phase 8: Database Operations

```typescript
// instantiation.service.ts - instantiateProject()
async function instantiateProject(client, spec, userId) {
	// 1. Validate spec with Zod schema
	// 2. Resolve actor ID
	// 3. Insert project record
	// 4. Insert context document (if provided)
	// 5. Insert goals (batch)
	// 6. Insert requirements (batch)
	// 7. Insert documents (sequential for title mapping)
	// 8. Insert plans (sequential for name mapping)
	// 9. Insert tasks (with plan relationship via edges)
	// 10. Insert outputs
	// 11. Insert edges (relationship graph)
	// 12. Return project_id and counts
}
```

**Database Tables Affected:**

- `onto_projects` - Main project record
- `onto_documents` - Context and other documents
- `onto_goals` - Project goals
- `onto_requirements` - Project requirements
- `onto_plans` - Execution plans
- `onto_tasks` - Tasks (with edge relationships to plans)
- `onto_outputs` - Deliverables
- `onto_edges` - All entity relationships

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  AgentChatModal.svelte                                                       │
│  ├── User types project description                                          │
│  ├── contextType: 'project_create' set                                       │
│  └── POST /api/agent/stream                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API LAYER                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  /api/agent/stream/+server.ts                                                │
│  ├── Authenticate user                                                       │
│  ├── Initialize AgentChatOrchestrator                                        │
│  └── Start SSE stream                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATION LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  AgentChatOrchestrator                                                       │
│  ├── Build ServiceContext                                                    │
│  ├── Build PlannerContext (tools, ontology)                                  │
│  ├── ═══════════════════════════════════════                                 │
│  │   DECISION POINT 1: Strategy Analysis                                     │
│  │   StrategyAnalyzer.analyzeUserIntent()                                    │
│  │     └── ProjectCreationAnalyzer.analyzeIntent()                           │
│  │         ├── Quick heuristic analysis                                      │
│  │         └── [LLM Call #1] Deep analysis if needed                         │
│  ├── ═══════════════════════════════════════                                 │
│  │   DECISION POINT 2: Clarification Check                                   │
│  │   If insufficient context → Ask questions                                 │
│  │   If max rounds reached → Proceed with inference                          │
│  ├── ═══════════════════════════════════════                                 │
│  │   If PROJECT_CREATION strategy selected:                                  │
│  │   PlanOrchestrator.createPlan()                                           │
│  │     └── [LLM Call #2] Generate execution plan                             │
│  └── ═══════════════════════════════════════                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  PlanOrchestrator.executePlan()                                              │
│  ├── For each step in plan:                                                  │
│  │   ├── ToolExecutionService.executeTool()                                  │
│  │   │   └── ChatToolExecutor.execute()                                      │
│  │   │       └── createOntoProject()                                         │
│  │   │           ├── Build context document                                  │
│  │   │           └── POST /api/onto/projects/instantiate                     │
│  │   └── Emit stream events (tool_call, tool_result)                         │
│  └── Return final results                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  /api/onto/projects/instantiate/+server.ts                                   │
│  └── instantiation.service.ts                                                │
│      ├── Validate ProjectSpec                                                │
│      ├── Insert onto_projects                                                │
│      ├── Insert onto_documents (context doc)                                 │
│      ├── Insert onto_goals                                                   │
│      ├── Insert onto_requirements                                            │
│      ├── Insert onto_plans                                                   │
│      ├── Insert onto_tasks                                                   │
│      ├── Insert onto_outputs                                                 │
│      └── Insert onto_edges (relationships)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Identified Complexities

### 1. Multiple Analysis Points

The flow has **3 separate places** where project creation intent is analyzed:

1. **StrategyAnalyzer.analyzeUserIntent()** - Determines overall strategy
2. **ProjectCreationAnalyzer.analyzeIntent()** - Checks context sufficiency
3. **PlanOrchestrator system prompt** - LLM re-evaluates during plan generation

These can produce inconsistent results or redundant LLM calls.

### 2. Dual Clarification Mechanisms

Clarifications can happen at:

1. **Pre-strategy** (ProjectCreationAnalyzer) - Returns `ASK_CLARIFYING` strategy
2. **In-tool** (create_onto_project) - Tool can return `clarifications` array

These are disconnected systems with different UX patterns.

### 3. Context Document Generation

The context document is built in **two places**:

1. **buildContextDocumentSpec()** in tool-executor.ts - Generates from args
2. **Prompt instructions** - Tell LLM to generate in create_onto_project call

This can lead to inconsistent context documents.

### 4. Props Extraction Redundancy

Props extraction is instructed in:

1. **project-creation-enhanced.ts** prompts
2. **prompt-generation-service.ts** system prompts
3. **tool-definitions.ts** tool description
4. **PlanOrchestrator** plan generation prompt

Each location has slightly different guidance.

### 5. Plan Generation Overhead

For project creation, the plan generation step often produces a simple 1-2 step plan:

1. Classify and extract props
2. Call create_onto_project

This LLM call may be unnecessary for straightforward project creation.

---

## Current LLM Call Sequence

For a typical project creation flow:

| #   | Location                | Purpose                         | Avoidable?                                   |
| --- | ----------------------- | ------------------------------- | -------------------------------------------- |
| 1   | ProjectCreationAnalyzer | Determine if sufficient context | Potentially (heuristics may suffice)         |
| 2   | PlanOrchestrator        | Generate execution plan         | Potentially (deterministic for simple cases) |
| 3   | Planner Stream          | Execute plan steps with LLM     | Required for tool selection/args             |

**Minimum LLM calls: 1** (if heuristics pass and plan is deterministic)
**Typical LLM calls: 2-3**

---

## Key Data Structures

### ServiceContext

```typescript
interface ServiceContext {
	userId: string;
	sessionId: string;
	contextType: ChatContextType; // 'project_create' | 'project' | etc.
	entityId?: string;
	supabase: SupabaseClient;
}
```

### PlannerContext

```typescript
interface PlannerContext {
	availableTools: ChatToolDefinition[];
	ontologyContext?: OntologyContext;
	locationContext: string;
	metadata?: {
		hasOntology: boolean;
		plannerAgentId?: string;
	};
}
```

### StrategyAnalysis

```typescript
interface StrategyAnalysis {
	primary_strategy: ChatStrategy;
	confidence: number;
	reasoning: string;
	needs_clarification: boolean;
	clarifying_questions?: string[];
	estimated_steps: number;
	required_tools: string[];
	can_complete_directly: boolean;
	project_creation_analysis?: ProjectCreationIntentAnalysis;
}
```

### ProjectSpec (for instantiation)

```typescript
interface ProjectSpec {
	project: {
		name: string;
		type_key: string;
		description?: string;
		props?: { facets?: Facets; [key: string]: unknown };
		start_at?: string;
		end_at?: string;
	};
	goals?: GoalSpec[];
	requirements?: RequirementSpec[];
	plans?: PlanSpec[];
	tasks?: TaskSpec[];
	outputs?: OutputSpec[];
	documents?: DocumentSpec[];
	context_document?: ContextDocumentSpec;
}
```

---

## Recommendations for Phase 2 Consolidation

Based on this analysis, here are potential simplification opportunities:

### 1. Merge Analysis Points

Combine `StrategyAnalyzer.analyzeProjectCreationIntent()` and `ProjectCreationAnalyzer` into a single service that:

- Performs heuristic check first
- Only calls LLM if truly ambiguous
- Returns unified result with strategy + analysis

### 2. Deterministic Plan for Project Creation

When `contextType === 'project_create'` and analysis passes:

- Skip LLM-based plan generation
- Use a deterministic plan template:
    ```typescript
    const PROJECT_CREATION_PLAN = {
    	steps: [
    		{
    			stepNumber: 1,
    			type: 'action',
    			tools: ['create_onto_project'],
    			executorRequired: false
    		}
    	]
    };
    ```

### 3. Unified Clarification Flow

Consolidate clarification into one place:

- Remove `clarifications` from tool args
- Handle all clarification in orchestrator pre-execution
- Use consistent UX pattern

### 4. Single Source of Truth for Prompts

Create one authoritative location for project creation prompts:

- Type key taxonomy
- Props extraction rules
- Context document requirements

### 5. Direct Tool Call Path

For simple project creation (high confidence, no clarification):

- Bypass plan orchestration entirely
- Call `create_onto_project` directly from orchestrator
- Save 1-2 LLM calls

---

## Appendix: File Locations Quick Reference

```
apps/web/src/lib/
├── components/agent/
│   └── AgentChatModal.svelte              # Frontend
├── services/agentic-chat/
│   ├── orchestration/
│   │   └── agent-chat-orchestrator.ts     # Main orchestrator
│   ├── analysis/
│   │   ├── strategy-analyzer.ts           # Strategy selection
│   │   └── project-creation-analyzer.ts   # Context sufficiency
│   ├── planning/
│   │   └── plan-orchestrator.ts           # Plan generation/execution
│   ├── execution/
│   │   └── tool-execution-service.ts      # Tool execution wrapper
│   ├── prompts/
│   │   ├── prompt-generation-service.ts   # System prompts
│   │   └── project-creation-enhanced.ts   # Project creation prompts
│   └── tools/core/
│       ├── tool-definitions.ts            # Tool schemas
│       └── tool-executor.ts               # Tool implementations
├── services/ontology/
│   └── instantiation.service.ts           # Database operations
└── routes/api/
    ├── agent/stream/+server.ts            # Chat API
    └── onto/projects/instantiate/+server.ts # Project creation API
```
