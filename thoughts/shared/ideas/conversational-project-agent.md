# BuildOS Conversational Project Agent - Implementation Spec v3.0 (TAILORED)

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

### Implementation Confidence: 95%

Based on comprehensive codebase research, all required infrastructure exists:

- ✅ Complete chat system with SSE streaming
- ✅ ParsedOperation interface and execution pipeline
- ✅ Preparatory analysis for dimension detection
- ✅ SmartLLMService with profile selection
- ✅ Progressive disclosure pattern for token management
- ✅ Reusable UI components (modals, diffs, operations)
- ✅ Supabase integration with RLS and real-time

---

## System Architecture (TAILORED TO BUILDOS)

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface Layer                    │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │  Chat Interface │  │    Operations Panels             │ │
│  │  - Extends      │  │  ┌──────────────────────┐       │ │
│  │    ChatModal   │  │  │ Operations Log       │       │ │
│  │  - Voice input  │  │  │ (Top Right)          │       │ │
│  │  - Draft list   │  │  │ - ParseResultsDiff   │       │ │
│  │                 │  │  └──────────────────────┘       │ │
│  │                 │  │  ┌──────────────────────┐       │ │
│  │                 │  │  │ Operations Queue     │       │ │
│  │                 │  │  │ (Bottom Right)       │       │ │
│  │                 │  │  │ - OperationsList     │       │ │
│  │                 │  │  └──────────────────────┘       │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     API/Streaming Layer                      │
│  /api/agent/stream - Extends existing /api/chat/stream      │
│  /api/agent/sessions - Session management                   │
│  /api/agent/drafts - Draft project/task CRUD               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  AgentOrchestrator   │  │   OperationsExecutor         │ │
│  │  - Uses existing     │  │   (Reuse existing)           │ │
│  │    ChatContext       │  │   - Validation               │ │
│  │  - Dimension detect  │  │   - Reference resolution     │ │
│  │    via Preparatory   │  │   - Rollback support         │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  DraftService        │  │   SmartLLMService            │ │
│  │  - Draft projects    │  │   (Reuse existing)           │ │
│  │  - Draft tasks       │  │   - streamText()             │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer (Supabase)                    │
│  EXISTING: chat_sessions (extended) | chat_messages         │
│  NEW: project_drafts | draft_tasks | chat_operations        │
│  NEW: chat_sessions_projects/tasks/daily_briefs (junctions) │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Models (REUSING EXISTING INTERFACES)

### Reuse Existing ParsedOperation

```typescript
// FROM: apps/web/src/lib/types/brain-dump.ts
// DO NOT CREATE NEW - REUSE AS-IS
export interface ParsedOperation {
	id: string;
	table: TableName;
	operation: OperationType;
	data: {
		project_id?: string;
		project_ref?: string; // For new projects
		[key: string]: any;
	};
	ref?: string;
	searchQuery?: string;
	conditions?: Record<string, any>;
	enabled: boolean;
	error?: string;
	reasoning?: string;
	result?: Record<string, any>;
}
```

### New Tables (Minimal Additions)

#### `project_drafts` (NEW)

```sql
CREATE TABLE project_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE UNIQUE,

    -- Mirror core fields from projects table
    name TEXT,
    slug TEXT,
    description TEXT,
    context TEXT,
    executive_summary TEXT,
    status TEXT CHECK (status IN ('active', 'paused', 'completed', 'archived')) DEFAULT 'active',
    tags TEXT[],
    start_date TIMESTAMP,
    end_date TIMESTAMP,

    -- Core dimensions (reuse exact field names)
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

    -- Metadata
    dimensions_covered TEXT[],
    question_count INTEGER DEFAULT 0,

    -- No expiration (unlike original spec)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    finalized_project_id UUID REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX idx_project_drafts_user ON project_drafts(user_id);
CREATE INDEX idx_project_drafts_session ON project_drafts(chat_session_id);
```

#### `draft_tasks` (NEW)

```sql
CREATE TABLE draft_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_project_id UUID REFERENCES project_drafts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Mirror fields from tasks table
    title TEXT NOT NULL,
    description TEXT,
    details TEXT,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    status TEXT CHECK (status IN ('backlog', 'in_progress', 'done', 'blocked')) DEFAULT 'backlog',
    task_type TEXT CHECK (task_type IN ('one_off', 'recurring')) DEFAULT 'one_off',

    start_date TIMESTAMP,
    completed_at TIMESTAMP,
    duration_minutes INTEGER,

    recurrence_pattern TEXT,
    recurrence_ends TIMESTAMP,

    parent_task_id UUID REFERENCES draft_tasks(id) ON DELETE SET NULL,
    dependencies UUID[],
    task_steps JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finalized_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_draft_tasks_project ON draft_tasks(draft_project_id);
CREATE INDEX idx_draft_tasks_user ON draft_tasks(user_id);
```

#### `chat_operations` (EXTENDS BRAIN_DUMP_LINKS PATTERN)

```sql
CREATE TABLE chat_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Reuse ParsedOperation structure
    table_name TEXT NOT NULL,
    operation_type TEXT CHECK (operation_type IN ('create', 'update', 'delete')) NOT NULL,
    entity_id UUID,
    ref TEXT,

    -- Operation data matching ParsedOperation
    data JSONB NOT NULL,
    search_query TEXT,
    conditions JSONB,

    -- Execution tracking
    status TEXT CHECK (status IN (
        'pending', 'queued', 'executing', 'completed', 'failed', 'rolled_back', 'partial'
    )) DEFAULT 'pending',
    enabled BOOLEAN DEFAULT true,
    error_message TEXT,
    reasoning TEXT,
    result JSONB,

    -- For diffs
    before_data JSONB,
    after_data JSONB,

    -- Metadata
    executed_at TIMESTAMP,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Batching
    batch_id UUID,
    sequence_number INTEGER
);

CREATE INDEX idx_chat_operations_session ON chat_operations(chat_session_id, created_at DESC);
CREATE INDEX idx_chat_operations_status ON chat_operations(status);
CREATE INDEX idx_chat_operations_batch ON chat_operations(batch_id, sequence_number);
```

### Modified Tables (EXTEND EXISTING)

#### `chat_sessions` (EXTEND)

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
ADD COLUMN auto_accept_operations BOOLEAN DEFAULT true;

-- agent_metadata structure matching PreparatoryAnalysisResult patterns:
-- {
--   "dimensions_detected": ["core_integrity_ideals", "core_goals_momentum"],
--   "questions_asked": 5,
--   "user_responses": {"dimension_name": "response_summary"},
--   "operations_executed": 12,
--   "operations_queued": 5,
--   "session_phase": "gathering_info" | "clarifying" | "finalizing" | "completed",
--   "draft_project_id": "uuid",
--   "partial_failure": false,
--   "failed_operations": []
-- }
```

#### `chat_messages` (EXTEND)

```sql
ALTER TABLE chat_messages
ADD COLUMN operation_ids UUID[],
ADD COLUMN message_type TEXT CHECK (message_type IN (
    'user_message',
    'assistant_message',
    'system_notification',
    'operation_summary',
    'phase_update'
)) DEFAULT 'assistant_message';
```

---

## Agent Intelligence - REUSING PREPARATORY ANALYSIS

### Dimension Detection (REUSE EXISTING)

```typescript
// REUSE EXACTLY FROM: braindump-processor.ts
async function detectRelevantDimensions(
	userBrainDump: string,
	draft: ProjectDraft
): Promise<string[]> {
	// Call existing preparatory analysis
	const analysis = await this.runPreparatoryAnalysis(userBrainDump);

	// Extract touched dimensions (EXISTING LOGIC)
	const touchedDimensions = analysis.core_dimensions_touched
		? Object.keys(analysis.core_dimensions_touched)
		: [];

	// Always include critical dimensions
	const coreDimensions = [];
	if (analysis.braindump_classification !== 'unrelated') {
		coreDimensions.push('core_integrity_ideals');
		coreDimensions.push('core_reality_understanding');
	}

	return [...new Set([...coreDimensions, ...touchedDimensions])];
}
```

### Question Bank (FROM ORIGINAL SPEC)

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

---

## Service Layer (INTEGRATING WITH EXISTING)

### AgentOrchestrator Service

```typescript
// apps/web/src/lib/services/agent-orchestrator.service.ts

import { BrainDumpProcessor } from '$lib/utils/braindump-processor';
import { OperationsExecutor } from '$lib/utils/operations/operations-executor';
import { ChatContextService } from '$lib/services/chat-context.service';
import { SmartLLMService } from '$lib/services/llm/smart-llm.service';
import type { ParsedOperation } from '$lib/types/brain-dump';

export class AgentOrchestrator {
	private supabase: SupabaseClient<Database>;
	private llmService: SmartLLMService;
	private contextService: ChatContextService;
	private operationsExecutor: OperationsExecutor; // REUSE EXISTING
	private brainDumpProcessor: BrainDumpProcessor; // FOR PREPARATORY ANALYSIS
	private draftService: DraftService;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.llmService = new SmartLLMService(/* existing config */);
		this.contextService = new ChatContextService(supabase);
		this.operationsExecutor = new OperationsExecutor(supabase);
		this.brainDumpProcessor = new BrainDumpProcessor(supabase);
		this.draftService = new DraftService(supabase);
	}

	async *processMessage(
		sessionId: string,
		userMessage: string,
		userId: string
	): AsyncGenerator<AgentSSEMessage> {
		const session = await this.loadSession(sessionId);
		const autoAccept = session.auto_accept_operations ?? true;

		switch (session.chat_type) {
			case 'project_create':
				yield* this.handleProjectCreate(session, userMessage, userId, autoAccept);
				break;
			// ... other modes
		}
	}

	private async *handleProjectCreate(
		session: ChatSession,
		userMessage: string,
		userId: string,
		autoAccept: boolean
	): AsyncGenerator<AgentSSEMessage> {
		// Get or create draft (one per session)
		let draft = await this.draftService.getOrCreateDraft(session.id, userId);

		const metadata = session.agent_metadata as AgentMetadata;
		const phase = metadata?.session_phase || 'gathering_info';

		if (phase === 'gathering_info') {
			// Use streamText for real-time response
			const stream = this.llmService.streamText({
				messages: [
					{ role: 'system', content: AGENT_SYSTEM_PROMPTS.project_create },
					{ role: 'user', content: userMessage }
				],
				userId,
				profile: 'speed', // Fast conversational responses
				temperature: 0.8, // Warmer for conversation
				maxTokens: 500
			});

			// Stream acknowledgment
			for await (const chunk of stream) {
				if (chunk.type === 'text') {
					yield { type: 'text', content: chunk.content };
				}
			}

			// Run dimension detection using EXISTING preparatory analysis
			const analysis = await this.brainDumpProcessor.runPreparatoryAnalysis(
				userMessage,
				null, // No project yet
				[] // No tasks yet
			);

			const dimensions = analysis.core_dimensions_touched
				? Object.keys(analysis.core_dimensions_touched)
				: ['core_integrity_ideals', 'core_reality_understanding'];

			// Update metadata
			await this.updateSessionMetadata(session.id, {
				dimensions_detected: dimensions,
				session_phase: 'clarifying'
			});

			yield {
				type: 'phase_update',
				phase: 'clarifying',
				message: 'I have a few questions to help shape this project...'
			};

			// Ask first question
			const question = this.getNextPrioritizedQuestion(dimensions, draft);
			yield { type: 'text', content: question };
		} else if (phase === 'clarifying') {
			// Process answer and update draft
			const updatedDimension = await this.processAnswer(
				userMessage,
				metadata.dimensions_detected!,
				draft
			);

			// Update draft in real-time
			await this.draftService.updateDimension(
				draft.id,
				updatedDimension,
				draft[updatedDimension]
			);

			yield {
				type: 'draft_update',
				draft: { [updatedDimension]: draft[updatedDimension] }
			};

			// Check if enough questions asked
			const questionCount = (metadata.questions_asked || 0) + 1;
			const maxQuestions = this.isComplexProject(draft) ? 10 : 5;

			if (questionCount >= maxQuestions || this.hasMinimalViability(draft)) {
				yield {
					type: 'text',
					content:
						'Ready to create the project, or would you like to answer a few more questions?'
				};

				yield {
					type: 'phase_update',
					phase: 'finalizing'
				};
			} else {
				// Ask next question
				const nextQuestion = this.getNextPrioritizedQuestion(
					metadata.dimensions_detected!,
					draft
				);
				yield { type: 'text', content: nextQuestion };
			}
		} else if (phase === 'finalizing') {
			// Generate operations using draft data
			const operations = await this.generateProjectOperations(draft);

			if (autoAccept) {
				// Execute using EXISTING OperationsExecutor
				const result = await this.operationsExecutor.executeOperations({
					operations,
					userId,
					brainDumpId: session.id // Use session as brain dump ID
				});

				// Stream execution results
				for (const op of result.successful) {
					yield { type: 'operation', operation: op };
				}

				// Handle failures
				if (result.failed.length > 0) {
					yield {
						type: 'phase_update',
						phase: 'partial_failure',
						message: `${result.successful.length} operations succeeded, ${result.failed.length} failed`
					};
				}

				// Finalize draft
				await this.draftService.finalizeDraft(draft.id);
				yield { type: 'text', content: 'Your project has been created!' };
			} else {
				// Queue operations for approval
				const queuedOps = await this.queueOperations(operations, session.id, userId);
				yield { type: 'queue_update', operations: queuedOps };
				yield {
					type: 'text',
					content: 'Review the operations above and approve when ready.'
				};
			}
		}
	}

	private async generateProjectOperations(draft: ProjectDraft): Promise<ParsedOperation[]> {
		const operations: ParsedOperation[] = [];

		// Create project operation
		operations.push({
			id: generateId(),
			table: 'projects' as TableName,
			operation: 'create' as OperationType,
			data: {
				name: draft.name,
				slug: draft.slug,
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
			},
			ref: 'new-project-1',
			enabled: true
		});

		// Create draft tasks as real tasks
		if (draft.draft_tasks?.length) {
			for (const draftTask of draft.draft_tasks) {
				operations.push({
					id: generateId(),
					table: 'tasks' as TableName,
					operation: 'create' as OperationType,
					data: {
						project_ref: 'new-project-1', // Reference resolver will handle
						title: draftTask.title,
						description: draftTask.description,
						priority: draftTask.priority,
						status: draftTask.status,
						start_date: draftTask.start_date,
						duration_minutes: draftTask.duration_minutes
					},
					enabled: true
				});
			}
		}

		return operations;
	}
}
```

---

## API Endpoints (EXTENDING EXISTING)

### `/api/agent/stream` - SSE Endpoint

```typescript
// apps/web/src/routes/api/agent/stream/+server.ts

import { AgentOrchestrator } from '$lib/services/agent-orchestrator.service';

export async function POST({ request, locals }) {
	const { message, session_id, chat_type, entity_id, auto_accept } = await request.json();
	const userId = locals.user.id;
	const supabase = locals.supabase;

	// Create or load session (REUSE EXISTING PATTERN)
	let sessionId = session_id;
	if (!sessionId) {
		const { data: session } = await supabase
			.from('chat_sessions')
			.insert({
				user_id: userId,
				chat_type,
				context_type: chat_type, // Compatibility
				entity_id,
				title: `${chat_type} Session`,
				status: 'active',
				auto_accept_operations: auto_accept ?? true,
				total_tokens: 0,
				message_count: 0
			})
			.select()
			.single();
		sessionId = session.id;
	}

	const orchestrator = new AgentOrchestrator(supabase);

	// REUSE EXISTING SSE STREAMING PATTERN
	const stream = new ReadableStream({
		async start(controller) {
			try {
				// Send session info first
				controller.enqueue(
					new TextEncoder().encode(
						`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`
					)
				);

				// Process message
				for await (const event of orchestrator.processMessage(sessionId, message, userId)) {
					const data = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(new TextEncoder().encode(data));
				}

				// Send done
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
			Connection: 'keep-alive'
		}
	});
}
```

---

## UI Components (REUSING EXISTING)

### Main Agent Modal

```svelte
<!-- apps/web/src/lib/components/agent/AgentModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import ChatInterface from './ChatInterface.svelte';
	import OperationsLog from './OperationsLog.svelte';
	import OperationsQueue from './OperationsQueue.svelte';
	import DraftsList from './DraftsList.svelte';

	export let chatType: ChatType = 'project_create';
	export let entityId: string | null = null;
	export let onClose: () => void;

	let autoAcceptOperations = true;
	let operations: ChatOperation[] = [];
	let queuedOperations: ChatOperation[] = [];
	let drafts: ProjectDraft[] = [];

	// Panel collapse states
	let showOperationsLog = true;
	let showOperationsQueue = true;
	let showLeftPanel = true;
</script>

<Modal {onClose} size="xl" closeOnEscape={true}>
	<div class="agent-container">
		<!-- LEFT PANEL -->
		{#if showLeftPanel}
			<div class="left-panel">
				{#if chatType === 'project_create'}
					<DraftsList {drafts} onSelect={loadDraft} />
				{:else if chatType === 'project_update'}
					<RelatedChats {entityId} />
				{/if}
			</div>
		{/if}

		<!-- CENTER: CHAT -->
		<div class="chat-panel">
			<ChatInterface
				{chatType}
				{entityId}
				{autoAcceptOperations}
				on:operation={handleOperation}
				on:queue={handleQueue}
			/>

			<div class="chat-controls">
				<label>
					<input type="checkbox" bind:checked={autoAcceptOperations} />
					Auto-accept operations
				</label>
			</div>
		</div>

		<!-- RIGHT PANELS -->
		<div class="right-panels">
			<!-- Operations Log (Top) -->
			<div class="operations-log-panel" class:collapsed={!showOperationsLog}>
				<button on:click={() => (showOperationsLog = !showOperationsLog)}>
					{showOperationsLog ? '▼' : '▶'} Operations Log
				</button>
				{#if showOperationsLog}
					<OperationsLog {operations} />
				{/if}
			</div>

			<!-- Operations Queue (Bottom) -->
			{#if !autoAcceptOperations}
				<div class="operations-queue-panel" class:collapsed={!showOperationsQueue}>
					<button on:click={() => (showOperationsQueue = !showOperationsQueue)}>
						{showOperationsQueue ? '▼' : '▶'} Operations Queue ({queuedOperations.length})
					</button>
					{#if showOperationsQueue}
						<OperationsQueue
							operations={queuedOperations}
							on:approve={approveOperation}
							on:approveAll={approveAllOperations}
							on:edit={editOperation}
						/>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</Modal>

<style>
	.agent-container {
		display: grid;
		grid-template-columns: 250px 1fr 400px;
		height: 80vh;
		gap: 1rem;
	}

	.chat-controls {
		padding: 0.5rem;
		border-top: 1px solid var(--color-border);
	}

	.collapsed {
		height: 40px;
		overflow: hidden;
	}
</style>
```

### Operations Log Component

```svelte
<!-- Reuse existing ParseResultsDiffView for operation details -->
<script lang="ts">
	import ParseResultsDiffView from '$lib/components/brain-dump/ParseResultsDiffView.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { ChatOperation } from '$lib/types/agent';

	export let operations: ChatOperation[];

	let selectedOperation: ChatOperation | null = null;

	const getOperationIcon = (type: string, status: string) => {
		if (status === 'failed') return '❌';
		if (status === 'pending') return '⚪';
		if (status === 'partial') return '⚠️';

		switch (type) {
			case 'create':
				return '🟢';
			case 'update':
				return '🟡';
			case 'delete':
				return '🔴';
			default:
				return '⚪';
		}
	};
</script>

<div class="operations-log">
	{#each operations as op}
		<div class="operation-item" on:click={() => (selectedOperation = op)}>
			<span class="icon">{getOperationIcon(op.operation_type, op.status)}</span>
			<span class="table">{op.table_name}</span>
			<span class="summary">{op.data.name || op.data.title || 'Operation'}</span>
			<Badge variant={op.status === 'completed' ? 'success' : 'warning'}>
				{op.status}
			</Badge>
		</div>
	{/each}

	{#if selectedOperation}
		<!-- Reuse existing diff view -->
		<ParseResultsDiffView operation={selectedOperation} showHeader={false} />
	{/if}
</div>
```

---

## SmartLLMService Integration (SPECIFIC PROFILES)

### Profile Selection by Mode

```typescript
const LLM_PROFILES_BY_MODE = {
	// Conversational responses - fast and warm
	conversation: {
		profile: 'speed',
		temperature: 0.8,
		maxTokens: 500
	},

	// Dimension analysis - fast and analytical
	analysis: {
		profile: 'fast',
		temperature: 0.2,
		maxTokens: 1000
	},

	// Operation generation - balanced and precise
	operations: {
		profile: 'balanced',
		temperature: 0.3,
		maxTokens: 2000
	},

	// Audit mode - quality and thorough
	audit: {
		profile: 'quality',
		temperature: 0.4,
		maxTokens: 3000
	},

	// Forecast mode - creative and exploratory
	forecast: {
		profile: 'creative',
		temperature: 0.9,
		maxTokens: 2500
	}
};
```

---

## Progressive Disclosure Integration

```typescript
// Reuse existing token management pattern
async function loadAgentContext(sessionId: string, projectId?: string): Promise<ChatContext> {
	const contextService = new ChatContextService(supabase);

	// Use abbreviated mode for agent conversations
	const context = await contextService.loadLocationContext(
		projectId ? 'project' : 'global',
		projectId || null,
		true // abbreviated = true for token savings
	);

	// Token budget for agent: 8000 (leave room for conversation)
	const MAX_AGENT_TOKENS = 8000;

	if (context.totalTokens > MAX_AGENT_TOKENS) {
		// Compress if needed
		context = await contextService.compressContext(context, MAX_AGENT_TOKENS);
	}

	return context;
}
```

---

## Browser Close & Session Resume (FROM ORIGINAL SPEC)

### Auto-Save on Close

```typescript
// In AgentModal.svelte
onMount(() => {
	// Auto-save draft on page unload
	window.addEventListener('beforeunload', async (e) => {
		if (draftId && hasUnsavedChanges) {
			// Save silently
			await saveDraftState(draftId);
		}
	});

	// Check for resumable sessions
	checkResumableSessions();
});

async function checkResumableSessions() {
	const { data: drafts } = await supabase
		.from('project_drafts')
		.select('*')
		.eq('user_id', userId)
		.is('completed_at', null)
		.order('updated_at', { ascending: false })
		.limit(1);

	if (drafts?.length && isRecent(drafts[0].updated_at)) {
		showResumeDialog(drafts[0]);
	}
}
```

### Resume Dialog

```svelte
{#if resumableDraft}
	<Modal onClose={() => (resumableDraft = null)}>
		<h2>Continue Previous Session?</h2>
		<p>You have an in-progress project:</p>

		<Card>
			<h3>📝 {resumableDraft.name || 'Untitled Project'}</h3>
			<p>Last edited: {formatRelativeTime(resumableDraft.updated_at)}</p>
			<p>Progress: {resumableDraft.dimensions_covered?.length || 0}/9 dimensions</p>
		</Card>

		<div class="actions">
			<Button on:click={() => resumeSession(resumableDraft)}>Continue Session</Button>
			<Button variant="secondary" on:click={() => startFresh()}>Start Fresh</Button>
		</div>
	</Modal>
{/if}
```

---

## Tool Definitions (EXTEND EXISTING)

```typescript
// ADD TO: apps/web/src/lib/chat/tools.config.ts

export const AGENT_TOOLS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'update_draft_dimension',
			description: 'Update a specific dimension of the draft project',
			parameters: {
				type: 'object',
				properties: {
					draft_id: { type: 'string' },
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
						]
					},
					content: { type: 'string' }
				},
				required: ['draft_id', 'dimension', 'content']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'finalize_draft',
			description: 'Convert draft to final project with tasks',
			parameters: {
				type: 'object',
				properties: {
					draft_id: { type: 'string' },
					operations: {
						type: 'array',
						items: { type: 'object' },
						description: 'ParsedOperations to execute'
					}
				},
				required: ['draft_id', 'operations']
			}
		}
	}

	// ... other agent tools
];

// Merge with existing tools
export const ALL_CHAT_TOOLS = [...CHAT_TOOLS, ...AGENT_TOOLS];
```

---

## Migration Plan (MINIMAL CHANGES)

### Phase 1: Database (2 days)

- [ ] Create only 3 new tables: project_drafts, draft_tasks, chat_operations
- [ ] Extend chat_sessions with agent columns
- [ ] Create junction tables for relationships
- [ ] Add RLS policies

### Phase 2: Services (3 days)

- [ ] Create DraftService for draft management
- [ ] Create AgentOrchestrator (reuses existing services)
- [ ] Integrate with existing BrainDumpProcessor for analysis
- [ ] Reuse OperationsExecutor for execution

### Phase 3: Agent Logic (2 days)

- [ ] Implement dimension detection via preparatory analysis
- [ ] Add question prioritization
- [ ] Create phase tracking
- [ ] Implement auto-accept toggle logic

### Phase 4: UI (3 days)

- [ ] Extend ChatModal for agent interface
- [ ] Create OperationsLog using ParseResultsDiffView
- [ ] Create OperationsQueue using OperationsList patterns
- [ ] Add DraftsList component
- [ ] Wire up auto-accept toggle

### Phase 5: SSE Streaming (2 days)

- [ ] Create /api/agent/stream endpoint
- [ ] Integrate with existing SSE patterns
- [ ] Add operation streaming
- [ ] Add phase updates

### Phase 6: Testing (3 days)

- [ ] Test all modes
- [ ] Test partial failure scenarios
- [ ] Test session resume
- [ ] Test auto-accept vs manual approval

### Phase 7: Polish (2 days)

- [ ] Optimize token usage
- [ ] Refine prompts based on testing
- [ ] Add telemetry
- [ ] Documentation

**Total: ~17 days** (vs 28 in original estimate)

---

## Key Implementation Details

### 1. **ParsedOperation Reuse**

- DO NOT create new operation interface
- Use existing ParsedOperation from brain-dump.ts
- Operations work with existing executor

### 2. **Preparatory Analysis Integration**

```typescript
// Dimension detection uses EXISTING preparatory analysis
const analysis = await brainDumpProcessor.runPreparatoryAnalysis(text);
const dimensions = Object.keys(analysis.core_dimensions_touched || {});
```

### 3. **Token Budget Management**

- Agent context: 8000 tokens max
- Use abbreviated contexts
- Leverage existing progressive disclosure

### 4. **LLM Profile Selection**

- Conversation: 'speed' profile (fast responses)
- Analysis: 'fast' profile (preparatory analysis)
- Operations: 'balanced' profile (accuracy)
- Temperature: 0.8 for conversation, 0.2-0.4 for analysis

### 5. **Error Handling**

- Reuse ActivityLogger for user actions
- Reuse ErrorLoggerService for errors
- Partial failure support via existing rollback

### 6. **UI Component Reuse**

- Modal.svelte as base
- ParseResultsDiffView for operations
- Badge, Card, Button from UI library
- ChatModal patterns for layout

---

## Configuration

### Feature Flags

```typescript
const AGENT_FEATURE_FLAGS = {
	enabled: true,
	rollout_percentage: 10, // Start at 10%
	modes_enabled: {
		project_create: true,
		project_update: true,
		project_audit: false, // Phase 2
		project_forecast: false, // Phase 2
		task_update: false // Phase 2
	},
	show_old_braindump: true, // Keep during transition
	default_auto_accept: true
};
```

### Environment Variables

```env
# Agent Configuration (add to existing .env)
AGENT_MAX_QUESTIONS_SIMPLE=5
AGENT_MAX_QUESTIONS_COMPLEX=10
AGENT_AUDIT_HARSHNESS=7
AGENT_AUTO_RECOVERY_ENABLED=true
AGENT_OPERATION_TIMEOUT_MS=5000
AGENT_DEFAULT_TEMPERATURE=0.8
```

---

## Success Metrics

### Implementation Confidence: 95%

- All core infrastructure exists and is battle-tested
- Minimal new code required (mostly orchestration)
- Reusing proven patterns throughout
- Clear integration points identified

### Risks Mitigated

- ✅ Token management: Use existing progressive disclosure
- ✅ Operation execution: Reuse existing executor
- ✅ UI complexity: Reuse existing components
- ✅ LLM costs: Use fast/speed profiles for conversation
- ✅ Error handling: Leverage existing patterns

### Key Success Factors

- Reuse > Rebuild (80% existing code)
- Incremental rollout with feature flags
- Parallel development possible (UI/Services/DB)
- Testing can use existing test infrastructure

---

This tailored specification provides a clear implementation path that maximizes reuse of BuildOS's existing infrastructure while adding the conversational agent layer. The 95% confidence comes from the fact that all critical pieces already exist and work in production.
