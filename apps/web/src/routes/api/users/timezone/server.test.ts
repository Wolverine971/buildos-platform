// apps/web/src/routes/api/users/timezone/server.test.ts
import { describe, expect, it, vi } from 'vitest';

function createUsersTable(storedTimezone: string | null) {
	const update = vi.fn();
	const maybeSingle = vi.fn().mockResolvedValue({
		data: { timezone: storedTimezone },
		error: null
	});
	const from = vi.fn((table: string) => {
		if (table !== 'users') throw new Error(`Unexpected table ${table}`);
		return {
			select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
			update: vi.fn((values: Record<string, unknown>) => {
				update(values);
				return { eq: vi.fn().mockResolvedValue({ error: null }) };
			})
		};
	});
	return { from, update };
}

function createLocals(storedTimezone: string | null, authed = true) {
	const users = createUsersTable(storedTimezone);
	return {
		users,
		locals: {
			supabase: { from: users.from },
			safeGetSession: vi
				.fn()
				.mockResolvedValue(
					authed
						? { session: { user: { id: 'user-1' } }, user: { id: 'user-1' } }
						: { session: null, user: null }
				)
		}
	};
}

function postRequest(body: unknown) {
	return new Request('http://localhost/api/users/timezone', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('POST /api/users/timezone', () => {
	it('fills in a UTC placeholder with the browser zone', async () => {
		const { POST } = await import('./+server');
		const { locals, users } = createLocals('UTC');

		const response = await POST({
			request: postRequest({ timezone: 'America/New_York' }),
			locals
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({ timezone: 'America/New_York', updated: true });
		expect(users.update).toHaveBeenCalledWith({ timezone: 'America/New_York' });
	});

	it('fills in a null stored zone', async () => {
		const { POST } = await import('./+server');
		const { locals, users } = createLocals(null);

		const response = await POST({
			request: postRequest({ timezone: 'Europe/Berlin' }),
			locals
		} as any);
		const payload = await response.json();

		expect(payload.data).toEqual({ timezone: 'Europe/Berlin', updated: true });
		expect(users.update).toHaveBeenCalledTimes(1);
	});

	it('never overwrites a deliberately set non-UTC zone', async () => {
		const { POST } = await import('./+server');
		const { locals, users } = createLocals('America/Los_Angeles');

		const response = await POST({
			request: postRequest({ timezone: 'America/New_York' }),
			locals
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({ timezone: 'America/Los_Angeles', updated: false });
		expect(users.update).not.toHaveBeenCalled();
	});

	it('rejects a timezone that is not a valid IANA name', async () => {
		const { POST } = await import('./+server');
		const { locals, users } = createLocals('UTC');

		const response = await POST({
			request: postRequest({ timezone: 'Mars/Olympus_Mons' }),
			locals
		} as any);

		expect(response.status).toBe(422);
		expect(users.update).not.toHaveBeenCalled();
	});

	it('rejects a body that fails the schema', async () => {
		const { POST } = await import('./+server');
		const { locals, users } = createLocals('UTC');

		const response = await POST({ request: postRequest({}), locals } as any);

		expect(response.status).toBe(422);
		expect(users.update).not.toHaveBeenCalled();
	});

	it('rejects a body that is not JSON', async () => {
		const { POST } = await import('./+server');
		const { locals, users } = createLocals('UTC');

		const response = await POST({
			request: new Request('http://localhost/api/users/timezone', {
				method: 'POST',
				body: 'not json'
			}),
			locals
		} as any);

		expect(response.status).toBe(400);
		expect(users.update).not.toHaveBeenCalled();
	});

	it('requires an authenticated session', async () => {
		const { POST } = await import('./+server');
		const { locals, users } = createLocals('UTC', false);

		const response = await POST({
			request: postRequest({ timezone: 'America/New_York' }),
			locals
		} as any);

		expect(response.status).toBe(401);
		expect(users.from).not.toHaveBeenCalled();
	});
});
