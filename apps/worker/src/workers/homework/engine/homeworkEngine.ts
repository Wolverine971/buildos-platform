// apps/worker/src/workers/homework/engine/homeworkEngine.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import { SmartLLMService } from '../../../lib/services/smart-llm-service';

export interface UsageEvent {
	model: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	inputCost: number;
	outputCost: number;
	totalCost: number;
}

export interface HomeworkStatusBlock {
	exit_signal: boolean;
	needs_user_input: boolean;
	blocking_questions: string[];
	progress_summary: string;
	remaining_work: string[];
	completion_evidence: string[];
	next_action_hint: 'replan' | 'execute' | 'ask_user' | 'stop';
	confidence: 'low' | 'medium' | 'high';
}

export interface HomeworkIterationResult {
	status: HomeworkStatusBlock;
	summary: string;
	artifacts?: Json;
	progressMade?: boolean;
	plan?: {
		remaining_work?: string[];
		completion_evidence?: string[];
		next_action_hint?: string;
		iteration: number;
		steps?: Array<{ id: string; title: string; status: string; owner?: string }>;
	};
}

type ToolCall = {
	name: string;
	args: Record<string, unknown>;
	purpose?: string;
};

type PlannerOutput = {
	status: HomeworkStatusBlock;
	tool_calls?: ToolCall[];
	executor_tasks?: Array<{
		title: string;
		objective: string;
		tool_hints?: string[];
	}>;
	plan?: {
		steps?: Array<{ id?: string; title: string; status?: string; owner?: string }>;
	};
};
type RepairOutput = { tool_calls?: ToolCall[] };

type LastIterationSummary = {
	iteration: number;
	summary?: string;
	tool_calls?: string[];
	executor_tasks?: string[];
	artifacts?: Record<string, string[]>;
	progress?: boolean;
	plan_remaining?: string[];
	plan_completion?: string[];
	plan_steps?: Array<{
		id?: string;
		title: string;
		status?: string;
		owner?: string;
		iteration?: number;
	}>;
};

type ScratchpadSummary = {
	id: string;
	title: string;
	branch_id?: string | null;
	updated_at?: string | null;
	snippet?: string | null;
};

type DocumentState = Database['public']['Enums']['document_state'];
type TaskState = Database['public']['Enums']['task_state'];

const WORKSPACE_PROJECT_TYPE = 'project.workspace.homework';
const WORKSPACE_DOC_TYPE = 'document.homework.workspace';
const SCRATCHPAD_DOC_TYPE = 'document.homework.scratchpad';
const DEFAULT_DOC_STATE: DocumentState = 'draft';
const DEFAULT_TASK_STATE: TaskState = 'todo';
const MAX_TOOL_CALLS_PER_ITERATION = 8;
const MAX_EXECUTOR_TASKS = 3;
const MAX_EXECUTOR_TOOL_CALLS = 4;
const MAX_REPAIR_TOOL_CALLS = 2;
const AVAILABLE_TOOLS = [
	'list_onto_projects',
	'get_onto_project_details',
	'list_onto_documents',
	'search_onto_documents',
	'get_onto_document_details',
	'create_onto_document',
	'update_onto_document',
	'list_onto_tasks',
	'get_onto_task_details',
	'create_onto_task',
	'update_onto_task'
];

const TOOL_GUIDE: Record<string, string> = {
	list_onto_projects: 'args: { limit?: number }',
	get_onto_project_details: 'args: { project_id: string }',
	list_onto_documents:
		'args: { project_id?: string, type_key?: string, state_key?: string, limit?: number }',
	search_onto_documents: 'args: { search: string, project_id?: string, limit?: number }',
	get_onto_document_details: 'args: { document_id: string }',
	create_onto_document:
		'args: { project_id?: string, title: string, content?: string, description?: string, type_key?: string, state_key?: string, props?: object, parent_document_id?: string }',
	update_onto_document:
		'args: { document_id: string, title?: string, content?: string, description?: string, type_key?: string, state_key?: string, props?: object }',
	list_onto_tasks: 'args: { project_id?: string, state_key?: string, limit?: number }',
	get_onto_task_details: 'args: { task_id: string }',
	create_onto_task:
		'args: { project_id?: string, title: string, description?: string, type_key?: string, state_key?: string, props?: object }',
	update_onto_task:
		'args: { task_id: string, title?: string, description?: string, type_key?: string, state_key?: string, props?: object }'
};

const DOCUMENT_STATE_VALUES: DocumentState[] = [
	'draft',
	'review',
	'published',
	'in_review',
	'ready',
	'archived'
];

const TASK_STATE_VALUES: TaskState[] = ['todo', 'in_progress', 'blocked', 'done'];

const isJsonObject = (value: unknown): value is Record<string, Json> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

const normalizeStatus = (input: any): HomeworkStatusBlock => {
	const safeArray = (v: any) => (Array.isArray(v) ? v.map(String) : []);
	const nextActionValues = ['replan', 'execute', 'ask_user', 'stop'] as const;
	const confidenceValues = ['low', 'medium', 'high'] as const;
	const nextAction = nextActionValues.includes(input?.next_action_hint)
		? input.next_action_hint
		: 'replan';
	const confidence = confidenceValues.includes(input?.confidence) ? input.confidence : 'medium';
	return {
		exit_signal: Boolean(input?.exit_signal),
		needs_user_input: Boolean(input?.needs_user_input),
		blocking_questions: safeArray(input?.blocking_questions),
		progress_summary:
			typeof input?.progress_summary === 'string'
				? input.progress_summary
				: 'Iteration summary unavailable.',
		remaining_work: safeArray(input?.remaining_work),
		completion_evidence: safeArray(input?.completion_evidence),
		next_action_hint: nextAction,
		confidence
	};
};

const asDocumentState = (value: unknown): DocumentState | null => {
	if (typeof value !== 'string') return null;
	return DOCUMENT_STATE_VALUES.includes(value as DocumentState) ? (value as DocumentState) : null;
};

const asTaskState = (value: unknown): TaskState | null => {
	if (typeof value !== 'string') return null;
	return TASK_STATE_VALUES.includes(value as TaskState) ? (value as TaskState) : null;
};

const getPlanFromMetrics = (
	run: Database['public']['Tables']['homework_runs']['Row']
): Pick<LastIterationSummary, 'plan_remaining' | 'plan_completion' | 'plan_steps'> | null => {
	const plan = (run.metrics as any)?.plan;
	if (!plan || typeof plan !== 'object') return null;
	// Normalize field names to match LastIterationSummary
	return {
		plan_remaining: Array.isArray(plan.remaining_work) ? plan.remaining_work : undefined,
		plan_completion: Array.isArray(plan.completion_evidence)
			? plan.completion_evidence
			: undefined,
		plan_steps: Array.isArray(plan.steps) ? plan.steps : undefined
	};
};

async function getAccessibleProjectIds(
	supabase: TypedSupabaseClient,
	actorId: string,
	run: Database['public']['Tables']['homework_runs']['Row'],
	workspaceProjectId: string
): Promise<Set<string>> {
	const allowed = new Set<string>();
	allowed.add(workspaceProjectId);
	if (Array.isArray(run.project_ids)) {
		for (const id of run.project_ids) if (typeof id === 'string') allowed.add(id);
	}

	const { data: memberships } = await supabase
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', actorId);
	memberships?.forEach((row) => row.project_id && allowed.add(row.project_id));

	return allowed;
}

async function ensureActorId(supabase: TypedSupabaseClient, userId: string): Promise<string> {
	const { data: actor } = await supabase
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.single();

	if (actor?.id) return actor.id;

	const { data: user } = await supabase
		.from('users')
		.select('id, name, email')
		.eq('id', userId)
		.single();

	const name = user?.name || user?.email || 'BuildOS User';

	const { data: created } = await supabase
		.from('onto_actors')
		.insert({
			user_id: userId,
			name,
			email: user?.email ?? null,
			kind: 'human'
		})
		.select('id')
		.single();

	if (!created?.id) {
		throw new Error('Failed to create onto_actor for homework run');
	}

	return created.id;
}

async function ensureWorkspaceProject(
	supabase: TypedSupabaseClient,
	userId: string,
	actorId: string,
	run: Database['public']['Tables']['homework_runs']['Row']
): Promise<string> {
	if (run.workspace_project_id) return run.workspace_project_id;

	if (run.scope === 'project' && Array.isArray(run.project_ids) && run.project_ids.length > 0) {
		return run.project_ids[0];
	}

	// Try to reuse an existing workspace project
	const { data: existing } = await supabase
		.from('onto_projects')
		.select('id')
		.contains('props', { homework_workspace: true, user_id: userId })
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (existing?.id) {
		await ensureProjectMembership(supabase, existing.id, actorId);
		return existing.id;
	}

	const { data: createdProject, error } = await supabase
		.from('onto_projects')
		.insert({
			name: 'Homework Workspace',
			type_key: WORKSPACE_PROJECT_TYPE,
			state_key: 'active',
			created_by: actorId,
			props: {
				homework_workspace: true,
				user_id: userId
			}
		})
		.select('id')
		.single();

	if (error || !createdProject?.id) {
		throw new Error(`Failed to create workspace project: ${error?.message ?? 'unknown'}`);
	}

	await ensureProjectMembership(supabase, createdProject.id, actorId);

	return createdProject.id;
}

async function ensureProjectMembership(
	supabase: TypedSupabaseClient,
	projectId: string,
	actorId: string
): Promise<void> {
	const { data: existing } = await supabase
		.from('onto_project_members')
		.select('id')
		.eq('project_id', projectId)
		.eq('actor_id', actorId)
		.limit(1)
		.maybeSingle();

	if (existing?.id) return;

	await supabase.from('onto_project_members').insert({
		project_id: projectId,
		actor_id: actorId,
		role_key: 'owner',
		access: 'admin',
		added_by_actor_id: actorId
	});
}

async function ensureWorkspaceDocs(params: {
	supabase: TypedSupabaseClient;
	actorId: string;
	projectId: string;
	run: Database['public']['Tables']['homework_runs']['Row'];
}): Promise<{ workspaceId: string; scratchpadId: string }> {
	const { supabase, actorId, projectId, run } = params;

	let workspaceId = run.workspace_document_id || null;

	if (!workspaceId) {
		const { data: workspaceDoc, error: workspaceError } = await supabase
			.from('onto_documents')
			.insert({
				project_id: projectId,
				title: `Homework Workspace: ${run.objective.slice(0, 80)}`,
				type_key: WORKSPACE_DOC_TYPE,
				state_key: DEFAULT_DOC_STATE,
				created_by: actorId,
				content: `# Homework Workspace\n\nRun: ${run.id}\nObjective: ${run.objective}\n\nThis is the root workspace document for the homework run. Child scratchpads, plan docs, and executor notes will be linked here.`,
				props: {
					homework_run_id: run.id,
					doc_role: 'workspace',
					scope: run.scope
				}
			})
			.select('id')
			.single();

		if (workspaceError || !workspaceDoc?.id) {
			throw new Error(
				`Failed to create workspace document: ${workspaceError?.message ?? 'unknown'}`
			);
		}
		workspaceId = workspaceDoc.id;
	}

	const { data: scratchpadExisting } = await supabase
		.from('onto_documents')
		.select('id')
		.contains('props', { homework_run_id: run.id, doc_role: 'scratchpad' })
		.eq('project_id', projectId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	let scratchpadId = scratchpadExisting?.id || null;

	if (!scratchpadId) {
		const { data: scratchpadDoc, error: scratchpadError } = await supabase
			.from('onto_documents')
			.insert({
				project_id: projectId,
				title: 'Homework Scratchpad',
				type_key: SCRATCHPAD_DOC_TYPE,
				state_key: DEFAULT_DOC_STATE,
				created_by: actorId,
				content: `# Scratchpad\n\nRun: ${run.id}\nObjective: ${run.objective}\n`,
				props: {
					homework_run_id: run.id,
					doc_role: 'scratchpad'
				}
			})
			.select('id')
			.single();

		if (scratchpadError || !scratchpadDoc?.id) {
			throw new Error(
				`Failed to create scratchpad document: ${scratchpadError?.message ?? 'unknown'}`
			);
		}
		scratchpadId = scratchpadDoc.id;
	}

	// Link scratchpad to workspace (idempotent)
	await supabase
		.from('onto_edges')
		.delete()
		.eq('src_id', workspaceId)
		.eq('dst_id', scratchpadId)
		.eq('rel', 'document_has_document');

	await supabase
		.from('onto_edges')
		.insert({
			project_id: projectId,
			src_id: workspaceId,
			src_kind: 'document',
			dst_id: scratchpadId,
			dst_kind: 'document',
			rel: 'document_has_document',
			props: {
				homework_run_id: run.id
			}
		})
		.select('id')
		.single()
		.throwOnError();

	return { workspaceId, scratchpadId };
}

async function ensureExecutorScratchpad(params: {
	supabase: TypedSupabaseClient;
	projectId: string;
	runId: string;
	mainScratchpadId: string;
	taskTitle: string;
	branchId: string;
	actorId: string;
}): Promise<string> {
	const { supabase, projectId, runId, mainScratchpadId, taskTitle, branchId, actorId } = params;

	const { data: existing } = await supabase
		.from('onto_documents')
		.select('id')
		.eq('project_id', projectId)
		.contains('props', {
			homework_run_id: runId,
			doc_role: 'scratchpad_exec',
			branch_id: branchId
		})
		.limit(1)
		.maybeSingle();

	if (existing?.id) return existing.id;

	const { data: doc, error } = await supabase
		.from('onto_documents')
		.insert({
			project_id: projectId,
			title: `Executor: ${taskTitle.slice(0, 60)}`,
			type_key: SCRATCHPAD_DOC_TYPE,
			state_key: DEFAULT_DOC_STATE,
			created_by: actorId,
			content: `# Executor Scratchpad\nTask: ${taskTitle}\nBranch: ${branchId}\n\n## Log\n`,
			props: {
				homework_run_id: runId,
				doc_role: 'scratchpad_exec',
				branch_id: branchId
			}
		})
		.select('id')
		.single();

	if (error || !doc?.id) {
		throw new Error(error?.message ?? 'Failed to create executor scratchpad');
	}

	// link it under main scratchpad
	await supabase.from('onto_edges').insert({
		project_id: projectId,
		src_id: mainScratchpadId,
		src_kind: 'document',
		dst_id: doc.id,
		dst_kind: 'document',
		rel: 'document_has_document',
		props: { homework_run_id: runId }
	});

	return doc.id;
}

async function fetchLastIterationSummary(
	supabase: TypedSupabaseClient,
	runId: string,
	currentIteration: number
): Promise<LastIterationSummary | null> {
	const prevIteration = currentIteration - 1;
	if (prevIteration < 1) return null;

	const { data } = await supabase
		.from('homework_run_iterations')
		.select('iteration, summary, artifacts')
		.eq('run_id', runId)
		.eq('iteration', prevIteration)
		.limit(1)
		.maybeSingle();

	if (!data) return null;
	const artifacts = (data.artifacts as any) || {};
	const toolCalls: string[] = [];
	const executorTasks: string[] = [];

	const toolResults = artifacts.tool_results as Array<{ name?: string }>;
	if (Array.isArray(toolResults)) {
		for (const t of toolResults) {
			if (t?.name) toolCalls.push(t.name);
		}
	}

	const execResults = artifacts.executor_results as Array<{ title?: string; results?: any[] }>;
	if (Array.isArray(execResults)) {
		for (const e of execResults) {
			if (e?.title) executorTasks.push(e.title);
		}
	}

	const progress =
		artifacts?.artifacts &&
		Object.values(artifacts.artifacts as Record<string, any[]>).some(
			(arr) => Array.isArray(arr) && arr.length > 0
		);

	const planBlock = (artifacts.plan as any) || {};

	return {
		iteration: prevIteration,
		summary: data.summary ?? undefined,
		tool_calls: toolCalls.length ? toolCalls : undefined,
		executor_tasks: executorTasks.length ? executorTasks : undefined,
		artifacts: artifacts.artifacts as Record<string, string[]> | undefined,
		progress,
		plan_remaining: Array.isArray(planBlock.remaining_work)
			? planBlock.remaining_work
			: undefined,
		plan_completion: Array.isArray(planBlock.completion_evidence)
			? planBlock.completion_evidence
			: undefined,
		plan_steps: Array.isArray(planBlock.steps) ? planBlock.steps : undefined
	};
}

async function fetchExecutorScratchpadSummaries(
	supabase: TypedSupabaseClient,
	runId: string,
	limit = 6
): Promise<ScratchpadSummary[]> {
	const { data } = await supabase
		.from('onto_documents')
		.select('id, title, props, updated_at, content')
		.contains('props', { homework_run_id: runId, doc_role: 'scratchpad_exec' })
		.order('updated_at', { ascending: false })
		.limit(limit);

	if (!data) return [];
	return data.map((doc) => ({
		id: doc.id,
		title: doc.title ?? 'Executor Scratchpad',
		branch_id: (doc.props as any)?.branch_id ?? null,
		updated_at: doc.updated_at,
		snippet: typeof doc.content === 'string' ? doc.content.slice(-400) : null
	}));
}

function formatScratchpadEntry(iteration: number, status: HomeworkStatusBlock): string {
	const timestamp = new Date().toISOString();
	const remaining = status.remaining_work?.length
		? status.remaining_work.map((item) => `- ${item}`).join('\n')
		: '- (none)';
	const questions = status.blocking_questions?.length
		? status.blocking_questions.map((q) => `- ${q}`).join('\n')
		: '- (none)';

	return `\n\n---\n## Iteration ${iteration} — ${timestamp}\n\n${status.progress_summary}\n\n### Remaining Work\n${remaining}\n\n### Questions\n${questions}\n`;
}

function formatToolSection(toolCalls: ToolCall[], results: Array<{ name: string; ok: boolean }>) {
	if (!toolCalls.length) return '';
	const lines = toolCalls.map((tool, idx) => {
		const outcome = results[idx]?.ok ? 'ok' : 'error';
		return `- ${tool.name} (${outcome})${tool.purpose ? ` — ${tool.purpose}` : ''}`;
	});
	return `\n### Tool Calls\n${lines.join('\n')}\n`;
}

function summarizeToolResults(
	toolCalls: ToolCall[],
	results: Array<{ name: string; ok: boolean; error?: string }>
): string {
	if (!toolCalls.length) return '- None';
	return toolCalls
		.map((t, i) => {
			const r = results[i];
			const status = r?.ok ? 'ok' : 'error';
			const err = r?.error ? ` — ${String(r.error).slice(0, 120)}` : '';
			return `- ${t.name} (${status})${err}`;
		})
		.join('\n');
}

function summarizeExecutorResults(
	execResults: Array<{
		title: string;
		results: Array<{ name: string; ok: boolean; error?: string }>;
	}>
): string {
	if (!execResults.length) return '- None';
	return execResults
		.map((er) => {
			const okCount = er.results.filter((r) => r.ok).length;
			const errCount = er.results.filter((r) => !r.ok).length;
			return `- ${er.title}: ${okCount} ok, ${errCount} error`;
		})
		.join('\n');
}

async function repairFailedTools(params: {
	llm: SmartLLMService;
	run: Database['public']['Tables']['homework_runs']['Row'];
	userId: string;
	iteration: number;
	failed: Array<{ name: string; args: Record<string, unknown>; error: string }>;
	projectId: string;
	workspaceDocumentId: string;
	onUsage?: (event: UsageEvent) => Promise<void> | void;
}): Promise<ToolCall[]> {
	const { llm, run, failed, iteration, userId, projectId, workspaceDocumentId, onUsage } = params;
	if (!failed.length) return [];

	const toolGuide = AVAILABLE_TOOLS.map((tool) => {
		const description = TOOL_GUIDE[tool];
		return description ? `- ${tool}: ${description}` : `- ${tool}`;
	}).join('\n');

	const examples = failed
		.map((f) => `- ${f.name} args=${JSON.stringify(f.args)} error="${f.error?.slice(0, 200)}"`)
		.join('\n');

	const systemPrompt = `You are a repair agent for BuildOS Homework.\nReturn ONLY valid JSON:\n{\n "tool_calls": [{ "name": string, "args": object, "purpose": string }]\n}\nUse only available tools and fix the arguments based on errors. Limit tool_calls to ${MAX_REPAIR_TOOL_CALLS}.`;

	const userPrompt = `Fix these failed tool calls (iteration ${iteration}):\n${examples}\n\nConstraints:\n- Use only available tools\n- Prefer project_id=${projectId}\n- If creating documents, parent_document_id should be workspace_document_id=${workspaceDocumentId} when unsure.\n\nAvailable tools:\n${toolGuide}`;

	const repair = await llm.getJSONResponse<RepairOutput>({
		systemPrompt,
		userPrompt,
		userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 1 },
		operationType: 'other',
		chatSessionId: run.chat_session_id ?? undefined,
		// Note: projectId is an onto_project ID, not a main project ID, so don't pass it
		metadata: { homework_run_id: run.id, iteration, repair: true, onto_project_id: projectId },
		onUsage
	});

	return Array.isArray(repair.tool_calls)
		? repair.tool_calls.slice(0, MAX_REPAIR_TOOL_CALLS)
		: [];
}

async function executeToolCall(params: {
	supabase: TypedSupabaseClient;
	actorId: string;
	tool: ToolCall;
	projectId?: string;
	workspaceDocumentId?: string;
	runId?: string;
	allowedProjects: Set<string>;
}): Promise<{
	name: string;
	ok: boolean;
	result?: Json;
	error?: string;
	artifacts?: Record<string, string[]>;
}> {
	const { supabase, actorId, tool, projectId, workspaceDocumentId, runId, allowedProjects } =
		params;
	const args = tool.args ?? {};

	const safeLimit = (value: unknown, fallback: number) => {
		if (typeof value !== 'number') return fallback;
		return Math.max(1, Math.min(value, 50));
	};

	try {
		switch (tool.name) {
			case 'list_onto_projects': {
				const limit = safeLimit(args.limit, 20);
				const ids = Array.from(allowedProjects);
				if (!ids.length) return { name: tool.name, ok: true, result: [] };
				const { data, error } = await supabase
					.from('onto_projects')
					.select('id, name, state_key, type_key, created_at')
					.in('id', ids)
					.is('deleted_at', null)
					.order('created_at', { ascending: false })
					.limit(limit);
				if (error) throw error;
				return { name: tool.name, ok: true, result: data ?? [] };
			}
			case 'get_onto_project_details': {
				const projectId = String(args.project_id || '');
				if (!projectId || !allowedProjects.has(projectId)) {
					return { name: tool.name, ok: false, error: 'project_id is required' };
				}
				const { data, error } = await supabase
					.from('onto_projects')
					.select('*')
					.eq('id', projectId)
					.single();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data };
			}
			case 'list_onto_documents': {
				const limit = safeLimit(args.limit, 20);
				const stateKey = asDocumentState(args.state_key);
				const query = supabase
					.from('onto_documents')
					.select('id, title, type_key, state_key, project_id, updated_at')
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);
				if (args.project_id) {
					const pid = String(args.project_id);
					if (!allowedProjects.has(pid)) {
						return { name: tool.name, ok: false, error: 'unauthorized project' };
					}
					query.eq('project_id', pid);
				} else {
					query.in('project_id', Array.from(allowedProjects));
				}
				if (args.type_key) query.eq('type_key', String(args.type_key));
				if (stateKey) query.eq('state_key', stateKey);
				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: data ?? [] };
			}
			case 'search_onto_documents': {
				const limit = safeLimit(args.limit, 20);
				const search = String(args.search || '').trim();
				const query = supabase
					.from('onto_documents')
					.select('id, title, type_key, state_key, project_id')
					.ilike('title', `%${search}%`)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);
				if (args.project_id) {
					const pid = String(args.project_id);
					if (!allowedProjects.has(pid)) {
						return { name: tool.name, ok: false, error: 'unauthorized project' };
					}
					query.eq('project_id', pid);
				} else {
					query.in('project_id', Array.from(allowedProjects));
				}
				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: data ?? [] };
			}
			case 'get_onto_document_details': {
				const documentId = String(args.document_id || '');
				if (!documentId) {
					return { name: tool.name, ok: false, error: 'document_id is required' };
				}
				const { data, error } = await supabase
					.from('onto_documents')
					.select(
						'id, project_id, title, content, description, type_key, state_key, props, created_at, created_by, updated_at, deleted_at'
					)
					.eq('id', documentId)
					.single();
				if (error) throw error;
				if (data?.project_id && !allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized project' };
				}
				const result = data
					? {
							id: data.id,
							project_id: data.project_id,
							title: data.title,
							content: data.content,
							description: data.description,
							type_key: data.type_key,
							state_key: data.state_key,
							props: data.props,
							created_at: data.created_at,
							created_by: data.created_by,
							updated_at: data.updated_at,
							deleted_at: data.deleted_at
						}
					: null;
				return { name: tool.name, ok: true, result: result as Json };
			}
			case 'create_onto_document': {
				const resolvedProjectId = args.project_id ? String(args.project_id) : projectId;
				if (!resolvedProjectId || !allowedProjects.has(resolvedProjectId)) {
					return { name: tool.name, ok: false, error: 'project_id is required' };
				}
				const mergedProps: Record<string, Json> = isJsonObject(args.props)
					? { ...args.props }
					: {};
				if (runId) mergedProps.homework_run_id = runId;
				const stateKey = asDocumentState(args.state_key) ?? DEFAULT_DOC_STATE;
				const payload = {
					project_id: resolvedProjectId,
					title: String(args.title || 'Untitled Document'),
					content: typeof args.content === 'string' ? args.content : null,
					description: typeof args.description === 'string' ? args.description : null,
					type_key: String(args.type_key || 'document.homework.note'),
					state_key: stateKey,
					created_by: actorId,
					props: mergedProps
				};
				const { data, error } = await supabase
					.from('onto_documents')
					.insert(payload)
					.select('id, title')
					.single();
				if (error) throw error;
				const parentId =
					typeof args.parent_document_id === 'string'
						? args.parent_document_id
						: typeof args.parent_id === 'string'
							? args.parent_id
							: resolvedProjectId === projectId
								? (workspaceDocumentId ?? null)
								: null;
				let edgeError: string | null = null;
				if (parentId && data?.id) {
					try {
						await supabase.from('onto_edges').insert({
							project_id: resolvedProjectId,
							src_id: parentId,
							src_kind: 'document',
							dst_id: data.id,
							dst_kind: 'document',
							rel: 'document_has_document',
							props: runId ? { homework_run_id: runId } : {}
						});
					} catch (error) {
						edgeError =
							error instanceof Error ? error.message : 'Failed to link document';
					}
				} else if (!parentId && data?.id && workspaceDocumentId && projectId) {
					try {
						await supabase.from('onto_edges').insert({
							project_id: projectId,
							src_id: workspaceDocumentId,
							src_kind: 'document',
							dst_id: data.id,
							dst_kind: 'document',
							rel: 'document_has_document',
							props: runId ? { homework_run_id: runId } : {}
						});
					} catch (error) {
						edgeError =
							error instanceof Error ? error.message : 'Failed to link document';
					}
				}
				return {
					name: tool.name,
					ok: true,
					result: data,
					artifacts: {
						created_documents: [data?.id],
						...(parentId && data?.id
							? { created_edges: [`${parentId}:${data.id}`] }
							: {}),
						...(!parentId && data?.id ? { unlinked_documents: [data.id] } : {}),
						...(edgeError ? { edge_errors: [edgeError] } : {})
					}
				};
			}
			case 'update_onto_document': {
				const documentId = String(args.document_id || '');
				if (!documentId) {
					return { name: tool.name, ok: false, error: 'document_id is required' };
				}
				const { data: target } = await supabase
					.from('onto_documents')
					.select('project_id')
					.eq('id', documentId)
					.single();
				if (target?.project_id && !allowedProjects.has(target.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized project' };
				}
				const updatePayload: Record<string, unknown> = {};
				if (args.title) updatePayload.title = args.title;
				if (args.content !== undefined) updatePayload.content = args.content;
				if (args.description !== undefined) updatePayload.description = args.description;
				if (args.type_key) updatePayload.type_key = args.type_key;
				const stateKey = asDocumentState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (args.props && isJsonObject(args.props)) updatePayload.props = args.props;
				updatePayload.updated_at = new Date().toISOString();

				const { data, error } = await supabase
					.from('onto_documents')
					.update(updatePayload)
					.eq('id', documentId)
					.select('id, title')
					.single();
				if (error) throw error;
				return {
					name: tool.name,
					ok: true,
					result: data,
					artifacts: { updated_documents: [data?.id] }
				};
			}
			case 'list_onto_tasks': {
				const limit = safeLimit(args.limit, 20);
				const stateKey = asTaskState(args.state_key);
				const query = supabase
					.from('onto_tasks')
					.select('id, title, state_key, project_id, updated_at')
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);
				if (args.project_id) {
					const pid = String(args.project_id);
					if (!allowedProjects.has(pid)) {
						return { name: tool.name, ok: false, error: 'unauthorized project' };
					}
					query.eq('project_id', pid);
				} else {
					query.in('project_id', Array.from(allowedProjects));
				}
				if (stateKey) query.eq('state_key', stateKey);
				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: data ?? [] };
			}
			case 'get_onto_task_details': {
				const taskId = String(args.task_id || '');
				if (!taskId) {
					return { name: tool.name, ok: false, error: 'task_id is required' };
				}
				const { data, error } = await supabase
					.from('onto_tasks')
					.select(
						'id, project_id, title, description, type_key, state_key, props, created_at, created_by, updated_at, deleted_at, due_at, start_at, completed_at, priority, facet_scale'
					)
					.eq('id', taskId)
					.single();
				if (error) throw error;
				if (data?.project_id && !allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized project' };
				}
				const result = data
					? {
							id: data.id,
							project_id: data.project_id,
							title: data.title,
							description: data.description,
							type_key: data.type_key,
							state_key: data.state_key,
							props: data.props,
							created_at: data.created_at,
							created_by: data.created_by,
							updated_at: data.updated_at,
							deleted_at: data.deleted_at,
							due_at: data.due_at,
							start_at: data.start_at,
							completed_at: data.completed_at,
							priority: data.priority,
							facet_scale: data.facet_scale
						}
					: null;
				return { name: tool.name, ok: true, result: result as Json };
			}
			case 'create_onto_task': {
				const resolvedProjectId = args.project_id ? String(args.project_id) : projectId;
				if (!resolvedProjectId || !allowedProjects.has(resolvedProjectId)) {
					return { name: tool.name, ok: false, error: 'project_id is required' };
				}
				const mergedProps: Record<string, Json> = isJsonObject(args.props)
					? { ...args.props }
					: {};
				if (runId) mergedProps.homework_run_id = runId;
				const stateKey = asTaskState(args.state_key) ?? DEFAULT_TASK_STATE;
				const payload = {
					project_id: resolvedProjectId,
					title: String(args.title || 'Untitled Task'),
					description: typeof args.description === 'string' ? args.description : null,
					type_key: String(args.type_key || 'task.general'),
					state_key: stateKey,
					created_by: actorId,
					props: mergedProps
				};
				const { data, error } = await supabase
					.from('onto_tasks')
					.insert(payload)
					.select('id, title')
					.single();
				if (error) throw error;
				return {
					name: tool.name,
					ok: true,
					result: data,
					artifacts: { created_tasks: [data?.id] }
				};
			}
			case 'update_onto_task': {
				const taskId = String(args.task_id || '');
				if (!taskId) {
					return { name: tool.name, ok: false, error: 'task_id is required' };
				}
				const { data: task } = await supabase
					.from('onto_tasks')
					.select('project_id')
					.eq('id', taskId)
					.single();
				if (task?.project_id && !allowedProjects.has(task.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized project' };
				}
				const updatePayload: Record<string, unknown> = {};
				if (args.title) updatePayload.title = args.title;
				if (args.description !== undefined) updatePayload.description = args.description;
				const stateKey = asTaskState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (args.type_key) updatePayload.type_key = args.type_key;
				if (args.props && isJsonObject(args.props)) updatePayload.props = args.props;
				updatePayload.updated_at = new Date().toISOString();

				const { data, error } = await supabase
					.from('onto_tasks')
					.update(updatePayload)
					.eq('id', taskId)
					.select('id, title')
					.single();
				if (error) throw error;
				return {
					name: tool.name,
					ok: true,
					result: data,
					artifacts: { updated_tasks: [data?.id] }
				};
			}
			default:
				return { name: tool.name, ok: false, error: 'Unsupported tool' };
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Tool execution failed';
		return { name: tool.name, ok: false, error: message };
	}
}

async function executeToolCalls(params: {
	supabase: TypedSupabaseClient;
	actorId: string;
	toolCalls: ToolCall[];
	projectId?: string;
	workspaceDocumentId?: string;
	runId?: string;
	allowedProjects: Set<string>;
}): Promise<{
	results: Array<{ name: string; ok: boolean; result?: Json; error?: string }>;
	artifacts: Record<string, string[]>;
}> {
	const { supabase, actorId, toolCalls, projectId, workspaceDocumentId, runId, allowedProjects } =
		params;
	const limited = toolCalls.slice(0, MAX_TOOL_CALLS_PER_ITERATION);
	const artifacts: Record<string, string[]> = {};
	const results = [];

	for (const tool of limited) {
		const result = await executeToolCall({
			supabase,
			actorId,
			tool,
			projectId,
			workspaceDocumentId,
			runId,
			allowedProjects
		});
		results.push(result);

		if (result.artifacts) {
			for (const [key, value] of Object.entries(result.artifacts)) {
				if (!artifacts[key]) artifacts[key] = [];
				artifacts[key].push(...value);
			}
		}
	}

	return { results, artifacts };
}

async function runExecutorTask(params: {
	supabase: TypedSupabaseClient;
	llm: SmartLLMService;
	run: Database['public']['Tables']['homework_runs']['Row'];
	userId: string;
	projectId: string;
	workspaceDocumentId: string;
	actorId: string;
	task: { title: string; objective: string; tool_hints?: string[] };
	iteration: number;
	onUsage?: (event: UsageEvent) => Promise<void> | void;
	allowedProjects: Set<string>;
	execScratchpadId: string;
	workspaceId: string;
}): Promise<{
	title: string;
	results: Array<{ name: string; ok: boolean; result?: Json; error?: string }>;
	artifacts: Record<string, string[]>;
}> {
	const { llm, task, iteration, onUsage, supabase, actorId, projectId, workspaceDocumentId } =
		params;

	const toolGuide = AVAILABLE_TOOLS.map((tool) => {
		const description = TOOL_GUIDE[tool];
		return description ? `- ${tool}: ${description}` : `- ${tool}`;
	}).join('\n');

	const systemPrompt = `You are an Executor Agent for BuildOS.\n\nReturn ONLY valid JSON with this schema:\n{\n  \"tool_calls\": [{ \"name\": string, \"args\": object, \"purpose\": string }]\n}\n\nAvailable tools:\n${toolGuide}\n\nRules:\n- Use only available tools.\n- Limit tool_calls to ${MAX_EXECUTOR_TOOL_CALLS}.\n- If creating documents, prefer parent_document_id = workspace_document_id unless a more specific parent is known.`;

	const hints = task.tool_hints?.length ? `Tool hints: ${task.tool_hints.join(', ')}` : '';
	const userPrompt = `Task: ${task.title}\nObjective: ${task.objective}\n${hints}\nWorkspace:\n- project_id: ${projectId}\n- workspace_document_id: ${workspaceDocumentId}\nIteration: ${iteration}\nRespond with JSON only.`;

	const executorOutput = await llm.getJSONResponse<{ tool_calls?: ToolCall[] }>({
		systemPrompt,
		userPrompt,
		userId: params.userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 1 },
		operationType: 'other',
		chatSessionId: params.run.chat_session_id ?? undefined,
		// Note: projectId is an onto_project ID, not a main project ID, so don't pass it
		metadata: {
			homework_run_id: params.run.id,
			iteration,
			executor: task.title,
			onto_project_id: projectId
		},
		onUsage
	});

	const toolCalls = (executorOutput.tool_calls ?? []).slice(0, MAX_EXECUTOR_TOOL_CALLS);
	const executed = await executeToolCalls({
		supabase,
		actorId,
		toolCalls,
		projectId,
		workspaceDocumentId,
		runId: params.run.id,
		allowedProjects: params.allowedProjects
	});

	// Log into executor scratchpad
	if (params.execScratchpadId) {
		const entryLines = toolCalls.map((tc: ToolCall, idx: number) => {
			const r = executed.results[idx];
			const status = r?.ok ? 'ok' : 'error';
			return `- ${tc.name} (${status})`;
		});
		const timestamp = new Date().toISOString();
		const { data: existing } = await supabase
			.from('onto_documents')
			.select('content')
			.eq('id', params.execScratchpadId)
			.single();
		const prior = existing?.content ?? '';
		await supabase
			.from('onto_documents')
			.update({
				content:
					`${prior}\n\n## Iteration ${iteration} — ${timestamp}\n${entryLines.join('\n')}\n\n` +
					`### Objective\n${task.objective}\n`,
				updated_at: timestamp
			})
			.eq('id', params.execScratchpadId);
	}

	return { title: task.title, results: executed.results, artifacts: executed.artifacts };
}

export async function runHomeworkIteration(params: {
	supabase: TypedSupabaseClient;
	llm: SmartLLMService;
	run: Database['public']['Tables']['homework_runs']['Row'];
	userId: string;
	iteration: number;
	onUsage?: (event: UsageEvent) => Promise<void> | void;
}): Promise<HomeworkIterationResult> {
	const { supabase, llm, run, userId, iteration, onUsage } = params;
	const actorId = await ensureActorId(supabase, userId);
	const projectId = await ensureWorkspaceProject(supabase, userId, actorId, run);
	const { workspaceId, scratchpadId } = await ensureWorkspaceDocs({
		supabase,
		actorId,
		projectId,
		run
	});
	const allowedProjects = await getAccessibleProjectIds(supabase, actorId, run, projectId);
	const lastIteration = await fetchLastIterationSummary(supabase, run.id, iteration);
	const persistedPlan = getPlanFromMetrics(run);

	await supabase
		.from('homework_runs')
		.update({ workspace_document_id: workspaceId, workspace_project_id: projectId })
		.eq('id', run.id);

	const { data: scratchpad } = await supabase
		.from('onto_documents')
		.select('content')
		.eq('id', scratchpadId)
		.single();

	const scratchpadContent = scratchpad?.content ?? '';

	const { data: userResponses } = await supabase
		.from('homework_run_events')
		.select('event')
		.eq('run_id', run.id)
		.contains('event', { type: 'run_user_response' })
		.order('created_at', { ascending: false })
		.limit(3);
	const userAnswerLines =
		userResponses
			?.map((row) => {
				const ans = (row.event as any)?.answers;
				return typeof ans === 'string' ? ans : JSON.stringify(ans);
			})
			.filter(Boolean) || [];
	const userAnswersText = userAnswerLines.length
		? `User answers (latest first):\n- ${userAnswerLines.join('\n- ')}\n`
		: 'No new user answers.';

	const toolGuide = AVAILABLE_TOOLS.map((tool) => {
		const description = TOOL_GUIDE[tool];
		return description ? `- ${tool}: ${description}` : `- ${tool}`;
	}).join('\n');

	const systemPrompt = `You are the Homework Planner for BuildOS.\n\nReturn ONLY valid JSON with this schema:\n{\n  \"status\": {\n    \"exit_signal\": boolean,\n    \"needs_user_input\": boolean,\n    \"blocking_questions\": string[],\n    \"progress_summary\": string,\n    \"remaining_work\": string[],\n    \"completion_evidence\": string[],\n    \"next_action_hint\": \"replan\" | \"execute\" | \"ask_user\" | \"stop\",\n    \"confidence\": \"low\" | \"medium\" | \"high\"\n  },\n  \"tool_calls\": [{ \"name\": string, \"args\": object, \"purpose\": string }],\n  \"executor_tasks\": [{ \"title\": string, \"objective\": string, \"tool_hints\": string[] }],\n  \"plan\": { \"steps\": [{ \"id\": string, \"title\": string, \"status\": \"pending\"|\"doing\"|\"blocked\"|\"done\", \"owner\": \"planner\"|\"executor\" }] }\n}\n\nAvailable tools:\n${toolGuide}\n\nRules:\n- Use only available tools.\n- If work remains, exit_signal must be false.\n- If you need user input, set needs_user_input true and list blocking_questions.\n- Be concise, but specific about remaining work.\n- Limit tool_calls to the most critical actions.\n- If creating documents, prefer parent_document_id = workspace_document_id unless a more specific parent is known.\n\nPlan Steps Rules:\n- Return plan.steps as an array of {id, title, status, owner}.\n- Keep step IDs stable across iterations (reuse IDs from previous plan).\n- Update status: pending -> doing -> done (or blocked if stuck).\n- Set owner=executor when delegating a step to an executor task.\n- Do not recreate identical steps; update their status instead.\n- Add new steps only when genuinely new work is discovered.`;

	const lastIterationBlock = lastIteration
		? `\nPrevious iteration (#${lastIteration.iteration}):\n- Summary: ${lastIteration.summary ?? 'n/a'}\n- Tools: ${lastIteration.tool_calls?.join(', ') ?? 'n/a'}\n- Executors: ${lastIteration.executor_tasks?.join(', ') ?? 'n/a'}\n- Progress: ${lastIteration.progress ? 'yes' : 'no'}\n`
		: '\nPrevious iteration: none (first run)\n';

	const planSource =
		lastIteration && (lastIteration.plan_remaining?.length || lastIteration.plan_steps?.length)
			? lastIteration
			: persistedPlan;

	const planBlockParts = [];
	if (planSource?.plan_remaining?.length) {
		planBlockParts.push(
			`Current plan (remaining):\n${planSource.plan_remaining.map((r: string) => `- ${r}`).join('\n')}\n`
		);
	}
	if (planSource?.plan_steps?.length) {
		planBlockParts.push(
			`Plan steps (update these, keep IDs stable):\n${planSource.plan_steps
				.map(
					(s: any) =>
						`- [${s.status ?? 'pending'}] ${s.title} (id: ${s.id ?? 'n/a'}, owner: ${s.owner ?? 'planner'})`
				)
				.join('\n')}\n`
		);
	}
	const planBlock = planBlockParts.length ? `\n${planBlockParts.join('\n')}` : '';

	const execScratchpads = await fetchExecutorScratchpadSummaries(supabase, run.id, 6);
	const execSummaries = execScratchpads
		.map(
			(e) =>
				`- ${e.title} (branch ${e.branch_id ?? 'n/a'}, updated ${e.updated_at ?? 'n/a'})\n  ${e.snippet ?? ''}`
		)
		.join('\n');

	const userPrompt = `Objective:\n${run.objective}\n\nWorkspace:\n- project_id: ${projectId}\n- workspace_document_id: ${workspaceId}\n- scratchpad_document_id: ${scratchpadId}\n\n${lastIterationBlock}${planBlock}\nExecutor scratchpads:\n${execSummaries || '- none'}\n\nScratchpad (latest notes):\n${scratchpadContent.slice(-6000)}\n\n${userAnswersText}\n\nRules:\n- Avoid repeating the exact same tool calls as the previous iteration unless absolutely necessary.\n- Prefer to advance remaining work or replan if stuck.\n- Use executor scratchpads for parallel tasks; link new docs under the workspace.\n- Update the plan/remaining work based on new findings.\n\nIteration: ${iteration}\nRespond with JSON only.`;

	const plannerRaw = await llm.getJSONResponse<PlannerOutput>({
		systemPrompt,
		userPrompt,
		userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'other',
		chatSessionId: run.chat_session_id ?? undefined,
		// Note: projectId is an onto_project ID, not a main project ID, so don't pass it
		metadata: { homework_run_id: run.id, iteration, onto_project_id: projectId },
		onUsage
	});

	const status = normalizeStatus(plannerRaw?.status);
	const toolCalls = Array.isArray(plannerRaw?.tool_calls) ? plannerRaw.tool_calls : [];
	const executorTasks = Array.isArray(plannerRaw?.executor_tasks)
		? plannerRaw.executor_tasks.slice(0, MAX_EXECUTOR_TASKS)
		: [];

	let toolResults: Array<{ name: string; ok: boolean; result?: Json; error?: string }> = [];
	let artifacts: Record<string, string[]> = {};

	if (toolCalls.length) {
		const executed = await executeToolCalls({
			supabase,
			actorId,
			toolCalls,
			projectId,
			workspaceDocumentId: workspaceId,
			runId: run.id,
			allowedProjects
		});
		toolResults = executed.results;
		artifacts = { ...artifacts, ...executed.artifacts };

		// Repair pass for failed tools (argument fixes)
		const failedForRepair = toolCalls
			.map((tc, idx) => ({ tc, res: executed.results[idx] }))
			.filter(({ res }) => res && res.ok === false && res.error)
			.map(({ tc, res }) => ({
				name: tc.name,
				args: tc.args,
				error: res?.error || 'unknown'
			}));

		if (failedForRepair.length) {
			const repairedCalls = await repairFailedTools({
				llm,
				run,
				failed: failedForRepair,
				iteration,
				userId,
				projectId,
				workspaceDocumentId: workspaceId,
				onUsage
			});

			if (repairedCalls.length) {
				const repairedExecution = await executeToolCalls({
					supabase,
					actorId,
					toolCalls: repairedCalls,
					projectId,
					workspaceDocumentId: workspaceId,
					runId: run.id,
					allowedProjects
				});
				toolResults.push(...repairedExecution.results);
				for (const [key, value] of Object.entries(repairedExecution.artifacts)) {
					if (!artifacts[key]) artifacts[key] = [];
					artifacts[key].push(...value);
				}
			}
		}
	}

	const executorResults = [];
	if (executorTasks.length) {
		const tasks = await Promise.all(
			executorTasks.map(async (task, idx) => {
				const execScratchpadId = await ensureExecutorScratchpad({
					supabase,
					projectId,
					runId: run.id,
					mainScratchpadId: scratchpadId,
					taskTitle: task.title,
					branchId: `task-${iteration}-${idx + 1}`,
					actorId
				});
				return runExecutorTask({
					supabase,
					llm,
					run,
					userId,
					projectId,
					workspaceDocumentId: execScratchpadId,
					actorId,
					task,
					iteration,
					onUsage,
					allowedProjects,
					execScratchpadId,
					workspaceId
				});
			})
		);
		for (const result of tasks) {
			executorResults.push(result);
			for (const [key, value] of Object.entries(result.artifacts)) {
				if (!artifacts[key]) artifacts[key] = [];
				artifacts[key].push(...value);
			}
		}
	}

	const entry =
		formatScratchpadEntry(iteration, status) +
		formatToolSection(toolCalls, toolResults) +
		`\n### Tool Results\n${summarizeToolResults(toolCalls, toolResults)}\n` +
		(executorResults.length
			? `\n### Executor Tasks\n${summarizeExecutorResults(executorResults)}\n`
			: '');

	await supabase
		.from('onto_documents')
		.update({
			content: (scratchpadContent ?? '') + entry,
			updated_at: new Date().toISOString()
		})
		.eq('id', scratchpadId);

	const progressMade =
		toolResults.some((r) => r.ok) ||
		executorResults.some((r) => r.results.some((inner) => inner.ok)) ||
		(status.completion_evidence?.length ?? 0) > 0 ||
		(Object.keys(artifacts).length > 0 &&
			Object.values(artifacts).some((arr) => Array.isArray(arr) && arr.length > 0));

	// Build plan steps: prefer planner-authored steps, fallback to remaining_work-derived steps
	const plannerSteps = plannerRaw?.plan?.steps;
	let finalSteps: Array<{
		id: string;
		title: string;
		status: string;
		owner: string;
		iteration: number;
	}>;

	if (Array.isArray(plannerSteps) && plannerSteps.length > 0) {
		// Use planner-authored steps with defaults and iteration tracking
		finalSteps = plannerSteps.map((step, idx) => ({
			id: step.id ?? `step-${iteration}-${idx + 1}`,
			title: step.title,
			status: step.status ?? 'pending',
			owner: step.owner ?? 'planner',
			iteration // Track which iteration last touched this step
		}));
	} else {
		// Fallback: generate steps from remaining_work
		finalSteps = (status.remaining_work || []).map((item, idx) => ({
			id: `step-${iteration}-${idx + 1}`,
			title: item,
			status: 'pending',
			owner: 'planner',
			iteration
		}));
	}

	return {
		status,
		summary: status.progress_summary || 'Iteration completed.',
		artifacts: {
			tool_results: toolResults,
			executor_results: executorResults,
			artifacts
		},
		progressMade,
		plan: {
			remaining_work: status.remaining_work,
			completion_evidence: status.completion_evidence,
			next_action_hint: status.next_action_hint,
			iteration,
			steps: finalSteps
		}
	};
}
