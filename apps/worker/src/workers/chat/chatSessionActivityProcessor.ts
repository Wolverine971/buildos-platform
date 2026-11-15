// apps/worker/src/workers/chat/chatSessionActivityProcessor.ts
// Follow-up to chat classification for project chats: when the chat saved changes to the
// project, write the project's next step from where the project now stands.

import { supabase } from '../../lib/supabase';
import { logWorkerError } from '../../lib/errorLogger';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import {
	parseEntityReferences,
	resolveEntityReferences
} from '@buildos/shared-agent-ops/utils/entity-reference-parser';
import {
	START_HERE_DOCUMENT_TYPE_KEY,
	buildStartHerePromptExcerpt,
	pickProjectStartHereDocument
} from '@buildos/shared-agent-ops/ontology/start-here';
import type { Json, NextStepGenerationContext, ProjectLogEntityType } from '@buildos/shared-types';
import { type PromptSavedChange, latestSavedChanges } from './checkpoint/capturePrompts';

// =============================================================================
// Types
// =============================================================================

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

type GoalSummary = NonNullable<NextStepGenerationContext['goals']>[number];

const ACTIVE_PROJECT_STATES = ['planning', 'active'] as const;

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

const NEXT_STEP_START_HERE_MAX_CHARS = 1800;
const NEXT_STEP_MAX_TOKENS = 400;
const NEXT_STEP_TIMEOUT_MS = 30_000;
/** Newest write executions read per session; the prompt shows the latest of them. */
const SAVED_CHANGE_ROWS = 200;

/**
 * System prompt for next step generation.
 *
 * It carries no worked example: the old one showed an invented person, deadline and
 * slide numbers, and the model wrote details like them into real next steps. The link
 * example is built per call from a record that is in the context (buildNextStepPrompt).
 */
export const NEXT_STEP_SYSTEM_PROMPT = `You are a project advisor helping users identify their next action. Use goals and recent progress to propose the most helpful next step.

Priorities (in order):
1. Start from where the project actually stands. START HERE, when given, records its current state and decisions; much of the work lives in documents, not tasks. Never repeat a previous next step that START HERE, recent changes or the conversation show is done or superseded.
2. Anchor on active goals. The next step should directly advance a goal whenever possible.
3. Use recent progress and recent session changes to infer momentum. Continue the same goal or phase if it makes sense.
4. If recent work maps to a parent goal, propose the next task related to that goal.
5. If no goals exist, choose the most impactful active or overdue task.

Guidelines:
1. The short version should be ONE clear sentence (max 100 chars) answering "What should I do next?"
2. The long version should be 2-4 sentences (max 650 chars) explaining:
   - What to do and why
   - The parent goal it supports when available
   - Any important context or considerations
3. Focus on momentum - what moves the project forward
4. Be specific and actionable, not vague
5. Prefer continuity with recent work unless there's a more urgent goal or blocker
6. Use only what the context gives you. Never add a person, date, deadline, number or detail that is not written there.

Entity references:
- The context writes each record as [[type:id|name]]. To reference a record in the long version, copy that reference with its exact type and id.
- Valid types: task, document, goal, milestone, risk, plan.
- Reference only records that appear in the context. Never invent an id; when no record fits, write plain text without a reference.

Respond ONLY with valid JSON:
{
  "nextStepShort": "<one clear sentence, max 100 chars>",
  "nextStepLong": "<2-4 sentences, max 650 chars>"
}`;

/** Record kinds a next step may link to (the kinds resolveProjectEntityLinks can verify). */
const LINKABLE_KINDS: ReadonlySet<string> = new Set([
	'task',
	'document',
	'goal',
	'milestone',
	'risk',
	'plan'
]);

// =============================================================================
// Main Processing Functions
// =============================================================================

/**
 * Refresh a project's next step after one of its chats. Called once the chat's
 * classification is saved.
 *
 * The next step is regenerated only when the chat saved changes to the project (its
 * successful write tool executions). A chat that only read or talked changed nothing the
 * next step is built from, so it costs no model call and overwrites nothing.
 *
 * @param sessionId - The chat session ID
 * @param userId - The user ID
 * @returns Summary of what was processed
 */
export async function processSessionActivityAndNextSteps(
	sessionId: string,
	userId: string
): Promise<{
	nextStepUpdated: boolean;
	projectId: string | null;
	/** Why no next step was written, for the job log. */
	skippedReason?: 'not_project_session' | 'no_saved_changes' | 'not_generated';
}> {
	console.log(`📊 Processing next step for session ${sessionId}`);

	// 1. Get session context to determine the project
	const sessionContext = await getSessionContext(sessionId, userId);
	if (!sessionContext) {
		console.log(`⚠️ Session ${sessionId} not found or not authorized`);
		return { nextStepUpdated: false, projectId: null, skippedReason: 'not_project_session' };
	}

	// Only process project-related sessions
	if (sessionContext.context_type !== 'project' || !sessionContext.entity_id) {
		console.log(`⏭️ Session ${sessionId} is not project-related, skipping next step`);
		return { nextStepUpdated: false, projectId: null, skippedReason: 'not_project_session' };
	}

	const projectId = sessionContext.entity_id;

	try {
		// 2. What the chat saved, from its write receipts
		const savedChanges = projectSavedChanges(
			await loadSessionSavedChanges(sessionId),
			projectId
		);
		console.log(`📝 Found ${savedChanges.length} saved change(s) for session ${sessionId}`);
		if (savedChanges.length === 0) {
			return { nextStepUpdated: false, projectId, skippedReason: 'no_saved_changes' };
		}

		// 3. Generate and update the next step
		const nextStep = await generateNextSteps(sessionId, userId, projectId, savedChanges);
		if (nextStep && (await updateProjectNextStep(projectId, nextStep))) {
			console.log(`✅ Updated next step for project ${projectId}`);
			return { nextStepUpdated: true, projectId };
		}
	} catch (error) {
		console.error(`⚠️ Failed to generate next steps:`, error);
		void logWorkerError(error, {
			userId,
			tableName: 'onto_projects',
			recordId: projectId,
			operationType: 'chat_next_step_generation',
			severity: 'warning',
			metadata: {
				sessionId,
				nonFatal: true
			}
		});
		// Don't fail the whole process if next step generation fails
	}

	return { nextStepUpdated: false, projectId, skippedReason: 'not_generated' };
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
 * The records this chat's tools saved, oldest first: the same write receipts
 * (`chat_tool_executions.affected_entities`) checkpoint capture reads. Reads and failed
 * executions carry no receipt.
 */
async function loadSessionSavedChanges(sessionId: string): Promise<PromptSavedChange[]> {
	const { data, error } = await supabase
		.from('chat_tool_executions')
		.select('tool_name, tool_category, success, affected_entities, created_at')
		.eq('session_id', sessionId)
		.eq('success', true)
		.or('tool_category.is.null,tool_category.neq.read')
		.order('created_at', { ascending: false })
		.limit(SAVED_CHANGE_ROWS);

	if (error) {
		throw new Error(`Failed to load the session's saved changes: ${error.message}`);
	}

	return latestSavedChanges((data ?? []) as Array<Record<string, unknown>>);
}

/** Saved changes that belong to this project; a receipt naming another project is left out. */
export function projectSavedChanges(
	changes: PromptSavedChange[],
	projectId: string
): PromptSavedChange[] {
	return changes.filter((change) => !change.projectId || change.projectId === projectId);
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
 * Generate next steps using LLM
 */
async function generateNextSteps(
	sessionId: string,
	userId: string,
	projectId: string,
	savedChanges: PromptSavedChange[]
): Promise<NextStepGenerationResult | null> {
	// Get project info
	const { data: project } = await supabase
		.from('onto_projects')
		.select(
			'name, description, type_key, state_key, next_step_short, next_step_long, next_step_source'
		)
		.eq('id', projectId)
		// The Workspace (loose items) has no next step to write; skip the model call.
		.eq('kind', 'project')
		.in('state_key', ACTIVE_PROJECT_STATES)
		.is('deleted_at', null)
		.is('archived_at', null)
		.maybeSingle();

	if (!project) {
		return null;
	}

	// A next step the user wrote is theirs: never replace it, and do not spend a model
	// call on a result that would be thrown away.
	if (project.next_step_source === 'user') {
		console.log(`⏭️ Project ${projectId} has a user-written next step, leaving it`);
		return null;
	}

	const [
		{ data: goals },
		{ data: recentCompletedTasks },
		{ data: recentActivity },
		{ data: startHereRows }
	] = await Promise.all([
		supabase
			.from('onto_goals')
			.select('id, name, type_key, props')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.limit(10),
		supabase
			.from('onto_tasks')
			.select('id, title, state_key, completed_at')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.not('completed_at', 'is', null)
			.order('completed_at', { ascending: false })
			.limit(6),
		supabase
			.from('onto_project_logs')
			.select('entity_type, entity_id, action, created_at, before_data, after_data')
			.eq('project_id', projectId)
			.order('created_at', { ascending: false })
			.limit(8),
		// Tasker 100 (book loop, ledger 10): without START HERE the step
		// anchored on tasks and on the previous step, and chat quoted a stale
		// "Draft the one-page book overview" long after the work moved on.
		supabase
			.from('onto_documents')
			.select('id, title, content, props, created_at, updated_at')
			.eq('project_id', projectId)
			.eq('type_key', START_HERE_DOCUMENT_TYPE_KEY)
			.is('deleted_at', null)
			.is('archived_at', null)
	]);
	const startHere = pickProjectStartHereDocument(startHereRows ?? []);
	const startHereExcerpt = startHere?.content
		? buildStartHerePromptExcerpt(startHere.content, NEXT_STEP_START_HERE_MAX_CHARS).content
		: null;

	const taskIds = new Set<string>();
	for (const change of savedChanges) {
		if (change.kind === 'task' && change.id) {
			taskIds.add(change.id);
		}
	}
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
		previousNextStep: {
			short: project.next_step_short,
			long: project.next_step_long
		}
	};

	// Build user prompt
	const userPrompt = buildNextStepPrompt(context, messages ?? [], startHereExcerpt, savedChanges);

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
			operationType: 'chat_project_next_step',
			temperature: 0.4,
			// One sentence plus a short paragraph: hidden reasoning was ~1,640 of every
			// ~1,700 output tokens and ~19 s per call (same fix as checkpointLlm.ts).
			reasoning: { enabled: false },
			maxTokens: NEXT_STEP_MAX_TOKENS,
			timeoutMs: NEXT_STEP_TIMEOUT_MS,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			}
		});

		// Sanitize results. Links must point at real entities of this project: the
		// model has invented slugs like [[document:story-blueprint-template|...]].
		return {
			nextStepShort: sanitizeNextStepShort(result.nextStepShort),
			nextStepLong: sanitizeNextStepLong(
				await resolveProjectEntityLinks(projectId, result.nextStepLong)
			)
		};
	} catch (error) {
		console.error('LLM next step generation failed:', error);
		void logWorkerError(error, {
			userId,
			tableName: 'onto_projects',
			recordId: projectId,
			operationType: 'chat_next_step_llm_generation',
			severity: 'warning',
			metadata: {
				sessionId
			}
		});
		return null;
	}
}

/**
 * Build the prompt for next step generation
 *
 * @param savedChanges the records this chat saved (its write receipts), oldest first
 */
export function buildNextStepPrompt(
	context: NextStepGenerationContext,
	messages: Array<{ role: string; content: string }>,
	startHereExcerpt: string | null = null,
	savedChanges: PromptSavedChange[] = []
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

	if (startHereExcerpt?.trim()) {
		parts.push('## START HERE (current state and decisions)');
		parts.push(startHereExcerpt.trim());
		parts.push('');
	}

	for (const task of recentCompletedTasks) {
		taskDisplayNames.set(task.id, task.title);
	}

	for (const change of savedChanges) {
		if (change.kind === 'task' && change.id && change.title && !isRemoval(change)) {
			if (!taskDisplayNames.has(change.id)) taskDisplayNames.set(change.id, change.title);
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

	// What this chat saved, from its write receipts
	if (savedChanges.length > 0) {
		parts.push('## Recent Changes in This Session');
		for (const change of savedChanges) {
			parts.push(`- ${formatSavedChangeLine(change)}`);
		}
		parts.push('');
	}

	// Previous next step
	if (context.previousNextStep?.short) {
		parts.push('## Previous Next Step (may be out of date)');
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

	// A link example made from a record that is really in this context, so the model
	// copies a true id and has no invented person, date or detail to imitate.
	const linkExample = pickLinkExample(context, savedChanges);
	if (linkExample) {
		parts.push('## Reference format');
		parts.push(
			`Write a reference exactly as the context does. For example, this record from above: ${linkExample}`
		);
		parts.push('');
	}

	parts.push(
		'Prioritize goal-aligned momentum from recent progress when selecting the next step.'
	);
	parts.push('Based on this context, generate the next step recommendation.');

	return parts.join('\n');
}

// =============================================================================
// Prompt Helper Functions
// =============================================================================

/** A receipt for a record that no longer exists; it must not be offered as a link. */
function isRemoval(change: PromptSavedChange): boolean {
	return change.operation === 'deleted';
}

/**
 * One saved change as a prompt line: what the tool did, to which record. A live record
 * of a linkable kind is written as a reference so the model can copy its id.
 */
function formatSavedChangeLine(change: PromptSavedChange): string {
	const operation = change.operation?.trim() || 'saved';
	const title = change.title?.trim() || '(untitled)';
	if (change.id && LINKABLE_KINDS.has(change.kind) && !isRemoval(change)) {
		return `${operation} ${formatEntityReference(change.kind, change.id, title)}`;
	}
	return `${operation} ${change.kind}: "${title}"`;
}

/**
 * A record from this context to show the reference format with: the newest thing the
 * chat saved, else an active goal, else a recently completed task. Null when none of
 * those exist; the prompt then shows no example rather than an invented one.
 */
function pickLinkExample(
	context: NextStepGenerationContext,
	savedChanges: PromptSavedChange[]
): string | null {
	const saved = [...savedChanges]
		.reverse()
		.find(
			(change) =>
				change.id && change.title && LINKABLE_KINDS.has(change.kind) && !isRemoval(change)
		);
	if (saved?.id && saved.title) return formatEntityReference(saved.kind, saved.id, saved.title);
	const goals = context.goals ?? [];
	const goal = goals.find((candidate) => !isCompletedGoal(candidate)) ?? goals[0];
	if (goal) return formatEntityReference('goal', goal.id, goal.name);
	const task = (context.recentCompletedTasks ?? [])[0];
	if (task) return formatEntityReference('task', task.id, task.title);
	return null;
}

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
	const sanitizedText = (displayText || '').replace(/[[\]|]/g, '').trim();
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
	const props = goal.props;
	if (props === null || props === undefined) return null;
	if (typeof props !== 'object' || Array.isArray(props)) return null;
	const propsRecord = props as Record<string, Json | undefined>;
	const state = propsRecord.state ?? propsRecord.status;
	return typeof state === 'string' ? state : null;
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
		void logWorkerError(srcResult.error, {
			tableName: 'onto_edges',
			recordId: projectId,
			operationType: 'task_goal_edge_lookup_src',
			severity: 'warning',
			metadata: {
				projectId,
				taskCount: taskIds.length
			}
		});
	}
	if (dstResult.error) {
		console.error('Error fetching task goal edges (dst):', dstResult.error);
		void logWorkerError(dstResult.error, {
			tableName: 'onto_edges',
			recordId: projectId,
			operationType: 'task_goal_edge_lookup_dst',
			severity: 'warning',
			metadata: {
				projectId,
				taskCount: taskIds.length
			}
		});
	}

	const edges = [
		...((srcResult.data ?? []) as EdgeSummary[]),
		...((dstResult.data ?? []) as EdgeSummary[])
	];

	return buildTaskGoalLinks(edges);
}

/**
 * Update project's next step. Returns false when nothing was written: the project is no
 * longer active, or its next step was written by the user (never overwritten, including
 * one the user wrote while the model was running).
 */
async function updateProjectNextStep(
	projectId: string,
	nextStep: NextStepGenerationResult
): Promise<boolean> {
	// Count the written rows; never `.select()` them. Production PostgREST (12.2.3) rejects
	// an update that has an `or` filter and returns rows ("column onto_projects.<col> does
	// not exist", 42703), which failed every next-step write on 2026-11-14.
	const { count, error } = await supabase
		.from('onto_projects')
		.update(
			{
				next_step_short: nextStep.nextStepShort,
				next_step_long: nextStep.nextStepLong,
				next_step_updated_at: new Date().toISOString(),
				next_step_source: 'ai'
			},
			{ count: 'exact' }
		)
		.eq('id', projectId)
		.in('state_key', ACTIVE_PROJECT_STATES)
		.is('deleted_at', null)
		.is('archived_at', null)
		// `neq` alone would also drop rows whose source is null.
		.or('next_step_source.is.null,next_step_source.neq.user');

	if (error) {
		throw new Error(`Failed to update project next step: ${error.message}`);
	}
	return (count ?? 0) > 0;
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

const ENTITY_LINK_TABLES: Record<
	string,
	'onto_tasks' | 'onto_documents' | 'onto_goals' | 'onto_plans' | 'onto_milestones' | 'onto_risks'
> = {
	task: 'onto_tasks',
	document: 'onto_documents',
	goal: 'onto_goals',
	plan: 'onto_plans',
	milestone: 'onto_milestones',
	risk: 'onto_risks'
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Replace entity links whose id is not a live entity of this project with their label. */
async function resolveProjectEntityLinks(projectId: string, text: unknown): Promise<string> {
	if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';
	const idsByType = new Map<string, string[]>();
	for (const ref of parseEntityReferences(text).entities) {
		if (!ENTITY_LINK_TABLES[ref.type] || !UUID_PATTERN.test(ref.id)) continue;
		idsByType.set(ref.type, [...(idsByType.get(ref.type) ?? []), ref.id]);
	}
	const known = new Set<string>([`project:${projectId}`]);
	await Promise.all(
		[...idsByType].map(async ([type, ids]) => {
			const { data } = await supabase
				.from(ENTITY_LINK_TABLES[type])
				.select('id')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.in('id', ids);
			for (const row of (data ?? []) as Array<{ id: string }>) known.add(`${type}:${row.id}`);
		})
	);
	return resolveEntityReferences(text, (type, id) => known.has(`${type}:${id}`)).markdown;
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
