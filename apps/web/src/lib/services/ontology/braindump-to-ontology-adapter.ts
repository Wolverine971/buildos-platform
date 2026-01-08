// apps/web/src/lib/services/ontology/braindump-to-ontology-adapter.ts

import type { ProjectSpec, TaskState } from '$lib/types/onto';
import type { ParsedOperation } from '$lib/types/brain-dump';
import type { Database } from '@buildos/shared-types';

/**
 * Type key taxonomy source-of-truth:
 * $lib/services/prompts/core/prompt-components.ts
 */
const PROJECT_TYPE_INFERENCE: Array<{ pattern: RegExp; typeKey: string }> = [
	// Technical (specific -> general)
	{ pattern: /\bmobile\b|\bios\b|\bandroid\b/, typeKey: 'project.technical.app.mobile' },
	{ pattern: /\bweb app\b|\bwebsite\b|\bweb\b/, typeKey: 'project.technical.app.web' },
	{ pattern: /\bapi\b/, typeKey: 'project.technical.api' },
	{ pattern: /\bfeature\b/, typeKey: 'project.technical.feature' },
	{
		pattern: /\binfrastructure\b|\bdevops\b|\bdeployment\b/,
		typeKey: 'project.technical.infrastructure'
	},
	{ pattern: /\bapp\b/, typeKey: 'project.technical.app' },

	// Creative
	{ pattern: /\bbook\b|\bmanuscript\b/, typeKey: 'project.creative.book' },
	{ pattern: /\barticle\b|\bblog\b|\bessay\b/, typeKey: 'project.creative.article' },
	{ pattern: /\bvideo\b|\bfilm\b|\byoutube\b/, typeKey: 'project.creative.video' },
	{ pattern: /\bbrand\b|\bidentity\b/, typeKey: 'project.creative.brand' },
	{ pattern: /\bdesign\b/, typeKey: 'project.creative.design' },
	{ pattern: /\balbum\b/, typeKey: 'project.creative.album' },

	// Business
	{
		pattern: /\bproduct launch\b|\blaunch\b|\bgtm\b/,
		typeKey: 'project.business.product_launch'
	},
	{ pattern: /\bstartup\b|\bcompany\b/, typeKey: 'project.business.startup' },
	{ pattern: /\bcampaign\b|\bmarketing\b/, typeKey: 'project.business.campaign' },
	{ pattern: /\bfundraise\b|\binvestor\b|\bpitch\b/, typeKey: 'project.business.fundraise' },
	{
		pattern: /\bmarket research\b|\bcompetitive analysis\b/,
		typeKey: 'project.business.market_research'
	},
	{ pattern: /\bhiring\b|\brecruiting\b/, typeKey: 'project.business.hiring' },
	{ pattern: /\bevent\b|\bconference\b|\bsummit\b/, typeKey: 'project.business.event' },

	// Service
	{
		pattern: /\bconsult(ing)?\b|\bclient\b/,
		typeKey: 'project.service.consulting_engagement'
	},
	{ pattern: /\bworkshop\b/, typeKey: 'project.service.workshop' },
	{ pattern: /\bretainer\b/, typeKey: 'project.service.retainer' },
	{ pattern: /\bcoaching\b/, typeKey: 'project.service.coaching_program' },

	// Education
	{ pattern: /\bcourse\b|\bclass\b/, typeKey: 'project.education.course' },
	{ pattern: /\bthesis\b|\bdissertation\b/, typeKey: 'project.education.thesis' },
	{ pattern: /\bcert(ification)?\b/, typeKey: 'project.education.certification' },
	{ pattern: /\bdegree\b/, typeKey: 'project.education.degree' },
	{ pattern: /\bacademic research\b|\bstudy\b/, typeKey: 'project.education.research' },

	// Personal
	{ pattern: /\bhabit\b|\broutine\b/, typeKey: 'project.personal.habit' },
	{ pattern: /\bhealth\b|\bwellness\b|\bfitness\b/, typeKey: 'project.personal.wellness' },
	{ pattern: /\bfinance\b|\bbudget\b/, typeKey: 'project.personal.finance' },
	{ pattern: /\bpersonal goal\b|\bmy goal\b/, typeKey: 'project.personal.goal' }
];

const REALM_KEYWORDS = {
	technical: ['build', 'code', 'app', 'api', 'feature', 'deploy', 'bug', 'database', 'ship'],
	creative: ['write', 'book', 'article', 'publish', 'story', 'content', 'design', 'brand'],
	business: [
		'launch',
		'startup',
		'revenue',
		'customers',
		'market',
		'pitch',
		'fundraise',
		'sales',
		'campaign',
		'hire'
	],
	service: ['client', 'consulting', 'engagement', 'deliverable', 'sow', 'workshop'],
	education: ['class', 'assignment', 'thesis', 'degree', 'learn', 'exam', 'course', 'study'],
	personal: ['habit', 'routine', 'goal', 'health', 'wellness', 'self', 'productivity']
} as const;

const DEFAULT_TYPE_BY_REALM = {
	creative: 'project.creative.article',
	technical: 'project.technical.app',
	business: 'project.business.campaign',
	service: 'project.service.consulting_engagement',
	education: 'project.education.course',
	personal: 'project.personal.goal'
} as const;

type Realm = keyof typeof DEFAULT_TYPE_BY_REALM;

const TASK_TYPE_INFERENCE: Array<{ pattern: RegExp; typeKey: string }> = [
	{
		pattern: /\bmeeting\b|\bcall\b|\bsync\b|\bstandup\b|\b1:1\b/,
		typeKey: 'task.coordinate.meeting'
	},
	{ pattern: /\breview\b|\bapprove\b|\baudit\b|\bqa\b/, typeKey: 'task.review' },
	{ pattern: /\bresearch\b|\binvestigate\b|\bexplore\b/, typeKey: 'task.research' },
	{ pattern: /\bwrite\b|\bdraft\b|\bcreate\b|\bdesign\b|\bbuild\b/, typeKey: 'task.create' },
	{ pattern: /\bplan\b|\bstrategy\b|\boutline\b|\broadmap\b/, typeKey: 'task.plan' },
	{ pattern: /\brefine\b|\bpolish\b|\bedit\b|\biterate\b/, typeKey: 'task.refine' },
	{ pattern: /\bemail\b|\binvoice\b|\bpaperwork\b|\badmin\b/, typeKey: 'task.admin' }
];

const LEGACY_TASK_STATE_MAP: Record<string, TaskState> = {
	backlog: 'todo',
	todo: 'todo',
	in_progress: 'in_progress',
	blocked: 'blocked',
	done: 'done',
	completed: 'done'
};

const LEGACY_PRIORITY_MAP: Record<string, number> = {
	low: 2,
	medium: 3,
	high: 4,
	urgent: 5
};

// ==========================================
// EXPORTED HELPERS (for use in calendar-analysis.service.ts)
// ==========================================

/**
 * Infer project type_key from name and context
 */
export function inferProjectTypeKey(name: string, context?: string): string {
	const searchText = `${name} ${context || ''}`.toLowerCase();

	for (const { pattern, typeKey } of PROJECT_TYPE_INFERENCE) {
		if (pattern.test(searchText)) return typeKey;
	}

	const realm = inferRealm(searchText);
	return DEFAULT_TYPE_BY_REALM[realm];
}

function inferRealm(text: string): Realm {
	const scores: Record<Realm, number> = {
		creative: 0,
		technical: 0,
		business: 0,
		service: 0,
		education: 0,
		personal: 0
	};

	(Object.keys(scores) as Realm[]).forEach((realm) => {
		for (const keyword of REALM_KEYWORDS[realm]) {
			if (text.includes(keyword)) scores[realm] += 1;
		}
	});

	const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
	return (sorted[0]?.[0] as Realm) || 'business';
}

/**
 * Infer task type_key from title
 */
export function inferTaskTypeKey(title: string): string {
	const lowerTitle = title.toLowerCase();

	for (const { pattern, typeKey } of TASK_TYPE_INFERENCE) {
		if (pattern.test(lowerTitle)) return typeKey;
	}

	return 'task.execute';
}

export function normalizeTaskState(data: Record<string, unknown>): TaskState | undefined {
	const raw = `${data.state_key ?? data.status ?? ''}`.trim().toLowerCase();
	return raw ? LEGACY_TASK_STATE_MAP[raw] : undefined;
}

export function normalizePriority(value: unknown): number | undefined {
	if (typeof value === 'number' && value >= 1 && value <= 5) return value;
	if (typeof value === 'string') {
		const mapped = LEGACY_PRIORITY_MAP[value.toLowerCase()];
		return mapped ?? undefined;
	}
	return undefined;
}

export function normalizeDueAt(value?: string): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;

	// Date-only -> add time so it validates as ISO datetime
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		const withTime = `${trimmed}T09:00:00`;
		const date = new Date(withTime);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	const parsed = new Date(trimmed);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function normalizeProjectState(
	value?: string
): 'planning' | 'active' | 'completed' | 'cancelled' | undefined {
	const raw = value?.trim().toLowerCase();
	if (!raw) return undefined;
	if (raw === 'planning') return 'planning';
	if (raw === 'active' || raw === 'paused') return 'active';
	if (raw === 'completed' || raw === 'complete') return 'completed';
	if (raw === 'cancelled' || raw === 'archived') return 'cancelled';
	return undefined;
}

export function inferContextFacet(
	text: string
):
	| 'personal'
	| 'client'
	| 'commercial'
	| 'internal'
	| 'startup'
	| 'open_source'
	| 'community'
	| 'academic'
	| 'nonprofit' {
	const lower = text.toLowerCase();

	if (
		lower.includes('open source') ||
		lower.includes('open-source') ||
		lower.includes('oss') ||
		lower.includes('github')
	) {
		return 'open_source';
	}
	if (lower.includes('community') || lower.includes('meetup') || lower.includes('volunteer')) {
		return 'community';
	}
	if (
		lower.includes('nonprofit') ||
		lower.includes('non-profit') ||
		lower.includes('charity') ||
		lower.includes('foundation')
	) {
		return 'nonprofit';
	}
	if (
		lower.includes('university') ||
		lower.includes('academic') ||
		lower.includes('thesis') ||
		lower.includes('dissertation') ||
		lower.includes('research')
	) {
		return 'academic';
	}
	if (lower.includes('client') || lower.includes('consult')) return 'client';
	if (lower.includes('startup') || lower.includes('founder')) return 'startup';
	if (lower.includes('team') || lower.includes('internal')) return 'internal';
	if (lower.includes('revenue') || lower.includes('market')) return 'commercial';
	return 'personal';
}

/**
 * Infer project scale from task count
 */
export function inferScale(taskCount: number): 'micro' | 'small' | 'medium' | 'large' | 'epic' {
	if (taskCount <= 3) return 'micro';
	if (taskCount <= 8) return 'small';
	if (taskCount <= 20) return 'medium';
	if (taskCount <= 50) return 'large';
	return 'epic';
}

/**
 * Convert legacy ParsedOperation[] to ProjectSpec
 */
export function convertBrainDumpToProjectSpec(
	operations: ParsedOperation[],
	originalText: string,
	options?: {
		projectSummary?: string;
		projectContext?: string;
	}
): ProjectSpec {
	// Find project operation
	const projectOp = operations.find(
		(op) => op.operation === 'create' && op.table === 'projects' && op.enabled
	);

	if (!projectOp) {
		throw new Error('No project creation operation found');
	}

	// Find task operations
	const taskOps = operations.filter(
		(op) => op.operation === 'create' && op.table === 'tasks' && op.enabled
	);

	const projectName = projectOp.data?.name?.trim();
	if (!projectName) {
		throw new Error('Project name is required but was empty');
	}
	const projectDescription = projectOp.data?.description || options?.projectSummary;
	const projectContext = projectOp.data?.context || options?.projectContext || originalText;
	const trimmedContext = `${projectContext ?? ''}`.trim();
	const planName = taskOps.length > 0 ? 'Initial Plan' : undefined;

	const entities: ProjectSpec['entities'] = [];
	const relationships: ProjectSpec['relationships'] = [];

	let planTempId: string | undefined;

	if (planName) {
		planTempId = 'plan-1';
		entities.push({
			temp_id: planTempId,
			kind: 'plan',
			name: planName,
			type_key: 'plan.phase',
			state_key: 'draft'
		});
	}

	const taskEntities = taskOps.map((taskOp, index) => {
		const tempId = `task-${index + 1}`;
		const title = taskOp.data?.title || taskOp.data?.name || 'Untitled Task';
		const entity = {
			temp_id: tempId,
			kind: 'task' as const,
			title,
			type_key: inferTaskTypeKey(title),
			state_key: normalizeTaskState(taskOp.data ?? {}) ?? 'todo',
			priority: normalizePriority(taskOp.data?.priority),
			due_at: normalizeDueAt(
				taskOp.data?.due_at || taskOp.data?.due_date || taskOp.data?.start_date
			),
			props: {
				...(taskOp.data?.props || {})
			}
		};
		return entity;
	});

	for (const taskEntity of taskEntities) {
		entities.push(taskEntity);
		if (planTempId) {
			relationships.push([
				{ temp_id: planTempId, kind: 'plan' },
				{ temp_id: taskEntity.temp_id, kind: 'task' }
			]);
		}
	}

	// Build ProjectSpec
	const spec: ProjectSpec = {
		project: {
			name: projectName,
			description: projectDescription,
			type_key: inferProjectTypeKey(projectName, projectContext),
			state_key:
				normalizeProjectState(projectOp.data?.state_key || projectOp.data?.status) ??
				'planning',
			props: {
				facets: {
					context: inferContextFacet(`${projectName} ${projectContext}`),
					scale: inferScale(taskOps.length),
					stage: 'planning'
				},
				// Preserve any additional props from brain dump
				...(projectOp.data?.props || {})
			}
		},

		// Store the brain dump as a context document (only if we have content)
		...(trimmedContext
			? {
					context_document: {
						title: 'Project Context',
						type_key: 'document.context.project',
						state_key: 'draft',
						body_markdown: trimmedContext
					}
				}
			: {}),
		entities,
		relationships
	};

	return spec;
}

/**
 * Calendar suggestions come from calendar_project_suggestions.
 * suggested_tasks and event_patterns are stored as JSON and must be parsed.
 */
type CalendarProjectSuggestionRow =
	Database['public']['Tables']['calendar_project_suggestions']['Row'];

export interface CalendarSuggestionTask {
	title: string;
	description?: string;
	details?: string;
	status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
	priority?: 'low' | 'medium' | 'high' | 'urgent' | number;
	task_type?: 'one_off' | 'recurring';
	duration_minutes?: number;
	start_date?: string;
	recurrence_pattern?:
		| 'daily'
		| 'weekdays'
		| 'weekly'
		| 'biweekly'
		| 'monthly'
		| 'quarterly'
		| 'yearly';
	recurrence_ends?: string;
	recurrence_rrule?: string;
	event_id?: string;
	tags?: string[];
}

export interface CalendarSuggestionEventPatterns {
	executive_summary?: string;
	start_date?: string;
	end_date?: string | null;
	tags?: string[];
	slug?: string;
	add_to_existing?: boolean;
	existing_project_id?: string | null;
	deduplication_reasoning?: string;
}

export type CalendarSuggestionInput = Omit<
	CalendarProjectSuggestionRow,
	'suggested_tasks' | 'event_patterns'
> & {
	suggested_tasks?: CalendarSuggestionTask[] | null;
	event_patterns?: CalendarSuggestionEventPatterns | null;
};

/**
 * Legacy task status -> ontology TaskState mapping
 */
const CALENDAR_TASK_STATE_MAP: Record<string, TaskState> = {
	backlog: 'todo',
	in_progress: 'in_progress',
	done: 'done',
	blocked: 'blocked'
};

/**
 * Convert calendar suggestion to ProjectSpec
 */
export function convertCalendarSuggestionToProjectSpec(
	suggestion: CalendarSuggestionInput,
	overrides?: {
		name?: string;
		description?: string;
		context?: string;
		includeTasks?: boolean;
		/** Key format: `${suggestion.id}-${taskIndex}` */
		taskSelections?: Record<string, boolean>;
		taskModifications?: Record<number, any>;
	}
): ProjectSpec {
	const eventPatterns = suggestion.event_patterns ?? {};
	const detectedKeywords = suggestion.detected_keywords ?? [];
	const keywordsText = detectedKeywords.join(' ');
	const name = (
		overrides?.name ||
		suggestion.user_modified_name ||
		suggestion.suggested_name ||
		''
	).trim();
	if (!name) {
		throw new Error('Project name is required for calendar suggestions');
	}
	const description =
		overrides?.description ||
		suggestion.user_modified_description ||
		suggestion.suggested_description ||
		undefined;
	const context =
		overrides?.context ||
		suggestion.user_modified_context ||
		suggestion.suggested_context ||
		undefined;
	const searchText = `${description ?? ''} ${context ?? ''} ${keywordsText}`.toLowerCase();
	const contextText = `${name} ${searchText}`.toLowerCase();
	const tags = Array.isArray(eventPatterns?.tags) ? eventPatterns.tags : [];
	const sourceMetadata = {
		analysis_id: suggestion.analysis_id,
		suggestion_id: suggestion.id,
		calendar_event_ids: suggestion.calendar_event_ids,
		calendar_ids: suggestion.calendar_ids ?? undefined,
		event_count: suggestion.event_count ?? undefined,
		confidence: suggestion.confidence_score,
		detected_keywords: detectedKeywords.length ? detectedKeywords : undefined,
		ai_reasoning: suggestion.ai_reasoning ?? undefined,
		suggested_priority: suggestion.suggested_priority ?? undefined,
		deduplication_reasoning: eventPatterns?.deduplication_reasoning
	};

	const rawTasks = Array.isArray(suggestion.suggested_tasks) ? suggestion.suggested_tasks : [];

	const tasks = rawTasks
		.map((task, index) => {
			const taskKey = `${suggestion.id}-${index}`;
			if (overrides?.taskSelections && overrides.taskSelections[taskKey] === false) {
				return null;
			}
			const modifiedTask = overrides?.taskModifications?.[index]
				? { ...task, ...overrides.taskModifications[index] }
				: task;
			return modifiedTask;
		})
		.filter(Boolean) as CalendarSuggestionTask[];

	const includeTasks = overrides?.includeTasks !== false && tasks.length > 0;
	const taskCount = includeTasks ? tasks.length : 0;
	const planName = includeTasks ? 'Calendar-Based Plan' : undefined;

	const entities: ProjectSpec['entities'] = [];
	const relationships: ProjectSpec['relationships'] = [];
	let planTempId: string | undefined;

	if (planName) {
		planTempId = 'plan-1';
		entities.push({
			temp_id: planTempId,
			kind: 'plan',
			name: planName,
			type_key: 'plan.phase',
			state_key: 'active'
		});
	}

	if (includeTasks) {
		tasks.forEach((task, index) => {
			const title = task.title?.trim() || 'Untitled Task';
			const tempId = `task-${index + 1}`;
			entities.push({
				temp_id: tempId,
				kind: 'task',
				title,
				type_key: inferTaskTypeKey(title),
				state_key: CALENDAR_TASK_STATE_MAP[task.status ?? 'backlog'] ?? 'todo',
				priority: normalizePriority(task.priority) ?? 3,
				due_at: normalizeDueAt(task.start_date),
				props: {
					description: task.description,
					details: task.details,
					calendar_event_id: task.event_id,
					task_type: task.task_type,
					start_date: task.start_date,
					duration_minutes: task.duration_minutes,
					recurrence_pattern: task.recurrence_pattern,
					recurrence_ends: task.recurrence_ends,
					recurrence_rrule: task.recurrence_rrule,
					tags: task.tags
				}
			});

			if (planTempId) {
				relationships.push([
					{ temp_id: planTempId, kind: 'plan' },
					{ temp_id: tempId, kind: 'task' }
				]);
			}
		});
	}

	const spec: ProjectSpec = {
		project: {
			name,
			description,
			type_key: inferProjectTypeKey(name, searchText),
			state_key: 'active',
			props: {
				facets: {
					context: inferContextFacet(contextText),
					scale: inferScale(taskCount),
					stage: 'planning'
				},
				source: 'calendar_analysis',
				source_metadata: sourceMetadata,
				tags,
				executive_summary: eventPatterns?.executive_summary,
				slug: eventPatterns?.slug,
				start_date: eventPatterns?.start_date,
				end_date: eventPatterns?.end_date
			}
		},

		...(context
			? {
					context_document: {
						title: 'Project Context',
						type_key: 'document.context.project',
						state_key: 'draft',
						body_markdown: context
					}
				}
			: {}),
		entities,
		relationships
	};

	return spec;
}
