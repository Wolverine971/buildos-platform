// apps/web/src/lib/server/chat-share.service.ts
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { RequestEvent } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { rateLimiter } from '$lib/utils/rate-limiter';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { loadChatSessionRestore } from './chat-session-restore';
import { loadRestoreAttachments } from './chat-session-enrichment';
import {
	buildChatShareCandidates,
	buildSharedChatSnapshot,
	cleanSharedLabel,
	parseSharedChatSnapshot,
	type ChatShareSource
} from './chat-share-snapshot';
import {
	CHAT_SHARE_POLICY_VERSION,
	ChatShareReviewError,
	chatShareFingerprint,
	reviewChatShare,
	signChatShareReview,
	verifyChatShareReview
} from './chat-share-review';
import type { ChatSharePreview } from '$lib/types/chat-share';

const uuid = z.string().uuid();
const shareBody = z
	.object({
		includedMessageIds: z.array(uuid).min(1).max(100),
		showAuthor: z.boolean(),
		fingerprint: z.string().min(1).max(100000)
	})
	.strict();
const SHARE_COLUMNS = 'id, token, included_message_ids, show_author, updated_at, review';
export const validShareToken = (token: string) => /^[A-Za-z0-9]{22}$/.test(token);
export function newChatShareToken(): string {
	const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
	let n = BigInt(`0x${randomBytes(16).toString('hex')}`),
		result = '';
	while (n > 0n) {
		result = alphabet[Number(n % 62n)] + result;
		n /= 62n;
	}
	return result.padStart(22, '0');
}
const shareUrl = (origin: string, token: string) => new URL(`/share/${token}`, origin).href;

async function ownedSession(event: RequestEvent) {
	const { user } = await event.locals.safeGetSession();
	if (!user) return { error: ApiResponse.unauthorized() };
	const id = event.params.id;
	if (!uuid.safeParse(id).success) return { error: ApiResponse.notFound('Chat') };
	const { data: session, error } = await event.locals.supabase
		.from('chat_sessions')
		.select('id, title, auto_title')
		.eq('id', id!)
		.eq('user_id', user.id)
		.maybeSingle();
	if (error) return { error: ApiResponse.databaseError(error) };
	if (!session) return { error: ApiResponse.notFound('Chat') };
	return { user, session };
}

async function loadPreview(
	event: RequestEvent,
	access: {
		user: { id: string; name?: string | null };
		session: { id: string; title: string | null; auto_title: string | null };
	},
	existing: any
) {
	const { data: restore, error } = await loadChatSessionRestore(
		access.session.id,
		access.user.id
	);
	if (error) throw error;
	if (!restore) throw new Error('Session no longer available');
	// The same owned restore reader feeds sharing and normal chat reopening.
	const messages = await loadRestoreAttachments(
		event.locals.supabase,
		access.session.id,
		restore.messages
	);
	let totalMessages: number | undefined;
	if (restore.truncated) {
		const counted = await event.locals.supabase
			.from('chat_messages')
			.select('id', { count: 'exact', head: true })
			.eq('session_id', access.session.id)
			.eq('user_id', access.user.id)
			.in('role', ['user', 'assistant']);
		if (counted.error) throw counted.error;
		totalMessages = counted.count ?? undefined;
	}
	const source: ChatShareSource = {
		...restore,
		messages,
		title: access.session.title || access.session.auto_title || 'Shared chat',
		totalMessages
	};
	const candidates = buildChatShareCandidates(source);
	const preview: ChatSharePreview = {
		...candidates,
		authorName: cleanSharedLabel(access.user.name ?? 'BuildOS user', 'BuildOS user', 200),
		existing: existing
			? {
					url: shareUrl(event.url.origin, existing.token),
					showAuthor: existing.show_author,
					includedMessageIds: existing.included_message_ids,
					updatedAt: existing.updated_at
				}
			: null
	};
	return { source, preview };
}

async function prepare(
	event: RequestEvent,
	sessionId: string,
	userId: string,
	preview: ChatSharePreview
) {
	if (!preview.messages.length)
		throw new ChatShareReviewError(
			'No messages fit in this share. Try a shorter conversation.',
			'REVIEW_BLOCKED'
		);
	const limit = rateLimiter.check(`chat-share-review:${userId}`, {
		requests: 6,
		windowMs: 10 * 60 * 1000
	});
	if (!limit.allowed)
		throw new ChatShareReviewError('Too many review requests. Try again in a few minutes.');
	const flags = await reviewChatShare(preview, { supabase: event.locals.supabase, userId });
	return {
		...preview,
		flags,
		fingerprint: signChatShareReview({
			sessionId,
			userId,
			hash: chatShareFingerprint(preview),
			flags
		})
	};
}

/** All writes use the admin client only after the user-scoped ownership check. */
export async function handleChatShare(
	event: RequestEvent,
	action: 'get' | 'prepare' | 'publish' | 'revoke'
): Promise<Response> {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const origin = event.request.headers.get('origin');
	if (action !== 'get' && origin && origin !== event.url.origin) return ApiResponse.forbidden();
	try {
		const access = await ownedSession(event);
		if ('error' in access) return access.error!;
		const { session, user } = access;
		const admin = createAdminSupabaseClient();
		const shares = () => admin.from('chat_session_shares');
		const current = await shares()
			.select(SHARE_COLUMNS)
			.eq('session_id', session.id)
			.eq('user_id', user.id)
			.is('revoked_at', null)
			.maybeSingle();
		if (current.error) return ApiResponse.databaseError(current.error);
		const existing = current.data;
		if (action === 'revoke') {
			if (!existing) return ApiResponse.success({ messagesShared: 0, messagesFlagged: 0 });
			const { error } = await shares()
				.update({ revoked_at: new Date().toISOString() })
				.eq('id', existing.id)
				.eq('user_id', user.id)
				.is('revoked_at', null);
			if (error) return ApiResponse.databaseError(error);
			const review = existing.review as { flags?: unknown[] } | null;
			return ApiResponse.success({
				messagesShared: existing.included_message_ids.length,
				messagesFlagged: review?.flags?.length ?? 0
			});
		}
		let body: z.infer<typeof shareBody> | undefined;
		let receipt: ReturnType<typeof verifyChatShareReview> = null;
		if (action === 'publish') {
			const parsed = await parseJsonRequest(event.request, shareBody);
			if (!parsed.ok) return parsed.response;
			body = parsed.data;
			receipt = verifyChatShareReview(body.fingerprint, user.id, session.id);
			if (!receipt)
				return ApiResponse.error(
					'Review this chat again before sharing.',
					409,
					'REVIEW_REQUIRED'
				);
		}
		const { source, preview } = await loadPreview(event, access, existing);
		if (action === 'get') return ApiResponse.success(preview);
		if (action === 'prepare')
			return ApiResponse.success(await prepare(event, session.id, user.id, preview));
		if (!body || !receipt) return ApiResponse.badRequest();
		if (receipt.hash !== chatShareFingerprint(preview)) {
			const refreshed = await prepare(event, session.id, user.id, preview);
			return ApiResponse.error(
				'The conversation changed. Check the updated preview before sharing.',
				409,
				'REVIEW_CHANGED',
				{ preview: refreshed }
			);
		}
		const selected = new Set(body.includedMessageIds),
			known = new Set(preview.messages.map((m) => m.id));
		if (
			selected.size !== body.includedMessageIds.length ||
			[...selected].some((id) => !known.has(id))
		)
			return ApiResponse.badRequest('Choose messages from the reviewed preview.');
		if (receipt.flags.some((flag) => flag.locked && selected.has(flag.messageId)))
			return ApiResponse.error(
				'Messages containing credentials or sensitive identifiers cannot be shared.',
				422,
				'LOCKED_MESSAGES'
			);
		const snapshot = buildSharedChatSnapshot(source, body.includedMessageIds);
		const values = {
			session_id: session.id,
			user_id: user.id,
			title: snapshot.title,
			author_name: preview.authorName,
			show_author: body.showAuthor,
			included_message_ids: body.includedMessageIds,
			snapshot: JSON.parse(JSON.stringify(snapshot)),
			review: JSON.parse(
				JSON.stringify({
					flags: receipt.flags,
					input_fingerprint: receipt.hash,
					llm_review_completed: true
				})
			),
			policy_version: CHAT_SHARE_POLICY_VERSION,
			updated_at: new Date().toISOString()
		};
		const saved = existing
			? await shares()
					.update(values)
					.eq('id', existing.id)
					.eq('user_id', user.id)
					.is('revoked_at', null)
					.select('token')
					.maybeSingle()
			: await shares()
					.insert({ ...values, token: newChatShareToken() })
					.select('token')
					.single();
		// A concurrent publish/revoke must never resurrect the old token or overwrite the other action.
		if (saved.error?.code === '23505' || (!saved.error && !saved.data))
			return ApiResponse.conflict(
				'Sharing changed in another window. Reopen the share sheet.'
			);
		if (saved.error) return ApiResponse.databaseError(saved.error);
		return ApiResponse.success({
			url: shareUrl(event.url.origin, saved.data!.token),
			updated: Boolean(existing),
			messagesShared: snapshot.messages.length,
			messagesFlagged: receipt.flags.length
		});
	} catch (error) {
		if (error instanceof ChatShareReviewError)
			return ApiResponse.error(
				error.message,
				error.code === 'REVIEW_BLOCKED' ? 422 : 503,
				error.code
			);
		return ApiResponse.internalError(error, 'Could not load or update this chat share.');
	}
}

/** Public allowlist: never serialize the owner/session IDs or the review. */
export async function getPublicChatShare(token: string) {
	if (!validShareToken(token)) return null;
	const { data, error } = await createAdminSupabaseClient()
		.from('chat_session_shares')
		.select('title,snapshot,show_author,author_name,created_at,updated_at')
		.eq('token', token)
		.is('revoked_at', null)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	const snapshot = parseSharedChatSnapshot(data.snapshot);
	if (!snapshot) return null;
	return {
		id: token,
		title: data.title,
		snapshot,
		showAuthor: data.show_author,
		authorName: data.show_author ? data.author_name : null,
		createdAt: data.created_at,
		updatedAt: data.updated_at
	};
}
