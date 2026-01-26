// apps/worker/src/workers/homework/engine/homeworkEngine.ts
import type { SupabaseClient } from '@supabase/supabase-js';
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
}

const WORKSPACE_PROJECT_TYPE = 'project.workspace.homework';
const WORKSPACE_DOC_TYPE = 'document.homework.workspace';
const SCRATCHPAD_DOC_TYPE = 'document.homework.scratchpad';
const DEFAULT_DOC_STATE = 'draft';

async function ensureActorId(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<string> {
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
	supabase: SupabaseClient<Database>,
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
	supabase: SupabaseClient<Database>,
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
	supabase: SupabaseClient<Database>;
	actorId: string;
	projectId: string;
	run: Database['public']['Tables']['homework_runs']['Row'];
}): Promise<{ workspaceId: string; scratchpadId: string }> {
	const { supabase, actorId, projectId, run } = params;

	if (run.workspace_document_id) {
		const { data: scratchpad } = await supabase
			.from('onto_documents')
			.select('id')
			.contains('props', { homework_run_id: run.id, doc_role: 'scratchpad' })
			.eq('project_id', projectId)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (scratchpad?.id) {
			return { workspaceId: run.workspace_document_id, scratchpadId: scratchpad.id };
		}
	}

	const { data: workspaceDoc, error: workspaceError } = await supabase
		.from('onto_documents')
		.insert({
			project_id: projectId,
			title: `Homework Workspace: ${run.objective.slice(0, 80)}`,
			type_key: WORKSPACE_DOC_TYPE,
			state_key: DEFAULT_DOC_STATE,
			created_by: actorId,
			props: {
				homework_run_id: run.id,
				doc_role: 'workspace',
				scope: run.scope
			}
		})
		.select('id')
		.single();

	if (workspaceError || !workspaceDoc?.id) {
		throw new Error(`Failed to create workspace document: ${workspaceError?.message ?? 'unknown'}`);
	}

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

	await supabase.from('onto_edges').insert({
		project_id: projectId,
		src_id: workspaceDoc.id,
		src_kind: 'document',
		dst_id: scratchpadDoc.id,
		dst_kind: 'document',
		rel: 'document_has_document',
		props: {
			homework_run_id: run.id
		}
	});

	return { workspaceId: workspaceDoc.id, scratchpadId: scratchpadDoc.id };
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

export async function runHomeworkIteration(params: {
	supabase: SupabaseClient<Database>;
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

	const systemPrompt = `You are the Homework Planner for BuildOS.\n\nReturn ONLY valid JSON with this schema:\n{\n  \"exit_signal\": boolean,\n  \"needs_user_input\": boolean,\n  \"blocking_questions\": string[],\n  \"progress_summary\": string,\n  \"remaining_work\": string[],\n  \"completion_evidence\": string[],\n  \"next_action_hint\": \"replan\" | \"execute\" | \"ask_user\" | \"stop\",\n  \"confidence\": \"low\" | \"medium\" | \"high\"\n}\n\nRules:\n- If work remains, exit_signal must be false.\n- If you need user input, set needs_user_input true and list blocking_questions.\n- Be concise, but specific about remaining work.`;

	const userPrompt = `Objective:\n${run.objective}\n\nScratchpad (latest notes):\n${scratchpadContent.slice(-6000)}\n\nIteration: ${iteration}\nRespond with JSON only.`;

	const status = await llm.getJSONResponse<HomeworkStatusBlock>({
		systemPrompt,
		userPrompt,
		userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'other',
		chatSessionId: run.chat_session_id ?? undefined,
		projectId,
		metadata: { homework_run_id: run.id, iteration },
		onUsage
	});

	const entry = formatScratchpadEntry(iteration, status);
	await supabase
		.from('onto_documents')
		.update({ content: (scratchpadContent ?? '') + entry, updated_at: new Date().toISOString() })
		.eq('id', scratchpadId);

	return {
		status,
		summary: status.progress_summary || 'Iteration completed.'
	};
}
