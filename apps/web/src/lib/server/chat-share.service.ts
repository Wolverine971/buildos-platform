// apps/web/src/lib/server/chat-share.service.ts
import { createHash, randomBytes } from 'node:crypto';
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
	CHAT_SHARE_REVIEW_MAX_CHARS,
	CHAT_SHARE_TOO_LONG,
	ChatShareReviewError,
	chatShareFingerprint,
	chatShareReviewChars,
	chatShareReviewWindow,
	reviewChatShare,
	signChatShareReview,
	verifyChatShareReview,
	type ReviewInput
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
/** Optional: older clients send no body (byline shown, default review window). */
const prepareBody = z
	.object({
		showAuthor: z.boolean().optional(),
		messageIds: z.array(uuid).max(100).optional()
	})
	.strict();
const HIDDEN_AUTHOR_NAME = 'BuildOS user';
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
/** Non-reversible analytics handle for a share; the token itself never goes to analytics. */
export const chatShareAnalyticsRef = (token: string) =>
	createHash('sha256').update('chat-share-ref\n').update(token).digest('hex').slice(0, 12);

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

type Originals = NonNullable<ReviewInput['originals']>;
type LoadedPreview = { source: ChatShareSource; preview: ChatSharePreview; originals: Originals };

function reviewInput(
	{ preview, originals }: LoadedPreview,
	showAuthor: boolean,
	messageIds?: ReadonlySet<string>
): ReviewInput {
	return {
		title: preview.title,
		authorName: preview.authorName,
		showAuthor,
		messages: messageIds
			? preview.messages.filter((message) => messageIds.has(message.id))
			: preview.messages,
		originals
	};
}

const outsideOf = (preview: ChatSharePreview, covered: ReadonlySet<string>) =>
	preview.messages.filter((message) => !covered.has(message.id)).map((message) => message.id);

async function loadPreview(
	event: RequestEvent,
	access: {
		user: { id: string; name?: string | null };
		session: { id: string; title: string | null; auto_title: string | null };
	},
	existing: any
): Promise<LoadedPreview> {
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
	const rawTitle = access.session.title || access.session.auto_title || 'Shared chat';
	const source: ChatShareSource = { ...restore, messages, title: rawTitle, totalMessages };
	const candidates = buildChatShareCandidates(source);
	const preview: ChatSharePreview = {
		...candidates,
		authorName: cleanSharedLabel(
			access.user.name ?? HIDDEN_AUTHOR_NAME,
			HIDDEN_AUTHOR_NAME,
			200
		),
		outsideReview: [],
		existing: existing
			? {
					url: shareUrl(event.url.origin, existing.token),
					showAuthor: existing.show_author,
					includedMessageIds: existing.included_message_ids,
					updatedAt: existing.updated_at
				}
			: null
	};
	// Scan-only originals: secrets hidden by markdown escaping are caught before cleaning.
	const originals: Originals = {
		title: rawTitle,
		messages: new Map<string, string>(
			messages.map((message) => [message.id, message.content ?? ''])
		)
	};
	const loaded = { source, preview, originals };
	// Free and deterministic: the most recent messages one review can cover.
	preview.outsideReview = outsideOf(
		preview,
		new Set(chatShareReviewWindow(reviewInput(loaded, existing?.show_author ?? true)))
	);
	return loaded;
}

async function prepare(
	event: RequestEvent,
	sessionId: string,
	userId: string,
	loaded: LoadedPreview,
	showAuthor: boolean,
	preferredIds?: readonly string[]
) {
	const { preview } = loaded;
	if (!preview.messages.length)
		throw new ChatShareReviewError(
			'No messages fit in this share. Try a shorter conversation.',
			'REVIEW_BLOCKED'
		);
	const covered = new Set(chatShareReviewWindow(reviewInput(loaded, showAuthor), preferredIds));
	if (!covered.size)
		throw new ChatShareReviewError(
			`${CHAT_SHARE_TOO_LONG} Try sharing a shorter conversation.`,
			'REVIEW_BLOCKED'
		);
	const limit = rateLimiter.check(`chat-share-review:${userId}`, {
		requests: 6,
		windowMs: 10 * 60 * 1000
	});
	if (!limit.allowed)
		throw new ChatShareReviewError('Too many review requests. Try again in a few minutes.');
	const input = reviewInput(loaded, showAuthor, covered);
	const flags = await reviewChatShare(input, { supabase: event.locals.supabase, userId });
	return {
		...preview,
		outsideReview: outsideOf(preview, covered),
		flags,
		fingerprint: signChatShareReview({
			sessionId,
			userId,
			hash: chatShareFingerprint(input),
			reviewedMessageIds: input.messages.map((message) => message.id),
			flags
		})
	};
}

async function readPrepareBody(request: Request) {
	const text = await request.text();
	if (!text.trim()) return { ok: true as const, data: {} };
	try {
		const parsed = prepareBody.safeParse(JSON.parse(text));
		if (parsed.success) return { ok: true as const, data: parsed.data };
	} catch {
		// Fall through to the structured error below.
	}
	return { ok: false as const, response: ApiResponse.badRequest('Invalid request body') };
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
		let prepareOptions: z.infer<typeof prepareBody> = {};
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
		} else if (action === 'prepare') {
			const parsed = await readPrepareBody(event.request);
			if (!parsed.ok) return parsed.response;
			prepareOptions = parsed.data;
		}
		const loaded = await loadPreview(event, access, existing);
		const { source, preview } = loaded;
		if (action === 'get') return ApiResponse.success(preview);
		if (action === 'prepare')
			return ApiResponse.success(
				await prepare(
					event,
					session.id,
					user.id,
					loaded,
					prepareOptions.showAuthor ?? true,
					prepareOptions.messageIds
				)
			);
		if (!body || !receipt) return ApiResponse.badRequest();
		// The receipt covers exactly these messages with this byline choice; anything else
		// (edited text, a removed message, a toggled byline) gets a fresh review.
		const reviewed = new Set(receipt.reviewedMessageIds);
		const reviewedInput = reviewInput(loaded, body.showAuthor, reviewed);
		if (
			reviewedInput.messages.length !== reviewed.size ||
			receipt.hash !== chatShareFingerprint(reviewedInput)
		) {
			const refreshed = await prepare(
				event,
				session.id,
				user.id,
				loaded,
				body.showAuthor,
				body.includedMessageIds
			);
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
		// Never publish text the review didn't read.
		if ([...selected].some((id) => !reviewed.has(id)))
			return ApiResponse.error(
				'Review the selected messages before sharing.',
				409,
				'REVIEW_REQUIRED'
			);
		// Same budget as prepare: a share is never bigger than one review covers.
		if (
			chatShareReviewChars(reviewInput(loaded, body.showAuthor, selected)) >
			CHAT_SHARE_REVIEW_MAX_CHARS
		)
			return ApiResponse.error(
				`${CHAT_SHARE_TOO_LONG} Uncheck some messages, then review again.`,
				422,
				'REVIEW_BLOCKED'
			);
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
			// A hidden byline was never reviewed, so it is never stored either.
			author_name: body.showAuthor ? preview.authorName : HIDDEN_AUTHOR_NAME,
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
		ref: chatShareAnalyticsRef(token),
		title: data.title,
		snapshot,
		showAuthor: data.show_author,
		authorName: data.show_author ? data.author_name : null,
		createdAt: data.created_at,
		updatedAt: data.updated_at
	};
}
