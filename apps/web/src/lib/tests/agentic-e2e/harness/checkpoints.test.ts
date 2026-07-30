// apps/web/src/lib/tests/agentic-e2e/harness/checkpoints.test.ts
import { describe, expect, it, vi } from 'vitest';
import { evaluateTurnCheckpoints, formatCheckpointFailures } from './checkpoints';

describe('journey checkpoints', () => {
	it('runs every checkpoint and accumulates failures in turn order', async () => {
		const finalCheck = vi.fn();
		const failures = await evaluateTurnCheckpoints({
			checkpoints: [
				{
					name: 'first miss',
					check: () => {
						throw new Error('character sheet missing');
					}
				},
				{
					name: 'passing check',
					check: () => undefined
				},
				{
					name: 'second miss',
					check: finalCheck.mockRejectedValue(new Error('plot outline stale'))
				}
			],
			turn: {} as never,
			ctx: {} as never,
			seed: {} as never,
			turnNumber: 2,
			turnLabel: 'Add character canon'
		});

		expect(finalCheck).toHaveBeenCalledOnce();
		expect(failures).toEqual([
			{
				turnNumber: 2,
				turnLabel: 'Add character canon',
				checkpoint: 'first miss',
				message: 'character sheet missing'
			},
			{
				turnNumber: 2,
				turnLabel: 'Add character canon',
				checkpoint: 'second miss',
				message: 'plot outline stale'
			}
		]);
	});

	it('formats one actionable scenario-level report', () => {
		const message = formatCheckpointFailures('book-writing-journey', [
			{
				turnNumber: 1,
				turnLabel: 'Brain dump',
				checkpoint: 'natural hierarchy',
				message: 'all documents remained at the root'
			}
		]);

		expect(message).toContain('completed all turns with 1 checkpoint failure');
		expect(message).toContain('Brain dump — natural hierarchy');
		expect(message).toContain('all documents remained at the root');
	});
});
