import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

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

	it('returns public projects with the admin Supabase client', async () => {
		const supabase = createSupabase([
			{
				id: 'project-1',
				name: 'Public Project',
				description: 'Shown publicly',
				props: {
					commander: 'Public lead',
					private_note: 'do not expose'
				},
				start_at: null,
				end_at: null
			}
		]);
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		const response = await GET({
			locals: {}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.projects).toHaveLength(1);
		expect(payload.data.projects[0].id).toBe('project-1');
		expect(payload.data.projects[0].props).toEqual({ commander: 'Public lead' });
	});
});
