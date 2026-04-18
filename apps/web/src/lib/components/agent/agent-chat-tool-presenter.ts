// apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts
//
// Tool display presenter for AgentChatModal.
// Extracts ~1,000 LOC of tool-name → display-string logic, entity-name
// resolution, calendar formatting, and mutation tracking out of the modal
// into a testable factory. See:
//   apps/web/docs/features/agentic-chat/PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md
//
// Usage:
//   const presenter = createToolPresenter({
//     getContextType: () => selectedContextType,
//     getEntityId: () => selectedEntityId,
//     getContextLabel: () => selectedContextLabel,
//     getProjectFocus: () => projectFocus,
//     getResolvedProjectFocus: () => resolvedProjectFocus,
//     toast: toastService,
//     isDev: dev
//   });
//   presenter.formatToolMessage(toolName, args, 'pending');

import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { ActivityEntry, DataMutationSummary } from './agent-chat.types';
import {
	extractSkillPathFromSkillLoadArgs,
	formatSkillActivityContent
} from './agent-chat-skill-activity';
import { isProjectContext } from './agent-chat-session';

export type OntologyEntityKind =
	| 'project'
	| 'task'
	| 'goal'
	| 'plan'
	| 'document'
	| 'milestone'
	| 'risk'
	| 'event';

export interface NormalizedToolDisplay {
	hidden: boolean;
	toolName: string;
	args: string | Record<string, any>;
	gatewayOp?: string;
	originalToolName: string;
}

export interface ToolPresenterContext {
	getContextType: () => ChatContextType | null;
	getEntityId: () => string | undefined;
	getContextLabel: () => string | null;
	getProjectFocus: () => ProjectFocus | null;
	getResolvedProjectFocus: () => ProjectFocus | null;
	toast?: {
		success: (msg: string) => void;
		error: (msg: string) => void;
	};
	isDev?: boolean;
}

export interface ToolPresenter {
	// Display
	formatToolMessage(
		toolName: string,
		args: string | Record<string, any>,
		status: 'pending' | 'completed' | 'failed',
		errorMessage?: string
	): string;
	formatOperationEvent(operation: Record<string, any>): {
		message: string;
		activityStatus: ActivityEntry['status'];
	};
	formatErrorMessage(error: unknown, maxLength?: number): string | undefined;
	normalizeToolDisplayPayload(
		toolName: string,
		args: string | Record<string, any>
	): NormalizedToolDisplay;

	// Entity name cache
	cacheEntityName(kind: OntologyEntityKind | 'entity', id: string, name: string): void;
	resolveEntityName(
		kind: OntologyEntityKind | undefined,
		id?: string,
		candidateName?: string
	): string | undefined;
	indexEntitiesFromPayload(payload: Record<string, any>): void;
	indexEntitiesFromToolResult(toolResult: unknown): void;

	// Mutation tracking
	recordDataMutation(
		toolName: string | undefined,
		args: string | Record<string, unknown> | undefined,
		success: boolean,
		toolResult?: { data?: any }
	): void;
	resetMutationTracking(): void;
	buildMutationSummary(
		extra: Pick<DataMutationSummary, 'hasMessagesSent' | 'sessionId'>
	): DataMutationSummary;

	// Side-effectful display
	showToolResultToast(
		toolName: string,
		args: string | Record<string, unknown>,
		success: boolean
	): void;

	// Catalog (exposed for callers that still gate on the set directly)
	readonly MUTATION_TRACKED_TOOLS: ReadonlySet<string>;
	readonly DATA_MUTATION_TOOLS: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Tool catalog — single source of truth for mutation tracking + toasting.
// `toast` tools trigger a user-visible toast on completion.
// `trackMutation` tools bump the mutation counter / affected-project set.
// ---------------------------------------------------------------------------

interface ToolCatalogEntry {
	toast: boolean;
	trackMutation: boolean;
}

const TOOL_CATALOG: Record<string, ToolCatalogEntry> = {
	// Ontology writes — both toast + track
	create_onto_project: { toast: true, trackMutation: true },
	update_onto_project: { toast: true, trackMutation: true },
	create_onto_task: { toast: true, trackMutation: true },
	update_onto_task: { toast: true, trackMutation: true },
	delete_onto_task: { toast: true, trackMutation: true },
	create_onto_goal: { toast: true, trackMutation: true },
	update_onto_goal: { toast: true, trackMutation: true },
	delete_onto_goal: { toast: true, trackMutation: true },
	create_onto_plan: { toast: true, trackMutation: true },
	update_onto_plan: { toast: true, trackMutation: true },
	delete_onto_plan: { toast: true, trackMutation: true },
	create_onto_document: { toast: true, trackMutation: true },
	update_onto_document: { toast: true, trackMutation: true },
	delete_onto_document: { toast: true, trackMutation: true },
	update_onto_milestone: { toast: true, trackMutation: true },
	update_onto_risk: { toast: true, trackMutation: true },
	create_calendar_event: { toast: true, trackMutation: true },
	update_calendar_event: { toast: true, trackMutation: true },
	delete_calendar_event: { toast: true, trackMutation: true },
	set_project_calendar: { toast: true, trackMutation: true },

	// Tracked but no user-facing toast (quieter effects)
	create_task_document: { toast: false, trackMutation: true },
	link_onto_entities: { toast: false, trackMutation: true },
	unlink_onto_edge: { toast: false, trackMutation: true }
};

const DATA_MUTATION_TOOLS_SET: ReadonlySet<string> = new Set(
	Object.entries(TOOL_CATALOG)
		.filter(([, entry]) => entry.toast)
		.map(([name]) => name)
);

const MUTATION_TRACKED_TOOLS_SET: ReadonlySet<string> = new Set(
	Object.entries(TOOL_CATALOG)
		.filter(([, entry]) => entry.trackMutation)
		.map(([name]) => name)
);

// ---------------------------------------------------------------------------
// Entity-name constants
// ---------------------------------------------------------------------------

const ENTITY_NAME_FIELDS = ['name', 'title', 'text', 'summary', 'label'] as const;

const ENTITY_SINGULAR_KEYS: Record<string, OntologyEntityKind> = {
	project: 'project',
	task: 'task',
	goal: 'goal',
	plan: 'plan',
	document: 'document',
	milestone: 'milestone',
	risk: 'risk',
	event: 'event'
};

const ENTITY_PLURAL_KEYS: Record<string, OntologyEntityKind> = {
	projects: 'project',
	tasks: 'task',
	goals: 'goal',
	plans: 'plan',
	documents: 'document',
	milestones: 'milestone',
	risks: 'risk',
	events: 'event'
};

// ---------------------------------------------------------------------------
// Verb tables
// ---------------------------------------------------------------------------

const TOOL_ACTION_PAST_TENSE: Record<string, string> = {
	Running: 'Ran',
	Setting: 'Set'
};

const TOOL_ACTION_BASE_FORM: Record<string, string> = {
	Running: 'run',
	Creating: 'create',
	Updating: 'update',
	Deleting: 'delete',
	Executing: 'execute',
	Loading: 'load',
	Checking: 'check',
	Searching: 'search',
	Listing: 'list',
	Reading: 'read',
	Setting: 'set'
};

const OPERATION_VERBS: Record<string, { present: string; past: string }> = {
	list: { present: 'Listing', past: 'Listed' },
	search: { present: 'Searching', past: 'Searched' },
	read: { present: 'Reading', past: 'Read' },
	create: { present: 'Creating', past: 'Created' },
	update: { present: 'Updating', past: 'Updated' },
	delete: { present: 'Deleting', past: 'Deleted' }
};

// ---------------------------------------------------------------------------
// Calendar-date parsing
// ---------------------------------------------------------------------------

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_REGEX = /T\d{2}:\d{2}/;
const EXPLICIT_TIMEZONE_SUFFIX_REGEX = /(Z|[+-]\d{2}(?::?\d{2})?)$/i;
const EXPLICIT_TIME_REGEX =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

// ---------------------------------------------------------------------------
// Pure helpers (no presenter state)
// ---------------------------------------------------------------------------

function normalizeEntityLabel(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function capitalizeWord(value: string): string {
	if (!value) return value;
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function toPastTenseAction(action: string): string {
	const [verb, ...rest] = action.split(' ');
	if (!verb) return action;
	const pastVerb =
		TOOL_ACTION_PAST_TENSE[verb] ?? (verb.endsWith('ing') ? `${verb.slice(0, -3)}ed` : verb);
	return [pastVerb, ...rest].join(' ');
}

function toFailureAction(action: string): string {
	const [verb, ...rest] = action.split(' ');
	if (!verb) return action.toLowerCase();
	const baseVerb =
		TOOL_ACTION_BASE_FORM[verb] ??
		(verb.toLowerCase().endsWith('ing') ? verb.toLowerCase().slice(0, -3) : verb.toLowerCase());
	return [baseVerb, ...rest].join(' ').toLowerCase();
}

function formatErrorMessage(error: unknown, maxLength = 160): string | undefined {
	if (!error) return undefined;

	let message = '';
	if (typeof error === 'string') {
		message = error;
	} else if (error instanceof Error && error.message) {
		message = error.message;
	} else if (typeof error === 'object') {
		const candidate = (error as { message?: unknown }).message;
		if (typeof candidate === 'string') {
			message = candidate;
		} else {
			try {
				message = JSON.stringify(error);
			} catch {
				message = String(error);
			}
		}
	} else {
		message = String(error);
	}

	const trimmed = message.trim();
	if (!trimmed) return undefined;
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatErrorSuffix(errorMessage?: string): string {
	if (!errorMessage) return '';
	return ` - ${errorMessage}`;
}

function formatListPreview(values: string[], limit = 2): string {
	const cleaned = values
		.map((value) => (typeof value === 'string' ? value.trim() : ''))
		.filter((value) => value.length > 0);
	if (cleaned.length === 0) return '';
	if (cleaned.length <= limit) return cleaned.join(', ');
	return `${cleaned.slice(0, limit).join(', ')} (+${cleaned.length - limit} more)`;
}

function normalizeCalendarTimeZone(value: unknown): string | undefined {
	const tz = normalizeEntityLabel(value);
	if (!tz) return undefined;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return tz;
	} catch {
		return undefined;
	}
}

function formatDateOnlyLabel(raw: string): string {
	const [yearPart, monthPart, dayPart] = raw.split('-');
	const year = Number.parseInt(yearPart ?? '', 10);
	const month = Number.parseInt(monthPart ?? '', 10);
	const day = Number.parseInt(dayPart ?? '', 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
		return raw;
	}

	const monthName = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(2000, Math.max(0, month - 1), 1)));

	return `${monthName} ${day}, ${year}`;
}

function formatClockLabel(hour24: number, minute: number): string {
	const hour = ((hour24 % 24) + 24) % 24;
	const suffix = hour >= 12 ? 'PM' : 'AM';
	const hour12 = hour % 12 === 0 ? 12 : hour % 12;
	return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function normalizeOffsetLabel(rawOffset: string): string {
	const upper = rawOffset.toUpperCase();
	if (upper === 'Z') {
		return 'UTC';
	}
	const normalized = upper.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
	return `UTC${normalized}`;
}

function formatExplicitTimezoneDateLabel(raw: string): string | undefined {
	const match = raw.match(EXPLICIT_TIME_REGEX);
	if (!match) {
		return undefined;
	}

	const yearPart = match[1];
	const monthPart = match[2];
	const dayPart = match[3];
	const hourPart = match[4];
	const minutePart = match[5];
	const offsetPart = match[6];
	if (!yearPart || !monthPart || !dayPart || !hourPart || !minutePart || !offsetPart) {
		return undefined;
	}

	const hour = Number.parseInt(hourPart, 10);
	const minute = Number.parseInt(minutePart, 10);
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
		return undefined;
	}

	const dateLabel = formatDateOnlyLabel(`${yearPart}-${monthPart}-${dayPart}`);
	const timeLabel = formatClockLabel(hour, minute);
	return `${dateLabel}, ${timeLabel} ${normalizeOffsetLabel(offsetPart)}`;
}

function formatCalendarDateLabel(value: unknown, timeZone?: string): string | undefined {
	const raw = normalizeEntityLabel(value);
	if (!raw) return undefined;

	if (DATE_ONLY_REGEX.test(raw)) {
		return formatDateOnlyLabel(raw);
	}

	const hasExplicitTimezone = EXPLICIT_TIMEZONE_SUFFIX_REGEX.test(raw);
	if (!timeZone && hasExplicitTimezone) {
		const explicitLabel = formatExplicitTimezoneDateLabel(raw);
		if (explicitLabel) {
			return explicitLabel;
		}
	}

	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		return raw;
	}

	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		...(timeZone ? { timeZone } : {})
	}).format(parsed);
}

function extractEntityDisplayName(entity: Record<string, any>): string | undefined {
	for (const key of ENTITY_NAME_FIELDS) {
		const value = normalizeEntityLabel(entity[key]);
		if (value) return value;
	}
	return undefined;
}

function extractToolResultPayload(toolResult: unknown): Record<string, any> | null {
	if (!toolResult || typeof toolResult !== 'object') return null;
	const record = toolResult as Record<string, any>;
	const candidate =
		(record.data && typeof record.data === 'object' && record.data) ||
		(record.result && typeof record.result === 'object' && record.result) ||
		(record.tool_result && typeof record.tool_result === 'object' && record.tool_result);
	if (candidate) return candidate as Record<string, any>;

	const fallbackKeys = [
		'project',
		'projects',
		'task',
		'tasks',
		'goal',
		'goals',
		'plan',
		'plans',
		'document',
		'documents',
		'milestone',
		'milestones',
		'risk',
		'risks',
		'results',
		'context_shift'
	];
	if (fallbackKeys.some((key) => key in record)) {
		return record;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createToolPresenter(ctx: ToolPresenterContext): ToolPresenter {
	const entityNameCache = new Map<string, string>();
	const mutatedProjectIds = new Set<string>();
	let mutationCount = 0;

	function cacheEntityName(kind: OntologyEntityKind | 'entity', id: string, name: string): void {
		const normalizedId = normalizeEntityLabel(id);
		const normalizedName = normalizeEntityLabel(name);
		if (!normalizedId || !normalizedName) return;
		if (normalizedId === normalizedName) return;
		entityNameCache.set(`${kind}:${normalizedId}`, normalizedName);
		entityNameCache.set(`entity:${normalizedId}`, normalizedName);
	}

	function getCachedEntityName(
		kind: OntologyEntityKind | 'entity' | undefined,
		id?: string
	): string | undefined {
		const normalizedId = normalizeEntityLabel(id);
		if (!normalizedId) return undefined;
		if (kind) {
			const typed = entityNameCache.get(`${kind}:${normalizedId}`);
			if (typed) return typed;
		}
		return entityNameCache.get(`entity:${normalizedId}`);
	}

	function resolveContextEntityName(
		kind: OntologyEntityKind | undefined,
		id?: string
	): string | undefined {
		const normalizedId = normalizeEntityLabel(id);
		if (!normalizedId) return undefined;

		const contextType = ctx.getContextType();
		const resolvedFocus = ctx.getResolvedProjectFocus();
		const selectedEntityId = ctx.getEntityId();
		const selectedContextLabel = ctx.getContextLabel();
		const projectFocus = ctx.getProjectFocus();

		if (kind === 'project' || isProjectContext(contextType)) {
			if (resolvedFocus?.projectId === normalizedId && resolvedFocus?.projectName) {
				return normalizeEntityLabel(resolvedFocus.projectName);
			}
			if (
				isProjectContext(contextType) &&
				selectedEntityId === normalizedId &&
				selectedContextLabel
			) {
				return normalizeEntityLabel(selectedContextLabel);
			}
		}

		if (
			projectFocus?.focusEntityId === normalizedId &&
			projectFocus?.focusEntityName &&
			projectFocus?.focusType &&
			projectFocus.focusType !== 'project-wide'
		) {
			return normalizeEntityLabel(projectFocus.focusEntityName);
		}

		if (selectedEntityId === normalizedId && selectedContextLabel) {
			return normalizeEntityLabel(selectedContextLabel);
		}

		return undefined;
	}

	function resolveEntityName(
		kind: OntologyEntityKind | undefined,
		id?: string,
		candidateName?: string
	): string | undefined {
		const direct = normalizeEntityLabel(candidateName);
		if (direct) return direct;
		if (!id) return undefined;
		return (
			resolveContextEntityName(kind, id) ||
			getCachedEntityName(kind, id) ||
			getCachedEntityName('entity', id)
		);
	}

	function buildEntityTarget(
		name?: string,
		id?: string,
		kind?: OntologyEntityKind
	): string | undefined {
		return resolveEntityName(kind, id, name);
	}

	function indexEntityRecord(kind: OntologyEntityKind, entity: Record<string, any>): void {
		const id =
			normalizeEntityLabel(entity.id) ||
			normalizeEntityLabel(entity[`${kind}_id`]) ||
			normalizeEntityLabel(entity.entity_id);
		const name = extractEntityDisplayName(entity);
		if (id && name) {
			cacheEntityName(kind, id, name);
		}

		const projectId = normalizeEntityLabel(entity.project_id);
		const projectName = normalizeEntityLabel(entity.project_name);
		if (projectId && projectName) {
			cacheEntityName('project', projectId, projectName);
		}
	}

	function indexEntityResults(results: unknown[]): void {
		for (const result of results) {
			if (!result || typeof result !== 'object') continue;
			const entry = result as Record<string, any>;
			const id = normalizeEntityLabel(entry.entity_id) || normalizeEntityLabel(entry.id);
			const kind =
				normalizeEntityLabel(entry.entity_type) || normalizeEntityLabel(entry.type);
			const name = normalizeEntityLabel(entry.entity_name) || extractEntityDisplayName(entry);
			if (id && name) {
				cacheEntityName((kind as OntologyEntityKind) ?? 'entity', id, name);
			}
		}
	}

	function indexEntitiesFromPayload(payload: Record<string, any>): void {
		if (!payload) return;

		const contextShift =
			payload.context_shift && typeof payload.context_shift === 'object'
				? (payload.context_shift as Record<string, any>)
				: null;
		if (contextShift) {
			const shiftId = normalizeEntityLabel(contextShift.entity_id);
			const shiftName = normalizeEntityLabel(contextShift.entity_name);
			const shiftType = normalizeEntityLabel(contextShift.entity_type);
			if (shiftId && shiftName) {
				cacheEntityName((shiftType as OntologyEntityKind) ?? 'entity', shiftId, shiftName);
			}
		}

		if (payload.project_id && payload.project_name) {
			cacheEntityName('project', payload.project_id, payload.project_name);
		}

		for (const [key, kind] of Object.entries(ENTITY_SINGULAR_KEYS)) {
			const entity = payload[key];
			if (entity && typeof entity === 'object') {
				indexEntityRecord(kind, entity as Record<string, any>);
			}
		}

		for (const [key, kind] of Object.entries(ENTITY_PLURAL_KEYS)) {
			const entities = payload[key];
			if (Array.isArray(entities)) {
				for (const entity of entities) {
					if (entity && typeof entity === 'object') {
						indexEntityRecord(kind, entity as Record<string, any>);
					}
				}
			}
		}

		if (Array.isArray(payload.results)) {
			indexEntityResults(payload.results);
		}

		const nestedResult = payload.result;
		if (nestedResult && typeof nestedResult === 'object' && nestedResult !== payload) {
			indexEntitiesFromPayload(nestedResult as Record<string, any>);
		}
	}

	function indexEntitiesFromToolResult(toolResult: unknown): void {
		const payload = extractToolResultPayload(toolResult);
		if (!payload) return;
		indexEntitiesFromPayload(payload);
	}

	function formatCalendarRangeTarget(args: Record<string, any> | undefined): string | undefined {
		if (!args || typeof args !== 'object') return undefined;

		const rawTimeMin = args.time_min ?? args.timeMin;
		const rawTimeMax = args.time_max ?? args.timeMax;
		const timeZone = normalizeCalendarTimeZone(args.timezone);
		const timeMin = formatCalendarDateLabel(rawTimeMin, timeZone);
		const timeMax = formatCalendarDateLabel(rawTimeMax, timeZone);
		if (!timeMin && !timeMax) return undefined;

		const rangeLabel = `${timeMin ?? 'Start: now'} to ${timeMax ?? 'End: open'}`;
		const details: string[] = [];

		const projectTarget = resolveEntityName('project', args.project_id ?? args.projectId);
		if (projectTarget) {
			details.push(projectTarget);
		} else {
			const scope =
				normalizeEntityLabel(args.calendar_scope) ??
				normalizeEntityLabel(args.calendarScope);
			if (scope) {
				details.push(`scope: ${scope}`);
			}
		}

		const query = normalizeEntityLabel(args.query) ?? normalizeEntityLabel(args.q);
		if (query) {
			details.push(`query: ${query}`);
		}
		const hasTimeBoundary =
			(typeof rawTimeMin === 'string' && DATE_TIME_REGEX.test(rawTimeMin)) ||
			(typeof rawTimeMax === 'string' && DATE_TIME_REGEX.test(rawTimeMax));
		if (timeZone && hasTimeBoundary) {
			details.push(`tz: ${timeZone}`);
		}

		if (details.length > 0) {
			return `${rangeLabel} · ${details.join(' · ')}`;
		}
		return rangeLabel;
	}

	// -------------------------------------------------------------------------
	// TOOL_DISPLAY_FORMATTERS — closure over resolveEntityName / buildEntityTarget
	// -------------------------------------------------------------------------

	const TOOL_DISPLAY_FORMATTERS: Record<
		string,
		(args: any) => { action: string; target?: string }
	> = {
		search_ontology: (args) => ({
			action: 'Searching workspace',
			target: args?.query || args?.search
		}),
		search_all_projects: (args) => ({
			action: 'Searching all projects',
			target: args?.query || args?.search
		}),
		search_buildos: (args) => ({
			action: 'Searching all projects',
			target: args?.query || args?.search
		}),
		search_project: (args) => ({
			action: 'Searching project',
			target: args?.query || args?.search
		}),
		list_onto_projects: (args) => ({
			action: 'Listing projects',
			target: args?.search
		}),
		search_onto_projects: (args) => ({
			action: 'Searching projects',
			target: args?.search || args?.query
		}),
		get_onto_project_details: (args) => ({
			action: 'Loading project',
			target: resolveEntityName('project', args?.project_id)
		}),
		create_onto_project: (args) => ({
			action: 'Creating project',
			target: args?.project?.name
		}),
		update_onto_project: (args) => ({
			action: 'Updating project',
			target: buildEntityTarget(args?.project_name ?? args?.name, args?.project_id, 'project')
		}),
		list_onto_tasks: (args) => ({
			action: 'Listing tasks',
			target: resolveEntityName('project', args?.project_id)
		}),
		search_onto_tasks: (args) => ({
			action: 'Searching tasks',
			target: args?.query || args?.search
		}),
		get_onto_task_details: (args) => ({
			action: 'Loading task',
			target: resolveEntityName('task', args?.task_id)
		}),
		create_onto_task: (args) => ({
			action: 'Creating task',
			target: args?.title || args?.task_name || args?.name
		}),
		update_onto_task: (args) => ({
			action: 'Updating task',
			target: buildEntityTarget(args?.task_title ?? args?.title, args?.task_id, 'task')
		}),
		delete_onto_task: (args) => ({
			action: 'Deleting task',
			target: resolveEntityName('task', args?.task_id)
		}),
		list_onto_goals: (args) => ({
			action: 'Listing goals',
			target: resolveEntityName('project', args?.project_id)
		}),
		get_onto_goal_details: (args) => ({
			action: 'Loading goal',
			target: resolveEntityName('goal', args?.goal_id)
		}),
		create_onto_goal: (args) => ({
			action: 'Creating goal',
			target: args?.name
		}),
		update_onto_goal: (args) => ({
			action: 'Updating goal',
			target: buildEntityTarget(args?.goal_name ?? args?.name, args?.goal_id, 'goal')
		}),
		delete_onto_goal: (args) => ({
			action: 'Deleting goal',
			target: resolveEntityName('goal', args?.goal_id)
		}),
		list_onto_plans: (args) => ({
			action: 'Listing plans',
			target: resolveEntityName('project', args?.project_id)
		}),
		get_onto_plan_details: (args) => ({
			action: 'Loading plan',
			target: resolveEntityName('plan', args?.plan_id)
		}),
		create_onto_plan: (args) => ({
			action: 'Creating plan',
			target: args?.name
		}),
		update_onto_plan: (args) => ({
			action: 'Updating plan',
			target: buildEntityTarget(args?.plan_name ?? args?.name, args?.plan_id, 'plan')
		}),
		delete_onto_plan: (args) => ({
			action: 'Deleting plan',
			target: resolveEntityName('plan', args?.plan_id)
		}),
		list_onto_documents: (args) => ({
			action: 'Listing documents',
			target: resolveEntityName('project', args?.project_id)
		}),
		list_onto_milestones: (args) => ({
			action: 'Listing milestones',
			target: resolveEntityName('project', args?.project_id)
		}),
		list_onto_risks: (args) => ({
			action: 'Listing risks',
			target: resolveEntityName('project', args?.project_id)
		}),
		search_onto_documents: (args) => ({
			action: 'Searching documents',
			target: args?.search || args?.query
		}),
		get_onto_document_details: (args) => ({
			action: 'Loading document',
			target: resolveEntityName('document', args?.document_id)
		}),
		get_onto_milestone_details: (args) => ({
			action: 'Loading milestone',
			target: resolveEntityName('milestone', args?.milestone_id)
		}),
		get_onto_risk_details: (args) => ({
			action: 'Loading risk',
			target: resolveEntityName('risk', args?.risk_id)
		}),
		create_onto_document: (args) => ({
			action: 'Creating document',
			target: args?.title || args?.name
		}),
		update_onto_document: (args) => ({
			action: 'Updating document',
			target: buildEntityTarget(
				args?.document_title ?? args?.title,
				args?.document_id,
				'document'
			)
		}),
		update_onto_milestone: (args) => ({
			action: 'Updating milestone',
			target: buildEntityTarget(
				args?.milestone_title ?? args?.title,
				args?.milestone_id,
				'milestone'
			)
		}),
		update_onto_risk: (args) => ({
			action: 'Updating risk',
			target: buildEntityTarget(args?.risk_title ?? args?.title, args?.risk_id, 'risk')
		}),
		delete_onto_document: (args) => ({
			action: 'Deleting document',
			target: resolveEntityName('document', args?.document_id)
		}),
		list_task_documents: (args) => ({
			action: 'Listing task documents',
			target: resolveEntityName('task', args?.task_id)
		}),
		create_task_document: (args) => ({
			action: 'Attaching document to task',
			target: resolveEntityName('task', args?.task_id)
		}),
		get_document_tree: (args) => ({
			action: 'Loading document tree',
			target: resolveEntityName('project', args?.project_id)
		}),
		move_document_in_tree: (args) => ({
			action: 'Reorganizing document tree',
			target: resolveEntityName('document', args?.document_id)
		}),
		get_document_path: (args) => ({
			action: 'Loading document path',
			target: resolveEntityName('document', args?.document_id)
		}),
		get_onto_project_graph: (args) => ({
			action: 'Loading project graph',
			target: resolveEntityName('project', args?.project_id)
		}),
		reorganize_onto_project_graph: (args) => ({
			action: 'Reorganizing project graph',
			target: resolveEntityName('project', args?.project_id)
		}),
		link_onto_entities: (args) => ({
			action: 'Linking entities',
			target: resolveEntityName(args?.src_kind as OntologyEntityKind, args?.src_id)
		}),
		unlink_onto_edge: (args) => ({
			action: 'Unlinking entities',
			target: resolveEntityName(args?.src_kind as OntologyEntityKind, args?.src_id)
		}),
		get_entity_relationships: (args) => ({
			action: 'Loading relationships',
			target: resolveEntityName(args?.entity_kind as OntologyEntityKind, args?.entity_id)
		}),
		get_linked_entities: (args) => ({
			action: 'Loading linked entities',
			target: resolveEntityName(args?.entity_kind as OntologyEntityKind, args?.entity_id)
		}),
		get_field_info: () => ({
			action: 'Loading field guidance'
		}),
		web_search: (args) => ({
			action: 'Running web search',
			target: args?.query
		}),
		get_buildos_overview: () => ({
			action: 'Loading BuildOS overview'
		}),
		get_buildos_usage_guide: () => ({
			action: 'Loading BuildOS usage guide'
		}),
		fetch_project_data: (args) => ({
			action: 'Fetching project',
			target: buildEntityTarget(args.project_name, args.project_id, 'project')
		}),
		search_tasks: (args) => ({
			action: 'Searching tasks',
			target: args.query
		}),
		get_calendar_events: (args) => ({
			action: 'Loading calendar',
			target: args.date
		}),
		list_calendar_events: (args) => ({
			action: 'Listing calendar events',
			target:
				formatCalendarRangeTarget(args) ||
				resolveEntityName('project', args?.project_id) ||
				args?.calendar_scope
		}),
		get_calendar_event_details: (args) => ({
			action: 'Loading calendar event',
			target: resolveEntityName('event', args?.onto_event_id || args?.event_id)
		}),
		create_calendar_event: (args) => ({
			action: 'Creating calendar event',
			target: args?.title
		}),
		update_calendar_event: (args) => ({
			action: 'Updating calendar event',
			target: resolveEntityName('event', args?.onto_event_id || args?.event_id)
		}),
		delete_calendar_event: (args) => ({
			action: 'Deleting calendar event',
			target: resolveEntityName('event', args?.onto_event_id || args?.event_id)
		}),
		get_project_calendar: (args) => ({
			action: 'Loading project calendar',
			target: resolveEntityName('project', args?.project_id)
		}),
		set_project_calendar: (args) => ({
			action: 'Updating project calendar',
			target: resolveEntityName('project', args?.project_id)
		})
	};

	// -------------------------------------------------------------------------
	// Formatters
	// -------------------------------------------------------------------------

	function normalizeToolDisplayPayload(
		toolName: string,
		argsJson: string | Record<string, any>
	): NormalizedToolDisplay {
		return {
			hidden: false,
			toolName,
			args: argsJson,
			originalToolName: toolName
		};
	}

	function formatToolMessage(
		toolName: string,
		argsJson: string | Record<string, any>,
		status: 'pending' | 'completed' | 'failed',
		errorMessage?: string
	): string {
		const errorSuffix = status === 'failed' ? formatErrorSuffix(errorMessage) : '';
		if (toolName === 'skill_load') {
			const skillPath = extractSkillPathFromSkillLoadArgs(argsJson);
			if (status === 'pending') {
				return skillPath
					? formatSkillActivityContent({
							type: 'skill_activity',
							action: 'requested',
							path: skillPath,
							via: 'skill_load'
						})
					: 'Loading skill';
			}
			if (status === 'completed') {
				return skillPath
					? formatSkillActivityContent({
							type: 'skill_activity',
							action: 'loaded',
							path: skillPath,
							via: 'skill_load'
						})
					: 'Skill loaded';
			}
			return skillPath
				? `Failed to load skill ${skillPath}${errorSuffix}`
				: `Failed to load skill${errorSuffix}`;
		}
		const formatter = TOOL_DISPLAY_FORMATTERS[toolName];

		if (!formatter) {
			if (status === 'pending') return `Using tool: ${toolName}`;
			if (status === 'completed') return `Tool ${toolName} completed`;
			return `Tool ${toolName} failed${errorSuffix}`;
		}

		try {
			const args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
			const { action, target } = formatter(args);

			if (!target) {
				if (status === 'pending') {
					return `${action}...`;
				} else if (status === 'completed') {
					return toPastTenseAction(action);
				} else {
					return `Failed to ${toFailureAction(action)}${errorSuffix}`;
				}
			}

			if (status === 'pending') {
				return `${action}: "${target}"`;
			} else if (status === 'completed') {
				const pastTense = toPastTenseAction(action);
				return `${pastTense}: "${target}"`;
			} else {
				return `Failed to ${toFailureAction(action)}: "${target}"${errorSuffix}`;
			}
		} catch (e) {
			if (ctx.isDev) {
				// eslint-disable-next-line no-console
				console.error('[AgentChat] Error parsing tool arguments:', e);
			}
			return `Using tool: ${toolName}`;
		}
	}

	function formatOperationEvent(operation: Record<string, any>): {
		message: string;
		activityStatus: ActivityEntry['status'];
	} {
		const action = typeof operation?.action === 'string' ? operation.action : 'work';
		const status = typeof operation?.status === 'string' ? operation.status : 'start';
		const entityType =
			typeof operation?.entity_type === 'string'
				? operation.entity_type.replace(/_/g, ' ')
				: 'item';
		const entityName =
			typeof operation?.entity_name === 'string' ? operation.entity_name.trim() : '';
		const verbPair = OPERATION_VERBS[action] ?? {
			present: capitalizeWord(action),
			past: capitalizeWord(action)
		};
		const verb = status === 'success' ? verbPair.past : verbPair.present;
		const message = entityName
			? `${verb} ${entityType}: "${entityName}"`
			: `${verb} ${entityType}`;
		const activityStatus =
			status === 'success' ? 'completed' : status === 'error' ? 'failed' : 'pending';
		return { message, activityStatus };
	}

	// -------------------------------------------------------------------------
	// Mutation tracking
	// -------------------------------------------------------------------------

	function safeParseArgs(argsJson: string | Record<string, unknown> | undefined) {
		if (!argsJson) return {};
		if (typeof argsJson === 'string') {
			try {
				return JSON.parse(argsJson) as Record<string, unknown>;
			} catch (e) {
				if (ctx.isDev) {
					// eslint-disable-next-line no-console
					console.warn('[AgentChat] Failed to parse tool args for mutation tracking', e);
				}
				return {};
			}
		}
		return argsJson;
	}

	function resolveProjectId(
		args: Record<string, unknown>,
		toolResult?: { data?: any }
	): string | undefined {
		const argsProjectId = args?.project_id;
		if (typeof argsProjectId === 'string' && argsProjectId.length > 0) {
			return argsProjectId;
		}

		const data = toolResult?.data;
		const dataProjectId =
			data?.project_id ??
			data?.project?.id ??
			data?.task?.project_id ??
			data?.goal?.project_id ??
			data?.plan?.project_id ??
			data?.document?.project_id ??
			data?.milestone?.project_id ??
			data?.risk?.project_id ??
			data?.event?.project_id;
		if (typeof dataProjectId === 'string' && dataProjectId.length > 0) {
			return dataProjectId;
		}

		if (isProjectContext(ctx.getContextType()) && ctx.getEntityId()) {
			return ctx.getEntityId();
		}

		return undefined;
	}

	function recordDataMutation(
		toolName: string | undefined,
		argsJson: string | Record<string, unknown> | undefined,
		success: boolean,
		toolResult?: { data?: any }
	): void {
		if (!toolName || !success || !MUTATION_TRACKED_TOOLS_SET.has(toolName)) return;

		if (toolName === 'create_onto_project' && toolResult?.data?.clarifications?.length) {
			return;
		}

		const args = safeParseArgs(argsJson);
		const projectId = resolveProjectId(args, toolResult);

		mutationCount += 1;
		if (projectId) {
			mutatedProjectIds.add(projectId);
		}
	}

	function resetMutationTracking(): void {
		mutationCount = 0;
		mutatedProjectIds.clear();
	}

	function buildMutationSummary(
		extra: Pick<DataMutationSummary, 'hasMessagesSent' | 'sessionId'>
	): DataMutationSummary {
		return {
			hasChanges: mutationCount > 0,
			totalMutations: mutationCount,
			affectedProjectIds: Array.from(mutatedProjectIds),
			hasMessagesSent: extra.hasMessagesSent,
			sessionId: extra.sessionId ?? null,
			contextType: ctx.getContextType() ?? null,
			entityId: ctx.getEntityId() ?? null
		};
	}

	// -------------------------------------------------------------------------
	// Side-effect: toast
	// -------------------------------------------------------------------------

	function showToolResultToast(
		toolName: string,
		argsJson: string | Record<string, unknown>,
		success: boolean
	): void {
		if (!DATA_MUTATION_TOOLS_SET.has(toolName)) return;
		const toast = ctx.toast;
		if (!toast) return;

		const formatter = TOOL_DISPLAY_FORMATTERS[toolName];
		if (!formatter) return;

		try {
			const args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
			const { action, target } = formatter(args);
			const pastTense = toPastTenseAction(action);

			if (success) {
				const message = target ? `${pastTense}: "${target}"` : pastTense;
				toast.success(message);
			} else {
				const failureAction = toFailureAction(action);
				const message = target
					? `Failed to ${failureAction}: "${target}"`
					: `Failed to ${failureAction}`;
				toast.error(message);
			}
		} catch (e) {
			if (ctx.isDev) {
				// eslint-disable-next-line no-console
				console.error('[AgentChat] Error showing tool result toast:', e);
			}
		}
	}

	return {
		formatToolMessage,
		formatOperationEvent,
		formatErrorMessage,
		normalizeToolDisplayPayload,
		cacheEntityName,
		resolveEntityName,
		indexEntitiesFromPayload,
		indexEntitiesFromToolResult,
		recordDataMutation,
		resetMutationTracking,
		buildMutationSummary,
		showToolResultToast,
		MUTATION_TRACKED_TOOLS: MUTATION_TRACKED_TOOLS_SET,
		DATA_MUTATION_TOOLS: DATA_MUTATION_TOOLS_SET
	};
}

// Re-export helpers that some tests may want without a factory
export {
	formatErrorMessage,
	formatListPreview,
	formatCalendarDateLabel,
	formatDateOnlyLabel,
	formatExplicitTimezoneDateLabel,
	normalizeCalendarTimeZone
};
