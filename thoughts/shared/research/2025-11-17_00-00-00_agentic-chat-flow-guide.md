---
date: 2025-11-17T00:00:00-05:00
researcher: Claude
repository: buildos-platform
topic: 'Agentic Chat Flow - Complete System Guide'
tags: [research, buildos, agentic-chat, architecture, flow-diagrams]
status: complete
---

# Research: BuildOS Agentic Chat Flow - Complete System Guide

## Executive Summary

The BuildOS agentic chat system is a sophisticated **multi-agent orchestration platform** that combines a planner agent with dynamically spawned executor agents to handle complex user queries. The system uses:

- **Planner-Executor Pattern**: Main planner coordinates, executors handle complex tasks
- **SSE Streaming**: Real-time Server-Sent Events for responsive UI updates
- **31 Tools** across 4 categories for comprehensive BuildOS operations
- **Context-Aware Planning**: Ontology integration for entity-aware conversations
- **Project Focus**: Narrow agent context to specific entities (tasks, goals, plans)

**Key Innovation**: The system generates executable plans with dependency management, spawns specialized executors for complex steps, and synthesizes natural language responses from multi-tool executions.

---

## Research Question

**"How does the agentic chat flow work in BuildOS?"**

This research provides a high-level overview with visual diagrams to understand the complete flow from user input to streamed response.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Complete Flow Diagram](#2-complete-flow-diagram)
3. [Frontend Flow](#3-frontend-flow)
4. [Backend Orchestration](#4-backend-orchestration)
5. [Tool Execution](#5-tool-execution)
6. [Plan Generation & Execution](#6-plan-generation--execution)
7. [SSE Event Flow](#7-sse-event-flow)
8. [Project Focus System](#8-project-focus-system)
9. [Key Components](#9-key-components)
10. [Data Models](#10-data-models)
11. [Sequence Diagrams](#11-sequence-diagrams)
12. [Next Steps](#12-next-steps)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                              │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │         AgentChatModal.svelte (Frontend)                   │     │
│  │  • User input field                                        │     │
│  │  • Message history display                                 │     │
│  │  • Thinking blocks (activity log)                          │     │
│  │  • Project focus selector                                  │     │
│  │  • Voice input support                                     │     │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP POST
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API ENDPOINT (SvelteKit)                         │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │   /api/agent/stream/+server.ts                             │     │
│  │  • Authentication & rate limiting                          │     │
│  │  • Session management (create/fetch)                       │     │
│  │  • Ontology context loading                                │     │
│  │  • SSE stream setup                                        │     │
│  │  • Message persistence                                     │     │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Creates
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                               │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │   AgentChatOrchestrator                                    │     │
│  │  • Main conversation loop                                  │     │
│  │  • Planner agent coordination                              │     │
│  │  • Tool call handling                                      │     │
│  │  • Context management                                      │     │
│  └────────────────────────────────────────────────────────────┘     │
│           │                    │                    │                │
│           │                    │                    │                │
│  ┌────────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐       │
│  │ PlanOrchestrator│  │ToolExecution   │  │ Response       │       │
│  │ • Plan creation │  │ Service        │  │ Synthesizer    │       │
│  │ • Step execution│  │ • Validate     │  │ • LLM responses│       │
│  │ • Dependencies  │  │ • Execute      │  │ • Fallbacks    │       │
│  └─────────────────┘  └────────────────┘  └────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
                    │                              │
         ┌──────────┴──────────┐                  │
         │                     │                  │
         ▼                     ▼                  ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   EXECUTOR      │   │   TOOL SYSTEM   │   │   SUPABASE DB   │
│   AGENTS        │   │   (31 Tools)    │   │   • Sessions    │
│ • Per-step      │   │ • Search/List   │   │   • Messages    │
│ • Specialized   │   │ • Read/Detail   │   │   • Agents      │
│ • Task-focused  │   │ • Write/CRUD    │   │   • Plans       │
│                 │   │ • Utilities     │   │   • Ontology    │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

---

## 2. Complete Flow Diagram

```
┌──────────────┐
│   USER       │
│ Types message│
│ in chat UI   │
└──────┬───────┘
       │
       │ 1. User Input
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND: AgentChatModal.svelte                                 │
├──────────────────────────────────────────────────────────────────┤
│  • Validate message not empty                                    │
│  • Create new "think block" in UI (activity log)                 │
│  • Prepare request payload with:                                 │
│    - message                                                      │
│    - session_id (if continuing)                                  │
│    - context_type ('global', 'project', etc.)                    │
│    - projectFocus (if entity scoped)                             │
│    - conversation_history                                        │
│  • Disable input field                                           │
│  • Start SSE stream via POST /api/agent/stream                   │
└──────┬───────────────────────────────────────────────────────────┘
       │
       │ 2. HTTP POST
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  API: /api/agent/stream/+server.ts (POST Handler)                │
├──────────────────────────────────────────────────────────────────┤
│  • Check authentication (safeGetSession)                         │
│  • Rate limit check (20 req/min, 30k tokens/min)                 │
│  • Parse request body                                            │
│  • Get or create chat session in DB                              │
│  • Load recent conversation history (last 50 messages)           │
│  • Load ontology context (if project/task context)               │
│  • Generate lastTurnContext from previous messages               │
│  • Save user message to chat_messages table                      │
│  • Create SSE stream via SSEResponse.createChatStream()          │
│  • Start async orchestrator (streaming via callback)             │
└──────┬───────────────────────────────────────────────────────────┘
       │
       │ 3. Create Orchestrator
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR: createAgentChatOrchestrator()                     │
├──────────────────────────────────────────────────────────────────┤
│  Factory creates:                                                │
│  • SmartLLMService (context-aware model selection)               │
│  • ChatCompressionService (history trimming)                     │
│  • AgentContextService (builds prompts & context)                │
│  • AgentPersistenceService (DB operations)                       │
│  • ToolExecutionService (tool validation & execution)            │
│  • ExecutorCoordinator (spawns & manages executors)              │
│  • PlanOrchestrator (plan creation & execution)                  │
│  • ResponseSynthesizer (LLM response generation)                 │
│  • AgentChatOrchestrator (main coordinator)                      │
└──────┬───────────────────────────────────────────────────────────┘
       │
       │ 4. Stream Conversation
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR: streamConversation()                              │
├──────────────────────────────────────────────────────────────────┤
│  1. Build planner context:                                       │
│     • System prompt (role description)                           │
│     • Conversation history (compressed if needed)                │
│     • Location context (formatted entity details)                │
│     • Ontology context (entity templates)                        │
│     • Last turn context (previous entities accessed)             │
│     • Available tools (filtered by context type)                 │
│                                                                  │
│  2. Create planner agent record in DB                            │
│                                                                  │
│  3. Yield events to stream:                                      │
│     → session (ChatSession)                                      │
│     → ontology_loaded (if available)                             │
│     → last_turn_context (if available)                           │
│                                                                  │
│  4. Enter runPlannerLoop() ────────────────────────────────────┐ │
└─────────────────────────────────────────────────────────────────┼─┘
                                                                  │
       ┌──────────────────────────────────────────────────────────┘
       │
       │ 5. Planner Loop
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  LOOP: runPlannerLoop()                                          │
├──────────────────────────────────────────────────────────────────┤
│  Yield: agent_state → 'thinking'                                 │
│                                                                  │
│  Stream LLM response:                                            │
│    • Model: deepseek/deepseek-chat                               │
│    • Temperature: 0.4                                            │
│    • Max tokens: 1800                                            │
│    • Tool choice: auto                                           │
│    • Tools: Available tools for context                          │
│                                                                  │
│  As LLM streams:                                                 │
│    ├─ Text chunks → Yield: text events                           │
│    └─ Tool calls → Accumulate in array                           │
│                                                                  │
│  If tool_calls received:                                         │
│    For each tool call:                                           │
│      ├─ Yield: tool_call event                                   │
│      ├─ Execute tool (see Tool Execution flow below)             │
│      ├─ Yield: tool_result event                                 │
│      └─ Add tool message to conversation                         │
│    Continue loop (LLM sees tool results, may call more tools)    │
│                                                                  │
│  If no tool_calls and has text:                                  │
│    ├─ Yield: agent_state → 'waiting_on_user'                     │
│    ├─ Yield: done (with token usage)                             │
│    └─ Break loop                                                 │
└──────────────────────────────────────────────────────────────────┘
       │
       │ 6. Tool Execution (if tool called)
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  TOOL EXECUTION: ToolExecutionService.executeTool()              │
├──────────────────────────────────────────────────────────────────┤
│  1. Parse tool call:                                             │
│     • Extract tool name                                          │
│     • Parse arguments from JSON                                  │
│                                                                  │
│  2. Check if virtual tool:                                       │
│     • "agent_create_plan" → handlePlanToolCall() ──────────────┐ │
│     • Returns virtual tool result                              │ │
│                                                                │ │
│  3. Otherwise, execute real tool:                              │ │
│     • Validate tool exists                                     │ │
│     • Call toolExecutor(toolName, args, context)               │ │
│     • Extract entity IDs from result                           │ │
│     • Return ToolExecutionResult                               │ │
│                                                                │ │
│  4. Handle context shifts:                                     │ │
│     • If result.context_shift detected                         │ │
│     • Update serviceContext.contextType & entityId             │ │
│     • Create LastTurnContext snapshot                          │ │
│     • Update chat session in DB                                │ │
└────────────────────────────────────────────────────────────────┼─┘
                                                                  │
       ┌──────────────────────────────────────────────────────────┘
       │
       │ 7. Plan Tool Called
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  PLANNING: handlePlanToolCall()                                  │
├──────────────────────────────────────────────────────────────────┤
│  Execution Mode (from tool args):                                │
│  • auto_execute → Generate & execute immediately                 │
│  • draft_only → Generate plan for user review                    │
│  • agent_review → Internal reviewer critiques plan               │
│                                                                  │
│  1. Create plan via PlanOrchestrator.createPlanFromIntent()      │
│     • LLM generates JSON with steps                              │
│     • Validate for circular dependencies                         │
│     • Save plan to agent_plans table                             │
│     • Yield: plan_created event                                  │
│                                                                  │
│  2a. If auto_execute:                                            │
│      → executePlan() ────────────────────────────────────────┐   │
│                                                              │   │
│  2b. If draft_only:                                          │   │
│      • Yield: plan_ready_for_review                          │   │
│      • Return plan in tool result                            │   │
│                                                              │   │
│  2c. If agent_review:                                        │   │
│      • Spawn reviewer agent                                  │   │
│      • Yield: plan_review (verdict, notes)                   │   │
│      • If approved → executePlan()                           │   │
└──────────────────────────────────────────────────────────────┼───┘
                                                                │
       ┌────────────────────────────────────────────────────────┘
       │
       │ 8. Plan Execution
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  EXECUTION: PlanOrchestrator.executePlan()                       │
├──────────────────────────────────────────────────────────────────┤
│  Yield: agent_state → 'executing_plan'                           │
│                                                                  │
│  For each step (respecting dependencies):                        │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │ Step Execution                                          │  │
│    ├─────────────────────────────────────────────────────────┤  │
│    │ Yield: step_start                                       │  │
│    │                                                         │  │
│    │ If step.executorRequired = true:                        │  │
│    │   ├─ ExecutorCoordinator.spawnExecutor()                │  │
│    │   │  • Create executor agent in DB                      │  │
│    │   │  • Name: "Executor-{planId}-S{stepNumber}"          │  │
│    │   │  • Model: deepseek/deepseek-coder                   │  │
│    │   │  • Tools: Filtered to step-specific tools           │  │
│    │   ├─ Yield: executor_spawned                            │  │
│    │   ├─ Execute with AgentExecutorService                  │  │
│    │   ├─ Wait for executor completion                       │  │
│    │   └─ Yield: executor_result                             │  │
│    │                                                         │  │
│    │ Else (simple tool execution):                           │  │
│    │   ├─ Execute tools directly in sequence                 │  │
│    │   ├─ Yield: tool_call for each                          │  │
│    │   └─ Yield: tool_result for each                        │  │
│    │                                                         │  │
│    │ Store step result                                       │  │
│    │ Yield: step_complete                                    │  │
│    └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  After all steps complete:                                       │
│    • ResponseSynthesizer.synthesizeComplexResponse()             │
│    • Yield: text (natural language summary)                      │
│    • Yield: agent_state → 'waiting_on_user'                      │
│    • Yield: done                                                 │
└──────────────────────────────────────────────────────────────────┘
       │
       │ 9. Stream Events to Frontend
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  SSE STREAM: API +server.ts callback                             │
├──────────────────────────────────────────────────────────────────┤
│  For each StreamEvent from orchestrator:                         │
│    • Map to AgentSSEMessage format                               │
│    • Send via SSE stream (agentStream.sendMessage())             │
│    • Track tool calls & results for DB persistence               │
│    • Accumulate assistant response text                          │
│                                                                  │
│  Special handling:                                               │
│    • context_shift → Update session context in DB                │
│    • done → Save assistant message & tool results to DB          │
│    • error → Send error event and close stream                   │
│                                                                  │
│  Finally:                                                        │
│    • Update rate limiter with token usage                        │
│    • Close SSE stream                                            │
└──────┬───────────────────────────────────────────────────────────┘
       │
       │ 10. SSE Events
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND: AgentChatModal.svelte SSE Handler                     │
├──────────────────────────────────────────────────────────────────┤
│  EventSource message listener:                                   │
│                                                                  │
│  Switch on event.type:                                           │
│    • session → Store session ID                                  │
│    • ontology_loaded → Log ontology summary                      │
│    • last_turn_context → Store for display                       │
│    • agent_state → Update thinking block header                  │
│    • text → Append to assistant message                          │
│    • tool_call → Add tool to think block activities              │
│    • tool_result → Mark tool completed with result               │
│    • step_start → Add step to think block                        │
│    • step_complete → Mark step done                              │
│    • executor_spawned → Add executor activity                    │
│    • executor_result → Update executor status                    │
│    • plan_created → Display plan structure                       │
│    • plan_ready_for_review → Show plan for approval              │
│    • context_shift → Update UI context indicator                 │
│    • focus_active → Display focus badge                          │
│    • done → Mark conversation complete, enable input             │
│    • error → Display error, close stream                         │
│                                                                  │
│  Real-time UI updates:                                           │
│    • Think block expands with each activity                      │
│    • Messages appear as text streams in                          │
│    • Tool cards show status transitions (pending→complete)       │
│    • Auto-scroll (unless user scrolled up)                       │
└──────┬───────────────────────────────────────────────────────────┘
       │
       │ 11. Final State
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  USER SEES COMPLETE RESPONSE                                     │
├──────────────────────────────────────────────────────────────────┤
│  • Message history updated with assistant response               │
│  • Think block shows all activities (tools, executors, steps)    │
│  • Input field re-enabled for next message                       │
│  • Session state persisted in database                           │
│  • Context updated if shifted during conversation                │
│  • Project focus maintained (if set)                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Flow

### AgentChatModal Component Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  AgentChatModal.svelte (1941 lines)                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  STATE MANAGEMENT (Svelte 5 Runes)                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • messages = $state<Message[]>([])                       │ │
│  │ • sessionId = $state<string>('')                         │ │
│  │ • activeStreaming = $state(false)                        │ │
│  │ • thinkBlocks = $state<ThinkBlock[]>([])                 │ │
│  │ • userInput = $state('')                                 │ │
│  │ • projectFocus = $state<ProjectFocus | null>(null)       │ │
│  │ • ontologyContext = $state<OntologyContext | null>(null) │ │
│  │ • lastTurnContext = $state<LastTurnContext | null>(null) │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  EVENT HANDLERS                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ sendMessage()                                            │ │
│  │  ├─ Validate input not empty                            │ │
│  │  ├─ Create new think block                              │ │
│  │  ├─ Disable input                                       │ │
│  │  ├─ POST to /api/agent/stream                           │ │
│  │  └─ Start SSE stream                                    │ │
│  │                                                          │ │
│  │ handleSSEMessage(event)                                  │ │
│  │  ├─ Parse event.data as JSON                            │ │
│  │  ├─ Switch on event.type (25+ types)                    │ │
│  │  └─ Update state reactively                             │ │
│  │                                                          │ │
│  │ handleToolCall(toolCall)                                 │ │
│  │  └─ Add to current think block activities               │ │
│  │                                                          │ │
│  │ handleToolResult(result)                                 │ │
│  │  └─ Update matching tool activity status                │ │
│  │                                                          │ │
│  │ stopStreaming()                                          │ │
│  │  ├─ Abort EventSource connection                        │ │
│  │  ├─ Mark streaming inactive                             │ │
│  │  └─ Re-enable input                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  UI SECTIONS                                                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Header                                                   │ │
│  │  ├─ Title: "BuildOS Assistant"                          │ │
│  │  ├─ ProjectFocusIndicator (if focused)                  │ │
│  │  ├─ ProjectFocusSelector button                         │ │
│  │  └─ Close button                                        │ │
│  │                                                          │ │
│  │ Message List (scrollable)                               │ │
│  │  For each message:                                       │ │
│  │    ├─ User message bubble (right-aligned, gradient)     │ │
│  │    ├─ Assistant message bubble (left-aligned)           │ │
│  │    └─ ThinkingBlock (if message has activities)         │ │
│  │                                                          │ │
│  │ Input Area                                               │ │
│  │  ├─ Textarea with auto-resize                           │ │
│  │  ├─ Voice input button (if enabled)                     │ │
│  │  ├─ Send button (gradient, disabled while streaming)    │ │
│  │  └─ Stop button (if streaming)                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  CHILD COMPONENTS                                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ <ThinkingBlock>                                          │ │
│  │   • Displays agent activity log                         │ │
│  │   • Tool calls with status badges                       │ │
│  │   • Executor spawning/completion                        │ │
│  │   • Plan steps                                          │ │
│  │   • Collapsible sections                                │ │
│  │                                                          │ │
│  │ <ProjectFocusIndicator>                                  │ │
│  │   • Shows current focus entity                          │ │
│  │   • Icon based on focus type                            │ │
│  │   • Entity name display                                 │ │
│  │                                                          │ │
│  │ <ProjectFocusSelector>                                   │ │
│  │   • Modal for selecting focus                           │ │
│  │   • 7 focus types: project-wide, task, goal, etc.       │ │
│  │   • Entity search & selection                           │ │
│  │   • Clear focus option                                  │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### SSE Event Processing

```
SSE Message Arrives
       │
       ▼
┌─────────────────────────┐
│ Parse JSON from event   │
│ Extract type & payload  │
└──────────┬──────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────┐
│  Switch on event.type                                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  session                                                   │
│    └─> sessionId = event.session.id                       │
│                                                            │
│  ontology_loaded                                           │
│    └─> ontologyContext = event.summary                    │
│                                                            │
│  last_turn_context                                         │
│    └─> lastTurnContext = event.context                    │
│                                                            │
│  agent_state                                               │
│    └─> Update think block header with state               │
│        ('thinking', 'executing_plan', 'waiting_on_user')  │
│                                                            │
│  text                                                      │
│    └─> Append event.content to current message            │
│                                                            │
│  tool_call                                                 │
│    └─> Add to think block activities:                     │
│        { type: 'tool', name, args, status: 'pending' }    │
│                                                            │
│  tool_result                                               │
│    └─> Find matching tool activity by ID                  │
│        Update status to 'completed' or 'failed'           │
│        Store result data                                  │
│                                                            │
│  step_start                                                │
│    └─> Add to think block:                                │
│        { type: 'step', number, description, status: ... } │
│                                                            │
│  step_complete                                             │
│    └─> Update step status to 'completed'                  │
│                                                            │
│  executor_spawned                                          │
│    └─> Add executor activity with pending status          │
│                                                            │
│  executor_result                                           │
│    └─> Update executor status, store result               │
│                                                            │
│  plan_created                                              │
│    └─> Store plan data, display in UI if draft mode       │
│                                                            │
│  plan_ready_for_review                                     │
│    └─> Show plan approval UI with approve/reject buttons  │
│                                                            │
│  context_shift                                             │
│    └─> Update context indicator, show notification        │
│                                                            │
│  focus_active / focus_changed                              │
│    └─> Update projectFocus state, refresh indicator       │
│                                                            │
│  done                                                      │
│    └─> Mark streaming complete, enable input, close stream│
│                                                            │
│  error                                                     │
│    └─> Display error message, stop streaming              │
│                                                            │
└────────────────────────────────────────────────────────────┘
           │
           ▼
    Update UI (reactive)
```

---

## 4. Backend Orchestration

### Orchestrator Service Dependency Graph

```
createAgentChatOrchestrator()
       │
       ├─────────────────────────────────────────────────────────┐
       │                                                         │
       ▼                                                         │
┌─────────────────┐                                             │
│ SmartLLMService │ (Context-aware model selection)             │
│  • getOptimal   │                                             │
│    TextProfile  │                                             │
│  • streamText   │                                             │
└─────────────────┘                                             │
       │                                                         │
       ▼                                                         │
┌─────────────────────┐                                         │
│ ChatCompression     │ (History management)                    │
│ Service             │                                         │
│  • compressHistory  │                                         │
└─────────────────────┘                                         │
       │                                                         │
       ▼                                                         │
┌─────────────────────┐                                         │
│ AgentContextService │ (Context building)                      │
│  • buildPlanner     │                                         │
│    Context          │                                         │
│  • loadOntology     │                                         │
└─────────────────────┘                                         │
       │                                                         │
       ▼                                                         │
┌─────────────────────┐                                         │
│ AgentPersistence    │ (Database operations)                   │
│ Service             │                                         │
│  • createAgent      │                                         │
│  • savePlan         │                                         │
│  • saveMessage      │                                         │
└─────────────────────┘                                         │
       │                                                         │
       │                                                         │
       │                    ┌────────────────────────────────────┘
       │                    │
       ▼                    ▼
┌─────────────────────┐  ┌──────────────────────┐
│ ToolExecutionService│  │ ExecutorCoordinator  │
│  • executeTool      │  │  • spawnExecutor     │
│  • validateArgs     │  │  • waitForExecutor   │
│  • extractEntities  │  │  • trackExecution    │
└──────────┬──────────┘  └──────────┬───────────┘
           │                        │
           │                        │
           ▼                        ▼
    ┌──────────────┐        ┌──────────────────┐
    │ ChatTool     │        │ AgentExecutor    │
    │ Executor     │        │ Service          │
    │ (31 tools)   │        │  • execute       │
    └──────────────┘        │    ExecutorTask  │
                            └──────────────────┘
       │
       │ All services feed into
       ▼
┌───────────────────────────────────────────────────────────┐
│  AgentChatOrchestrator                                    │
├───────────────────────────────────────────────────────────┤
│  • streamConversation()    Main entry point               │
│  • runPlannerLoop()        Iterative conversation         │
│  • handlePlanToolCall()    Virtual tool handler           │
│  • executePlan()           Delegates to PlanOrchestrator  │
└───────────────────────────────────────────────────────────┘
       │
       │ Uses
       ▼
┌───────────────────────────────────────────────────────────┐
│  PlanOrchestrator                                         │
├───────────────────────────────────────────────────────────┤
│  • createPlanFromIntent()  Generate plan via LLM          │
│  • executePlan()           Execute steps with dependencies│
│  • validatePlan()          Check dependencies, structure  │
│  • optimizePlan()          Parallelize independent steps  │
└───────────────────────────────────────────────────────────┘
       │
       │ Synthesizes responses
       ▼
┌───────────────────────────────────────────────────────────┐
│  ResponseSynthesizer                                      │
├───────────────────────────────────────────────────────────┤
│  • synthesizeSimpleResponse()   Single tool result        │
│  • synthesizeComplexResponse()  Multi-step plan result    │
│  • synthesizeStreamingResponse() Real-time synthesis      │
└───────────────────────────────────────────────────────────┘
```

---

## 5. Tool Execution

### Tool System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  TOOL DEFINITIONS (31 Tools)                                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Search/List Tools (8)                                       │
│  ├─ onto_search_tasks         Search tasks by query         │
│  ├─ onto_search_plans         Search plans                  │
│  ├─ onto_search_goals         Search goals                  │
│  ├─ onto_search_documents     Search documents              │
│  ├─ onto_list_entity_outputs  List entity outputs           │
│  ├─ onto_list_entity_children List child entities           │
│  ├─ onto_list_entity_parents  List parent entities          │
│  └─ onto_list_entity_links    List linked entities          │
│                                                              │
│  Read/Detail Tools (2)                                       │
│  ├─ onto_get_entity_detail    Get full entity details       │
│  └─ onto_get_entity_facets    Get entity facets             │
│                                                              │
│  Write/CRUD Tools (12)                                       │
│  ├─ onto_create_task          Create new task               │
│  ├─ onto_create_plan          Create new plan               │
│  ├─ onto_create_goal          Create new goal               │
│  ├─ onto_create_document      Create new document           │
│  ├─ onto_create_output        Create new output             │
│  ├─ onto_update_entity        Update entity                 │
│  ├─ onto_update_entity_props  Update props/facets           │
│  ├─ onto_update_entity_status Update status/state           │
│  ├─ onto_link_entities        Create relationship           │
│  ├─ onto_unlink_entities      Remove relationship           │
│  ├─ onto_add_entity_tag       Add tag                       │
│  └─ onto_remove_entity_tag    Remove tag                    │
│                                                              │
│  Utility/Knowledge Tools (9)                                 │
│  ├─ onto_list_entity_types    List available types          │
│  ├─ onto_get_template_schema  Get template definition       │
│  ├─ onto_validate_entity      Validate before create/update │
│  ├─ buildos_get_overview      Platform overview             │
│  ├─ buildos_get_usage_guide   Usage instructions            │
│  ├─ buildos_get_references    Technical references          │
│  ├─ project_list              List user projects            │
│  ├─ project_get_detail        Get project details           │
│  └─ agent_create_plan         Virtual: Generate plan        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Tool Execution Flow

```
Tool Call Received from LLM
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  ToolExecutionService.executeTool()                 │
├─────────────────────────────────────────────────────┤
│  1. Parse tool call                                 │
│     • Extract tool name                             │
│     • Parse arguments from JSON string              │
│     • Generate tool_call_id                         │
│                                                     │
│  2. Check virtual tools                             │
│     • If name === 'agent_create_plan':              │
│       └─> Call handlePlanToolCall()                 │
│            Return ToolExecutionResult               │
│                                                     │
│  3. Validate tool exists                            │
│     • Lookup in availableTools array                │
│     • If not found, return error result             │
│                                                     │
│  4. Execute via ChatToolExecutor                    │
│     ┌────────────────────────────────────────────┐  │
│     │ toolExecutor(toolName, args, context)      │  │
│     ├────────────────────────────────────────────┤  │
│     │ Switch on toolName:                        │  │
│     │  Case 'onto_search_tasks':                 │  │
│     │    → Call handleSearchTasks()              │  │
│     │       └─> Supabase query + RPC             │  │
│     │                                            │  │
│     │  Case 'onto_create_task':                  │  │
│     │    → Call handleCreateTask()               │  │
│     │       └─> Validate + Insert + Return ID    │  │
│     │                                            │  │
│     │  Case 'onto_update_entity':                │  │
│     │    → Call handleUpdateEntity()             │  │
│     │       └─> Update + Trigger FSM if needed   │  │
│     │                                            │  │
│     │  ... (50+ handler methods)                 │  │
│     │                                            │  │
│     │ Return: ToolExecutorResponse {             │  │
│     │   data: any,                               │  │
│     │   streamEvents?: StreamEvent[]             │  │
│     │ }                                          │  │
│     └────────────────────────────────────────────┘  │
│                                                     │
│  5. Extract entities accessed                       │
│     • Scan result for entity IDs                    │
│     • Build entitiesAccessed array                  │
│                                                     │
│  6. Clean internal properties                       │
│     • Remove _entities_accessed                     │
│     • Remove _metadata                              │
│                                                     │
│  7. Return ToolExecutionResult                      │
│     {                                               │
│       success: true/false,                          │
│       data: cleaned result,                         │
│       toolName,                                     │
│       toolCallId,                                   │
│       entitiesAccessed: [...],                      │
│       streamEvents?: [...]                          │
│     }                                               │
└─────────────────────────────────────────────────────┘
       │
       ▼
Return to PlanOrchestrator or runPlannerLoop
```

### Tool Context Filtering

Tools are filtered based on `ChatContextType`:

```
Context Type          Available Tools
────────────────────────────────────────────────────────────────
global                • buildos_get_overview
                      • buildos_get_usage_guide
                      • buildos_get_references
                      • project_list
                      • onto_search_* (all search tools)

project               • All global tools
                      • project_get_detail
                      • onto_get_entity_detail
                      • onto_create_task/plan/goal/document
                      • onto_update_entity
                      • onto_link_entities
                      • onto_list_entity_types

task                  • All project tools
                      • onto_update_entity_status
                      • onto_update_entity_props
                      • onto_create_output
                      • onto_list_entity_outputs

plan                  • Similar to task context
                      • Focus on plan-specific operations

goal                  • Similar to task context
                      • Goal-specific filtering

document              • Document-specific tools
                      • Content management focus

project_create        • Restricted set for creation flow
                      • onto_create_task/plan/goal
                      • onto_validate_entity

project_audit         • Full project tools
                      • Read-heavy for analysis

task_update           • Task modification tools
                      • onto_update_entity
                      • onto_update_entity_status
```

---

## 6. Plan Generation & Execution

### Plan Structure

```typescript
interface AgentPlan {
  id: string                    // UUID
  sessionId: string             // Chat session
  userId: string
  plannerAgentId: string        // Planner that created it
  userMessage: string           // Original user request
  strategy: ChatStrategy        // e.g., 'multi-step-analysis'
  steps: PlanStep[]             // Ordered execution steps
  status: 'pending' | 'pending_review' | 'executing' |
          'completed' | 'failed'
  createdAt: Date
  completedAt?: Date
  metadata: {
    estimatedDuration?: number
    actualDuration?: number
    totalTokensUsed?: number
    executionMode?: 'auto_execute' | 'draft_only' | 'agent_review'
    contextType?: ChatContextType
    requestedOutputs?: string[]
    priorityEntities?: string[]
  }
}

interface PlanStep {
  stepNumber: number            // 1-indexed
  type: 'research' | 'action' | 'analysis' | 'synthesis'
  description: string           // What this step does
  executorRequired: boolean     // Spawn executor agent?
  tools: string[]               // Available tools for step
  dependsOn?: number[]          // Step dependencies (refs)
  status: 'pending' | 'executing' | 'completed' | 'failed'
  result?: any                  // Execution result
  error?: string
  metadata?: {
    parallelGroup?: number      // For optimization
    estimatedTokens?: number
  }
}
```

### Plan Generation Flow

```
User message requires planning
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  LLM Tool Call: agent_create_plan                           │
│  Arguments:                                                 │
│  {                                                          │
│    execution_mode: 'auto_execute' | 'draft_only' | ...     │
│    strategy: 'multi-step-analysis',                         │
│    user_intent: "User's goal summary"                       │
│  }                                                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  AgentChatOrchestrator.handlePlanToolCall()                 │
├─────────────────────────────────────────────────────────────┤
│  Extract execution_mode from args                           │
│                                                             │
│  Call: PlanOrchestrator.createPlanFromIntent()              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  PlanOrchestrator.createPlanFromIntent()                    │
├─────────────────────────────────────────────────────────────┤
│  1. Build plan generation prompt:                           │
│     • User intent                                           │
│     • Available tools (filtered by context)                 │
│     • Ontology context (entity templates)                   │
│     • Last turn context (entities from prev turn)           │
│     • Strategy guidance                                     │
│     • Format: JSON with steps array                         │
│                                                             │
│  2. Stream LLM (deepseek/deepseek-chat):                    │
│     • Temperature: 0.35 (deterministic)                     │
│     • Max tokens: 1200                                      │
│     • Parse JSON response                                   │
│                                                             │
│  3. Validate plan:                                          │
│     ├─ Check not empty                                      │
│     ├─ Check no duplicate step numbers                      │
│     ├─ Validate dependencies exist                          │
│     ├─ Check for circular dependencies                      │
│     └─ Ensure no forward dependencies                       │
│                                                             │
│  4. If validation fails:                                    │
│     • Retry with cleaner format (up to 2 attempts)          │
│     • If still fails, throw PlanGenerationError             │
│                                                             │
│  5. Persist plan to DB (agent_plans table)                  │
│                                                             │
│  6. Return AgentPlan object                                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Back to handlePlanToolCall()                               │
├─────────────────────────────────────────────────────────────┤
│  Yield: plan_created event                                  │
│                                                             │
│  Switch on execution_mode:                                  │
│    Case 'auto_execute':                                     │
│      → executePlan() immediately                            │
│                                                             │
│    Case 'draft_only':                                       │
│      → Yield: plan_ready_for_review                         │
│      → Return plan in tool result                           │
│      → Wait for user approval                               │
│                                                             │
│    Case 'agent_review':                                     │
│      → Spawn reviewer agent                                 │
│      → Reviewer critiques plan                              │
│      → Yield: plan_review (verdict, notes)                  │
│      → If approved: executePlan()                           │
│      → If rejected: return feedback to planner              │
└─────────────────────────────────────────────────────────────┘
```

### Plan Execution Flow

```
executePlan(plan)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  PlanOrchestrator.executePlan()                             │
├─────────────────────────────────────────────────────────────┤
│  1. Update plan status → 'executing'                        │
│  2. Yield: agent_state → 'executing_plan'                   │
│                                                             │
│  3. Build execution order:                                  │
│     • Topological sort by dependencies                      │
│     • Group parallelizable steps                            │
│                                                             │
│  4. For each step in order:                                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
          ┌────────────────────────┐
          │  Execute Single Step   │
          ├────────────────────────┤
          │                        │
          │  Wait for dependencies │
          │  to complete           │
          │         │              │
          │         ▼              │
          │  Yield: step_start     │
          │         │              │
          │         ▼              │
          │  If executorRequired:  │
          │    ┌─────────────────┐ │
          │    │ Spawn Executor  │ │
          │    ├─────────────────┤ │
          │    │ Create agent    │ │
          │    │ record in DB    │ │
          │    │                 │ │
          │    │ Name:           │ │
          │    │ "Executor-      │ │
          │    │  {planId:8}-    │ │
          │    │  S{stepNum}"    │ │
          │    │                 │ │
          │    │ Model:          │ │
          │    │ deepseek-coder  │ │
          │    │                 │ │
          │    │ Tools:          │ │
          │    │ step.tools      │ │
          │    │                 │ │
          │    │ Task:           │ │
          │    │ {               │ │
          │    │   description,  │ │
          │    │   goal,         │ │
          │    │   constraints,  │ │
          │    │   contextData   │ │
          │    │ }               │ │
          │    │                 │ │
          │    │ Yield:          │ │
          │    │ executor_       │ │
          │    │ spawned         │ │
          │    │                 │ │
          │    │ Execute task:   │ │
          │    │ Agent runs      │ │
          │    │ with LLM +      │ │
          │    │ tools           │ │
          │    │                 │ │
          │    │ Wait for        │ │
          │    │ completion      │ │
          │    │                 │ │
          │    │ Yield:          │ │
          │    │ executor_       │ │
          │    │ result          │ │
          │    └─────────────────┘ │
          │         │              │
          │  Else:                 │
          │    ┌─────────────────┐ │
          │    │ Direct Tool     │ │
          │    │ Execution       │ │
          │    ├─────────────────┤ │
          │    │ For each tool   │ │
          │    │ in step.tools:  │ │
          │    │                 │ │
          │    │ Yield:          │ │
          │    │ tool_call       │ │
          │    │                 │ │
          │    │ Execute tool    │ │
          │    │                 │ │
          │    │ Yield:          │ │
          │    │ tool_result     │ │
          │    │                 │ │
          │    │ Aggregate       │ │
          │    │ results         │ │
          │    └─────────────────┘ │
          │         │              │
          │         ▼              │
          │  Store step.result     │
          │         │              │
          │         ▼              │
          │  Yield: step_complete  │
          │         │              │
          └─────────┼──────────────┘
                    │
                    ▼
          All steps completed
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Synthesize Final Response                                  │
├─────────────────────────────────────────────────────────────┤
│  ResponseSynthesizer.synthesizeComplexResponse()            │
│    • Collect all step results                               │
│    • Pass to LLM for natural language summary               │
│    • Include entity changes, outcomes                       │
│    • Yield: text (assistant response)                       │
│                                                             │
│  Update plan status → 'completed'                           │
│  Update plan.completedAt                                    │
│  Save to DB                                                 │
│                                                             │
│  Yield: agent_state → 'waiting_on_user'                     │
│  Yield: done (with token usage)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. SSE Event Flow

### Event Types Reference

| Event Type | Payload | When Emitted | Frontend Action |
|------------|---------|--------------|-----------------|
| `session` | `{ session: ChatSession }` | Conversation start | Store sessionId |
| `ontology_loaded` | `{ summary: string }` | After ontology load | Log summary |
| `last_turn_context` | `{ context: LastTurnContext }` | After extracting previous turn | Store for display |
| `agent_state` | `{ state: string, contextType, details }` | State changes | Update think block header |
| `text` | `{ content: string }` | LLM streams text | Append to message |
| `tool_call` | `{ tool_call: ChatToolCall }` | LLM calls tool | Add to think block |
| `tool_result` | `{ result: ToolExecutionResult }` | Tool completes | Update tool status |
| `step_start` | `{ step: PlanStep }` | Step begins | Add step to think block |
| `step_complete` | `{ step: PlanStep }` | Step finishes | Mark step done |
| `executor_spawned` | `{ executorId, task }` | Executor created | Add executor activity |
| `executor_result` | `{ executorId, result }` | Executor finishes | Update executor status |
| `plan_created` | `{ plan: AgentPlan }` | Plan generated | Store plan |
| `plan_ready_for_review` | `{ plan, summary, recommendations }` | Draft mode | Show approval UI |
| `plan_review` | `{ plan, verdict, notes, reviewer }` | Reviewer critiques | Display review |
| `context_shift` | `{ new_context, entity_id, entity_name, entity_type, message }` | Tool shifts context | Update context indicator |
| `focus_active` | `{ focus: ProjectFocus }` | Focus set | Display focus badge |
| `focus_changed` | `{ focus: ProjectFocus }` | Focus updated | Update focus badge |
| `done` | `{ usage: { total_tokens } }` | Conversation turn complete | Enable input, close stream |
| `error` | `{ error: string }` | Error occurs | Display error, stop stream |

### SSE Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend: sendMessage()                                     │
├──────────────────────────────────────────────────────────────┤
│  1. Create AbortController                                   │
│  2. POST request to /api/agent/stream                        │
│  3. Create EventSource from response                         │
│  4. Attach event listeners                                   │
│     • message → handleSSEMessage()                           │
│     • error → handleError()                                  │
│  5. Set 4-minute inactivity timeout                          │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ Events stream in
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Message Event Handler                                       │
├──────────────────────────────────────────────────────────────┤
│  For each event:                                             │
│    • Parse JSON from event.data                              │
│    • Reset inactivity timer                                  │
│    • Process event based on type                             │
│    • Update UI reactively (Svelte 5 runes)                   │
│    • Auto-scroll if user hasn't scrolled up                  │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ Stream completes or errors
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Stream Cleanup                                              │
├──────────────────────────────────────────────────────────────┤
│  • Clear inactivity timer                                    │
│  • Close EventSource                                         │
│  • Mark activeStreaming = false                              │
│  • Re-enable input field                                     │
│  • Add final message to history                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Project Focus System

### What is Project Focus?

Project Focus narrows the agent's context to a specific entity within a project, reducing information overload and improving response relevance.

### Focus Types

```typescript
type FocusType =
  | 'project-wide'   // Entire project
  | 'task'           // Specific task
  | 'goal'           // Specific goal
  | 'plan'           // Specific plan
  | 'document'       // Specific document
  | 'output'         // Specific output
  | 'custom'         // User-defined focus

interface ProjectFocus {
  focusType: FocusType
  focusEntityId: string | null      // ID of focused entity
  focusEntityName: string | null    // Display name
  projectId: string                 // Parent project
  projectName: string               // Project display name
}
```

### Focus Flow

```
User Opens ProjectFocusSelector Modal
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  ProjectFocusSelector.svelte                                │
├─────────────────────────────────────────────────────────────┤
│  1. Display focus type options:                             │
│     • Project-wide (no entity, full project)                │
│     • Task (search tasks)                                   │
│     • Goal (search goals)                                   │
│     • Plan (search plans)                                   │
│     • Document (search documents)                           │
│     • Output (search outputs)                               │
│                                                             │
│  2. User selects focus type                                 │
│                                                             │
│  3. If not 'project-wide':                                  │
│     • Load entities of selected type                        │
│     • Display searchable list                               │
│     • User selects specific entity                          │
│                                                             │
│  4. Build ProjectFocus object:                              │
│     {                                                       │
│       focusType: selected type,                             │
│       focusEntityId: entity?.id || null,                    │
│       focusEntityName: entity?.name || null,                │
│       projectId: current project ID,                        │
│       projectName: current project name                     │
│     }                                                       │
│                                                             │
│  5. Update parent component state                           │
│  6. Close modal                                             │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  AgentChatModal receives focus update                       │
├─────────────────────────────────────────────────────────────┤
│  • projectFocus = new focus object                          │
│  • Display ProjectFocusIndicator                            │
│  • Include in next message request                          │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  API receives projectFocus in request                       │
├─────────────────────────────────────────────────────────────┤
│  • Normalize focus (validate fields)                        │
│  • Load ontology context for focused entity                 │
│    - If project-wide: load project ontology                 │
│    - If specific entity: load combined context              │
│      (project + element-specific)                           │
│  • Store focus in session metadata                          │
│  • Pass to orchestrator                                     │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator uses focused context                          │
├─────────────────────────────────────────────────────────────┤
│  • Build location context with focused entity details       │
│  • Filter tools to relevant subset                          │
│  • Include focus in system prompt                           │
│  • Emit focus_active event to frontend                      │
│                                                             │
│  Example system prompt addition:                            │
│  "You are focused on Task: 'Implement login system'         │
│   within Project: 'Web App Redesign'.                       │
│   Prioritize this context in your responses."               │
└─────────────────────────────────────────────────────────────┘
```

### Focus Benefits

- **Reduced Noise**: Agent ignores unrelated project entities
- **Better Accuracy**: Responses targeted to specific context
- **Faster Processing**: Less context to process
- **User Control**: Clear scope for conversation

---

## 9. Key Components

### File Reference

| Component | Path | Lines | Purpose |
|-----------|------|-------|---------|
| **Frontend** |
| AgentChatModal | `apps/web/src/lib/components/agent/AgentChatModal.svelte` | 1941 | Main chat interface |
| ThinkingBlock | `apps/web/src/lib/components/agent/ThinkingBlock.svelte` | 299 | Activity log display |
| ProjectFocusIndicator | `apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte` | 94 | Focus display badge |
| ProjectFocusSelector | `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte` | 299 | Focus selection modal |
| **API** |
| Stream Endpoint | `apps/web/src/routes/api/agent/stream/+server.ts` | 1214 | SSE streaming API |
| **Orchestration** |
| AgentChatOrchestrator | `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts` | 870 | Main coordinator |
| PlanOrchestrator | `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts` | 1328 | Plan generation/execution |
| Factory | `apps/web/src/lib/services/agentic-chat/index.ts` | 131 | Orchestrator factory |
| **Execution** |
| ToolExecutionService | `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts` | 641 | Tool validation & execution |
| ExecutorCoordinator | `apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts` | 355 | Executor spawning |
| AgentExecutorService | `apps/web/src/lib/services/agentic-chat/execution/agent-executor-service.ts` | ~500 | Executor task execution |
| **Tools** |
| Tool Definitions | `apps/web/src/lib/chat/tool-definitions.ts` | 2851 | 31 tool definitions |
| Tool Configuration | `apps/web/src/lib/chat/tools.config.ts` | 252 | Context filtering |
| ChatToolExecutor | `apps/web/src/lib/chat/tool-executor.ts` | 2196 | 50+ tool handlers |
| **Services** |
| SmartLLMService | `apps/web/src/lib/services/agentic-chat/shared/smart-llm-service.ts` | ~400 | Model selection |
| AgentContextService | `apps/web/src/lib/services/agentic-chat/context/agent-context-service.ts` | ~600 | Context building |
| ResponseSynthesizer | `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts` | 600 | Response generation |
| AgentPersistenceService | `apps/web/src/lib/services/agentic-chat/session/agent-persistence-service.ts` | ~400 | Database operations |

### BuildOS-Specific Tools

The system includes specialized knowledge tools for the BuildOS platform:

| Tool | File | Purpose |
|------|------|---------|
| `buildos_get_overview` | `apps/web/src/lib/services/agentic-chat/tools/buildos/overview.ts` | Platform introduction & capabilities |
| `buildos_get_usage_guide` | `apps/web/src/lib/services/agentic-chat/tools/buildos/usage-guide.ts` | How to use BuildOS features |
| `buildos_get_references` | `apps/web/src/lib/services/agentic-chat/tools/buildos/references.ts` | Technical API & ontology references |

These tools allow the agent to provide accurate, up-to-date information about BuildOS itself.

---

## 10. Data Models

### Database Tables

```sql
-- Agents table (planner + executors)
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,              -- 'planner' | 'executor'
  name TEXT NOT NULL,
  model_preference TEXT,           -- e.g., 'deepseek/deepseek-chat'
  system_prompt TEXT,
  status TEXT NOT NULL,            -- 'active' | 'completed' | 'failed'
  created_for_session_id UUID,
  created_for_plan_id UUID,
  created_for_step_number INT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Agent Plans
CREATE TABLE agent_plans (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  planner_agent_id UUID,
  user_message TEXT NOT NULL,
  strategy TEXT NOT NULL,
  steps JSONB NOT NULL,            -- Array of PlanStep objects
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB
);

-- Chat Sessions
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  context_type TEXT NOT NULL,
  entity_id UUID,
  status TEXT NOT NULL,
  message_count INT DEFAULT 0,
  total_tokens_used INT DEFAULT 0,
  tool_call_count INT DEFAULT 0,
  title TEXT,
  agent_metadata JSONB,           -- Stores projectFocus
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Chat Messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,              -- 'user' | 'assistant' | 'tool'
  content TEXT NOT NULL,
  tool_calls JSONB,                -- ChatToolCall[]
  tool_call_id UUID,               -- For tool role messages
  created_at TIMESTAMPTZ
);
```

### TypeScript Interfaces

```typescript
// From AgentChatModal
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  tool_calls?: ChatToolCall[]
}

interface ThinkBlock {
  id: string
  timestamp: Date
  state: 'thinking' | 'executing_plan' | 'waiting_on_user'
  activities: Activity[]
  plan?: AgentPlan
}

interface Activity {
  id: string
  type: 'tool' | 'executor' | 'step' | 'plan_review'
  name: string
  status: 'pending' | 'completed' | 'failed'
  args?: Record<string, any>
  result?: any
  timestamp: Date
}

// From ChatToolCall
interface ChatToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string              // JSON string
  }
}

// From ToolExecutionResult
interface ToolExecutionResult {
  success: boolean
  data?: any
  error?: string
  toolName: string
  toolCallId: string
  entitiesAccessed?: string[]
  streamEvents?: StreamEvent[]
}

// From ProjectFocus
interface ProjectFocus {
  focusType: 'project-wide' | 'task' | 'goal' | 'plan' |
             'document' | 'output' | 'custom'
  focusEntityId: string | null
  focusEntityName: string | null
  projectId: string
  projectName: string
}

// From OntologyContext
interface OntologyContext {
  type: 'global' | 'project' | 'element'
  scope: OntologyContextScope
  templates: TemplateDefinition[]
  instances?: EntityInstance[]
  metadata: {
    entity_count: number
    template_count: number
    loaded_at: string
  }
}

// From LastTurnContext
interface LastTurnContext {
  summary: string                  // Brief description
  entities: {
    project_id?: string
    task_ids?: string[]
    goal_ids?: string[]
    plan_id?: string
    document_id?: string
    output_id?: string
  }
  context_type: ChatContextType
  data_accessed: string[]          // Tool names used
  strategy_used?: string
  timestamp: string
}
```

---

## 11. Sequence Diagrams

### Simple Tool Execution (No Plan)

```
User → Frontend → API → Orchestrator → LLM → Tool → Response

┌────┐   ┌────────┐   ┌─────┐   ┌────────────┐   ┌───┐   ┌────┐
│User│   │Frontend│   │ API │   │Orchestrator│   │LLM│   │Tool│
└─┬──┘   └───┬────┘   └──┬──┘   └─────┬──────┘   └─┬─┘   └─┬──┘
  │          │            │            │             │       │
  │ "List my tasks"       │            │             │       │
  ├─────────>│            │            │             │       │
  │          │ POST /api/agent/stream  │             │       │
  │          ├───────────>│            │             │       │
  │          │            │ Create session            │       │
  │          │            ├──────────> │             │       │
  │          │            │            │ Stream query│       │
  │          │            │            ├───────────> │       │
  │          │            │            │             │       │
  │          │            │            │ Tool call:  │       │
  │          │            │            │ onto_search_tasks   │
  │          │            │            │<────────────┤       │
  │          │            │            │ Execute tool│       │
  │          │            │            ├─────────────┼─────> │
  │          │            │            │             │  Query DB
  │          │            │            │<────────────┼───────┤
  │          │            │            │ Tool result │       │
  │          │            │            │             │       │
  │          │            │            │ Synthesize  │       │
  │          │            │            ├───────────> │       │
  │          │            │            │<────────────┤       │
  │          │            │            │ Final text  │       │
  │          │<SSE events─────────────────────────────       │
  │          │ tool_call, tool_result, text, done            │
  │<─────────┤            │            │             │       │
  │ Display  │            │            │             │       │
```

### Complex Plan Execution

```
User → Frontend → API → Orchestrator → Planner → Executor → Tools

┌────┐  ┌────────┐  ┌─────┐  ┌────────────┐  ┌───────┐  ┌────────┐
│User│  │Frontend│  │ API │  │Orchestrator│  │Planner│  │Executor│
└─┬──┘  └───┬────┘  └──┬──┘  └─────┬──────┘  └───┬───┘  └───┬────┘
  │         │           │           │              │          │
  │ "Audit project status"          │              │          │
  ├────────>│           │           │              │          │
  │         │ POST      │           │              │          │
  │         ├──────────>│           │              │          │
  │         │           │ Create session            │          │
  │         │           ├─────────> │              │          │
  │         │           │           │ Stream       │          │
  │         │           │           ├────────────> │          │
  │         │           │           │              │          │
  │         │           │           │ Tool: agent_create_plan │
  │         │           │           │<─────────────┤          │
  │         │           │           │ Generate plan│          │
  │         │           │           ├────────────> │          │
  │         │           │           │<─────────────┤          │
  │         │           │           │ Plan created │          │
  │         │<SSE event: plan_created──────────────┤          │
  │         │           │           │              │          │
  │         │           │           │ Execute plan │          │
  │         │           │           │────────────> │          │
  │         │           │           │              │          │
  │         │           │           │         Step 1:         │
  │         │<SSE event: step_start────────────────┤          │
  │         │           │           │         Search tasks    │
  │         │           │           │         (direct tool)   │
  │         │<SSE events: tool_call, tool_result───┤          │
  │         │<SSE event: step_complete──────────────          │
  │         │           │           │              │          │
  │         │           │           │         Step 2:         │
  │         │<SSE event: step_start────────────────┤          │
  │         │           │           │         Spawn executor  │
  │         │           │           │         ├──────────────>│
  │         │<SSE event: executor_spawned──────────┤          │
  │         │           │           │              │ Execute  │
  │         │           │           │              │ task with│
  │         │           │           │              │ LLM+tools│
  │         │           │           │              │<─────────┤
  │         │<SSE event: executor_result───────────┤          │
  │         │<SSE event: step_complete──────────────          │
  │         │           │           │              │          │
  │         │           │           │         Step 3:         │
  │         │<SSE event: step_start────────────────┤          │
  │         │           │           │         ... (continue)  │
  │         │           │           │              │          │
  │         │           │           │         All steps done  │
  │         │           │           │         Synthesize      │
  │         │<SSE event: text──────────────────────┤          │
  │         │<SSE event: done──────────────────────┤          │
  │<────────┤           │           │              │          │
  │ Display │           │           │              │          │
```

---

## 12. Next Steps

### For Developers

1. **Start with Frontend**
   - Read `AgentChatModal.svelte` to understand UI flow
   - Examine SSE event handling
   - Understand project focus system

2. **Trace API Flow**
   - Follow `/api/agent/stream/+server.ts` POST handler
   - See how session/context is set up
   - Observe SSE stream creation

3. **Explore Orchestrator**
   - Read `agent-chat-orchestrator.ts` for main logic
   - Understand `runPlannerLoop()` iteration
   - See how tools are called

4. **Study Plan System**
   - Review `plan-orchestrator.ts` for planning logic
   - See how steps are generated and validated
   - Understand executor spawning

5. **Examine Tools**
   - Browse `tool-definitions.ts` for available tools
   - See `tool-executor.ts` for handler implementations
   - Understand context-based filtering

### For Architecture Review

- **Scalability**: Plan execution parallelization
- **Observability**: Add metrics/logging for tool usage
- **Error Handling**: Improve retry logic for failed tools
- **Performance**: Optimize context loading for large projects
- **Security**: Validate all tool arguments, prevent injection

### For Testing

- **Unit Tests**: Tool handlers, validators, context builders
- **Integration Tests**: Full orchestrator flow with mocked LLM
- **E2E Tests**: Complete user flow from message to response
- **LLM Tests**: Real prompt testing with actual OpenAI API

### Related Documentation

- **Tool System**: See `/TOOL_SYSTEM_DOCUMENTATION.md` (comprehensive tool reference)
- **Frontend Components**: See `/apps/web/docs/features/agentic-chat/FRONTEND_EXPLORATION.md`
- **Ontology System**: See `/apps/web/docs/features/ontology/README.md`
- **Modal Components**: See `/apps/web/docs/technical/components/modals/README.md`

---

## Summary

The BuildOS agentic chat system is a **production-ready, multi-agent orchestration platform** that:

✅ **Streams responses** in real-time via SSE for responsive UX
✅ **Coordinates planner and executor agents** with dependency management
✅ **Executes 31 tools** across search, read, write, and utility categories
✅ **Integrates ontology context** for entity-aware conversations
✅ **Supports project focus** to narrow agent context
✅ **Generates executable plans** with validation and optimization
✅ **Persists all state** (sessions, messages, agents, plans) to database
✅ **Synthesizes natural language** responses from multi-tool executions

**Key Innovation**: The system balances power (31 tools, multi-agent) with usability (SSE streaming, project focus, think blocks) to create a sophisticated yet intuitive AI assistant for the BuildOS productivity platform.

---

**Research Completed**: 2025-11-17
**Researcher**: Claude
**Status**: Complete
**Documentation Files Created**: 4 comprehensive guides + this research document
