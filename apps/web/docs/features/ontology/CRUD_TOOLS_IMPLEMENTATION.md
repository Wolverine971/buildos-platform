<!-- apps/web/docs/features/ontology/CRUD_TOOLS_IMPLEMENTATION.md -->

# Ontology CRUD Tools Implementation

**Status**: ✅ Complete
**Date**: 2025-11-04
**Phase**: Agent Chat Ontology Integration - Action Tools

## Overview

This document describes the implementation of CREATE, UPDATE, and DELETE tools for the ontology system, enabling the AI agent to mutate ontology entities (tasks, goals, plans, projects) through chat commands.

## What Was Implemented

### 1. Tool Definitions (tools.config.ts)

Added 9 new tool definitions organized into three categories:

#### CREATE Tools (3)

- **create_onto_task** - Create tasks in projects
    - Required: `project_id`, `title`
    - Optional: `description`, `type_key`, `state_key`, `priority`, `plan_id`, `due_at`, `props`
    - Defaults: `type_key='task.basic'`, `state_key='todo'`, `priority=3`

- **create_onto_goal** - Create project goals
    - Required: `project_id`, `name`
    - Optional: `description`, `type_key`, `props`
    - Default: `type_key='goal.basic'`

- **create_onto_plan** - Create task groupings
    - Required: `project_id`, `name`
    - Optional: `description`, `type_key`, `state_key`, `props`
    - Defaults: `type_key='plan.basic'`, `state_key='draft'`

#### UPDATE Tools (2)

- **update_onto_task** - Update task fields
    - Required: `task_id`
    - Optional: `title`, `description`, `state_key`, `priority`, `plan_id`, `due_at`, `props`
    - Supports partial updates (only updates fields provided)

- **update_onto_project** - Update project fields
    - Required: `project_id`
    - Optional: `name`, `description`, `state_key`, `props`
    - Supports partial updates

#### DELETE Tools (3)

- **delete_onto_task** - Permanently delete task
    - Required: `task_id`
    - Includes ownership verification

- **delete_onto_goal** - Permanently delete goal
    - Required: `goal_id`

- **delete_onto_plan** - Permanently delete plan
    - Required: `plan_id`
    - Note: Does NOT delete tasks in the plan

### 2. Tool Handlers (tool-executor.ts)

Implemented 9 handler methods in `ChatToolExecutor` class:

**File**: `/apps/web/src/lib/chat/tool-executor.ts`

#### TypeScript Interfaces (Lines 82-143)

```typescript
interface CreateOntoTaskArgs {
	project_id: string;
	title: string;
	description?: string;
	type_key?: string;
	state_key?: string;
	priority?: number;
	plan_id?: string;
	due_at?: string;
	props?: any;
}

interface CreateOntoGoalArgs {
	/* ... */
}
interface CreateOntoPlanArgs {
	/* ... */
}
interface UpdateOntoTaskArgs {
	/* ... */
}
interface UpdateOntoProjectArgs {
	/* ... */
}
interface DeleteOntoTaskArgs {
	/* ... */
}
interface DeleteOntoGoalArgs {
	/* ... */
}
interface DeleteOntoPlanArgs {
	/* ... */
}
```

#### Switch Statement Cases (Lines 420-454)

Added case handlers in the `execute()` method for all 9 tools.

#### Handler Implementations (Lines 2001-2204)

**CREATE Handlers**:

- `createOntoTask()` - Calls `POST /api/onto/tasks/create`
- `createOntoGoal()` - Calls `POST /api/onto/goals/create`
- `createOntoPlan()` - Calls `POST /api/onto/plans/create`

**UPDATE Handlers**:

- `updateOntoTask()` - Calls `PATCH /api/onto/tasks/[id]`
- `updateOntoProject()` - Calls `PATCH /api/onto/projects/[id]`

**DELETE Handlers**:

- `deleteOntoTask()` - Calls `DELETE /api/onto/tasks/[id]`
- `deleteOntoGoal()` - Calls `DELETE /api/onto/goals/[id]`
- `deleteOntoPlan()` - Calls `DELETE /api/onto/plans/[id]`

All handlers:

- Use existing `apiRequest()` method pattern
- Include proper error handling
- Return descriptive success messages with entity name and ID
- Support partial updates for UPDATE operations

### 3. System Prompts (chat-context-service.ts)

Updated `getAllOntologyToolsSystemPrompt()` method to include:

#### Tier 4 Documentation (Lines 190-218)

Complete documentation of all ACTION tools with:

- Tool names and descriptions
- Required vs optional parameters
- When to use each tool
- Best practices for actions

#### Example Workflows (Lines 275-289)

Added three example workflows demonstrating:

- **CREATE**: "Create a task called 'Write introduction' in the writing project"
- **UPDATE**: "Mark that task as in progress"
- **DELETE**: "Delete the old goal about user testing"

### 4. Tool Configuration Updates

**File**: `/apps/web/src/lib/chat/tools.config.ts`

#### ONTOLOGY_TOOLS Array (Lines 1612-1625)

Updated to include all 16 ontology tools:

- 7 READ tools (existing)
- 9 ACTION tools (new)

#### TOOL_CATEGORIES (Lines 1577-1590)

Added new `ontology_action` category:

```typescript
ontology_action: {
  tools: [
    'create_onto_task', 'create_onto_goal', 'create_onto_plan',
    'update_onto_task', 'update_onto_project',
    'delete_onto_task', 'delete_onto_goal', 'delete_onto_plan'
  ],
  averageTokens: 200,
  costTier: 'low'
}
```

## API Endpoints Used

All endpoints already existed and were verified during implementation:

### CREATE Endpoints

- `POST /api/onto/tasks/create` - Create task with project linking
- `POST /api/onto/goals/create` - Create goal with onto_edges
- `POST /api/onto/plans/create` - Create plan with onto_edges

### UPDATE Endpoints

- `PATCH /api/onto/tasks/[id]` - Update task fields
- `PATCH /api/onto/projects/[id]` - Update project fields

### DELETE Endpoints

- `DELETE /api/onto/tasks/[id]` - Delete task and edges
- `DELETE /api/onto/goals/[id]` - Delete goal and edges
- `DELETE /api/onto/plans/[id]` - Delete plan (preserves tasks)

All endpoints include:

- Ownership verification (actor-based authorization)
- Automatic onto_edges management
- Proper error handling
- ApiResponse wrapper format

## Security & Data Integrity

### Ownership Verification

All API endpoints verify that the user's actor owns the entity before allowing mutations:

```typescript
// Example from /api/onto/tasks/[id]/+server.ts
const { data: task } = await supabase
	.from('onto_tasks')
	.select(`*, project:onto_projects!inner(id, created_by)`)
	.eq('id', params.id)
	.single();

if (task.project.created_by !== actorId) {
	return ApiResponse.error('Access denied', 403);
}
```

### Relationship Management

- CREATE operations automatically create onto_edges linking entities
- DELETE operations remove all related edges
- UPDATE operations preserve relationships unless explicitly changed

### Partial Updates

UPDATE tools only modify fields that are explicitly provided:

```typescript
const updateData: any = {};
if (args.title !== undefined) updateData.title = args.title;
if (args.state_key !== undefined) updateData.state_key = args.state_key;
// ... only specified fields are updated
```

## Progressive Disclosure Integration

The ACTION tools integrate with the existing 4-tier progressive disclosure pattern:

**Tier 1**: LIST tools → Find entities
**Tier 2**: DETAIL tools → Get complete data
**Tier 3**: RELATIONSHIP tools → Explore connections
**Tier 4**: ACTION tools → **Mutate entities** ✨ (new)

### Recommended Workflows

**Before CREATE**:

1. Use LIST tools to verify entity doesn't already exist
2. Get project_id from user or context
3. Create with sensible defaults

**Before UPDATE**:

1. Use LIST tools to find entity
2. Optionally use DETAIL tools if full context needed
3. Update only changed fields

**Before DELETE**:

1. Use LIST tools to confirm entity exists
2. Verify it's the correct entity
3. Delete and confirm to user

## Example Chat Interactions

### Creating a Task

```
User: "Create a task to write the documentation for the API"

Agent:
1. list_onto_projects() → Find current project
2. create_onto_task(
     project_id="abc-123",
     title="Write API documentation",
     state_key="todo",
     priority=3
   )
3. Response: "Created ontology task 'Write API documentation' (ID: xyz-789)"
```

### Updating a Task

```
User: "Mark that task as in progress"

Agent:
1. Get task_id from last_turn_context.entities.task_ids
2. update_onto_task(
     task_id="xyz-789",
     state_key="in_progress"
   )
3. Response: "Updated ontology task 'Write API documentation' (state_key)"
```

### Deleting a Goal

```
User: "Delete the old beta testing goal"

Agent:
1. list_onto_goals() → Search for "beta testing"
2. Confirm: "Found goal 'Complete beta testing' (ID: def-456). Delete this?"
3. delete_onto_goal(goal_id="def-456")
4. Response: "Ontology goal deleted successfully"
```

## Files Modified

### Core Implementation

- `/apps/web/src/lib/chat/tool-executor.ts` - 9 new handlers (lines 82-143, 420-454, 2001-2204)
- `/apps/web/src/lib/chat/tools.config.ts` - 9 tool definitions (lines 1207-1487)
- `/apps/web/src/lib/services/chat-context-service.ts` - System prompt updates (lines 190-289)

### Configuration

- `ONTOLOGY_TOOLS` array - Updated to include ACTION tools
- `TOOL_CATEGORIES` - Added `ontology_action` category

## Testing Status

⏳ **Pending**: End-to-end testing of CREATE/UPDATE/DELETE flows

### Recommended Tests

1. **CREATE Flow**:
    - Create task in existing project
    - Create goal with custom props
    - Create plan with description
    - Verify onto_edges created correctly

2. **UPDATE Flow**:
    - Update single field (state_key)
    - Update multiple fields
    - Update with partial data
    - Verify unchanged fields remain

3. **DELETE Flow**:
    - Delete task (verify edges removed)
    - Delete goal (verify cascade)
    - Delete plan (verify tasks preserved)
    - Verify ownership checks work

4. **Error Handling**:
    - Invalid project_id (404)
    - Unauthorized access (403)
    - Missing required fields (400)
    - Malformed data

## Known Limitations

1. **No Undo**: DELETE operations are permanent
2. **No Bulk Operations**: Must operate on one entity at a time
3. **Limited Validation**: Relies on API endpoint validation
4. **Missing Entities**: No tools yet for:
    - onto_outputs (deliverables)
    - onto_documents (documentation)

## Next Steps

1. ✅ Complete implementation (DONE)
2. ⏳ End-to-end testing (PENDING)
3. 📋 Add tools for onto_outputs and onto_documents
4. 📋 Add batch operation tools (create multiple tasks at once)
5. 📋 Add soft delete option (mark as deleted vs permanent)
6. 📋 Add audit logging for mutations

## Integration Points

### With Existing Systems

- **Agent Planner**: Uses tools when ontology context available
- **Tool Executor**: Executes mutations via API endpoints
- **Context Service**: Provides usage guidance in system prompts
- **Ontology API**: Handles all database operations and validation

### With Agent Workflows

- **analyzeUserIntent()**: Detects mutation intent ("create", "update", "delete")
- **executeStrategy()**: Routes to appropriate tool executor
- **last_turn_context**: Tracks created/modified entity IDs

## Performance Considerations

- **Token Efficiency**: ACTION tools have low token overhead (~200 tokens)
- **API Calls**: Each mutation requires 1 API call
- **Context Tracking**: Entity IDs stored in last_turn_context for quick reference
- **Validation**: Happens at API layer, not in tool executor

## Success Criteria

✅ All 9 CREATE/UPDATE/DELETE tools defined
✅ All handlers implemented and type-safe
✅ System prompts updated with Tier 4 documentation
✅ Example workflows provided
✅ Integration with existing tool architecture
✅ Security via API endpoint ownership checks
⏳ End-to-end testing (next step)

---

**Implementation Complete**: 2025-11-04
**Implemented By**: Claude Code (Agent Chat Enhancement Team)
**Related Docs**:

- [Agent Chat Ontology Integration Status](/apps/web/docs/features/ontology/AGENT_CHAT_ONTOLOGY_INTEGRATION_STATUS.md)
- [Ontology First Refactoring](/apps/web/docs/features/ontology/ONTOLOGY_FIRST_REFACTORING.md)
- [Data Models](/apps/web/docs/features/ontology/DATA_MODELS.md)
