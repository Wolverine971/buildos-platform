# BuildOS Agentic Chat - Visual Flow Guide

**Quick Reference**: High-level visual overview of the agentic chat system flow

---

## 🎯 What is the Agentic Chat System?

A **multi-agent orchestration platform** that:

- Uses a **planner agent** to coordinate complex tasks
- Spawns **executor agents** for specialized work
- Executes **31 tools** for BuildOS operations
- Streams responses in **real-time via SSE**
- Supports **project focus** for scoped conversations

---

## 📊 Complete System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         USER                                │
│                 (Types message in chat)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND LAYER                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AgentChatModal.svelte                               │  │
│  │  • Message history                                   │  │
│  │  • Input field                                       │  │
│  │  • Thinking blocks (activity log)                    │  │
│  │  • Project focus selector                            │  │
│  │  • SSE event handling                                │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP POST + SSE
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   API LAYER                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /api/agent/stream/+server.ts                        │  │
│  │  • Authentication & rate limiting                    │  │
│  │  • Session management                                │  │
│  │  • Ontology context loading                          │  │
│  │  • SSE stream setup                                  │  │
│  │  • Message persistence                               │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              ORCHESTRATION LAYER                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AgentChatOrchestrator                               │  │
│  │  • Planner loop coordination                         │  │
│  │  • Tool call handling                                │  │
│  │  • Context management                                │  │
│  │  • Event streaming                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                  │                  │           │
│           ▼                  ▼                  ▼           │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────┐   │
│  │ Plan           │ │ Tool           │ │ Response     │   │
│  │ Orchestrator   │ │ Execution      │ │ Synthesizer  │   │
│  │                │ │ Service        │ │              │   │
│  │ • Generate     │ │ • Validate     │ │ • LLM        │   │
│  │   plans        │ │   tools        │ │   response   │   │
│  │ • Execute      │ │ • Execute      │ │ • Fallbacks  │   │
│  │   steps        │ │   tools        │ │              │   │
│  │ • Spawn        │ │ • Extract      │ │              │   │
│  │   executors    │ │   entities     │ │              │   │
│  └────────────────┘ └────────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
            │                    │                 │
            ▼                    ▼                 ▼
┌──────────────────┐  ┌─────────────────┐  ┌────────────┐
│  Executor Agents │  │  Tool System    │  │  Database  │
│  • Specialized   │  │  31 Tools:      │  │  • Sessions│
│  • Per-step      │  │  • Search (8)   │  │  • Messages│
│  • Task-focused  │  │  • Read (2)     │  │  • Agents  │
│                  │  │  • Write (12)   │  │  • Plans   │
│                  │  │  • Utility (9)  │  │            │
└──────────────────┘  └─────────────────┘  └────────────┘
```

---

## 🔄 Message Flow (Simple Tool Execution)

**When user asks a simple question that requires one tool:**

```
1. User Types Message
   "Show me my tasks"
         │
         ▼
2. Frontend Creates Think Block
   POST /api/agent/stream
   Start SSE listener
         │
         ▼
3. API Authenticates
   Load session/context
   Create orchestrator
         │
         ▼
4. Orchestrator Starts Planner Loop
   Stream LLM query
         │
         ▼
5. LLM Returns Tool Call
   {
     name: "onto_search_tasks",
     arguments: { ... }
   }
         │
         ▼
6. Execute Tool
   → Query database
   → Return results
         │
         ▼
7. LLM Synthesizes Response
   "Here are your 5 active tasks..."
         │
         ▼
8. Stream Events to Frontend
   SSE: tool_call → tool_result → text → done
         │
         ▼
9. Frontend Updates UI
   • Think block shows tool execution
   • Message appears with response
   • Input re-enabled
```

---

## 🎯 Message Flow (Complex Plan Execution)

**When user asks a complex question requiring multiple steps:**

```
1. User Types Complex Request
   "Audit my project and create a status report"
         │
         ▼
2. Frontend Initiates Stream
   Same as simple flow
         │
         ▼
3. Orchestrator Planner Loop
   LLM decides to create a plan
         │
         ▼
4. LLM Calls Virtual Tool
   agent_create_plan {
     execution_mode: "auto_execute",
     strategy: "project_audit",
     user_intent: "..."
   }
         │
         ▼
5. Generate Plan via PlanOrchestrator
   ┌──────────────────────────────────────┐
   │ Plan Steps:                          │
   │ 1. Search all project tasks          │
   │ 2. Analyze task status distribution  │
   │ 3. Identify blockers (executor)      │
   │ 4. Generate summary report           │
   └──────────────────────────────────────┘
         │
         ▼
6. Validate Plan
   • Check dependencies
   • No circular refs
   • Save to database
         │
         ▼
7. Execute Plan Step-by-Step

   Step 1: Search tasks
   ├─ SSE: step_start
   ├─ Execute: onto_search_tasks
   ├─ SSE: tool_call, tool_result
   └─ SSE: step_complete

   Step 2: Analyze distribution
   ├─ SSE: step_start
   ├─ Execute: onto_get_entity_detail (multiple)
   └─ SSE: step_complete

   Step 3: Identify blockers (complex)
   ├─ SSE: step_start
   ├─ Spawn executor agent
   ├─ SSE: executor_spawned
   ├─ Executor runs with LLM + tools
   ├─ SSE: executor_result
   └─ SSE: step_complete

   Step 4: Generate report
   ├─ SSE: step_start
   ├─ Execute: onto_create_document
   └─ SSE: step_complete
         │
         ▼
8. Synthesize Final Response
   "I've audited your project. Here's what I found..."
   • Include entity changes
   • Link to created report
         │
         ▼
9. Stream Done
   SSE: done (with token usage)
         │
         ▼
10. Frontend Shows Complete Results
    • Think block with all steps
    • Tool executions visible
    • Executor activities logged
    • Final message displayed
```

---

## 🛠️ Tool Execution Detail

```
Tool Call Received
      │
      ▼
┌─────────────────────────────────────────┐
│ ToolExecutionService.executeTool()     │
├─────────────────────────────────────────┤
│ 1. Parse tool name & arguments          │
│ 2. Check if virtual tool                │
│    • "agent_create_plan" → special      │
│ 3. Validate tool exists                 │
│ 4. Call ChatToolExecutor                │
│    ┌──────────────────────────────────┐ │
│    │ Switch on tool name:             │ │
│    │   onto_search_tasks → DB query   │ │
│    │   onto_create_task → Insert      │ │
│    │   onto_update_entity → Update    │ │
│    │   ... (50+ handlers)             │ │
│    └──────────────────────────────────┘ │
│ 5. Extract entity IDs from result       │
│ 6. Return ToolExecutionResult           │
└─────────────────────────────────────────┘
```

---

## 🎨 Frontend SSE Event Processing

**How the UI updates in real-time:**

```
SSE Event Arrives
      │
      ▼
┌───────────────────────────────────────────────────────┐
│ handleSSEMessage(event)                               │
├───────────────────────────────────────────────────────┤
│ Parse JSON from event.data                            │
│                                                       │
│ Switch on event.type:                                 │
│                                                       │
│   session           → Store sessionId                 │
│   ontology_loaded   → Log context summary             │
│   last_turn_context → Store for next turn             │
│   agent_state       → Update think block header       │
│   text              → Append to message               │
│   tool_call         → Add tool to think block         │
│   tool_result       → Mark tool completed             │
│   step_start        → Add step to think block         │
│   step_complete     → Mark step done                  │
│   executor_spawned  → Add executor activity           │
│   executor_result   → Update executor status          │
│   plan_created      → Display plan structure          │
│   context_shift     → Update context indicator        │
│   focus_active      → Show focus badge                │
│   done              → Enable input, close stream      │
│   error             → Show error, stop streaming      │
│                                                       │
└───────────────────────────────────────────────────────┘
      │
      ▼
UI Updates Reactively (Svelte 5 $state)
```

---

## 🎯 Project Focus System

**Narrowing agent context to specific entities:**

```
┌─────────────────────────────────────────────────────┐
│ User Opens ProjectFocusSelector                     │
│                                                     │
│ Focus Types:                                        │
│  ○ Project-wide  (entire project)                  │
│  ○ Task          (specific task)                   │
│  ○ Goal          (specific goal)                   │
│  ○ Plan          (specific plan)                   │
│  ○ Document      (specific doc)                    │
│  ○ Output        (specific output)                 │
│                                                     │
│ User selects: "Task: Implement login"              │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ ProjectFocus object created:                        │
│ {                                                   │
│   focusType: 'task',                                │
│   focusEntityId: 'task_abc123',                     │
│   focusEntityName: 'Implement login',               │
│   projectId: 'proj_xyz',                            │
│   projectName: 'Web App'                            │
│ }                                                   │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Sent with next message                              │
│ API loads focused ontology context                  │
│ Tools filtered to task-relevant subset              │
│ System prompt includes focus                        │
│                                                     │
│ Result: Agent focuses on this task,                 │
│         ignores other project entities              │
└─────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Persistence

**What gets saved:**

```
┌────────────────────────────────────────────────────┐
│ chat_sessions                                      │
│ • id, user_id, context_type, entity_id             │
│ • status, message_count, token_usage               │
│ • agent_metadata (stores projectFocus)             │
│ • created_at, updated_at                           │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ chat_messages                                      │
│ • id, session_id, user_id, role                    │
│ • content, tool_calls, tool_call_id                │
│ • created_at                                       │
│                                                    │
│ Roles: 'user', 'assistant', 'tool'                 │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ agents                                             │
│ • id, type ('planner' | 'executor')                │
│ • name, model_preference, system_prompt            │
│ • status, created_for_session/plan/step            │
│ • user_id, created_at, completed_at                │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ agent_plans                                        │
│ • id, session_id, user_id, planner_agent_id        │
│ • user_message, strategy, steps (JSONB)            │
│ • status, metadata (JSONB)                         │
│ • created_at, completed_at                         │
└────────────────────────────────────────────────────┘
```

---

## 📋 31 Tools by Category

### Search/List Tools (8)

- `onto_search_tasks` - Search tasks by query
- `onto_search_plans` - Search plans
- `onto_search_goals` - Search goals
- `onto_search_documents` - Search documents
- `onto_list_entity_outputs` - List outputs for entity
- `onto_list_entity_children` - List child entities
- `onto_list_entity_parents` - List parent entities
- `onto_list_entity_links` - List linked entities

### Read/Detail Tools (2)

- `onto_get_entity_detail` - Get full entity details
- `onto_get_entity_facets` - Get entity facets

### Write/CRUD Tools (12)

- `onto_create_task` - Create new task
- `onto_create_plan` - Create new plan
- `onto_create_goal` - Create new goal
- `onto_create_document` - Create new document
- `onto_create_output` - Create new output
- `onto_update_entity` - Update entity
- `onto_update_entity_props` - Update props/facets
- `onto_update_entity_status` - Update status/state
- `onto_link_entities` - Create relationship
- `onto_unlink_entities` - Remove relationship
- `onto_add_entity_tag` - Add tag
- `onto_remove_entity_tag` - Remove tag

### Utility/Knowledge Tools (9)

- `onto_list_entity_types` - List available types
- `onto_get_template_schema` - Get template definition
- `onto_validate_entity` - Validate before create/update
- `buildos_get_overview` - Platform overview
- `buildos_get_usage_guide` - Usage instructions
- `buildos_get_references` - Technical references
- `project_list` - List user projects
- `project_get_detail` - Get project details
- `agent_create_plan` - **Virtual**: Generate plan

---

## 🚀 Key Features

### ✅ Real-Time Streaming

- SSE for immediate feedback
- 25+ event types
- 4-minute inactivity timeout
- Graceful error handling

### ✅ Multi-Agent Coordination

- Planner agent for orchestration
- Executor agents for complex steps
- Dependency-aware execution
- Parallel step optimization

### ✅ Context Awareness

- Ontology integration (entity templates)
- Last turn context (previous entities)
- Project focus (scoped conversations)
- Context shifting (dynamic scope)

### ✅ Plan Management

- LLM-generated plans with validation
- Dependency checking (no circular refs)
- 3 execution modes:
    - `auto_execute` - immediate execution
    - `draft_only` - user review required
    - `agent_review` - internal critique first

### ✅ UI Polish

- Thinking blocks (activity logs)
- Tool execution status (pending/complete/failed)
- Smart auto-scrolling
- Dark mode support
- Responsive design
- Voice input integration

---

## 🗺️ File Map

### Frontend

- `apps/web/src/lib/components/agent/AgentChatModal.svelte` (1941 lines)
- `apps/web/src/lib/components/agent/ThinkingBlock.svelte` (299 lines)
- `apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte` (94 lines)
- `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte` (299 lines)

### API

- `apps/web/src/routes/api/agent/stream/+server.ts` (1214 lines)

### Orchestration

- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts` (870 lines)
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts` (1328 lines)
- `apps/web/src/lib/services/agentic-chat/index.ts` (131 lines - factory)

### Execution

- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts` (641 lines)
- `apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts` (355 lines)
- `apps/web/src/lib/services/agentic-chat/execution/agent-executor-service.ts` (~500 lines)

### Tools

- `apps/web/src/lib/chat/tool-definitions.ts` (2851 lines - 31 tool definitions)
- `apps/web/src/lib/chat/tools.config.ts` (252 lines - context filtering)
- `apps/web/src/lib/chat/tool-executor.ts` (2196 lines - 50+ handlers)

### Services

- `apps/web/src/lib/services/agentic-chat/shared/smart-llm-service.ts` (~400 lines)
- `apps/web/src/lib/services/agentic-chat/context/agent-context-service.ts` (~600 lines)
- `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts` (600 lines)
- `apps/web/src/lib/services/agentic-chat/session/agent-persistence-service.ts` (~400 lines)

---

## 📚 Related Documentation

- **Complete Research**: `/thoughts/shared/research/2025-11-17_00-00-00_agentic-chat-flow-guide.md`
- **Tool System**: `/TOOL_SYSTEM_DOCUMENTATION.md`
- **Frontend Deep Dive**: `/apps/web/docs/features/agentic-chat/FRONTEND_EXPLORATION.md`
- **Ontology System**: `/apps/web/docs/features/ontology/README.md`

---

## 🎓 Learning Path

1. **Start Here** (this doc) - High-level visual overview
2. **Frontend Exploration** - Understand UI interactions
3. **Tool System Docs** - Learn available tools
4. **Complete Research** - Deep technical dive
5. **Source Code** - Read actual implementation

---

**Last Updated**: 2025-11-17
**Status**: Production-ready, actively maintained
