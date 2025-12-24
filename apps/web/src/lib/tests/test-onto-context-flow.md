<!-- apps/web/src/lib/tests/test-onto-context-flow.md -->

# Ontology Context Flow and Workspace Transitions Test

**Test Suite**: Testing context transitions and workspace modes
**Purpose**: Validate context shifts and mode-specific behaviors
**Focus**: Context types, transitions, tool availability per context

## Context Types Overview

BuildOS supports multiple context types for specialized workflows:

- `global` - General conversation across all projects
- `project_create` - New project creation flow
- `project` - Working within a specific project workspace
- `project_audit` - Specialized audit/review mode for projects
- `project_forecast` - Scenario planning and forecasting
- `calendar` - Calendar and scheduling operations
- `daily_brief_update` - Daily brief configuration
- Project focus (task/goal/plan/document/etc) within `project` context

---

## Test Flow 1: Global → Project Create → Project Workspace

**Scenario**: User starts in global mode, creates project, transitions to workspace

### Step 1: Global Context - Discovery

**Context Type**: `global`
**Entity ID**: none

**User Input**: "What projects do I have?"

**Expected Agent Behavior**:

```
list_onto_projects(
  limit: 10
)
```

**Expected Results**:

- ✅ Lists all user's projects
- ✅ Shows project names, types, states
- ✅ Context remains `global`
- ✅ No entity_id set

---

### Step 2: Initiate Project Creation

**User Input**: "Create a new writing project for a blog series"

**Expected Agent Behavior**:

1. **Context Check**: Currently in `global`, need to shift to `project_create`
2. **Automatic Context Shift**: System shifts to `project_create` mode
3. **Template Search**:
    ```
    list_onto_templates(
      scope="project",
      realm="writer",
      search="blog"
    )
    ```
4. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "Blog Series Project",
        type_key: "writer.blog",
        description: "Content series for blog",
        props: {
          facets: {
            context: "personal",
            scale: "small",
            stage: "planning"
          }
        }
      },
      goals: [
        {
          name: "Publish 10 blog posts",
          type_key: "goal.outcome"
        }
      ]
    })
    ```

**Expected Results**:

- ✅ **Context Shift Event Emitted**:
    ```json
    {
    	"type": "context_shift",
    	"context_shift": {
    		"old_context": "global",
    		"new_context": "project_create",
    		"entity_id": null,
    		"message": "Starting new project creation"
    	}
    }
    ```
- ✅ Agent operates in `project_create` mode
- ✅ Template search executes
- ✅ Project created successfully

---

### Step 3: Automatic Workspace Transition

**After project creation succeeds...**

**Expected Agent Behavior**:

1. **Automatic Context Shift**: `project_create` → `project`
2. **Entity ID Set**: New project_id becomes active entity
3. **Session Update**: Updates chat session with new context

**Expected SSE Events**:

```json
{
	"type": "context_shift",
	"context_shift": {
		"old_context": "project_create",
		"new_context": "project",
		"entity_id": "[new_project_id]",
		"entity_name": "Blog Series Project",
		"entity_type": "project",
		"message": "Project created! Now working in project workspace."
	}
}
```

**Expected Results**:

- ✅ Context is now `project`
- ✅ Entity_id is set to new project_id
- ✅ Session updated in database
- ✅ User now in project workspace mode
- ✅ **Agent confirmation**: "✓ Project created! Now working in Blog Series Project workspace."

---

### Step 4: Working in Project Workspace

**Context Type**: `project`
**Entity ID**: [blog_series_project_id]

**User Input**: "Add a task to write the first blog post"

**Expected Agent Behavior**:

```
create_onto_task({
  project_id: "[blog_series_project_id]",  // Automatically uses current entity_id
  title: "Write first blog post",
  priority: 5,
  state_key: "todo"
})
```

**Expected Results**:

- ✅ Task created within current project context
- ✅ No need to specify project_id explicitly (inferred from context)
- ✅ Context remains `project`
- ✅ Entity_id unchanged

---

## Test Flow 2: Project Workspace → Audit Mode → Back to Workspace

**Scenario**: User wants to audit project, then return to normal work

### Step 1: In Project Workspace

**Context Type**: `project`
**Entity ID**: [blog_series_project_id]

**User Input**: "I want to audit this project for risks and gaps"

**Expected Agent Behavior**:

1. **Context Shift**: `project` → `project_audit`
2. **Specialized Tools Available**: Audit-focused operations

**Expected SSE Event**:

```json
{
	"type": "context_shift",
	"context_shift": {
		"old_context": "project",
		"new_context": "project_audit",
		"entity_id": "[blog_series_project_id]",
		"entity_name": "Blog Series Project",
		"message": "Entering audit mode for Blog Series Project"
	}
}
```

**Expected Results**:

- ✅ Context is now `project_audit`
- ✅ Entity_id remains same (same project)
- ✅ Audit-specific prompt and tools activated
- ✅ Agent switches to analytical/review mindset

---

### Step 2: Audit Operations

**Context Type**: `project_audit`

**User Input**: "What are the main risks for this blog project?"

**Expected Agent Behavior**:

1. **Load Project Details**:

    ```
    get_onto_project_details(
      project_id: "[blog_series_project_id]"
    )
    ```

2. **Analyze and Create Risks**:

    ```
    create_onto_risk({
      project_id: "[blog_series_project_id]",
      title: "Content consistency - maintaining quality across 10 posts",
      impact: "medium",
      probability: 0.6,
      state_key: "identified",
      props: {
        category: "quality",
        mitigation: "Create editorial calendar and content outline template"
      }
    })

    create_onto_risk({
      project_id: "[blog_series_project_id]",
      title: "Time commitment - writer's block or burnout",
      impact: "high",
      probability: 0.5,
      state_key: "identified",
      props: {
        category: "execution",
        mitigation: "Set realistic deadlines, batch writing sessions"
      }
    })
    ```

**Expected Results**:

- ✅ Project analyzed in audit mode
- ✅ Risks identified and created
- ✅ Audit perspective applied (looking for gaps, risks, issues)
- ✅ Context still `project_audit`

---

### Step 3: Return to Normal Workspace

**User Input**: "Okay, back to working on the project normally"

**Expected Agent Behavior**:

1. **Context Shift**: `project_audit` → `project`
2. **Return to standard workspace mode**

**Expected SSE Event**:

```json
{
	"type": "context_shift",
	"context_shift": {
		"old_context": "project_audit",
		"new_context": "project",
		"entity_id": "[blog_series_project_id]",
		"message": "Returned to standard project workspace"
	}
}
```

**Expected Results**:

- ✅ Context is `project` again
- ✅ Entity_id unchanged
- ✅ Standard project tools available
- ✅ Agent back to normal operational mode

---

## Test Flow 3: Switching Between Projects

**Scenario**: User switches focus between multiple projects

### Step 1: Currently in Project A

**Context Type**: `project`
**Entity ID**: [blog_project_id]

**User Input**: "Switch to my SaaS development project"

**Expected Agent Behavior**:

1. **Search for Target Project**:

    ```
    search_onto_projects(
      search: "SaaS development"
    )
    ```

2. **Context Shift to New Project**:
    ```json
    {
    	"type": "context_shift",
    	"context_shift": {
    		"old_context": "project",
    		"new_context": "project",
    		"entity_id": "[saas_project_id]",
    		"entity_name": "SaaS Development Project",
    		"old_entity_id": "[blog_project_id]",
    		"message": "Switched to SaaS Development Project workspace"
    	}
    }
    ```

**Expected Results**:

- ✅ Context remains `project` (project to project)
- ✅ Entity_id changes to new project_id
- ✅ Session updated with new entity
- ✅ Agent now operates in context of SaaS project
- ✅ Previous project context cleared

---

### Step 2: Working in New Project

**Context Type**: `project`
**Entity ID**: [saas_project_id]

**User Input**: "What tasks are in progress?"

**Expected Agent Behavior**:

```
list_onto_tasks(
  project_id: "[saas_project_id]",  // Automatically uses current context
  state_key: "in_progress"
)
```

**Expected Results**:

- ✅ Lists tasks for CURRENT project only (not blog project)
- ✅ Filters by in_progress state
- ✅ Context remains `project` with saas entity_id

---

## Test Flow 4: Global to Project Focus (Task)

**Scenario**: User wants to focus on a specific task

### Step 1: Search from Global

**Context Type**: `global`

**User Input**: "Find my task about writing the API documentation"

**Expected Agent Behavior**:

```
search_onto_tasks(
  search: "API documentation"
)
```

**Expected Results**:

- ✅ Searches across ALL projects
- ✅ Returns matching tasks with project context
- ✅ Context remains `global`

---

### Step 2: Focus on Specific Task

**User Input**: "Let's work on that API documentation task"

**Expected Agent Behavior**:

1. **Context Shift**: `global` → `project` (task's parent project)
2. **Set Project Focus**: focusType `task` with the selected task

**Expected SSE Event**:

```json
{
	"type": "context_shift",
	"context_shift": {
		"old_context": "global",
		"new_context": "project",
		"entity_id": "[api_doc_project_id]",
		"entity_name": "API Docs Project",
		"entity_type": "project",
		"message": "Focused on task: Write API Documentation"
	}
}
```

```json
{
	"type": "focus_changed",
	"focus": {
		"focusType": "task",
		"focusEntityId": "[api_doc_task_id]",
		"focusEntityName": "Write API Documentation",
		"projectId": "[api_doc_project_id]",
		"projectName": "API Docs Project"
	}
}
```

**Expected Results**:

- ✅ Context is `project`
- ✅ Entity_id is project_id
- ✅ Project focus is the task
- ✅ Task-specific operations available
- ✅ Agent focuses on single task

---

### Step 3: Task Update Operations

**Context Type**: `project`
**Entity ID**: [api_doc_project_id]
**Project Focus**: task `[api_doc_task_id]`

**User Input**: "Update this task - I'm 50% done, need 4 more hours"

**Expected Agent Behavior**:

```
update_onto_task({
  task_id: "[api_doc_task_id]",
  state_key: "in_progress",
  props: {
    progress_percentage: 50,
    hours_remaining: 4,
    last_updated: "[current_date]"
  }
})
```

**Expected Results**:

- ✅ Task updated with progress
- ✅ Context remains `project`
- ✅ Focus remains on selected task

---

## Test Flow 5: Context Persistence Across Sessions

**Scenario**: User closes chat, reopens, context should be restored

### Step 1: Working in Project

**Context Type**: `project`
**Entity ID**: [blog_project_id]
**Session ID**: [session_123]

**User Input**: "Add a task to proofread blog post 1"

**Expected Results**:

- ✅ Task created in blog project
- ✅ Session saved with context: `project`, entity_id: [blog_project_id]

---

### Step 2: Close and Reopen Chat

**User Action**: Closes AgentChatModal, later reopens it

**Expected Agent Behavior**:

1. **Load Session**: GET /api/agent/stream?session_id=session_123
2. **Restore Context**:
    ```json
    {
    	"type": "session",
    	"session": {
    		"id": "session_123",
    		"context_type": "project",
    		"entity_id": "[blog_project_id]"
    	}
    }
    ```

**Expected Results**:

- ✅ Chat reopens in same project context
- ✅ Context: `project`, entity: [blog_project_id]
- ✅ User can continue where they left off
- ✅ No need to re-select project

---

## Test Flow 6: Calendar Context

**Scenario**: User wants to work with calendar

### Step 1: Switch to Calendar Context

**Current Context**: `global`

**User Input**: "I want to schedule some time for writing"

**Expected Agent Behavior**:

1. **Context Shift**: `global` → `calendar`

**Expected SSE Event**:

```json
{
	"type": "context_shift",
	"context_shift": {
		"old_context": "global",
		"new_context": "calendar",
		"message": "Switched to calendar planning mode"
	}
}
```

**Expected Results**:

- ✅ Context is `calendar`
- ✅ No entity_id (calendar is cross-project)
- ✅ Calendar-specific tools available

---

### Step 2: Calendar Operations

**Context Type**: `calendar`

**User Input**: "Block Monday 9-11am for blog writing"

**Expected Agent Behavior**:

```
create_calendar_block({
  start_time: "[next_monday_9am]",
  end_time: "[next_monday_11am]",
  title: "Blog Writing Session",
  type: "work_block"
})
```

**Expected Results**:

- ✅ Calendar block created
- ✅ Context remains `calendar`
- ✅ Cross-project operation (not tied to specific project)

---

## Test Flow 7: Invalid Context Transitions

**Scenario**: Attempting invalid or nonsensical transitions

### Invalid Transition 1: Focused Task to Project Create

**Current Context**: `project`
**Entity ID**: [some_project_id]
**Project Focus**: task `[some_task_id]`

**User Input**: "Create a new project"

**Expected Agent Behavior**:

1. **Clear Focus**: Exit focused task view
2. **Shift Context**: project → project_create

**Expected Results**:

- ✅ Focus cleared before mode change
- ✅ Context shifts to `project_create`
- ✅ Context shift event emitted
- ✅ Safe transition path

---

## Test Flow 8: Context-Specific Tool Availability

**Scenario**: Verify tool availability changes with context

### Global Context Tools

- list_onto_projects ✅
- search_onto_projects ✅
- search_onto_tasks ✅
- list_onto_templates ✅
- get_field_info ✅

### Project Create Context Tools

- list_onto_templates ✅
- create_onto_project ✅
- request_template_creation ✅
- get_field_info ✅

### Project Workspace Context Tools

- create_onto_task ✅
- create_onto_goal ✅
- create_onto_plan ✅
- update_onto_task ✅
- update_onto_project ✅
- delete_onto_task ✅
- list_onto_tasks ✅
- get_onto_project_details ✅
- (all CRUD tools available)

### Project Audit Context Tools

- All read/list tools ✅
- create_onto_risk ✅
- create_onto_requirement ✅
- create_onto_decision ✅
- create_onto_insight ✅
- (focus on analysis and risk assessment)

---

## Summary - Context Flow Requirements

### ✅ Context Transitions Validated:

1. **Global ↔ Project Create**: Initiating new projects
2. **Project Create → Project**: Automatic after creation
3. **Project ↔ Project Audit**: Specialized review mode
4. **Project ↔ Project**: Switching between projects
5. **Global → Project Focus**: Task/goal/document focus within project context
6. **Global ↔ Calendar**: Calendar operations
7. **Any → Global**: Always safe return to global

### ✅ Context Behaviors Validated:

1. **Entity Binding**: entity_id set appropriately per context
2. **Tool Availability**: Different tools per context type
3. **Session Persistence**: Context saved and restored
4. **Auto-Transitions**: Smart automatic shifts (e.g., after creation)
5. **User Initiated**: Explicit context switching on request
6. **Context Awareness**: Agent behavior adapts to context

### ✅ Edge Cases Covered:

1. **Invalid Transitions**: Routed through valid paths
2. **Cross-Session**: Context restored on reopen
3. **Multi-Project**: Clean switching between projects
4. **Nested Contexts**: Audit mode as sub-context of project
5. **Exit Strategies**: Safe return to global from any context

---

## Expected Database Updates

**chat_sessions table**:

```sql
UPDATE chat_sessions
SET
  context_type = 'project',
  entity_id = '[new_project_id]',
  updated_at = NOW()
WHERE id = '[session_id]'
```

**chat_messages table**:

```sql
INSERT INTO chat_messages (session_id, role, content)
VALUES
  ('[session_id]', 'system', 'Context shifted to project for "Blog Series Project" (ID: [project_id])');
```

---

This comprehensive context flow test validates all transition paths and behaviors in the agentic chat system.
