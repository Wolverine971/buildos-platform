// apps/web/src/routes/api/onto/entities/[entityType]/[entityId]/logs/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

describe('GET /api/onto/entities/[entityType]/[entityId]/logs', () => {
	it('loads logs for entityType=event', async () => {
		const logsQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			range: vi.fn().mockResolvedValue({
				data: [
					{
						id: 'log-1',
						entity_type: 'event',
						entity_id: 'event-1',
						action: 'updated',
						before_data: null,
						after_data: null,
						changed_by: null,
						changed_by_actor_id: null,
						created_at: new Date().toISOString(),
						change_source: null
					}
				],
				error: null,
				count: 1
			})
		};

		const eventQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: { project_id: 'project-1' }, error: null })
		};

		const supabase = {
			rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
			from: vi.fn((table: string) => {
				if (table === 'onto_events') return eventQuery;
				if (table === 'onto_project_logs') return logsQuery;
				return {};
			})
		};

		const { GET } = await import('./+server');

		const requestEvent = {
			params: { entityType: 'event', entityId: 'event-1' },
			url: new URL('http://localhost/api/onto/entities/event/event-1/logs?limit=5&offset=0'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent;

		const response = await GET(requestEvent);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.entityType).toBe('event');
		expect(payload.data.entityId).toBe('event-1');

		expect(supabase.from).toHaveBeenCalledWith('onto_events');
		expect(supabase.from).toHaveBeenCalledWith('onto_project_logs');

		expect(eventQuery.eq).toHaveBeenCalledWith('id', 'event-1');

		expect(logsQuery.eq).toHaveBeenNthCalledWith(1, 'entity_type', 'event');
		expect(logsQuery.eq).toHaveBeenNthCalledWith(2, 'entity_id', 'event-1');
		expect(logsQuery.range).toHaveBeenCalledWith(0, 4);

		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: 'project-1',
			p_required_access: 'read'
		});
	});
});

