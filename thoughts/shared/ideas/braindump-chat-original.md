# BuildOS Conversational Project Agent - Design Document v1.0

## Executive Summary

### Vision

Replace the current braindump modal with an intelligent conversational agent that guides users through project creation, updates, auditing, and forecasting. The agent asks contextual questions based on the 9 core project dimensions, executes operations in real-time, and provides a transparent log of all changes.

### Key Principles

1. **Listen First, Talk Second** - Let users brain dump information uninterrupted, then ask targeted clarifying questions
2. **Progressive Disclosure** - Only ask about dimensions that are relevant to the specific project
3. **Transparent Operations** - Show all database operations in real-time with ability to inspect and modify
4. **Context Awareness** - Adapt behavior based on location (new project, existing project, task page)
5. **Natural Conversation** - Feel like talking to a thoughtful consultant, not filling out a form

---

## System Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface Layer                    │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │   Chat Interface     │  │    Operations Log Panel      │ │
│  │  - Message stream    │  │  - Real-time operations      │ │
│  │  - Input with voice  │  │  - Click to inspect/edit     │ │
│  │  - Mode selection    │  │  - Status indicators         │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     API/Streaming Layer                      │
│  /api/agent/stream - SSE endpoint for chat + operations     │
│  /api/agent/sessions - Session management                   │
│  /api/agent/drafts - Draft project CRUD                     │
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
│  │  ChatContextService  │  │   DraftProjectService        │ │
│  │  (extended)          │  │   - Draft CRUD               │ │
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
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer (Supabase)                    │
│  projects | project_drafts | chat_sessions | chat_messages  │
│  chat_operations | tasks | notes | brain_dumps              │
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
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,

    -- Project fields (mirrors projects table structure)
    name TEXT,
    slug TEXT,
    description TEXT,
    context TEXT,
    executive_summary TEXT,

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

    -- Metadata
    status TEXT CHECK (status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress',
    dimensions_covered TEXT[], -- Track which dimensions have been discussed
    question_count INTEGER DEFAULT 0,
    tags TEXT[],

    -- Lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),

    -- Final project link
    finalized_project_id UUID REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX idx_project_drafts_user_status ON project_drafts(user_id, status);
CREATE INDEX idx_project_drafts_chat_session ON project_drafts(chat_session_id);
CREATE INDEX idx_project_drafts_expires ON project_drafts(expires_at) WHERE status = 'in_progress';
```

#### `chat_operations`

```sql
CREATE TABLE chat_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Operation details
    operation_type TEXT NOT NULL, -- 'create', 'update', 'delete'
    table_name TEXT NOT NULL, -- 'projects', 'tasks', 'notes', etc.
    entity_id UUID, -- ID of the created/updated/deleted record

    -- Operation data
    operation_data JSONB NOT NULL, -- The full operation payload
    before_data JSONB, -- For updates, the state before
    after_data JSONB, -- For updates/creates, the state after

    -- Execution status
    status TEXT CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'rolled_back')) DEFAULT 'pending',
    error_message TEXT,

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
```

### Modified Tables

#### `chat_sessions` (extended)

```sql
-- Add new columns via migration
ALTER TABLE chat_sessions
ADD COLUMN chat_type TEXT CHECK (chat_type IN (
    'general',
    'project_create',
    'project_update',
    'project_audit',
    'project_forecast',
    'task_update'
)) DEFAULT 'general',
ADD COLUMN draft_project_id UUID REFERENCES project_drafts(id) ON DELETE SET NULL,
ADD COLUMN agent_metadata JSONB DEFAULT '{}'::jsonb;

-- agent_metadata structure:
-- {
--   "dimensions_detected": ["core_integrity_ideals", "core_goals_momentum"],
--   "questions_asked": 5,
--   "user_responses": {"dimension_name": "response_summary"},
--   "operations_executed": 12,
--   "session_phase": "gathering_info" | "clarifying" | "finalizing"
-- }
```

#### `chat_messages` (extended for operations)

```sql
-- Add new columns
ALTER TABLE chat_messages
ADD COLUMN operation_ids UUID[], -- Links to chat_operations executed in this message
ADD COLUMN message_type TEXT CHECK (message_type IN (
    'user_message',
    'assistant_message',
    'system_notification',
    'operation_summary'
)) DEFAULT 'assistant_message';
```

### Extended Type Definitions

```typescript
// packages/shared-types/src/chat.types.ts

// Extend existing ChatContextType
export type ChatContextType =
	| 'global'
	| 'project'
	| 'task'
	| 'calendar'
	| 'project_create' // NEW: Creating a new project from scratch
	| 'project_update' // NEW: Updating existing project
	| 'project_audit' // NEW: Critical review of project
	| 'project_forecast'; // NEW: Scenario forecasting

export type ChatType = ChatContextType; // Alias for clarity

// Agent-specific types
export interface ProjectDraft {
	id: string;
	user_id: string;
	chat_session_id?: string;

	// Project fields
	name?: string;
	slug?: string;
	description?: string;
	context?: string;
	executive_summary?: string;

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
	status: 'in_progress' | 'completed' | 'abandoned';
	dimensions_covered?: string[];
	question_count?: number;
	tags?: string[];

	// Lifecycle
	created_at: string;
	updated_at: string;
	completed_at?: string;
	expires_at: string;
	finalized_project_id?: string;
}

export interface ChatOperation {
	id: string;
	chat_session_id: string;
	user_id: string;

	operation_type: 'create' | 'update' | 'delete';
	table_name: string;
	entity_id?: string;

	operation_data: any;
	before_data?: any;
	after_data?: any;

	status: 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back';
	error_message?: string;

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
	session_phase?: 'gathering_info' | 'clarifying' | 'finalizing' | 'completed';
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
			type: 'session_phase';
			phase: AgentMetadata['session_phase'];
	  };
```

---

## Agent Behavior & Intelligence

### Agent Modes & Personalities

#### 1. **project_create** Mode

**Personality**: Friendly consultant, curious, patient, helps organize thoughts

**Opening Message**:

```
"Hey! Let's create something together. What project are you working on?

Feel free to brain dump everything that's on your mind - I'll help you organize it."
```

**Conversation Flow**:

1. **Initial Brain Dump** (0-2 minutes)
    - Let user talk uninterrupted
    - No questions during this phase
    - Just acknowledge: "Got it, tell me more..."

2. **Dimension Detection** (behind the scenes)
    - Use preparatory analysis pattern to identify relevant dimensions
    - Determine project complexity (simple 3-4 dimensions, complex 7-9 dimensions)
3. **Clarifying Questions** (iterative)
    - Ask about detected dimensions one at a time
    - Accept partial answers gracefully
    - Max 3-5 questions for simple projects, 7-10 for complex
    - After each answer, update draft in real-time

4. **Finalization**
    - Agent: "I think we have a solid foundation. Ready to create your project?"
    - User can say "yes" or "ask me about X"
    - Show draft preview with button to finalize

**Dimension Question Examples**:

```typescript
const DIMENSION_QUESTIONS = {
	core_integrity_ideals: [
		'What does success look like for this project?',
		'What are your quality standards or non-negotiables?',
		"How will you know when it's done?"
	],
	core_people_bonds: [
		'Who else is involved in this?',
		'Are there stakeholders or team members I should know about?',
		'Who do you need to keep in the loop?'
	],
	core_goals_momentum: [
		'What are your key milestones?',
		"What's your timeline looking like?",
		'Any specific deadlines or delivery dates?'
	],
	core_meaning_identity: [
		'Why does this project matter to you?',
		'What makes this unique or different?',
		'How does this fit into your bigger picture?'
	],
	core_reality_understanding: [
		"What's the current situation?",
		'What problem are you solving?',
		'What constraints are you working with?'
	],
	core_trust_safeguards: [
		'What could go wrong?',
		'What risks are you concerned about?',
		"What's your backup plan if things don't go as expected?"
	],
	core_opportunity_freedom: [
		'What options are you considering?',
		"Any alternative approaches you're thinking about?",
		'What experiments might you want to run?'
	],
	core_power_resources: [
		'What budget or resources do you have?',
		'What tools or team members are available?',
		'Any constraints on time or money?'
	],
	core_harmony_integration: [
		'How will you track progress?',
		'What feedback loops are important?',
		'How does this integrate with your other work?'
	]
};
```

**Agent Intelligence**:

- Use natural language variations of questions (not robotic)
- Skip dimensions that user already covered
- If user says "I don't know" → "That's okay, we can figure that out later"
- Track question count to avoid overwhelm

#### 2. **project_update** Mode

**Personality**: Efficient assistant, focused, action-oriented

**Opening Message**:

```
"What's new with [Project Name]?

Tell me what you'd like to update and I'll handle it."
```

**Conversation Flow**:

1. **Change Detection**
    - User describes what changed
    - Agent identifies affected dimensions and fields
2. **Targeted Updates**
    - Only ask clarifying questions for ambiguous changes
    - Execute updates immediately with user confirmation
3. **Summary**
    - "Updated 3 tasks, added notes to strategy section. Anything else?"

**Example Interaction**:

```
User: "We decided to push the launch date to Q3 and add a mobile app"

Agent: "Got it. I'm updating:
  • End date → September 30, 2025 (Q3)
  • Adding new milestone: Mobile app development

  Should I also update any existing task dates based on the new timeline?"
```

#### 3. **project_audit** Mode

**Personality**: Critical consultant, probing, constructively challenging

**Opening Message**:

```
"Let me review [Project Name] with a critical eye.

I'll look for gaps, risks, and areas that might need more thought. What concerns you most?"
```

**Conversation Flow**:

1. **Analysis Phase**
    - Load full project context
    - Analyze against 9 dimensions
    - Identify missing information
2. **Questioning Phase**
    - Ask probing "what if" questions
    - Point out inconsistencies
    - Challenge assumptions (gently but directly)
3. **Recommendations**
    - Summarize findings
    - Suggest improvements
    - Offer to help implement changes

**Example Questions**:

```
"I notice you have ambitious goals but limited resources in your plan. How will you prioritize when resources get tight?"

"Your success metrics focus on output, but what about impact? How will you measure actual value delivered?"

"You mention several risks but no mitigation strategies. What's your plan if the biggest risk actually happens?"
```

**Audit Harshness Level**: **7/10** (Honest and direct, but not demoralizing)

- Point out real issues without sugar-coating
- Frame as opportunities for improvement
- Acknowledge what's working well too
- End on constructive note

#### 4. **project_forecast** Mode

**Personality**: Strategic advisor, analytical, scenario-focused

**Opening Message**:

```
"Let's forecast how [Project Name] might unfold.

What situation or decision point should we analyze?"
```

**Conversation Flow**:

1. **Scenario Setup**
    - User describes situation/decision
    - Agent clarifies variables and assumptions
2. **Multi-Scenario Analysis**
    - Optimistic scenario (80th percentile)
    - Realistic scenario (50th percentile)
    - Pessimistic scenario (20th percentile)
3. **Insights & Recommendations**
    - Key factors for success
    - Warning signs to watch for
    - Suggested contingency plans

**Example Output**:

```
Based on your current trajectory, here are three scenarios:

**Optimistic (30% chance):**
Launch by Q2, hit 1K users in first month, early profitability.
Key enablers: Marketing campaign succeeds, no major technical issues.

**Realistic (50% chance):**
Launch slips to Q3, steady growth to 500 users, break-even by year-end.
Likely path: Some delays, iterative improvements, word-of-mouth growth.

**Pessimistic (20% chance):**
Launch Q4, slow adoption, pivot required within 6 months.
Risk factors: Market not ready, technical debt slows feature development.

Critical decision point: After 2 months, if you're below 200 users, consider pivoting messaging or target audience.
```

### Dimension Detection Algorithm

**Core Logic** (pseudocode):

```typescript
async function detectRelevantDimensions(
	userBrainDump: string,
	projectType?: string
): Promise<string[]> {
	// 1. Use lightweight LLM call to analyze brain dump
	const analysis = await llmService.getJSONResponse({
		systemPrompt: DIMENSION_DETECTION_PROMPT,
		userPrompt: userBrainDump,
		profile: 'fast'
	});

	// 2. Score each dimension
	const dimensionScores = analysis.dimension_relevance; // 0-10 for each

	// 3. Filter by threshold
	const relevantDimensions = Object.entries(dimensionScores)
		.filter(([_, score]) => score >= 6)
		.map(([dimension]) => dimension);

	// 4. Always include core 3 dimensions
	const coreDimensions = [
		'core_integrity_ideals', // Always ask about goals/success
		'core_reality_understanding', // Always ask about current state
		'core_goals_momentum' // Always ask about timeline
	];

	return [...new Set([...coreDimensions, ...relevantDimensions])];
}
```

**Dimension Detection Prompt**:

```
Analyze this project description and rate how relevant each dimension is (0-10):

Brain dump: {userBrainDump}

For each dimension, consider:
- Was it explicitly mentioned?
- Is it critical for this type of project?
- Would asking about it add significant value?

Rate 0-10 where:
10 = Critical and must be discussed
7-9 = Important and should be discussed
4-6 = Nice to have, discuss if time permits
0-3 = Not relevant for this project

Return JSON with dimension scores.
```

---

## User Experience & Flows

### Entry Points

#### 1. **Nav Bar Button** (Always Visible)

```
┌─────────────────────────────────────────┐
│  [Logo]  Projects  Tasks  Calendar      │
│                                    [💭]  │  ← New agent button
└─────────────────────────────────────────┘
```

**Click Behavior**:

- **On Dashboard/Global Page**: Opens modal in `project_create` mode
- **On Project Detail Page**: Shows context menu with 3 options
    - "Update Project"
    - "Audit Project"
    - "Forecast Scenarios"
- **On Task Page**: Opens in `task_update` mode (future)

#### 2. **Project Page Context Menu**

```
╔════════════════════════════════╗
║  Work with AI on this project  ║
╠════════════════════════════════╣
║  📝 Update Project             ║
║  Ask questions, make changes   ║
║                                ║
║  🔍 Audit Project              ║
║  Critical review & gaps        ║
║                                ║
║  🔮 Forecast Scenarios         ║
║  Predict outcomes & risks      ║
╚════════════════════════════════╝
```

### Main UI Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [BuildOS Logo]        Project Agent                      [× Close]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────┬──────────────────────────────────┐ │
│  │                             │                                  │ │
│  │   CHAT INTERFACE            │   OPERATIONS LOG                 │ │
│  │   (65% width)               │   (35% width)                    │ │
│  │                             │                                  │ │
│  │  Agent: "What project are   │  🟢 Draft Created                │ │
│  │   you working on?"          │     Project Draft #d8f7          │ │
│  │                             │     Just now                     │ │
│  │  User: "Building a mobile   │                                  │ │
│  │   app for fitness..."       │  🟡 Dimension Updated            │ │
│  │                             │     core_integrity_ideals        │ │
│  │  Agent: "Great! Tell me     │     2 minutes ago                │ │
│  │   more about your goals..." │                                  │ │
│  │                             │  🟢 Task Created                 │ │
│  │                             │     "Design wireframes"          │ │
│  │  ┌───────────────────────┐  │     5 minutes ago                │ │
│  │  │ [Type message...]     │  │                                  │ │
│  │  │ [🎤] [Send]           │  │  [Show all operations →]         │ │
│  │  └───────────────────────┘  │                                  │ │
│  └─────────────────────────────┴──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Operations Log Panel

**Operation Types & Icons**:

- 🟢 `create` - Green for new entities
- 🟡 `update` - Yellow for modifications
- 🔴 `delete` - Red for removals
- ⚪ `pending` - Gray for queued operations
- ❌ `failed` - Red X for errors

**Operation Card Structure**:

```
┌──────────────────────────────────────┐
│ 🟢 Task Created                      │
│                                      │
│ Title: Design wireframes            │
│ Project: Fitness App                │
│ Priority: High                      │
│ Start Date: 2025-11-05              │
│                                      │
│ [View Details] [Edit] [Undo]        │
│ 5 minutes ago                       │
└──────────────────────────────────────┘
```

**Click Behavior**:

- **View Details**: Opens expanded view with full before/after data
- **Edit**: Opens `OperationEditModal` (reuse existing component)
- **Undo**: Rolls back operation (if possible)

### Operation Detail Modal

Reuse and extend existing `ParseResultsDiffView` component:

```typescript
<OperationDetailModal
  operation={selectedOperation}
  showDiff={operation.operation_type === 'update'}
  onEdit={() => openEditModal(operation)}
  onUndo={() => handleUndo(operation)}
/>
```

**For Update Operations**:
Show side-by-side diff:

```
┌─────────────────────────────────────────────────────────┐
│  Task Update: Design wireframes                        │
├───────────────────────┬─────────────────────────────────┤
│  BEFORE               │  AFTER                          │
├───────────────────────┼─────────────────────────────────┤
│  Priority: Medium     │  Priority: High                 │
│  Start: 2025-11-10    │  Start: 2025-11-05              │
│  Duration: 60min      │  Duration: 120min               │
│  Status: backlog      │  Status: in_progress            │
└───────────────────────┴─────────────────────────────────┘
```

**For Create Operations**:
Show created entity with all fields:

```
┌──────────────────────────────────────────────────────────┐
│  Project Created: Fitness App                            │
├──────────────────────────────────────────────────────────┤
│  Name: Fitness App MVP                                   │
│  Status: active                                          │
│  Start: 2025-11-01                                       │
│  End: 2026-02-28                                         │
│                                                          │
│  Description:                                            │
│  Mobile fitness tracking app with social features        │
│  and gamification...                                     │
│                                                          │
│  Core Dimensions Defined:                               │
│  ✓ Integrity & Ideals                                   │
│  ✓ Goals & Momentum                                     │
│  ✓ Reality & Understanding                              │
└──────────────────────────────────────────────────────────┘
```

### Conversation Flow Visualization

#### Project Creation Flow

```
User Action                Agent Response              Operations Log
─────────────────────────────────────────────────────────────────────
                          "What project are you
                           working on?"

"Building a fitness app    "Great! Tell me              🟢 Draft Created
 for tracking workouts..." everything on your mind"         #d8f7a

[continues talking]        [listens silently]

                          "Got it! Let me clarify...   🟡 Draft Updated
                           What does success look           core_reality
                           like for this?"

"Get 1000 users in        [analyzes response]          🟡 Draft Updated
 first 3 months"                                            core_integrity

                          "Who else is working
                           on this with you?"

"Just me for now"         [updates people dimension]   🟡 Draft Updated
                                                            core_people

                          "I think we have enough!     🟢 Project Created
                           Ready to create?"                "Fitness App MVP"

"Yes!"                    [executes operations]        🟢 5 Tasks Created

                          "All set! Your project is
                           ready. Want to add tasks?"
```

### Session Management

**Active Session Detection**:

```typescript
// When user clicks agent button
async function handleAgentOpen(context: PageContext) {
	// Check for active draft sessions
	const activeDraft = await getActiveDraft(userId);

	if (activeDraft && context.type === 'project_create') {
		// Show resume dialog
		showResumeDialog({
			draft: activeDraft,
			onResume: () => loadDraftSession(activeDraft),
			onStartFresh: () => abandonDraft(activeDraft)
		});
	} else {
		// Start new session
		createNewAgentSession(context);
	}
}
```

**Resume Dialog**:

```
┌─────────────────────────────────────────┐
│  Continue Previous Session?             │
├─────────────────────────────────────────┤
│  You have an in-progress project:       │
│                                         │
│  📝 "Fitness App MVP"                   │
│     Last edited: 2 hours ago            │
│     Progress: 4/9 dimensions covered    │
│                                         │
│  [Continue Session]  [Start Fresh]     │
└─────────────────────────────────────────┘
```

**Browser Close Handling**:

```typescript
// Auto-save on page unload
window.addEventListener('beforeunload', async (e) => {
	if (hasUnsavedChanges && activeDraftId) {
		await saveDraftState(activeDraftId);
		// Don't show confirmation - just save silently
	}
});

// Resume on next visit
onMount(async () => {
	const recentDraft = await getMostRecentDraft(userId);
	if (recentDraft && isRecent(recentDraft.updated_at, 24 * 60)) {
		// Offer to resume if edited in last 24h
		showResumePrompt(recentDraft);
	}
});
```

---

## Technical Implementation

### Service Layer Architecture

#### 1. **AgentOrchestrator Service**

Main orchestrator that routes to appropriate mode and manages conversation flow.

```typescript
// apps/web/src/lib/services/agent-orchestrator.service.ts

export class AgentOrchestrator {
  private supabase: SupabaseClient<Database>;
  private llmService: SmartLLMService;
  private contextService: ChatContextService;
  private toolExecutor: AgentToolExecutor;
  private draftService: DraftProjectService;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
    this.llmService = new SmartLLMService({...});
    this.contextService = new ChatContextService(supabase);
    this.toolExecutor = new AgentToolExecutor(supabase);
    this.draftService = new DraftProjectService(supabase);
  }

  /**
   * Main entry point - handles incoming user message
   * Routes to appropriate mode handler
   */
  async processMessage(
    sessionId: string,
    userMessage: string,
    userId: string
  ): Promise<AsyncGenerator<AgentSSEMessage>> {
    // Load session and determine mode
    const session = await this.loadSession(sessionId);
    const chatType = session.chat_type;

    // Route to appropriate handler
    switch (chatType) {
      case 'project_create':
        return this.handleProjectCreate(session, userMessage, userId);
      case 'project_update':
        return this.handleProjectUpdate(session, userMessage, userId);
      case 'project_audit':
        return this.handleProjectAudit(session, userMessage, userId);
      case 'project_forecast':
        return this.handleProjectForecast(session, userMessage, userId);
      default:
        return this.handleGeneral(session, userMessage, userId);
    }
  }

  /**
   * Project Creation Mode Handler
   */
  private async *handleProjectCreate(
    session: ChatSession,
    userMessage: string,
    userId: string
  ): AsyncGenerator<AgentSSEMessage> {
    // Load or create draft
    let draft = await this.draftService.getOrCreateDraft(
      session.draft_project_id,
      userId,
      session.id
    );

    // Determine session phase
    const metadata = session.agent_metadata as AgentMetadata;
    const phase = metadata?.session_phase || 'gathering_info';

    if (phase === 'gathering_info') {
      // Initial brain dump phase - just listen and acknowledge
      yield {
        type: 'text',
        content: this.generateAcknowledgment(userMessage)
      };

      // Run dimension detection in background
      const dimensions = await this.detectRelevantDimensions(userMessage, draft);

      // Update session metadata
      await this.updateSessionMetadata(session.id, {
        dimensions_detected: dimensions,
        session_phase: 'clarifying'
      });

      yield {
        type: 'session_phase',
        phase: 'clarifying'
      };

      // Ask first clarifying question
      const question = this.getNextDimensionQuestion(dimensions, draft);
      yield {
        type: 'text',
        content: question
      };

    } else if (phase === 'clarifying') {
      // Process user's answer and update draft
      const updatedDimension = await this.processAnswer(
        userMessage,
        metadata.dimensions_detected!,
        draft
      );

      // Stream draft update
      yield {
        type: 'draft_update',
        draft: { [updatedDimension]: draft[updatedDimension] }
      };

      // Check if we have enough information
      const isComplete = this.checkCompleteness(draft, metadata);

      if (isComplete) {
        // Move to finalization
        yield {
          type: 'text',
          content: "I think we have a solid foundation! Ready to create your project?"
        };

        yield {
          type: 'session_phase',
          phase: 'finalizing'
        };

        await this.updateSessionMetadata(session.id, {
          session_phase: 'finalizing'
        });

      } else {
        // Ask next question
        const nextQuestion = this.getNextDimensionQuestion(
          metadata.dimensions_detected!,
          draft
        );

        yield {
          type: 'text',
          content: nextQuestion
        };
      }

    } else if (phase === 'finalizing') {
      // User confirmed - execute creation operations
      if (this.isUserConfirmation(userMessage)) {
        yield {
          type: 'text',
          content: "Creating your project now..."
        };

        // Generate and execute operations
        const operations = await this.generateProjectOperations(draft);

        for (const operation of operations) {
          // Execute operation
          const result = await this.toolExecutor.executeOperation(
            operation,
            userId,
            session.id
          );

          // Stream operation result
          yield {
            type: 'operation',
            operation: result
          };
        }

        yield {
          type: 'text',
          content: "All set! Your project is ready."
        };

        // Mark session as completed
        await this.completeSession(session.id, draft.id);

      } else {
        // User wants to add/change something
        yield {
          type: 'text',
          content: "Sure! What would you like to adjust?"
        };
      }
    }
  }

  /**
   * Project Update Mode Handler
   */
  private async *handleProjectUpdate(
    session: ChatSession,
    userMessage: string,
    userId: string
  ): AsyncGenerator<AgentSSEMessage> {
    const projectId = session.entity_id!;

    // Load light project context
    const projectContext = await this.contextService.loadLocationContext(
      'project',
      projectId,
      true // abbreviated
    );

    // Analyze what user wants to change
    const changeAnalysis = await this.analyzeUpdateRequest(
      userMessage,
      projectContext
    );

    // Generate operations for changes
    const operations = await this.generateUpdateOperations(
      changeAnalysis,
      projectId,
      userId
    );

    // Show preview and ask for confirmation
    yield {
      type: 'text',
      content: this.formatUpdatePreview(operations)
    };

    // Execute operations (can be immediate or require confirmation)
    for (const operation of operations) {
      const result = await this.toolExecutor.executeOperation(
        operation,
        userId,
        session.id
      );

      yield {
        type: 'operation',
        operation: result
      };
    }

    yield {
      type: 'text',
      content: "Updated! Anything else you'd like to change?"
    };
  }

  /**
   * Project Audit Mode Handler
   */
  private async *handleProjectAudit(
    session: ChatSession,
    userMessage: string,
    userId: string
  ): AsyncGenerator<AgentSSEMessage> {
    const projectId = session.entity_id!;

    // Load full project context for analysis
    const projectContext = await this.contextService.loadLocationContext(
      'project',
      projectId,
      false // full context needed for audit
    );

    // Run comprehensive audit analysis
    yield {
      type: 'text',
      content: "Analyzing your project across all dimensions..."
    };

    const auditResults = await this.runProjectAudit(projectContext, userMessage);

    // Stream audit findings
    for (const finding of auditResults.findings) {
      yield {
        type: 'text',
        content: this.formatAuditFinding(finding)
      };
    }

    // Offer recommendations
    yield {
      type: 'text',
      content: this.formatAuditRecommendations(auditResults.recommendations)
    };

    // Ask if user wants to implement changes
    yield {
      type: 'text',
      content: "Would you like me to help implement any of these suggestions?"
    };
  }

  /**
   * Project Forecast Mode Handler
   */
  private async *handleProjectForecast(
    session: ChatSession,
    userMessage: string,
    userId: string
  ): AsyncGenerator<AgentSSEMessage> {
    const projectId = session.entity_id!;

    // Load project context
    const projectContext = await this.contextService.loadLocationContext(
      'project',
      projectId,
      false // need full context for forecasting
    );

    // Identify scenario to forecast
    const scenarioSetup = await this.identifyScenario(
      userMessage,
      projectContext
    );

    yield {
      type: 'text',
      content: `Analyzing scenario: ${scenarioSetup.description}`
    };

    // Generate multi-scenario forecast
    const forecast = await this.generateForecast(
      scenarioSetup,
      projectContext
    );

    // Stream scenarios
    for (const scenario of forecast.scenarios) {
      yield {
        type: 'text',
        content: this.formatScenario(scenario)
      };
    }

    // Stream insights
    yield {
      type: 'text',
      content: this.formatForecastInsights(forecast.insights)
    };
  }

  // Helper methods
  private async detectRelevantDimensions(
    brainDump: string,
    draft: ProjectDraft
  ): Promise<string[]> {
    const systemPrompt = `Analyze this project description and identify which of the 9 core dimensions are relevant...`;

    const result = await this.llmService.getJSONResponse({
      systemPrompt,
      userPrompt: brainDump,
      userId: draft.user_id,
      profile: 'fast',
      operationType: 'brain_dump_context'
    });

    return result.relevant_dimensions;
  }

  private getNextDimensionQuestion(
    dimensions: string[],
    draft: ProjectDraft
  ): string {
    // Find first dimension not yet covered
    const uncovered = dimensions.find(
      dim => !draft.dimensions_covered?.includes(dim)
    );

    if (!uncovered) return "I think we're good! Ready to create?";

    // Get question for this dimension
    const questions = DIMENSION_QUESTIONS[uncovered];
    return questions[0]; // Could randomize or pick based on context
  }

  // ... more helper methods
}
```

#### 2. **DraftProjectService**

Manages draft project CRUD operations.

```typescript
// apps/web/src/lib/services/draft-project.service.ts

export class DraftProjectService {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Get or create draft for session
	 */
	async getOrCreateDraft(
		draftId: string | null | undefined,
		userId: string,
		sessionId: string
	): Promise<ProjectDraft> {
		if (draftId) {
			// Load existing draft
			const { data } = await this.supabase
				.from('project_drafts')
				.select('*')
				.eq('id', draftId)
				.single();

			if (data) return data;
		}

		// Create new draft
		const { data: newDraft } = await this.supabase
			.from('project_drafts')
			.insert({
				user_id: userId,
				chat_session_id: sessionId,
				status: 'in_progress',
				dimensions_covered: []
			})
			.select()
			.single();

		return newDraft!;
	}

	/**
	 * Update draft dimension
	 */
	async updateDimension(draftId: string, dimension: string, content: string): Promise<void> {
		await this.supabase
			.from('project_drafts')
			.update({
				[dimension]: content,
				dimensions_covered: this.supabase.raw(
					`array_append(dimensions_covered, '${dimension}')`
				),
				updated_at: new Date().toISOString()
			})
			.eq('id', draftId);
	}

	/**
	 * Finalize draft into real project
	 */
	async finalizeDraft(draftId: string): Promise<string> {
		const { data: draft } = await this.supabase
			.from('project_drafts')
			.select('*')
			.eq('id', draftId)
			.single();

		if (!draft) throw new Error('Draft not found');

		// Create actual project
		const { data: project } = await this.supabase
			.from('projects')
			.insert({
				user_id: draft.user_id,
				name: draft.name,
				slug: this.generateSlug(draft.name!),
				description: draft.description,
				context: draft.context,
				executive_summary: draft.executive_summary,
				core_integrity_ideals: draft.core_integrity_ideals,
				core_people_bonds: draft.core_people_bonds,
				core_goals_momentum: draft.core_goals_momentum,
				core_meaning_identity: draft.core_meaning_identity,
				core_reality_understanding: draft.core_reality_understanding,
				core_trust_safeguards: draft.core_trust_safeguards,
				core_opportunity_freedom: draft.core_opportunity_freedom,
				core_power_resources: draft.core_power_resources,
				core_harmony_integration: draft.core_harmony_integration,
				tags: draft.tags,
				status: 'active'
			})
			.select()
			.single();

		// Mark draft as completed
		await this.supabase
			.from('project_drafts')
			.update({
				status: 'completed',
				completed_at: new Date().toISOString(),
				finalized_project_id: project!.id
			})
			.eq('id', draftId);

		return project!.id;
	}

	/**
	 * Cleanup expired drafts
	 */
	async cleanupExpiredDrafts(): Promise<void> {
		await this.supabase
			.from('project_drafts')
			.update({ status: 'abandoned' })
			.lt('expires_at', new Date().toISOString())
			.eq('status', 'in_progress');
	}

	private generateSlug(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}
}
```

#### 3. **AgentToolExecutor**

Extends existing tool executor for agent-specific operations.

```typescript
// apps/web/src/lib/services/agent-tool-executor.service.ts

export class AgentToolExecutor {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Execute a chat operation with logging
	 */
	async executeOperation(
		operation: {
			type: 'create' | 'update' | 'delete';
			table: string;
			data: any;
		},
		userId: string,
		sessionId: string
	): Promise<ChatOperation> {
		// Create operation record
		const { data: opRecord } = await this.supabase
			.from('chat_operations')
			.insert({
				chat_session_id: sessionId,
				user_id: userId,
				operation_type: operation.type,
				table_name: operation.table,
				operation_data: operation.data,
				status: 'executing'
			})
			.select()
			.single();

		try {
			let result: any;
			let entityId: string;

			// Execute the operation
			switch (operation.type) {
				case 'create':
					result = await this.executeCreate(operation.table, operation.data, userId);
					entityId = result.id;
					break;

				case 'update':
					result = await this.executeUpdate(
						operation.table,
						operation.data.id,
						operation.data,
						userId
					);
					entityId = operation.data.id;
					break;

				case 'delete':
					await this.executeDelete(operation.table, operation.data.id, userId);
					entityId = operation.data.id;
					break;
			}

			// Update operation record with success
			await this.supabase
				.from('chat_operations')
				.update({
					status: 'completed',
					entity_id: entityId,
					after_data: result,
					executed_at: new Date().toISOString(),
					duration_ms: Date.now() - new Date(opRecord!.created_at).getTime()
				})
				.eq('id', opRecord!.id);

			return {
				...opRecord!,
				status: 'completed',
				entity_id: entityId,
				after_data: result
			};
		} catch (error) {
			// Update operation record with failure
			await this.supabase
				.from('chat_operations')
				.update({
					status: 'failed',
					error_message: error instanceof Error ? error.message : 'Unknown error'
				})
				.eq('id', opRecord!.id);

			throw error;
		}
	}

	private async executeCreate(table: string, data: any, userId: string): Promise<any> {
		// Add user_id if not present
		const recordData = { ...data, user_id: userId };

		const { data: result, error } = await this.supabase
			.from(table as any)
			.insert(recordData)
			.select()
			.single();

		if (error) throw error;
		return result;
	}

	private async executeUpdate(
		table: string,
		id: string,
		data: any,
		userId: string
	): Promise<any> {
		// Get before data for diff
		const { data: before } = await this.supabase
			.from(table as any)
			.select('*')
			.eq('id', id)
			.eq('user_id', userId)
			.single();

		// Update
		const { data: result, error } = await this.supabase
			.from(table as any)
			.update(data)
			.eq('id', id)
			.eq('user_id', userId)
			.select()
			.single();

		if (error) throw error;

		return {
			before,
			after: result
		};
	}

	private async executeDelete(table: string, id: string, userId: string): Promise<void> {
		const { error } = await this.supabase
			.from(table as any)
			.delete()
			.eq('id', id)
			.eq('user_id', userId);

		if (error) throw error;
	}
}
```

### API Endpoints

#### `/api/agent/stream` - Main SSE Endpoint

```typescript
// apps/web/src/routes/api/agent/stream/+server.ts

import { AgentOrchestrator } from '$lib/services/agent-orchestrator.service';

export async function POST({ request, locals }) {
	const { message, session_id, chat_type, entity_id } = await request.json();
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
				context_type: chat_type, // Map chat_type to context_type
				entity_id,
				title: 'New Agent Session',
				status: 'active'
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
				const messageGenerator = orchestrator.processMessage(sessionId, message, userId);

				for await (const event of messageGenerator) {
					// Send SSE event
					const data = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(new TextEncoder().encode(data));
				}

				// Send done event
				controller.enqueue(
					new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
				);
				controller.close();
			} catch (error) {
				console.error('Agent stream error:', error);
				const errorEvent = {
					type: 'error',
					error: error instanceof Error ? error.message : 'Unknown error'
				};
				controller.enqueue(
					new TextEncoder().encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
				);
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

export async function GET({ url, locals }) {
	// Get recent sessions for user
	const userId = locals.user.id;
	const supabase = locals.supabase;

	const { data: sessions } = await supabase
		.from('chat_sessions')
		.select('*')
		.eq('user_id', userId)
		.in('chat_type', ['project_create', 'project_update', 'project_audit', 'project_forecast'])
		.order('updated_at', { ascending: false })
		.limit(20);

	return json({ sessions });
}
```

#### `/api/agent/sessions/[id]` - Session Management

```typescript
export async function GET({ params, locals }) {
	const sessionId = params.id;
	const supabase = locals.supabase;

	// Load session with messages and operations
	const { data: session } = await supabase
		.from('chat_sessions')
		.select(
			`
      *,
      messages:chat_messages(*),
      operations:chat_operations(*)
    `
		)
		.eq('id', sessionId)
		.single();

	return json({ session });
}

export async function PATCH({ params, request, locals }) {
	const sessionId = params.id;
	const updates = await request.json();
	const supabase = locals.supabase;

	const { data: session } = await supabase
		.from('chat_sessions')
		.update(updates)
		.eq('id', sessionId)
		.select()
		.single();

	return json({ session });
}
```

#### `/api/agent/drafts` - Draft Management

```typescript
export async function GET({ locals }) {
	const userId = locals.user.id;
	const supabase = locals.supabase;

	const { data: drafts } = await supabase
		.from('project_drafts')
		.select('*')
		.eq('user_id', userId)
		.eq('status', 'in_progress')
		.order('updated_at', { ascending: false });

	return json({ drafts });
}

export async function POST({ request, locals }) {
	const draftData = await request.json();
	const userId = locals.user.id;
	const supabase = locals.supabase;

	const draftService = new DraftProjectService(supabase);
	const draft = await draftService.getOrCreateDraft(null, userId, draftData.session_id);

	return json({ draft });
}
```

### Prompt Templates

#### Agent System Prompts

```typescript
// apps/web/src/lib/services/prompts/agent-prompts.ts

export const AGENT_SYSTEM_PROMPTS = {
	project_create: `You are a friendly, patient project consultant helping users organize their ideas into structured projects.

## Your Role
Help users think through their projects by asking thoughtful questions about the 9 core dimensions. Your goal is to gather enough information to create a well-defined project without overwhelming the user.

## Core Dimensions to Consider
1. **Integrity & Ideals** - What does success look like?
2. **People & Bonds** - Who's involved?
3. **Goals & Momentum** - What's the timeline?
4. **Meaning & Identity** - Why does this matter?
5. **Reality & Understanding** - What's the current state?
6. **Trust & Safeguards** - What could go wrong?
7. **Opportunity & Freedom** - What options exist?
8. **Power & Resources** - What resources are available?
9. **Harmony & Integration** - How will progress be tracked?

## Conversation Guidelines
1. **Listen First** - Let users brain dump without interruption
2. **Ask Thoughtfully** - Only ask about dimensions that are relevant
3. **Accept Partial Answers** - "I don't know" is okay
4. **Track Progress** - Keep mental note of covered dimensions
5. **Know When to Stop** - After 5-7 questions, suggest finalizing
6. **Be Natural** - Vary your phrasing, don't be robotic

## Tools Available
- update_draft_dimension: Update a specific dimension of the draft project
- finalize_draft: Convert draft into final project
- create_task: Create tasks linked to the project
- create_note: Capture unstructured information

## Response Format
- Keep messages conversational and brief
- Use markdown for structure when needed
- Call tools as you gather information
- Show empathy and encouragement

Current date: ${new Date().toISOString().split('T')[0]}`,

	project_update: `You are an efficient project assistant helping users update their existing projects.

## Your Role
Quickly identify what the user wants to change and execute those updates. Be direct and action-oriented.

## Available Information
You have access to the current project context including:
- Full project details
- Core dimension content
- Existing tasks and notes

## Tools Available
- update_project_context: Update main project context
- update_project_dimension: Update specific core dimension
- create_task: Add new tasks
- update_task: Modify existing tasks
- create_note: Add notes

## Response Guidelines
1. **Be Efficient** - Don't ask unnecessary questions
2. **Confirm Actions** - Show what you're about to change
3. **Execute Quickly** - Make changes immediately unless ambiguous
4. **Summarize** - After changes, briefly recap what was updated

Current date: ${new Date().toISOString().split('T')[0]}`,

	project_audit: `You are a critical but constructive project consultant performing a comprehensive audit.

## Your Role
Analyze the project thoroughly across all 9 dimensions, identify gaps, risks, and areas for improvement. Be honest but not discouraging.

## Audit Severity: 7/10
- Point out real issues directly
- Frame as opportunities for improvement
- Acknowledge what's working well
- End with constructive recommendations

## Areas to Audit
1. **Completeness** - Which dimensions are missing or weak?
2. **Consistency** - Do goals align with resources and timeline?
3. **Risks** - What vulnerabilities exist?
4. **Feasibility** - Is this actually achievable?
5. **Missing Pieces** - What critical information is absent?

## Question Types
- "What if...?" scenarios
- Challenge assumptions
- Point out inconsistencies
- Identify dependencies

## Response Format
- Start with overall assessment
- Dive into specific findings
- Ask probing questions
- Offer concrete recommendations
- Suggest next steps

Current date: ${new Date().toISOString().split('T')[0]}`,

	project_forecast: `You are a strategic advisor helping users forecast project outcomes.

## Your Role
Analyze the project's current trajectory and generate realistic scenario forecasts.

## Forecast Framework
Generate three scenarios:
1. **Optimistic (80th percentile)** - Things go well
2. **Realistic (50th percentile)** - Expected outcome
3. **Pessimistic (20th percentile)** - Challenges arise

## Analysis Areas
- Timeline adherence
- Resource constraints
- External dependencies
- Risk materialization
- Market/user response

## Response Format
For each scenario:
- **Likelihood**: Estimated probability
- **Outcome**: What happens
- **Key Factors**: What drives this outcome
- **Warning Signs**: How to detect this path early

After scenarios:
- **Critical Decision Points**: When to pivot or adjust
- **Recommendations**: How to increase likelihood of success

Current date: ${new Date().toISOString().split('T')[0]}`
};
```

### Extended Tool Definitions

Add agent-specific tools to existing `CHAT_TOOLS`:

```typescript
// Add to apps/web/src/lib/chat/tools.config.ts

export const AGENT_TOOLS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'update_draft_dimension',
			description: 'Update a specific dimension of the draft project',
			parameters: {
				type: 'object',
				properties: {
					draft_id: {
						type: 'string',
						description: 'Draft project ID'
					},
					dimension: {
						type: 'string',
						enum: [
							'core_integrity_ideals',
							'core_people_bonds',
							'core_goals_momentum',
							'core_meaning_identity',
							'core_reality_understanding',
							'core_trust_safeguards',
							'core_opportunity_freedom',
							'core_power_resources',
							'core_harmony_integration'
						],
						description: 'Which dimension to update'
					},
					content: {
						type: 'string',
						description: 'Markdown content for the dimension'
					}
				},
				required: ['draft_id', 'dimension', 'content']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'finalize_draft',
			description: 'Convert draft project into final project and create associated tasks',
			parameters: {
				type: 'object',
				properties: {
					draft_id: {
						type: 'string',
						description: 'Draft project ID to finalize'
					},
					create_initial_tasks: {
						type: 'boolean',
						default: true,
						description: 'Generate initial task list from project context'
					}
				},
				required: ['draft_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'update_project_dimension',
			description: 'Update a specific core dimension of an existing project',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID'
					},
					dimension: {
						type: 'string',
						enum: [
							/* same as above */
						],
						description: 'Which dimension to update'
					},
					content: {
						type: 'string',
						description: 'New markdown content (replaces existing)'
					},
					merge_strategy: {
						type: 'string',
						enum: ['replace', 'append', 'prepend'],
						default: 'replace',
						description: 'How to merge with existing content'
					}
				},
				required: ['project_id', 'dimension', 'content']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'analyze_project_completeness',
			description: 'Analyze which dimensions are covered and which need attention',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to analyze'
					}
				},
				required: ['project_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'generate_project_audit',
			description: 'Run comprehensive audit across all dimensions',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to audit'
					},
					focus_areas: {
						type: 'array',
						items: { type: 'string' },
						description: 'Specific areas to focus on (optional)'
					}
				},
				required: ['project_id']
			}
		}
	}
];

// Combine with existing tools
export const ALL_CHAT_TOOLS = [...CHAT_TOOLS, ...AGENT_TOOLS];
```

---

## Integration with Existing Systems

### Relationship to BrainDumpProcessor

**Integration Strategy**: **Hybrid Approach**

The agent will be a **separate but complementary** system:

1. **Agent handles conversation** → Builds project context iteratively through dialogue
2. **Agent uses BrainDumpProcessor** → When user provides large brain dumps, can call existing processor for parsing
3. **Agent generates operations** → Uses similar operation structure as BrainDumpProcessor
4. **Agent can invoke BrainDump modal** → "Want me to process this as a brain dump?" option

```typescript
// In AgentOrchestrator
private async handleLargeBrainDump(
  content: string,
  userId: string,
  projectId?: string
): Promise<void> {
  // Detect if this is a large unstructured brain dump
  if (content.length > 500 && !this.isStructuredInput(content)) {
    // Offer to process via BrainDumpProcessor
    yield {
      type: 'text',
      content: "This looks like a substantial brain dump! Would you like me to process it using the structured brain dump analyzer?"
    };

    // If user agrees, invoke BrainDumpProcessor
    const processor = new BrainDumpProcessor(this.supabase);
    const result = await processor.processBrainDump({
      brainDump: content,
      userId,
      selectedProjectId: projectId,
      brainDumpId: generateId(),
      options: { autoExecute: false }
    });

    // Stream the operations back to agent chat
    for (const operation of result.operations) {
      yield {
        type: 'operation',
        operation: this.convertToAgentOperation(operation)
      };
    }
  }
}
```

### Reuse of Preparatory Analysis

**Yes - Reuse for Dimension Detection**:

```typescript
// In AgentOrchestrator.detectRelevantDimensions()
private async detectRelevantDimensions(
  brainDump: string,
  draft: ProjectDraft
): Promise<string[]> {
  // Reuse preparatory analysis logic from BrainDumpProcessor
  const analysis = await this.runPreparatoryAnalysis(brainDump);

  // Extract dimension relevance from analysis
  const dimensions = analysis.core_dimensions_touched
    ? Object.keys(analysis.core_dimensions_touched)
    : this.getDefaultDimensions();

  return dimensions;
}

// Reuse existing preparatory analysis prompt
private async runPreparatoryAnalysis(
  brainDump: string
): Promise<PreparatoryAnalysisResult> {
  const systemPrompt = this.promptTemplateService.getPreparatoryAnalysisPrompt(
    { name: 'New Project' }, // Light project object
    [] // No existing tasks
  );

  const result = await this.llmService.getJSONResponse({
    systemPrompt,
    userPrompt: brainDump,
    profile: 'fast',
    operationType: 'brain_dump_context'
  });

  return result as PreparatoryAnalysisResult;
}
```

### UI Component Reuse

**Reuse Existing Components**:

1. **ParseResultsDiffView** → For showing operation details

    ```svelte
    <!-- In OperationLogPanel.svelte -->
    {#if selectedOperation?.operation_type === 'update'}
    	<ParseResultsDiffView
    		beforeData={selectedOperation.before_data}
    		afterData={selectedOperation.after_data}
    		table={selectedOperation.table_name}
    		showHeader={false}
    	/>
    {/if}
    ```

2. **OperationEditModal** → For editing operations before execution

    ```svelte
    {#if editingOperation}
    	<OperationEditModal
    		operation={editingOperation.operation_data}
    		onSave={(updated) => handleOperationUpdate(updated)}
    		onCancel={() => (editingOperation = null)}
    	/>
    {/if}
    ```

3. **ChatModal** → Extend existing chat modal with agent mode
    ```svelte
    <!-- In ChatModal.svelte -->
    {#if chatType === 'project_create'}
    	<AgentChatInterface {session} {operations} onOperationClick={handleOperationClick} />
    {:else}
    	<!-- Existing chat interface -->
    {/if}
    ```

---

## Migration & Rollout Plan

### Phase 1: Foundation (Week 1-2)

- [ ] Create database tables (`project_drafts`, `chat_operations`)
- [ ] Extend `chat_sessions` with new columns
- [ ] Set up TypeScript types
- [ ] Create `DraftProjectService`

### Phase 2: Core Agent (Week 3-4)

- [ ] Build `AgentOrchestrator` service
- [ ] Implement `project_create` mode handler
- [ ] Create dimension detection logic
- [ ] Set up SSE streaming endpoint

### Phase 3: UI Components (Week 4-5)

- [ ] Build agent modal UI with split layout
- [ ] Create `OperationLogPanel` component
- [ ] Wire up operation detail views (reuse existing)
- [ ] Add nav bar entry point

### Phase 4: Additional Modes (Week 5-6)

- [ ] Implement `project_update` mode
- [ ] Implement `project_audit` mode
- [ ] Implement `project_forecast` mode
- [ ] Add mode selection UI on project pages

### Phase 5: Integration & Polish (Week 6-7)

- [ ] Integrate with BrainDumpProcessor
- [ ] Add calendar tool support
- [ ] Implement session resume functionality
- [ ] Add draft cleanup cron job

### Phase 6: Testing & Refinement (Week 7-8)

- [ ] E2E testing of all modes
- [ ] User testing with beta group
- [ ] Refine prompts based on feedback
- [ ] Performance optimization

### Phase 7: Launch (Week 8+)

- [ ] Feature flag rollout (10% → 50% → 100%)
- [ ] Monitor error rates and user feedback
- [ ] A/B test against old braindump modal
- [ ] Iterate based on usage data

### Feature Flag Strategy

```typescript
// Feature flag config
const AGENT_FEATURE_FLAGS = {
  enabled: true,
  rollout_percentage: 50, // Start at 50%
  modes_enabled: {
    project_create: true,
    project_update: true,
    project_audit: false, // Not ready yet
    project_forecast: false
  },
  show_old_braindump: true // Keep old system available
};

// In UI
{#if featureFlags.agent.enabled && userInRollout()}
  <AgentButton />
{/if}

{#if featureFlags.agent.show_old_braindump}
  <BrainDumpButton label="Classic Brain Dump" />
{/if}
```

---

## Open Questions & Decisions Needed

### 1. Data Models & Storage

**Q1.1: project_drafts table - exact fields**

- Should we mirror ALL fields from projects table or just core ones?
- Should we store full 9 dimensions even if empty during draft?
- How to handle tags/metadata during draft phase?

**Q1.2: Draft lifecycle management**

- Auto-delete after 7 days or longer (30 days)?
- Allow multiple drafts per user or enforce one active draft?
- What happens to draft if user creates project manually elsewhere?

**Q1.3: chat_operations storage**

- Should we store operations in separate table or embed in chat_messages?
- If separate table: Do we need full audit trail or just successful operations?
- How long to retain operation history?

**Q1.4: Session linking**

- Explicit `draft_project_id` in chat_sessions or derive from operations?
- Can one chat session create multiple projects?
- Should we support session forking/branching?

### 2. Agent Intelligence & Behavior

**Q2.1: Dimension detection threshold**

- Current plan: Score 6+ out of 10 = ask about it. Is this right?
- Should threshold vary by project complexity?
- Always include core 3 dimensions or make even those optional?

**Q2.2: Question limits**

- Hard cap at 10 questions or flexible based on user engagement?
- What if user volunteers information before being asked?
- Should agent explicitly tell user "3 more questions" or keep it implicit?

**Q2.3: Partial answer handling**

- User says "I don't know" - skip dimension entirely or mark as "needs followup"?
- User gives vague answer - probe once more or accept it?
- Should draft track "completeness score" per dimension?

**Q2.4: Audit mode harshness**

- Confirm 7/10 harshness level or go gentler (5/10) or harsher (8/10)?
- Should harshness be user-configurable?
- Different harshness for different project stages (planning vs execution)?

**Q2.5: Multi-turn conversation strategy**

- Iteratively fill dimensions (ask → update → ask next)?
- Or gather all info first, then update all at once?
- How to handle user going back and changing earlier answers?

### 3. Operations & Execution

**Q3.1: Operation execution model**

- Execute immediately as agent decides?
- Show preview and require user confirmation?
- Batch operations and confirm at end?

**Q3.2: Operation failure handling**

- If operation fails mid-conversation, retry automatically or ask user?
- Rollback previous operations or continue?
- Show errors inline in chat or in operations log?

**Q3.3: Undo/rollback capabilities**

- Should ALL operations be undoable?
- Time limit on undo (e.g., 5 minutes)?
- What about cascading deletes (undo project creation = delete all tasks)?

**Q3.4: Validation strategy**

- Validate operations before executing or after?
- Who validates: Agent LLM or separate validator?
- Show validation errors to user or fix automatically?

### 4. Integration & Architecture

**Q4.1: BrainDumpProcessor relationship**

- Keep as separate systems or merge into unified processor?
- Should agent be able to invoke full braindump processing?
- Share operation execution logic or keep separate?

**Q4.2: Tool calling authorization**

- Should certain tools require explicit user permission?
- Different permission levels for different modes (e.g., audit = read-only)?
- Log all tool calls for audit trail?

**Q4.3: Calendar integration timing**

- Schedule tasks during project creation or after finalization?
- Agent proactively suggests scheduling or wait for user request?
- Auto-schedule high-priority tasks?

**Q4.4: Context loading strategy**

- For project_update: Load full context or abbreviated initially?
- How much task history to include?
- Should we cache context for session duration?

### 5. User Experience

**Q5.1: Entry point ambiguity**

- If user on project page clicks nav bar button: Ask intent or assume create new?
- Should we detect "this is an update to current project" automatically?
- Different button labels based on context?

**Q5.2: Session resume UX**

- Always ask "resume or start fresh" or auto-resume if < 1 hour old?
- Show draft preview in resume dialog?
- Allow resume from different page/context?

**Q5.3: Operations log interaction model**

- Read-only initially or allow inline editing immediately?
- Should operations be collapsible/expandable?
- Group related operations or show chronologically?

**Q5.4: Mobile experience**

- Split layout (chat + operations) or tabbed for mobile?
- Touch gestures for operation interactions?
- Voice input prominence on mobile?

### 6. Performance & Scalability

**Q6.1: Streaming optimization**

- Should we batch operation updates or stream each individually?
- Rate limit agent responses to avoid overwhelming user?
- Pre-fetch related data before user asks?

**Q6.2: Token budget management**

- Max context size for agent prompts?
- When to compress conversation history?
- How to handle very long projects with lots of dimensions?

**Q6.3: Concurrent sessions**

- Can user have multiple agent sessions open simultaneously?
- If yes, how to handle conflicts (e.g., editing same project)?
- Should we lock projects during agent sessions?

### 7. Content Quality

**Q7.1: Prompt refinement strategy**

- A/B test different prompt variations?
- Collect user feedback on agent helpfulness?
- How often to update prompts based on usage data?

**Q7.2: Dimension question quality**

- Should questions be randomized or follow specific order?
- Personalize questions based on user's past projects?
- Allow users to contribute their own dimension questions?

**Q7.3: Response tone calibration**

- Same personality across all users or adapt to user's communication style?
- More formal for professional projects, casual for personal?
- Should agent use emojis/casual language?

---

## Priority Ranking for Questions

### Must Answer Before Implementation (P0):

1. **Q3.1** - Operation execution model (affects entire architecture)
2. **Q1.1** - project_drafts exact schema (foundation for everything)
3. **Q2.1** - Dimension detection algorithm (core agent intelligence)
4. **Q4.1** - BrainDumpProcessor relationship (integration strategy)
5. **Q2.4** - Audit mode harshness (affects user trust and adoption)

### Should Answer During Implementation (P1):

6. **Q5.1** - Entry point behavior (affects UX flow)
7. **Q2.2** - Question limits (prevents overwhelming users)
8. **Q3.2** - Operation failure handling (user experience during errors)
9. **Q1.2** - Draft lifecycle (data cleanup and management)
10. **Q5.3** - Operations log interaction model (core UI behavior)

### Can Decide During Testing (P2):

11. **Q2.3** - Partial answer handling
12. **Q5.2** - Session resume UX
13. **Q6.1** - Streaming optimization
14. **Q7.3** - Response tone calibration
15. **Q4.3** - Calendar integration timing

### Can Iterate Post-Launch (P3):

16. **Q7.1** - Prompt refinement strategy
17. **Q7.2** - Dimension question quality
18. **Q5.4** - Mobile experience details
19. **Q6.3** - Concurrent sessions
20. **Q2.5** - Multi-turn conversation edge cases

---

## Success Metrics

### User Adoption

- Agent sessions created per day
- Completion rate (drafts → finalized projects)
- Agent sessions vs traditional braindump ratio
- Repeat usage rate

### Conversation Quality

- Average messages per session
- Average questions asked per project
- User satisfaction rating (thumbs up/down)
- Dimension coverage completeness

### System Performance

- Average session duration
- Time to first operation
- Operation success rate
- Error rate per mode

### Business Impact

- Projects created per user (before/after agent)
- Project quality score (dimensions filled)
- Task creation rate
- User retention improvement

---

This design document provides a comprehensive blueprint for implementing the conversational project agent. The next step is to answer the P0 priority questions to finalize the architecture before beginning implementation.
