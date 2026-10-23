// apps/web/src/routes/api/workspace/graduate/+server.ts
// POST: start a project from loose items the person chose (or a suggestion they accepted):
// create it, then move the items in one undoable Organize batch.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	graduateItems,
	loadOwnSuggestion,
	suggestionProposal
} from '$lib/server/workspace/workspace.service';
import { graduateRequest, workspaceFailure } from '$lib/server/workspace/workspace-http';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const parsed = await parseJsonRequest(request, graduateRequest);
	if (!parsed.ok) return parsed.response;
	const admin = createAdminSupabaseClient();
	try {
		let typeKey: string | null = null;
		let description = parsed.data.description ?? null;
		if (parsed.data.suggestion_id) {
			const row = await loadOwnSuggestion(admin, user.id, parsed.data.suggestion_id);
			if (row.kind !== 'graduate' || row.status !== 'open')
				return ApiResponse.conflict('That suggestion was already answered.');
			const proposal = suggestionProposal(row);
			typeKey = proposal.type_key;
			description ??= proposal.description;
		}
		const receipt = await graduateItems({
			session: locals.supabase,
			admin,
			userId: user.id,
			name: parsed.data.name,
			description,
			typeKey,
			items: parsed.data.items,
			suggestionId: parsed.data.suggestion_id ?? null
		});
		return ApiResponse.created(receipt);
	} catch (error) {
		return workspaceFailure(error);
	}
};
