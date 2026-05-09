// apps/web/src/routes/api/onto/assets/shared.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ensureEntityInProject, isEntityKind } from './shared';

describe('asset route shared helpers', () => {
	it('recognizes events as valid asset link entities', () => {
		expect(isEntityKind('event')).toBe(true);
	});

	it('validates event entities against onto_events', async () => {
		const maybeSingle = vi.fn().mockResolvedValue({
			data: {
				id: 'event-1',
				project_id: 'project-1',
				deleted_at: null
			},
			error: null
		});
		const query: any = {
			select: vi.fn(() => query),
			eq: vi.fn(() => query),
			maybeSingle
		};
		const supabase = {
			from: vi.fn(() => query)
		};

		const result = await ensureEntityInProject(supabase as any, {
			projectId: 'project-1',
			entityKind: 'event',
			entityId: 'event-1'
		});

		expect(result).toEqual({ ok: true });
		expect(supabase.from).toHaveBeenCalledWith('onto_events');
		expect(query.select).toHaveBeenCalledWith('id, project_id, deleted_at');
		expect(query.eq).toHaveBeenCalledWith('id', 'event-1');
	});
});
