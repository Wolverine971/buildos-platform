// apps/web/src/routes/api/chat/shared-document-edits/[id]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), admin: { tag: 'admin' } }));
vi.mock('$lib/server/shared-document-edit-card.service', () => ({
	resolveSharedDocumentEditCard: mocks.resolve
}));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: () => mocks.admin }));

import { POST } from './+server';

const CARD = '00000000-0000-4000-8000-000000000007';
const SESSION = '00000000-0000-4000-8000-000000000002';
const userClient = { tag: 'user' };

function call(body: unknown, user: { id: string } | null = { id: 'user-1' }, card = CARD) {
	return POST({
		params: { id: card },
		locals: { safeGetSession: async () => ({ user }), supabase: userClient },
		request: new Request('https://buildos.test/x', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	} as never);
}

beforeEach(() => mocks.resolve.mockReset());

describe('POST /api/chat/shared-document-edits/[id]', () => {
	it('requires a signed-in user', async () => {
		expect((await call({ choice: 'apply', session_id: SESSION }, null)).status).toBe(401);
		expect(mocks.resolve).not.toHaveBeenCalled();
	});

	it.each([
		[{ choice: 'yes', session_id: SESSION }],
		[{ choice: 'apply' }],
		['not json']
	])('rejects a malformed request %#', async (body) => {
		expect((await call(body)).status).toBe(400);
		expect(mocks.resolve).not.toHaveBeenCalled();
	});

	it('passes only the card id, session and choice, with the user from the session', async () => {
		mocks.resolve.mockResolvedValue({
			ok: true,
			alreadyResolved: false,
			resolution: {
				version: 1,
				card_id: CARD,
				choice: 'apply',
				outcome: 'applied',
				resolved_at: '2026-09-30T12:05:00.000Z',
				document_id: CARD,
				document_title: 'Rate card',
				parent_project_id: SESSION,
				parent_name: 'Wayne Strategies',
				shared_with_count: 5,
				copy: null
			}
		});
		const response = await call({
			choice: 'apply',
			session_id: SESSION,
			arguments: { content: 'ignored' }
		});
		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data.resolution.outcome).toBe('applied');
		expect(payload.message).toBe('Updated in Wayne Strategies · shown in 5 projects');
		expect(mocks.resolve).toHaveBeenCalledWith({
			cardId: CARD,
			sessionId: SESSION,
			choice: 'apply',
			userId: 'user-1',
			userClient,
			admin: mocks.admin
		});
	});

	it('maps resolver failures to their status and code', async () => {
		mocks.resolve.mockResolvedValue({
			ok: false,
			status: 410,
			code: 'CARD_EXPIRED',
			message: 'This preview expired after 24 hours. Ask Jev again. Nothing changed.'
		});
		const response = await call({ choice: 'copy', session_id: SESSION });
		expect(response.status).toBe(410);
		expect(await response.json()).toMatchObject({ success: false, code: 'CARD_EXPIRED' });
	});
});
