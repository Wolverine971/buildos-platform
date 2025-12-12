# Agentic Chat Streamlining Plan

> **Status:** In Progress
> **Created:** 2025-12-12
> **Last Updated:** 2025-12-12 (Phase 1, 5 & 6 Complete)

## Overview

This document tracks the assessment and streamlining of the agentic chat backend services following the removal of the templating system.

---

## Current Architecture

### Component Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AgentChatOrchestrator                              │
│  Location: orchestration/agent-chat-orchestrator.ts (1094 lines)        │
│  Role: Main entry point, SSE streaming, service coordination            │
└─────────────┬───────────────────────────────────────────────────────────┘
              │
              ├──► AgentContextService (1733 lines)
              │    Location: agent-context-service.ts
              │    Role: Context building, token management, compression
              │
              ├──► StrategyAnalyzer (672 lines)
              │    Location: analysis/strategy-analyzer.ts
              │    Role: Intent analysis, strategy selection
              │
              ├──► ProjectCreationAnalyzer (504 lines)
              │    Location: analysis/project-creation-analyzer.ts
              │    Role: Project creation intent, clarifying questions
              │
              ├──► PlanOrchestrator (1320 lines)
              │    Location: planning/plan-orchestrator.ts
              │    Role: Plan creation, execution, validation, review
              │
              ├──► ToolExecutionService (641 lines)
              │    Location: execution/tool-execution-service.ts
              │    Role: Tool validation, execution, retry logic
              │
              └──► ResponseSynthesizer (600 lines)
                   Location: synthesis/response-synthesizer.ts
                   Role: Natural language response generation
```

### Request Flow

```
1. API Endpoint (/api/agent/stream)
   │
2. AgentChatOrchestrator.streamConversation()
   │
   ├─► Build PlannerContext (AgentContextService)
   │   - System prompt generation
   │   - Conversation compression
   │   - Location context (ontology/standard)
   │   - Tool filtering
   │
   ├─► Project Creation Check (if contextType === 'project_create')
   │   - Analyze intent sufficiency
   │   - Generate clarifying questions if needed
   │   - Max 2 clarification rounds
   │
   └─► Planner Loop
       │
       ├─► Stream LLM response with tools
       │
       ├─► For each tool call:
       │   └─► ToolExecutionService.executeTool()
       │       - Virtual handlers (agent_create_plan)
       │       - Real tool execution
       │       - Context shift detection
       │
       ├─► If agent_create_plan called:
       │   └─► PlanOrchestrator
       │       - Create plan from intent
       │       - Execute based on mode (auto/draft/review)
       │       - Synthesize results
       │
       └─► Continue loop until no tool calls
```

---

## Issues Identified

### 1. Excessive Code Duplication

| Location                                        | Issue                                               | Lines |
| ----------------------------------------------- | --------------------------------------------------- | ----- |
| `AgentContextService.buildEnhancedSystemPrompt` | Massive method with context-specific blocks         | ~320  |
| Project creation guidance                       | Duplicated in context service AND imported constant | N/A   |
| Prompt patterns                                 | Similar structures repeated across files            | N/A   |

### 2. Overly Complex Context Building

- **Three paths** for location context: standard, ontology, combined
- Multiple metadata extraction patterns causing confusion
- Token estimation uses rough `length / 4` without real tokenizer
- `buildEnhancedSystemPrompt` handles 6+ context types in one method

### 3. Strategy Analyzer Underutilized

- Orchestrator does its own project creation clarification check
- Strategy analysis result doesn't fully drive execution flow
- `PLANNER_STREAM` strategy always goes to same loop regardless of analysis

### 4. Project Creation Flow is Tangled

**Spread across 3 locations:**

1. `AgentChatOrchestrator.checkProjectCreationClarification()` - Main check
2. `ProjectCreationAnalyzer` - Intent analysis
3. `StrategyAnalyzer.analyzeProjectCreationIntent()` - Strategy path

**Complex metadata tracking:**

- `roundNumber`, `accumulatedContext`, `previousQuestions`, `previousResponses`
- Passed through request, analyzed, updated, returned

### 5. PlanOrchestrator Does Too Much

Single 1320-line file handling:

- Plan creation via LLM
- Plan validation
- Plan optimization
- Plan execution with dependency management
- Draft persistence
- Review workflow
- Step-by-step execution

### 6. Error Handling Inconsistency

| Pattern                                               | Used By                            |
| ----------------------------------------------------- | ---------------------------------- |
| Custom errors (`StrategyError`, `PlanExecutionError`) | StrategyAnalyzer, PlanOrchestrator |
| `ExecutionResult` with success/error                  | ToolExecutionService               |
| Try/catch with console.error                          | Most services                      |

Mixed patterns make error propagation unpredictable.

### 7. Template Removal Artifacts

- References to `type_key` inference in prompts
- Old prompt sections mentioning template selection
- Potential dead code paths

---

## Streamlining Plan

### Phase 1: Extract System Prompts ✅ COMPLETE

**Goal:** Move all prompt generation to dedicated modules

**Tasks:**

- [x] Enhanced existing `PromptGenerationService` as single source of truth
- [x] Added `getBrainDumpPrompt()` method for brain dump context
- [x] Enhanced `getOntologyContextPrompt()` with detailed context info
- [x] Added `linkedEntitiesContext` support in prompt generation
- [x] Deleted 330-line `buildEnhancedSystemPrompt` from AgentContextService
- [x] Updated AgentContextService to use `PromptGenerationService.buildPlannerSystemPrompt()`
- [x] Removed duplicate `formatLastTurnEntities` method
- [x] Added missing `PROJECT_CONTEXT_DOC_GUIDANCE` import

**Files modified:**

- `src/lib/services/agent-context-service.ts` - Now 1369 lines (was 1733, -364 lines)
- `src/lib/services/agentic-chat/prompts/prompt-generation-service.ts` - Enhanced as canonical prompt source

### Phase 2: Consolidate Project Creation Flow

**Goal:** Single service owns project creation logic

**Tasks:**

- [ ] Move clarification check from orchestrator to ProjectCreationAnalyzer
- [ ] Have strategy analyzer delegate to ProjectCreationAnalyzer
- [ ] Simplify metadata tracking
- [ ] Remove redundant checks

**Files to modify:**

- `src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `src/lib/services/agentic-chat/analysis/project-creation-analyzer.ts`
- `src/lib/services/agentic-chat/analysis/strategy-analyzer.ts`

### Phase 3: Split PlanOrchestrator

**Goal:** Separate concerns into focused services

**New structure:**

```
planning/
├── plan-orchestrator.ts      (thin coordinator)
├── plan-generator.ts         (LLM-based plan creation)
├── plan-executor.ts          (step execution logic)
└── plan-validator.ts         (validation and optimization)
```

**Tasks:**

- [ ] Extract `PlanGenerator` class
- [ ] Extract `PlanExecutor` class
- [ ] Extract `PlanValidator` class
- [ ] Refactor `PlanOrchestrator` as coordinator

### Phase 4: Simplify Context Service

**Goal:** Single clear path for context building

**Tasks:**

- [ ] Consolidate location context loading into single method
- [ ] Create `ContextBuilder` pattern with chainable steps
- [ ] Remove duplicate token budget constants
- [ ] Improve token estimation (consider tiktoken)

### Phase 5: Standardize Error Handling ✅ COMPLETE

**Goal:** Consistent `ExecutionResult<T>` pattern

**Tasks:**

- [x] Define standard `Result<T, E>` type with `ok()` and `err()` helpers
- [x] Add `ErrorCategory` enum (RETRYABLE, FATAL, USER_FACING, INTERNAL)
- [x] Add `ErrorCode` enum for all error types
- [x] Enhance `AgenticChatError` base class with:
    - `isRetryable()` method
    - `getUserMessage()` method
    - `toResult<T>()` converter
- [x] Add new error types: `ValidationError`, `TimeoutError`, `LLMError`
- [ ] Convert all services to return `ExecutionResult<T>` (future)
- [ ] Convert thrown errors at service boundaries (future)

**Files modified:**

- `src/lib/services/agentic-chat/shared/types.ts` - Added Result types and enhanced errors

### Phase 6: Clean Up Template References ✅ COMPLETE

**Goal:** Remove dead code from template removal

**Tasks:**

- [x] Remove `TemplateCreationEvent` from `StreamEvent` union type
- [x] Remove `ensureTemplateForScope()` stub method from tool-executor.ts
- [x] Remove `ensureTemplatesForProjectSpec()` stub method
- [x] Remove all calls to template stub methods (5 call sites)
- [x] Update `TEMPLATE_INHERITANCE_REFERENCE` to `PROJECT_CLASSIFICATION_REFERENCE`
- [x] Update `ONTOLOGY_REFERENCE` to remove template mentions
- [x] Remove `template_generation` from LLM cache wrapper
- [x] Rename `getTemplateInferenceSystemPrompt` to `getTypeKeyInferenceSystemPrompt`
- [x] Update tool-definitions.ts type_key description
- [x] Simplify `normalizeExecutionError()` in tool-execution-service.ts

**Files modified:**

- `src/lib/services/agentic-chat/shared/types.ts`
- `src/lib/services/agentic-chat/tools/core/tool-executor.ts`
- `src/lib/services/agentic-chat/tools/buildos/references.ts`
- `src/lib/services/agentic-chat/config/llm-cache-wrapper.ts`
- `src/lib/services/agentic-chat/prompts/project-creation-enhanced.ts`
- `src/lib/services/agentic-chat/tools/core/tool-definitions.ts`
- `src/lib/services/agentic-chat/execution/tool-execution-service.ts`

---

## Progress Log

### 2025-12-12: Phase 1 Complete

**Prompt Consolidation:**

- Enhanced `PromptGenerationService` as the single source of truth for all planner prompts
- Added `EntityLinkedContext` import and support for linked entities in prompts
- Added `getBrainDumpPrompt()` method for brain dump exploration mode
- Enhanced `getOntologyContextPrompt()` with:
    - Context document ID support
    - Relationship/edge details
    - Hierarchy level information
    - Recent projects listing
    - Entity distribution
- Deleted the 330-line `buildEnhancedSystemPrompt()` method from `AgentContextService`
- Updated `AgentContextService.buildPlannerContext()` to delegate to `PromptGenerationService.buildPlannerSystemPrompt()`
- Removed duplicate `formatLastTurnEntities` method (now only in PromptGenerationService)
- Added import for `generateProjectContextFramework` and defined `PROJECT_CONTEXT_DOC_GUIDANCE` constant

**Net Result:** Reduced `AgentContextService` from 1733 lines to 1369 lines (-364 lines, -21%)

**Verified:** Type check passes (exit code 0)

### 2025-12-12: Phase 5 & 6 Complete

**Phase 5 - Error Handling:**

- Added `Result<T, E>` discriminated union type for functional error handling
- Added `ok()` and `err()` helper functions
- Added `isOk()` and `isErr()` type guards
- Created `ErrorCategory` enum: RETRYABLE, FATAL, USER_FACING, INTERNAL
- Created `ErrorCode` enum for all error types
- Enhanced `AgenticChatError` with categorization and user-friendly messages
- Added new error classes: `ValidationError`, `TimeoutError`, `LLMError`

**Phase 6 - Template Cleanup:**

- Removed `TemplateCreationEvent` from StreamEvent type (was imported from shared-types)
- Removed `ensureTemplateForScope()` and `ensureTemplatesForProjectSpec()` stub methods
- Removed 5 call sites to these stub methods
- Updated reference documents to use type_key classification language
- Removed `template_generation` operation type from cache wrapper
- Renamed misleading function name
- Simplified error handling in tool-execution-service

**Verified:** Type check passes (exit code 0)

### 2025-12-12: Initial Assessment

- [x] Read and analyzed all core service files
- [x] Mapped component architecture
- [x] Identified 7 key issues
- [x] Created streamlining plan with 6 phases

### Next Steps

- Phase 1: Extract system prompts (PromptGenerationService already exists, needs consolidation)
- Phase 2: Consolidate project creation flow
- Phase 3: Split PlanOrchestrator
- Phase 4: Simplify context service

---

## File Reference

| File                                       | Lines | Role                                         |
| ------------------------------------------ | ----- | -------------------------------------------- |
| `orchestration/agent-chat-orchestrator.ts` | 1094  | Main orchestrator                            |
| `agent-context-service.ts`                 | ~1369 | Context building (reduced from 1733)         |
| `planning/plan-orchestrator.ts`            | 1320  | Plan management                              |
| `analysis/strategy-analyzer.ts`            | 672   | Strategy selection                           |
| `execution/tool-execution-service.ts`      | 641   | Tool execution                               |
| `synthesis/response-synthesizer.ts`        | 600   | Response generation                          |
| `analysis/project-creation-analyzer.ts`    | 504   | Project creation intent                      |
| `shared/types.ts`                          | ~550  | Type definitions (enhanced with error types) |
| `prompts/prompt-generation-service.ts`     | ~650  | System prompt generation                     |

**Total:** ~7,400+ lines across core services

---

## Success Metrics

After streamlining:

- [x] `buildEnhancedSystemPrompt` eliminated (delegated to PromptGenerationService) ✅
- [ ] Project creation flow in single service
- [ ] `PlanOrchestrator` split into 3-4 focused services
- [ ] All services use `Result<T, E>` pattern
- [x] No template references in prompts ✅
- [x] Standard error handling types defined ✅
- [ ] Clear documentation of flow

---

## Notes

- Templates were removed prior to this work
- Ontology system (`onto_*` tools) is the primary data layer
- Frontend (`AgentChatModal.svelte`) is not the focus of this refactor
- SSE streaming architecture should be preserved
