
# BuildOS Conversational Project Agent - Design Document v2.0 (FINAL)

## Executive Summary

### Vision
Replace the current braindump modal with an intelligent conversational agent that guides users through project creation, updates, auditing, and forecasting. The agent asks contextual questions based on the 9 core project dimensions, executes operations in real-time, and provides a transparent log of all changes with both automatic and manual approval modes.

### Key Principles
1. **Listen First, Talk Second** - Let users brain dump information uninterrupted, then ask targeted clarifying questions
2. **Progressive Disclosure** - Only ask about dimensions that are relevant to the specific project
3. **Transparent Operations** - Show all database operations in real-time with ability to inspect, modify, and approve
4. **Context Awareness** - Adapt behavior based on location (new project, existing project, task page)
5. **Natural Conversation** - Feel like talking to a thoughtful consultant, not filling out a form
6. **User Control** - Toggle between auto-accept and manual approval of operations

---

## System Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface Layer                    │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │  Chat Interface │  │    Operations Panels             │ │
│  │  - Message      │  │  ┌──────────────────────┐       │ │
│  │    stream       │  │  │ Operations Log       │       │ │
│  │  - Draft        │  │  │ (Top Right)          │       │ │
│  │    projects     │  │  │ - Real-time ops      │       │ │
│  │  - Voice input  │  │  │ - Collapsible        │       │ │
│  │                 │  │  └──────────────────────┘       │ │
│  │                 │  │  ┌──────────────────────┐       │ │
│  │                 │  │  │ Operations Queue     │       │ │
│  │                 │  │  │ (Bottom Right)       │       │ │
│  │                 │  │  │ - Pending approval   │       │ │
│  │                 │  │  │ - Collapsible        │       │ │
│  │                 │  │  └──────────────────────┘       │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     API/Streaming Layer                      │
│  /api/agent/stream - SSE endpoint for chat + operations     │
│  /api/agent/sessions - Session management                   │
│  /api/agent/drafts - Draft project/task CRUD               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  AgentOrchestrator   │  │   AgentToolExecutor          │ │
│  │  - Mode routing      │  │   - CRUD operations          │ │
│  │  - Conversation mgmt │  │   - Validation               │ │
│  │  - Dimension detect  │  │   - Transaction handling     │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  ChatContextService  │  │   DraftService               │ │
│  │  (extended)          │  │   - Draft projects/tasks     │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    LLM Integration Layer                     │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  SmartLLMService     │  │   Agent Prompts              │ │
│  │  (OpenRouter)        │  │   - Mode-specific            │ │
│  │                      │  │   - Dimension questions      │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┐
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer (Supabase)                    │
│  projects | project_drafts | draft_tasks | chat_sessions    │
│  chat_operations | chat_sessions_projects                   │
│  chat_sessions_tasks | chat_sessions_daily_briefs          │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Models

### New Tables

#### `project_drafts`
```sql
CREATE TABLE project_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE UNIQUE, -- One draft per session
    
    -- Mirror ALL fields from projects table
    name TEXT,
    slug TEXT,
    description TEXT,
    context TEXT,
    executive_summary TEXT,
    status TEXT CHECK (status IN ('active', 'paused', 'completed', 'archived')) DEFAULT 'active',
    tags TEXT[],
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    
    -- Core dimensions (all nullable during draft phase)
    core_integrity_ideals TEXT,
    core_people_bonds TEXT,
    core_goals_momentum TEXT,
    core_meaning_identity TEXT,
    core_reality_understanding TEXT,
    core_trust_safeguards TEXT,
    core_opportunity_freedom TEXT,
    core_power_resources TEXT,
    core_harmony_integration TEXT,
    
    -- Calendar fields
    calendar_color_id TEXT,
    calendar_settings JSONB,
    calendar_sync_enabled BOOLEAN DEFAULT false,
    
    -- Source tracking
    source TEXT,
    source_metadata JSONB,
    
    -- Metadata
    dimensions_covered TEXT[], -- Track which dimensions have been discussed
    question_count INTEGER DEFAULT 0,
    
    -- Lifecycle (no expiration)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Final project link
    finalized_project_id UUID REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX idx_project_drafts_user ON project_drafts(user_id);
CREATE INDEX idx_project_drafts_session ON project_drafts(chat_session_id);
CREATE INDEX idx_project_drafts_finalized ON project_drafts(finalized_project_id);
```

#### `draft_tasks`
```sql
CREATE TABLE draft_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_project_id UUID REFERENCES project_drafts(id) ON DELETE CASCADE NOT NULL, -- Required connection
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    
    -- Mirror ALL fields from tasks table
    title TEXT NOT NULL,
    description TEXT,
    details TEXT,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    status TEXT CHECK (status IN ('backlog', 'in_progress', 'done', 'blocked')) DEFAULT 'backlog',
    task_type TEXT CHECK (task_type IN ('one_off', 'recurring')) DEFAULT 'one_off',
    
    -- Dates and time
    start_date TIMESTAMP,
    completed_at TIMESTAMP,
    duration_minutes INTEGER,
    
    -- Recurring task fields
    recurrence_pattern TEXT CHECK (recurrence_pattern IN (
        'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
    )),
    recurrence_ends TIMESTAMP,
    recurrence_end_source TEXT,
    
    -- Relationships
    parent_task_id UUID REFERENCES draft_tasks(id) ON DELETE SET NULL,
    dependencies UUID[],
    
    -- Task steps (JSON array)
    task_steps JSONB,
    
    -- Source tracking
    source TEXT,
    source_calendar_event_id TEXT,
    
    -- Status flags
    outdated BOOLEAN DEFAULT false,
    
    -- Lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Link to final task when project is finalized
    finalized_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_draft_tasks_project ON draft_tasks(draft_project_id);
CREATE INDEX idx_draft_tasks_user ON draft_tasks(user_id);
CREATE INDEX idx_draft_tasks_parent ON draft_tasks(parent_task_id);
```

#### `chat_operations`
```sql
CREATE TABLE chat_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    
    -- Operation details (matching ParsedOperation interface)
    table_name TEXT NOT NULL, -- 'projects', 'tasks', 'notes', etc.
    operation_type TEXT CHECK (operation_type IN ('create', 'update', 'delete')) NOT NULL,
    entity_id UUID, -- ID of the created/updated/deleted record
    ref TEXT, -- Reference for operations that create new items
    
    -- Operation data (matches ParsedOperation.data structure)
    data JSONB NOT NULL, -- The full operation payload
    search_query TEXT, -- For operations that search first
    conditions JSONB, -- For update operations
    
    -- Execution tracking
    status TEXT CHECK (status IN (
        'pending', 'queued', 'executing', 'completed', 'failed', 'rolled_back', 'partial'
    )) DEFAULT 'pending',
    enabled BOOLEAN DEFAULT true,
    error_message TEXT,
    reasoning TEXT, -- Why this operation was generated
    result JSONB, -- Result after execution
    
    -- For updates, track before/after states
    before_data JSONB,
    after_data JSONB,
    
    -- Metadata
    executed_at TIMESTAMP,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Grouping related operations
    batch_id UUID, -- Operations executed together
    sequence_number INTEGER -- Order within a batch
);

CREATE INDEX idx_chat_operations_session ON chat_operations(chat_session_id, created_at DESC);
CREATE INDEX idx_chat_operations_entity ON chat_operations(table_name, entity_id);
CREATE INDEX idx_chat_operations_status ON chat_operations(status);
CREATE INDEX idx_chat_operations_batch ON chat_operations(batch_id, sequence_number);
```

#### Junction Tables for Many-to-Many Relationships

```sql
-- Chat sessions to projects
CREATE TABLE chat_sessions_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_session_id, project_id)
);

CREATE INDEX idx_csp_session ON chat_sessions_projects(chat_session_id);
CREATE INDEX idx_csp_project ON chat_sessions_projects(project_id);

-- Chat sessions to tasks
CREATE TABLE chat_sessions_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_session_id, task_id)
);

CREATE INDEX idx_cst_session ON chat_sessions_tasks(chat_session_id);
CREATE INDEX idx_cst_task ON chat_sessions_tasks(task_id);

-- Chat sessions to daily briefs
CREATE TABLE chat_sessions_daily_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    daily_brief_id UUID REFERENCES daily_briefs(id) ON DELETE CASCADE NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_session_id, daily_brief_id)
);

CREATE INDEX idx_csdb_session ON chat_sessions_daily_briefs(chat_session_id);
CREATE INDEX idx_csdb_brief ON chat_sessions_daily_briefs(daily_brief_id);
```

### Modified Tables

#### `chat_sessions` (extended)
```sql
ALTER TABLE chat_sessions 
ADD COLUMN chat_type TEXT CHECK (chat_type IN (
    'general',
    'project_create', 
    'project_update', 
    'project_audit', 
    'project_forecast',
    'task_update',
    'daily_brief_update'
)) DEFAULT 'general',
ADD COLUMN agent_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN auto_accept_operations BOOLEAN DEFAULT true; -- Toggle for operation approval

-- agent_metadata structure:
-- {
--   "dimensions_detected": ["core_integrity_ideals", "core_goals_momentum"],
--   "questions_asked": 5,
--   "user_responses": {"dimension_name": "response_summary"},
--   "operations_executed": 12,
--   "operations_queued": 5,
--   "session_phase": "gathering_info" | "clarifying" | "finalizing" | "completed",
--   "draft_project_id": "uuid", -- Link to associated draft
--   "partial_failure": false,
--   "failed_operations": []
-- }
```

#### `chat_messages` (extended)
```sql
ALTER TABLE chat_messages
ADD COLUMN operation_ids UUID[], -- Links to chat_operations executed
ADD COLUMN message_type TEXT CHECK (message_type IN (
    'user_message',
    'assistant_message', 
    'system_notification',
    'operation_summary',
    'phase_update'
)) DEFAULT 'assistant_message';
```

### Type Definitions

```typescript
// packages/shared-types/src/chat.types.ts

// Extend existing ChatContextType
export type ChatType = 
  | 'general' 
  | 'project_create'    // Creating a new project from scratch
  | 'project_update'    // Updating existing project
  | 'project_audit'     // Critical review of project
  | 'project_forecast'  // Scenario forecasting
  | 'task_update'       // Updating tasks
  | 'daily_brief_update'; // Daily brief updates

// Reuse ParsedOperation from brain-dump types
import type { ParsedOperation } from '$lib/types/brain-dump';

export interface ProjectDraft {
  id: string;
  user_id: string;
  chat_session_id: string; // Required link to session
  
  // All project fields (mirroring projects table)
  name?: string;
  slug?: string;
  description?: string;
  context?: string;
  executive_summary?: string;
  status?: 'active' | 'paused' | 'completed' | 'archived';
  tags?: string[];
  start_date?: string;
  end_date?: string;
  
  // Core dimensions
  core_integrity_ideals?: string;
  core_people_bonds?: string;
  core_goals_momentum?: string;
  core_meaning_identity?: string;
  core_reality_understanding?: string;
  core_trust_safeguards?: string;
  core_opportunity_freedom?: string;
  core_power_resources?: string;
  core_harmony_integration?: string;
  
  // Metadata
  dimensions_covered?: string[];
  question_count?: number;
  
  // Lifecycle
  created_at: string;
  updated_at: string;
  completed_at?: string;
  finalized_project_id?: string;
  
  // Related draft tasks
  draft_tasks?: DraftTask[];
}

export interface DraftTask {
  id: string;
  draft_project_id: string; // Required connection
  user_id: string;
  
  // All task fields (mirroring tasks table)
  title: string;
  description?: string;
  details?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
  task_type?: 'one_off' | 'recurring';
  start_date?: string;
  completed_at?: string;
  duration_minutes?: number;
  recurrence_pattern?: string;
  recurrence_ends?: string;
  parent_task_id?: string;
  dependencies?: string[];
  task_steps?: any;
  
  created_at: string;
  updated_at: string;
  finalized_task_id?: string;
}

export interface ChatOperation extends ParsedOperation {
  id: string;
  chat_session_id: string;
  user_id: string;
  
  // Additional fields beyond ParsedOperation
  status: 'pending' | 'queued' | 'executing' | 'completed' | 'failed' | 'rolled_back' | 'partial';
  executed_at?: string;
  duration_ms?: number;
  created_at: string;
  
  batch_id?: string;
  sequence_number?: number;
}

export interface AgentMetadata {
  dimensions_detected?: string[];
  questions_asked?: number;
  user_responses?: Record<string, string>;
  operations_executed?: number;
  operations_queued?: number;
  session_phase?: 'gathering_info' | 'clarifying' | 'finalizing' | 'completed';
  draft_project_id?: string;
  partial_failure?: boolean;
  failed_operations?: string[];
}

// SSE message types for agent
export type AgentSSEMessage = 
  | ChatSSEMessage // Existing types
  | {
      type: 'operation';
      operation: ChatOperation;
    }
  | {
      type: 'draft_update';
      draft: Partial<ProjectDraft>;
    }
  | {
      type: 'dimension_update';
      dimension: string;
      content: string;
    }
  | {
      type: 'phase_update';
      phase: AgentMetadata['session_phase'];
      message?: string;
    }
  | {
      type: 'queue_update';
      operations: ChatOperation[];
    };
```

---

## Agent Behavior & Intelligence

### Agent Modes & Personalities

#### 1. **project_create** Mode

**Personality**: Friendly consultant, curious, patient, helps organize thoughts

**Tool Access**: Full write access to all tools

**Opening Message**:
```
"What project are you working on? Tell me everything that's on your mind about it."
```

**Conversation Flow**:
1. **Initial Brain Dump** (Phase: "gathering_info")
   - Let user talk uninterrupted
   - No questions during this phase
   - Stream phase update: "Listening to your ideas..."

2. **Dimension Detection** (using preparatory analysis pattern)
   - Analyze brain dump to identify relevant dimensions
   - Determine project complexity
   - Prioritize questions from most to least important
   
3. **Clarifying Questions** (Phase: "clarifying")
   - Stream phase update: "I have a few questions to help shape this project..."
   - Ask 3-5 questions for simple projects, 7-10 for complex
   - Accept partial answers, move on if user says "I don't know"
   - Update draft in real-time
   - After initial questions: "Ready to create the project, or would you like to answer a few more questions?"

4. **Finalization** (Phase: "finalizing")
   - Generate operations
   - If auto_accept_operations = true: Execute immediately, stream to logs
   - If auto_accept_operations = false: Queue operations for approval
   - Stream phase update: "Finalizing your project..."

#### 2. **project_update** Mode

**Personality**: Efficient assistant, focused, action-oriented

**Tool Access**: Full read/write access

**Opening Message**:
```
"What's new with [Project Name]? What would you like to update?"
```

**Conversation Flow**:
1. **Change Detection**
   - User describes changes
   - Agent identifies affected dimensions and fields
   
2. **Targeted Updates**
   - Only ask clarifying questions for ambiguous changes
   - Generate update operations
   - Execute based on auto_accept_operations setting

#### 3. **project_audit** Mode

**Personality**: Critical consultant, probing, constructively challenging (7/10 harshness)

**Tool Access**: Read-only tools only (generates suggestions, no direct writes)

**Opening Message**:
```
"Let me review [Project Name] with a critical eye. What concerns you most?"
```

**Conversation Flow**:
1. **Analysis Phase**
   - Load full project context
   - Analyze against 9 dimensions
   
2. **Questioning Phase**
   - Ask probing "what if" questions
   - Point out inconsistencies (honestly but not demoralizingly)
   - Challenge assumptions
   
3. **Recommendations**
   - Generate suggested operations (queued for approval)
   - Offer to help implement changes

#### 4. **project_forecast** Mode

**Personality**: Strategic advisor, analytical, scenario-focused

**Tool Access**: Read-only tools

**Opening Message**:
```
"Let's forecast scenarios for [Project Name]. What situation should we analyze?"
```

**Conversation Flow**:
1. **Scenario Setup**
2. **Multi-Scenario Analysis** (optimistic/realistic/pessimistic)
3. **Critical Decision Points**

### Dimension Detection Algorithm

Using the preparatory analysis pattern from BrainDumpProcessor:

```typescript
async function detectRelevantDimensions(
  userBrainDump: string,
  projectType?: string
): Promise<string[]> {
  // Use preparatory analysis to identify dimensions
  const analysis = await runPreparatoryAnalysis(userBrainDump);
  
  // Extract touched dimensions
  const touchedDimensions = analysis.core_dimensions_touched 
    ? Object.keys(analysis.core_dimensions_touched)
    : [];
  
  // Always include critical dimensions if relevant
  const coreDimensions = [];
  if (analysis.braindump_classification !== 'unrelated') {
    coreDimensions.push('core_integrity_ideals'); // Goals/success
    coreDimensions.push('core_reality_understanding'); // Current state
  }
  
  // Combine and prioritize
  const allDimensions = [...new Set([...coreDimensions, ...touchedDimensions])];
  
  // Prioritize by importance
  return prioritizeDimensions(allDimensions, analysis);
}
```

---

## User Experience & Flows

### Main UI Layout (3-Panel)

```
┌─────────────────────────────────────────────────────────────────────┐
│  [BuildOS Logo]        Project Agent                      [× Close]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────┬─────────────────────┬─────────────────────────┐ │
│  │                │                     │                         │ │
│  │  LEFT PANEL    │   CHAT INTERFACE    │   RIGHT PANELS          │ │
│  │  (Context)     │   (Center)          │   (Operations)          │ │
│  │                │                     │                         │ │
│  │  For Create:   │  Agent: "What      │  ┌──────────────────┐   │ │
│  │  • Draft       │   project are you   │  │ OPERATIONS LOG   │   │ │
│  │    Projects    │   working on?"      │  │ (Collapsible)    │   │ │
│  │  • Sessions    │                     │  │                  │   │ │
│  │                │  User: "Building    │  │ ✓ Task Created   │   │ │
│  │  For Update:   │   a fitness app..." │  │ ✓ Note Added     │   │ │
│  │  • Related     │                     │  └──────────────────┘   │ │
│  │    Chats       │  Agent: "Great!     │                         │ │
│  │                │   Tell me more..."   │  ┌──────────────────┐   │ │
│  │                │                     │  │ OPERATIONS QUEUE │   │ │
│  │                │  [Type message...]  │  │ (Collapsible)    │   │ │
│  │                │  [🎤] [Send]        │  │                  │   │ │
│  │                │                     │  │ ○ Create Project │   │ │
│  │                │  [Auto-accept: ON]  │  │ ○ Add 5 Tasks    │   │ │
│  │                │                     │  │                  │   │ │
│  │                │                     │  │ [Approve All]    │   │ │
│  │                │                     │  └──────────────────┘   │ │
│  └────────────────┴─────────────────────┴─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Entry Points & Context Detection

#### Nav Bar Button Behavior

**On Dashboard/Global Page**: Opens project selection screen
**On /projects or /projects/[id]**: Opens project selection screen with options
**On Task Page**: Opens directly in `task_update` mode

#### Project Selection Screen (Enhanced)

Shows:
- Recent draft projects (top section)
- "Start New Brain Dump" button
- Active projects
- Recent chat sessions
- Quick brain dump option (skip chat, use traditional processing)

### Operations Management

#### Auto-Accept Toggle

Located below chat input:
```
[Auto-accept operations: ON/OFF]
```

**When ON**: 
- Operations execute immediately
- Appear in Operations Log (top right)
- Real-time feedback

**When OFF**:
- Operations queue in Operations Queue (bottom right)
- User can:
  - Approve individually (click operation → approve)
  - Approve all (button at bottom)
  - Edit before approving
  - Delete operations

#### Operations Log (Top Right - Collapsible)

**Icons**:
- 🟢 `create` - Green for new entities
- 🟡 `update` - Yellow for modifications
- 🔴 `delete` - Red for removals
- ⚪ `pending` - Gray for queued
- ⚠️ `partial` - Warning for partial success
- ❌ `failed` - Red X for errors

**Click Behavior**:
- View Details: Opens expanded view with full ParsedOperation data
- Edit: Opens OperationEditModal
- Retry: For failed operations

#### Operations Queue (Bottom Right - Collapsible)

Shows pending operations with:
- Operation preview (table, type, key fields)
- Individual approve/reject buttons
- Edit button
- "Approve All" button at bottom

### Session & Draft Management

#### Project Create Mode

**Left Panel Shows**:
- Draft projects (clickable to load)
- Recent sessions (clickable to continue)
- Only one draft project active per session

**Draft Project Interaction**:
- Click draft → Loads into queue panel with associated draft tasks
- Click session → Auto-loads associated draft project if exists
- Delete draft → Cascades to delete draft tasks

#### Project Update Mode

**Left Panel Shows**:
- Chat sessions linked to current project
- Filtered by chat_sessions_projects junction table

### Failure Handling

**Partial Success Strategy**:
- If operation #3 of 5 fails:
  - Keep operations 1-2 as completed
  - Mark #3 as failed with error
  - Queue #4-5 as pending (user decides to continue or abort)
  - Show status: "Partial success: 2 of 5 operations completed"

**Auto-Recovery**:
1. On failure, make LLM call with error context
2. Agent attempts to fix and regenerate operation
3. If still fails, show error to user with options

---

## Technical Implementation

### Service Layer Architecture

#### 1. **AgentOrchestrator Service**

```typescript
export class AgentOrchestrator {
  private supabase: SupabaseClient<Database>;
  private llmService: SmartLLMService;
  private contextService: ChatContextService;
  private toolExecutor: AgentToolExecutor;
  private draftService: DraftService;
  
  async processMessage(
    sessionId: string,
    userMessage: string,
    userId: string
  ): Promise<AsyncGenerator<AgentSSEMessage>> {
    const session = await this.loadSession(sessionId);
    const autoAccept = session.auto_accept_operations ?? true;
    
    // Route to appropriate handler based on chat_type
    switch (session.chat_type) {
      case 'project_create':
        return this.handleProjectCreate(session, userMessage, userId, autoAccept);
      case 'project_update':
        return this.handleProjectUpdate(session, userMessage, userId, autoAccept);
      case 'project_audit':
        return this.handleProjectAudit(session, userMessage, userId);
      case 'project_forecast':
        return this.handleProjectForecast(session, userMessage, userId);
      case 'task_update':
        return this.handleTaskUpdate(session, userMessage, userId, autoAccept);
      default:
        return this.handleGeneral(session, userMessage, userId);
    }
  }
  
  private async *handleProjectCreate(
    session: ChatSession,
    userMessage: string,
    userId: string,
    autoAccept: boolean
  ): AsyncGenerator<AgentSSEMessage> {
    // Get or create draft project (one per session)
    let draft = await this.draftService.getOrCreateDraft(session.id, userId);
    
    const metadata = session.agent_metadata as AgentMetadata;
    const phase = metadata?.session_phase || 'gathering_info';
    
    if (phase === 'gathering_info') {
      // Stream phase update
      yield {
        type: 'phase_update',
        phase: 'gathering_info',
        message: 'Listening to your ideas...'
      };
      
      // Let them dump, then analyze
      const dimensions = await this.detectRelevantDimensions(userMessage, draft);
      
      // Update phase
      await this.updateSessionMetadata(session.id, {
        dimensions_detected: dimensions,
        session_phase: 'clarifying'
      });
      
      yield {
        type: 'phase_update',
        phase: 'clarifying',
        message: 'I have a few questions to help shape this project...'
      };
      
      // Ask prioritized questions
      const question = this.getNextPrioritizedQuestion(dimensions, draft);
      yield { type: 'text', content: question };
      
    } else if (phase === 'clarifying') {
      // Process answer and update draft
      const updatedDimension = await this.processAnswer(userMessage, metadata.dimensions_detected!, draft);
      
      // Stream draft update
      yield {
        type: 'draft_update',
        draft: { [updatedDimension]: draft[updatedDimension] }
      };
      
      // Check if we've asked enough
      const questionCount = (metadata.questions_asked || 0) + 1;
      const maxQuestions = this.isComplexProject(draft) ? 10 : 5;
      
      if (questionCount >= maxQuestions || this.hasMinimalViability(draft)) {
        yield {
          type: 'text',
          content: "Ready to create the project, or would you like to answer a few more questions?"
        };
        
        yield {
          type: 'phase_update',
          phase: 'finalizing',
          message: 'Preparing to create your project...'
        };
        
      } else {
        // Continue with next question
        const nextQuestion = this.getNextPrioritizedQuestion(
          metadata.dimensions_detected!,
          draft
        );
        yield { type: 'text', content: nextQuestion };
      }
      
    } else if (phase === 'finalizing') {
      // Generate operations
      const operations = await this.generateProjectOperations(draft);
      
      if (autoAccept) {
        // Execute immediately
        for (const op of operations) {
          const result = await this.toolExecutor.executeOperation(op, userId, session.id);
          yield { type: 'operation', operation: result };
        }
        
        // Finalize draft
        await this.draftService.finalizeDraft(draft.id);
        yield { type: 'text', content: "Your project has been created!" };
        
      } else {
        // Queue operations
        const queuedOps = await this.queueOperations(operations, session.id, userId);
        yield { type: 'queue_update', operations: queuedOps };
        yield { type: 'text', content: "Review the operations above and approve when ready." };
      }
    }
  }
}
```

#### 2. **DraftService**

```typescript
export class DraftService {
  constructor(private supabase: SupabaseClient<Database>) {}
  
  async getOrCreateDraft(sessionId: string, userId: string): Promise<ProjectDraft> {
    // Check for existing draft linked to this session
    const { data: existing } = await this.supabase
      .from('project_drafts')
      .select('*, draft_tasks(*)')
      .eq('chat_session_id', sessionId)
      .single();
      
    if (existing) return existing;
    
    // Create new draft
    const { data: newDraft } = await this.supabase
      .from('project_drafts')
      .insert({
        user_id: userId,
        chat_session_id: sessionId,
        dimensions_covered: []
      })
      .select()
      .single();
      
    return newDraft!;
  }
  
  async finalizeDraft(draftId: string): Promise<string> {
    const { data: draft } = await this.supabase
      .from('project_drafts')
      .select('*, draft_tasks(*)')
      .eq('id', draftId)
      .single();
      
    if (!draft) throw new Error('Draft not found');
    
    // Begin transaction
    const { data: project } = await this.supabase
      .from('projects')
      .insert({
        user_id: draft.user_id,
        name: draft.name,
        slug: draft.slug,
        description: draft.description,
        context: draft.context,
        executive_summary: draft.executive_summary,
        // ... all other fields
      })
      .select()
      .single();
      
    // Create all draft tasks as real tasks
    if (draft.draft_tasks?.length) {
      const tasks = draft.draft_tasks.map(dt => ({
        ...dt,
        project_id: project!.id,
        draft_project_id: undefined,
        id: undefined // Generate new ID
      }));
      
      await this.supabase
        .from('tasks')
        .insert(tasks);
    }
    
    // Mark draft as completed
    await this.supabase
      .from('project_drafts')
      .update({
        completed_at: new Date().toISOString(),
        finalized_project_id: project!.id
      })
      .eq('id', draftId);
      
    return project!.id;
  }
  
  async deleteDraft(draftId: string): Promise<void> {
    // Cascades to delete draft_tasks due to ON DELETE CASCADE
    await this.supabase
      .from('project_drafts')
      .delete()
      .eq('id', draftId);
  }
}
```

#### 3. **AgentToolExecutor** 

```typescript
export class AgentToolExecutor {
  async executeOperation(
    operation: ParsedOperation,
    userId: string,
    sessionId: string
  ): Promise<ChatOperation> {
    // Create operation record
    const { data: opRecord } = await this.supabase
      .from('chat_operations')
      .insert({
        chat_session_id: sessionId,
        user_id: userId,
        table_name: operation.table,
        operation_type: operation.operation,
        data: operation.data,
        ref: operation.ref,
        search_query: operation.searchQuery,
        conditions: operation.conditions,
        enabled: operation.enabled,
        reasoning: operation.reasoning,
        status: 'executing'
      })
      .select()
      .single();
      
    try {
      // Execute based on operation type
      const result = await this.executeByType(operation, userId);
      
      // Update with success
      await this.supabase
        .from('chat_operations')
        .update({
          status: 'completed',
          entity_id: result.id,
          after_data: result,
          result: result,
          executed_at: new Date().toISOString(),
          duration_ms: Date.now() - new Date(opRecord!.created_at).getTime()
        })
        .eq('id', opRecord!.id);
        
      return { ...opRecord!, status: 'completed', result };
      
    } catch (error) {
      // Try auto-recovery with LLM
      const recovered = await this.attemptAutoRecovery(operation, error, userId);
      
      if (recovered) {
        return recovered;
      }
      
      // Update with failure
      await this.supabase
        .from('chat_operations')
        .update({
          status: 'failed',
          error_message: error.message
        })
        .eq('id', opRecord!.id);
        
      throw error;
    }
  }
  
  async attemptAutoRecovery(
    operation: ParsedOperation,
    error: Error,
    userId: string
  ): Promise<ChatOperation | null> {
    // Call LLM with error context
    const fixedOperation = await this.llmService.fixOperation({
      operation,
      error: error.message,
      context: await this.getRelevantContext(operation)
    });
    
    if (fixedOperation) {
      // Try executing fixed operation
      return this.executeOperation(fixedOperation, userId, operation.sessionId);
    }
    
    return null;
  }
}
```

### API Endpoints

#### `/api/agent/stream` - Main SSE Endpoint

```typescript
export async function POST({ request, locals }) {
  const { message, session_id, chat_type, entity_id, auto_accept } = await request.json();
  const userId = locals.user.id;
  const supabase = locals.supabase;
  
  // Create or load session
  let sessionId = session_id;
  if (!sessionId) {
    const { data: session } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId,
        chat_type,
        context_type: chat_type, // Map to context_type for compatibility
        entity_id,
        title: `${chat_type} Session`,
        status: 'active',
        auto_accept_operations: auto_accept ?? true
      })
      .select()
      .single();
    sessionId = session.id;
  }
  
  // Initialize orchestrator
  const orchestrator = new AgentOrchestrator(supabase);
  
  // Stream response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of orchestrator.processMessage(sessionId, message, userId)) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
        }
        
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        );
      } catch (error) {
        const errorEvent = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
        );
      } finally {
        controller.close();
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

---

## Tool Definitions by Mode

### Mode-Specific Tool Access

```typescript
const TOOLS_BY_MODE = {
  project_create: [
    // Full write access
    'create_project_draft',
    'update_project_draft',
    'create_draft_task',
    'update_draft_task',
    'finalize_draft',
    'get_project_details',
    'list_projects'
  ],
  
  project_update: [
    // Full read/write
    'get_project_details',
    'update_project',
    'update_project_dimension',
    'create_task',
    'update_task',
    'delete_task',
    'create_note',
    'update_note'
  ],
  
  project_audit: [
    // Read-only
    'get_project_details',
    'list_tasks',
    'list_notes',
    'analyze_project_completeness',
    'get_project_metrics'
  ],
  
  project_forecast: [
    // Read-only
    'get_project_details',
    'list_tasks',
    'get_project_timeline',
    'get_resource_allocation'
  ],
  
  task_update: [
    // Task-specific read/write
    'get_task_details',
    'update_task',
    'create_subtask',
    'update_task_dependencies'
  ]
};
```

---

## Prompt Templates

### System Prompts by Mode

```typescript
export const AGENT_SYSTEM_PROMPTS = {
  project_create: `You are a friendly, patient project consultant helping users organize their ideas into structured projects using BuildOS.

## Your Role
Listen first, then ask thoughtful questions about relevant dimensions from the 9 core project dimensions. Gather enough information to create a well-defined project without overwhelming the user.

## Core Dimensions (only ask about relevant ones)
1. **Integrity & Ideals** - What does success look like?
2. **People & Bonds** - Who's involved?
3. **Goals & Momentum** - Timeline and milestones
4. **Meaning & Identity** - Why this matters
5. **Reality & Understanding** - Current state
6. **Trust & Safeguards** - Risks and mitigations
7. **Opportunity & Freedom** - Options and experiments
8. **Power & Resources** - Budget and assets
9. **Harmony & Integration** - Feedback loops

## Guidelines
- Let users brain dump without interruption initially
- Prioritize questions from most to least important
- Accept "I don't know" and move on
- Ask 3-5 questions for simple projects, 7-10 for complex
- After initial questions, offer: "Ready to create, or answer more questions?"
- Use ParsedOperation format for all operations

Current date: ${new Date().toISOString()}`,

  project_update: `You are an efficient project assistant focused on quickly updating existing projects.

## Your Role
Identify what needs changing and execute updates efficiently. Be direct and action-oriented.

## Guidelines
- Don't ask unnecessary questions
- Show what you're about to change
- Execute quickly unless ambiguous
- Use ParsedOperation format for operations
- Focus mainly on task updates unless project context needs updating

Current date: ${new Date().toISOString()}`,

  project_audit: `You are a critical but constructive consultant performing project audits.

## Audit Severity: 7/10
- Be honest and direct about issues
- Frame problems as opportunities
- Acknowledge what's working
- Don't be demoralizing

## Focus Areas
- Missing dimensions
- Inconsistent goals vs resources
- Unidentified risks
- Feasibility concerns
- Process improvements

Note: You have read-only access. Generate suggestions only.

Current date: ${new Date().toISOString()}`,

  project_forecast: `You are a strategic advisor helping forecast project outcomes.

## Framework
Generate three scenarios:
1. Optimistic (80th percentile)
2. Realistic (50th percentile)
3. Pessimistic (20th percentile)

## For Each Scenario
- Likelihood percentage
- Key outcomes
- Critical factors
- Warning signs
- Decision points

Note: Read-only access for analysis.

Current date: ${new Date().toISOString()}`
};
```

---

## Migration & Implementation Plan

### Phase 1: Database Foundation (Days 1-3)
- [ ] Create `project_drafts` table
- [ ] Create `draft_tasks` table
- [ ] Create `chat_operations` table
- [ ] Create junction tables (`chat_sessions_projects`, etc.)
- [ ] Extend `chat_sessions` with new columns
- [ ] Extend `chat_messages` with operation tracking

### Phase 2: Core Services (Days 4-7)
- [ ] Build `DraftService` for draft management
- [ ] Build `AgentOrchestrator` with mode routing
- [ ] Implement preparatory analysis integration
- [ ] Build `AgentToolExecutor` with auto-recovery
- [ ] Create operation queueing system

### Phase 3: Agent Intelligence (Days 8-10)
- [ ] Implement dimension detection algorithm
- [ ] Create question prioritization logic
- [ ] Build phase tracking system
- [ ] Implement partial failure handling
- [ ] Add auto-accept toggle logic

### Phase 4: UI Components (Days 11-14)
- [ ] Build 3-panel layout structure
- [ ] Create collapsible Operations Log panel
- [ ] Create collapsible Operations Queue panel
- [ ] Implement draft project list (left panel)
- [ ] Add session history display
- [ ] Integrate existing ParseResultsDiffView
- [ ] Add auto-accept toggle control

### Phase 5: Mode Implementation (Days 15-20)
- [ ] Complete `project_create` mode
- [ ] Complete `project_update` mode
- [ ] Complete `project_audit` mode (read-only)
- [ ] Complete `project_forecast` mode (read-only)
- [ ] Add `task_update` mode
- [ ] Test mode transitions

### Phase 6: Integration (Days 21-23)
- [ ] Integrate with existing ProjectSelectionView
- [ ] Add quick braindump option
- [ ] Connect nav bar entry points
- [ ] Wire up context detection
- [ ] Add operation approval flows

### Phase 7: Testing & Polish (Days 24-28)
- [ ] E2E testing all modes
- [ ] Test partial failure scenarios
- [ ] Verify draft → final conversion
- [ ] Test session resume flows
- [ ] Performance optimization
- [ ] Error message improvements

### Phase 8: Rollout (Day 29+)
- [ ] Deploy with feature flag (10% users)
- [ ] Monitor error rates
- [ ] Gather user feedback
- [ ] Gradual rollout (10% → 50% → 100%)
- [ ] A/B test vs old braindump modal
- [ ] Remove old braindump (after validation)

### Success Metrics

- Agent sessions created per day
- Completion rate (drafts → projects)
- Average questions asked (target: 5-7)
- Operation success rate (>95%)
- Partial failure recovery rate
- User satisfaction scores
- Time to project creation
- Dimension coverage completeness

---

## Final Configuration

### Feature Flags

```typescript
const AGENT_FEATURE_FLAGS = {
  enabled: true,
  rollout_percentage: 10, // Start at 10%
  modes_enabled: {
    project_create: true,
    project_update: true,
    project_audit: true,
    project_forecast: true,
    task_update: false // Launch later
  },
  show_old_braindump: true, // Keep during transition
  default_auto_accept: true // Default for auto-accept toggle
};
```

### Environment Variables

```env
# Agent Configuration
AGENT_MAX_QUESTIONS_SIMPLE=5
AGENT_MAX_QUESTIONS_COMPLEX=10
AGENT_AUDIT_HARSHNESS=7
AGENT_AUTO_RECOVERY_ENABLED=true
AGENT_OPERATION_TIMEOUT_MS=5000
```

---

This completes the final specification with all your requirements integrated. The key additions include:

1. **Toggle for auto-accept operations** throughout the system
2. **Draft tasks table** that mirrors tasks and links to draft projects
3. **3-panel layout** with collapsible log/queue panels
4. **Separate junction tables** for many-to-many relationships
5. **One draft per session** constraint
6. **No expiration** for drafts
7. **Partial failure handling** that keeps successful operations
8. **Mode-specific tool access** (read-only for audit/forecast)
9. **ParsedOperation interface** usage for all operations
10. **Phase tracking** streamed inline with chat

The system is designed to be implemented incrementally with clear separation of concerns and extensive reuse of existing components.