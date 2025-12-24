<!-- thoughts/shared/ideas/braindump-chat-replacement.md -->
# BuildOS Conversational Agent - Multi-Phase Implementation Spec

## Executive Summary

Build a conversational AI agent that replaces the braindump modal with an intelligent chat interface for project creation, updates, auditing, and forecasting. The agent uses natural conversation to guide users through the 9 core project dimensions, executing operations in real-time with a transparent log and approval system.

## Phase 1: Data Model Foundation (Week 1)

### 1.1 Database Schema Updates

#### Create New Tables

```sql
-- Draft projects table (mirrors projects table)
CREATE TABLE project_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Mirror all fields from projects table
    name TEXT,
    slug TEXT,
    description TEXT,
    context TEXT,
    executive_summary TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'draft',
    tags TEXT[],
    calendar_color_id TEXT,
    calendar_settings JSONB,
    calendar_sync_enabled BOOLEAN DEFAULT false,
    source TEXT,
    source_metadata JSONB,

    -- Core dimensions
    core_integrity_ideals TEXT,
    core_people_bonds TEXT,
    core_goals_momentum TEXT,
    core_meaning_identity TEXT,
    core_reality_understanding TEXT,
    core_trust_safeguards TEXT,
    core_opportunity_freedom TEXT,
    core_power_resources TEXT,
    core_harmony_integration TEXT,
    core_context_descriptions JSONB,

    -- Metadata
    dimensions_covered TEXT[],
    question_count INTEGER DEFAULT 0,
    completeness_score INTEGER DEFAULT 0,

    -- Lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finalized_at TIMESTAMP,
    finalized_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    CONSTRAINT unique_user_draft_name UNIQUE(user_id, name)
);

-- Draft tasks table
CREATE TABLE task_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    draft_project_id UUID REFERENCES project_drafts(id) ON DELETE CASCADE,

    -- Mirror all fields from tasks table
    title TEXT NOT NULL,
    description TEXT,
    project_id UUID,
    parent_task_id UUID,
    status TEXT DEFAULT 'backlog',
    priority TEXT DEFAULT 'medium',
    due_date DATE,
    start_date DATE,
    end_date DATE,
    estimated_duration INTEGER,
    actual_duration INTEGER,
    completed_at TIMESTAMP,
    tags TEXT[],
    assignee_id UUID,
    calendar_event_id TEXT,
    recurrence_rule JSONB,
    source TEXT,
    source_metadata JSONB,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finalized_at TIMESTAMP,
    finalized_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL
);

-- Operations table for tracking all agent actions
CREATE TABLE chat_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Operation details
    operation_type TEXT CHECK (operation_type IN ('create', 'update', 'delete')) NOT NULL,
    table_name TEXT NOT NULL,
    entity_id UUID,
    draft_entity_id UUID, -- For operations on drafts

    -- Operation data
    operation_data JSONB NOT NULL,
    before_data JSONB,
    after_data JSONB,

    -- Status tracking
    status TEXT CHECK (status IN ('queued', 'pending', 'approved', 'executing', 'completed', 'failed', 'rolled_back')) DEFAULT 'queued',
    approval_status TEXT CHECK (approval_status IN ('auto', 'manual', 'pending')) DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Metadata
    executed_at TIMESTAMP,
    approved_at TIMESTAMP,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Grouping
    batch_id UUID,
    sequence_number INTEGER,

    INDEX idx_chat_operations_session (chat_session_id, created_at DESC),
    INDEX idx_chat_operations_status (status, approval_status),
    INDEX idx_chat_operations_batch (batch_id, sequence_number)
);

-- Many-to-many relationship tables
CREATE TABLE chat_session_projects (
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    draft_project_id UUID REFERENCES project_drafts(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_session_id, COALESCE(project_id, draft_project_id))
);

CREATE TABLE chat_session_tasks (
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    draft_task_id UUID REFERENCES task_drafts(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_session_id, COALESCE(task_id, draft_task_id))
);

CREATE TABLE chat_session_daily_briefs (
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    daily_brief_id UUID REFERENCES daily_briefs(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_session_id, daily_brief_id)
);
```

#### Modify Existing Tables

```sql
-- Extend chat_sessions
ALTER TABLE chat_sessions
ADD COLUMN chat_type TEXT CHECK (chat_type IN (
    'general',
    'project_create',
    'project_update',
    'project_audit',
    'project_forecast',
    'task_create',
    'daily_brief'
)) DEFAULT 'general',
ADD COLUMN agent_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN draft_context JSONB; -- Stores current drafts being worked on

-- Add operation tracking to messages
ALTER TABLE chat_messages
ADD COLUMN operation_ids UUID[],
ADD COLUMN message_type TEXT CHECK (message_type IN (
    'user_message',
    'assistant_message',
    'system_notification',
    'operation_summary',
    'operation_approval_request'
)) DEFAULT 'assistant_message';
```

### 1.2 TypeScript Type Definitions

```typescript
// packages/shared-types/src/agent.types.ts

export interface ProjectDraft {
	id: string;
	user_id: string;
	// ... mirror all project fields
	dimensions_covered?: string[];
	question_count?: number;
	completeness_score?: number;
	finalized_project_id?: string;
}

export interface TaskDraft {
	id: string;
	user_id: string;
	draft_project_id?: string;
	// ... mirror all task fields
	finalized_task_id?: string;
}

export interface ChatOperation {
	id: string;
	chat_session_id: string;
	user_id: string;

	operation_type: 'create' | 'update' | 'delete';
	table_name: string;
	entity_id?: string;
	draft_entity_id?: string;

	operation_data: any;
	before_data?: any;
	after_data?: any;

	status:
		| 'queued'
		| 'pending'
		| 'approved'
		| 'executing'
		| 'completed'
		| 'failed'
		| 'rolled_back';
	approval_status: 'auto' | 'manual' | 'pending';
	error_message?: string;
	retry_count?: number;

	executed_at?: string;
	approved_at?: string;
	duration_ms?: number;
	created_at: string;

	batch_id?: string;
	sequence_number?: number;
}

export type ChatType =
	| 'general'
	| 'project_create'
	| 'project_update'
	| 'project_audit'
	| 'project_forecast'
	| 'task_create'
	| 'daily_brief';

export interface AgentMetadata {
	dimensions_detected?: string[];
	questions_asked?: number;
	user_responses?: Record<string, string>;
	operations_executed?: number;
	session_phase?: 'gathering_info' | 'clarifying' | 'reviewing' | 'finalizing' | 'completed';
	current_dimension?: string;
	priority_questions?: string[];
}

export interface ChatSessionExtended extends ChatSession {
	chat_type: ChatType;
	agent_metadata?: AgentMetadata;
	draft_context?: {
		project_drafts?: ProjectDraft[];
		task_drafts?: TaskDraft[];
	};
	linked_projects?: Array<{ project_id?: string; draft_project_id?: string }>;
	linked_tasks?: Array<{ task_id?: string; draft_task_id?: string }>;
}
```

## Phase 2: Core Services (Week 2)

### 2.1 Agent Orchestrator Service

```typescript
// apps/web/src/lib/services/agent/agent-orchestrator.service.ts

export class AgentOrchestrator {
	private supabase: SupabaseClient<Database>;
	private llmService: SmartLLMService;
	private contextService: ChatContextService;
	private operationManager: OperationManagerService;
	private draftService: DraftService;
	private brainDumpProcessor: BrainDumpProcessor;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.llmService = new SmartLLMService({
			/* config */
		});
		this.contextService = new ChatContextService(supabase);
		this.operationManager = new OperationManagerService(supabase);
		this.draftService = new DraftService(supabase);
		this.brainDumpProcessor = new BrainDumpProcessor(supabase);
	}

	async *processMessage(
		sessionId: string,
		userMessage: string,
		userId: string
	): AsyncGenerator<AgentSSEMessage> {
		// Load session with draft context
		const session = await this.loadSessionWithContext(sessionId);

		// Route to appropriate handler based on chat_type
		switch (session.chat_type) {
			case 'project_create':
				return this.handleProjectCreate(session, userMessage, userId);
			case 'project_update':
				return this.handleProjectUpdate(session, userMessage, userId);
			case 'project_audit':
				return this.handleProjectAudit(session, userMessage, userId);
			case 'project_forecast':
				return this.handleProjectForecast(session, userMessage, userId);
			case 'task_create':
				return this.handleTaskCreate(session, userMessage, userId);
			default:
				return this.handleGeneral(session, userMessage, userId);
		}
	}

	private async *handleProjectCreate(
		session: ChatSessionExtended,
		userMessage: string,
		userId: string
	): AsyncGenerator<AgentSSEMessage> {
		const metadata = session.agent_metadata || {};
		const phase = metadata.session_phase || 'gathering_info';

		// Get or create draft
		let draft = session.draft_context?.project_drafts?.[0];
		if (!draft) {
			draft = await this.draftService.createProjectDraft(userId);
			yield { type: 'draft_created', draft };
		}

		if (phase === 'gathering_info') {
			// Initial brain dump collection
			yield {
				type: 'text',
				content: "I'm listening. Tell me everything about your project..."
			};

			// Run preparatory analysis
			const analysis = await this.runPreparatoryAnalysis(userMessage);
			const relevantDimensions = this.identifyRelevantDimensions(analysis);

			// Update session metadata
			await this.updateSessionMetadata(session.id, {
				dimensions_detected: relevantDimensions,
				priority_questions: this.prioritizeQuestions(relevantDimensions, analysis),
				session_phase: 'clarifying'
			});

			// Ask first priority question
			const firstQuestion = metadata.priority_questions?.[0];
			yield {
				type: 'text',
				content: `Great start! I have a few clarifying questions to help shape your project. ${firstQuestion}`
			};
		} else if (phase === 'clarifying') {
			// Process answer and update draft
			const dimension = await this.identifyDimensionFromAnswer(userMessage, metadata);

			if (dimension) {
				// Queue operation for dimension update
				const operation = await this.operationManager.queueOperation(
					{
						type: 'update',
						table: 'project_drafts',
						entity_id: draft.id,
						data: { [dimension]: userMessage },
						approval_status: 'auto'
					},
					session.id,
					userId
				);

				yield { type: 'operation_queued', operation };
			}

			// Check if we have enough info or need more questions
			const questionsAsked = (metadata.questions_asked || 0) + 1;
			const maxQuestions = this.determineMaxQuestions(draft);

			if (questionsAsked >= maxQuestions || this.isProjectComplete(draft)) {
				yield {
					type: 'text',
					content:
						'I think we have enough to get started! Would you like to review and create your project, or answer a few more questions to add more detail?'
				};
				await this.updateSessionMetadata(session.id, { session_phase: 'reviewing' });
			} else {
				// Ask next priority question
				const nextQuestion = metadata.priority_questions?.[questionsAsked];
				yield { type: 'text', content: nextQuestion };
				await this.updateSessionMetadata(session.id, { questions_asked: questionsAsked });
			}
		} else if (phase === 'reviewing') {
			// Show queued operations for approval
			const queuedOps = await this.operationManager.getQueuedOperations(session.id);
			yield { type: 'operations_for_approval', operations: queuedOps };

			if (
				userMessage.toLowerCase().includes('create') ||
				userMessage.toLowerCase().includes('yes')
			) {
				// Execute all approved operations
				for (const op of queuedOps) {
					const result = await this.operationManager.executeOperation(op);
					yield { type: 'operation_executed', operation: result };
				}

				// Finalize draft into real project
				const project = await this.draftService.finalizeDraft(draft.id);
				yield { type: 'project_created', project };

				await this.updateSessionMetadata(session.id, { session_phase: 'completed' });
			}
		}
	}

	private async runPreparatoryAnalysis(brainDump: string): Promise<any> {
		// Reuse existing preparatory analysis from BrainDumpProcessor
		const promptTemplate = this.brainDumpProcessor.getPreparatoryAnalysisPrompt();
		return await this.llmService.getJSONResponse({
			systemPrompt: promptTemplate,
			userPrompt: brainDump,
			profile: 'fast',
			operationType: 'brain_dump_context'
		});
	}
}
```

### 2.2 Operation Manager Service

```typescript
// apps/web/src/lib/services/agent/operation-manager.service.ts

export class OperationManagerService {
	constructor(private supabase: SupabaseClient<Database>) {}

	async queueOperation(
		operationData: Partial<ChatOperation>,
		sessionId: string,
		userId: string
	): Promise<ChatOperation> {
		const { data } = await this.supabase
			.from('chat_operations')
			.insert({
				chat_session_id: sessionId,
				user_id: userId,
				status: 'queued',
				...operationData
			})
			.select()
			.single();

		return data!;
	}

	async approveOperations(
		operationIds: string[],
		approvalType: 'auto' | 'manual'
	): Promise<void> {
		await this.supabase
			.from('chat_operations')
			.update({
				approval_status: approvalType,
				approved_at: new Date().toISOString(),
				status: 'pending'
			})
			.in('id', operationIds);
	}

	async executeOperation(operation: ChatOperation): Promise<ChatOperation> {
		try {
			// Update status to executing
			await this.updateOperationStatus(operation.id, 'executing');

			// Execute based on type
			let result: any;
			switch (operation.operation_type) {
				case 'create':
					result = await this.executeCreate(operation);
					break;
				case 'update':
					result = await this.executeUpdate(operation);
					break;
				case 'delete':
					result = await this.executeDelete(operation);
					break;
			}

			// Update with success
			await this.supabase
				.from('chat_operations')
				.update({
					status: 'completed',
					after_data: result,
					executed_at: new Date().toISOString()
				})
				.eq('id', operation.id);

			return { ...operation, status: 'completed', after_data: result };
		} catch (error) {
			// Try to fix with LLM
			const fixed = await this.tryFixWithLLM(operation, error);
			if (fixed) {
				return this.executeOperation(fixed);
			}

			// Update with failure
			await this.updateOperationStatus(operation.id, 'failed', error.message);
			throw error;
		}
	}

	private async tryFixWithLLM(
		operation: ChatOperation,
		error: Error
	): Promise<ChatOperation | null> {
		const systemPrompt = `You encountered an error executing an operation. 
    Analyze the error and suggest a fix by modifying the operation data.
    
    Operation: ${JSON.stringify(operation)}
    Error: ${error.message}
    
    Return a corrected operation or null if unfixable.`;

		const response = await this.llmService.getJSONResponse({
			systemPrompt,
			userPrompt: 'Fix this operation',
			profile: 'fast'
		});

		return response.fixed_operation;
	}
}
```

### 2.3 Draft Service

```typescript
// apps/web/src/lib/services/agent/draft.service.ts

export class DraftService {
	constructor(private supabase: SupabaseClient<Database>) {}

	async createProjectDraft(userId: string): Promise<ProjectDraft> {
		const { data } = await this.supabase
			.from('project_drafts')
			.insert({
				user_id: userId,
				status: 'draft',
				dimensions_covered: []
			})
			.select()
			.single();

		return data!;
	}

	async createTaskDraft(userId: string, projectDraftId?: string): Promise<TaskDraft> {
		const { data } = await this.supabase
			.from('task_drafts')
			.insert({
				user_id: userId,
				draft_project_id: projectDraftId,
				status: 'backlog'
			})
			.select()
			.single();

		return data!;
	}

	async finalizeDraft(draftId: string): Promise<Project> {
		// Get draft
		const { data: draft } = await this.supabase
			.from('project_drafts')
			.select('*')
			.eq('id', draftId)
			.single();

		// Create real project
		const { data: project } = await this.supabase
			.from('projects')
			.insert({
				// Copy all fields from draft
				user_id: draft.user_id,
				name: draft.name,
				slug: draft.slug,
				description: draft.description,
				context: draft.context
				// ... all other fields
			})
			.select()
			.single();

		// Update draft with finalized ID
		await this.supabase
			.from('project_drafts')
			.update({
				finalized_project_id: project.id,
				finalized_at: new Date().toISOString()
			})
			.eq('id', draftId);

		// Finalize any associated task drafts
		await this.finalizeTaskDrafts(draftId, project.id);

		return project!;
	}

	private async finalizeTaskDrafts(
		draftProjectId: string,
		finalProjectId: string
	): Promise<void> {
		// Get all task drafts
		const { data: taskDrafts } = await this.supabase
			.from('task_drafts')
			.select('*')
			.eq('draft_project_id', draftProjectId);

		// Create real tasks
		for (const draft of taskDrafts || []) {
			const { data: task } = await this.supabase
				.from('tasks')
				.insert({
					// Copy fields from draft
					user_id: draft.user_id,
					project_id: finalProjectId,
					title: draft.title
					// ... other fields
				})
				.select()
				.single();

			// Update draft
			await this.supabase
				.from('task_drafts')
				.update({
					finalized_task_id: task.id,
					finalized_at: new Date().toISOString()
				})
				.eq('id', draft.id);
		}
	}
}
```

## Phase 3: Agent Tools & Prompts (Week 2-3)

### 3.1 Extended Tool Definitions

```typescript
// apps/web/src/lib/chat/agent-tools.config.ts

export const AGENT_TOOLS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'update_draft_dimension',
			description: 'Update a specific core dimension of the draft project',
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
			name: 'create_draft_task',
			description: 'Create a draft task linked to draft project',
			parameters: {
				type: 'object',
				properties: {
					draft_project_id: { type: 'string' },
					title: { type: 'string' },
					description: { type: 'string' },
					priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
					estimated_duration: { type: 'number' }
				},
				required: ['title']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'queue_operation',
			description: 'Queue an operation for review/approval',
			parameters: {
				type: 'object',
				properties: {
					operation_type: { type: 'string', enum: ['create', 'update', 'delete'] },
					table_name: { type: 'string' },
					operation_data: { type: 'object' },
					auto_approve: { type: 'boolean', default: false }
				},
				required: ['operation_type', 'table_name', 'operation_data']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'execute_braindump_processor',
			description: 'Process large text using traditional braindump processor',
			parameters: {
				type: 'object',
				properties: {
					brain_dump: { type: 'string' },
					project_id: { type: 'string' },
					auto_execute: { type: 'boolean', default: false }
				},
				required: ['brain_dump']
			}
		}
	}
];
```

### 3.2 Agent System Prompts

```typescript
// apps/web/src/lib/services/prompts/agent-system-prompts.ts

export const AGENT_SYSTEM_PROMPTS = {
	project_create: `You are a thoughtful project consultant helping users organize their ideas.

PERSONALITY: Friendly, patient, naturally curious. Like a colleague brainstorming together.

CONVERSATION FLOW:
1. LISTENING PHASE: Let users brain dump without interruption. Just acknowledge.
2. ANALYSIS: Silently determine which of the 9 dimensions are relevant.
3. CLARIFYING: Ask 3-5 questions for simple projects, 7-10 for complex ones.
4. FINALIZING: Help user review and create the project.

THE 9 CORE DIMENSIONS (only ask about relevant ones):
1. Integrity & Ideals - What does success/done look like?
2. People & Bonds - Who's involved, stakeholders, communication?
3. Goals & Momentum - Milestones, timeline, deadlines?
4. Meaning & Identity - Why matters, what's unique?
5. Reality & Understanding - Current state, problem, constraints?
6. Trust & Safeguards - Risks, backup plans?
7. Opportunity & Freedom - Options, experiments, pivots?
8. Power & Resources - Budget, tools, permissions?
9. Harmony & Integration - Progress tracking, feedback loops?

QUESTION PRIORITIZATION:
- Ask most critical questions first
- Accept partial answers - users can update later
- After initial questions, ask: "Ready to create, or would you like to add more detail?"

NATURAL LANGUAGE:
- Vary your phrasing
- Use conversational tone
- Don't list all dimensions
- Weave questions naturally into conversation

Use queue_operation tool to build up the project incrementally.`,

	project_update: `You are an efficient project assistant for quick updates.

BE DIRECT: Identify changes and execute immediately.
NO CONFIRMATION: Just show operations in the log.
STAY FOCUSED: Only ask clarifying questions if ambiguous.

Available context: Current project with all dimensions and tasks.

After updates: "Updated! Anything else?"`,

	project_audit: `You are a constructive critic reviewing projects.

AUDIT LEVEL: 7/10 - Direct but not discouraging.

ANALYZE:
- Missing dimensions
- Inconsistencies
- Unrealistic plans
- Hidden risks
- Resource gaps

ASK PROBING QUESTIONS:
- "What if your main assumption is wrong?"
- "How will you handle [specific risk]?"
- "Your timeline assumes everything goes perfectly. What's the realistic timeline?"

End with concrete recommendations.`,

	project_forecast: `You are a strategic advisor predicting project outcomes.

Generate 3 scenarios:
- OPTIMISTIC (30% chance): Best case
- REALISTIC (50% chance): Expected case  
- PESSIMISTIC (20% chance): Challenging case

For each: Describe outcome, key factors, early warning signs.

End with critical decision points and success factors.`
};
```

## Phase 4: UI Components (Week 3-4)

### 4.1 Main Agent Modal Component

```svelte
<!-- apps/web/src/lib/components/agent/AgentModal.svelte -->

<script lang="ts">
	import { onMount } from 'svelte';
	import ChatInterface from './ChatInterface.svelte';
	import OperationsPanel from './OperationsPanel.svelte';
	import ProjectSelector from './ProjectSelector.svelte';
	import PastChatsPanel from './PastChatsPanel.svelte';

	export let isOpen = false;
	export let initialContext: ChatType = 'project_create';
	export let entityId: string | null = null;

	let selectedProject: Project | null = null;
	let showProjectSelector = false;
	let session: ChatSessionExtended | null = null;
	let operations: ChatOperation[] = [];
	let queuedOperations: ChatOperation[] = [];
	let pastChats: ChatSession[] = [];

	onMount(async () => {
		// Determine if we need project selector
		const currentPath = window.location.pathname;
		if (currentPath.includes('/projects')) {
			showProjectSelector = true;
		} else {
			await startNewSession();
		}
	});

	async function startNewSession() {
		const response = await fetch('/api/agent/sessions', {
			method: 'POST',
			body: JSON.stringify({
				chat_type: initialContext,
				entity_id: entityId
			})
		});
		session = await response.json();

		// Load past chats if entity-specific
		if (entityId) {
			await loadPastChats(entityId);
		}
	}

	async function loadPastChats(entityId: string) {
		const response = await fetch(`/api/agent/chats?entity_id=${entityId}`);
		pastChats = (await response.json()).chats;
	}

	function handleProjectSelect(project: Project, mode: ChatType) {
		selectedProject = project;
		initialContext = mode;
		entityId = project.id;
		showProjectSelector = false;
		startNewSession();
	}

	function handleOperationQueued(operation: ChatOperation) {
		queuedOperations = [...queuedOperations, operation];
	}

	function handleOperationApproved(operation: ChatOperation) {
		queuedOperations = queuedOperations.filter((op) => op.id !== operation.id);
		operations = [...operations, operation];
	}

	async function handleApproveAll() {
		const ids = queuedOperations.map((op) => op.id);
		await fetch('/api/agent/operations/approve', {
			method: 'POST',
			body: JSON.stringify({ operation_ids: ids })
		});

		operations = [...operations, ...queuedOperations];
		queuedOperations = [];
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 bg-black/50 z-50">
		<div class="fixed inset-4 bg-white rounded-lg flex flex-col">
			{#if showProjectSelector}
				<ProjectSelector onSelect={handleProjectSelect} onClose={() => (isOpen = false)} />
			{:else}
				<div class="flex flex-1 overflow-hidden">
					<!-- Left Panel: Past Chats (if entity-specific) -->
					{#if pastChats.length > 0}
						<div class="w-64 border-r">
							<PastChatsPanel
								{pastChats}
								onSelectChat={(chat) => loadSession(chat.id)}
							/>
						</div>
					{/if}

					<!-- Center: Main Chat -->
					<div class="flex-1 flex flex-col">
						<ChatInterface
							{session}
							onOperationQueued={handleOperationQueued}
							onOperationExecuted={handleOperationApproved}
						/>
					</div>

					<!-- Right Panel: Operations -->
					<div class="w-96 border-l flex flex-col">
						<OperationsPanel
							{operations}
							{queuedOperations}
							onApprove={handleOperationApproved}
							onApproveAll={handleApproveAll}
						/>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
```

### 4.2 Project Selector Component

```svelte
<!-- apps/web/src/lib/components/agent/ProjectSelector.svelte -->

<script lang="ts">
	import { onMount } from 'svelte';

	export let onSelect: (project: Project, mode: ChatType) => void;
	export let onClose: () => void;

	let projects: Project[] = [];
	let recentChats: Record<string, ChatSession[]> = {};

	onMount(async () => {
		await loadProjects();
	});

	async function loadProjects() {
		const response = await fetch('/api/projects');
		projects = (await response.json()).projects;

		// Load recent chats for each project
		for (const project of projects) {
			const chatsResponse = await fetch(`/api/agent/chats?project_id=${project.id}&limit=3`);
			recentChats[project.id] = (await chatsResponse.json()).chats;
		}
	}

	function selectProject(project: Project, mode: ChatType) {
		onSelect(project, mode);
	}
</script>

<div class="p-6">
	<div class="flex justify-between items-center mb-6">
		<h2 class="text-2xl font-bold">Select a Project</h2>
		<button on:click={onClose} class="text-gray-500 hover:text-gray-700">
			<svg class="w-6 h-6" fill="none" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	</div>

	<div class="mb-6">
		<button
			on:click={() => onSelect(null, 'project_create')}
			class="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
		>
			<div class="text-center">
				<svg class="mx-auto w-12 h-12 text-gray-400" fill="none" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				<p class="mt-2 text-lg font-medium">Create New Project</p>
				<p class="text-sm text-gray-500">Start fresh with AI guidance</p>
			</div>
		</button>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
		{#each projects as project}
			<div class="border rounded-lg p-4 hover:shadow-lg transition">
				<h3 class="font-semibold text-lg mb-2">{project.name}</h3>
				<p class="text-sm text-gray-600 mb-3 line-clamp-2">{project.description}</p>

				<!-- Recent chats for this project -->
				{#if recentChats[project.id]?.length > 0}
					<div class="mb-3 p-2 bg-gray-50 rounded text-xs">
						<p class="font-medium mb-1">Recent conversations:</p>
						{#each recentChats[project.id] as chat}
							<button
								on:click={() => onSelect(project, chat.chat_type)}
								class="block w-full text-left py-1 hover:text-blue-600"
							>
								{chat.title || 'Untitled chat'} ({chat.chat_type})
							</button>
						{/each}
					</div>
				{/if}

				<div class="flex gap-2">
					<button
						on:click={() => selectProject(project, 'project_update')}
						class="flex-1 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
					>
						Update
					</button>
					<button
						on:click={() => selectProject(project, 'project_audit')}
						class="flex-1 px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
					>
						Audit
					</button>
					<button
						on:click={() => selectProject(project, 'project_forecast')}
						class="flex-1 px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
					>
						Forecast
					</button>
				</div>
			</div>
		{/each}
	</div>

	<!-- Quick braindump option -->
	<div class="mt-6 pt-6 border-t">
		<button
			on:click={() => (window.location.href = '/braindump/classic')}
			class="text-sm text-gray-500 hover:text-gray-700"
		>
			Or use classic braindump mode →
		</button>
	</div>
</div>
```

### 4.3 Operations Panel Component

```svelte
<!-- apps/web/src/lib/components/agent/OperationsPanel.svelte -->

<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fade, slide } from 'svelte/transition';
	import OperationCard from './OperationCard.svelte';

	export let operations: ChatOperation[] = [];
	export let queuedOperations: ChatOperation[] = [];
	export let onApprove: (op: ChatOperation) => void;
	export let onApproveAll: () => void;

	let expandedOperations: Set<string> = new Set();

	function toggleExpanded(id: string) {
		if (expandedOperations.has(id)) {
			expandedOperations.delete(id);
		} else {
			expandedOperations.add(id);
		}
		expandedOperations = expandedOperations;
	}
</script>

<div class="flex flex-col h-full">
	<!-- Completed Operations Log (Top) -->
	<div class="flex-1 border-b overflow-y-auto">
		<div class="p-4 border-b bg-gray-50">
			<h3 class="font-semibold">Operations Log ({operations.length})</h3>
		</div>
		<div class="p-2 space-y-2">
			{#each operations as op (op.id)}
				<div animate:flip transition:fade>
					<OperationCard
						operation={op}
						expanded={expandedOperations.has(op.id)}
						onToggle={() => toggleExpanded(op.id)}
						readonly={true}
					/>
				</div>
			{/each}
			{#if operations.length === 0}
				<p class="text-center text-gray-400 py-8">No operations yet</p>
			{/if}
		</div>
	</div>

	<!-- Queued Operations (Bottom) -->
	<div class="flex-1 overflow-y-auto">
		<div class="p-4 border-b bg-yellow-50">
			<div class="flex justify-between items-center">
				<h3 class="font-semibold">Queued Operations ({queuedOperations.length})</h3>
				{#if queuedOperations.length > 0}
					<button
						on:click={onApproveAll}
						class="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
					>
						Approve All
					</button>
				{/if}
			</div>
		</div>
		<div class="p-2 space-y-2">
			{#each queuedOperations as op (op.id)}
				<div animate:flip transition:slide>
					<OperationCard
						operation={op}
						expanded={expandedOperations.has(op.id)}
						onToggle={() => toggleExpanded(op.id)}
						onApprove={() => onApprove(op)}
						readonly={false}
					/>
				</div>
			{/each}
			{#if queuedOperations.length === 0}
				<p class="text-center text-gray-400 py-8">No queued operations</p>
			{/if}
		</div>
	</div>
</div>
```

## Phase 5: API Endpoints & Streaming (Week 4)

### 5.1 Main Agent Streaming Endpoint

```typescript
// apps/web/src/routes/api/agent/stream/+server.ts

import { AgentOrchestrator } from '$lib/services/agent/agent-orchestrator.service';

export async function POST({ request, locals }) {
	const { message, session_id, chat_type, entity_id, quick_braindump } = await request.json();

	const userId = locals.user.id;
	const supabase = locals.supabase;

	// Handle quick braindump mode
	if (quick_braindump) {
		return handleQuickBraindump(message, entity_id, userId, supabase);
	}

	// Create or load session
	let sessionId = session_id;
	if (!sessionId) {
		sessionId = await createSession(userId, chat_type, entity_id, supabase);
	}

	// Initialize orchestrator
	const orchestrator = new AgentOrchestrator(supabase);

	// Create SSE stream
	const stream = new ReadableStream({
		async start(controller) {
			try {
				// Process message with agent
				const eventGenerator = orchestrator.processMessage(sessionId, message, userId);

				for await (const event of eventGenerator) {
					// Format as SSE
					const data = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(new TextEncoder().encode(data));
				}

				// Send completion event
				controller.enqueue(
					new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
				);
			} catch (error) {
				console.error('Agent stream error:', error);
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

async function handleQuickBraindump(
	brainDump: string,
	projectId: string | null,
	userId: string,
	supabase: SupabaseClient
): Promise<Response> {
	// Use traditional BrainDumpProcessor
	const processor = new BrainDumpProcessor(supabase);
	const result = await processor.processBrainDump({
		brainDump,
		userId,
		selectedProjectId: projectId,
		brainDumpId: generateId(),
		options: { autoExecute: true }
	});

	return json({ success: true, operations: result.operations });
}
```

### 5.2 Session Management Endpoints

```typescript
// apps/web/src/routes/api/agent/sessions/+server.ts

export async function POST({ request, locals }) {
	const { chat_type, entity_id } = await request.json();
	const userId = locals.user.id;
	const supabase = locals.supabase;

	// Create new session
	const { data: session } = await supabase
		.from('chat_sessions')
		.insert({
			user_id: userId,
			chat_type: chat_type || 'general',
			context_type: chat_type || 'global',
			entity_id,
			status: 'active',
			agent_metadata: {
				session_phase: 'gathering_info',
				questions_asked: 0
			}
		})
		.select()
		.single();

	// Link to project/task if entity_id provided
	if (entity_id && chat_type?.includes('project')) {
		await supabase.from('chat_session_projects').insert({
			chat_session_id: session.id,
			project_id: entity_id
		});
	}

	return json({ session });
}

// apps/web/src/routes/api/agent/sessions/[id]/+server.ts

export async function GET({ params, locals }) {
	const sessionId = params.id;
	const supabase = locals.supabase;

	// Load full session context
	const { data: session } = await supabase
		.from('chat_sessions')
		.select(
			`
      *,
      messages:chat_messages(*),
      operations:chat_operations(*)
        order by created_at desc,
      project_links:chat_session_projects(
        project:projects(*),
        draft_project:project_drafts(*)
      ),
      task_links:chat_session_tasks(
        task:tasks(*),
        draft_task:task_drafts(*)
      )
    `
		)
		.eq('id', sessionId)
		.single();

	// Assemble draft context
	const draftContext = {
		project_drafts: session.project_links
			?.filter((l) => l.draft_project)
			.map((l) => l.draft_project),
		task_drafts: session.task_links?.filter((l) => l.draft_task).map((l) => l.draft_task)
	};

	return json({
		session: {
			...session,
			draft_context: draftContext
		}
	});
}
```

### 5.3 Operations Management Endpoints

```typescript
// apps/web/src/routes/api/agent/operations/approve/+server.ts

export async function POST({ request, locals }) {
	const { operation_ids, approval_type = 'manual' } = await request.json();
	const supabase = locals.supabase;

	const operationManager = new OperationManagerService(supabase);

	// Approve operations
	await operationManager.approveOperations(operation_ids, approval_type);

	// Execute approved operations
	const results = [];
	for (const id of operation_ids) {
		const { data: operation } = await supabase
			.from('chat_operations')
			.select('*')
			.eq('id', id)
			.single();

		const result = await operationManager.executeOperation(operation);
		results.push(result);
	}

	return json({ success: true, operations: results });
}
```

## Phase 6: Navigation Integration (Week 5)

### 6.1 Update Navigation Bar

```svelte
<!-- apps/web/src/lib/components/navigation/NavBar.svelte -->

<script lang="ts">
	import AgentModal from '$lib/components/agent/AgentModal.svelte';

	let showAgentModal = false;
	let agentInitialContext: ChatType = 'project_create';
	let agentEntityId: string | null = null;

	function openAgent() {
		// Determine context based on current page
		const path = window.location.pathname;

		if (path.includes('/projects/')) {
			// On specific project page
			const projectId = path.split('/projects/')[1];
			agentEntityId = projectId;
			// Will show project selector with options
		} else if (path === '/projects') {
			// On projects list page
			// Will show project selector
		} else if (path.includes('/tasks/')) {
			// On specific task page
			const taskId = path.split('/tasks/')[1];
			agentEntityId = taskId;
			agentInitialContext = 'project_update';
		} else {
			// Default to project creation
			agentInitialContext = 'project_create';
			agentEntityId = null;
		}

		showAgentModal = true;
	}
</script>

<nav class="flex items-center justify-between px-6 py-4 border-b">
	<div class="flex items-center gap-6">
		<a href="/" class="text-xl font-bold">BuildOS</a>
		<a href="/projects" class="hover:text-blue-600">Projects</a>
		<a href="/tasks" class="hover:text-blue-600">Tasks</a>
		<a href="/calendar" class="hover:text-blue-600">Calendar</a>
	</div>

	<div class="flex items-center gap-4">
		<!-- Agent Button (replaces braindump) -->
		<button
			on:click={openAgent}
			class="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z"
				/>
			</svg>
			<span>AI Agent</span>
		</button>

		<!-- Keep classic braindump as secondary option -->
		<a href="/braindump/classic" class="text-sm text-gray-500 hover:text-gray-700">
			Classic Mode
		</a>
	</div>
</nav>

<AgentModal
	bind:isOpen={showAgentModal}
	initialContext={agentInitialContext}
	entityId={agentEntityId}
/>
```

## Phase 7: Testing & Deployment (Week 5-6)

### 7.1 Test Suite

```typescript
// apps/web/src/tests/agent/agent-orchestrator.test.ts

import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '$lib/services/agent/agent-orchestrator.service';

describe('AgentOrchestrator', () => {
	it('should detect relevant dimensions from brain dump', async () => {
		const orchestrator = new AgentOrchestrator(supabase);
		const brainDump = 'I want to build a mobile app for tracking workouts...';

		const dimensions = await orchestrator.detectRelevantDimensions(brainDump);

		expect(dimensions).toContain('core_goals_momentum');
		expect(dimensions).toContain('core_integrity_ideals');
	});

	it('should create draft and queue operations', async () => {
		const sessionId = 'test-session';
		const userId = 'test-user';

		const generator = orchestrator.processMessage(sessionId, 'Building a fitness app', userId);

		const events = [];
		for await (const event of generator) {
			events.push(event);
		}

		expect(events).toContainEqual(expect.objectContaining({ type: 'draft_created' }));
		expect(events).toContainEqual(expect.objectContaining({ type: 'operation_queued' }));
	});

	it('should handle operation failures gracefully', async () => {
		// Test LLM fix attempt
		const failedOp = {
			operation_type: 'create',
			table_name: 'projects',
			operation_data: { name: null } // Invalid
		};

		const fixed = await operationManager.tryFixWithLLM(failedOp, new Error('name required'));
		expect(fixed?.operation_data.name).toBeTruthy();
	});
});
```

### 7.2 Migration Script

```typescript
// apps/web/src/migrations/add-agent-tables.ts

export async function up(supabase: SupabaseClient) {
	// Run all CREATE TABLE statements from Phase 1.1
	await supabase.rpc('exec_sql', {
		sql: PROJECT_DRAFTS_TABLE_SQL
	});

	await supabase.rpc('exec_sql', {
		sql: TASK_DRAFTS_TABLE_SQL
	});

	await supabase.rpc('exec_sql', {
		sql: CHAT_OPERATIONS_TABLE_SQL
	});

	// Add columns to existing tables
	await supabase.rpc('exec_sql', {
		sql: CHAT_SESSIONS_ALTER_SQL
	});
}

export async function down(supabase: SupabaseClient) {
	// Rollback migrations
	await supabase.rpc('exec_sql', {
		sql: `DROP TABLE IF EXISTS project_drafts CASCADE;`
	});
	// etc...
}
```

### 7.3 Feature Flag Configuration

```typescript
// apps/web/src/lib/config/features.ts

export const FEATURE_FLAGS = {
	agent: {
		enabled: process.env.PUBLIC_AGENT_ENABLED === 'true',
		rollout_percentage: parseInt(process.env.PUBLIC_AGENT_ROLLOUT || '100'),
		modes: {
			project_create: true,
			project_update: true,
			project_audit: true,
			project_forecast: true,
			task_create: false // Phase 2
		},
		classic_braindump_enabled: true
	}
};

export function isUserInRollout(userId: string): boolean {
	const hash = hashUserId(userId);
	return hash % 100 < FEATURE_FLAGS.agent.rollout_percentage;
}
```

## Implementation Checklist

### Phase 1: Foundation ✅

- [ ] Create database tables
- [ ] Set up TypeScript types
- [ ] Create migration scripts
- [ ] Test database operations

### Phase 2: Core Services

- [ ] Build AgentOrchestrator
- [ ] Build OperationManager
- [ ] Build DraftService
- [ ] Integrate with BrainDumpProcessor
- [ ] Create system prompts

### Phase 3: Agent Tools

- [ ] Define agent-specific tools
- [ ] Implement tool handlers
- [ ] Test tool calling
- [ ] Refine prompts based on testing

### Phase 4: UI Components

- [ ] Build AgentModal
- [ ] Build ChatInterface
- [ ] Build OperationsPanel
- [ ] Build ProjectSelector
- [ ] Build PastChatsPanel
- [ ] Build OperationCard components

### Phase 5: API & Streaming

- [ ] Implement streaming endpoint
- [ ] Build session management
- [ ] Create operations endpoints
- [ ] Test SSE streaming
- [ ] Handle error cases

### Phase 6: Navigation

- [ ] Update NavBar component
- [ ] Add context detection
- [ ] Implement quick braindump fallback
- [ ] Test navigation flows

### Phase 7: Testing & Launch

- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test all agent modes
- [ ] Deploy with feature flags
- [ ] Monitor and iterate

## Success Metrics

- Agent adoption rate > 60% within first month
- Average session completion rate > 70%
- Operations success rate > 95%
- User satisfaction (thumbs up) > 80%
- Project creation time reduced by 40%

This completes the comprehensive implementation spec for the BuildOS Conversational Agent feature. The phased approach allows for iterative development while maintaining system stability.
