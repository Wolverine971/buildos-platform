// apps/web/src/lib/tests/agentic-e2e/harness/gate-evidence.test.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { captureGateTurn, findGateProviderPassFiles } from './gate-evidence';
import type { ScenarioContext, TurnResult } from './types';

let dir: string;
afterEach(() => {
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('requires a completed exact provider capture for each retained usage receipt', () => {
	dir = mkdtempSync(join(tmpdir(), 'agentic-gate-provider-evidence-'));
	const file = '2026-09-11--turn-1--mutation-review.json';
	writeFileSync(
		join(dir, file),
		JSON.stringify({ usageLogId: 'usage-1', outcome: { status: 'success' } })
	);
	expect(findGateProviderPassFiles(dir, [{ id: 'usage-1', turn_run_id: 'turn-1' }])).toEqual([
		file
	]);
	expect(() =>
		findGateProviderPassFiles(dir, [{ id: 'usage-2', turn_run_id: 'turn-1' }])
	).toThrow('Missing completed provider capture');
	writeFileSync(
		join(dir, file),
		JSON.stringify({ usageLogId: 'usage-1', outcome: { status: 'pending' } })
	);
	expect(() =>
		findGateProviderPassFiles(dir, [{ id: 'usage-1', turn_run_id: 'turn-1' }])
	).toThrow('Missing completed provider capture');
});
it('retains the response, oracle failure and capture failure even when snapshot queries fail', async () => {
	dir = mkdtempSync(join(tmpdir(), 'agentic-gate-evidence-'));
	vi.stubEnv('AGENTIC_GATE_EVIDENCE_DIR', dir);
	vi.stubEnv('AGENTIC_GATE_DATABASE_ISOLATED', 'true');
	const ctx = {
		cookie: 'never-serialize-this',
		db: {
			admin: {
				from() {
					throw new Error('snapshot unavailable');
				}
			}
		}
	} as unknown as ScenarioContext;
	const result = {
		streamRunId: 'run',
		assistantText: 'Retained assistant response.'
	} as TurnResult;
	const errors = await captureGateTurn({
		ctx,
		scenarioId: 'cedar-04',
		repetition: 1,
		turnIndex: 1,
		result,
		evidence: {
			checkOutcome: { overallError: new Error('Wrong estimate') },
			before: { props: { duration_minutes: 90 } }
		}
	});
	expect(errors).toEqual(['Error: snapshot unavailable']);
	const text = readFileSync(join(dir, 'cedar-04-1-1.json'), 'utf8');
	expect(text).toContain('Retained assistant response.');
	expect(text).toContain('Wrong estimate');
	expect(text).toContain('snapshot unavailable');
	expect(text).not.toContain('never-serialize-this');
});
it('refuses raw capture outside an explicitly isolated QA database', async () => {
	vi.stubEnv('AGENTIC_GATE_EVIDENCE_DIR', '/unused');
	vi.stubEnv('AGENTIC_GATE_DATABASE_ISOLATED', 'false');
	await expect(
		captureGateTurn({
			ctx: {} as ScenarioContext,
			scenarioId: 'test',
			repetition: 1,
			turnIndex: 1,
			result: {} as TurnResult,
			evidence: {}
		})
	).rejects.toThrow(/isolated/);
});
