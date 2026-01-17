// apps/worker/src/workers/chat/chatSessionActivityProcessor.ts
// Extension to chat classification that generates activity logs and next steps for projects

import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import type {
	ProjectLogEntityType,
	ProjectLogInsert,
	NextStepGenerationContext,
	Json
} from '@buildos/shared-types';

// =============================================================================
// Types
// =============================================================================

/**
 * A chat operation record from the database
 */
interface ChatOperation {
	id: string;
	chat_session_id: string;
	operation_type: string;
	table_name: string;
	entity_id: string | null;
	before_data: Record<string, unknown> | null;
	after_data: Record<string, unknown> | null;
	status: string | null;
	executed_at: string | null;
	created_at: string | null;
}

/**
 * Chat session with context information
 */
interface ChatSessionContext {
	id: string;
	context_type: string;
	entity_id: string | null;
	user_id: string;
}

/**
 * Result from next step generation
 */
interface NextStepGenerationResult {
	nextStepShort: string;
	nextStepLong: string;
}

/**
 * Processed change summary for a session
 */
interface SessionChangeSummary {
	projectId: string | null;
	created: Array<{ type: ProjectLogEntityType; name: string; id: string }>;
	updated: Array<{ type: ProjectLogEntityType; name: string; id: string }>;
	deleted: Array<{ type: ProjectLogEntityType; name: string; id: string }>;
	activityLogs: ProjectLogInsert[];
}

interface GoalSummary {
	id: string;
	name: string;
	type_key: string | null;
	props: Record<string, unknown> | null;
}

interface TaskSummary {
	id: string;
	title: string;
	state_key: string;
	completed_at: string | null;
}

interface EdgeSummary {
	src_id: string;
	src_kind: string;
	dst_id: string;
	dst_kind: string;
	rel: string;
}

interface TaskGoalLink {
	taskId: string;
	goalId: string;
	rel: string;
}

type RecentActivityEntry = NonNullable<NextStepGenerationContext['recentActivity']>[number];

// =============================================================================
// Constants
// =============================================================================

/**
 * Mapping from database table names to entity types
 */
const TABLE_TO_ENTITY_TYPE: Record<string, ProjectLogEntityType> = {
	onto_projects: 'project',
	onto_tasks: 'task',
	onto_documents: 'document',
	onto_notes: 'note',
	onto_goals: 'goal',
	onto_milestones: 'milestone',
	onto_risks: 'risk',
	onto_plans: 'plan',
	onto_requirements: 'requirement',
	onto_sources: 'source',
	onto_edges: 'edge',
	// Legacy table mappings
	tasks: 'task',
	projects: 'project',
	notes: 'note'
};

/**
 * Operation type mapping
 */
const OPERATION_TO_ACTION: Record<string, 'created' | 'updated' | 'deleted'> = {
	insert: 'created',
	create: 'created',
	update: 'updated',
	upsert: 'updated',
	delete: 'deleted',
	remove: 'deleted'
};

/**
 * System prompt for next step generation
 */
const NEXT_STEP_SYSTEM_PROMPT = `You are a project advisor helping users identify their next action. Use goals and recent progress to propose the most helpful next step.

Priorities (in order):
1. Anchor on active goals. The next step should directly advance a goal whenever possible.
2. Use recent progress and recent session changes to infer momentum. Continue the same goal or phase if it makes sense.
3. If recent work maps to a parent goal, propose the next task related to that goal.
4. If no goals exist, choose the most impactful active or overdue task.

Guidelines:
1. The short version should be ONE clear sentence (max 100 chars) answering "What should I do next?"
2. The long version should be 2-4 sentences (max 650 chars) explaining:
   - What to do and why
   - The parent goal it supports when available
   - Any important context or considerations
   - References to specific tasks/documents/goals using the format [[type:id|name]]
3. Focus on momentum - what moves the project forward
4. Be specific and actionable, not vague
5. Prefer continuity with recent work unless there's a more urgent goal or blocker

Entity reference format: [[type:id|display_name]]
Valid types: task, document, goal, milestone, risk, plan, user

Example short: "Review the draft presentation and share feedback with the team."
Example long: "The [[task:abc-123|draft presentation]] is ready for review. Focus on the key messaging in slides 3-5, then share your feedback with [[user:def-456|Sarah]] before the Friday deadline. Consider the [[document:ghi-789|brand guidelines]] for consistency."

Respond ONLY with valid JSON:
{
  "nextStepShort": "Clear, actionable one-sentence next step",
  "nextStepLong": "Detailed explanation with [[entity:id|name]] references where helpful"
}`;

// =============================================================================
// Main Processing Functions
// =============================================================================

/**
 * Process activity logging and next step generation for a chat session
 * This is called after the main classification job completes
 *
 * @param sessionId - The chat session ID
 * @param userId - The user ID
 * @returns Summary of what was processed
 */
export async function processSessionActivityAndNextSteps(
	sessionId: string,
	userId: string
): Promise<{
	activityLogsCreated: number;
	nextStepUpdated: boolean;
	projectId: string | null;
}> {
	console.log(`📊 Processing activity and next steps for session ${sessionId}`);

	// 1. Get session context to determine the project
	const sessionContext = await getSessionContext(sessionId, userId);
	if (!sessionContext) {
		console.log(`⚠️ Session ${sessionId} not found or not authorized`);
		return { activityLogsCreated: 0, nextStepUpdated: false, projectId: null };
	}

	// Only process project-related sessions
	if (sessionContext.context_type !== 'project' || !sessionContext.entity_id) {
		console.log(`⏭️ Session ${sessionId} is not project-related, skipping activity processing`);
		return { activityLogsCreated: 0, nextStepUpdated: false, projectId: null };
	}

	const projectId = sessionContext.entity_id;

	// 2. Get chat operations for this session
	const operations = await getSessionOperations(sessionId);
	console.log(`📝 Found ${operations.length} operations for session ${sessionId}`);

	// 3. Process operations into activity logs
	const changeSummary = processOperationsToActivityLogs(operations, projectId, userId, sessionId);

	// 4. Insert activity logs
	let activityLogsCreated = 0;
	if (changeSummary.activityLogs.length > 0) {
		activityLogsCreated = await insertActivityLogs(changeSummary.activityLogs);
		console.log(`✅ Created ${activityLogsCreated} activity logs`);
	}

	// 5. Generate and update next steps
	let nextStepUpdated = false;
	try {
		const nextStep = await generateNextSteps(sessionId, userId, projectId, changeSummary);
		if (nextStep) {
			await updateProjectNextStep(projectId, nextStep);
			nextStepUpdated = true;
			console.log(`✅ Updated next step for project ${projectId}`);
		}
	} catch (error) {
		console.error(`⚠️ Failed to generate next steps:`, error);
		// Don't fail the whole process if next step generation fails
	}

	return {
		activityLogsCreated,
		nextStepUpdated,
		projectId
	};
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the session context (project association)
 */
async function getSessionContext(
	sessionId: string,
	userId: string
): Promise<ChatSessionContext | null> {
	const { data, error } = await supabase
		.from('chat_sessions')
		.select('id, context_type, entity_id, user_id')
		.eq('id', sessionId)
		.eq('user_id', userId)
		.single();

	if (error || !data) {
		return null;
	}

	return data as ChatSessionContext;
}

/**
 * Get all operations from a chat session
 */
async function getSessionOperations(sessionId: string): Promise<ChatOperation[]> {
	const { data, error } = await supabase
		.from('chat_operations')
		.select('*')
		.eq('chat_session_id', sessionId)
		.eq('status', 'completed') // Only include completed operations
		.order('created_at', { ascending: true });

	if (error) {
		console.error('Error fetching chat operations:', error);
		return [];
	}

	return (data ?? []) as ChatOperation[];
}

/**
 * Process chat operations into activity log entries
 */
function processOperationsToActivityLogs(
	operations: ChatOperation[],
	projectId: string,
	userId: string,
	sessionId: string
): SessionChangeSummary {
	const summary: SessionChangeSummary = {
		projectId,
		created: [],
		updated: [],
		deleted: [],
		activityLogs: []
	};

	for (const op of operations) {
		// Map table name to entity type
		const entityType = TABLE_TO_ENTITY_TYPE[op.table_name];
		if (!entityType) {
			continue; // Skip unknown tables
		}

		// Map operation type to action
		const action = OPERATION_TO_ACTION[op.operation_type.toLowerCase()];
		if (!action) {
			continue; // Skip unknown operation types
		}

		// Get entity ID (from operation or from data)
		const entityId =
			op.entity_id || (op.after_data as Record<string, unknown>)?.id?.toString() || null;
		if (!entityId) {
			continue; // Skip if we can't determine entity ID
		}

		// Get entity name for summary
		const entityName = getEntityName(op.after_data || op.before_data, entityType);

		// Add to appropriate change list
		const changeEntry = { type: entityType, name: entityName, id: entityId };
		switch (action) {
			case 'created':
				summary.created.push(changeEntry);
				break;
			case 'updated':
				summary.updated.push(changeEntry);
				break;
			case 'deleted':
				summary.deleted.push(changeEntry);
				break;
		}

		// Create activity log entry
		summary.activityLogs.push({
			project_id: projectId,
			entity_type: entityType,
			entity_id: entityId,
			action,
			before_data: op.before_data as Json | null,
			after_data: op.after_data as Json | null,
			changed_by: userId,
			change_source: 'chat',
			chat_session_id: sessionId
		});
	}

	return summary;
}

/**
 * Extract entity name from data for display
 */
function getEntityName(
	data: Record<string, unknown> | null,
	entityType: ProjectLogEntityType
): string {
	if (!data) return 'Unknown';

	// Try common name fields
	const nameFields = ['name', 'title', 'text', 'description'];
	for (const field of nameFields) {
		if (data[field] && typeof data[field] === 'string') {
			const name = data[field] as string;
			return name.length > 50 ? name.slice(0, 47) + '...' : name;
		}
	}

	return `${entityType} item`;
}

/**
 * Insert activity logs into the database
 */
async function insertActivityLogs(logs: ProjectLogInsert[]): Promise<number> {
	if (logs.length === 0) return 0;

	const { data, error } = await supabase.from('onto_project_logs').insert(logs).select('id');

	if (error) {
		console.error('Error inserting activity logs:', error);
		return 0;
	}

	return data?.length ?? 0;
}

/**
 * Generate next steps using LLM
 */
async function generateNextSteps(
	sessionId: string,
	userId: string,
	projectId: string,
	changeSummary: SessionChangeSummary
): Promise<NextStepGenerationResult | null> {
	// Get project info
	const { data: project } = await supabase
		.from('onto_projects')
		.select('name, description, type_key, next_step_short, next_step_long')
		.eq('id', projectId)
		.single();

	if (!project) {
		return null;
	}

	const [{ data: goals }, { data: recentCompletedTasks }, { data: recentActivity }] =
		await Promise.all([
			supabase
				.from('onto_goals')
				.select('id, name, type_key, props')
				.eq('project_id', projectId)
				.limit(10),
			supabase
				.from('onto_tasks')
				.select('id, title, state_key, completed_at')
				.eq('project_id', projectId)
				.not('completed_at', 'is', null)
				.order('completed_at', { ascending: false })
				.limit(6),
			supabase
				.from('onto_project_logs')
				.select('entity_type, entity_id, action, created_at, before_data, after_data')
				.eq('project_id', projectId)
				.order('created_at', { ascending: false })
				.limit(8)
		]);

	const sessionTaskIds = new Set<string>();
	for (const change of [
		...changeSummary.created,
		...changeSummary.updated,
		...changeSummary.deleted
	]) {
		if (change.type === 'task') {
			sessionTaskIds.add(change.id);
		}
	}

	const taskIds = new Set<string>(sessionTaskIds);
	for (const task of recentCompletedTasks ?? []) {
		taskIds.add(task.id);
	}

	const taskGoalLinks = await fetchTaskGoalLinks(projectId, Array.from(taskIds));

	// Get recent messages for context
	const { data: messages } = await supabase
		.from('chat_messages')
		.select('role, content')
		.eq('session_id', sessionId)
		.order('created_at', { ascending: false })
		.limit(10);

	// Build context for LLM
	const context: NextStepGenerationContext = {
		projectId,
		projectName: project.name,
		projectDescription: project.description ?? undefined,
		templateType: project.type_key,
		goals: (goals ?? []) as GoalSummary[],
		recentCompletedTasks: (recentCompletedTasks ?? []) as TaskSummary[],
		taskGoalLinks,
		recentActivity: (recentActivity ?? []) as NextStepGenerationContext['recentActivity'],
		sessionChanges: {
			created: changeSummary.created,
			updated: changeSummary.updated,
			deleted: changeSummary.deleted
		},
		previousNextStep: {
			short: project.next_step_short,
			long: project.next_step_long
		}
	};

	// Build user prompt
	const userPrompt = buildNextStepPrompt(context, messages ?? []);

	// Call LLM
	const llmService = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Next Steps Generator'
	});

	try {
		const result = await llmService.getJSONResponse<NextStepGenerationResult>({
			systemPrompt: NEXT_STEP_SYSTEM_PROMPT,
			userPrompt,
			userId,
			profile: 'fast',
			temperature: 0.4,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			}
		});

		// Sanitize results
		return {
			nextStepShort: sanitizeNextStepShort(result.nextStepShort),
			nextStepLong: sanitizeNextStepLong(result.nextStepLong)
		};
	} catch (error) {
		console.error('LLM next step generation failed:', error);
		return null;
	}
}

/**
 * Build the prompt for next step generation
 */
function buildNextStepPrompt(
	context: NextStepGenerationContext,
	messages: Array<{ role: string; content: string }>
): string {
	const parts: string[] = [];
	const goals = context.goals ?? [];
	const recentCompletedTasks = context.recentCompletedTasks ?? [];
	const recentActivity = context.recentActivity ?? [];
	const taskGoalLinks = context.taskGoalLinks ?? [];
	const { taskToGoalIds, goalToTaskIds } = buildTaskGoalMaps(taskGoalLinks);
	const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
	const taskDisplayNames = new Map<string, string>();

	// Project info
	parts.push(`## Project: ${context.projectName}`);
	if (context.projectDescription) {
		parts.push(`Description: ${context.projectDescription}`);
	}
	parts.push('');

	for (const task of recentCompletedTasks) {
		taskDisplayNames.set(task.id, task.title);
	}

	if (context.sessionChanges) {
		const allSessionChanges = [
			...context.sessionChanges.created,
			...context.sessionChanges.updated,
			...context.sessionChanges.deleted
		];
		for (const change of allSessionChanges) {
			if (change.type === 'task' && !taskDisplayNames.has(change.id)) {
				taskDisplayNames.set(change.id, change.name);
			}
		}
	}

	const recentTaskIds = new Set<string>(taskDisplayNames.keys());

	// Goals first
	if (goals.length > 0) {
		parts.push('## Goals (Primary Focus)');
		const activeGoals = goals.filter((goal) => !isCompletedGoal(goal));
		const goalsToShow = activeGoals.length > 0 ? activeGoals : goals;
		for (const goal of goalsToShow.slice(0, 5)) {
			const goalRef = formatEntityReference('goal', goal.id, goal.name);
			const goalState = getGoalState(goal);
			parts.push(`- ${goalRef}${goalState ? ` (${goalState})` : ''}`);
			const linkedTaskIds = goalToTaskIds.get(goal.id) ?? [];
			const recentLinkedTasks = linkedTaskIds.filter((taskId) => recentTaskIds.has(taskId));
			if (recentLinkedTasks.length > 0) {
				const taskRefs = recentLinkedTasks
					.slice(0, 3)
					.map((taskId) =>
						formatEntityReference(
							'task',
							taskId,
							taskDisplayNames.get(taskId) ?? 'Task'
						)
					);
				parts.push(`  Recent work: ${taskRefs.join(', ')}`);
			}
		}
		parts.push('');
	}

	// Recent progress
	if (recentCompletedTasks.length > 0 || recentActivity.length > 0) {
		parts.push('## Recent Progress');
		if (recentCompletedTasks.length > 0) {
			parts.push('Completed:');
			for (const task of recentCompletedTasks.slice(0, 5)) {
				const taskRef = formatEntityReference('task', task.id, task.title);
				const when = formatRelativeTime(task.completed_at);
				const goalRefs = (taskToGoalIds.get(task.id) ?? [])
					.map((goalId) => {
						const goal = goalsById.get(goalId);
						return goal ? formatEntityReference('goal', goal.id, goal.name) : null;
					})
					.filter((ref): ref is string => Boolean(ref));
				const goalPart = goalRefs.length > 0 ? ` -> Goals: ${goalRefs.join(', ')}` : '';
				const whenPart = when ? ` (${when})` : '';
				parts.push(`- ${taskRef}${whenPart}${goalPart}`);
			}
		}
		if (recentActivity.length > 0) {
			parts.push('Activity:');
			for (const log of recentActivity.slice(0, 5)) {
				const line = formatActivityLogLine(log);
				if (line) {
					parts.push(`- ${line}`);
				}
			}
		}
		parts.push('');
	}

	// Recent changes
	if (context.sessionChanges) {
		const { created, updated, deleted } = context.sessionChanges;

		if (created.length > 0 || updated.length > 0 || deleted.length > 0) {
			parts.push('## Recent Changes in This Session');

			if (created.length > 0) {
				parts.push('Created:');
				created.forEach((c) => parts.push(`- ${c.type}: "${c.name}" (id: ${c.id})`));
			}
			if (updated.length > 0) {
				parts.push('Updated:');
				updated.forEach((u) => parts.push(`- ${u.type}: "${u.name}" (id: ${u.id})`));
			}
			if (deleted.length > 0) {
				parts.push('Deleted:');
				deleted.forEach((d) => parts.push(`- ${d.type}: "${d.name}" (id: ${d.id})`));
			}
			parts.push('');
		}
	}

	// Previous next step
	if (context.previousNextStep?.short) {
		parts.push('## Previous Next Step');
		parts.push(context.previousNextStep.short);
		parts.push('');
	}

	// Recent conversation
	if (messages.length > 0) {
		parts.push('## Recent Conversation');
		const relevantMessages = messages
			.filter((m) => m.role === 'user' || m.role === 'assistant')
			.slice(0, 6)
			.reverse();

		relevantMessages.forEach((m) => {
			const role = m.role === 'user' ? 'User' : 'Assistant';
			const content = m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content;
			parts.push(`${role}: ${content}`);
		});
		parts.push('');
	}

	parts.push('Prioritize goal-aligned momentum from recent progress when selecting the next step.');
	parts.push('Based on this context, generate the next step recommendation.');

	return parts.join('\n');
}

// =============================================================================
// Prompt Helper Functions
// =============================================================================

const VALID_ENTITY_REFERENCE_TYPES = new Set([
	'project',
	'task',
	'document',
	'note',
	'goal',
	'milestone',
	'risk',
	'plan',
	'requirement',
	'source',
	'edge',
	'user'
]);

function formatEntityReference(type: string, id: string, displayText: string): string {
	const sanitizedText = (displayText || '').replace(/[\[\]|]/g, '').trim();
	const normalizedType = type.toLowerCase();
	if (!VALID_ENTITY_REFERENCE_TYPES.has(normalizedType)) {
		return sanitizedText || `${normalizedType}:${id}`;
	}
	return `[[${normalizedType}:${id}|${sanitizedText || id}]]`;
}

function formatRelativeTime(value?: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;

	const diffMs = Date.now() - date.getTime();
	const diffMinutes = Math.floor(diffMs / (1000 * 60));

	if (diffMinutes < 1) return 'just now';
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	const diffDays = Math.floor(diffHours / 24);
	return `${diffDays}d ago`;
}

function formatActivityLogLine(log: RecentActivityEntry): string | null {
	if (!log) return null;
	const data = (log.after_data ?? log.before_data) as Record<string, unknown> | null;
	const name = getEntityName(data, log.entity_type as ProjectLogEntityType);
	const ref = formatEntityReference(log.entity_type, log.entity_id, name);
	const when = formatRelativeTime(log.created_at);
	return `${log.action} ${ref}${when ? ` (${when})` : ''}`;
}

function buildTaskGoalMaps(taskGoalLinks: TaskGoalLink[]): {
	taskToGoalIds: Map<string, string[]>;
	goalToTaskIds: Map<string, string[]>;
} {
	const taskToGoalIds = new Map<string, string[]>();
	const goalToTaskIds = new Map<string, string[]>();

	for (const link of taskGoalLinks) {
		appendToMap(taskToGoalIds, link.taskId, link.goalId);
		appendToMap(goalToTaskIds, link.goalId, link.taskId);
	}

	return { taskToGoalIds, goalToTaskIds };
}

function appendToMap(map: Map<string, string[]>, key: string, value: string): void {
	const existing = map.get(key);
	if (!existing) {
		map.set(key, [value]);
		return;
	}
	if (!existing.includes(value)) {
		existing.push(value);
	}
}

function getGoalStateValue(goal: GoalSummary): string | null {
	if (!goal.props) return null;
	const state = (goal.props.state as string) || (goal.props.status as string);
	return state && typeof state === 'string' ? state : null;
}

function getGoalState(goal: GoalSummary): string | null {
	const rawState = getGoalStateValue(goal);
	return rawState ? formatStateLabel(rawState) : null;
}

function isCompletedGoal(goal: GoalSummary): boolean {
	const rawState = getGoalStateValue(goal);
	return isCompletedState(rawState);
}

function isCompletedState(state?: string | null): boolean {
	if (!state) return false;
	const completedStates = new Set([
		'done',
		'completed',
		'complete',
		'shipped',
		'published',
		'approved'
	]);
	return completedStates.has(state.toLowerCase());
}

function formatStateLabel(state: string): string {
	return state.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildTaskGoalLinks(edges: EdgeSummary[]): TaskGoalLink[] {
	const links: TaskGoalLink[] = [];
	const seen = new Set<string>();

	for (const edge of edges) {
		const mapping = extractTaskGoalLink(edge);
		if (!mapping) continue;
		const key = `${mapping.taskId}:${mapping.goalId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		links.push({ taskId: mapping.taskId, goalId: mapping.goalId, rel: edge.rel });
	}

	return links;
}

function extractTaskGoalLink(edge: EdgeSummary): { taskId: string; goalId: string } | null {
	if (edge.rel === 'supports_goal') {
		if (edge.src_kind === 'task' && edge.dst_kind === 'goal') {
			return { taskId: edge.src_id, goalId: edge.dst_id };
		}
		if (edge.src_kind === 'goal' && edge.dst_kind === 'task') {
			return { taskId: edge.dst_id, goalId: edge.src_id };
		}
	}

	if (edge.rel === 'has_task') {
		if (edge.src_kind === 'goal' && edge.dst_kind === 'task') {
			return { taskId: edge.dst_id, goalId: edge.src_id };
		}
		if (edge.src_kind === 'task' && edge.dst_kind === 'goal') {
			return { taskId: edge.src_id, goalId: edge.dst_id };
		}
	}

	if (edge.rel === 'achieved_by') {
		if (edge.src_kind === 'goal' && edge.dst_kind === 'task') {
			return { taskId: edge.dst_id, goalId: edge.src_id };
		}
		if (edge.src_kind === 'task' && edge.dst_kind === 'goal') {
			return { taskId: edge.src_id, goalId: edge.dst_id };
		}
	}

	return null;
}

async function fetchTaskGoalLinks(projectId: string, taskIds: string[]): Promise<TaskGoalLink[]> {
	if (taskIds.length === 0) return [];
	const rels = ['supports_goal', 'has_task', 'achieved_by'];

	const [srcResult, dstResult] = await Promise.all([
		supabase
			.from('onto_edges')
			.select('src_id, src_kind, dst_id, dst_kind, rel')
			.eq('project_id', projectId)
			.in('rel', rels)
			.in('src_id', taskIds),
		supabase
			.from('onto_edges')
			.select('src_id, src_kind, dst_id, dst_kind, rel')
			.eq('project_id', projectId)
			.in('rel', rels)
			.in('dst_id', taskIds)
	]);

	if (srcResult.error) {
		console.error('Error fetching task goal edges (src):', srcResult.error);
	}
	if (dstResult.error) {
		console.error('Error fetching task goal edges (dst):', dstResult.error);
	}

	const edges = [
		...((srcResult.data ?? []) as EdgeSummary[]),
		...((dstResult.data ?? []) as EdgeSummary[])
	];

	return buildTaskGoalLinks(edges);
}

/**
 * Update project's next step
 */
async function updateProjectNextStep(
	projectId: string,
	nextStep: NextStepGenerationResult
): Promise<void> {
	const { error } = await supabase
		.from('onto_projects')
		.update({
			next_step_short: nextStep.nextStepShort,
			next_step_long: nextStep.nextStepLong,
			next_step_updated_at: new Date().toISOString(),
			next_step_source: 'ai',
			updated_at: new Date().toISOString()
		})
		.eq('id', projectId);

	if (error) {
		throw new Error(`Failed to update project next step: ${error.message}`);
	}
}

// =============================================================================
// Sanitization Functions
// =============================================================================

/**
 * Sanitize the short next step
 */
function sanitizeNextStepShort(text: string): string {
	if (!text || typeof text !== 'string') {
		return 'Continue working on the project.';
	}

	let sanitized = text.trim();
	if (sanitized.length > 100) {
		sanitized = sanitized.slice(0, 97) + '...';
	}

	return sanitized || 'Continue working on the project.';
}

/**
 * Sanitize the long next step
 */
function sanitizeNextStepLong(text: string): string {
	if (!text || typeof text !== 'string') {
		return 'Review recent progress and identify the next milestone to work towards.';
	}

	let sanitized = text.trim();
	if (sanitized.length > 650) {
		sanitized = sanitized.slice(0, 647) + '...';
	}

	return sanitized || 'Review recent progress and identify the next milestone to work towards.';
}
