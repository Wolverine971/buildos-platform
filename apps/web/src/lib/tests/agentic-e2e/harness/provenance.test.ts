// apps/web/src/lib/tests/agentic-e2e/harness/provenance.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	verifyBatteryServices,
	verifyTurnWorkerProvenance,
	type BatteryProvenance
} from './provenance';
const expected = { version: 1 as const, gitSha: 'a'.repeat(40), dirtyTreeSha256: 'b'.repeat(64) };
vi.mock('@buildos/agentic-chat-runtime/provenance', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	readSourceProvenance: () => ({
		version: 1,
		gitSha: 'a'.repeat(40),
		dirtyTreeSha256: 'b'.repeat(64)
	})
}));
beforeEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
function record(): BatteryProvenance {
	return { expected, worker: null, web: null, verified: false, error: null };
}
describe('battery provenance fence', () => {
	it('accepts identical web, worker and checkout with the same lane flag', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({ provenance: expected, mutationBatchLaneEnabled: true })
			)
		);
		const result = record();
		await verifyBatteryServices(result, 'http://web', 'http://worker');
		expect(result.verified).toBe(true);
	});
	it.each(['missing', 'old-sha', 'old-dirty-tree', 'wrong-lane'])(
		'refuses %s before any battery turns',
		async (kind) => {
			const provenance =
				kind === 'missing'
					? null
					: {
							...expected,
							...(kind === 'old-sha' ? { gitSha: 'c'.repeat(40) } : {}),
							...(kind === 'old-dirty-tree'
								? { dirtyTreeSha256: 'c'.repeat(64) }
								: {})
						};
			vi.stubGlobal(
				'fetch',
				vi.fn(async () =>
					Response.json({ provenance, mutationBatchLaneEnabled: kind !== 'wrong-lane' })
				)
			);
			const result = record();
			await expect(
				verifyBatteryServices(result, 'http://web', 'http://worker')
			).rejects.toThrow();
			expect(result.verified).toBe(false);
			expect(result.error).toBeTruthy();
			expect(result.worker).toEqual(provenance);
		}
	);
	it('rejects a different executing worker even when a neighboring health endpoint matched', async () => {
		const query: any = { select: () => query, eq: vi.fn() };
		query.eq.mockReturnValueOnce(query).mockResolvedValueOnce({
			data: [
				{
					payload: {
						turn_phase: 'acknowledged',
						workerProvenance: { ...expected, dirtyTreeSha256: 'd'.repeat(64) }
					}
				}
			],
			error: null
		});
		await expect(
			verifyTurnWorkerProvenance({ from: () => query } as never, 'turn-1', expected)
		).rejects.toThrow('Executing worker');
	});
});
