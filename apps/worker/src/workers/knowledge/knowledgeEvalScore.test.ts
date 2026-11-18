// apps/worker/src/workers/knowledge/knowledgeEvalScore.test.ts
import { describe, expect, it } from 'vitest';
import {
	foundFromBatch,
	scoreEntry,
	totals,
	valueMatches,
	type EvalTruthEntry
} from './knowledgeEvalScore';

const CODY: EvalTruthEntry = {
	entity_id: 'cody',
	name: 'Cody Shooting Complex',
	kind: 'org',
	group: 'client',
	circle: 'inner',
	bakeoff: true,
	truth: {
		homepage: 'codyshootingcomplex.org',
		located_in: 'Cody, WY',
		industry: 'shooting range'
	},
	not: [{ label: 'Cody Shooting Complex in Long Grove, IA', domains: ['iowadnr.gov'] }]
};

describe('eval scoring', () => {
	it('matches values by field', () => {
		expect(
			valueMatches(
				'homepage',
				'codyshootingcomplex.org',
				'https://www.codyshootingcomplex.org/about'
			)
		).toBe(true);
		expect(valueMatches('located_in', 'Cody, WY', 'Cody, Wyoming')).toBe(true);
		expect(valueMatches('located_in', 'Cody, WY', 'Long Grove, Iowa')).toBe(false);
		expect(
			valueMatches('works_at', 'LA Industrial Services LLC', 'LA Industrial Services')
		).toBe(true);
		expect(valueMatches('industry', 'shooting range', 'Shooting Range')).toBe(true);
	});

	it('flags the wrong same-name entity and counts what was right', () => {
		const batch = {
			entities: [{ ref: 'town', kind: 'place' as const, name: 'Long Grove, Iowa' }],
			sources: [{ ref: 'p1', type: 'web' as const, url: 'https://www.iowadnr.gov/cody' }],
			facts: [
				{
					subject: 'cody',
					predicate: 'located_in',
					object: 'town',
					sources: ['p1'],
					status: 'active' as const
				},
				{
					subject: 'cody',
					predicate: 'industry',
					value: 'Shooting range',
					sources: ['p1'],
					status: 'active' as const
				},
				{
					subject: 'cody',
					predicate: 'homepage',
					value: 'https://codyshootingcomplex.org',
					status: 'suggested' as const
				}
			]
		};
		const score = scoreEntry(CODY, foundFromBatch(batch, 'cody'));
		expect(score.fields.located_in?.result).toBe('wrong');
		expect(score.fields.industry?.result).toBe('correct');
		expect(score.fields.homepage?.result).toBe('missing');
		expect(score.suggestedCorrect).toBe(1);
		expect(score.wrongEntity).toBe(true);
		expect(totals([score], 1)).toMatchObject({
			correct: 1,
			wrong: 1,
			precision: 0.5,
			wrongEntityRate: 1
		});
	});

	it("doesn't count what the user already had as a filled gap", () => {
		const score = scoreEntry(
			CODY,
			[
				{
					predicate: 'homepage',
					value: 'codyshootingcomplex.org',
					status: 'active',
					sourceUrl: null
				}
			],
			[{ predicate: 'homepage', value: 'https://codyshootingcomplex.org' }]
		);
		expect(score).toMatchObject({ correct: 1, gapsFilled: 0, missing: 2 });
		expect(score.fields.located_in?.result).toBe('missing');
	});
});
