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
import { getPublicChatShare, handleChatShare } from './chat-share.service';
import { recordChatShareView } from './chat-share-view';
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
	opts: { token?: string; user?: boolean; origin?: string; dnt?: string } = {}
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
	if (opts.origin) headers.origin = opts.origin;
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
async function prepare() {
	const response = await handleChatShare(event(), 'prepare');
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
		await publish(await prepare(), [second], false);
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
		await publish(await prepare(), [mid], false);
		assert.isDefined(rows[0]);
		rows[0].snapshot.private = 'PRIVATE';
		rows[0].snapshot.messages[0].metadata = { private: 'PRIVATE' };
		rows[0].snapshot.messages[0].id = mid;
		const publicShare = await getPublicChatShare(rows[0].token);
		expect(publicShare?.id).toBe(rows[0].token);
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
});
