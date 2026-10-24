// apps/web/src/routes/invites/[token]/+page.server.ts
import type { PageServerLoad } from './$types';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createHash } from 'crypto';

type InvitePreviewResult = {
	invite_id: string;
	project_id: string | null;
	project_name: string | null;
	role_key: string | null;
	agent_access?: string | null;
	access: string | null;
	invitee_email: string | null;
	invited_by_actor_id: string | null;
	invited_by_name: string | null;
	invited_by_email: string | null;
	status: string | null;
	expires_at: string | null;
	created_at: string | null;
	declined_at?: string | null;
	recoverable_until?: string | null;
	can_accept?: boolean | null;
};

/**
 * "s•••@e•••.com": enough for someone to recognize their own address, not enough to
 * learn someone else's (an invite sent to an @handle keeps the email behind it private,
 * and anyone holding the link can open this page).
 */
function maskEmail(email: string | null | undefined): string | null {
	const [local, domain] = (email ?? '').trim().split('@');
	if (!local || !domain) return null;
	const labels = domain.split('.');
	const tld = labels.length > 1 ? labels.pop() : null;
	const host = labels.join('.');
	return `${local[0]}•••@${host ? `${host[0]}•••` : '•••'}${tld ? `.${tld}` : ''}`;
}

/** The preview RPC raises plain database messages; the invitee gets these instead. */
function inviteProblem(message: string | null | undefined): { title: string; message: string } {
	switch (message) {
		case 'Invite not found':
		case 'Invite token missing':
			return {
				title: 'This invite link doesn’t work',
				message:
					'It may have been replaced by a newer invite. Use the link in the latest email, or ask the person who invited you to send it again.'
			};
		case 'Invite is no longer valid':
			return {
				title: 'This project isn’t available anymore',
				message: 'The owner deleted it, so the invite no longer works.'
			};
		default:
			return {
				title: 'We couldn’t open this invite',
				message: 'Refresh the page to try again.'
			};
	}
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const token = params.token?.trim();
	if (!token) {
		return { status: 'error', ...inviteProblem('Invite token missing') };
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
		return { status: 'error', ...inviteProblem(error.message) };
	}

	const result = (Array.isArray(data) ? data[0] : data) as unknown as InvitePreviewResult | null;
	if (!result?.invite_id) {
		return { status: 'error', ...inviteProblem('Invite not found') };
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
		return {
			status: 'error',
			title: 'Your account has no email address',
			message:
				'Invites are matched by email. Add one to your account, then open this link again.'
		};
	}

	// Already in the project (an earlier invite, the invite link, or an approval)?
	let alreadyMember = false;
	if (result.project_id) {
		const { data: hasAccess } = await supabase.rpc('current_actor_has_project_member_access', {
			p_project_id: result.project_id,
			p_required_access: 'read'
		});
		alreadyMember = hasAccess === true;
	}

	return {
		status: 'ready',
		// The full address only goes to the person it was sent to.
		invite: emailMatches ? result : { ...result, invitee_email: null },
		inviteeEmailHint: emailMatches ? null : maskEmail(result.invitee_email),
		redirectTo: url.pathname,
		userEmail,
		emailMatches,
		alreadyMember
	};
};
