# Braindump Context Agent Capabilities Assessment

**Date:** 2024-12-08
**Status:** Review Required
**Purpose:** Document what the agent has access to in the braindump chat context

---

## Executive Summary

The braindump context agent is currently configured with **read-only access** to ontology tools. While this supports the "sounding board" philosophy of gentle exploration, it prevents users from converting their braindumps into projects or tasks directly from the chat.

### Key Finding: Missing Write Tools

**Issue:** The `brain_dump` context type is NOT mapped in `CONTEXT_TO_TOOL_GROUPS`, so it falls back to `DEFAULT_GROUPS = ['base', 'global']`, which only includes list/search tools.

**Impact:** Users cannot create projects, tasks, or goals from within the braindump chat context.

**Recommendation:** Add `brain_dump` to `CONTEXT_TO_TOOL_GROUPS` with selective write tool access.

---

## Current Tool Configuration

### Source: `tools.config.ts`

The `CONTEXT_TO_TOOL_GROUPS` map does **not** include `brain_dump`:

```typescript
const CONTEXT_TO_TOOL_GROUPS: Record<PlannerContextType, ToolContextScope[]> = {
	global: ['base', 'global'],
	project_create: ['base', 'project_create'],
	project: ['base', 'project'],
	task: ['base', 'project'],
	calendar: ['base', 'global'],
	project_audit: ['base', 'project', 'project_audit'],
	project_forecast: ['base', 'project', 'project_forecast'],
	task_update: ['base', 'project'],
	daily_brief_update: ['base']
	// NOTE: brain_dump is MISSING - falls back to DEFAULT_GROUPS
};

const DEFAULT_GROUPS: ToolContextScope[] = ['base', 'global'];
```

### Tools Available in Braindump Context

Since `brain_dump` uses `DEFAULT_GROUPS = ['base', 'global']`:

#### From `base` Group (5 tools)

| Tool                       | Category     | Purpose                                 |
| -------------------------- | ------------ | --------------------------------------- |
| `get_field_info`           | Utility      | Get valid field values for entity types |
| `get_entity_relationships` | Ontology     | Query relationship graphs               |
| `web_search`               | Web Research | Search the web for information          |
| `get_buildos_overview`     | Docs         | Get BuildOS product overview            |
| `get_buildos_usage_guide`  | Docs         | Get BuildOS usage instructions          |

#### From `global` Group (10 tools)

| Tool                    | Category      | Purpose                          |
| ----------------------- | ------------- | -------------------------------- |
| `list_onto_projects`    | Ontology Read | List user's projects             |
| `search_ontology`       | Ontology Read | Search across all entity types   |
| `search_onto_projects`  | Ontology Read | Search projects by criteria      |
| `list_onto_tasks`       | Ontology Read | List tasks (optionally filtered) |
| `search_onto_tasks`     | Ontology Read | Search tasks by criteria         |
| `list_onto_goals`       | Ontology Read | List goals                       |
| `list_onto_plans`       | Ontology Read | List plans                       |
| `list_onto_documents`   | Ontology Read | List documents                   |
| `list_onto_templates`   | Ontology Read | List project templates           |
| `search_onto_documents` | Ontology Read | Search documents                 |

**Total: 15 tools (all read-only)**

### Tools NOT Available in Braindump Context

The following tools are excluded because they're only in the `project` group:

#### Create Tools (6 tools)

| Tool                   | Purpose                        |
| ---------------------- | ------------------------------ |
| `create_onto_project`  | Create a new project           |
| `create_onto_task`     | Create a new task              |
| `create_onto_goal`     | Create a new goal              |
| `create_onto_plan`     | Create a new plan              |
| `create_onto_document` | Create a new document          |
| `create_task_document` | Create document linked to task |

#### Update Tools (5 tools)

| Tool                   | Purpose                     |
| ---------------------- | --------------------------- |
| `update_onto_task`     | Modify an existing task     |
| `update_onto_project`  | Modify an existing project  |
| `update_onto_goal`     | Modify an existing goal     |
| `update_onto_plan`     | Modify an existing plan     |
| `update_onto_document` | Modify an existing document |

#### Delete Tools (4 tools)

| Tool                   | Purpose           |
| ---------------------- | ----------------- |
| `delete_onto_task`     | Remove a task     |
| `delete_onto_goal`     | Remove a goal     |
| `delete_onto_plan`     | Remove a plan     |
| `delete_onto_document` | Remove a document |

#### Detail Tools (5 tools)

| Tool                        | Purpose                   |
| --------------------------- | ------------------------- |
| `get_onto_project_details`  | Get full project details  |
| `get_onto_task_details`     | Get full task details     |
| `get_onto_goal_details`     | Get full goal details     |
| `get_onto_plan_details`     | Get full plan details     |
| `get_onto_document_details` | Get full document details |

---

## System Prompt Analysis

### Source: `agent-context-service.ts`

The braindump context has a comprehensive system prompt (lines 466-514):

```typescript
if (contextType === 'brain_dump') {
	prompt += `

## BRAINDUMP EXPLORATION CONTEXT

The user has shared a braindump - raw, unstructured thoughts that they want
to explore. Your role is to be a thoughtful sounding board and thought partner.

### Your Core Approach

1. **BE A SOUNDING BOARD**: Listen, reflect, and help clarify their thinking
   without rushing to structure
2. **MIRROR THEIR ENERGY**: If they're exploring, explore with them.
   If they're getting concrete, help them structure
3. **ASK GENTLE QUESTIONS**: Only when it helps clarify, not to interrogate.
   Let the conversation flow naturally
4. **IDENTIFY PATTERNS**: Notice themes, goals, or projects that emerge,
   but don't force categorization
5. **AVOID PREMATURE STRUCTURING**: Don't immediately try to create
   projects/tasks unless they clearly want that

### The User Might Be:

- **Processing raw thoughts** that need space and reflection
- **Exploring an idea** that could eventually become a project
- **Working through a decision** or problem that needs clarity
- **Thinking about tasks/goals** within a broader context they haven't
  fully articulated
- **Just wanting to think aloud** with a supportive listener

### Guidelines for Engagement:

- **Start by acknowledging** what they shared and reflecting back key
  themes you noticed
- **Ask clarifying questions sparingly** - focus on understanding, not
  on gathering project requirements
- **Offer gentle observations** like "It sounds like X is important to you"
  or "I notice you mentioned Y several times"
- **Wait for cues** before suggesting structure - phrases like
  "I should probably..." or "I need to organize..." indicate readiness
- **If they seem ready for action**, you can offer: "Would you like me to
  help turn any of this into a project or tasks?"

### What NOT to Do:

- Don't immediately ask "What project is this for?" or "What are the tasks?"
- Don't create projects/tasks without clear signals from the user
- Don't overwhelm with multiple questions at once
- Don't be too formal or business-like - be conversational and warm
- Don't push for structure when they just want to think

### When to Transition to Action:

Only suggest creating structure (projects, tasks, goals) when:
- The user explicitly asks for it
- They express frustration about disorganization
- They say things like "I should make a plan" or "I need to track this"
- The conversation naturally evolves toward concrete next steps

Remember: The value here is in the conversation itself, helping them think
more clearly. Structure can come later if they want it.`;
}
```

### System Prompt Assessment

| Aspect                 | Rating    | Notes                                                     |
| ---------------------- | --------- | --------------------------------------------------------- |
| Tone Guidance          | Excellent | Clear instructions to be warm, conversational             |
| Progressive Disclosure | Good      | Wait for cues before suggesting structure                 |
| Anti-patterns          | Excellent | Clear "what NOT to do" section                            |
| Transition Triggers    | Good      | Defines when to offer project creation                    |
| Tool Awareness         | **Poor**  | Implies ability to create projects/tasks, but lacks tools |

---

## Context Loading

### Location Context (Fallback)

When location context fails to load, the fallback for `brain_dump`:

```typescript
case 'brain_dump':
    return `## Braindump Exploration Mode
The user has shared a braindump - raw, unstructured thoughts. Your role is to
be a supportive thought partner, helping them clarify and organize their
thinking without being too aggressive about structuring.`;
```

### Context Label Display

From `agent-context-service.ts`:

```typescript
brain_dump: 'Braindump Exploration Mode';
```

---

## Ontology Context

The braindump context does **not** receive specialized ontology context like the `project` context does. It uses the standard global context:

- No project-specific scoping
- No entity pre-loading
- No relationship graph pre-population

---

## User Flow Analysis

### Current Flow

```
1. User selects "Braindump" context
2. Enters braindump text
3. Chooses "Chat About It"
4. Agent receives:
   - System prompt (braindump exploration)
   - User's braindump as first message
   - READ-ONLY tools (list/search only)
5. User discusses braindump
6. User says "I want to make this a project"
7. Agent CANNOT create project (no write tools)
8. Agent must tell user to switch contexts or use UI
```

### Expected Flow (with write tools)

```
1-5. Same as above
6. User says "I want to make this a project"
7. Agent uses create_onto_project tool
8. Project is created seamlessly
```

---

## Recommendations

### 1. Add Brain Dump to Tool Groups (High Priority)

**File:** `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`

```typescript
const CONTEXT_TO_TOOL_GROUPS: Record<PlannerContextType, ToolContextScope[]> = {
	// ... existing entries ...
	brain_dump: ['base', 'global', 'braindump_actions'] // NEW
};

// Add new tool group
const TOOL_GROUPS: Record<ToolContextScope, string[]> = {
	// ... existing groups ...
	braindump_actions: [
		'create_onto_project',
		'create_onto_task',
		'create_onto_goal',
		'get_onto_project_details',
		'get_onto_task_details'
	]
};
```

### 2. Alternatively: Full Project Tools

If we want braindumps to have full conversion capability:

```typescript
brain_dump: ['base', 'global', 'project'];
```

This would give braindump the same tools as the project context.

### 3. Update System Prompt

Add tool awareness to the system prompt:

```typescript
### Available Actions

When the user is ready to structure their thoughts, you can:
- Create a new project: Use create_onto_project
- Create tasks: Use create_onto_task
- Create goals: Use create_onto_goal
- Look up existing projects: Use list_onto_projects

Only use these when the user signals readiness for structure.
```

---

## Files Involved

| File                                                                    | Role                            |
| ----------------------------------------------------------------------- | ------------------------------- |
| `apps/web/src/lib/services/agent-context-service.ts`                    | System prompt, context building |
| `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`     | Tool group mappings             |
| `apps/web/src/lib/services/agentic-chat/tools/core/tool-definitions.ts` | Tool definitions                |
| `apps/web/src/lib/components/agent/AgentChatModal.svelte`               | UI flow                         |
| `apps/web/src/lib/components/chat/ContextSelectionScreen.svelte`        | Context selection               |

---

## Test Scenarios

### Current Behavior (Verify)

1. Start braindump chat
2. Say "I want to turn this into a project"
3. Agent should NOT be able to create project
4. Agent should suggest alternative (switch context, use UI)

### After Fix (Verify)

1. Start braindump chat
2. Say "I want to turn this into a project called 'My New Project'"
3. Agent should use `create_onto_project` tool
4. Project should be created successfully

---

## Conclusion

The braindump context agent is well-designed for gentle exploration but lacks the tools to act when users are ready to convert thoughts into structure. Adding selective write tools would complete the user journey from raw thoughts to actionable projects.

**Priority:** High - This gap creates a broken user experience when users naturally want to "do something" with their braindump after discussing it.
