<!-- design/design-agentic-chat-audit.md -->

# Agentic Chat Design Audit

> Applying Ryo Lu's design principles to simplify and unify BuildOS's Agentic Chat system.

---

## Executive Summary

BuildOS has a **powerful, sophisticated agentic chat system** with genuine capabilities. However, it has accumulated complexity through treating similar concepts as distinct types rather than variations of core patterns.

**The diagnosis:** The system is feature-rich but concept-heavy. A user (or developer) must understand too many "things" to grasp the system.

**The prescription:** Apply Ryo Lu's core principle—**unify, don't fragment**—to consolidate concepts while preserving power.

---

## Current State: By The Numbers

| Metric                      | Count    | Assessment         |
| --------------------------- | -------- | ------------------ |
| Service Files               | 76       | High fragmentation |
| Context Types               | 11       | Should be 3-4      |
| Tools                       | 60+      | Well-organized     |
| SSE Event Types             | 20+      | Redundant          |
| Message Types               | 9        | Some legacy        |
| AgentChatModal Lines        | 3,694    | Monolith           |
| AgentChatOrchestrator Lines | 2,075    | Complex            |
| Total Agentic Chat LOC      | ~15,000+ | Significant        |

---

## Ryo Lu Design Principles Applied

### Principle 1: "Think in Systems, Not Features"

> "Instead of five discrete little things, you just make the circle big. It's now one thing. But there are still ways for people to do the five discrete things."

**Current Problem: 11 Context Types**

```
global, project, calendar, general, project_create, project_audit,
project_forecast, daily_brief_update, ontology, brain_dump, agent_peer
```

Each has its own:

- Tool selection logic
- System prompt variations
- Normalization/alias rules
- Special-case handling

**Ryo Lu Would Say:** These are not 11 things. They're 3 things with modes.

**Proposed Unification:**

```typescript
// BEFORE: 11 context types
type ChatContextType =
	| 'global'
	| 'project'
	| 'calendar'
	| 'general'
	| 'project_create'
	| 'project_audit'
	| 'project_forecast'
	| 'daily_brief_update'
	| 'ontology'
	| 'brain_dump'
	| 'agent_peer';

// AFTER: 3 scopes + modes
interface ChatContext {
	scope: 'global' | 'project' | 'calendar';
	mode?: 'create' | 'audit' | 'forecast' | 'brief';
	focus?: { entityType: string; entityId: string };
}
```

**Benefits:**

- Users understand 3 scopes (where am I working?)
- Modes are optional specializations (what kind of work?)
- Focus narrows further (which specific thing?)
- Tool selection becomes: `getTools(scope, mode)` instead of 11 switch cases

---

### Principle 2: "Simplicity ≠ Minimalism"

> "At the core of what you're doing is really simple concepts where the architecture is really simple. But each of them combine—they're layered. They multiply into emergent complexity."

**Current Problem: Event Type Explosion**

The system has 20+ distinct SSE event types:

```
session, context_usage, focus_active, last_turn_context, agent_state,
text, tool_call, tool_result, plan_created, plan_ready_for_review,
plan_review, step_start, step_complete, executor_spawned, executor_result,
context_shift, clarifying_questions, error, done, debug_context, telemetry
```

**Ryo Lu Would Say:** These aren't 20 things. They're state transitions on 4-5 entities.

**Proposed Unification:**

```typescript
// BEFORE: 20+ event types
type EventType = 'plan_created' | 'plan_ready_for_review' | 'plan_review' | ...

// AFTER: Entity + State pattern
interface StreamEvent {
  entity: 'session' | 'agent' | 'plan' | 'step' | 'tool' | 'stream';
  state: string;  // entity-specific states
  data: unknown;
}

// Plan states: created → ready_for_review → approved → executing → completed
// Tool states: called → executing → completed | failed
// Agent states: thinking → planning → executing → waiting
```

**Benefits:**

- 5 entities instead of 20 event types
- State machines are predictable and visualizable
- UI can show entity state consistently
- Easier to add new states without new event types

---

### Principle 3: "Designing Containers, Not Screens"

> "Instead of designing exactly how this piece of UI will look, you are actually designing a container. These are the patterns in my whole system."

**Current Problem: AgentChatModal is a 113KB Monolith**

This single component handles:

- SSE stream management
- Message state
- Voice recording state
- Plan visualization
- Thinking block state
- Operations queue
- Draft management
- Context selection
- Token budget display
- All message rendering

**Ryo Lu Would Say:** This isn't a component. It's 6 components in a trench coat.

**Proposed Decomposition:**

```
AgentChat/
├── AgentChatContainer.svelte     # Layout shell, state orchestration
├── AgentStreamManager.svelte     # SSE connection, event dispatch
├── AgentMessagePane.svelte       # Message list + thinking blocks
├── AgentInputPane.svelte         # Composer + voice + status
├── AgentSidebar.svelte           # Operations log + drafts (collapsible)
└── AgentHeader.svelte            # Context selector + token budget
```

**Benefits:**

- Each component has single responsibility
- Easier to test in isolation
- Can reuse components in other contexts
- Mental model: "Chat = Container + Panes"

---

### Principle 4: "Serve the Spectrum"

> "We want to serve everyone—from the most experienced coders who want full manual control to people who are more 'vibes' and let the agent do everything."

**Current Problem: Plans Have Binary Review**

Plans are either:

- Auto-executed (user has no control)
- Require full review (user must approve)

No in-between for users who want partial control.

**Proposed Enhancement:**

```typescript
interface PlanExecutionPreference {
	// Spectrum of control
	mode: 'auto' | 'approve_destructive' | 'approve_all' | 'step_by_step';

	// Trust thresholds
	autoApproveReadOnly: boolean; // List/search operations
	autoApproveCreates: boolean; // New entities
	requireApprovalDeletes: boolean; // Destructive operations
	requireApprovalExternalAPIs: boolean; // Web search, calendar
}
```

**Benefits:**

- Users can dial control up or down
- Power users can auto-approve everything
- Cautious users can review each step
- Default can be "approve destructive only"

---

### Principle 5: "Start with Slop, Refine with Soul"

> "AI output is always slop at first. Your job is to take that slop and inject soul into it."

**Current Problem: CSS-in-JS Outliers**

Two components (`OperationsQueue`, `OperationsLog`) use 400+ lines of inline CSS instead of Tailwind:

```svelte
<!-- Current (violates design system) -->
<style>
	.action-bar {
		border-bottom: 1px solid var(--color-border, #e5e7eb);
		background: var(--color-bg-secondary, #f9fafb);
	}
	:global(.dark) .action-bar {
		border-bottom-color: var(--color-border-dark, #374151);
	}
</style>
```

**Ryo Lu Would Say:** This is slop that hasn't been refined. Align it with the system.

**Proposed Fix:**

```svelte
<!-- After (uses design system) -->
<div class="border-b border-border bg-muted">
```

**Benefits:**

- Single styling system (Tailwind + Inkprint tokens)
- Dark mode automatic
- 400 lines of CSS removed
- Consistency with rest of codebase

---

## Detailed Recommendations

### High Priority (Concept Unification)

#### 1. Consolidate Context Types

**Current:** 11 context types with aliases and normalization scattered across files

**Action:**

1. Create `ChatScope` enum: `global`, `project`, `calendar`
2. Create `ChatMode` enum: `normal`, `create`, `audit`, `forecast`, `brief`
3. Replace `ChatContextType` usages with `{ scope, mode?, focus? }`
4. Centralize tool selection: `getToolsForContext(scope, mode)`

**Files to modify:**

- `apps/web/src/lib/services/agentic-chat/shared/types/context.types.ts`
- `apps/web/src/lib/services/agentic-chat/tools/tools.config.ts`
- `apps/web/src/lib/components/agent/agent-chat.types.ts`

**Effort:** 8-12 hours

---

#### 2. Unify Event Types with State Machines

**Current:** 20+ SSE event types with redundant patterns

**Action:**

1. Define entity types: `session`, `agent`, `plan`, `step`, `tool`, `stream`
2. Define state transitions for each entity
3. Replace individual events with `{ entity, state, data }`
4. Update UI to handle state machine events

**Files to modify:**

- `apps/web/src/routes/api/agent/stream/+server.ts`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/services/agentic-chat/shared/types/events.types.ts`

**Effort:** 6-10 hours

---

#### 3. Consolidate Message Types

**Current:** 9 message types with some legacy overlap

**Action:**

1. Keep core types: `user`, `assistant`, `thinking`, `clarification`
2. Deprecate legacy types: `plan`, `activity`, `step`, `executor`
3. Move plan/step/executor data into `thinking` block activities
4. Single message shape with optional activity array

**Files to modify:**

- `apps/web/src/lib/components/agent/AgentMessageList.svelte`
- `apps/web/src/lib/components/agent/agent-chat.types.ts`

**Effort:** 4-6 hours

---

### Medium Priority (Component Cleanup)

#### 4. Decompose AgentChatModal

**Current:** 3,694-line monolith

**Action:**

1. Extract `AgentStreamManager` (SSE handling)
2. Extract `AgentMessagePane` (message list + thinking)
3. Extract `AgentInputPane` (composer + voice)
4. Extract `AgentSidebar` (operations + drafts)
5. Keep `AgentChatContainer` as orchestrator

**Files to create:**

- `apps/web/src/lib/components/agent/AgentStreamManager.svelte`
- `apps/web/src/lib/components/agent/AgentMessagePane.svelte`
- `apps/web/src/lib/components/agent/AgentInputPane.svelte`
- `apps/web/src/lib/components/agent/AgentSidebar.svelte`

**Effort:** 12-16 hours

---

#### 5. Refactor CSS-in-JS Components

**Current:** 400+ lines of inline CSS in OperationsQueue/Log

**Action:**

1. Replace all inline styles with Tailwind utilities
2. Use Inkprint semantic tokens
3. Remove `<style>` blocks entirely
4. Test dark mode

**Files to modify:**

- `apps/web/src/lib/components/agent/OperationsQueue.svelte`
- `apps/web/src/lib/components/agent/OperationsLog.svelte`

**Effort:** 4-6 hours

---

### Lower Priority (Service Layer)

#### 6. Merge Overlapping Analysis Services

**Current:** 4 separate analysis services with overlapping concerns

**Action:**

1. Merge `ToolSelectionService`, `StrategyAnalyzer`, `ProjectCreationAnalyzer`
2. Create unified `IntentAnalysisService`
3. Single entry point: `analyzeIntent(message, context) → { strategy, tools, clarifications }`

**Files to consolidate:**

- `apps/web/src/lib/services/agentic-chat/analysis/`

**Effort:** 8-12 hours

---

#### 7. Extract Token Budget as First-Class Citizen

**Current:** Budgets scattered in comments and hardcoded values

**Action:**

1. Create `TokenBudget` interface with named allocations
2. Create `TokenBudgetFactory` for agent-type-specific budgets
3. Replace hardcoded values with factory calls
4. Surface budget decisions to callers

**Files to modify:**

- `apps/web/src/lib/services/agent-context-service.ts`
- `apps/web/src/lib/services/chat-context-service.ts`

**Effort:** 6-8 hours

---

## What's Working Well (Keep These)

### Design System Compliance: 9/10

- Inkprint textures used semantically (frame, grain, thread, bloom)
- Semantic color tokens throughout
- Dark mode comprehensive
- Responsive design works mobile → desktop

### Tool Organization: 8/10

- Clear categories: Read, Write, Calendar, Utility, External
- Tool definitions are declarative
- Executor pattern is clean

### Persistence Layer: 8/10

- Well-isolated database operations
- Clear entity relationships
- Good separation from business logic

### Streaming Architecture: 8/10

- SSE pattern is sound
- Async generators allow real-time feedback
- Error handling is comprehensive

---

## Implementation Roadmap

### Week 1: Concept Unification

- [ ] Consolidate context types (8 hrs)
- [ ] Unify event types (6 hrs)
- [ ] Consolidate message types (4 hrs)

### Week 2: Component Cleanup

- [ ] Decompose AgentChatModal (12 hrs)
- [ ] Refactor CSS-in-JS (4 hrs)

### Week 3: Service Layer

- [ ] Merge analysis services (8 hrs)
- [ ] Extract token budget (6 hrs)

---

## Metrics to Track

### Before/After Comparison

| Metric             | Before | Target After        |
| ------------------ | ------ | ------------------- |
| Context Types      | 11     | 3 scopes + 4 modes  |
| Event Types        | 20+    | 6 entities × states |
| Message Types      | 9      | 5                   |
| AgentChatModal LOC | 3,694  | ~800                |
| CSS-in-JS Lines    | 400+   | 0                   |
| Service Files      | 76     | 60-65               |

### Developer Experience

| Metric                         | Before | Target After |
| ------------------------------ | ------ | ------------ |
| Concepts to understand         | 15+    | 6-8          |
| Files to touch for new context | 6+     | 2            |
| Time to add new event type     | 30 min | 5 min        |
| Test isolation                 | Hard   | Easy         |

---

## Closing Thought

> "Instead of building five things, maybe we should build one thing that has N or a million different ways to see it."
> — Ryo Lu

The BuildOS Agentic Chat has powerful capabilities. The work isn't to remove features—it's to unify the concepts underneath them. Users should feel like they're using **one smart chat** that adapts, not **11 different chat modes** they have to choose between.

The system should be simple to understand but powerful to use.

---

_Audit completed: February 2026_
_Principles applied: Ryo Lu (Cursor Head of Design)_
