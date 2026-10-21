// apps/web/src/lib/server/chat-share.service.test.ts
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ admin: vi.fn(), restore: vi.fn(), review: vi.fn() }));
vi.mock('$env/static/private', () => ({ PRIVATE_SUPABASE_SERVICE_KEY: 'test-only-key' }));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: mock.admin }));
vi.mock('./chat-session-restore', () => ({ loadChatSessionRestore: mock.restore }));
vi.mock('./chat-session-enrichment', () => ({
	loadRestoreAttachments: async (_s: unknown, _id: string, m: unknown) => m
}));
vi.mock('$lib/utils/rate-limiter', () => ({ rateLimiter: { check: () => ({ allowed: true }) } }));
vi.mock('./chat-share-review', async (importOriginal) => ({
	...(await importOriginal<typeof import('./chat-share-review')>()),
	reviewChatShare: mock.review
}));
import { chatShareAnalyticsRef, getPublicChatShare, handleChatShare } from './chat-share.service';
import { recordChatShareView } from './chat-share-view';
import { CHAT_SHARE_REVIEW_MAX_CHARS } from './chat-share-review';
import { config as shareRouteConfig } from '../../routes/api/chat/sessions/[id]/share/+server';
import { config as prepareRouteConfig } from '../../routes/api/chat/sessions/[id]/share/prepare/+server';
const uid = '11111111-1111-4111-8111-111111111111',
	sid = '22222222-2222-4222-8222-222222222222',
	mid = '33333333-3333-4333-8333-333333333333',
	second = '44444444-4444-4444-8444-444444444444';
let rows: Record<string, any>[];
let owner = true;
let signedIn = true;
let source: any;
let cookie: string | undefined;
let dbFailure = false;
const admin = { from: () => query(true) };
function query(isAdmin = false) {
	let conditions: Array<(r: any) => boolean> = [],
		op = 'read',
		values: any;
	const q: any = {
		select: () => q,
		eq: (key: string, value: unknown) => {
			conditions.push((r) => r[key] === value);
			return q;
		},
		is: (key: string, value: unknown) => {
			conditions.push((r) => r[key] === value);
			return q;
		},
		in: () => q,
		update: (v: any) => {
			op = 'update';
			values = v;
			return q;
		},
		insert: (v: any) => {
			op = 'insert';
			values = v;
			return q;
		},
		single: () => execute(),
		maybeSingle: () => execute(),
		then: (resolve: any, reject: any) => execute().then(resolve, reject)
	};
	async function execute() {
		if (dbFailure && isAdmin) return { data: null, error: { code: 'database-unavailable' } };
		if (!isAdmin)
			return {
				data: owner ? { id: sid, title: 'Chat', auto_title: null } : null,
				error: null
			};
		if (op === 'insert') {
			if (rows.some((r) => r.session_id === values.session_id && r.revoked_at === null))
				return { data: null, error: { code: '23505' } };
			const row = {
				...values,
				id: `row-${rows.length}`,
				created_at: '2026-10-18T00:00:00Z',
				revoked_at: null,
				view_count: 0
			};
			rows.push(row);
			return { data: row, error: null };
		}
		const row = rows.find((r) => conditions.every((c) => c(r)));
		if (op === 'update' && row) Object.assign(row, values);
		return { data: row ?? null, error: null };
	}
	return q;
}
function event(
	body?: unknown,
	opts: {
		token?: string;
		user?: boolean;
		origin?: string | null;
		site?: string;
		dnt?: string;
	} = {}
) {
	const url = new URL(
		opts.token
			? `https://build-os.com/api/share/${opts.token}/view`
			: `https://build-os.com/api/chat/sessions/${sid}/share`
	);
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		'user-agent': 'Mozilla/5.0'
	};
	// The share page's own fetch is same-origin; tests opt out with `origin: null`.
	const origin = opts.origin === undefined && opts.token ? 'https://build-os.com' : opts.origin;
	if (origin) headers.origin = origin;
	if (opts.site) headers['sec-fetch-site'] = opts.site;
	if (opts.dnt) headers.dnt = opts.dnt;
	return {
		params: { id: sid, token: opts.token },
		url,
		request: new Request(url, {
			method: 'POST',
			headers,
			...(body ? { body: JSON.stringify(body) } : {})
		}),
		setHeaders: vi.fn(),
		cookies: {
			get: () => cookie,
			set: vi.fn((_key: string, value: string) => {
				cookie = value;
			})
		},
		locals: {
			user: opts.user ? { id: uid } : null,
			safeGetSession: async () => ({ user: signedIn ? { id: uid, name: 'DJ' } : null }),
			supabase: { from: () => query() }
		}
	} as any;
}
async function prepare(showAuthor = true, messageIds?: string[]) {
	const response = await handleChatShare(
		event({ showAuthor, ...(messageIds ? { messageIds } : {}) }),
		'prepare'
	);
	return (await response.json()).data;
}
async function publish(preview: any, ids = [mid], showAuthor = true) {
	return handleChatShare(
		event({ includedMessageIds: ids, showAuthor, fingerprint: preview.fingerprint }),
		'publish'
	);
}
beforeEach(() => {
	rows = [];
	owner = true;
	signedIn = true;
	cookie = undefined;
	dbFailure = false;
	vi.clearAllMocks();
	mock.review.mockResolvedValue([]);
	mock.admin.mockReturnValue(admin);
	source = {
		title: 'Chat',
		messages: [
			{ id: mid, role: 'user', content: 'Hello', created_at: '2026-10-18T00:00:00Z' },
			{ id: second, role: 'assistant', content: 'Answer', created_at: '2026-10-18T00:01:00Z' }
		],
		toolExecutions: [],
		turnRuns: [],
		turnEvents: [],
		workflows: [],
		historyWindow: {},
		truncated: false
	};
	mock.restore.mockImplementation(async () => ({ data: source, error: null }));
});
describe('chat sharing endpoints', () => {
	it('requires authentication and user-scoped ownership before privileged reads', async () => {
		signedIn = false;
		expect((await handleChatShare(event(), 'get')).status).toBe(401);
		signedIn = true;
		owner = false;
		expect((await handleChatShare(event(), 'prepare')).status).toBe(404);
		expect(mock.admin).not.toHaveBeenCalled();
		expect(mock.review).not.toHaveBeenCalled();
	});
	it('rejects cross-origin mutations', async () => {
		expect(
			(
				await handleChatShare(
					event(undefined, { origin: 'https://elsewhere.example' }),
					'revoke'
				)
			).status
		).toBe(403);
		expect(mock.admin).not.toHaveBeenCalled();
	});
	it('free preview makes no model call; prepare writes nothing', async () => {
		expect((await handleChatShare(event(), 'get')).status).toBe(200);
		expect(mock.review).not.toHaveBeenCalled();
		await prepare();
		expect(rows).toHaveLength(0);
		expect(mock.review).toHaveBeenCalledOnce();
	});
	it('publishes only selected cleaned messages using the signed review once', async () => {
		const result = await publish(await prepare());
		expect(result.status).toBe(200);
		expect(mock.review).toHaveBeenCalledOnce();
		expect(rows).toHaveLength(1);
		assert.isDefined(rows[0]);
		expect(rows[0].snapshot.messages).toHaveLength(1);
		expect(JSON.stringify(rows[0].snapshot)).not.toContain(mid);
		expect(rows[0].author_name).toBe('DJ');
	});
	it('rejects forged/missing receipts without charging for a review', async () => {
		expect((await publish({ fingerprint: 'forged' })).status).toBe(409);
		expect(rows).toHaveLength(0);
		expect(mock.review).not.toHaveBeenCalled();
	});
	it('rejects locked and unknown selections', async () => {
		mock.review.mockResolvedValue([{ messageId: mid, locked: true, reasons: ['Credential'] }]);
		const preview = await prepare();
		expect((await publish(preview)).status).toBe(422);
		expect((await publish(preview, [uid])).status).toBe(400);
		expect(rows).toHaveLength(0);
	});
	it('allows an owner to include a non-locked warning', async () => {
		mock.review.mockResolvedValue([
			{ messageId: mid, locked: false, reasons: ['Private context'] }
		]);
		expect((await publish(await prepare())).status).toBe(200);
	});
	it('re-reviews changed content and requires confirmation of the refreshed preview', async () => {
		const preview = await prepare();
		source.messages[0].content = 'Changed';
		const result = await publish(preview);
		expect(result.status).toBe(409);
		const json = await result.json();
		expect(json.code).toBe('REVIEW_CHANGED');
		expect(json.details.preview.messages[0].markdown).toBe('Changed');
		expect(mock.review).toHaveBeenCalledTimes(2);
		expect(rows).toHaveLength(0);
		expect((await publish(json.details.preview)).status).toBe(200);
	});
	it('updates the existing token, revokes it, then uses a new token on re-share', async () => {
		await publish(await prepare());
		assert.isDefined(rows[0]);
		const first = rows[0].token;
		await publish(await prepare(false), [second], false);
		expect(rows).toHaveLength(1);
		expect(rows[0].token).toBe(first);
		expect(rows[0].snapshot.messages[0].markdown).toBe('Answer');
		const revoked = await handleChatShare(event(), 'revoke');
		expect((await revoked.json()).data.messagesShared).toBe(1);
		expect(await getPublicChatShare(first)).toBeNull();
		await publish(await prepare());
		expect(rows).toHaveLength(2);
		assert.isDefined(rows[1]);
		expect(rows[1].token).not.toBe(first);
	});
	it('public read contains only public fields and hides the byline when disabled', async () => {
		await publish(await prepare(false), [mid], false);
		assert.isDefined(rows[0]);
		// A hidden byline was never reviewed, so the real name is never stored.
		expect(rows[0].author_name).toBe('BuildOS user');
		rows[0].snapshot.private = 'PRIVATE';
		rows[0].snapshot.messages[0].metadata = { private: 'PRIVATE' };
		rows[0].snapshot.messages[0].id = mid;
		const publicShare = await getPublicChatShare(rows[0].token);
		expect(publicShare?.id).toBe(rows[0].token);
		expect(publicShare?.ref).toMatch(/^[0-9a-f]{12}$/);
		expect(publicShare?.ref).toBe(chatShareAnalyticsRef(rows[0].token));
		expect(rows[0].token).not.toContain(publicShare!.ref);
		expect(publicShare?.authorName).toBeNull();
		expect(publicShare).not.toHaveProperty('review');
		expect(publicShare).not.toHaveProperty('user_id');
		expect(publicShare).not.toHaveProperty('session_id');
		expect(JSON.stringify(publicShare)).not.toContain('PRIVATE');
		expect(JSON.stringify(publicShare)).not.toContain(mid);
		expect(await getPublicChatShare('bad')).toBeNull();
		expect(await getPublicChatShare('Z'.repeat(22))).toBeNull();
	});
	it('does not publish when review fails or the database cannot be read', async () => {
		mock.review.mockRejectedValue(new Error('offline'));
		expect((await handleChatShare(event(), 'prepare')).status).toBe(500);
		expect(rows).toHaveLength(0);
		dbFailure = true;
		expect((await handleChatShare(event(), 'get')).status).toBe(500);
	});
	it('counts a view once per cookie, skips author and DNT, and never changes snapshot timestamp', async () => {
		await publish(await prepare());
		const [row] = rows;
		assert.isDefined(row);
		const updated = row.updated_at;
		expect(
			(await recordChatShareView(event(undefined, { token: row.token, user: true }))).status
		).toBe(200);
		expect(row.view_count).toBe(0);
		await recordChatShareView(event(undefined, { token: row.token, dnt: '1' }));
		expect(row.view_count).toBe(0);
		await recordChatShareView(event(undefined, { token: row.token }));
		await recordChatShareView(event(undefined, { token: row.token }));
		expect(row.view_count).toBe(1);
		expect(row.updated_at).toBe(updated);
	});
	it('rejects cross-origin and metadata-less view posts, keeping the counter untouched', async () => {
		await publish(await prepare());
		const [row] = rows;
		assert.isDefined(row);
		for (const opts of [
			{ origin: 'https://elsewhere.example' },
			{ origin: null, site: 'cross-site' },
			{ origin: null }
		])
			expect(
				(await recordChatShareView(event(undefined, { token: row.token, ...opts }))).status
			).toBe(403);
		expect(row.view_count).toBe(0);
		expect(
			(
				await recordChatShareView(
					event(undefined, { token: row.token, origin: null, site: 'same-origin' })
				)
			).status
		).toBe(200);
		expect(row.view_count).toBe(1);
	});
	it('treats a lost view-count race as a silent 204, never a 503', async () => {
		await publish(await prepare());
		const [row] = rows;
		assert.isDefined(row);
		const racing = {
			from: () => {
				const q: any = {
					select: () => q,
					eq: () => q,
					is: () => q,
					update: () => ({
						eq: () => ({
							eq: () => ({
								is: () => ({
									select: () => ({
										maybeSingle: async () => ({ data: null, error: null })
									})
								})
							})
						})
					}),
					maybeSingle: async () => ({
						data: { id: row.id, user_id: 'someone-else', view_count: row.view_count },
						error: null
					})
				};
				return q;
			}
		};
		mock.admin.mockReturnValue(racing);
		const response = await recordChatShareView(event(undefined, { token: row.token }));
		expect(response.status).toBe(204);
		expect(cookie).toBeUndefined();
	});
	it('gives both share routes room for the review instead of the 10 s default', () => {
		expect(shareRouteConfig).toEqual({ maxDuration: 60 });
		expect(prepareRouteConfig).toEqual({ maxDuration: 60 });
	});
	it('scans original message text, not only the cleaned markdown', async () => {
		source.messages[0].content = 'Key sk_live_abcdefghijklmnop1234';
		await prepare();
		const [input] = mock.review.mock.calls[0]!;
		expect(input.messages[0].markdown).toContain('sk\\_live\\_');
		expect(input.originals.messages.get(mid)).toBe('Key sk_live_abcdefghijklmnop1234');
	});
	it('never reviews a hidden byline and re-reviews when the byline choice changes', async () => {
		signedIn = true;
		await prepare(false);
		const [hidden] = mock.review.mock.calls[0]!;
		expect(hidden.showAuthor).toBe(false);
		const shown = await prepare(true);
		const result = await publish(shown, [mid], false);
		expect(result.status).toBe(409);
		expect((await result.json()).code).toBe('REVIEW_CHANGED');
		expect(mock.review).toHaveBeenCalledTimes(3);
		expect(rows).toHaveLength(0);
	});
	it('reviews the most recent messages that fit and refuses to publish unreviewed ones', async () => {
		const big = 'x '.repeat(Math.floor(CHAT_SHARE_REVIEW_MAX_CHARS / 2.5 / 2));
		const ids = [
			'55555555-5555-4555-8555-555555555555',
			'66666666-6666-4666-8666-666666666666',
			mid,
			second
		];
		source.messages = ids.map((id, index) => ({
			id,
			role: index % 2 ? 'assistant' : 'user',
			content: `${index} ${big}`,
			created_at: `2026-10-18T00:0${index}:00Z`
		}));
		const free = (await (await handleChatShare(event(), 'get')).json()).data;
		expect(free.outsideReview).toEqual(ids.slice(0, 2));
		const reviewed = await prepare();
		expect(reviewed.outsideReview).toEqual(ids.slice(0, 2));
		expect(mock.review.mock.calls[0]![0].messages.map((m: any) => m.id)).toEqual(ids.slice(2));
		// An older message outside the review can't ride along on this receipt.
		const blocked = await publish(reviewed, [ids[0]!, mid]);
		expect(blocked.status).toBe(409);
		expect((await blocked.json()).code).toBe('REVIEW_REQUIRED');
		expect(rows).toHaveLength(0);
		// The owner can choose an older part instead; the review prefers their selection.
		const older = await prepare(true, [ids[0]!]);
		expect(mock.review.mock.calls[1]![0].messages.map((m: any) => m.id)).toEqual([
			ids[0],
			second
		]);
		expect(older.outsideReview).toEqual([ids[1], mid]);
		expect((await publish(older, [ids[0]!])).status).toBe(200);
		expect(rows[0]!.snapshot.messages).toHaveLength(1);
	});
});
