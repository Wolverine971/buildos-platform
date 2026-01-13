// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts
/**
 * Ontology Write Executor
 *
 * Handles all write operations for ontology entities:
 * - create_onto_* (project, task, goal, plan, document)
 * - update_onto_* (project, task, goal, plan, document)
 * - delete_onto_* (task, goal, plan, document)
 * - create_task_document
 *
 * Includes support for update strategies (replace, append, merge_llm).
 */

import { BaseExecutor } from './base-executor';
import type {
	ExecutorContext,
	CreateOntoProjectArgs,
	CreateOntoTaskArgs,
	CreateOntoGoalArgs,
	CreateOntoPlanArgs,
	CreateOntoDocumentArgs,
	CreateTaskDocumentArgs,
	UpdateOntoProjectArgs,
	UpdateOntoTaskArgs,
	UpdateOntoGoalArgs,
	UpdateOntoPlanArgs,
	UpdateOntoDocumentArgs,
	UpdateOntoMilestoneArgs,
	UpdateOntoRiskArgs,
	UpdateOntoRequirementArgs,
	LinkOntoEntitiesArgs,
	UnlinkOntoEdgeArgs,
	ReorganizeOntoProjectGraphArgs,
	DeleteOntoTaskArgs,
	DeleteOntoGoalArgs,
	DeleteOntoPlanArgs,
	DeleteOntoDocumentArgs
} from './types';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('OntologyWriteExecutor');

/**
 * Helper to extract a string from meta object
 */
function extractMetaString(
	meta: Record<string, unknown> | undefined,
	key: string
): string | undefined {
	if (!meta) return undefined;
	const value = meta[key];
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

type DateBoundary = 'start' | 'end';

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
	jan: 1,
	january: 1,
	feb: 2,
	february: 2,
	mar: 3,
	march: 3,
	apr: 4,
	april: 4,
	may: 5,
	jun: 6,
	june: 6,
	jul: 7,
	july: 7,
	aug: 8,
	august: 8,
	sep: 9,
	sept: 9,
	september: 9,
	oct: 10,
	october: 10,
	nov: 11,
	november: 11,
	dec: 12,
	december: 12
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

function buildIsoDateTime(
	year: number,
	month: number,
	day: number,
	boundary: DateBoundary
): string {
	const date = `${year}-${pad2(month)}-${pad2(day)}`;
	return boundary === 'end' ? `${date}T23:59:59Z` : `${date}T00:00:00Z`;
}

function normalizeIsoDateTime(value: unknown, boundary: DateBoundary): string | undefined {
	if (value instanceof Date) {
		return isNaN(value.getTime()) ? undefined : value.toISOString();
	}
	if (typeof value !== 'string') return undefined;

	const raw = value.trim();
	if (!raw) return undefined;

	if (raw.includes('T')) {
		const parsed = new Date(raw);
		return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
	}

	const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (dateOnlyMatch) {
		const year = Number(dateOnlyMatch[1]);
		const month = Number(dateOnlyMatch[2]);
		const day = Number(dateOnlyMatch[3]);
		if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
			return buildIsoDateTime(year, month, day, boundary);
		}
	}

	const yearMonthMatch = raw.match(/^(\d{4})-(\d{2})$/);
	if (yearMonthMatch) {
		const year = Number(yearMonthMatch[1]);
		const month = Number(yearMonthMatch[2]);
		if (month >= 1 && month <= 12) {
			const day = boundary === 'end' ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
			return buildIsoDateTime(year, month, day, boundary);
		}
	}

	const yearMatch = raw.match(/^(\d{4})$/);
	if (yearMatch) {
		const year = Number(yearMatch[1]);
		return boundary === 'end'
			? buildIsoDateTime(year, 12, 31, boundary)
			: buildIsoDateTime(year, 1, 1, boundary);
	}

	const monthYearMatch = raw.match(
		/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})$/i
	);
	if (monthYearMatch) {
		const monthName = monthYearMatch[1]?.toLowerCase() ?? '';
		const year = Number(monthYearMatch[2]);
		const month = MONTH_NAME_TO_NUMBER[monthName];
		if (month) {
			const day = boundary === 'end' ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
			return buildIsoDateTime(year, month, day, boundary);
		}
	}

	const parsed = new Date(raw);
	return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Build context document specification for project creation
 */
function buildContextDocumentSpec(
	args: CreateOntoProjectArgs
): CreateOntoProjectArgs['context_document'] {
	const provided = args.context_document;
	// Support both content (new) and body_markdown (legacy) parameters
	const providedContent = provided?.content ?? provided?.body_markdown;
	if (provided?.title?.trim() && providedContent?.trim()) {
		return {
			...provided,
			content: providedContent,
			body_markdown: providedContent, // Keep for backwards compat
			type_key: provided.type_key ?? 'document.context.project',
			state_key: provided.state_key ?? 'draft'
		};
	}

	const meta = (args.meta ?? {}) as Record<string, unknown>;
	const braindump = extractMetaString(meta, 'braindump');
	const summary =
		extractMetaString(meta, 'summary') ??
		(args.project.description ? args.project.description.trim() : '');

	const entityGoals = (args.entities ?? []).filter(
		(entity) => entity && entity.kind === 'goal'
	) as Array<{ name: string; description?: string }>;
	const entityTasks = (args.entities ?? []).filter(
		(entity) => entity && entity.kind === 'task'
	) as Array<{ title: string; state_key?: string }>;

	const goalsSection = (entityGoals ?? [])
		.map((goal) => `- ${goal.name}${goal.description ? ` — ${goal.description}` : ''}`)
		.join('\n');

	const tasksSection = (entityTasks ?? [])
		.map((task) => `- ${task.title}${task.state_key ? ` · ${task.state_key}` : ''}`)
		.join('\n');

	const body = [
		`# ${args.project.name} Context Document`,
		'## Vision & Summary',
		summary || 'Not provided yet.',
		'## Braindump / Spark',
		braindump || 'Not provided yet.',
		'## Initial Goals',
		goalsSection || 'No goals captured yet.',
		'## Initial Tasks / Threads',
		tasksSection || 'No starter tasks captured yet.'
	].join('\n\n');

	return {
		title: `${args.project.name} Context Document`,
		content: body,
		body_markdown: body, // Keep for backwards compat
		type_key: 'document.context.project',
		state_key: 'active',
		props: {
			source: 'agent_project_creation',
			generated_at: new Date().toISOString(),
			braindump: braindump || undefined
		}
	};
}

function normalizeEntityDates(
	entity: CreateOntoProjectArgs['entities'][number]
): CreateOntoProjectArgs['entities'][number] {
	const normalized = { ...entity } as Record<string, unknown>;
	const normalizeField = (field: string, boundary: 'start' | 'end') => {
		if (normalized[field] === undefined) return;
		const next = normalizeIsoDateTime(String(normalized[field]), boundary);
		if (next !== undefined) {
			normalized[field] = next;
		} else {
			delete normalized[field];
		}
	};

	switch (normalized.kind) {
		case 'goal':
			normalizeField('target_date', 'end');
			break;
		case 'milestone':
			normalizeField('due_at', 'end');
			break;
		case 'plan':
			normalizeField('start_date', 'start');
			normalizeField('end_date', 'end');
			break;
		case 'task':
			normalizeField('start_at', 'start');
			normalizeField('due_at', 'end');
			break;
		default:
			break;
	}

	return normalized as CreateOntoProjectArgs['entities'][number];
}

/**
 * Executor for ontology write operations.
 *
 * Handles create, update, and delete operations with proper validation
 * and support for update strategies.
 */
export class OntologyWriteExecutor extends BaseExecutor {
	constructor(context: ExecutorContext) {
		super(context);
	}

	// ============================================
	// CREATE OPERATIONS
	// ============================================

	async createOntoProject(args: CreateOntoProjectArgs): Promise<{
		project_id: string;
		counts: Record<string, number | undefined>;
		clarifications?: CreateOntoProjectArgs['clarifications'];
		message: string;
		context_shift?: {
			new_context: 'project';
			entity_id: string;
			entity_name: string;
			entity_type: 'project';
		};
	}> {
		if (!Array.isArray(args.entities)) {
			throw new Error('create_onto_project requires entities');
		}
		if (!Array.isArray(args.relationships)) {
			throw new Error('create_onto_project requires relationships');
		}

		if (args.clarifications?.length) {
			return {
				project_id: '',
				counts: {},
				clarifications: args.clarifications,
				message: 'Additional information is required before creating the project.'
			};
		}

		const normalizedProject = { ...args.project };
		if (normalizedProject.state_key !== undefined) {
			normalizedProject.state_key =
				this.normalizeProjectState(normalizedProject.state_key) ??
				normalizedProject.state_key;
		}
		const normalizedStartAt = normalizeIsoDateTime(args.project.start_at, 'start');
		if (normalizedStartAt !== undefined) {
			normalizedProject.start_at = normalizedStartAt;
		} else if (args.project.start_at !== undefined) {
			delete normalizedProject.start_at;
		}

		const normalizedEndAt = normalizeIsoDateTime(args.project.end_at, 'end');
		if (normalizedEndAt !== undefined) {
			normalizedProject.end_at = normalizedEndAt;
		} else if (args.project.end_at !== undefined) {
			delete normalizedProject.end_at;
		}

		const normalizedEntities = args.entities.map(normalizeEntityDates);
		const normalizedArgs: CreateOntoProjectArgs = {
			...args,
			project: normalizedProject,
			entities: normalizedEntities
		};

		const contextDocument = buildContextDocumentSpec(normalizedArgs);

		const spec = {
			project: normalizedArgs.project,
			entities: normalizedArgs.entities,
			relationships: normalizedArgs.relationships,
			...(contextDocument ? { context_document: contextDocument } : {})
		};

		const data = await this.apiRequest('/api/onto/projects/instantiate', {
			method: 'POST',
			body: JSON.stringify(spec)
		});

		const counts = data.counts ?? {};
		const summary = Object.entries(counts)
			.filter(([, value]) => typeof value === 'number' && value > 0)
			.map(([entity, value]) => `${value} ${entity.replace(/_/g, ' ')}`)
			.join(', ');

		const message =
			`Created project "${args.project.name}" (ID: ${data.project_id})` +
			(summary ? ` with ${summary}` : '');

		return {
			project_id: data.project_id,
			counts,
			message,
			context_shift: {
				new_context: 'project',
				entity_id: data.project_id,
				entity_name: args.project.name,
				entity_type: 'project'
			}
		};
	}

	async createOntoTask(args: CreateOntoTaskArgs): Promise<{
		task: any;
		message: string;
	}> {
		const payload: Record<string, unknown> = {
			project_id: args.project_id,
			title: args.title,
			description: args.description ?? null,
			type_key: args.type_key ?? 'task.execute',
			state_key: this.normalizeTaskState(args.state_key) ?? 'todo',
			priority: args.priority ?? 3,
			plan_id: args.plan_id ?? null,
			start_at: args.start_at ?? null,
			due_at: args.due_at ?? null,
			props: args.props ?? {}
		};

		if (args.goal_id !== undefined) {
			payload.goal_id = args.goal_id;
		}

		if (args.supporting_milestone_id !== undefined) {
			payload.supporting_milestone_id = args.supporting_milestone_id;
		}
		if (args.parent !== undefined) {
			payload.parent = args.parent;
		}
		if (args.parents !== undefined) {
			payload.parents = args.parents;
		}
		if (args.connections !== undefined) {
			payload.connections = args.connections;
		}

		const data = await this.apiRequest('/api/onto/tasks/create', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			task: data.task,
			message: `Created ontology task "${data.task?.title ?? 'Task'}"`
		};
	}

	async createOntoGoal(args: CreateOntoGoalArgs): Promise<{
		goal: any;
		message: string;
	}> {
		const payload = {
			project_id: args.project_id,
			name: args.name,
			description: args.description ?? null,
			type_key: args.type_key ?? 'goal.outcome.project',
			props: args.props ?? {}
		};

		const data = await this.apiRequest('/api/onto/goals/create', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			goal: data.goal,
			message: `Created ontology goal "${data.goal?.name ?? 'Goal'}"`
		};
	}

	async createOntoPlan(args: CreateOntoPlanArgs): Promise<{
		plan: any;
		message: string;
	}> {
		const payload = {
			project_id: args.project_id,
			name: args.name,
			description: args.description ?? null,
			type_key: args.type_key ?? 'plan.phase.base',
			state_key: args.state_key ?? 'draft',
			props: args.props ?? {},
			goal_id: args.goal_id,
			milestone_id: args.milestone_id,
			parent: args.parent,
			parents: args.parents
		};

		const data = await this.apiRequest('/api/onto/plans/create', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			plan: data.plan,
			message: `Created ontology plan "${data.plan?.name ?? 'Plan'}"`
		};
	}

	async createOntoDocument(args: CreateOntoDocumentArgs): Promise<{
		document: any;
		message: string;
	}> {
		// Support both content (new) and body_markdown (legacy) parameters
		const documentContent = args.content ?? args.body_markdown ?? null;
		const payload = {
			project_id: args.project_id,
			title: args.title,
			type_key: args.type_key,
			state_key: args.state_key ?? 'draft',
			// Use content column (body_markdown is preserved for backwards compatibility via API)
			content: documentContent,
			body_markdown: documentContent ?? '',
			props: args.props ?? {},
			parent: args.parent,
			parents: args.parents
		};

		const data = await this.apiRequest('/api/onto/documents/create', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			document: data.document,
			message: `Created ontology document "${data.document?.title ?? 'Document'}"`
		};
	}

	async createTaskDocument(args: CreateTaskDocumentArgs): Promise<{
		document: any;
		edge: any;
		message: string;
	}> {
		if (!args.task_id) {
			throw new Error('task_id is required for create_task_document');
		}

		// Support both content (new) and body_markdown (legacy) parameters
		const documentContent = args.content ?? args.body_markdown;
		const payload: Record<string, unknown> = {
			document_id: args.document_id,
			title: args.title,
			type_key: args.type_key,
			state_key: args.state_key,
			role: args.role,
			content: documentContent,
			body_markdown: documentContent,
			props: args.props
		};

		const data = await this.apiRequest(`/api/onto/tasks/${args.task_id}/documents`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			document: data.document,
			edge: data.edge,
			message: `Linked document "${data.document?.title ?? 'Document'}" to task.`
		};
	}

	async linkOntoEntities(args: LinkOntoEntitiesArgs): Promise<{
		created: number;
		message: string;
	}> {
		const payload = {
			edges: [
				{
					src_kind: args.src_kind,
					src_id: args.src_id,
					dst_kind: args.dst_kind,
					dst_id: args.dst_id,
					rel: args.rel,
					props: args.props ?? {}
				}
			]
		};

		const data = await this.apiRequest('/api/onto/edges', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			created: data.created ?? 0,
			message: 'Linked entities successfully.'
		};
	}

	async unlinkOntoEdge(args: UnlinkOntoEdgeArgs): Promise<{
		deleted: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/edges/${args.edge_id}`, {
			method: 'DELETE'
		});

		return {
			deleted: Boolean(data.deleted),
			message: 'Unlinked entities successfully.'
		};
	}

	async reorganizeOntoProjectGraph(args: ReorganizeOntoProjectGraphArgs): Promise<{
		dry_run: boolean;
		node_count: number;
		counts: { create: number; delete: number; update: number };
		changes?: {
			edges_to_create: any[];
			edges_to_delete: any[];
			edges_to_update: any[];
		};
		message: string;
	}> {
		const payload = {
			project_id: args.project_id,
			nodes: args.nodes,
			options: args.options
		};

		const data = await this.apiRequest(`/api/onto/projects/${args.project_id}/reorganize`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			dry_run: Boolean(data.dry_run),
			node_count: data.node_count ?? 0,
			counts: data.counts ?? { create: 0, delete: 0, update: 0 },
			changes: data.changes,
			message: data.dry_run
				? 'Graph reorganize dry run completed.'
				: 'Project graph reorganized.'
		};
	}

	// ============================================
	// UPDATE OPERATIONS
	// ============================================

	async updateOntoProject(args: UpdateOntoProjectArgs): Promise<{
		project: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};

		if (args.name !== undefined) updateData.name = args.name;
		if (args.description !== undefined) updateData.description = args.description;
		if (args.state_key !== undefined) {
			updateData.state_key = this.normalizeProjectState(args.state_key);
		}
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology project');
		}

		const data = await this.apiRequest(`/api/onto/projects/${args.project_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			project: data.project,
			message: `Updated ontology project "${data.project?.name ?? args.project_id}"`
		};
	}

	async updateOntoTask(
		args: UpdateOntoTaskArgs,
		getTaskDetails: (taskId: string) => Promise<any>
	): Promise<{
		task: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};
		const strategy = args.update_strategy ?? 'replace';

		if (args.title !== undefined) updateData.title = args.title;
		if (args.description !== undefined) {
			updateData.description = await this.resolveTextWithStrategy({
				strategy,
				newContent: args.description ?? '',
				instructions: args.merge_instructions,
				entityLabel: `task:${args.task_id}`,
				existingLoader: async () => {
					const details = await getTaskDetails(args.task_id);
					// Description is now a column, not in props
					const raw = details?.task?.description;
					return {
						text: typeof raw === 'string' ? raw : '',
						projectId: details?.task?.project_id as string | undefined
					};
				}
			});
		}
		if (args.type_key !== undefined) updateData.type_key = args.type_key;
		if (args.state_key !== undefined) {
			updateData.state_key = this.normalizeTaskState(args.state_key);
		}
		if (args.priority !== undefined) updateData.priority = args.priority;
		if (args.goal_id !== undefined) updateData.goal_id = args.goal_id;
		if (args.supporting_milestone_id !== undefined) {
			updateData.supporting_milestone_id = args.supporting_milestone_id;
		}
		if (args.start_at !== undefined) updateData.start_at = args.start_at;
		if (args.due_at !== undefined) updateData.due_at = args.due_at;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology task');
		}

		const data = await this.apiRequest(`/api/onto/tasks/${args.task_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			task: data.task,
			message: `Updated ontology task "${data.task?.title ?? args.task_id}"`
		};
	}

	async updateOntoGoal(
		args: UpdateOntoGoalArgs,
		getGoalDetails: (goalId: string) => Promise<any>
	): Promise<{
		goal: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};
		const strategy = args.update_strategy ?? 'replace';

		if (args.name !== undefined) updateData.name = args.name;
		if (args.description !== undefined) {
			updateData.description = await this.resolveTextWithStrategy({
				strategy,
				newContent: args.description ?? '',
				instructions: args.merge_instructions,
				entityLabel: `goal:${args.goal_id}`,
				existingLoader: async () => {
					const details = await getGoalDetails(args.goal_id);
					// Description is now a column, fall back to props for backwards compat
					const raw =
						details?.goal?.description ??
						(details?.goal?.props as Record<string, unknown>)?.description;
					return {
						text: typeof raw === 'string' ? raw : '',
						projectId: details?.goal?.project_id as string | undefined
					};
				}
			});
		}
		if (args.priority !== undefined) updateData.priority = args.priority;
		if (args.target_date !== undefined) updateData.target_date = args.target_date;
		if (args.measurement_criteria !== undefined)
			updateData.measurement_criteria = args.measurement_criteria;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology goal');
		}

		const data = await this.apiRequest(`/api/onto/goals/${args.goal_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			goal: data.goal,
			message: `Updated ontology goal "${data.goal?.name ?? args.goal_id}"`
		};
	}

	async updateOntoPlan(
		args: UpdateOntoPlanArgs,
		getPlanDetails: (planId: string) => Promise<any>
	): Promise<{
		plan: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};
		const strategy = args.update_strategy ?? 'replace';

		if (args.name !== undefined) updateData.name = args.name;
		if (args.description !== undefined) {
			updateData.description = await this.resolveTextWithStrategy({
				strategy,
				newContent: args.description ?? '',
				instructions: args.merge_instructions,
				entityLabel: `plan:${args.plan_id}`,
				existingLoader: async () => {
					const details = await getPlanDetails(args.plan_id);
					// Description is now a column, fall back to props for backwards compat
					const raw =
						details?.plan?.description ??
						(details?.plan?.props as Record<string, unknown>)?.description;
					return {
						text: typeof raw === 'string' ? raw : '',
						projectId: details?.plan?.project_id as string | undefined
					};
				}
			});
		}
		if (args.start_date !== undefined) updateData.start_date = args.start_date;
		if (args.end_date !== undefined) updateData.end_date = args.end_date;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology plan');
		}

		const data = await this.apiRequest(`/api/onto/plans/${args.plan_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			plan: data.plan,
			message: `Updated ontology plan "${data.plan?.name ?? args.plan_id}"`
		};
	}

	async updateOntoDocument(
		args: UpdateOntoDocumentArgs,
		getDocumentDetails: (documentId: string) => Promise<any>
	): Promise<{
		document: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};

		if (args.title !== undefined) updateData.title = args.title;
		if (args.type_key !== undefined) updateData.type_key = args.type_key;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		// Support both content (new) and body_markdown (legacy) parameters
		const documentContent = args.content ?? args.body_markdown;
		if (documentContent !== undefined) {
			const strategy = args.update_strategy ?? 'replace';
			// Resolve content with strategy, then send as content (API handles backwards compat)
			const resolvedContent = await this.resolveTextWithStrategy({
				strategy,
				newContent: documentContent ?? '',
				instructions: args.merge_instructions,
				entityLabel: `document:${args.document_id}`,
				existingLoader: async () => {
					const existing = await getDocumentDetails(args.document_id);
					// Prefer content column, fall back to props.body_markdown for backwards compat
					return {
						text:
							(existing?.document?.content as string) ||
							(existing?.document?.props?.body_markdown as string) ||
							(existing?.document?.body_markdown as string) ||
							'',
						projectId: existing?.document?.project_id as string | undefined
					};
				}
			});
			// Use content column (API handles backwards compatibility with props.body_markdown)
			updateData.content = resolvedContent;
		}
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology document');
		}

		const data = await this.apiRequest(`/api/onto/documents/${args.document_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			document: data.document,
			message: `Updated ontology document "${data.document?.title ?? args.document_id}"`
		};
	}

	async updateOntoMilestone(args: UpdateOntoMilestoneArgs): Promise<{
		milestone: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};

		if (args.title !== undefined) updateData.title = args.title;
		if (args.due_at !== undefined) updateData.due_at = args.due_at;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		if (args.description !== undefined) updateData.description = args.description;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology milestone');
		}

		const data = await this.apiRequest(`/api/onto/milestones/${args.milestone_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			milestone: data.milestone,
			message: `Updated ontology milestone "${data.milestone?.title ?? args.milestone_id}"`
		};
	}

	async updateOntoRisk(args: UpdateOntoRiskArgs): Promise<{
		risk: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};

		if (args.title !== undefined) updateData.title = args.title;
		if (args.impact !== undefined) updateData.impact = args.impact;
		if (args.probability !== undefined) updateData.probability = args.probability;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		if (args.content !== undefined) updateData.content = args.content;
		if (args.description !== undefined) updateData.description = args.description;
		if (args.mitigation_strategy !== undefined)
			updateData.mitigation_strategy = args.mitigation_strategy;
		if (args.owner !== undefined) updateData.owner = args.owner;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology risk');
		}

		const data = await this.apiRequest(`/api/onto/risks/${args.risk_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			risk: data.risk,
			message: `Updated ontology risk "${data.risk?.title ?? args.risk_id}"`
		};
	}

	async updateOntoRequirement(args: UpdateOntoRequirementArgs): Promise<{
		requirement: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};

		if (args.text !== undefined) updateData.text = args.text;
		if (args.priority !== undefined) updateData.priority = args.priority;
		if (args.type_key !== undefined) updateData.type_key = args.type_key;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology requirement');
		}

		const data = await this.apiRequest(`/api/onto/requirements/${args.requirement_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			requirement: data.requirement,
			message: `Updated ontology requirement "${data.requirement?.text ?? args.requirement_id}"`
		};
	}

	// ============================================
	// DELETE OPERATIONS
	// ============================================

	async deleteOntoTask(args: DeleteOntoTaskArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/tasks/${args.task_id}`, {
			method: 'DELETE'
		});

		return {
			success: true,
			message: data.message ?? 'Ontology task deleted successfully'
		};
	}

	async deleteOntoGoal(args: DeleteOntoGoalArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/goals/${args.goal_id}`, {
			method: 'DELETE'
		});

		return {
			success: true,
			message: data.message ?? 'Ontology goal deleted successfully'
		};
	}

	async deleteOntoPlan(args: DeleteOntoPlanArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/plans/${args.plan_id}`, {
			method: 'DELETE'
		});

		return {
			success: true,
			message: data.message ?? 'Ontology plan deleted successfully'
		};
	}

	async deleteOntoDocument(args: DeleteOntoDocumentArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/documents/${args.document_id}`, {
			method: 'DELETE'
		});

		return {
			success: true,
			message: data.message ?? 'Ontology document deleted successfully'
		};
	}

	// ============================================
	// UPDATE STRATEGY HELPERS
	// ============================================

	/**
	 * Resolve text content based on update strategy.
	 */
	private async resolveTextWithStrategy(params: {
		strategy: 'replace' | 'append' | 'merge_llm';
		newContent: string;
		instructions?: string;
		entityLabel?: string;
		existingLoader: () => Promise<{ text: string; projectId?: string }>;
	}): Promise<string> {
		const { strategy, newContent, instructions, entityLabel, existingLoader } = params;
		const sanitizedNew = newContent ?? '';

		if (strategy === 'replace') {
			return sanitizedNew;
		}

		let existingText = '';
		let projectId: string | undefined;
		try {
			const existing = await existingLoader();
			existingText = existing?.text ?? '';
			projectId = existing?.projectId;
		} catch (error) {
			logger.warn('Failed to load existing content, using provided content', {
				entityLabel: entityLabel || 'entity',
				error: error instanceof Error ? error.message : String(error)
			});
			return sanitizedNew;
		}

		const hasNewContent = sanitizedNew.trim().length > 0;
		if (!hasNewContent) {
			return existingText;
		}

		if (strategy === 'append') {
			return existingText ? `${existingText}\n\n${sanitizedNew}` : sanitizedNew;
		}

		// merge_llm strategy
		if (this.llmService) {
			try {
				return await this.composeContentUpdateWithLLM({
					existingContent: existingText,
					newContent: sanitizedNew,
					instructions,
					projectId
				});
			} catch (error) {
				logger.warn('LLM merge failed, falling back to append', {
					entityLabel: entityLabel || 'entity',
					error: error instanceof Error ? error.message : String(error)
				});
			}
		} else {
			logger.warn('LLM service not available, falling back to append', {
				entityLabel: entityLabel || 'entity'
			});
		}

		return existingText ? `${existingText}\n\n${sanitizedNew}` : sanitizedNew;
	}

	/**
	 * Use LLM to merge existing and new content.
	 */
	private async composeContentUpdateWithLLM(params: {
		existingContent: string;
		newContent: string;
		instructions?: string;
		projectId?: string;
	}): Promise<string> {
		if (!this.llmService) {
			throw new Error('LLM service unavailable for merge');
		}

		const systemPrompt =
			'You are a careful editor. Merge new content into existing markdown, preserving structure, headers, tables, and important details. Do not drop existing material unless it conflicts with explicit instructions.';

		const mergeInstructions =
			params.instructions?.trim() ||
			'Preserve existing sections and weave in new content naturally. Keep markdown clean and concise.';

		const prompt = [
			'## Goal',
			'Produce the final markdown after applying the new content.',
			'## Instructions',
			mergeInstructions,
			'## Existing content',
			params.existingContent || '(none)',
			'## New content to apply',
			params.newContent || '(none)',
			'## Output requirements',
			'- Return only the merged markdown (no explanations).',
			'- Keep existing structure when possible.',
			'- Integrate new details; avoid duplicating sections.'
		].join('\n\n');

		const result = await this.llmService.generateTextDetailed({
			prompt,
			systemPrompt,
			userId: this.userId,
			profile: 'balanced',
			maxTokens: 2000,
			temperature: 0.4,
			operationType: 'agentic_chat_content_merge',
			chatSessionId: this.sessionId,
			projectId: params.projectId
		});

		return result.text.trim();
	}
}
