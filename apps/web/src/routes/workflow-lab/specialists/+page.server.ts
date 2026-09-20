// apps/web/src/routes/workflow-lab/specialists/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireSpecialistWorkbenchUser } from '$lib/services/agentic-chat-v2/specialist-workbench-access.server';
import {
	listSpecialistWorkbench,
	type SpecialistWorkbenchClient,
	SpecialistWorkbenchStoreError
} from '$lib/services/agentic-chat-v2/specialist-workbench.server';
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	const userId = await requireSpecialistWorkbenchUser(locals);
	setHeaders({ 'Cache-Control': 'private, no-store' });
	try {
		const client = createAdminSupabaseClient() as unknown as SpecialistWorkbenchClient;
		return { workbench: await listSpecialistWorkbench(client, userId) };
	} catch (err) {
		if (err instanceof SpecialistWorkbenchStoreError) error(err.status, err.message);
		error(503, 'Specialist storage is unavailable. Please try again.');
	}
};
