# Conversational Agent System Prompt Architecture

**Last Updated**: 2025-10-28

## Overview

The conversational agent system uses `context_type` to route chat sessions to specialized handlers with tailored system prompts. Each context type provides a unique AI personality and behavior optimized for specific tasks.

## Architecture Flow

```
User Request
     ↓
API Endpoint (/api/agent/stream)
     ↓ Sets context_type + chat_type
Database (chat_sessions table)
     ↓ Stores both fields
Agent Orchestrator (processMessage)
     ↓ Reads context_type
Switch Statement (routes by context_type)
     ↓ Calls appropriate handler
Handler Method (e.g., handleProjectCreate)
     ↓ Uses corresponding system prompt
AGENT_SYSTEM_PROMPTS[context_type]
     ↓ Sent to LLM
LLM Response
     ↓ Streamed back via SSE
User receives specialized agent response
```

## Context Types & System Prompts

### 1. `general` - General BuildOS Assistant

**Handler**: `handleGeneral()`
**System Prompt**: `AGENT_SYSTEM_PROMPTS.general`

**Purpose**: Entry point for users who aren't sure what they want to do. Guides them to specific agent modes.

**Behavior**:

- Brief and friendly
- Suggests specific agent modes based on user intent
- Doesn't execute operations - guides users to the right mode
- Temperature: 0.7 (conversational)

**Example Use**: "I need help organizing my work"

---

### 2. `project_create` - Project Creation Consultant

**Handler**: `handleProjectCreate()`
**System Prompt**: `AGENT_SYSTEM_PROMPTS.project_create`

**Purpose**: Guide users through creating well-defined projects via conversational questioning.

**Behavior**:

- Warm and patient conversational style
- Uses 9 core project dimensions framework
- Asks 3-5 questions for simple projects, 7-10 for complex
- Creates draft → clarifying questions → finalization flow
- Temperature: 0.8 (warm, conversational)

**Key Features**:

- Progressive dimension detection
- Smart question prioritization
- Draft project management
- Operation generation and queuing

**Example Use**: "I want to start a new project to build a mobile app"

---

### 3. `project_update` - Efficient Project Updater

**Handler**: `handleProjectUpdate()`
**System Prompt**: `AGENT_SYSTEM_PROMPTS.project_update`

**Purpose**: Quickly execute updates to existing projects without unnecessary conversation.

**Behavior**:

- Direct and action-oriented
- Shows preview of changes
- Executes quickly unless ambiguous
- Focuses on tasks unless project context needs updating
- Temperature: 0.3 (precise)

**Requires**: `entity_id` (project ID)

**Example Use**: "Update the mobile app project deadline to next month"

---

### 4. `project_audit` - Critical Project Auditor

**Handler**: `handleProjectAudit()`
**System Prompt**: `AGENT_SYSTEM_PROMPTS.project_audit`

**Purpose**: Perform comprehensive project analysis across all dimensions (read-only).

**Behavior**:

- Honest and direct about issues (severity: 7/10)
- Frames problems as opportunities
- Acknowledges what's working
- Generates suggestions only (no execution)
- Temperature: 0.5 (balanced)

**Focus Areas**:

- Missing dimensions
- Goal/resource mismatches
- Unidentified risks
- Feasibility concerns
- Process improvements

**Requires**: `entity_id` (project ID)

**Example Use**: "Audit my mobile app project and tell me what's missing"

---

### 5. `project_forecast` - Strategic Forecaster

**Handler**: `handleProjectForecast()`
**System Prompt**: `AGENT_SYSTEM_PROMPTS.project_forecast`

**Purpose**: Generate scenario-based forecasts for project outcomes (read-only).

**Behavior**:

- Analytical and strategic
- Generates 3 scenarios: Optimistic (80%), Realistic (50%), Pessimistic (20%)
- Identifies critical factors and decision points
- Read-only analysis mode
- Temperature: 0.5 (balanced)

**Output Format** (per scenario):

- Likelihood percentage
- Key outcomes
- Critical factors
- Warning signs
- Decision points

**Requires**: `entity_id` (project ID)

**Example Use**: "What are the likely outcomes for my mobile app project?"

---

### 6. `task_update` - Focused Task Assistant

**Handler**: `handleTaskUpdate()`
**System Prompt**: `AGENT_SYSTEM_PROMPTS.task_update`

**Purpose**: Quickly update individual task details.

**Behavior**:

- Direct and action-oriented
- Confirms changes before executing
- Handles multiple updates in sequence
- Offers to create task if it doesn't exist
- Temperature: 0.3 (precise)

**Common Operations**:

- Status changes (backlog → in_progress → done)
- Priority adjustments
- Due date modifications
- Detail updates
- Subtask creation

**Requires**: `entity_id` (task ID)

**Example Use**: "Mark task #123 as done and add a note about testing"

**Status**: Handler implemented with TODO for operation execution

---

### 7. `daily_brief_update` - Brief Preferences Manager

**Handler**: `handleDailyBriefUpdate()`
**System Prompt**: `AGENT_SYSTEM_PROMPTS.daily_brief_update`

**Purpose**: Manage daily brief settings and content preferences.

**Behavior**:

- Helpful and explanatory
- Confirms changes before applying
- Explains implications of changes
- Suggests optimal settings
- Temperature: 0.5 (balanced)

**Capabilities**:

- Update delivery time
- Modify content preferences
- Adjust notification channels
- Add/remove brief sections
- Configure frequency

**Example Use**: "Change my daily brief to 7am and include project forecasts"

**Status**: Handler implemented with TODO for operation execution

---

## Database Schema

### `chat_sessions` Table

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Both store same value (agent chat type)
  context_type TEXT NOT NULL CHECK (context_type IN (
    'global', 'project', 'task', 'calendar',  -- Legacy values
    'general', 'project_create', 'project_update',
    'project_audit', 'project_forecast',
    'task_update', 'daily_brief_update'  -- Agent values
  )),
  chat_type TEXT CHECK (chat_type IN (...)), -- Backward compatibility

  entity_id UUID,  -- Project/Task ID for context-specific modes
  ...
);
```

**Key Points**:

- `context_type`: Primary field used for routing (required)
- `chat_type`: Added by agent migration (backward compatibility)
- Both fields store identical values
- Future: Consider consolidating into single field

---

## Implementation Details

### Agent Orchestrator (`agent-orchestrator.service.ts`)

**Routing Logic**:

```typescript
const chatType = (session.context_type || session.chat_type) as AgentChatType;

switch (chatType) {
  case 'project_create':
    yield* this.handleProjectCreate(...);
    break;
  case 'task_update':
    yield* this.handleTaskUpdate(...);
    break;
  // ... etc
}
```

**System Prompt Usage**:

```typescript
const stream = this.llmService.streamText({
	messages: [
		{ role: 'system', content: AGENT_SYSTEM_PROMPTS[chatType] },
		{ role: 'user', content: userMessage }
	],
	userId,
	profile: 'speed', // or 'balanced' depending on mode
	temperature: 0.3, // varies by mode
	maxTokens: 300
});
```

### API Endpoint (`/api/agent/stream`)

**Session Creation**:

```typescript
await supabase.from('chat_sessions').insert({
	user_id: userId,
	chat_type: chatType, // For backward compatibility
	context_type: chatType, // Primary routing field
	entity_id: entity_id
	// ...
});
```

---

## Migration History

### Original Chat System (`20251027_create_chat_tables.sql`)

- Created `context_type` with values: `'global', 'project', 'task', 'calendar'`
- Generic chat system without specialized agents

### Agent Extension (`20251028_create_agent_tables.sql`)

- Added `chat_type` column with agent-specific values
- Created separate field instead of updating constraint

### Constraint Fix (`20251028_fix_context_type_constraint.sql`)

- Updated `context_type` constraint to include all agent types
- Added both legacy and agent values
- Eliminated need for mapping hack
- Added documentation comments

---

## Best Practices

### Adding New Agent Types

1. **Update constraint in new migration**:

    ```sql
    ALTER TABLE chat_sessions DROP CONSTRAINT chat_sessions_context_type_check;
    ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_context_type_check
      CHECK (context_type IN (..., 'new_type'));
    ```

2. **Add system prompt**:

    ```typescript
    const AGENT_SYSTEM_PROMPTS = {
    	// ...
    	new_type: `You are a specialized assistant for...`
    };
    ```

3. **Create handler**:

    ```typescript
    private async *handleNewType(
      session: any,
      userMessage: string,
      userId: string
    ): AsyncGenerator<AgentSSEMessage> {
      // Implementation
    }
    ```

4. **Add to router**:

    ```typescript
    case 'new_type':
      yield* this.handleNewType(session, userMessage, userId);
      break;
    ```

5. **Add to valid types list** (endpoint):
    ```typescript
    const validChatTypes: AgentChatType[] = [
    	// ...
    	'new_type'
    ];
    ```

---

## Testing

### Verify Flow

1. Create session with `chat_type: 'project_create'`
2. Check database: `context_type` === `'project_create'` ✓
3. Send message to session
4. Orchestrator reads `context_type` ✓
5. Routes to `handleProjectCreate()` ✓
6. Uses `AGENT_SYSTEM_PROMPTS.project_create` ✓
7. Response reflects project creation personality ✓

### Test Each Mode

- Create session for each `context_type`
- Verify correct system prompt is used
- Check behavior matches specification
- Test with/without required `entity_id`

---

## Future Considerations

### Potential Improvements

1. **Consolidate columns**: Merge `chat_type` and `context_type` into single field
2. **Dynamic prompts**: Load prompts from database for easier updates
3. **Prompt versioning**: Track which prompt version was used
4. **A/B testing**: Test different prompt variations
5. **Prompt analytics**: Track which prompts perform best

### Technical Debt

- `chat_type` and `context_type` duplicate the same information
- Legacy values (`'global', 'project', 'task', 'calendar'`) may not be needed
- Some handlers have TODO placeholders for operation execution

---

## Related Documentation

- **Agent Implementation**: `/apps/web/docs/features/conversational-agent/README.md`
- **Database Schema**: `/supabase/migrations/20251028_fix_context_type_constraint.sql`
- **Type Definitions**: `/packages/shared-types/src/agent.types.ts`
- **Orchestrator Service**: `/apps/web/src/lib/services/agent-orchestrator.service.ts`
- **API Endpoint**: `/apps/web/src/routes/api/agent/stream/+server.ts`
