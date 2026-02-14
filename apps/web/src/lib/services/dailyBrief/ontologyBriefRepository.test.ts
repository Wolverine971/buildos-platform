// apps/web/src/lib/services/dailyBrief/ontologyBriefRepository.test.ts
import { describe, expect, it, vi } from 'vitest';
import { OntologyBriefRepository } from './ontologyBriefRepository';

type InsertOutcome = {
	data: { id: string } | null;
	error: { code?: string; message?: string } | null;
};

function createSupabaseInsertMock(outcome: InsertOutcome) {
	const single = vi.fn().mockResolvedValue(outcome);
	const select = vi.fn().mockReturnValue({ single });
	const insert = vi.fn().mockReturnValue({ select });
	const from = vi.fn().mockImplementation((table: string) => {
		if (table !== 'ontology_daily_briefs') {
			throw new Error(`Unexpected table: ${table}`);
		}
		return { insert };
	});

	return {
		client: { from } as any,
		mocks: { from, insert, select, single }
	};
}

describe('OntologyBriefRepository.startGeneration', () => {
	it('creates a new snapshot row when forcing regenerate from a completed brief', async () => {
		const { client, mocks } = createSupabaseInsertMock({
			data: { id: 'brief-new' },
			error: null
		});
		const repo = new OntologyBriefRepository(client);
		const latestSpy = vi.spyOn(repo as any, 'getLatestBriefByUserAndDate');
		latestSpy.mockResolvedValueOnce({
			id: 'brief-old',
			generation_status: 'completed'
		});
		latestSpy.mockResolvedValueOnce(null);

		const result = await repo.startGeneration('user-1', 'actor-1', '2026-02-14', true);

		expect(result).toEqual({
			started: true,
			briefId: 'brief-new',
			message: 'Brief regeneration started (new snapshot)'
		});
		expect(mocks.insert).toHaveBeenCalledTimes(1);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: 'user-1',
				actor_id: 'actor-1',
				brief_date: '2026-02-14',
				generation_status: 'processing'
			})
		);
		expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({
			metadata: expect.objectContaining({
				generatedVia: 'ontology_v1',
				regeneratedFromBriefId: 'brief-old'
			})
		});
	});

	it('returns existing processing brief when insert hits processing-lock unique conflict', async () => {
		const { client } = createSupabaseInsertMock({
			data: null,
			error: { code: '23505', message: 'duplicate key value violates unique constraint' }
		});
		const repo = new OntologyBriefRepository(client);
		const latestSpy = vi.spyOn(repo as any, 'getLatestBriefByUserAndDate');
		latestSpy.mockResolvedValueOnce({
			id: 'brief-old',
			generation_status: 'completed'
		});
		latestSpy.mockResolvedValueOnce(null);
		latestSpy.mockResolvedValueOnce({
			id: 'brief-processing',
			generation_status: 'processing'
		});

		const result = await repo.startGeneration('user-1', 'actor-1', '2026-02-14', true);

		expect(result).toEqual({
			started: false,
			briefId: 'brief-processing',
			message: 'Brief generation already in progress'
		});
	});

	it('returns existing completed brief when regenerate is not forced', async () => {
		const { client, mocks } = createSupabaseInsertMock({
			data: { id: 'unused' },
			error: null
		});
		const repo = new OntologyBriefRepository(client);
		const latestSpy = vi.spyOn(repo as any, 'getLatestBriefByUserAndDate');
		latestSpy.mockResolvedValueOnce({
			id: 'brief-existing',
			generation_status: 'completed'
		});
		latestSpy.mockResolvedValueOnce(null);

		const result = await repo.startGeneration('user-1', 'actor-1', '2026-02-14', false);

		expect(result).toEqual({
			started: false,
			briefId: 'brief-existing',
			message: 'Brief already exists for this date'
		});
		expect(mocks.insert).not.toHaveBeenCalled();
	});
});
