// apps/worker/tests/ontologyBriefGenerator.projectless.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	getActorIdForUser: vi.fn(),
	loadUserOntologyData: vi.fn(),
	loadRecentlyPausedProjects: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mocks.from
	}
}));

vi.mock('../src/workers/brief/ontologyBriefDataLoader', () => ({
	getWorkMode: vi.fn(() => null),
	OntologyBriefDataLoader: class {
		getActorIdForUser = mocks.getActorIdForUser;
		loadUserOntologyData = mocks.loadUserOntologyData;
		loadRecentlyPausedProjects = mocks.loadRecentlyPausedProjects;
	}
}));

import { generateOntologyDailyBrief } from '../src/workers/brief/ontologyBriefGenerator';

describe('generateOntologyDailyBrief project eligibility preflight', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getActorIdForUser.mockResolvedValue('actor-1');
		mocks.loadUserOntologyData.mockResolvedValue([]);
		mocks.loadRecentlyPausedProjects.mockResolvedValue([]);
	});

	it('returns a successful skip without creating a failed brief row', async () => {
		const result = await generateOntologyDailyBrief('user-1', '2026-09-21', undefined, 'UTC');

		expect(result).toEqual({
			status: 'skipped_no_projects',
			userId: 'user-1',
			actorId: 'actor-1',
			briefDate: '2026-09-21'
		});
		expect(mocks.loadUserOntologyData).toHaveBeenCalledWith(
			'user-1',
			'actor-1',
			expect.any(Date),
			'UTC'
		);
		expect(mocks.from).not.toHaveBeenCalledWith('ontology_daily_briefs');
	});
});
