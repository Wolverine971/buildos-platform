// apps/web/src/lib/services/project-calendar-source-routing.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ProjectCalendarService } from './project-calendar.service';

function createSupabase(
	options: { projectCalendar?: Record<string, any>; insertError?: Error } = {}
) {
	const inserts: any[] = [];
	const deletes: string[] = [];
	const project = {
		id: 'project-1',
		name: 'Launch',
		description: 'Ship it',
		props: {}
	};
	const from = vi.fn((table: string) => {
		let action: 'select' | 'insert' | 'update' | 'delete' = 'select';
		let inserted: any;
		const result = () => {
			if (action === 'insert') {
				return options.insertError
					? { data: null, error: options.insertError }
					: { data: { id: 'mapping-1', ...inserted }, error: null };
			}
			if (action === 'update' || action === 'delete') return { data: null, error: null };
			if (table === 'onto_projects') return { data: project, error: null };
			if (table === 'users') {
				return { data: { timezone: 'America/New_York' }, error: null };
			}
			if (table === 'project_calendars') {
				return { data: options.projectCalendar ?? null, error: null };
			}
			return { data: null, error: null };
		};
		const query: any = {
			select: vi.fn(() => query),
			eq: vi.fn(() => query),
			is: vi.fn(() => query),
			insert: vi.fn((value: any) => {
				action = 'insert';
				inserted = value;
				inserts.push(value);
				return query;
			}),
			update: vi.fn(() => {
				action = 'update';
				return query;
			}),
			delete: vi.fn(() => {
				action = 'delete';
				deletes.push(table);
				return query;
			}),
			single: vi.fn(async () => result()),
			maybeSingle: vi.fn(async () => result()),
			then: (resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) =>
				Promise.resolve(result()).then(resolve, reject)
		};
		return query;
	});
	return { client: { from } as any, inserts, deletes };
}

function gateway() {
	return {
		resolveLinkedSource: vi.fn().mockResolvedValue({
			calendarSourceId: 'source-b',
			connectionId: 'connection-b',
			providerCalendarId: 'work@example.com',
			summary: 'Work',
			colorId: '6'
		}),
		createCalendar: vi.fn().mockResolvedValue({
			calendarSourceId: 'created-source',
			connectionId: 'connection-b',
			providerCalendarId: 'launch@example.com',
			summary: 'Launch - Tasks',
			colorId: '7'
		}),
		updateCalendar: vi.fn().mockResolvedValue(undefined),
		deleteCalendar: vi.fn().mockResolvedValue(undefined),
		shareCalendar: vi.fn().mockResolvedValue(undefined)
	};
}

describe('ProjectCalendarService source routing', () => {
	it('stores source identity and unlink-only provenance for an existing calendar', async () => {
		const supabase = createSupabase();
		const resources = gateway();
		const service = new ProjectCalendarService(supabase.client, {
			projectResourceService: resources
		});

		const response = await service.createProjectCalendar({
			projectId: 'project-1',
			userId: 'user-1',
			calendarSourceId: 'source-b'
		});

		expect(response.status).toBe(200);
		expect(resources.resolveLinkedSource).toHaveBeenCalledWith('user-1', 'source-b');
		expect(supabase.inserts[0]).toMatchObject({
			calendar_source_id: 'source-b',
			calendar_id: 'work@example.com',
			provider_resource_managed: false
		});
	});

	it('marks a calendar created through the selected connection as provider-managed', async () => {
		const supabase = createSupabase();
		const resources = gateway();
		const service = new ProjectCalendarService(supabase.client, {
			projectResourceService: resources
		});

		const response = await service.createProjectCalendar({
			projectId: 'project-1',
			userId: 'user-1',
			connectionId: 'connection-b'
		});

		expect(response.status).toBe(200);
		expect(resources.createCalendar).toHaveBeenCalledWith(
			expect.objectContaining({ connectionId: 'connection-b' })
		);
		expect(supabase.inserts[0]).toMatchObject({
			calendar_source_id: 'created-source',
			calendar_id: 'launch@example.com',
			provider_resource_managed: true
		});
	});

	it('unlinks an existing calendar without deleting the provider resource', async () => {
		const supabase = createSupabase({
			projectCalendar: {
				id: 'mapping-1',
				project_id: 'project-1',
				user_id: 'user-1',
				calendar_id: 'work@example.com',
				calendar_source_id: 'source-b',
				provider_resource_managed: false
			}
		});
		const resources = gateway();
		const service = new ProjectCalendarService(supabase.client, {
			projectResourceService: resources
		});

		const response = await service.deleteProjectCalendar('project-1', 'user-1');

		expect(response.status).toBe(200);
		expect(resources.deleteCalendar).not.toHaveBeenCalled();
		expect(supabase.deletes).toEqual(['project_calendars']);
	});

	it('keeps unlink-only safety even when the multi-calendar runtime is disabled', async () => {
		const supabase = createSupabase({
			projectCalendar: {
				id: 'mapping-1',
				project_id: 'project-1',
				user_id: 'user-1',
				calendar_id: 'work@example.com',
				calendar_source_id: 'source-b',
				provider_resource_managed: false
			}
		});
		const service = new ProjectCalendarService(supabase.client);
		const legacyDelete = vi.spyOn((service as any).calendarService, 'deleteProjectCalendar');

		const response = await service.deleteProjectCalendar('project-1', 'user-1');

		expect(response.status).toBe(200);
		expect(legacyDelete).not.toHaveBeenCalled();
		expect(supabase.deletes).toEqual(['project_calendars']);
	});

	it('does not orphan a managed provider calendar when source routing is unavailable', async () => {
		const supabase = createSupabase({
			projectCalendar: {
				id: 'mapping-1',
				project_id: 'project-1',
				user_id: 'user-1',
				calendar_id: 'launch@example.com',
				calendar_source_id: 'created-source',
				provider_resource_managed: true
			}
		});
		const service = new ProjectCalendarService(supabase.client);

		const response = await service.deleteProjectCalendar('project-1', 'user-1');

		expect(response.status).toBe(409);
		expect(supabase.deletes).toEqual([]);
	});

	it('deletes a provider calendar only when BuildOS owns it and the source is stored', async () => {
		const supabase = createSupabase({
			projectCalendar: {
				id: 'mapping-1',
				project_id: 'project-1',
				user_id: 'user-1',
				calendar_id: 'launch@example.com',
				calendar_source_id: 'created-source',
				provider_resource_managed: true
			}
		});
		const resources = gateway();
		const service = new ProjectCalendarService(supabase.client, {
			projectResourceService: resources
		});

		const response = await service.deleteProjectCalendar('project-1', 'user-1');

		expect(response.status).toBe(200);
		expect(resources.deleteCalendar).toHaveBeenCalledWith({
			userId: 'user-1',
			calendarSourceId: 'created-source'
		});
	});

	it('shares through the project source instead of the singleton account', async () => {
		const supabase = createSupabase({
			projectCalendar: {
				id: 'mapping-1',
				project_id: 'project-1',
				user_id: 'user-1',
				calendar_id: 'work@example.com',
				calendar_source_id: 'source-b',
				provider_resource_managed: false
			}
		});
		const resources = gateway();
		const service = new ProjectCalendarService(supabase.client, {
			projectResourceService: resources
		});
		const legacyShare = vi.spyOn((service as any).calendarService, 'shareCalendar');

		const response = await service.shareProjectCalendar('project-1', 'user-1', [
			{ email: 'teammate@example.com', role: 'writer' }
		]);

		expect(response.status).toBe(200);
		expect(resources.shareCalendar).toHaveBeenCalledWith({
			userId: 'user-1',
			calendarSourceId: 'source-b',
			shares: [{ email: 'teammate@example.com', role: 'writer' }]
		});
		expect(legacyShare).not.toHaveBeenCalled();
	});
});
