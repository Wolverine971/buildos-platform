// apps/web/src/routes/api/calendar/dashboard/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listConnectionsMock } = vi.hoisted(() => ({ listConnectionsMock: vi.fn() }));

vi.mock('$env/dynamic/private', () => ({
	env: {
		PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
		PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: 'user-1'
	}
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: vi.fn(() => ({ role: 'service' }))
}));

vi.mock('$lib/server/google-calendar-connection.service', () => ({
	GoogleCalendarConnectionService: vi.fn().mockImplementation(function () {
		return { listConnections: listConnectionsMock };
	})
}));

import { GET } from './+server';

const START = '2026-08-30T04:00:00.000Z';
const END = '2026-10-04T04:00:00.000Z';

function createSupabase(
	options: {
		preferences?: Record<string, boolean> | null;
		items?: Record<string, unknown>[];
		projects?: Record<string, unknown>[];
	} = {}
) {
	const maybeSingle = vi.fn().mockResolvedValue({
		data: options.preferences ?? null,
		error: null
	});
	const eq = vi.fn(() => ({ maybeSingle }));
	const inFilter = vi.fn().mockResolvedValue({ data: options.projects ?? [], error: null });
	const select = vi.fn(() => ({ eq, in: inFilter }));
	return {
		rpc: vi.fn().mockResolvedValue({
			data: options.items ?? [
				{ calendar_item_id: 'item-1', item_type: 'task', item_kind: 'due' }
			],
			error: null
		}),
		from: vi.fn(() => ({ select })),
		select,
		inFilter
	};
}

function callGet(params: Record<string, string>, supabase = createSupabase(), userId = 'user-1') {
	const url = new URL('http://localhost/api/calendar/dashboard');
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return GET({
		url,
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user: userId ? { id: userId } : null }),
			supabase
		}
	} as any);
}

describe('GET /api/calendar/dashboard', () => {
	beforeEach(() => {
		listConnectionsMock.mockReset();
	});

	it('rejects signed-out requests', async () => {
		const response = await callGet({ start: START, end: END }, createSupabase(), '');
		expect(response.status).toBe(401);
	});

	it('rejects an inverted range', async () => {
		const response = await callGet({ start: END, end: START });
		expect(response.status).toBe(400);
	});

	it('returns every layer without meta by default', async () => {
		const supabase = createSupabase();
		const response = await callGet({ start: START, end: END }, supabase);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(supabase.rpc).toHaveBeenCalledWith('list_calendar_items', {
			p_start: START,
			p_end: END,
			p_include_events: true,
			p_include_task_range: true,
			p_include_task_start: true,
			p_include_task_due: true,
			p_limit: 2000
		});
		expect(supabase.from).not.toHaveBeenCalled();
		expect(listConnectionsMock).not.toHaveBeenCalled();
		expect(body.data.items).toHaveLength(1);
		expect(body.data.meta).toBeUndefined();
	});

	it('bundles display preferences and connections when meta=1', async () => {
		const connections = { available: true, maxConnections: 3, connections: [] };
		listConnectionsMock.mockResolvedValue(connections);
		const supabase = createSupabase({ preferences: { show_task_due: false } as any });

		const response = await callGet({ start: START, end: END, meta: '1' }, supabase);
		const body = await response.json();

		expect(supabase.from).toHaveBeenCalledWith('user_calendar_preferences');
		expect(body.data.meta).toEqual({
			preferences: {
				show_events: true,
				show_task_scheduled: true,
				show_task_start: true,
				show_task_due: false
			},
			connections,
			connectionsError: false
		});
	});

	it('still returns items when listing connections fails', async () => {
		listConnectionsMock.mockRejectedValue(new Error('google down'));
		const response = await callGet({ start: START, end: END, meta: '1' });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.items).toHaveLength(1);
		expect(body.data.meta.connections).toBeNull();
		expect(body.data.meta.connectionsError).toBe(true);
	});

	it('labels items with their projects in one lookup', async () => {
		const supabase = createSupabase({
			items: [
				{ calendar_item_id: 'a', project_id: 'project-1' },
				{ calendar_item_id: 'b', project_id: 'project-1' },
				{ calendar_item_id: 'c', project_id: null }
			],
			projects: [
				{
					id: 'project-1',
					name: 'Samos Offers',
					state_key: 'active',
					description: 'x'.repeat(500),
					facet_stage: null,
					facet_scale: null
				}
			]
		});

		const response = await callGet({ start: START, end: END }, supabase);
		const body = await response.json();

		expect(supabase.from).toHaveBeenCalledWith('onto_projects');
		expect(supabase.inFilter).toHaveBeenCalledWith('id', ['project-1']);
		expect(body.data.projects['project-1'].name).toBe('Samos Offers');
		expect(body.data.projects['project-1'].description.length).toBe(401);
	});

	it('skips the connection list for users without multi-calendar access', async () => {
		const response = await callGet(
			{ start: START, end: END, meta: '1' },
			createSupabase(),
			'user-2'
		);
		const body = await response.json();

		expect(listConnectionsMock).not.toHaveBeenCalled();
		expect(body.data.meta.connections).toBeNull();
		expect(body.data.meta.connectionsError).toBe(false);
	});
});
