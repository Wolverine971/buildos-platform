// apps/web/src/routes/invites/[token]/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createHash } from 'crypto';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const token = params.token?.trim();
	if (!token) {
		return { status: 'error', message: 'Invite token missing' };
	}

	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(303, `/auth/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	if (!user.email) {
		return { status: 'error', message: 'Your account is missing an email address' };
	}

	const supabase = locals.supabase;
	const actorId = await ensureActorId(supabase, user.id);
	const tokenHash = createHash('sha256').update(token).digest('hex');

	const { data, error } = await supabase.rpc('accept_project_invite', {
		p_token_hash: tokenHash,
		p_actor_id: actorId,
		p_user_email: user.email
	});

	if (error) {
		const errorLogger = ErrorLoggerService.getInstance(supabase);
		await errorLogger.logError(error, {
			userId: user.id,
			endpoint: '/invites/:token',
			httpMethod: 'GET',
			operationType: 'project_invite_accept',
			metadata: {
				source: 'invite_accept_page',
				actorId,
				tokenHashPrefix: tokenHash.slice(0, 8)
			}
		});
		return { status: 'error', message: error.message };
	}

	const result = Array.isArray(data) ? data[0] : data;
	if (!result?.project_id) {
		const errorLogger = ErrorLoggerService.getInstance(supabase);
		await errorLogger.logError(new Error('Invite accepted without project_id'), {
			userId: user.id,
			endpoint: '/invites/:token',
			httpMethod: 'GET',
			operationType: 'project_invite_accept',
			metadata: {
				source: 'invite_accept_page',
				actorId,
				tokenHashPrefix: tokenHash.slice(0, 8)
			}
		});
		return { status: 'error', message: 'Invite accepted, but project could not be resolved' };
	}

	throw redirect(
		303,
		`/projects/${result.project_id}?message=${encodeURIComponent('Invite accepted')}`
	);
};
