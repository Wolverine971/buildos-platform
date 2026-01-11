// apps/web/src/routes/invites/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(303, `/auth/login?redirect=${encodeURIComponent(url.pathname)}`);
	}

	const supabase = locals.supabase;
	const { data, error } = await supabase.rpc('list_pending_project_invites');

	if (error) {
		const errorLogger = ErrorLoggerService.getInstance(supabase);
		await errorLogger.logError(error, {
			userId: user.id,
			endpoint: '/invites',
			httpMethod: 'GET',
			operationType: 'project_invite_pending_list',
			metadata: {
				source: 'invite_list_page'
			}
		});

		return {
			status: 'error',
			message: error.message,
			invites: []
		};
	}

	return {
		status: 'ready',
		invites: data ?? []
	};
};
