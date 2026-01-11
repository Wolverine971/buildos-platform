// apps/web/src/routes/invites/[token]/+page.server.ts
import type { PageServerLoad } from './$types';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createHash } from 'crypto';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const token = params.token?.trim();
	if (!token) {
		return { status: 'error', message: 'Invite token missing' };
	}

	const supabase = locals.supabase;
	const tokenHash = createHash('sha256').update(token).digest('hex');

	const { data, error } = await supabase.rpc('get_project_invite_preview', {
		p_token_hash: tokenHash
	});

	if (error) {
		const errorLogger = ErrorLoggerService.getInstance(supabase);
		await errorLogger.logError(error, {
			endpoint: '/invites/:token',
			httpMethod: 'GET',
			operationType: 'project_invite_preview',
			metadata: {
				source: 'invite_preview_page',
				tokenHashPrefix: tokenHash.slice(0, 8)
			}
		});
		return { status: 'error', message: error.message };
	}

	const result = Array.isArray(data) ? data[0] : data;
	if (!result?.invite_id) {
		return { status: 'error', message: 'Invite could not be resolved' };
	}

	const { user } = await locals.safeGetSession();
	const userEmail = user?.email ?? null;
	const emailMatches =
		!!userEmail &&
		typeof result.invitee_email === 'string' &&
		result.invitee_email.toLowerCase() === userEmail.toLowerCase();

	if (!user) {
		return {
			status: 'unauthenticated',
			invite: result,
			redirectTo: url.pathname
		};
	}

	if (!user.email) {
		return { status: 'error', message: 'Your account is missing an email address' };
	}

	return {
		status: 'ready',
		invite: result,
		redirectTo: url.pathname,
		userEmail,
		emailMatches
	};
};
