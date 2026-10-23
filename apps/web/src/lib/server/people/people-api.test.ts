// apps/web/src/lib/server/people/people-api.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	hideHandleInviteEmail,
	normalizeHandle,
	peopleRpcErrorResponse,
	resolveHandleInvitee
} from './people-api';

function usersQuery(result: { data: unknown; error: unknown }) {
	const builder: Record<string, any> = {};
	for (const method of ['select', 'ilike', 'eq', 'is', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.maybeSingle = vi.fn().mockResolvedValue(result);
	return builder;
}

describe('normalizeHandle', () => {
	it('strips @, trims, and lowercases', () => {
		expect(normalizeHandle(' @Sam-Lee ')).toBe('sam-lee');
		expect(normalizeHandle('@@dj')).toBeNull(); // too short once stripped
		expect(normalizeHandle('@@abc')).toBe('abc');
	});

	it('rejects anything that is not a handle', () => {
		expect(normalizeHandle('ab')).toBeNull();
		expect(normalizeHandle('a'.repeat(25))).toBeNull();
		expect(normalizeHandle('sam_lee')).toBeNull();
		expect(normalizeHandle('-sam')).toBeNull();
		expect(normalizeHandle('sam--lee')).toBeNull();
		expect(normalizeHandle('sam@example.com')).toBeNull();
		expect(normalizeHandle(42)).toBeNull();
	});
});

describe('peopleRpcErrorResponse', () => {
	it('passes the RPC sentence through with a matching status', async () => {
		const bad = peopleRpcErrorResponse(
			{ code: '22023', message: 'Choose at least one project to share' },
			'x'
		);
		expect(bad.status).toBe(400);
		expect((await bad.json()).error).toBe('Choose at least one project to share');

		const forbidden = peopleRpcErrorResponse(
			{ code: '42501', message: 'You can only share projects you own' },
			'x'
		);
		expect(forbidden.status).toBe(403);
		expect((await forbidden.json()).error).toBe('You can only share projects you own');

		const missing = peopleRpcErrorResponse(
			{ code: 'P0002', message: 'Request not found' },
			'x'
		);
		expect(missing.status).toBe(404);
	});

	it('hides unexpected database errors', async () => {
		const response = peopleRpcErrorResponse(
			{ code: 'XX000', message: 'relation does not exist' },
			'x'
		);
		expect(response.status).toBe(500);
		expect((await response.json()).error).not.toContain('relation');
	});
});

describe('resolveHandleInvitee', () => {
	it('returns the findable account behind a handle', async () => {
		const query = usersQuery({
			data: {
				id: 'user-sam',
				username: 'sam',
				email: 'Sam@Example.com',
				name: 'Sam',
				discoverability: 'handle',
				deletion_status: null,
				access_restricted: false
			},
			error: null
		});
		const admin = { from: vi.fn(() => query) };

		await expect(resolveHandleInvitee(admin, 'sam')).resolves.toEqual({
			userId: 'user-sam',
			username: 'sam',
			email: 'sam@example.com',
			name: 'Sam'
		});
		expect(admin.from).toHaveBeenCalledWith('users');
		expect(query.ilike).toHaveBeenCalledWith('username', 'sam');
		expect(query.eq).toHaveBeenCalledWith('discoverability', 'handle');
		expect(query.is).toHaveBeenCalledWith('deletion_status', null);
	});

	it('treats restricted or missing accounts as not found', async () => {
		const restricted = usersQuery({
			data: { id: 'u', username: 'sam', email: 'sam@example.com', access_restricted: true },
			error: null
		});
		await expect(resolveHandleInvitee({ from: () => restricted }, 'sam')).resolves.toBeNull();

		const missing = usersQuery({ data: null, error: null });
		await expect(resolveHandleInvitee({ from: () => missing }, 'sam')).resolves.toBeNull();
	});
});

describe('hideHandleInviteEmail', () => {
	it('nulls the email only on handle invites', () => {
		expect(
			hideHandleInviteEmail({
				id: '1',
				invitee_email: 'sam@example.com',
				invitee_handle: 'sam'
			})
		).toEqual({ id: '1', invitee_email: null, invitee_handle: 'sam' });
		expect(
			hideHandleInviteEmail({
				id: '2',
				invitee_email: 'lee@example.com',
				invitee_handle: null
			})
		).toEqual({ id: '2', invitee_email: 'lee@example.com', invitee_handle: null });
	});
});
