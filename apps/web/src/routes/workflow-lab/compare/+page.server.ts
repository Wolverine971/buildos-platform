// apps/web/src/routes/workflow-lab/compare/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireSpecialistWorkbenchUser } from '$lib/services/agentic-chat-v2/specialist-workbench-access.server';
import {
	AnswerComparisonStoreError,
	listAnswerComparisonLab,
	type AnswerComparisonClient
} from '$lib/services/agentic-chat-v2/answer-comparison.server';
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	const userId = await requireSpecialistWorkbenchUser(locals);
	setHeaders({ 'Cache-Control': 'private, no-store' });
	try {
		const client = createAdminSupabaseClient() as unknown as AnswerComparisonClient;
		return { lab: await listAnswerComparisonLab(client, userId) };
	} catch (err) {
		if (err instanceof AnswerComparisonStoreError) error(err.status, err.message);
		error(503, 'Comparison storage is unavailable. Please try again.');
	}
};
