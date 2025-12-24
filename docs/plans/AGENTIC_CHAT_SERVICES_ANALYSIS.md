<!-- docs/plans/AGENTIC_CHAT_SERVICES_ANALYSIS.md -->

# Agentic Chat Services Analysis

> **Created:** 2024-12-16
> **Updated:** 2024-12-16
> **Purpose:** Comprehensive analysis of the agentic chat flow for refactoring and cleanup
> **Status:** ✅ **ALL PHASES COMPLETE**
> **Related:** `docs/plans/AGENT_STREAM_ENDPOINT_REFACTORING_PLAN.md` (completed)

---

## ✅ Refactoring Progress Summary

All planned refactoring phases have been completed:

| Phase   | Description                                                 | Status      | LOC Impact                 |
| ------- | ----------------------------------------------------------- | ----------- | -------------------------- |
| **1.1** | Split ChatToolExecutor (2,075 LOC) into domain executors    | ✅ Complete | 6 files, ~200-400 LOC each |
| **1.2** | Split tool-definitions.ts (2,026 LOC) into category files   | ✅ Complete | 7 files                    |
| **1.3** | Split AgentContextService (1,381 LOC) into focused services | ✅ Complete | 953 + 606 LOC (context/)   |
| **2**   | Add debug_context stream event for observability            | ✅ Complete | New observability/ module  |
| **3**   | Extract prompts to configuration files                      | ✅ Complete | 5 config files, 1,011 LOC  |

### New Directory Structure

```
services/agentic-chat/
├── tools/core/
│   ├── executors/                    # Phase 1.1 - Domain executors
│   │   ├── types.ts                  # Shared types
│   │   ├── base-executor.ts          # Common infrastructure
│   │   ├── ontology-read-executor.ts # list_*, search_*, get_*
│   │   ├── ontology-write-executor.ts# create_*, update_*, delete_*
│   │   ├── utility-executor.ts       # get_field_info, relationships
│   │   ├── external-executor.ts      # web_search, buildos docs
│   │   └── index.ts
│   ├── definitions/                  # Phase 1.2 - Tool definitions
│   │   ├── types.ts
│   │   ├── field-metadata.ts
│   │   ├── ontology-read.ts
│   │   ├── ontology-write.ts
│   │   ├── utility.ts
│   │   ├── tool-metadata.ts
│   │   └── index.ts
│   └── tool-executor-refactored.ts   # Thin orchestrator
├── prompts/
│   └── config/                       # Phase 3 - Prompt configs
│       ├── types.ts
│       ├── planner-prompts.ts
│       ├── executor-prompts.ts
│       ├── context-prompts.ts
│       └── index.ts
├── observability/                    # Phase 2 - Debug context
│   ├── debug-context-builder.ts
│   └── index.ts
└── orchestration/
    └── agent-chat-orchestrator.ts    # Updated with debug_context emission

services/context/                      # Phase 1.3 - Context module
├── types.ts                          # TOKEN_BUDGETS, ExecutorTask, etc.
├── context-formatters.ts             # formatOntologyContext, formatCombinedContext
├── executor-context-builder.ts       # buildExecutorContext
└── index.ts
```

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [The Three Pillars](#the-three-pillars)
    - [Data: How Context is Built](#1-data---how-context-is-built)
    - [Prompts: How Instructions are Constructed](#2-prompts---how-instructions-are-constructed)
    - [Tools: How Tools are Scoped](#3-tools---how-tools-are-scoped)
4. [Service Dependency Graph](#service-dependency-graph)
5. [Complete Request Flow](#complete-request-flow)
6. [Clean Code Analysis](#clean-code-analysis)
7. [Service Inventory](#service-inventory)
8. [Refactoring Recommendations](#refactoring-recommendations)
9. [Key Files Reference](#key-files-reference)
10. [Action Items](#action-items)

---

## Executive Summary

The agentic chat system has been recently refactored at the endpoint layer (`+server.ts` reduced from ~1,344 to ~290 lines). The underlying services are well-structured but several large files violate clean code principles, particularly:

- **`tool-executor.ts`** (2,075 LOC) - executes 30+ tools in one file
- **`tool-definitions.ts`** (2,026 LOC) - all tool definitions monolithic
- **`AgentContextService`** (1,381 LOC) - multiple responsibilities
- **`PlanOrchestrator`** (1,319 LOC) - plan lifecycle too coupled

### Code Volume Summary

| Layer                                                 | Lines of Code | Files  |
| ----------------------------------------------------- | ------------- | ------ |
| Stream Endpoint (`/routes/api/agent/stream/`)         | ~3,070        | 18     |
| Agentic Chat Services (`/lib/services/agentic-chat/`) | ~14,000       | 33     |
| External Dependencies (SmartLLM, AgentContext, etc.)  | ~4,500        | 4      |
| **Total**                                             | **~21,500**   | **55** |

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (Frontend)                                 │
│                                                                              │
│  Sends: message, session_id, context_type, entity_id, projectFocus          │
│  Receives: SSE stream (text, tool_call, tool_result, done, error, etc.)     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     API ENDPOINT LAYER                                       │
│                                                                              │
│  /routes/api/agent/stream/+server.ts (290 LOC)                              │
│  - Authentication & rate limiting                                            │
│  - Request parsing & validation                                              │
│  - Service orchestration                                                     │
│  - SSE stream creation                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SERVICE ORCHESTRATION LAYER                              │
│                                                                              │
│  AgentChatOrchestrator (1,095 LOC)                                          │
│  - Planner loop coordination                                                 │
│  - Tool execution delegation                                                 │
│  - Plan creation handling                                                    │
│  - Stream event generation                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│   CONTEXT LAYER      │ │   TOOL LAYER     │ │   PLANNING LAYER     │
│                      │ │                  │ │                      │
│ AgentContextService  │ │ ToolExecution    │ │ PlanOrchestrator     │
│ PromptGeneration     │ │ ChatToolExecutor │ │ ExecutorCoordinator  │
│ OntologyContextLoader│ │ ToolDefinitions  │ │ ResponseSynthesizer  │
└──────────────────────┘ └──────────────────┘ └──────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PERSISTENCE LAYER                                        │
│                                                                              │
│  AgentPersistenceService - agents, plans, sessions, messages                 │
│  Supabase - onto_* tables, chat_sessions, chat_messages                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Three Pillars

### 1. DATA - How Context is Built

The data flow for building LLM context:

```
Request arrives
       │
       ▼
SessionManager.resolveSession()
       │
       ├── Fetch existing session OR create new
       ├── Load recent messages if no history provided
       └── Return: session, metadata, conversationHistory
       │
       ▼
OntologyCacheService.loadWithSessionCache()
       │
       ├── Check session cache (5min TTL in agent_metadata)
       ├── If cache miss: OntologyContextLoader.loadContext()
       │   ├── loadProjectContext() → project + entity counts + relationships
       │   ├── loadElementContext() → task/goal/plan/document details
       │   └── loadGlobalContext() → recent projects + counts
       └── Return: ontologyContext + cacheMetadata
       │
       ▼
AgentContextService.buildPlannerContext()
       │
       ├── processConversationHistory() → compress/trim to token budget
       ├── formatOntologyContext() OR formatCombinedContext()
       ├── loadLinkedEntitiesContext() → related entities for focus
       └── loadUserProfile() → user preferences
       │
       ▼
PlannerContext {
  systemPrompt,        // Full LLM instructions
  locationContext,     // Current project/entity context
  ontologyContext,     // Raw ontology data
  conversationHistory, // Processed messages
  availableTools,      // Scoped tools for context
  metadata             // Session, focus, token usage
}
```

#### Key Files for Data Flow

| File                         | Location                             | LOC   | Responsibility                 |
| ---------------------------- | ------------------------------------ | ----- | ------------------------------ |
| `session-manager.ts`         | `/routes/api/agent/stream/services/` | 393   | Session CRUD, focus resolution |
| `ontology-cache.ts`          | `/routes/api/agent/stream/services/` | 283   | Session-level caching          |
| `ontology-context-loader.ts` | `/lib/services/`                     | ~600  | Raw ontology loading           |
| `agent-context-service.ts`   | `/lib/services/`                     | 1,381 | Full context assembly          |

#### Caching Strategy

| Layer                 | TTL    | Storage                                      | Purpose               |
| --------------------- | ------ | -------------------------------------------- | --------------------- |
| Session-level cache   | 5 min  | `chat_sessions.agent_metadata.ontologyCache` | Cross-request caching |
| OntologyContextLoader | 60 sec | In-memory Map                                | Reduce DB queries     |

---

### 2. PROMPTS - How Instructions are Constructed

The prompt generation flow:

```
PromptGenerationService.buildPlannerSystemPrompt(context)
       │
       ├── getBasePrompt(contextType, ontologyContext, lastTurnContext)
       │   │
       │   ├── Core instructions (~180 lines)
       │   │   - User-facing language rules (no internal terminology)
       │   │   - Current context (type, level, previous turn)
       │   │   - Data access pattern (progressive disclosure)
       │   │   - Available strategies (planner_stream, project_creation, clarifying)
       │   │   - Non-destructive update guidelines
       │   │   - Task creation philosophy
       │   │
       │   └── Task type key guidance
       │
       ├── IF contextType === 'project' OR ontologyContext?.type === 'project':
       │   └── getProjectWorkspacePrompt(ontologyContext, entityId)
       │       - Project workspace operating guide
       │       - Scoped to specific project
       │       - Read vs write operation guidance
       │
       ├── IF contextType === 'project_create':
       │   └── getProjectCreationPrompt()
       │       - Type classification guidance
       │       - Prop extraction rules
       │       - Context document requirements
       │
       ├── IF contextType === 'brain_dump':
       │   └── getBrainDumpPrompt()
       │       - Sounding board approach
       │       - When NOT to structure
       │       - Transition to action cues
       │
       ├── IF lastTurnContext:
       │   └── getLastTurnPrompt(lastTurnContext)
       │       - Previous turn summary
       │       - Entities from last turn
       │       - Continuity guidance
       │
       ├── getOntologyContextPrompt(ontologyContext)
       │   - Project/element/global specific context
       │   - Entity counts, relationships
       │   - Available actions hints
       │
       └── IF linkedEntitiesContext:
           └── formatLinkedEntitiesForSystemPrompt()
               - Related tasks, goals, documents
               - Truncated for token budget
```

#### Key Files for Prompts

| File                           | Location                                     | LOC  | Responsibility            |
| ------------------------------ | -------------------------------------------- | ---- | ------------------------- |
| `prompt-generation-service.ts` | `/lib/services/agentic-chat/prompts/`        | 590  | Main prompt builder       |
| `prompt-components.ts`         | `/lib/services/prompts/core/`                | ~300 | Reusable prompt fragments |
| `context-prompts.ts`           | `/lib/services/agentic-chat/prompts/config/` | ~280 | Context-specific prompts  |

#### Current Prompt Structure

```typescript
// Example system prompt structure (abbreviated)
`You are an AI assistant in BuildOS with advanced context awareness.

## CRITICAL: User-Facing Language Rules
[Rules about not exposing internal terminology]

## Current Context
- Type: ${contextType}
- Level: ${ontologyContext?.type || 'standard'}
- Previous Turn: ${lastTurnContext?.summary || 'First message'}

## Data Access Pattern (CRITICAL)
[Progressive disclosure rules]

## Available Strategies
1. planner_stream: Default autonomous planner loop
2. project_creation: Only for new projects
3. ask_clarifying_questions: When ambiguity remains

## Important Guidelines
[Task creation philosophy, update strategies, etc.]

## [Context-Specific Section]
[Project workspace / Project creation / Brain dump specific]

## Current Project/Element (Internal Reference)
[Ontology context summary]
`;
```

---

### 3. TOOLS - How Tools are Scoped

The tool selection and execution flow:

```
tools.config.ts
       │
       ├── TOOL_GROUPS = {
       │     base: [get_field_info, get_entity_relationships, web_search, ...]
       │     global: [list_onto_projects, search_ontology, list_onto_tasks, ...]
       │     project_create: [create_onto_project]
       │     project: [all ontology tools + CRUD]
       │     project_audit: []  // TODO
       │     project_forecast: [] // TODO
       │   }
       │
       └── CONTEXT_TO_TOOL_GROUPS = {
             global: ['base', 'global']
             project_create: ['base', 'project_create']
             project: ['base', 'project']
             task: ['base', 'project']
             calendar: ['base', 'global']
             ...
           }
       │
       ▼
getToolsForContextType(contextType, options)
       │
       ├── Resolve tool groups for context
       ├── Optionally exclude write tools
       └── Return ChatToolDefinition[]
       │
       ▼
AgentContextService.filterToolsForFocus(tools, projectFocus)
       │
       ├── If no focus or project-wide: return all tools
       └── Filter to focus-relevant tools (e.g., task-specific)
       │
       ▼
Available tools sent to LLM
       │
       ▼
LLM calls tool → ToolExecutionService.executeTool()
       │
       ├── Validate tool call against definitions
       ├── Check for virtual handlers (e.g., agent_create_plan)
       └── Execute via ChatToolExecutor
             │
             └── 30+ tool implementations
                 - Ontology: list, search, get, create, update, delete
                 - Web search: Tavily API
                 - BuildOS docs: overview, usage guide
                 - Utility: field info, relationships
```

#### Tool Categories

| Category          | Tools    | Avg Tokens | Purpose              |
| ----------------- | -------- | ---------- | -------------------- |
| `ontology`        | 17 tools | 350        | Read ontology data   |
| `ontology_action` | 15 tools | 400        | Write ontology data  |
| `utility`         | 1 tool   | 80         | Field info lookup    |
| `web_research`    | 1 tool   | 700        | External search      |
| `buildos_docs`    | 2 tools  | 900        | System documentation |

#### Key Files for Tools

| File                        | Location                                 | LOC   | Responsibility       |
| --------------------------- | ---------------------------------------- | ----- | -------------------- |
| `tools.config.ts`           | `/lib/services/agentic-chat/tools/core/` | 303   | Tool selection logic |
| `tool-definitions.ts`       | `/lib/services/agentic-chat/tools/core/` | 2,026 | All tool schemas     |
| `tool-executor.ts`          | `/lib/services/agentic-chat/tools/core/` | 2,075 | Tool implementations |
| `tool-execution-service.ts` | `/lib/services/agentic-chat/execution/`  | 631   | Execution wrapper    |

---

## Service Dependency Graph

```
+server.ts (290 LOC) ─────────────────────────────────────────────────────────
│                                                                     ✅ Clean
├── SessionManager (393 LOC) ─────────────────────────────────────────────────
│   │                                                                 ✅ Focused
│   └── Supabase (chat_sessions, chat_messages)
│
├── OntologyCacheService (283 LOC) ───────────────────────────────────────────
│   │                                                                 ✅ Focused
│   └── OntologyContextLoader (~600 LOC)
│       └── Supabase (onto_* tables)
│
├── MessagePersister (173 LOC) ───────────────────────────────────────────────
│   │                                                                 ✅ Focused
│   └── Supabase (chat_messages)
│
└── StreamHandler (662 LOC) ──────────────────────────────────────────────────
    │                                                                 ✅ Acceptable
    └── AgentChatOrchestrator (1,095 LOC) ────────────────────────────────────
        │                                                             ⚠️ Large
        ├── EnhancedLLMWrapper (204 LOC) ─────────────────────────────────────
        │   │                                                         ✅ Clean
        │   └── SmartLLMService (2,095 LOC)
        │
        ├── ProjectCreationAnalyzer (504 LOC) ────────────────────────────────
        │   │                                                         ✅ Focused
        │   └── SmartLLMService
        │
        ├── ToolExecutionService (631 LOC) ───────────────────────────────────
        │   │                                                         ✅ Reasonable
        │   └── ChatToolExecutor (2,075 LOC) ─────────────────────────────────
        │       │                                                     ❌ Too large
        │       ├── Supabase (onto_* tables)
        │       ├── SmartLLMService
        │       └── Web search (Tavily)
        │
        ├── PlanOrchestrator (1,319 LOC) ─────────────────────────────────────
        │   │                                                         ⚠️ Large
        │   ├── SmartLLMService
        │   ├── ExecutorCoordinator (354 LOC)
        │   │   └── AgentExecutorService (1,092 LOC)
        │   └── AgentPersistenceService (691 LOC)
        │
        ├── ResponseSynthesizer (599 LOC) ────────────────────────────────────
        │   │                                                         ✅ Focused
        │   └── SmartLLMService
        │
        └── AgentContextService (1,381 LOC) ──────────────────────────────────
            │                                                         ⚠️ Large
            ├── PromptGenerationService (590 LOC)
            │                                                         ✅ Recently extracted
            ├── ChatCompressionService
            ├── ChatContextService
            └── OntologyContextLoader
```

### Legend

- ✅ Clean/Focused - Under 700 LOC, single responsibility
- ⚠️ Large - 1,000-1,500 LOC, consider splitting
- ❌ Too large - Over 2,000 LOC, needs splitting

---

## Complete Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       POST /api/agent/stream                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. AUTHENTICATION                                                            │
│    safeGetSession() → userId                                                 │
│    ensure_actor_for_user RPC → actorId                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. RATE LIMITING (currently disabled)                                        │
│    rateLimiter.checkLimit(userId)                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. REQUEST PARSING                                                           │
│    parseRequest(request) → StreamRequest                                     │
│    - message, session_id, context_type, entity_id                            │
│    - projectFocus, lastTurnContext                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. SESSION RESOLUTION                                                        │
│    SessionManager.resolveSession(streamRequest, userId)                      │
│    ├── If session_id: fetchChatSession() → existing session                  │
│    │   └── If no history provided: loadRecentMessages()                      │
│    └── Else: createChatSession() → new session                               │
│    Return: { session, metadata, conversationHistory }                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. PROJECT FOCUS RESOLUTION                                                  │
│    SessionManager.resolveProjectFocus(request, session, metadata)            │
│    ├── Normalize incoming focus vs stored focus                              │
│    └── If changed: Update metadata (deferred to stream end)                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. USER MESSAGE PERSISTENCE                                                  │
│    MessagePersister.persistUserMessage()                                     │
│    → INSERT into chat_messages                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. ONTOLOGY CONTEXT LOADING                                                  │
│    OntologyCacheService.loadWithSessionCache(request, metadata)              │
│    ├── Check session cache (agent_metadata.ontologyCache)                    │
│    ├── If cache valid (< 5min, same key): Use cached context                 │
│    └── Else: OntologyContextLoader.loadContext()                             │
│        ├── loadProjectContext() → project + counts + relationships           │
│        ├── loadCombinedProjectElementContext() → project + element           │
│        ├── loadElementContext() → specific entity details                    │
│        └── loadGlobalContext() → recent projects + global counts             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 8. STREAM CREATION                                                           │
│    StreamHandler.createAgentStream({...})                                    │
│    └── SSEResponse.createChatStream() → Response with SSE headers            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 9. ASYNC ORCHESTRATION (in IIFE)                                             │
│                                                                              │
│    AgentChatOrchestrator.streamConversation(request, callback)               │
│    │                                                                         │
│    ├── AgentContextService.buildPlannerContext()                             │
│    │   ├── PromptGenerationService.buildPlannerSystemPrompt()                │
│    │   ├── processConversationHistory() → compress if needed                 │
│    │   ├── formatOntologyContext() → location context string                 │
│    │   └── getToolsForContextType() → available tools                        │
│    │                                                                         │
│    ├── Emit: session, last_turn_context, context_usage events                │
│    │                                                                         │
│    ├── IF contextType === 'project_create':                                  │
│    │   └── checkProjectCreationClarification()                               │
│    │       ├── ProjectCreationAnalyzer.analyzeIntent()                       │
│    │       └── If needs clarification: emit questions, return early          │
│    │                                                                         │
│    └── runPlannerLoop({messages, tools, plannerContext, serviceContext})     │
│        │                                                                     │
│        └── LOOP while continueLoop:                                          │
│            ├── EnhancedLLMWrapper.streamText() → LLM streaming               │
│            │   └── Yield: text chunks, tool_call events                      │
│            │                                                                 │
│            ├── If no tool calls: append assistant message, emit done         │
│            │                                                                 │
│            └── For each tool call:                                           │
│                ├── ToolExecutionService.executeTool()                        │
│                │   ├── Validate against definitions                          │
│                │   ├── If virtual (agent_create_plan): handlePlanToolCall()  │
│                │   │   └── PlanOrchestrator.createPlanFromIntent()           │
│                │   └── Else: ChatToolExecutor.execute()                      │
│                │                                                             │
│                ├── Yield: tool_result event                                  │
│                ├── Handle context_shift if present                           │
│                └── Append tool result to messages                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 10. STREAM FINALIZATION (finally block)                                      │
│     ├── Persist assistant message (chat_messages INSERT)                     │
│     ├── Persist tool results (chat_messages INSERT)                          │
│     ├── CONSOLIDATE: Single metadata write to chat_sessions                  │
│     │   (ontologyCache, projectFocus, lastContextUsage)                      │
│     ├── Emit: done event                                                     │
│     └── Close stream                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Clean Code Analysis

### Clean Code Principles Applied

| Principle                       | Current State | Issues                              |
| ------------------------------- | ------------- | ----------------------------------- |
| **SRP** (Single Responsibility) | ⚠️ Partial    | Several services do multiple things |
| **OCP** (Open/Closed)           | ✅ Good       | Event system is extensible          |
| **DRY** (Don't Repeat Yourself) | ✅ Good       | Recently consolidated duplicates    |
| **KISS** (Keep It Simple)       | ⚠️ Partial    | Some complex nested logic           |
| **ISP** (Interface Segregation) | ✅ Good       | Clean service interfaces            |
| **DIP** (Dependency Inversion)  | ✅ Good       | Services depend on abstractions     |

### SRP Violations Identified

| File                  | Lines | Responsibilities (should be 1)                    |
| --------------------- | ----- | ------------------------------------------------- |
| `tool-executor.ts`    | 2,075 | 30+ tool implementations, all entity types        |
| `tool-definitions.ts` | 2,026 | All 36 tool definitions in one file               |
| `AgentContextService` | 1,381 | Context building, formatting, compression, tokens |
| `PlanOrchestrator`    | 1,319 | Plan creation, validation, execution, review      |

### DRY Status (Recently Fixed)

The following duplications were identified and **consolidated** in the recent refactoring:

| Function                             | Was In                                    | Now In                   |
| ------------------------------------ | ----------------------------------------- | ------------------------ |
| `normalizeContextType()`             | +server.ts, orchestrator, context-service | `utils/context-utils.ts` |
| `buildContextShiftLastTurnContext()` | +server.ts, orchestrator                  | `utils/context-utils.ts` |

### Deep Nesting Example

```typescript
// In AgentContextService.buildPlannerContext() - 4 levels of branching
if (contextType === 'project_create') {
	// path 1
} else if (ontologyContext?.type === 'combined' && projectFocus) {
	// path 2
} else if (ontologyContext) {
	// path 3
} else {
	// path 4
}
```

**Recommendation:** Extract to strategy pattern or use polymorphism.

### Mixed Abstraction Levels

`AgentContextService` mixes:

- **High-level:** Context assembly orchestration
- **Mid-level:** Ontology formatting, conversation processing
- **Low-level:** Token estimation, string concatenation, DB queries

---

## Service Inventory

### Tier 1: Entry Points & Orchestration

| Service                 | File                         | LOC   | Responsibility                            |
| ----------------------- | ---------------------------- | ----- | ----------------------------------------- |
| Stream Endpoint         | `+server.ts`                 | 290   | HTTP handling, request orchestration      |
| Stream Handler          | `stream-handler.ts`          | 662   | SSE lifecycle, metadata consolidation     |
| Agent Chat Orchestrator | `agent-chat-orchestrator.ts` | 1,095 | Planner loop, tool execution coordination |

### Tier 2: Core Service Orchestrators

| Service                | File                        | LOC   | Responsibility                       |
| ---------------------- | --------------------------- | ----- | ------------------------------------ |
| Plan Orchestrator      | `plan-orchestrator.ts`      | 1,319 | Plan creation, validation, execution |
| Tool Execution Service | `tool-execution-service.ts` | 631   | Tool validation, execution wrapper   |
| Response Synthesizer   | `response-synthesizer.ts`   | 599   | Result → user-friendly response      |

### Tier 3: Execution & Persistence

| Service                   | File                           | LOC   | Responsibility                   |
| ------------------------- | ------------------------------ | ----- | -------------------------------- |
| Executor Coordinator      | `executor-coordinator.ts`      | 354   | Spawn executor agents for steps  |
| Agent Persistence Service | `agent-persistence-service.ts` | 691   | DB operations for agents, plans  |
| Chat Tool Executor        | `tool-executor.ts`             | 2,075 | **All 30+ tool implementations** |

### Tier 4: Stream Endpoint Support

| Service                | File                   | LOC | Responsibility                 |
| ---------------------- | ---------------------- | --- | ------------------------------ |
| Session Manager        | `session-manager.ts`   | 393 | Session CRUD, focus resolution |
| Ontology Cache Service | `ontology-cache.ts`    | 283 | Session-level context caching  |
| Message Persister      | `message-persister.ts` | 173 | Chat message persistence       |

### Tier 5: Context & Configuration

| Service                   | File                           | LOC   | Responsibility                          |
| ------------------------- | ------------------------------ | ----- | --------------------------------------- |
| Agent Context Service     | `agent-context-service.ts`     | 1,381 | Full planner/executor context building  |
| Prompt Generation Service | `prompt-generation-service.ts` | 590   | System prompt construction              |
| Enhanced LLM Wrapper      | `enhanced-llm-wrapper.ts`      | 204   | Model selection, parameter optimization |
| Tools Config              | `tools.config.ts`              | 303   | Context-aware tool selection            |

### Tier 6: Analysis & Utilities

| Service                   | File                           | LOC | Responsibility                  |
| ------------------------- | ------------------------------ | --- | ------------------------------- |
| Project Creation Analyzer | `project-creation-analyzer.ts` | 504 | Clarification need detection    |
| Context Utils             | `context-utils.ts`             | 358 | Context normalization functions |
| Event Mapper              | `event-mapper.ts`              | 227 | Stream event type mapping       |
| Rate Limiter              | `rate-limiter.ts`              | 247 | Request rate limiting           |

### External Dependencies (Critical)

| Service                  | File                          | LOC   | Responsibility               |
| ------------------------ | ----------------------------- | ----- | ---------------------------- |
| Smart LLM Service        | `smart-llm-service.ts`        | 2,095 | LLM abstraction, streaming   |
| Ontology Context Loader  | `ontology-context-loader.ts`  | ~600  | Raw ontology data loading    |
| Agent Executor Service   | `agent-executor-service.ts`   | 1,092 | Execute executor agent tasks |
| Chat Compression Service | `chat-compression-service.ts` | ~400  | Conversation compression     |

---

## Refactoring Recommendations

### Phase 1: Split Large Services (Priority: High)

#### 1.1 Split `ChatToolExecutor` (2,075 LOC)

**Current:** Single file with 30+ tool implementations

**Proposed Structure:**

```
tools/core/
├── tool-executor.ts              # Base executor + dispatch (~200 LOC)
├── executors/
│   ├── index.ts                  # Re-exports
│   ├── ontology-read-executor.ts # list_*, search_*, get_* (~400 LOC)
│   ├── ontology-write-executor.ts # create_*, update_*, delete_* (~400 LOC)
│   ├── web-search-executor.ts    # web_search (~100 LOC)
│   ├── buildos-docs-executor.ts  # get_buildos_overview, usage_guide (~100 LOC)
│   └── utility-executor.ts       # get_field_info, relationships (~150 LOC)
└── index.ts                      # Re-exports
```

#### 1.2 Split `tool-definitions.ts` (2,026 LOC)

**Proposed Structure:**

```
tools/definitions/
├── index.ts                      # Re-exports all
├── ontology-read.definitions.ts  # 17 read tools
├── ontology-write.definitions.ts # 15 write tools
├── utility.definitions.ts        # get_field_info, relationships
├── web-search.definitions.ts     # web_search
└── buildos.definitions.ts        # get_buildos_overview, usage_guide
```

#### 1.3 Split `AgentContextService` (1,381 LOC)

**Proposed Structure:**

```
services/context/
├── index.ts                      # Re-exports
├── planner-context-builder.ts    # buildPlannerContext (~400 LOC)
├── executor-context-builder.ts   # buildExecutorContext (~200 LOC)
├── context-formatter.ts          # formatOntologyContext, formatCombinedContext (~300 LOC)
├── conversation-processor.ts     # processConversationHistory (~200 LOC)
└── token-estimator.ts            # Token budget calculations (~100 LOC)
```

### Phase 2: Extract Prompts to Configuration (Priority: Medium)

**Goal:** Make prompts easily editable without code changes

**Proposed Structure:**

```
prompts/
├── registry/
│   ├── index.ts                  # Prompt registry
│   ├── base-prompts.ts           # Core instructions
│   ├── context-prompts.ts        # Context-specific sections
│   └── guidance-prompts.ts       # Task creation, update strategies
├── templates/
│   ├── planner.md                # Planner system prompt template
│   ├── project-create.md         # Project creation prompt
│   ├── brain-dump.md             # Brain dump exploration
│   └── executor.md               # Executor agent prompt
└── loader.ts                     # Load prompts from templates
```

**Benefits:**

- Easy to iterate on prompts
- Can A/B test variations
- Prompts can be loaded from database for per-user customization

### Phase 3: Create Observability Layer (Priority: High)

**Goal:** See prompts, context, and tools for any chat session

**Implementation:**

```typescript
// services/observability/prompt-debugger.ts
export interface PromptDebugInfo {
  requestId: string;
  timestamp: Date;
  contextType: ChatContextType;
  systemPrompt: string;
  systemPromptTokens: number;
  locationContext: string;
  locationContextTokens: number;
  availableTools: { name: string; category: string }[];
  toolsTokens: number;
  ontologySnapshot: {
    type: string;
    entityCounts: Record<string, number>;
    focusEntity?: { type: string; id: string; name: string };
  };
  conversationTokens: number;
  totalTokens: number;
}

// Emit as stream event for frontend debugging
yield { type: 'debug_context', debug: promptDebugInfo };
```

**Add to StreamHandler:**

```typescript
if (process.env.DEBUG_AGENT_CONTEXT === 'true') {
  yield { type: 'debug_context', debug: buildDebugInfo(plannerContext) };
}
```

### Phase 4: Standardize Project Data Loading (Priority: Medium)

**Goal:** Single interface for "what data do we have for this project"

```typescript
// services/project-graph/project-data-snapshot.ts
export interface ProjectDataSnapshot {
	project: {
		id: string;
		name: string;
		description: string;
		state_key: string;
		type_key: string;
		props: Record<string, any>;
	};
	entities: {
		tasks: Array<{ id: string; name: string; state_key: string; priority?: number }>;
		goals: Array<{ id: string; name: string; state_key: string }>;
		plans: Array<{ id: string; name: string; state_key: string }>;
		documents: Array<{ id: string; title: string; kind: string }>;
	};
	relationships: Array<{
		source_id: string;
		target_id: string;
		relation: string;
	}>;
	metadata: {
		loadedAt: Date;
		cacheKey: string;
		tokenEstimate: number;
		entityCounts: Record<string, number>;
	};
}

// Usage
const snapshot = await projectDataLoader.loadSnapshot(projectId, userId);
```

---

## Key Files Reference

### For DATA (Context Building)

| Priority | File                         | Path                                                   |
| -------- | ---------------------------- | ------------------------------------------------------ |
| 1        | `agent-context-service.ts`   | `/lib/services/agent-context-service.ts`               |
| 2        | `ontology-context-loader.ts` | `/lib/services/ontology-context-loader.ts`             |
| 3        | `ontology-cache.ts`          | `/routes/api/agent/stream/services/ontology-cache.ts`  |
| 4        | `session-manager.ts`         | `/routes/api/agent/stream/services/session-manager.ts` |

### For PROMPTS (Instructions)

| Priority | File                           | Path                                                              |
| -------- | ------------------------------ | ----------------------------------------------------------------- |
| 1        | `prompt-generation-service.ts` | `/lib/services/agentic-chat/prompts/prompt-generation-service.ts` |
| 2        | `prompt-components.ts`         | `/lib/services/prompts/core/prompt-components.ts`                 |
| 3        | `context-prompts.ts`           | `/lib/services/agentic-chat/prompts/config/context-prompts.ts`    |

### For TOOLS (Tool Scoping)

| Priority | File                        | Path                                                             |
| -------- | --------------------------- | ---------------------------------------------------------------- |
| 1        | `tools.config.ts`           | `/lib/services/agentic-chat/tools/core/tools.config.ts`          |
| 2        | `tool-definitions.ts`       | `/lib/services/agentic-chat/tools/core/tool-definitions.ts`      |
| 3        | `tool-executor.ts`          | `/lib/services/agentic-chat/tools/core/tool-executor.ts`         |
| 4        | `tool-execution-service.ts` | `/lib/services/agentic-chat/execution/tool-execution-service.ts` |

---

## Action Items

### Immediate (This Sprint)

- [x] **Add debug event** - Emit `debug_context` stream event with full prompt/tools/context
- [x] **Create ProjectDataSnapshot type** - Standardize project data interface (`apps/web/src/lib/services/project-graph/project-data-snapshot.ts`)
- [ ] **Document prompt templates** - Extract to markdown files for easy editing

### Short-Term (Next 2 Sprints)

- [x] **Split tool-executor.ts** - Apply SRP, create domain-specific executors (monolith replaced by refactored orchestrator)
- [x] **Split tool-definitions.ts** - Group by category
- [x] **Split AgentContextService** - Extract formatters and processors (core logic now 517 LOC + `services/context/`)

### Medium-Term (Following Quarter)

- [ ] **Prompt registry** - Load prompts from config/database
- [ ] **Observability dashboard** - UI to view prompt/context for debugging
- [ ] **A/B testing** - Support prompt variations

---

## Appendix: Stream Event Types

```typescript
type StreamEvent =
	| { type: 'session'; session: ChatSession }
	| { type: 'ontology_loaded'; summary: string }
	| { type: 'last_turn_context'; context: LastTurnContext }
	| { type: 'context_usage'; usage: ContextUsageSnapshot }
	| {
			type: 'agent_state';
			state: 'thinking' | 'executing_plan' | 'waiting_on_user';
			contextType: ChatContextType;
			details?: string;
	  }
	| { type: 'clarifying_questions'; questions: string[] }
	| { type: 'plan_created'; plan: AgentPlan }
	| {
			type: 'plan_ready_for_review';
			plan: AgentPlan;
			summary?: string;
			recommendations?: string[];
	  }
	| { type: 'step_start'; step: PlanStep }
	| { type: 'step_complete'; step: PlanStep }
	| { type: 'executor_spawned'; executorId: string; task: any }
	| { type: 'executor_result'; executorId: string; result: ExecutorResult }
	| {
			type: 'plan_review';
			plan: AgentPlan;
			verdict: 'approved' | 'changes_requested' | 'rejected';
			notes?: string;
			reviewer?: string;
	  }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; toolCall: ChatToolCall }
	| { type: 'tool_result'; result: ToolExecutionResult }
	| { type: 'done'; usage?: { total_tokens: number } }
	| { type: 'error'; error: string }
	// Proposed new event for debugging:
	| { type: 'debug_context'; debug: PromptDebugInfo };
```

---

## Related Documentation

- [Agent Stream Endpoint Refactoring Plan](./AGENT_STREAM_ENDPOINT_REFACTORING_PLAN.md) - Completed
- [Ontology Data Models](/apps/web/docs/features/ontology/DATA_MODELS.md)
- [Clean Code Principles](https://blog.codacy.com/clean-code-principles)
