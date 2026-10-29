// apps/mobile/tests/api.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, signOut } = vi.hoisted(() => ({
	getSession: vi.fn(),
	signOut: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession, signOut } } }));
vi.mock('@/lib/env', () => ({ config: { apiBaseUrl: 'http://192.168.1.20:5199' } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.1.0' } } }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { api } from '@/lib/api';

describe('mobile API authentication', () => {
	const fetchMock = vi.fn<typeof fetch>();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', fetchMock);
		getSession.mockResolvedValue({
			data: { session: { access_token: 'signed-in-token' } },
			error: null
		});
	});

	afterEach(() => vi.unstubAllGlobals());

	it('keeps a signed-in session when the backend rejects its bearer token', async () => {
		fetchMock.mockResolvedValue(
			Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
		);

		await expect(api.today.get()).rejects.toMatchObject({ status: 401 });
		expect(fetchMock).toHaveBeenCalledWith(
			'http://192.168.1.20:5199/api/today',
			expect.objectContaining({
				headers: expect.objectContaining({ authorization: 'Bearer signed-in-token' })
			})
		);
		expect(signOut).not.toHaveBeenCalled();
	});

	it('can retry the failed request with the current session', async () => {
		fetchMock
			.mockResolvedValueOnce(
				Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
			)
			.mockResolvedValueOnce(Response.json({ success: true, data: { feed: { tasks: [] } } }));

		await expect(api.today.get()).rejects.toMatchObject({ status: 401 });
		getSession.mockResolvedValue({
			data: { session: { access_token: 'refreshed-token' } },
			error: null
		});
		await expect(api.today.get()).resolves.toEqual({ feed: { tasks: [] } });
		expect(fetchMock).toHaveBeenLastCalledWith(
			'http://192.168.1.20:5199/api/today',
			expect.objectContaining({
				headers: expect.objectContaining({ authorization: 'Bearer refreshed-token' })
			})
		);
		expect(signOut).not.toHaveBeenCalled();
	});
});
