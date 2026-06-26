// apps/web/src/routes/api/onto/projects/[id]/suggestions/[suggestion_id]/chat-session/+server.ts
//
// POST /api/onto/projects/[id]/suggestions/[suggestion_id]/chat-session
// Creates or reuses a project-scoped chat session seeded with a project-review
// suggestion so the reviewer can discuss evidence, tradeoffs, and alternatives.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import {
	buildProjectSuggestionProposalContext,
	type ProposalContextLoopRun
} from '@buildos/shared-agent-ops/proposal-context';
import type { Json } from '@buildos/shared-types';

type SuggestionRow = {
	id: string;
	run_id?: string | null;
	project_id: string;
	kind: string;
	risk_tier: number;
	title: string;
	rationale?: string | null;
	why_now?: string | null;
	confidence?: number | null;
	evidence_refs?: unknown;
	preview?: unknown;
	operations?: unknown;
	status?: string | null;
	reversible?: boolean | null;
	freshness_state?: string | null;
	created_at?: string | null;
	chat_session_id?: string | null;
};

const SUGGESTION_SELECT = [
	'id',
	'run_id',
	'project_id',
	'kind',
	'risk_tier',
	'title',
	'rationale',
	'why_now',
	'confidence',
	'evidence_refs',
	'preview',
	'operations',
	'status',
	'reversible',
	'freshness_state',
	'created_at',
	'chat_session_id'
].join(', ');

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compactTitle(value: string | null | undefined): string {
	const title = value?.trim() || 'Project review item';
	return title.length <= 80 ? title : `${title.slice(0, 77)}...`;
}

async function cleanupCreatedDiscussionSession(
	supabase: { from: (table: string) => any },
	params: { sessionId: string; userId: string; projectId: string; reason: string }
): Promise<void> {
	const { sessionId, userId, projectId, reason } = params;

	const { error: messageDeleteError } = await supabase
		.from('chat_messages')
		.delete()
		.eq('session_id', sessionId)
		.eq('user_id', userId);

	if (messageDeleteError) {
		console.warn('Failed to clean up project suggestion discussion seed messages:', {
			sessionId,
			reason,
			error: messageDeleteError
		});
	}

	const { error: linkDeleteError } = await supabase
		.from('chat_sessions_projects')
		.delete()
		.eq('chat_session_id', sessionId)
		.eq('project_id', projectId);

	if (linkDeleteError) {
		console.warn('Failed to clean up project suggestion discussion project link:', {
			sessionId,
			projectId,
			reason,
			error: linkDeleteError
		});
	}

	const { error: sessionDeleteError } = await supabase
		.from('chat_sessions')
		.delete()
		.eq('id', sessionId)
		.eq('user_id', userId);

	if (sessionDeleteError) {
		console.warn('Failed to clean up project suggestion discussion session:', {
			sessionId,
			reason,
			error: sessionDeleteError
		});
	}
}

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	const suggestionId = readString(params.suggestion_id);
	if (!suggestionId) return ApiResponse.badRequest('Project suggestion id is required');

	const supabase = locals.supabase;
	const { data: suggestion, error: suggestionError } = await (supabase as any)
		.from('project_suggestions')
		.select(SUGGESTION_SELECT)
		.eq('id', suggestionId)
		.eq('project_id', access.projectId)
		.maybeSingle();

	if (suggestionError) {
		return ApiResponse.databaseError(suggestionError);
	}
	if (!suggestion) {
		return ApiResponse.notFound('Project suggestion');
	}

	const suggestionRow = suggestion as SuggestionRow;
	const existingChatSessionId = readString(suggestionRow.chat_session_id);
	if (existingChatSessionId) {
		const { data: existingSession, error: existingSessionError } = await supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', existingChatSessionId)
			.eq('user_id', access.userId)
			.maybeSingle();

		if (!existingSessionError && existingSession) {
			return ApiResponse.success({
				created: false,
				session: existingSession,
				chat_session_id: existingSession.id,
				suggestion: suggestionRow
			});
		}
	}

	const { data: project } = await supabase
		.from('onto_projects')
		.select('id, name')
		.eq('id', access.projectId)
		.maybeSingle();
	const projectName = readString(project?.name) ?? 'Project';

	let loopRun: ProposalContextLoopRun | null = null;
	if (suggestionRow.run_id) {
		const { data: loopRunRow } = await (supabase as any)
			.from('project_loop_runs')
			.select('id, trigger_reason, summary, created_at, finished_at')
			.eq('id', suggestionRow.run_id)
			.eq('project_id', access.projectId)
			.maybeSingle();
		loopRun = loopRunRow ?? null;
	}

	const proposalContext = buildProjectSuggestionProposalContext({
		suggestion: suggestionRow,
		projectName,
		loopRun: loopRun ?? null
	});
	const now = new Date().toISOString();
	const sessionMetadata: Record<string, unknown> = {
		source: 'project_suggestion',
		source_id: suggestionRow.id,
		source_kind: 'project_review_item',
		project_id: access.projectId,
		project_name: projectName,
		suggestion_id: suggestionRow.id,
		suggestion_kind: suggestionRow.kind,
		suggestion_run_id: suggestionRow.run_id ?? null,
		risk_tier: suggestionRow.risk_tier,
		focus: {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: access.projectId,
			projectName
		},
		proposal_context: {
			llm_text: proposalContext.llmText,
			operation_summaries: proposalContext.operationSummaries,
			evidence_summaries: proposalContext.evidenceSummaries
		}
	};

	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.insert({
			user_id: access.userId,
			context_type: 'project',
			entity_id: access.projectId,
			status: 'active',
			chat_type: 'project_suggestion',
			title: `Discuss: ${compactTitle(suggestionRow.title)}`,
			summary: suggestionRow.rationale ?? suggestionRow.why_now ?? null,
			message_count: 1,
			last_message_at: now,
			agent_metadata: sessionMetadata as Json
		})
		.select('*')
		.single();

	if (sessionError || !session) {
		return ApiResponse.databaseError(
			sessionError ?? new Error('Failed to create project suggestion discussion')
		);
	}

	const { error: projectLinkError } = await (supabase as any)
		.from('chat_sessions_projects')
		.insert({
			chat_session_id: session.id,
			project_id: access.projectId,
			linked_at: now
		});

	if (projectLinkError) {
		await cleanupCreatedDiscussionSession(supabase as any, {
			sessionId: session.id,
			userId: access.userId,
			projectId: access.projectId,
			reason: 'project_link_insert_failed'
		});
		return ApiResponse.databaseError(projectLinkError);
	}

	const { error: messageError } = await supabase.from('chat_messages').insert({
		session_id: session.id,
		user_id: access.userId,
		role: 'assistant',
		content: proposalContext.humanText,
		message_type: 'text',
		created_at: now,
		metadata: {
			source: 'project_suggestion',
			suggestion_id: suggestionRow.id,
			project_id: access.projectId,
			seed_message: true,
			proposal_context: {
				llm_text: proposalContext.llmText
			}
		} as Json
	});

	if (messageError) {
		await cleanupCreatedDiscussionSession(supabase as any, {
			sessionId: session.id,
			userId: access.userId,
			projectId: access.projectId,
			reason: 'seed_message_insert_failed'
		});
		return ApiResponse.databaseError(messageError);
	}

	const { data: updatedSuggestion, error: updateError } = await (supabase as any)
		.from('project_suggestions')
		.update({
			chat_session_id: session.id,
			updated_at: now
		})
		.eq('id', suggestionRow.id)
		.eq('project_id', access.projectId)
		.select(SUGGESTION_SELECT)
		.single();

	if (updateError || !updatedSuggestion) {
		await cleanupCreatedDiscussionSession(supabase as any, {
			sessionId: session.id,
			userId: access.userId,
			projectId: access.projectId,
			reason: 'suggestion_link_update_failed'
		});
		return ApiResponse.databaseError(
			updateError ?? new Error('Failed to link project suggestion discussion')
		);
	}

	return ApiResponse.created({
		created: true,
		session,
		chat_session_id: session.id,
		suggestion: updatedSuggestion
	});
};
