// apps/web/src/routes/api/chat/proposal-cards/[id]/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

const resolveProposalCard = vi.fn();
vi.mock('$lib/server/proposal-cards/proposal-card.service', () => ({
	resolveProposalCard: (...args: unknown[]) => resolveProposalCard(...args)
}));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({ admin: true }) }));

import { POST } from './+server';

const CARD = '00000000-0000-4000-8000-000000000005';
const SESSION = '00000000-0000-4000-8000-000000000003';

function event(body: unknown, user: { id: string } | null = { id: 'user-1' }): RequestEvent {
	return {
		params: { id: CARD },
		request: { json: vi.fn().mockResolvedValue(body) },
		locals: {
			supabase: { session: true },
			safeGetSession: vi.fn().mockResolvedValue({ user })
		}
	} as unknown as RequestEvent;
}

describe('POST /api/chat/proposal-cards/[id]', () => {
	it('requires a session, a choice, a session_id and a well-formed digest', async () => {
		expect((await POST(event({ choice: 'apply', session_id: SESSION }, null))).status).toBe(
			401
		);
		expect((await POST(event({ session_id: SESSION }))).status).toBe(400);
		expect((await POST(event({ choice: 'apply', session_id: 'nope' }))).status).toBe(400);
		expect(
			(await POST(event({ choice: 'apply', session_id: SESSION, seen_digest: 'abc' }))).status
		).toBe(400);
		expect(resolveProposalCard).not.toHaveBeenCalled();
	});

	it('passes the click to the resolver as the signed-in user and maps the result', async () => {
		const digest = 'a'.repeat(64);
		resolveProposalCard.mockResolvedValueOnce({
			ok: true,
			resolution: { outcome: 'applied' },
			alreadyResolved: false,
			description: { text: 'Done', href: null }
		});
		const response = await POST(
			event({ choice: 'combine', session_id: SESSION, seen_digest: digest })
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			success: true,
			message: 'Done',
			data: { resolution: { outcome: 'applied' }, already_resolved: false }
		});
		expect(resolveProposalCard).toHaveBeenCalledWith({
			cardId: CARD,
			sessionId: SESSION,
			choice: 'combine',
			seenDigest: digest,
			userId: 'user-1',
			userClient: { session: true },
			admin: { admin: true }
		});

		resolveProposalCard.mockResolvedValueOnce({
			ok: false,
			status: 409,
			code: 'PREVIEW_CHANGED',
			message: 'Changed',
			details: { digest: 'b'.repeat(64) }
		});
		const conflict = await POST(
			event({ choice: 'combine', session_id: SESSION, seen_digest: digest })
		);
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({
			success: false,
			code: 'PREVIEW_CHANGED',
			details: { digest: 'b'.repeat(64) }
		});
	});
});
