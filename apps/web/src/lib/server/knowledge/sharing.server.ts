// apps/web/src/lib/server/knowledge/sharing.server.ts
//
// Knowledge in shared projects (tasker 168): the project lens ("From Alice's People"), Ask →
// Share, "Who can see Kyle", and the owner's inbox. Every call goes through the SECURITY
// DEFINER functions in 20261118300000_knowledge_project_sharing.sql on the caller's own client,
// so the database decides who sees what (membership, per-fact rules, live grants). This file
// only shapes requests and sends the two emails:
//   - the owner hears someone asked ("Bob asked about someone in your People"),
//   - the asker hears they were given access.
// Emails never carry the entry's name or any fact value, matching the people-layer rule that a
// request can't be used to mail arbitrary words; the reader opens BuildOS to see it.

import {
	type AdminClient,
	type Mailer,
	button,
	emailableAddress,
	fallbackLink,
	heading,
	loadPeople,
	paragraph,
	redact,
	render,
	displayName
} from '$lib/server/people/people-emails';
import { appBaseUrl } from '$lib/server/people/invite-links';
import { EmailService } from '$lib/services/email-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type {
	AskResult,
	EntityShares,
	LensEntry,
	ShareInboxItem,
	ShareTerms
} from '$lib/components/knowledge/sharing-types';

export type * from '$lib/components/knowledge/sharing-types';

type RpcClient = {
	rpc: (
		fn: string,
		args?: Record<string, unknown>
	) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
	from: (table: string) => any;
};

export class KnowledgeSharingError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 403 | 404 | 500
	) {
		super(message);
	}
}

const rpc = async <T>(client: unknown, fn: string, args: Record<string, unknown>): Promise<T> => {
	const { data, error } = await (client as RpcClient).rpc(fn, args);
	if (error) {
		const status =
			error.code === '42501'
				? 403
				: error.code === 'P0002'
					? 404
					: error.code === '22023'
						? 400
						: 500;
		throw new KnowledgeSharingError(
			status === 500 ? 'Could not do that' : error.message,
			status
		);
	}
	return data as T;
};

// ---------------------------------------------------------------------------
// Reads

/**
 * Whether anyone but the viewer can open this project. Projects nobody else is in (nearly all
 * of them) never pay for the lens: callers skip it on false.
 */
export async function projectHasOtherMembers(
	client: unknown,
	projectId: string,
	viewerId: string
): Promise<boolean> {
	// Actor ids only: RLS hides other people's actor rows, so no join through onto_actors.
	const db = client as RpcClient;
	const [members, project, me] = await Promise.all([
		db
			.from('onto_project_members')
			.select('actor_id')
			.eq('project_id', projectId)
			.is('removed_at', null)
			.limit(10),
		db.from('onto_projects').select('created_by').eq('id', projectId).maybeSingle(),
		db.from('onto_actors').select('id').eq('user_id', viewerId).maybeSingle()
	]);
	if (members.error || project.error || !project.data || !me.data) return false;
	const mine = (me.data as { id: string }).id;
	const actors = [
		(project.data as { created_by: string }).created_by,
		...((members.data ?? []) as Array<{ actor_id: string }>).map((row) => row.actor_id)
	];
	return actors.some((actor) => actor && actor !== mine);
}

export async function loadProjectLens(
	client: unknown,
	input: { projectId: string; recordKind: 'task' | 'document'; recordIds: string[] }
): Promise<LensEntry[]> {
	const result = await rpc<{ entries: LensEntry[] } | null>(client, 'knowledge_project_lens', {
		p_project: input.projectId,
		p_record_kind: input.recordKind,
		p_record_ids: input.recordIds.slice(0, 100)
	});
	return result?.entries ?? [];
}

export function loadEntityShares(client: unknown, entityId: string): Promise<EntityShares> {
	return rpc<EntityShares>(client, 'knowledge_entity_shares', { p_entity: entityId });
}

export async function loadShareInbox(client: unknown): Promise<ShareInboxItem[]> {
	return (await rpc<ShareInboxItem[] | null>(client, 'knowledge_share_inbox', {})) ?? [];
}

// ---------------------------------------------------------------------------
// Writes

const NEVER_SHARED = new Set(['note', 'knows', 'birthday']);

export function readShareTerms(body: Record<string, unknown>): ShareTerms {
	const what = body.what === 'all' || body.what === 'picked' ? body.what : 'contact';
	const duration =
		body.duration === 'always' || body.duration === 'until' ? body.duration : 'membership';
	const predicates = Array.isArray(body.predicates)
		? body.predicates
				.filter(
					(p): p is string => typeof p === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(p)
				)
				.filter((p) => !NEVER_SHARED.has(p))
				.slice(0, 20)
		: [];
	const expiresAt = typeof body.expires_at === 'string' ? body.expires_at : null;
	return { what, predicates, duration, expiresAt };
}

export async function requestShare(
	client: unknown,
	input: { entityId: string; projectId: string; what: 'contact' | 'all' }
): Promise<AskResult> {
	const result = await rpc<AskResult>(client, 'knowledge_request_share', {
		p_entity: input.entityId,
		p_project: input.projectId,
		p_what: input.what
	});
	if (result.status === 'requested' && result.id && !result.merged) {
		void sendShareAskedEmail(result.id);
	}
	return result;
}

export async function decideShare(
	client: unknown,
	shareId: string,
	decision: 'grant' | 'decline',
	// what = null keeps the ask's own scope (contact / all).
	terms: Omit<ShareTerms, 'what'> & { what: ShareTerms['what'] | null }
): Promise<{ status: string; id: string }> {
	const result = await rpc<{ status: string; id: string }>(client, 'knowledge_decide_share', {
		p_share: shareId,
		p_decision: decision,
		p_what: terms.what,
		p_predicates: terms.predicates ?? [],
		p_duration: terms.duration,
		p_expires_at: terms.duration === 'until' ? terms.expiresAt : null
	});
	if (decision === 'grant' && result.status === 'granted') void sendShareGrantedEmail(shareId);
	return result;
}

export function shareEntity(
	client: unknown,
	input: { entityId: string; projectId: string | null; granteeId: string | null } & ShareTerms
): Promise<{ status: string; id: string }> {
	return rpc(client, 'knowledge_share_entity', {
		p_entity: input.entityId,
		p_project: input.projectId,
		p_grantee: input.granteeId,
		p_what: input.what,
		p_predicates: input.predicates ?? [],
		p_duration: input.duration,
		p_expires_at: input.duration === 'until' ? input.expiresAt : null
	});
}

export function revokeShare(client: unknown, shareId: string) {
	return rpc<{ status: string; id: string }>(client, 'knowledge_revoke_share', {
		p_share: shareId
	});
}

export function cancelShareRequest(client: unknown, shareId: string) {
	return rpc<{ status: string; id: string }>(client, 'knowledge_cancel_share_request', {
		p_share: shareId
	});
}

// ---------------------------------------------------------------------------
// Emails (never throw; never include the entry's name or any value)

type ShareRow = {
	id: string;
	owner_user_id: string;
	requested_by_user_id: string | null;
	grantee_user_id: string | null;
	project_id: string | null;
	status: string;
	what: string;
	duration: string;
};

async function loadShare(admin: AdminClient, id: string): Promise<ShareRow | null> {
	const { data, error } = await (admin as any)
		.from('knowledge_shares')
		.select(
			'id, owner_user_id, requested_by_user_id, grantee_user_id, project_id, status, what, duration'
		)
		.eq('id', id)
		.maybeSingle();
	if (error) throw error;
	return (data as ShareRow | null) ?? null;
}

async function projectName(admin: AdminClient, id: string | null): Promise<string> {
	if (!id) return 'a shared project';
	const { data } = await (admin as any)
		.from('onto_projects')
		.select('name')
		.eq('id', id)
		.maybeSingle();
	return (data?.name as string | undefined)?.trim() || 'a shared project';
}

export function buildShareAskedEmail(input: {
	requesterName: string;
	projectName: string;
	what: string;
	reviewUrl: string;
}) {
	const subject = `${input.requesterName} asked about someone in your People`;
	const asked = `${input.requesterName} is working with you in ${input.projectName} and asked to see ${
		input.what === 'all' ? 'more of what you know' : 'the contact details you have'
	} for someone named there.`;
	const choice =
		'Nothing is shared until you choose. You can share contact details, more, or nothing, and for how long.';
	const html = render(subject, [
		heading(subject),
		paragraph(asked),
		paragraph(choice, { muted: true, size: 14 }),
		button('Review', input.reviewUrl),
		fallbackLink(input.reviewUrl)
	]);
	return { subject, html, text: [asked, choice, `Review: ${input.reviewUrl}`].join('\n\n') };
}

export function buildShareGrantedEmail(input: {
	ownerName: string;
	projectName: string;
	openUrl: string;
}) {
	const subject = `${input.ownerName} shared details with you`;
	const said = `${input.ownerName} said yes to what you asked about someone in ${input.projectName}. It shows on their card wherever their name appears in the project.`;
	const html = render(subject, [
		heading(subject),
		paragraph(said),
		button('Open the project', input.openUrl),
		fallbackLink(input.openUrl)
	]);
	return { subject, html, text: [said, `Open: ${input.openUrl}`].join('\n\n') };
}

export async function sendShareAskedEmail(
	shareId: string,
	deps: { admin?: AdminClient; mailer?: Mailer; baseUrl?: string } = {}
): Promise<'sent' | 'skipped' | 'failed'> {
	try {
		const admin = deps.admin ?? createAdminSupabaseClient();
		const share = await loadShare(admin, shareId);
		if (!share || share.status !== 'requested' || !share.requested_by_user_id) return 'skipped';
		const people = await loadPeople(admin, [share.owner_user_id, share.requested_by_user_id]);
		const owner = people.get(share.owner_user_id);
		const requester = people.get(share.requested_by_user_id);
		const to = await emailableAddress(admin, owner);
		if (!owner || !requester || !to) return 'skipped';
		const baseUrl = deps.baseUrl ?? appBaseUrl();
		const parts = buildShareAskedEmail({
			requesterName: displayName(requester),
			projectName: await projectName(admin, share.project_id),
			what: share.what,
			reviewUrl: `${baseUrl}/profile?tab=people#knowledge-asks`
		});
		const mailer = deps.mailer ?? new EmailService(admin as any);
		const result = await mailer.sendEmail({
			to,
			subject: parts.subject,
			body: parts.text,
			html: parts.html,
			userId: owner.id,
			createdBy: requester.id,
			metadata: { type: 'knowledge_share_asked', share_id: shareId }
		});
		return result?.success ? 'sent' : 'failed';
	} catch (error) {
		console.error('[Knowledge Share Email] asked email failed', redact(error));
		return 'failed';
	}
}

export async function sendShareGrantedEmail(
	shareId: string,
	deps: { admin?: AdminClient; mailer?: Mailer; baseUrl?: string } = {}
): Promise<'sent' | 'skipped' | 'failed'> {
	try {
		const admin = deps.admin ?? createAdminSupabaseClient();
		const share = await loadShare(admin, shareId);
		const granteeId = share?.grantee_user_id ?? share?.requested_by_user_id;
		if (!share || share.status !== 'granted' || !granteeId) return 'skipped';
		const people = await loadPeople(admin, [share.owner_user_id, granteeId]);
		const owner = people.get(share.owner_user_id);
		const grantee = people.get(granteeId);
		const to = await emailableAddress(admin, grantee);
		if (!owner || !grantee || !to) return 'skipped';
		const baseUrl = deps.baseUrl ?? appBaseUrl();
		const parts = buildShareGrantedEmail({
			ownerName: displayName(owner),
			projectName: await projectName(admin, share.project_id),
			openUrl: share.project_id
				? `${baseUrl}/projects/${share.project_id}`
				: `${baseUrl}/projects`
		});
		const mailer = deps.mailer ?? new EmailService(admin as any);
		const result = await mailer.sendEmail({
			to,
			subject: parts.subject,
			body: parts.text,
			html: parts.html,
			userId: grantee.id,
			createdBy: owner.id,
			metadata: { type: 'knowledge_share_granted', share_id: shareId }
		});
		return result?.success ? 'sent' : 'failed';
	} catch (error) {
		console.error('[Knowledge Share Email] granted email failed', redact(error));
		return 'failed';
	}
}

/** Maps a sharing error to the matching JSON API response. */
export function sharingErrorResponse(
	error: unknown,
	api: {
		badRequest: (m: string) => Response;
		forbidden: (m: string) => Response;
		notFound: (m: string) => Response;
		internalError: (e: unknown, m: string) => Response;
	},
	fallback: string
): Response {
	if (error instanceof KnowledgeSharingError) {
		if (error.status === 400) return api.badRequest(error.message);
		if (error.status === 403) return api.forbidden(error.message);
		if (error.status === 404) return api.notFound('That entry');
	}
	return api.internalError(error, fallback);
}
