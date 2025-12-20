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
	DeleteOntoTaskArgs,
	DeleteOntoGoalArgs,
	DeleteOntoPlanArgs,
	DeleteOntoDocumentArgs
} from './types';

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

/**
 * Build context document specification for project creation
 */
function buildContextDocumentSpec(
	args: CreateOntoProjectArgs
): CreateOntoProjectArgs['context_document'] {
	const provided = args.context_document;
	if (provided?.title?.trim() && provided?.body_markdown?.trim()) {
		return {
			...provided,
			type_key: provided.type_key ?? 'document.context.project',
			state_key: provided.state_key ?? 'draft'
		};
	}

	const meta = (args.meta ?? {}) as Record<string, unknown>;
	const braindump = extractMetaString(meta, 'braindump');
	const summary =
		extractMetaString(meta, 'summary') ??
		(args.project.description ? args.project.description.trim() : '');

	const goalsSection = (args.goals ?? [])
		.map((goal) => `- ${goal.name}${goal.description ? ` — ${goal.description}` : ''}`)
		.join('\n');

	const tasksSection = (args.tasks ?? [])
		.map(
			(task) =>
				`- ${task.title}${task.plan_name ? ` (Plan: ${task.plan_name})` : ''}${
					task.state_key ? ` · ${task.state_key}` : ''
				}`
		)
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
		body_markdown: body,
		type_key: 'document.context.project',
		state_key: 'active',
		props: {
			source: 'agent_project_creation',
			generated_at: new Date().toISOString(),
			braindump: braindump || undefined
		}
	};
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
		if (args.clarifications?.length) {
			return {
				project_id: '',
				counts: {},
				clarifications: args.clarifications,
				message: 'Additional information is required before creating the project.'
			};
		}

		const contextDocument = buildContextDocumentSpec(args);

		const additionalDocuments =
			args.documents?.filter((doc) => doc.type_key !== 'document.context.project') ?? [];

		const spec = {
			project: args.project,
			...(args.goals?.length ? { goals: args.goals } : {}),
			...(args.requirements?.length ? { requirements: args.requirements } : {}),
			...(args.plans?.length ? { plans: args.plans } : {}),
			...(args.tasks?.length ? { tasks: args.tasks } : {}),
			...(args.outputs?.length ? { outputs: args.outputs } : {}),
			...(additionalDocuments.length ? { documents: additionalDocuments } : {}),
			context_document: contextDocument
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
		const payload = {
			project_id: args.project_id,
			title: args.title,
			description: args.description ?? null,
			type_key: args.type_key ?? 'task.execute',
			state_key: args.state_key ?? 'todo',
			priority: args.priority ?? 3,
			plan_id: args.plan_id ?? null,
			start_at: args.start_at ?? null,
			due_at: args.due_at ?? null,
			props: args.props ?? {}
		};

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
			props: args.props ?? {}
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
		const payload = {
			project_id: args.project_id,
			title: args.title,
			type_key: args.type_key,
			state_key: args.state_key ?? 'draft',
			// Use content column (body_markdown is preserved for backwards compatibility via API)
			content: args.body_markdown ?? null,
			body_markdown: args.body_markdown ?? '',
			props: args.props ?? {}
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

		const payload: Record<string, unknown> = {
			document_id: args.document_id,
			title: args.title,
			type_key: args.type_key,
			state_key: args.state_key,
			role: args.role,
			body_markdown: args.body_markdown,
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
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
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
					return typeof raw === 'string' ? raw : '';
				}
			});
		}
		if (args.type_key !== undefined) updateData.type_key = args.type_key;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		if (args.priority !== undefined) updateData.priority = args.priority;
		if (args.plan_id !== undefined) updateData.plan_id = args.plan_id;
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
					const props = (details?.goal?.props as Record<string, unknown>) || {};
					const raw = props.description;
					return typeof raw === 'string' ? raw : '';
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
					const props = (details?.plan?.props as Record<string, unknown>) || {};
					const raw = props.description;
					return typeof raw === 'string' ? raw : '';
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
		if (args.body_markdown !== undefined) {
			const strategy = args.update_strategy ?? 'replace';
			// Resolve content with strategy, then send as content (API handles backwards compat)
			const resolvedContent = await this.resolveTextWithStrategy({
				strategy,
				newContent: args.body_markdown ?? '',
				instructions: args.merge_instructions,
				entityLabel: `document:${args.document_id}`,
				existingLoader: async () => {
					const existing = await getDocumentDetails(args.document_id);
					// Prefer content column, fall back to props.body_markdown for backwards compat
					return (
						(existing?.document?.content as string) ||
						(existing?.document?.props?.body_markdown as string) ||
						(existing?.document?.body_markdown as string) ||
						''
					);
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
		existingLoader: () => Promise<string>;
	}): Promise<string> {
		const { strategy, newContent, instructions, entityLabel, existingLoader } = params;
		const sanitizedNew = newContent ?? '';

		if (strategy === 'replace') {
			return sanitizedNew;
		}

		let existingText = '';
		try {
			existingText = (await existingLoader()) || '';
		} catch (error) {
			console.warn(
				`[OntologyWriteExecutor] Failed to load existing content for ${entityLabel || 'entity'}, using provided content`,
				error
			);
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
					instructions
				});
			} catch (error) {
				console.warn(
					`[OntologyWriteExecutor] LLM merge failed for ${entityLabel || 'entity'}, falling back to append`,
					error
				);
			}
		} else {
			console.warn(
				`[OntologyWriteExecutor] LLM service not available for ${entityLabel || 'entity'}, falling back to append`
			);
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
			operationType: 'agentic_chat_content_merge'
		});

		return result.text.trim();
	}
}
