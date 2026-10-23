// apps/web/src/routes/api/people/requests/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

const { sendReceivedEmailMock } = vi.hoisted(() => ({ sendReceivedEmailMock: vi.fn() }));

vi.mock('$lib/server/people/people-emails', () => ({
	sendPeopleRequestReceivedEmail: sendReceivedEmailMock
}));

import { GET, POST } from './+server';

beforeEach(() => {
	sendReceivedEmailMock.mockReset();
	sendReceivedEmailMock.mockResolvedValue('sent');
});

function createEvent(body?: unknown, user: unknown = { id: 'user-1' }): RequestEvent {
	return {
		request: { json: vi.fn().mockResolvedValue(body ?? {}) },
		locals: {
			supabase: { rpc: vi.fn() },
			safeGetSession: vi.fn().mockResolvedValue({ user })
		}
	} as unknown as RequestEvent;
}

const rpcOf = (event: RequestEvent) => (event.locals.supabase as any).rpc;

describe('GET /api/people/requests', () => {
	it('requires a session', async () => {
		expect((await GET(createEvent(undefined, null))).status).toBe(401);
	});

	it('returns incoming and outgoing lists', async () => {
		const event = createEvent();
		rpcOf(event).mockResolvedValue({
			data: { incoming: [{ id: 'r1' }], outgoing: [] },
			error: null
		});

		const payload = await (await GET(event)).json();
		expect(rpcOf(event)).toHaveBeenCalledWith('list_people_requests', {});
		expect(payload.data).toEqual({ incoming: [{ id: 'r1' }], outgoing: [] });
	});
});

describe('POST /api/people/requests', () => {
	it('validates the handle, role, hint, and note before calling the RPC', async () => {
		const badHandle = createEvent({ handle: 'a b' });
		expect((await POST(badHandle)).status).toBe(400);

		const badRole = createEvent({ handle: 'sam', role: 'owner' });
		expect((await POST(badRole)).status).toBe(400);

		const longHint = createEvent({ handle: 'sam', project_hint: 'x'.repeat(121) });
		expect((await POST(longHint)).status).toBe(400);

		const longNote = createEvent({ handle: 'sam', note: 'x'.repeat(501) });
		expect((await POST(longNote)).status).toBe(400);

		for (const event of [badHandle, badRole, longHint, longNote]) {
			expect(rpcOf(event)).not.toHaveBeenCalled();
		}
	});

	it('sends the request and explains the outcome', async () => {
		const event = createEvent({
			handle: '@Sam',
			role: 'editor',
			project_hint: ' 9takes ',
			note: 'Hi Sam'
		});
		rpcOf(event).mockResolvedValue({
			data: { status: 'pending', request_id: 'req-1', expires_at: '2026-11-06T00:00:00Z' },
			error: null
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(rpcOf(event)).toHaveBeenCalledWith('create_people_request', {
			p_handle: 'sam',
			p_role: 'editor',
			p_project_hint: '9takes',
			p_note: 'Hi Sam'
		});
		expect(payload.data).toMatchObject({
			status: 'pending',
			request_id: 'req-1',
			already_pending: false,
			tone: 'success'
		});
		// The person asked gets an email too.
		expect(sendReceivedEmailMock).toHaveBeenCalledWith('req-1');
	});

	it('emails only for a brand-new request', async () => {
		const alreadyWaiting = createEvent({ handle: 'sam' });
		rpcOf(alreadyWaiting).mockResolvedValue({
			data: { status: 'pending', already_pending: true, request_id: 'req-1' },
			error: null
		});
		await POST(alreadyWaiting);

		// A silent block answers "pending" with no request.
		const blocked = createEvent({ handle: 'sam' });
		rpcOf(blocked).mockResolvedValue({ data: { status: 'pending' }, error: null });
		await POST(blocked);

		const missing = createEvent({ handle: 'sam' });
		rpcOf(missing).mockResolvedValue({ data: { status: 'not_found' }, error: null });
		await POST(missing);

		expect(sendReceivedEmailMock).not.toHaveBeenCalled();
	});

	it('still answers when the email fails', async () => {
		const event = createEvent({ handle: 'sam' });
		rpcOf(event).mockResolvedValue({
			data: { status: 'pending', request_id: 'req-2' },
			error: null
		});
		sendReceivedEmailMock.mockResolvedValue('failed');

		const response = await POST(event);
		expect(response.status).toBe(200);
		expect((await response.json()).data.status).toBe('pending');
	});

	it('leaves optional fields out and defaults to viewer', async () => {
		const event = createEvent({ handle: 'sam', project_hint: '  ', note: null });
		rpcOf(event).mockResolvedValue({ data: { status: 'not_found' }, error: null });

		const payload = await (await POST(event)).json();

		expect(rpcOf(event)).toHaveBeenCalledWith('create_people_request', {
			p_handle: 'sam',
			p_role: 'viewer'
		});
		expect(payload.data.status).toBe('not_found');
		expect(payload.data.message).toContain('No one with that handle');
	});

	it.each([
		['self', undefined, 'your own handle'],
		['declined_recently', undefined, '30 days'],
		['rate_limited', 'too_many_pending', '10 requests']
	])('maps %s to a plain message', async (status, reason, expected) => {
		const event = createEvent({ handle: 'sam' });
		rpcOf(event).mockResolvedValue({ data: { status, reason }, error: null });

		const payload = await (await POST(event)).json();
		expect(payload.data.status).toBe(status);
		expect(payload.data.message).toContain(expected);
	});

	it('passes RPC validation errors through as 400s', async () => {
		const event = createEvent({ handle: 'sam' });
		rpcOf(event).mockResolvedValue({
			data: null,
			error: { code: '22023', message: 'Role must be viewer or editor' }
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Role must be viewer or editor');
	});
});
