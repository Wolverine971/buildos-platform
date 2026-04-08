import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './+server';

function createSupabase(projects: unknown[]) {
	const queryResult = {
		data: projects,
		error: null
	};

	const queryBuilder: any = {
		select: vi.fn(() => queryBuilder),
		eq: vi.fn(() => queryBuilder),
		is: vi.fn(() => queryBuilder),
		order: vi.fn(() => Promise.resolve(queryResult))
	};

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_projects') return queryBuilder;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

describe('GET /api/public/projects', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns public projects with the session-scoped Supabase client', async () => {
		const response = await GET({
			locals: {
				supabase: createSupabase([
					{
						id: 'project-1',
						name: 'Public Project',
						description: 'Shown publicly'
					}
				])
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.projects).toHaveLength(1);
		expect(payload.data.projects[0].id).toBe('project-1');
	});
});
