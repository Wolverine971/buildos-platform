// apps/web/src/lib/services/agentic-chat-v2/context-loader.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatContextType, Database } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { createLogger } from '$lib/utils/logger';
import type { DocStructure } from '$lib/types/onto-api';
import type {
	DailyBriefContextData,
	DailyBriefMentionedEntity,
	DailyBriefProjectBrief,
	EntityContextData,
	FastChatEventWindow,
	GlobalContextData,
	LightDocument,
	LightEvent,
	LightGoal,
	LightMilestone,
	LightPlan,
	LightProjectMember,
	LightProject,
	LightRecentActivity,
	LightTask,
	ProjectContextData,
	LinkedEdge
} from './context-models';
import { buildDocStructureSummary, collectDocStructureIds } from './context-models';
import type { MasterPromptContext } from './master-prompt-builder';

const logger = createLogger('FastChatContext');

const PROJECT_CONTEXTS = new Set<ChatContextType>(['project', 'project_audit', 'project_forecast']);

const RECENT_ACTIVITY_PER_PROJECT = 6;
const GLOBAL_DOC_STRUCTURE_DEPTH = 2;
const FASTCHAT_CONTEXT_RPC = 'load_fastchat_context';
const FASTCHAT_EVENT_WINDOW_PAST_DAYS = 7;
const FASTCHAT_EVENT_WINDOW_FUTURE_DAYS = 14;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CONTEXT_RELEVANCE_DUE_SOON_DAYS = 7;
const PROJECT_CONTEXT_GOAL_LIMIT = 12;
const PROJECT_CONTEXT_MILESTONE_LIMIT = 12;
const PROJECT_CONTEXT_PLAN_LIMIT = 12;
const PROJECT_CONTEXT_TASK_LIMIT = 18;
const PROJECT_CONTEXT_DOCUMENT_LIMIT = 20;
const PROJECT_CONTEXT_EVENT_LIMIT = 16;
const PROJECT_DESCRIPTION_MAX_CHARS = 320;
const ENTITY_DESCRIPTION_MAX_CHARS = 220;
const TASK_DESCRIPTION_MAX_CHARS = 280;
const EVENT_DESCRIPTION_MAX_CHARS = 180;

type ProjectRow = Database['public']['Tables']['onto_projects']['Row'];
type ProjectSelectRow = Pick<
	ProjectRow,
	| 'id'
	| 'name'
	| 'state_key'
	| 'description'
	| 'start_at'
	| 'end_at'
	| 'next_step_short'
	| 'updated_at'
	| 'doc_structure'
>;
type GoalRow = Database['public']['Tables']['onto_goals']['Row'];
type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];
type PlanRow = Database['public']['Tables']['onto_plans']['Row'];
type TaskRow = Database['public']['Tables']['onto_tasks']['Row'];
type DocumentRow = Database['public']['Tables']['onto_documents']['Row'];
type ContextDocumentRow = Pick<
	DocumentRow,
	'id' | 'title' | 'state_key' | 'created_at' | 'updated_at'
>;
type EventRow = Database['public']['Tables']['onto_events']['Row'];
type ActorRow = Database['public']['Tables']['onto_actors']['Row'];
type ProjectLogRow = Database['public']['Tables']['onto_project_logs']['Row'];
type EdgeRow = Database['public']['Tables']['onto_edges']['Row'];
type OntologyDailyBriefRow = Database['public']['Tables']['ontology_daily_briefs']['Row'];
type OntologyProjectBriefRow = Database['public']['Tables']['ontology_project_briefs']['Row'];
type OntologyBriefEntityRow = Database['public']['Tables']['ontology_brief_entities']['Row'];
type ProjectMemberBaseRow = Pick<
	Database['public']['Tables']['onto_project_members']['Row'],
	| 'id'
	| 'project_id'
	| 'actor_id'
	| 'role_key'
	| 'access'
	| 'role_name'
	| 'role_description'
	| 'created_at'
>;
type ProjectMemberRow = ProjectMemberBaseRow & {
	actor_name?: string | null;
	actor_email?: string | null;
	actor?: Pick<ActorRow, 'id' | 'name' | 'email'> | null;
};

type LoadContextParams = {
	supabase: SupabaseClient<Database>;
	userId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectFocus?: ProjectFocus | null;
	onError?: (event: {
		stage: string;
		error: unknown;
		metadata?: Record<string, unknown>;
	}) => void;
};

type FastChatContextRpcResponse = {
	projects?: ProjectSelectRow[];
	project?: ProjectSelectRow | null;
	goals?: Array<GoalRow & { project_id?: string }>;
	milestones?: Array<MilestoneRow & { project_id?: string }>;
	plans?: Array<PlanRow & { project_id?: string }>;
	tasks?: Array<TaskRow & { project_id?: string }>;
	documents?: Array<ContextDocumentRow & { project_id?: string }>;
	events?: Array<EventRow & { project_id?: string }>;
	members?: ProjectMemberRow[];
	project_logs?: ProjectLogRow[];
	focus_entity_full?: Record<string, unknown> | null;
	focus_entity_type?: string | null;
	focus_entity_id?: string | null;
	linked_entities?: Record<string, Array<Record<string, unknown>>>;
	linked_edges?: LinkedEdge[];
};

type LinkedEntityConfig = {
	table: keyof Database['public']['Tables'];
	select: string;
	map: (row: any) => Record<string, unknown>;
};

function reportContextLoadError(
	onError: LoadContextParams['onError'],
	stage: string,
	error: unknown,
	metadata?: Record<string, unknown>
): void {
	if (!onError) return;
	try {
		onError({ stage, error, metadata });
	} catch (callbackError) {
		logger.warn('FastChat context error callback failed', {
			stage,
			callbackError
		});
	}
}

const LINKED_ENTITY_CONFIG: Record<string, LinkedEntityConfig> = {
	project: {
		table: 'onto_projects',
		select: 'id, name, state_key, description, start_at, end_at, next_step_short, updated_at',
		map: (row: ProjectRow) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			state_key: row.state_key,
			start_at: row.start_at,
			end_at: row.end_at,
			updated_at: row.updated_at
		})
	},
	task: {
		table: 'onto_tasks',
		select: 'id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at',
		map: (row: TaskRow) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			state_key: row.state_key,
			priority: row.priority,
			start_at: row.start_at,
			due_at: row.due_at,
			completed_at: row.completed_at,
			updated_at: row.updated_at
		})
	},
	plan: {
		table: 'onto_plans',
		select: 'id, name, description, state_key, updated_at',
		map: (row: PlanRow) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			state_key: row.state_key,
			updated_at: row.updated_at
		})
	},
	goal: {
		table: 'onto_goals',
		select: 'id, name, description, state_key, target_date, completed_at, updated_at',
		map: (row: GoalRow) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			state_key: row.state_key,
			target_date: row.target_date,
			completed_at: row.completed_at,
			updated_at: row.updated_at
		})
	},
	milestone: {
		table: 'onto_milestones',
		select: 'id, title, description, state_key, due_at, completed_at, updated_at',
		map: (row: MilestoneRow) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			state_key: row.state_key,
			due_at: row.due_at,
			completed_at: row.completed_at,
			updated_at: row.updated_at
		})
	},
	document: {
		table: 'onto_documents',
		select: 'id, title, description, state_key, updated_at',
		map: (row: DocumentRow) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			state_key: row.state_key,
			updated_at: row.updated_at
		})
	},
	event: {
		table: 'onto_events',
		select: 'id, title, description, state_key, start_at, end_at, all_day, location, updated_at',
		map: (row: EventRow) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			state_key: row.state_key,
			start_at: row.start_at,
			end_at: row.end_at,
			all_day: row.all_day,
			location: row.location,
			updated_at: row.updated_at
		})
	},
	risk: {
		table: 'onto_risks',
		select: 'id, title, content, state_key, impact, probability, updated_at',
		map: (row: any) => ({
			id: row.id,
			title: row.title,
			content: row.content,
			state_key: row.state_key,
			impact: row.impact,
			probability: row.probability,
			updated_at: row.updated_at
		})
	}
};

const BRIEF_ENTITY_KIND_BY_PATH_SEGMENT: Record<string, string> = {
	project: 'project',
	projects: 'project',
	task: 'task',
	tasks: 'task',
	goal: 'goal',
	goals: 'goal',
	plan: 'plan',
	plans: 'plan',
	document: 'document',
	documents: 'document',
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk',
	event: 'event',
	events: 'event'
};

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function parseBriefEntityFromHref(
	href: string,
	projectNameById: Map<string, string | null>
): DailyBriefMentionedEntity | null {
	if (!href || !href.startsWith('/')) return null;

	const normalizedHref = href.split('#')[0]?.split('?')[0] ?? href;
	const pathSegments = normalizedHref.split('/').filter(Boolean);
	if (pathSegments.length < 2) return null;

	let root = pathSegments[0];
	let offset = 0;
	if (root === 'onto' && pathSegments[1] === 'projects') {
		root = 'projects';
		offset = 1;
	}

	if (root !== 'projects') return null;

	const projectId = pathSegments[offset + 1];
	if (!projectId) return null;

	const typeSegment = pathSegments[offset + 2];
	const entitySegment = pathSegments[offset + 3];

	if (!typeSegment) {
		return {
			entity_kind: 'project',
			entity_id: projectId,
			project_id: projectId,
			project_name: projectNameById.get(projectId) ?? null,
			role: 'mentioned',
			source: 'markdown_link_fallback'
		};
	}

	const entityKind = BRIEF_ENTITY_KIND_BY_PATH_SEGMENT[typeSegment];
	if (!entityKind) return null;

	const entityId = entitySegment ?? projectId;
	return {
		entity_kind: entityKind,
		entity_id: entityId,
		project_id: projectId,
		project_name: projectNameById.get(projectId) ?? null,
		role: 'mentioned',
		source: 'markdown_link_fallback'
	};
}

function extractFallbackBriefEntities(params: {
	executiveSummary: string;
	projectBriefs: DailyBriefProjectBrief[];
}): DailyBriefMentionedEntity[] {
	const projectNameById = new Map<string, string | null>();
	for (const projectBrief of params.projectBriefs) {
		projectNameById.set(projectBrief.project_id, projectBrief.project_name ?? null);
	}

	const combinedMarkdown = [
		params.executiveSummary,
		...params.projectBriefs.map((projectBrief) => projectBrief.brief_content)
	].join('\n\n');

	const linkPattern = /\[[^\]]+\]\((\/[^)\s]+)\)/g;
	const unique = new Map<string, DailyBriefMentionedEntity>();
	let match: RegExpExecArray | null = linkPattern.exec(combinedMarkdown);

	while (match) {
		const href = match[1];
		if (!href) {
			match = linkPattern.exec(combinedMarkdown);
			continue;
		}
		const parsed = parseBriefEntityFromHref(href, projectNameById);
		if (parsed) {
			const key = [
				parsed.entity_kind,
				parsed.entity_id,
				parsed.project_id ?? 'none',
				parsed.source
			].join('|');
			if (!unique.has(key)) {
				unique.set(key, parsed);
			}
		}
		match = linkPattern.exec(combinedMarkdown);
	}

	return Array.from(unique.values());
}

function buildMentionedEntityCounts(entities: DailyBriefMentionedEntity[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const entity of entities) {
		const key = entity.entity_kind;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

const DEFAULT_MEMBER_ROLE_PROFILE = {
	owner: {
		role_name: 'Project Owner',
		role_description: 'Owns project direction, decision-making, and final approval.'
	},
	editor: {
		role_name: 'Collaborator',
		role_description:
			'Contributes actively by creating, editing, and coordinating project work.'
	},
	viewer: {
		role_name: 'Observer',
		role_description: 'Tracks progress and context, with read-only access to project work.'
	}
} as const;

function isProjectContext(contextType: ChatContextType): boolean {
	return PROJECT_CONTEXTS.has(contextType);
}

function resolveProjectId(
	contextType: ChatContextType,
	entityId?: string | null,
	projectFocus?: ProjectFocus | null
): string | null {
	if (projectFocus?.projectId) return projectFocus.projectId;
	if (isProjectContext(contextType)) return entityId ?? null;
	return null;
}

function resolveRpcContextType(
	contextType: ChatContextType,
	projectFocus?: ProjectFocus | null
): 'global' | 'project' | null {
	if (contextType === 'global') return 'global';
	if (isProjectContext(contextType)) return 'project';
	if (contextType === 'ontology' && projectFocus?.projectId) return 'project';
	return null;
}

function asArray<T>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}

function buildFastChatEventWindow(now: Date = new Date()): FastChatEventWindow {
	const nowAt = now.toISOString();
	return {
		timezone: 'UTC',
		now_at: nowAt,
		start_at: new Date(
			now.getTime() - FASTCHAT_EVENT_WINDOW_PAST_DAYS * DAY_IN_MS
		).toISOString(),
		end_at: new Date(
			now.getTime() + FASTCHAT_EVENT_WINDOW_FUTURE_DAYS * DAY_IN_MS
		).toISOString(),
		past_days: FASTCHAT_EVENT_WINDOW_PAST_DAYS,
		future_days: FASTCHAT_EVENT_WINDOW_FUTURE_DAYS
	};
}

function filterEventsToWindow(events: EventRow[], eventWindow: FastChatEventWindow): EventRow[] {
	const windowStartMs = Date.parse(eventWindow.start_at);
	const windowEndMs = Date.parse(eventWindow.end_at);
	if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs)) {
		return events;
	}

	return events.filter((event) => {
		const startAtMs = Date.parse(event.start_at);
		return Number.isFinite(startAtMs) && startAtMs >= windowStartMs && startAtMs <= windowEndMs;
	});
}

function resolveEntityName(entity: Record<string, unknown> | null | undefined): string | null {
	if (!entity) return null;
	const candidate =
		entity.title ??
		entity.name ??
		entity.text ??
		entity.goal ??
		entity.milestone ??
		entity.summary;
	return typeof candidate === 'string' ? candidate : null;
}

const STRIP_ENTITY_FIELDS = new Set([
	'type_key',
	'facet_context',
	'facet_scale',
	'facet_stage',
	'progress_percent',
	'plan_ids',
	'goal_ids'
]);

function stripEntityFields(
	entity: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	if (!entity) return {};
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(entity)) {
		if (STRIP_ENTITY_FIELDS.has(key)) continue;
		result[key] = value;
	}
	return result;
}

function mapProject(
	row: ProjectSelectRow,
	options?: {
		includeDocStructure?: boolean;
		truncateDepth?: number;
	}
): LightProject {
	return {
		id: row.id,
		name: row.name,
		state_key: row.state_key,
		description: truncateText(row.description, PROJECT_DESCRIPTION_MAX_CHARS),
		start_at: row.start_at,
		end_at: row.end_at,
		next_step_short: truncateText(row.next_step_short, ENTITY_DESCRIPTION_MAX_CHARS),
		updated_at: row.updated_at,
		doc_structure: options?.includeDocStructure
			? buildDocStructureSummary(
					row.doc_structure as DocStructure | null,
					undefined,
					options?.truncateDepth
				)
			: undefined
	};
}

function mapGoal(row: GoalRow): LightGoal {
	return {
		id: row.id,
		name: row.name,
		description: truncateText(row.description, ENTITY_DESCRIPTION_MAX_CHARS),
		state_key: row.state_key,
		target_date: row.target_date,
		completed_at: row.completed_at,
		updated_at: row.updated_at
	};
}

function mapMilestone(row: MilestoneRow): LightMilestone {
	return {
		id: row.id,
		title: row.title,
		description: truncateText(row.description, ENTITY_DESCRIPTION_MAX_CHARS),
		state_key: row.state_key,
		due_at: row.due_at,
		completed_at: row.completed_at,
		updated_at: row.updated_at
	};
}

function mapPlan(row: PlanRow): LightPlan {
	return {
		id: row.id,
		name: row.name,
		description: truncateText(row.description, ENTITY_DESCRIPTION_MAX_CHARS),
		state_key: row.state_key,
		task_count: null,
		completed_task_count: null,
		updated_at: row.updated_at
	};
}

function mapTask(row: TaskRow): LightTask {
	return {
		id: row.id,
		title: row.title,
		description: truncateText(row.description, TASK_DESCRIPTION_MAX_CHARS),
		state_key: row.state_key,
		priority: row.priority,
		start_at: row.start_at,
		due_at: row.due_at,
		completed_at: row.completed_at,
		updated_at: row.updated_at
	};
}

function mapEvent(row: EventRow): LightEvent {
	return {
		id: row.id,
		title: row.title,
		description: truncateText(row.description, EVENT_DESCRIPTION_MAX_CHARS),
		state_key: row.state_key,
		start_at: row.start_at,
		end_at: row.end_at,
		all_day: row.all_day,
		location: row.location,
		updated_at: row.updated_at
	};
}

function mapDocument(row: ContextDocumentRow, linkedDocIds: Set<string>): LightDocument {
	const inDocStructure = linkedDocIds.has(row.id);
	return {
		id: row.id,
		title: row.title ?? 'Untitled document',
		state_key: row.state_key,
		created_at: row.created_at,
		updated_at: row.updated_at,
		in_doc_structure: inDocStructure,
		is_unlinked: !inDocStructure
	};
}

function normalizeOptionalText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function truncateText(value: string | null | undefined, maxChars: number): string | null {
	if (typeof value !== 'string') return value ?? null;
	const trimmed = value.trim();
	if (trimmed.length <= maxChars) return trimmed;
	return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
}

function toTimestamp(value: string | null | undefined): number {
	if (!value) return Number.NEGATIVE_INFINITY;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function parseTimestamp(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

const COMPLETED_STATE_KEYS = new Set([
	'done',
	'completed',
	'closed',
	'archived',
	'cancelled',
	'canceled'
]);

function normalizeStateKey(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

function isCompletedByState(stateKey: string | null | undefined): boolean {
	return COMPLETED_STATE_KEYS.has(normalizeStateKey(stateKey));
}

function dueProximityBucket(
	value: string | null | undefined,
	nowMs: number,
	dueSoonDays: number = CONTEXT_RELEVANCE_DUE_SOON_DAYS
): number {
	const dueMs = parseTimestamp(value);
	if (dueMs === null) return 3;
	if (dueMs < nowMs) return 0;
	if (dueMs <= nowMs + dueSoonDays * DAY_IN_MS) return 1;
	return 2;
}

function compareNullableNumberDesc(a: number | null | undefined, b: number | null | undefined): number {
	const aNum = typeof a === 'number' && Number.isFinite(a) ? a : null;
	const bNum = typeof b === 'number' && Number.isFinite(b) ? b : null;
	if (aNum === null && bNum === null) return 0;
	if (aNum === null) return 1;
	if (bNum === null) return -1;
	return bNum - aNum;
}

function documentRecencyTimestamp(row: ContextDocumentRow): number {
	return Math.max(toTimestamp(row.updated_at), toTimestamp(row.created_at));
}

function limitByUpdatedAt<T extends { updated_at: string | null }>(rows: T[], limit: number): T[] {
	if (rows.length <= limit) return rows;
	return [...rows]
		.sort((a, b) => toTimestamp(b.updated_at) - toTimestamp(a.updated_at))
		.slice(0, limit);
}

function limitByStartAt<T extends { start_at: string | null }>(rows: T[], limit: number): T[] {
	if (rows.length <= limit) return rows;
	return [...rows]
		.sort((a, b) => toTimestamp(a.start_at) - toTimestamp(b.start_at))
		.slice(0, limit);
}

function isTaskCompleted(row: TaskRow): boolean {
	return Boolean(row.completed_at) || isCompletedByState(row.state_key);
}

function isGoalCompleted(row: GoalRow): boolean {
	return Boolean(row.completed_at) || isCompletedByState(row.state_key);
}

function isMilestoneCompleted(row: MilestoneRow): boolean {
	return Boolean(row.completed_at) || isCompletedByState(row.state_key);
}

function isPlanCompleted(row: PlanRow): boolean {
	return isCompletedByState(row.state_key);
}

function taskStateBucket(row: TaskRow): number {
	const state = normalizeStateKey(row.state_key);
	if (state === 'in_progress') return 0;
	if (state === 'blocked') return 1;
	if (state === 'todo' || state === 'pending') return 2;
	if (state === 'draft' || state === 'backlog') return 3;
	return 4;
}

function goalStateBucket(row: GoalRow): number {
	const state = normalizeStateKey(row.state_key);
	if (state === 'active' || state === 'in_progress') return 0;
	if (state === 'todo' || state === 'pending' || state === 'draft') return 1;
	if (state === 'blocked') return 2;
	return 3;
}

function milestoneStateBucket(row: MilestoneRow): number {
	const state = normalizeStateKey(row.state_key);
	if (state === 'missed') return 0;
	if (state === 'in_progress') return 1;
	if (state === 'pending' || state === 'todo') return 2;
	if (state === 'draft') return 3;
	return 4;
}

function planStateBucket(row: PlanRow): number {
	const state = normalizeStateKey(row.state_key);
	if (state === 'active' || state === 'in_progress') return 0;
	if (state === 'blocked') return 1;
	if (state === 'todo' || state === 'pending' || state === 'draft') return 2;
	return 3;
}

function limitTasksForContext(rows: TaskRow[], limit: number, nowMs: number): TaskRow[] {
	return [...rows]
		.sort((a, b) => {
			const aCompleted = isTaskCompleted(a);
			const bCompleted = isTaskCompleted(b);
			if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

			if (!aCompleted && !bCompleted) {
				const dueDelta = dueProximityBucket(a.due_at, nowMs) - dueProximityBucket(b.due_at, nowMs);
				if (dueDelta !== 0) return dueDelta;

				const stateDelta = taskStateBucket(a) - taskStateBucket(b);
				if (stateDelta !== 0) return stateDelta;

				const priorityDelta = compareNullableNumberDesc(a.priority, b.priority);
				if (priorityDelta !== 0) return priorityDelta;
			} else {
				const completedDelta = toTimestamp(b.completed_at) - toTimestamp(a.completed_at);
				if (completedDelta !== 0) return completedDelta;
			}

			const updatedDelta = toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
			if (updatedDelta !== 0) return updatedDelta;

			const startDelta = toTimestamp(a.start_at) - toTimestamp(b.start_at);
			if (startDelta !== 0) return startDelta;

			return a.id.localeCompare(b.id);
		})
		.slice(0, Math.max(0, limit));
}

function limitGoalsForContext(rows: GoalRow[], limit: number, nowMs: number): GoalRow[] {
	return [...rows]
		.sort((a, b) => {
			const aCompleted = isGoalCompleted(a);
			const bCompleted = isGoalCompleted(b);
			if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

			if (!aCompleted && !bCompleted) {
				const targetDelta =
					dueProximityBucket(a.target_date, nowMs) - dueProximityBucket(b.target_date, nowMs);
				if (targetDelta !== 0) return targetDelta;

				const stateDelta = goalStateBucket(a) - goalStateBucket(b);
				if (stateDelta !== 0) return stateDelta;
			} else {
				const completedDelta = toTimestamp(b.completed_at) - toTimestamp(a.completed_at);
				if (completedDelta !== 0) return completedDelta;
			}

			const updatedDelta = toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
			if (updatedDelta !== 0) return updatedDelta;

			return a.id.localeCompare(b.id);
		})
		.slice(0, Math.max(0, limit));
}

function limitMilestonesForContext(rows: MilestoneRow[], limit: number, nowMs: number): MilestoneRow[] {
	return [...rows]
		.sort((a, b) => {
			const aCompleted = isMilestoneCompleted(a);
			const bCompleted = isMilestoneCompleted(b);
			if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

			if (!aCompleted && !bCompleted) {
				const dueDelta = dueProximityBucket(a.due_at, nowMs) - dueProximityBucket(b.due_at, nowMs);
				if (dueDelta !== 0) return dueDelta;

				const stateDelta = milestoneStateBucket(a) - milestoneStateBucket(b);
				if (stateDelta !== 0) return stateDelta;
			} else {
				const completedDelta = toTimestamp(b.completed_at) - toTimestamp(a.completed_at);
				if (completedDelta !== 0) return completedDelta;
			}

			const updatedDelta = toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
			if (updatedDelta !== 0) return updatedDelta;

			return a.id.localeCompare(b.id);
		})
		.slice(0, Math.max(0, limit));
}

function limitPlansForContext(rows: PlanRow[], limit: number): PlanRow[] {
	return [...rows]
		.sort((a, b) => {
			const aCompleted = isPlanCompleted(a);
			const bCompleted = isPlanCompleted(b);
			if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

			const stateDelta = planStateBucket(a) - planStateBucket(b);
			if (stateDelta !== 0) return stateDelta;

			const updatedDelta = toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
			if (updatedDelta !== 0) return updatedDelta;

			return a.id.localeCompare(b.id);
		})
		.slice(0, Math.max(0, limit));
}

function limitDocumentsForContext(
	rows: ContextDocumentRow[],
	linkedDocIds: Set<string>,
	limit: number
): ContextDocumentRow[] {
	if (rows.length === 0) return [];

	return [...rows]
		.sort((a, b) => {
			const aLinked = linkedDocIds.has(a.id);
			const bLinked = linkedDocIds.has(b.id);
			if (aLinked !== bLinked) return aLinked ? 1 : -1;

			const recencyDelta = documentRecencyTimestamp(b) - documentRecencyTimestamp(a);
			if (recencyDelta !== 0) return recencyDelta;

			return (a.title ?? '').localeCompare(b.title ?? '');
		})
		.slice(0, Math.max(0, limit));
}

function buildEntityScopeMeta(params: {
	returned: number;
	totalMatching: number;
	limit: number | null;
	selectionStrategy: string;
	filters?: Record<string, unknown>;
}) {
	return {
		returned: params.returned,
		total_matching: params.totalMatching,
		limit: params.limit,
		is_complete: params.returned >= params.totalMatching,
		selection_strategy: params.selectionStrategy,
		filters: params.filters
	};
}

function buildProjectContextData(params: {
	source: 'rpc' | 'fallback';
	projectRow: ProjectSelectRow;
	goals: GoalRow[];
	milestones: MilestoneRow[];
	plans: PlanRow[];
	tasks: TaskRow[];
	documents: ContextDocumentRow[];
	events: EventRow[];
	members: ProjectMemberRow[];
	eventWindow: FastChatEventWindow;
}): ProjectContextData {
	const nowMs = parseTimestamp(params.eventWindow.now_at) ?? Date.now();
	const rawDocStructure = params.projectRow.doc_structure as DocStructure | null | undefined;
	const doc_structure = buildDocStructureSummary(rawDocStructure);
	const linkedDocIds = new Set(collectDocStructureIds(rawDocStructure));

	const goalRows = limitGoalsForContext(params.goals, PROJECT_CONTEXT_GOAL_LIMIT, nowMs);
	const milestoneRows = limitMilestonesForContext(
		params.milestones,
		PROJECT_CONTEXT_MILESTONE_LIMIT,
		nowMs
	);
	const planRows = limitPlansForContext(params.plans, PROJECT_CONTEXT_PLAN_LIMIT);
	const taskRows = limitTasksForContext(params.tasks, PROJECT_CONTEXT_TASK_LIMIT, nowMs);
	const windowedEvents = filterEventsToWindow(params.events, params.eventWindow);
	const eventRows = limitByStartAt(windowedEvents, PROJECT_CONTEXT_EVENT_LIMIT);
	const documentRows = limitDocumentsForContext(
		params.documents,
		linkedDocIds,
		PROJECT_CONTEXT_DOCUMENT_LIMIT
	);
	const unlinkedTotal = params.documents.filter((row) => !linkedDocIds.has(row.id)).length;
	const linkedTotal = Math.max(0, params.documents.length - unlinkedTotal);

	return {
		project: mapProject(params.projectRow, { includeDocStructure: false }),
		doc_structure,
		goals: goalRows.map(mapGoal),
		milestones: milestoneRows.map(mapMilestone),
		plans: planRows.map(mapPlan),
		tasks: taskRows.map(mapTask),
		documents: documentRows.map((row) => mapDocument(row, linkedDocIds)),
		events: eventRows.map(mapEvent),
		events_window: params.eventWindow,
		members: sortProjectMembers(params.members.map(mapProjectMember)),
		context_meta: {
			generated_at: new Date().toISOString(),
			source: params.source,
			cache_age_seconds: 0,
			entity_scopes: {
				goals: buildEntityScopeMeta({
					returned: goalRows.length,
					totalMatching: params.goals.length,
					limit: PROJECT_CONTEXT_GOAL_LIMIT,
					selectionStrategy: 'goal_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: CONTEXT_RELEVANCE_DUE_SOON_DAYS
					}
				}),
				milestones: buildEntityScopeMeta({
					returned: milestoneRows.length,
					totalMatching: params.milestones.length,
					limit: PROJECT_CONTEXT_MILESTONE_LIMIT,
					selectionStrategy: 'milestone_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: CONTEXT_RELEVANCE_DUE_SOON_DAYS
					}
				}),
				plans: buildEntityScopeMeta({
					returned: planRows.length,
					totalMatching: params.plans.length,
					limit: PROJECT_CONTEXT_PLAN_LIMIT,
					selectionStrategy: 'plan_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all'
					}
				}),
				tasks: buildEntityScopeMeta({
					returned: taskRows.length,
					totalMatching: params.tasks.length,
					limit: PROJECT_CONTEXT_TASK_LIMIT,
					selectionStrategy: 'task_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: CONTEXT_RELEVANCE_DUE_SOON_DAYS
					}
				}),
				events: buildEntityScopeMeta({
					returned: eventRows.length,
					totalMatching: windowedEvents.length,
					limit: PROJECT_CONTEXT_EVENT_LIMIT,
					selectionStrategy: 'start_at_asc_windowed',
					filters: {
						deleted: 'excluded',
						start_at_window: {
							start_at: params.eventWindow.start_at,
							end_at: params.eventWindow.end_at,
							past_days: params.eventWindow.past_days,
							future_days: params.eventWindow.future_days
						}
					}
				}),
				documents: {
					...buildEntityScopeMeta({
						returned: documentRows.length,
						totalMatching: params.documents.length,
						limit: PROJECT_CONTEXT_DOCUMENT_LIMIT,
						selectionStrategy: 'unlinked_first_recent_activity_desc',
						filters: {
							deleted: 'excluded',
							include_unlinked: true
						}
					}),
					unlinked_total: unlinkedTotal,
					linked_total: linkedTotal
				}
			}
		}
	};
}

function getDefaultRoleProfile(roleKey: string | null | undefined): {
	role_name: string;
	role_description: string;
} {
	const normalized = normalizeOptionalText(roleKey)?.toLowerCase();
	if (normalized === 'owner') return DEFAULT_MEMBER_ROLE_PROFILE.owner;
	if (normalized === 'editor') return DEFAULT_MEMBER_ROLE_PROFILE.editor;
	return DEFAULT_MEMBER_ROLE_PROFILE.viewer;
}

function mapProjectMember(row: ProjectMemberRow): LightProjectMember {
	const roleKey = normalizeOptionalText(row.role_key) ?? 'viewer';
	const defaults = getDefaultRoleProfile(roleKey);
	const actorName =
		normalizeOptionalText(row.actor_name) ?? normalizeOptionalText(row.actor?.name);
	const actorEmail =
		normalizeOptionalText(row.actor_email) ?? normalizeOptionalText(row.actor?.email);
	const roleName = normalizeOptionalText(row.role_name) ?? defaults.role_name;
	const roleDescription =
		normalizeOptionalText(row.role_description) ?? defaults.role_description;

	return {
		id: row.id,
		actor_id: row.actor_id,
		actor_name: actorName,
		actor_email: actorEmail,
		role_key: roleKey,
		access: row.access,
		role_name: roleName,
		role_description: roleDescription,
		created_at: row.created_at ?? null
	};
}

function sortProjectMembers(members: LightProjectMember[]): LightProjectMember[] {
	const roleOrder: Record<string, number> = { owner: 0, editor: 1, viewer: 2 };

	return [...members].sort((a, b) => {
		const roleDelta = (roleOrder[a.role_key] ?? 99) - (roleOrder[b.role_key] ?? 99);
		if (roleDelta !== 0) return roleDelta;

		const aTime = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
		const bTime = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
		return aTime - bTime;
	});
}

function extractTitle(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object') return null;
	const record = payload as Record<string, unknown>;
	const candidate = record.title ?? record.name ?? record.text ?? record.summary;
	return typeof candidate === 'string' ? candidate : null;
}

function mapRecentActivity(rows: ProjectLogRow[]): Record<string, LightRecentActivity[]> {
	const result: Record<string, LightRecentActivity[]> = {};

	for (const row of rows) {
		if (row.action !== 'created' && row.action !== 'updated') continue;
		const action = row.action as 'created' | 'updated';
		const bucket = (result[row.project_id] ??= []);
		if (bucket.length >= RECENT_ACTIVITY_PER_PROJECT) continue;

		const title = extractTitle(row.after_data) ?? extractTitle(row.before_data);
		bucket.push({
			entity_type: row.entity_type,
			entity_id: row.entity_id,
			title,
			action,
			updated_at: row.created_at
		});
	}

	return result;
}

function groupByProject<T extends { project_id: string }, U>(
	rows: T[],
	mapper: (row: T) => U
): Record<string, U[]> {
	const result: Record<string, U[]> = {};
	for (const row of rows) {
		const bucket = (result[row.project_id] ??= []);
		bucket.push(mapper(row));
	}
	return result;
}

function buildGlobalContextFromRpc(payload: FastChatContextRpcResponse): GlobalContextData {
	const projects = asArray<ProjectSelectRow>(payload.projects);
	const lightProjects = projects.map((row) =>
		mapProject(row, {
			includeDocStructure: true,
			truncateDepth: GLOBAL_DOC_STRUCTURE_DEPTH
		})
	);

	if (lightProjects.length === 0) {
		return {
			projects: lightProjects,
			project_recent_activity: {},
			project_goals: {},
			project_milestones: {},
			project_plans: {}
		};
	}

	const goals = asArray<GoalRow & { project_id?: string }>(payload.goals).filter(
		(row): row is GoalRow & { project_id: string } => typeof row.project_id === 'string'
	);
	const milestones = asArray<MilestoneRow & { project_id?: string }>(payload.milestones).filter(
		(row): row is MilestoneRow & { project_id: string } => typeof row.project_id === 'string'
	);
	const plans = asArray<PlanRow & { project_id?: string }>(payload.plans).filter(
		(row): row is PlanRow & { project_id: string } => typeof row.project_id === 'string'
	);

	return {
		projects: lightProjects,
		project_recent_activity: mapRecentActivity(asArray<ProjectLogRow>(payload.project_logs)),
		project_goals: groupByProject(goals, mapGoal),
		project_milestones: groupByProject(milestones, mapMilestone),
		project_plans: groupByProject(plans, mapPlan)
	};
}

function buildProjectContextFromRpc(
	payload: FastChatContextRpcResponse,
	eventWindow: FastChatEventWindow
): ProjectContextData | null {
	const projectRow = payload.project;
	if (!projectRow) return null;

	return buildProjectContextData({
		source: 'rpc',
		projectRow,
		goals: asArray<GoalRow>(payload.goals),
		milestones: asArray<MilestoneRow>(payload.milestones),
		plans: asArray<PlanRow>(payload.plans),
		tasks: asArray<TaskRow>(payload.tasks),
		documents: asArray<ContextDocumentRow>(payload.documents),
		events: asArray<EventRow>(payload.events),
		members: asArray<ProjectMemberRow>(payload.members),
		eventWindow
	});
}

function buildEntityContextFromRpc(params: {
	payload: FastChatContextRpcResponse;
	projectContext: ProjectContextData;
	focusType: ProjectFocus['focusType'];
	focusEntityId: string;
}): { data: EntityContextData; focusEntityName?: string | null } {
	const { payload, projectContext, focusType, focusEntityId } = params;
	const rawFocus =
		payload.focus_entity_full && typeof payload.focus_entity_full === 'object'
			? (payload.focus_entity_full as Record<string, unknown>)
			: null;
	const focusEntityFull = stripEntityFields(rawFocus);
	const focusEntityName = resolveEntityName(focusEntityFull);
	const linked_entities =
		payload.linked_entities && typeof payload.linked_entities === 'object'
			? (payload.linked_entities as Record<string, Array<Record<string, unknown>>>)
			: {};
	const linked_edges = asArray<LinkedEdge>(payload.linked_edges);

	return {
		data: {
			...projectContext,
			focus_entity_type: focusType,
			focus_entity_id: focusEntityId,
			focus_entity_full: focusEntityFull ?? {},
			linked_entities,
			linked_edges
		},
		focusEntityName
	};
}

async function loadFastChatContextViaRpc(
	params: LoadContextParams
): Promise<FastChatContextRpcResponse | null> {
	const { supabase, userId, contextType, entityId, projectFocus } = params;
	const rpcContextType = resolveRpcContextType(contextType, projectFocus);
	if (!rpcContextType) return null;

	const projectId = resolveProjectId(contextType, entityId, projectFocus);
	if (rpcContextType === 'project' && !projectId) return null;

	const focusType =
		projectFocus?.focusType && projectFocus.focusType !== 'project-wide'
			? projectFocus.focusType
			: null;
	const focusEntityId = focusType ? (projectFocus?.focusEntityId ?? null) : null;

	const { data, error } = await supabase.rpc(FASTCHAT_CONTEXT_RPC, {
		p_context_type: rpcContextType,
		p_user_id: userId,
		p_project_id: projectId ?? undefined,
		p_focus_type: (focusEntityId ? focusType : null) ?? undefined,
		p_focus_entity_id: focusEntityId ?? undefined
	});

	if (error) {
		logger.warn('FastChat context RPC failed', {
			error,
			contextType,
			projectId,
			focusType
		});
		reportContextLoadError(params.onError, 'rpc.load_fastchat_context', error, {
			contextType,
			projectId,
			focusType,
			focusEntityId
		});
		return null;
	}

	if (!data || typeof data !== 'object') return null;

	return data as FastChatContextRpcResponse;
}

async function loadGlobalContextData(
	supabase: SupabaseClient<Database>,
	userId: string,
	onError?: LoadContextParams['onError']
): Promise<GlobalContextData> {
	const { data: projects, error } = await supabase
		.from('onto_projects')
		.select(
			'id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure'
		)
		.eq('created_by', userId)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });

	if (error) {
		logger.warn('Failed to load global projects', { error });
		reportContextLoadError(onError, 'query.global.projects', error, { userId });
		return {
			projects: [],
			project_recent_activity: {},
			project_goals: {},
			project_milestones: {},
			project_plans: {}
		};
	}

	const projectRows = projects ?? [];
	const lightProjects = projectRows.map((row) =>
		mapProject(row, {
			includeDocStructure: true,
			truncateDepth: GLOBAL_DOC_STRUCTURE_DEPTH
		})
	);
	const projectIds = lightProjects.map((project) => project.id);

	if (projectIds.length === 0) {
		return {
			projects: lightProjects,
			project_recent_activity: {},
			project_goals: {},
			project_milestones: {},
			project_plans: {}
		};
	}

	const [goalsRes, milestonesRes, plansRes, logsRes] = await Promise.all([
		supabase
			.from('onto_goals')
			.select(
				'id, project_id, name, description, state_key, target_date, completed_at, updated_at'
			)
			.in('project_id', projectIds)
			.is('deleted_at', null),
		supabase
			.from('onto_milestones')
			.select(
				'id, project_id, title, description, state_key, due_at, completed_at, updated_at'
			)
			.in('project_id', projectIds)
			.is('deleted_at', null),
		supabase
			.from('onto_plans')
			.select('id, project_id, name, description, state_key, updated_at')
			.in('project_id', projectIds)
			.is('deleted_at', null),
		supabase
			.from('onto_project_logs')
			.select(
				'project_id, entity_type, entity_id, action, created_at, after_data, before_data'
			)
			.in('project_id', projectIds)
			.order('created_at', { ascending: false })
			.limit(projectIds.length * RECENT_ACTIVITY_PER_PROJECT)
	]);

	if (goalsRes.error) {
		logger.warn('Failed to load global goals', { error: goalsRes.error });
		reportContextLoadError(onError, 'query.global.goals', goalsRes.error, {
			projectCount: projectIds.length
		});
	}
	if (milestonesRes.error)
		logger.warn('Failed to load global milestones', { error: milestonesRes.error });
	if (milestonesRes.error) {
		reportContextLoadError(onError, 'query.global.milestones', milestonesRes.error, {
			projectCount: projectIds.length
		});
	}
	if (plansRes.error) {
		logger.warn('Failed to load global plans', { error: plansRes.error });
		reportContextLoadError(onError, 'query.global.plans', plansRes.error, {
			projectCount: projectIds.length
		});
	}
	if (logsRes.error)
		logger.warn('Failed to load global project activity', { error: logsRes.error });
	if (logsRes.error) {
		reportContextLoadError(onError, 'query.global.activity', logsRes.error, {
			projectCount: projectIds.length
		});
	}

	const project_goals = groupByProject(
		(goalsRes.data ?? []) as Array<GoalRow & { project_id: string }>,
		mapGoal
	);
	const project_milestones = groupByProject(
		(milestonesRes.data ?? []) as Array<MilestoneRow & { project_id: string }>,
		mapMilestone
	);
	const project_plans = groupByProject(
		(plansRes.data ?? []) as Array<PlanRow & { project_id: string }>,
		mapPlan
	);
	const project_recent_activity = mapRecentActivity((logsRes.data ?? []) as ProjectLogRow[]);

	return {
		projects: lightProjects,
		project_recent_activity,
		project_goals,
		project_milestones,
		project_plans
	};
}

async function loadProjectContextData(
	supabase: SupabaseClient<Database>,
	projectId: string,
	eventWindow: FastChatEventWindow,
	onError?: LoadContextParams['onError']
): Promise<ProjectContextData | null> {
	const { data: projectRow, error } = await supabase
		.from('onto_projects')
		.select(
			'id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure'
		)
		.eq('id', projectId)
		.maybeSingle();

	if (error || !projectRow) {
		logger.warn('Failed to load project context project', { error, projectId });
		reportContextLoadError(
			onError,
			'query.project.root',
			error ?? new Error('Project not found'),
			{
				projectId
			}
		);
		return null;
	}

	const [goalsRes, milestonesRes, plansRes, tasksRes, eventsRes, membersRes, documentsRes] =
		await Promise.all([
			supabase
				.from('onto_goals')
				.select('id, name, description, state_key, target_date, completed_at, updated_at')
				.eq('project_id', projectId)
				.is('deleted_at', null),
			supabase
				.from('onto_milestones')
				.select('id, title, description, state_key, due_at, completed_at, updated_at')
				.eq('project_id', projectId)
				.is('deleted_at', null),
			supabase
				.from('onto_plans')
				.select('id, name, description, state_key, updated_at')
				.eq('project_id', projectId)
				.is('deleted_at', null),
			supabase
				.from('onto_tasks')
				.select(
					'id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at'
				)
				.eq('project_id', projectId)
				.is('deleted_at', null),
			supabase
				.from('onto_events')
				.select(
					'id, title, description, state_key, start_at, end_at, all_day, location, updated_at'
				)
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.gte('start_at', eventWindow.start_at)
				.lte('start_at', eventWindow.end_at),
			supabase
				.from('onto_project_members')
				.select(
					'id, project_id, actor_id, role_key, access, role_name, role_description, created_at, actor:onto_actors!onto_project_members_actor_id_fkey(id, name, email)'
				)
				.eq('project_id', projectId)
				.is('removed_at', null),
			supabase
				.from('onto_documents')
				.select('id, title, state_key, created_at, updated_at')
				.eq('project_id', projectId)
				.is('deleted_at', null)
		]);

	if (goalsRes.error) {
		logger.warn('Failed to load project goals', { error: goalsRes.error });
		reportContextLoadError(onError, 'query.project.goals', goalsRes.error, { projectId });
	}
	if (milestonesRes.error)
		logger.warn('Failed to load project milestones', { error: milestonesRes.error });
	if (milestonesRes.error) {
		reportContextLoadError(onError, 'query.project.milestones', milestonesRes.error, {
			projectId
		});
	}
	if (plansRes.error) {
		logger.warn('Failed to load project plans', { error: plansRes.error });
		reportContextLoadError(onError, 'query.project.plans', plansRes.error, { projectId });
	}
	if (tasksRes.error) {
		logger.warn('Failed to load project tasks', { error: tasksRes.error });
		reportContextLoadError(onError, 'query.project.tasks', tasksRes.error, { projectId });
	}
	if (eventsRes.error) {
		logger.warn('Failed to load project events', { error: eventsRes.error });
		reportContextLoadError(onError, 'query.project.events', eventsRes.error, { projectId });
	}
	if (membersRes.error)
		logger.warn('Failed to load project members for fast context', { error: membersRes.error });
	if (membersRes.error) {
		reportContextLoadError(onError, 'query.project.members', membersRes.error, { projectId });
	}
	if (documentsRes.error) {
		logger.warn('Failed to load project documents for fast context', {
			error: documentsRes.error
		});
		reportContextLoadError(onError, 'query.project.documents', documentsRes.error, {
			projectId
		});
	}

	return buildProjectContextData({
		source: 'fallback',
		projectRow,
		goals: (goalsRes.data ?? []) as GoalRow[],
		milestones: (milestonesRes.data ?? []) as MilestoneRow[],
		plans: (plansRes.data ?? []) as PlanRow[],
		tasks: (tasksRes.data ?? []) as TaskRow[],
		documents: (documentsRes.data ?? []) as ContextDocumentRow[],
		events: (eventsRes.data ?? []) as EventRow[],
		members: (membersRes.data ?? []) as ProjectMemberRow[],
		eventWindow
	});
}

async function loadLinkedEntities(
	supabase: SupabaseClient<Database>,
	projectId: string,
	focusEntityId: string,
	onError?: LoadContextParams['onError']
): Promise<{
	linked_entities: Record<string, Array<Record<string, unknown>>>;
	linked_edges: LinkedEdge[];
}> {
	const { data: edges, error } = await supabase
		.from('onto_edges')
		.select('src_id, src_kind, dst_id, dst_kind, rel')
		.eq('project_id', projectId)
		.or(`src_id.eq.${focusEntityId},dst_id.eq.${focusEntityId}`);

	if (error) {
		logger.warn('Failed to load linked entity edges', { error, projectId, focusEntityId });
		reportContextLoadError(onError, 'query.project.linked_edges', error, {
			projectId,
			focusEntityId
		});
		return { linked_entities: {}, linked_edges: [] };
	}

	const linkedEdges: LinkedEdge[] = ((edges ?? []) as EdgeRow[]).map((edge) => ({
		src_id: edge.src_id,
		src_kind: edge.src_kind,
		dst_id: edge.dst_id,
		dst_kind: edge.dst_kind,
		rel: edge.rel
	}));

	const linkedIdsByKind: Record<string, Set<string>> = {};
	for (const edge of edges ?? []) {
		if (edge.src_id === focusEntityId) {
			(linkedIdsByKind[edge.dst_kind] ??= new Set()).add(edge.dst_id);
		}
		if (edge.dst_id === focusEntityId) {
			(linkedIdsByKind[edge.src_kind] ??= new Set()).add(edge.src_id);
		}
	}

	const entries = Object.entries(linkedIdsByKind).filter(([_kind, ids]) => ids.size > 0);
	if (entries.length === 0) {
		return { linked_entities: {}, linked_edges: linkedEdges };
	}

	const fetches = entries.map(
		async ([kind, ids]): Promise<readonly [string, Record<string, unknown>[]]> => {
			const config = LINKED_ENTITY_CONFIG[kind];
			if (!config) return [kind, []] as const;
			const { data, error } = await (supabase
				.from(config.table as any)
				.select(config.select)
				.in('id', Array.from(ids))
				.is('deleted_at', null) as any);
			if (error) {
				logger.warn('Failed to load linked entities', { error, kind });
				reportContextLoadError(onError, `query.project.linked_entities.${kind}`, error, {
					projectId,
					focusEntityId,
					kind
				});
				return [kind, []] as const;
			}
			return [kind, ((data ?? []) as any[]).map(config.map)] as const;
		}
	);

	const resolved = await Promise.all(fetches);
	const linked_entities: Record<string, Array<Record<string, unknown>>> = {};
	for (const [kind, items] of resolved) {
		if (items.length > 0) linked_entities[kind] = items;
	}

	return { linked_entities, linked_edges: linkedEdges };
}

async function loadEntityContextData(params: {
	supabase: SupabaseClient<Database>;
	projectId: string;
	eventWindow: FastChatEventWindow;
	focusType: ProjectFocus['focusType'];
	focusEntityId: string;
	onError?: LoadContextParams['onError'];
}): Promise<{ data: EntityContextData | null; focusEntityName?: string | null }> {
	const { supabase, projectId, eventWindow, focusType, focusEntityId, onError } = params;
	const projectContext = await loadProjectContextData(supabase, projectId, eventWindow, onError);
	if (!projectContext) return { data: null };

	const focusConfig = LINKED_ENTITY_CONFIG[focusType];
	let focusEntityFull: Record<string, unknown> | null = null;
	let focusEntityName: string | null = null;

	if (focusConfig) {
		const { data, error } = await (supabase
			.from(focusConfig.table as any)
			.select('*')
			.eq('id', focusEntityId)
			.maybeSingle() as any);
		if (error) {
			logger.warn('Failed to load focus entity', { error, focusType, focusEntityId });
			reportContextLoadError(onError, 'query.project.focus_entity', error, {
				projectId,
				focusType,
				focusEntityId
			});
		} else if (data) {
			focusEntityFull = stripEntityFields(data as Record<string, unknown>);
			focusEntityName = resolveEntityName(focusEntityFull);
		}
	}

	const { linked_entities, linked_edges } = await loadLinkedEntities(
		supabase,
		projectId,
		focusEntityId,
		onError
	);

	return {
		data: {
			...projectContext,
			focus_entity_type: focusType,
			focus_entity_id: focusEntityId,
			focus_entity_full: focusEntityFull ?? {},
			linked_entities,
			linked_edges
		},
		focusEntityName
	};
}

async function loadDailyBriefContextData(params: {
	supabase: SupabaseClient<Database>;
	userId: string;
	briefId: string;
	onError?: LoadContextParams['onError'];
}): Promise<DailyBriefContextData | null> {
	const { supabase, userId, briefId, onError } = params;

	const { data: briefRow, error: briefError } = await supabase
		.from('ontology_daily_briefs')
		.select(
			'id, brief_date, executive_summary, priority_actions, generation_status, llm_analysis, metadata'
		)
		.eq('id', briefId)
		.eq('user_id', userId)
		.maybeSingle();

	if (briefError || !briefRow) {
		if (briefError) {
			logger.warn('Failed to load daily brief context', { error: briefError, briefId });
			reportContextLoadError(onError, 'query.daily_brief.root', briefError, {
				userId,
				briefId
			});
		}
		return null;
	}

	const [projectBriefsRes, entitiesRes] = await Promise.all([
		supabase
			.from('ontology_project_briefs')
			.select(
				'id, project_id, brief_content, metadata, created_at, project:onto_projects(name)'
			)
			.eq('daily_brief_id', briefId)
			.order('created_at', { ascending: true }),
		supabase
			.from('ontology_brief_entities')
			.select(
				'id, entity_kind, entity_id, project_id, role, created_at, project:onto_projects(name)'
			)
			.eq('daily_brief_id', briefId)
			.order('created_at', { ascending: true })
	]);

	if (projectBriefsRes.error) {
		logger.warn('Failed to load daily brief project briefs', {
			error: projectBriefsRes.error,
			briefId
		});
		reportContextLoadError(
			onError,
			'query.daily_brief.project_briefs',
			projectBriefsRes.error,
			{
				briefId
			}
		);
	}

	if (entitiesRes.error) {
		logger.warn('Failed to load daily brief mentioned entities', {
			error: entitiesRes.error,
			briefId
		});
		reportContextLoadError(onError, 'query.daily_brief.entities', entitiesRes.error, {
			briefId
		});
	}

	const projectBriefs: DailyBriefProjectBrief[] = (projectBriefsRes.data ?? []).map((row) => {
		const projectBrief = row as OntologyProjectBriefRow & {
			project?: { name?: string | null } | null;
		};

		return {
			id: projectBrief.id,
			project_id: projectBrief.project_id,
			project_name: normalizeOptionalText(projectBrief.project?.name) ?? null,
			brief_content: projectBrief.brief_content ?? '',
			metadata: asRecord(projectBrief.metadata) ?? null,
			created_at: projectBrief.created_at
		};
	});

	const mentionedEntitiesFromTable: DailyBriefMentionedEntity[] = (entitiesRes.data ?? []).map(
		(row) => {
			const entityRow = row as OntologyBriefEntityRow & {
				project?: { name?: string | null } | null;
			};
			return {
				id: entityRow.id,
				entity_kind: entityRow.entity_kind,
				entity_id: entityRow.entity_id,
				project_id: entityRow.project_id,
				project_name: normalizeOptionalText(entityRow.project?.name) ?? null,
				role: entityRow.role,
				source: 'ontology_brief_entities'
			};
		}
	);

	const executiveSummary = briefRow.executive_summary ?? '';
	const fallbackEntities = extractFallbackBriefEntities({
		executiveSummary,
		projectBriefs
	});
	const mentionedEntities =
		mentionedEntitiesFromTable.length > 0 ? mentionedEntitiesFromTable : fallbackEntities;

	return {
		brief_id: briefRow.id,
		brief_date: briefRow.brief_date,
		executive_summary: executiveSummary,
		priority_actions: briefRow.priority_actions ?? [],
		generation_status: briefRow.generation_status,
		llm_analysis: briefRow.llm_analysis,
		metadata: asRecord((briefRow as OntologyDailyBriefRow).metadata) ?? null,
		project_briefs: projectBriefs,
		mentioned_entities: mentionedEntities,
		mentioned_entity_counts: buildMentionedEntityCounts(mentionedEntities)
	};
}

export async function loadFastChatPromptContext(
	params: LoadContextParams
): Promise<MasterPromptContext> {
	const { supabase, userId, contextType, entityId, projectFocus } = params;
	const eventWindow = buildFastChatEventWindow();

	const projectId = resolveProjectId(contextType, entityId, projectFocus);
	const focusType =
		projectFocus?.focusType && projectFocus.focusType !== 'project-wide'
			? projectFocus.focusType
			: null;
	const focusEntityId = focusType ? (projectFocus?.focusEntityId ?? null) : null;
	const focusEntityName = focusType ? (projectFocus?.focusEntityName ?? null) : null;

	const baseContext: MasterPromptContext = {
		contextType,
		entityId: entityId ?? null,
		projectId,
		projectName: projectFocus?.projectName ?? null,
		focusEntityType: focusType,
		focusEntityId,
		focusEntityName
	};

	if (contextType === 'daily_brief') {
		if (!entityId) {
			return { ...baseContext, data: null };
		}

		const data = await loadDailyBriefContextData({
			supabase,
			userId,
			briefId: entityId,
			onError: params.onError
		});
		return {
			...baseContext,
			entityId,
			data
		};
	}

	const rpcContextType = resolveRpcContextType(contextType, projectFocus);
	if (rpcContextType) {
		const rpcPayload = await loadFastChatContextViaRpc(params);
		if (rpcPayload) {
			if (rpcContextType === 'global') {
				const data = buildGlobalContextFromRpc(rpcPayload);
				return { ...baseContext, data };
			}

			const projectContext = buildProjectContextFromRpc(rpcPayload, eventWindow);
			if (projectContext) {
				const resolvedProjectName =
					projectContext.project.name ?? baseContext.projectName ?? null;
				if (focusType && focusEntityId) {
					const { data, focusEntityName: resolvedFocusName } = buildEntityContextFromRpc({
						payload: rpcPayload,
						projectContext,
						focusType,
						focusEntityId
					});
					return {
						...baseContext,
						projectId,
						projectName: resolvedProjectName,
						focusEntityName: resolvedFocusName ?? baseContext.focusEntityName ?? null,
						data
					};
				}

				return {
					...baseContext,
					projectId,
					projectName: resolvedProjectName,
					data: projectContext
				};
			}
		}
	}

	if (contextType === 'global') {
		const data = await loadGlobalContextData(supabase, userId, params.onError);
		return { ...baseContext, data };
	}

	if (isProjectContext(contextType)) {
		if (!projectId) {
			return { ...baseContext, data: null };
		}

		if (focusType && focusEntityId) {
			const { data, focusEntityName } = await loadEntityContextData({
				supabase,
				projectId,
				eventWindow,
				focusType,
				focusEntityId,
				onError: params.onError
			});
			return {
				...baseContext,
				projectId,
				projectName: projectFocus?.projectName ?? baseContext.projectName,
				focusEntityName: focusEntityName ?? baseContext.focusEntityName ?? null,
				data
			};
		}

		const data = await loadProjectContextData(supabase, projectId, eventWindow, params.onError);
		const projectName = data?.project.name ?? baseContext.projectName ?? null;
		return {
			...baseContext,
			projectId,
			projectName,
			data
		};
	}

	if (contextType === 'ontology' && projectFocus?.projectId) {
		const resolvedProjectId = projectFocus.projectId;
		const data = await loadProjectContextData(
			supabase,
			resolvedProjectId,
			eventWindow,
			params.onError
		);
		return {
			...baseContext,
			projectId: resolvedProjectId,
			projectName: projectFocus.projectName ?? data?.project.name ?? null,
			data
		};
	}

	return { ...baseContext, data: null };
}
