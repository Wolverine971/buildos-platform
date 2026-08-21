// apps/web/src/lib/tests/agentic-e2e/harness/evidence-checks.test.ts
import { describe, expect, it } from 'vitest';

import { evaluateTurnEvidenceChecks } from './evidence-checks';
import type { ScenarioContext, SeedResult, TurnResult } from './types';

describe('evaluateTurnEvidenceChecks', () => {
	it('runs every diagnostic independently and preserves not-applicable checks', async () => {
		const results = await evaluateTurnEvidenceChecks({
			checks: [
				{
					name: 'stream-health',
					category: 'transport',
					check: () => undefined
				},
				{
					name: 'resume-done',
					category: 'effect',
					check: () => {
						throw new Error('resume remained todo');
					}
				},
				{
					name: 'worker-contract-approved',
					category: 'contract',
					applies: (ctx) => ctx.executionMode === 'worker_realtime',
					check: () => undefined
				}
			],
			turn: {} as TurnResult,
			ctx: { executionMode: 'legacy_sse' } as ScenarioContext,
			seed: { entityIds: {}, notes: {} } satisfies SeedResult
		});

		expect(results).toEqual([
			{ name: 'stream-health', category: 'transport', status: 'passed', error: null },
			{
				name: 'resume-done',
				category: 'effect',
				status: 'failed',
				error: 'resume remained todo'
			},
			{
				name: 'worker-contract-approved',
				category: 'contract',
				status: 'not_applicable',
				error: null
			}
		]);
	});
});
