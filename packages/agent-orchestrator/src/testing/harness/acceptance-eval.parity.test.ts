// packages/agent-orchestrator/src/testing/harness/acceptance-eval.parity.test.ts
//
// Guards audit finding N2 / D12: the two comparison lanes must score with one implementation, and
// no corpus validator id may be silently unimplemented. A required-check failure vetoes a workflow
// blind win regardless of judge preference, so an unimplemented validator that returned
// `passed: false` could zero the workflow lane without anyone noticing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { evaluateHarnessAcceptance, type HarnessAcceptanceCheck } from './acceptance-eval';
import { FrozenCorpusSchema, HoldoutCorpusSchema } from './corpus-schema';

function readJson(relativePath: string): unknown {
	return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'));
}

const frozen = FrozenCorpusSchema.parse(readJson('./corpus/phase-a.json'));
const holdout = HoldoutCorpusSchema.parse(readJson('./corpus/phase-a-holdout.json'));

const corpusChecks: HarnessAcceptanceCheck[] = [
	...frozen.scenarios.flatMap((scenario) => scenario.acceptance_checks),
	...holdout.scenarios.flatMap((scenario) => scenario.acceptance_checks)
];

describe('acceptance validator coverage', () => {
	it('implements every validator id used by the frozen and held-out corpora', async () => {
		const validatorIds = Array.from(
			new Set(corpusChecks.map((check) => check.validator_id))
		).sort();
		expect(validatorIds.length).toBeGreaterThan(0);

		for (const validatorId of validatorIds) {
			const check = corpusChecks.find((item) => item.validator_id === validatorId)!;
			// Throws on an unimplemented id rather than returning passed:false.
			await expect(
				evaluateHarnessAcceptance({ checks: [check], text: 'probe text' })
			).resolves.toBeDefined();
		}
	});

	it('throws rather than failing a check when a validator id is unimplemented', async () => {
		await expect(
			evaluateHarnessAcceptance({
				checks: [
					{
						validator_id: 'does.not.exist',
						description: 'unimplemented probe',
						required: true,
						config: {}
					}
				],
				text: 'anything'
			})
		).rejects.toThrow(/Unimplemented acceptance validator/);
	});

	it('scores the three validators that previously had no implementation', async () => {
		const [bullets, question, gap] = await Promise.all([
			evaluateHarnessAcceptance({
				checks: [
					{
						validator_id: 'answer.bullet_count',
						description: 'five bullets',
						required: true,
						config: { count: 3 }
					}
				],
				text: '- one\n- two\n- three'
			}),
			evaluateHarnessAcceptance({
				checks: [
					{
						validator_id: 'route.asks_question',
						description: 'asks for scope',
						required: true,
						config: { terms: ['which project'] }
					}
				],
				text: 'Which project should I use as the scope?'
			}),
			evaluateHarnessAcceptance({
				checks: [
					{
						validator_id: 'route.reports_gap',
						description: 'reports the gap',
						required: true,
						config: { capability: 'email.send' }
					}
				],
				text: 'I cannot send email — no email integration is connected.'
			})
		]);

		expect(bullets[0]!.passed).toBe(true);
		expect(question[0]!.passed).toBe(true);
		expect(gap[0]!.passed).toBe(true);
	});
});
