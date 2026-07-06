<!-- apps/web/docs/features/chat-system/multi-agent-chat/README.md -->

# Multi-Agent Chat System

**Status:** ✅ Phase 4 Complete - Full Iterative Conversations Implemented
**Created:** 2025-10-29
**Last Updated:** 2025-10-29
**Architecture:** Planner + Executor with Iterative LLM-to-LLM Conversations

## 🎯 Overview

BuildOS uses a **layered multi-agent system** where a Planning Agent orchestrates Executor Agents through **iterative LLM-to-LLM conversations**. This architecture optimizes for context minimization, permission isolation, and cost efficiency.

### Key Benefits

- **70% cost savings** - Executors use fast/cheap models with minimal context
- **Permission isolation** - Executors are read-only by design
- **Better parallelization** - Multiple executors can run concurrently
- **Iterative refinement** - Agents can clarify requirements with each other
- **Full observability** - All conversations persisted and streamed to user

## 🏗️ Architecture

```
User Message
    ↓
Planning Agent (deepseek-chat, ~5000 tokens, read-write)
    ├─ Simple query → Direct response
    ├─ Tool query → Use tools directly (1-2 ops)
    └─ Complex query → Create plan + spawn executors
        ↓
    Executor Agents (deepseek-coder, ~1500 tokens, read-only)
        ↓
    LLM-to-LLM Conversation (iterative)
        Executor: "Found 3 projects, which one?"
        Planner: "Get the first one"
        Executor: "Here are the details..."
        ↓
    Planner synthesizes all results
        ↓
Final Response to User
```

### Agent Types

| Agent        | Model          | Permissions | Token Budget | Tools              |
| ------------ | -------------- | ----------- | ------------ | ------------------ |
| **Planner**  | deepseek-chat  | read-write  | ~5000        | All 21 tools       |
| **Executor** | deepseek-coder | read-only   | ~1500        | 12 read tools only |

## 📊 Database Schema

**5 Core Tables:**

1. **`agents`** - Agent instances (planner/executor identity)
2. **`agent_plans`** - Multi-step execution plans
3. **`agent_chat_sessions`** - LLM-to-LLM conversation threads
4. **`agent_chat_messages`** - Messages in agent conversations
5. **`agent_executions`** - Executor run tracking & metrics

**Key Relationships:**

```
chat_sessions (user)
  → agent_plans
    → agents (planner)
    → agent_chat_sessions
      → agents (executor)
      → agent_chat_messages []
    → agent_executions []
```

## 🔐 Permission Model

### READ-ONLY Tools (Executor)

```typescript
(list_tasks, search_projects, search_notes, search_brain_dumps);
(get_task_details, get_project_details, get_note_details, get_brain_dump_details);
(get_calendar_events, find_available_slots);
(get_task_calendar_events, check_task_has_calendar_event);
```

### READ-WRITE Tools (Planner Only)

```typescript
(create_task, update_task, update_project);
(create_note, create_brain_dump);
(schedule_task, update_calendar_event, delete_calendar_event);
update_or_schedule_task;
```

**Enforcement:** Tool calls are validated against agent permissions. Executors attempting write operations receive permission errors.

## 🔄 Conversation Flow

### Simple Query (No Tools)

```
User: "What is BuildOS?"
→ Planner responds directly (conversational)
```

### Tool Query (1-2 Tools)

```
User: "Show my tasks"
→ Planner uses list_tasks() directly
→ Planner formats response
```

### Complex Query (Multiple Steps)

```
User: "Update marketing project deadline and schedule all tasks"
→ Planner analyzes: complex (3+ operations)
→ Planner creates plan:
   Step 1: Find project (executor)
   Step 2: Update deadline (planner - needs write permission)
   Step 3: Schedule tasks (executor)
→ Planner spawns Executor for Step 1:
   ↓ agent_chat_session created
   Planner → Executor: "Find 'marketing' project"
   Executor uses search_projects()
   Executor → Planner: "Found 2 matches: 'Marketing Q4', 'Marketing Site'"
   Planner → Executor: "Get details for 'Marketing Q4'"
   Executor uses get_project_details()
   Executor → Planner: "Project details: {...}"
   ↓ agent_chat_session completed
→ Planner executes Step 2 directly (has write permission)
→ Planner spawns Executor for Step 3 (schedules all tasks)
→ Planner synthesizes results into final response
```

## 📁 Implementation Files

```
/apps/web/src/lib/services/
  ├── agentic-chat-v2/context-loader.ts        ✅ Context assembly
  ├── agentic-chat-v2/stream-orchestrator/     ✅ Streaming/tool loop
  ├── agentic-chat-v2/session-service.ts       ✅ Session persistence
  ├── agentic-chat/tools/core/tools.config.ts  ✅ Tool configuration
  └── smart-llm-service.ts                     ✅ LLM streaming API

/packages/shared-types/src/
  └── agent.types.ts                ✅ All type definitions

/supabase/migrations/
  └── 20251029_create_agent_architecture.sql  ✅ Database schema
```

## 🚀 Current Status

See [HANDOFF.md](./HANDOFF.md) for the latest handoff notes in this archived multi-agent-chat folder.

**Phase 1:** ✅ Complete - Scaffolding & database schema
**Phase 2:** 🚧 In Progress - LLM integration
**Phase 3:** ⏳ Pending - API endpoint
**Phase 4:** ⏳ Pending - Testing & UI

## 🎯 Next Steps

1. **Integrate SmartLLMService** into AgentPlannerService
    - Constructor injection
    - Real streaming in `handleToolQuery()`
    - Tool execution via ChatToolExecutor

2. **Integrate SmartLLMService** into AgentExecutorService
    - Constructor injection
    - READ-ONLY tool filtering
    - Agent-to-agent message persistence

3. **Implement executor spawning** in planner
    - Create agent instances in DB
    - Manage agent_chat_sessions
    - Track executions in agent_executions

4. **Test core flows**
    - Simple query (no tools)
    - Tool query (planner + tools)
    - Complex query (planner + executor)
    - Permission enforcement

## 💡 Key Design Decisions

### Why Iterative Conversations?

**Traditional:** Executor must speculatively fetch all possible data
**Iterative:** Executor can ask planner for clarification

**Benefits:**

- Precision: No ambiguity in results
- Efficiency: Only fetch what's needed
- Natural: Like human delegation
- Observable: User sees the dialogue

### Why Model Tiers?

**Planner (expensive):** Needs reasoning, planning, synthesis
**Executor (cheap):** Focused tasks, simple tool calls

**Cost optimization:** 70% of operations use the cheap model

### Why Permission Isolation?

- **Safety:** Executors can't mutate data accidentally
- **Clarity:** Explicit separation of concerns
- **Auditability:** Easy to track who did what
- **Extensibility:** Can add more permission levels later

## 📚 Related Docs

- **Chat System Overview:** `../README.md`
- **Database Schema:** `../DATABASE_SCHEMA_ANALYSIS.md`
- **Tool Configuration:** `../../../lib/chat/tools.config.ts`
- **Status / Handoff:** `./HANDOFF.md`

---

**For implementation details, see the service source files.**
**For current progress, see HANDOFF.md.**
