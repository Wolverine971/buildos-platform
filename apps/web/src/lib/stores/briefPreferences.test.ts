// apps/web/src/lib/stores/briefPreferences.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { briefPreferencesStore } from './briefPreferences';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

const LOADED_ROW = {
	id: 'pref-1',
	user_id: 'user-1',
	frequency: 'weekly' as const,
	day_of_week: 3,
	time_of_day: '08:30:00',
	is_active: true,
	timezone: 'America/New_York',
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-02T00:00:00Z'
};

// Mirrors the strict zod schema in routes/api/brief-preferences/+server.ts.
const ALLOWED_KEYS = ['frequency', 'day_of_week', 'time_of_day', 'timezone', 'is_active'];

function postedBody(fetchMock: ReturnType<typeof vi.fn>) {
	const call = fetchMock.mock.calls.find(
		([url, init]) => url === '/api/brief-preferences' && init?.method === 'POST'
	);
	expect(call).toBeDefined();
	return JSON.parse(call![1].body as string) as Record<string, unknown>;
}

describe('briefPreferencesStore.save', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		briefPreferencesStore.reset();
		fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url === '/api/brief-preferences' && init?.method === 'POST') {
				const body = JSON.parse(init.body as string);
				return jsonResponse({ success: true, data: { preferences: body } });
			}
			if (url === '/api/brief-preferences') {
				return jsonResponse({ success: true, data: { preferences: LOADED_ROW } });
			}
			return jsonResponse({ success: true, data: { jobs: [] } });
		});
		vi.stubGlobal('fetch', fetchMock);
		await briefPreferencesStore.load();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		briefPreferencesStore.reset();
	});

	it('posts only the writable fields when a caller spreads the loaded row', async () => {
		await briefPreferencesStore.save({ ...LOADED_ROW, time_of_day: '07:00:00' });

		const body = postedBody(fetchMock);
		expect(Object.keys(body).sort()).toEqual([...ALLOWED_KEYS].sort());
		expect(body).toEqual({
			frequency: 'weekly',
			day_of_week: 3,
			time_of_day: '07:00:00',
			is_active: true,
			timezone: 'America/New_York'
		});
	});

	it('reset sends defaults with the stored timezone instead of failing validation', async () => {
		await briefPreferencesStore.resetToDefaults();

		const body = postedBody(fetchMock);
		expect(Object.keys(body).sort()).toEqual([...ALLOWED_KEYS].sort());
		expect(body).toMatchObject({
			frequency: 'daily',
			time_of_day: '09:00:00',
			is_active: false,
			timezone: 'America/New_York'
		});
	});

	it('falls back to the browser timezone when none is known', async () => {
		briefPreferencesStore.reset();
		await briefPreferencesStore.save({
			frequency: 'daily',
			day_of_week: null,
			time_of_day: '09:00:00',
			is_active: true
		});

		const body = postedBody(fetchMock);
		expect(typeof body.timezone).toBe('string');
		expect((body.timezone as string).length).toBeGreaterThan(0);
	});
});
