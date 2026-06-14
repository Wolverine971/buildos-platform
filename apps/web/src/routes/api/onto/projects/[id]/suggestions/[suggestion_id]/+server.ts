// apps/web/src/routes/api/onto/projects/[id]/suggestions/[suggestion_id]/+server.ts
//
// POST /api/onto/projects/[id]/suggestions/[suggestion_id]
//   body: { action: 'approve' | 'dismiss' }
//
// approve  -> replay the suggestion's operations through ChatToolExecutor
//             (the same write path the agentic chat uses) and mark applied/failed
// dismiss  -> mark rejected
//
// Gated by PROJECT_LOOPS_ENABLED.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor';
import type {
	Json,
	LoopOperation,
	ProjectSuggestion,
	ProjectSuggestionResult
} from '@buildos/shared-types';
import type { ChatToolCall } from '@buildos/shared-types';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	let body: { action?: string };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON body');
	}

	const action = body.action;
	if (action !== 'approve' && action !== 'dismiss') {
		return ApiResponse.badRequest("action must be 'approve' or 'dismiss'");
	}

	const { supabase } = locals;

	const { data: suggestionRow, error: loadError } = await supabase
		.from('project_suggestions')
		.select('*')
		.eq('id', params.suggestion_id)
		.eq('project_id', access.projectId)
		.maybeSingle();

	if (loadError) return ApiResponse.databaseError(loadError);
	if (!suggestionRow) return ApiResponse.notFound('Suggestion');

	const suggestion = suggestionRow as unknown as ProjectSuggestion;
	if (suggestion.status !== 'pending') {
		return ApiResponse.badRequest(`Suggestion already ${suggestion.status}`);
	}

	const nowIso = new Date().toISOString();

	if (action === 'dismiss') {
		const { data: updated, error: updateError } = await supabase
			.from('project_suggestions')
			.update({ status: 'rejected', decided_at: nowIso })
			.eq('id', suggestion.id)
			.select('*')
			.single();
		if (updateError) return ApiResponse.databaseError(updateError);
		return ApiResponse.success({ suggestion: updated });
	}

	// approve -> replay operations
	const executor = new ChatToolExecutor(supabase, access.userId);
	const operations: LoopOperation[] = Array.isArray(suggestion.operations)
		? suggestion.operations
		: [];

	const errors: Array<{ tool: string; error: string }> = [];
	let appliedCount = 0;

	for (const op of operations) {
		const toolCall: ChatToolCall = {
			id: globalThis.crypto.randomUUID(),
			type: 'function',
			function: { name: op.tool, arguments: JSON.stringify(op.args ?? {}) }
		};
		try {
			const result = await executor.execute(toolCall);
			if (result.success) {
				appliedCount += 1;
			} else {
				errors.push({ tool: op.tool, error: result.error ?? 'Tool execution failed' });
			}
		} catch (error) {
			errors.push({
				tool: op.tool,
				error: error instanceof Error ? error.message : 'Tool execution threw'
			});
		}
	}

	const result: ProjectSuggestionResult = {
		ok: errors.length === 0,
		applied_operations: appliedCount,
		...(errors.length ? { errors } : {})
	};

	const { data: updated, error: updateError } = await supabase
		.from('project_suggestions')
		.update({
			status: result.ok ? 'applied' : 'failed',
			decided_at: nowIso,
			applied_at: result.ok ? nowIso : null,
			result: result as unknown as Json
		})
		.eq('id', suggestion.id)
		.select('*')
		.single();

	if (updateError) return ApiResponse.databaseError(updateError);

	return ApiResponse.success({ suggestion: updated, result });
};
