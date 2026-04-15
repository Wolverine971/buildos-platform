// apps/web/src/routes/api/admin/chat/lite-shadow-comparison/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	buildLiteShadowComparison,
	formatLiteShadowComparisonReport,
	type LiteShadowPromptSnapshotInput
} from '$lib/services/agentic-chat-lite/shadow';

type LiteShadowComparisonRequest = {
	prompt_snapshot_id?: string | null;
	turn_run_id?: string | null;
	include_report?: boolean | null;
};

const PROMPT_SNAPSHOT_SELECT = `
	id,
	turn_run_id,
	snapshot_version,
	prompt_variant,
	system_prompt,
	model_messages,
	tool_definitions,
	request_payload,
	prompt_sections,
	context_payload,
	created_at
`;

function trimOptionalString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

async function loadPromptSnapshot(params: {
	supabase: any;
	promptSnapshotId: string | null;
	turnRunId: string | null;
}): Promise<LiteShadowPromptSnapshotInput | null> {
	const query = params.supabase.from('chat_prompt_snapshots').select(PROMPT_SNAPSHOT_SELECT);
	const scopedQuery = params.promptSnapshotId
		? query.eq('id', params.promptSnapshotId)
		: query.eq('turn_run_id', params.turnRunId);
	const { data, error } = await scopedQuery.maybeSingle();
	if (error) throw error;
	return (data as LiteShadowPromptSnapshotInput | null) ?? null;
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	const body = (await request.json().catch(() => null)) as LiteShadowComparisonRequest | null;
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const promptSnapshotId = trimOptionalString(body.prompt_snapshot_id);
	const turnRunId = trimOptionalString(body.turn_run_id);
	if (!promptSnapshotId && !turnRunId) {
		return ApiResponse.badRequest('prompt_snapshot_id or turn_run_id is required');
	}

	try {
		const promptSnapshot = await loadPromptSnapshot({
			supabase,
			promptSnapshotId,
			turnRunId
		});
		if (!promptSnapshot) {
			return ApiResponse.notFound('Prompt snapshot');
		}

		const comparison = buildLiteShadowComparison({ promptSnapshot });
		return ApiResponse.success({
			comparison,
			report:
				body.include_report === true ? formatLiteShadowComparisonReport(comparison) : null
		});
	} catch (error) {
		console.error('Lite shadow comparison failed', error);
		return ApiResponse.internalError(error, 'Failed to build lite shadow comparison');
	}
};
