// packages/agent-orchestrator/src/testing/harness/blind-judge.test.ts
import { describe, expect, it } from 'vitest';

import {
	aggregatePanelWinner,
	BLIND_JUDGE_MECHANIC_SHA256,
	BLIND_JUDGE_MODELS,
	BLIND_JUDGE_POLICY_VERSION,
	createBlindMapping,
	createBlindPair,
	isWorkflowWin,
	validatePanelAgainstDj,
	type BlindJudgeDecision,
	type BlindWinner,
	type PairWinnerLabel
} from './blind-judge';

/** Frozen 2026-08-13 after replacing Grok 4.5 with Grok 4.6 in the judge panel. */
const EXPECTED_MECHANIC_SHA256 = '4e31a42e2ffb330653ee6f10cabd5b4d3867dc300c082594eb84e93a011d1249';

const COMPARISON_SCENARIO_IDS = [
	'a0-c06-single-source-article',
	'a0-c07-campaign-workflow-research',
	'a0-c08-context-app-recommendation'
];

const scores = {
	correctness: 3,
	completeness: 3,
	grounding_and_citations: 3,
	usefulness: 3,
	constraint_adherence: 3
};

function decision(winner: BlindWinner): BlindJudgeDecision {
	return {
		schema_version: 1,
		winner,
		scores: { A: scores, B: scores },
		confidence: 80,
		rationale: 'The selected answer better satisfies the frozen rubric.'
	};
}

function labels(winners: BlindWinner[]): PairWinnerLabel[] {
	return ['c06', 'c07', 'c08'].flatMap((scenarioId, scenarioIndex) =>
		[1, 2, 3].map((runIndex) => ({
			pairId: `${scenarioId}-r${runIndex}`,
			scenarioId,
			winner: winners[scenarioIndex * 3 + runIndex - 1] ?? 'tie'
		}))
	);
}

describe('Phase A A2 blind judge mechanic', () => {
	it('pins the approved panel and the entire mechanic hash', () => {
		expect(BLIND_JUDGE_MODELS).toEqual([
			'openai/gpt-5.6-luna',
			'x-ai/grok-4.6',
			'moonshotai/kimi-k3'
		]);
		expect(BLIND_JUDGE_POLICY_VERSION).toBe('phase-a-a2-blind-v3');
		expect(BLIND_JUDGE_MECHANIC_SHA256).toBe(EXPECTED_MECHANIC_SHA256);
	});

	it('maps lanes deterministically and strips lane metadata from the blind pair', () => {
		const mapping = createBlindMapping({
			corpusVersion: 'phase-a-frozen-v1',
			scenarioIds: COMPARISON_SCENARIO_IDS,
			scenarioId: 'a0-c06-single-source-article',
			runIndex: 1
		});
		const repeated = createBlindMapping({
			corpusVersion: 'phase-a-frozen-v1',
			scenarioIds: COMPARISON_SCENARIO_IDS,
			scenarioId: 'a0-c06-single-source-article',
			runIndex: 1
		});
		expect(repeated).toEqual(mapping);
		expect(mapping.workflowSide).not.toBe(mapping.controlSide);

		const pair = createBlindPair({
			mapping,
			requestText: 'Research this.',
			acceptanceCriteria: ['Use the supplied source.'],
			workflowResponse: 'workflow body',
			controlResponse: 'control body'
		});
		expect(Object.keys(pair)).not.toContain('workflowSide');
		expect(Object.keys(pair)).not.toContain('controlSide');
		expect([pair.response_a, pair.response_b].sort()).toEqual([
			'control body',
			'workflow body'
		]);
	});

	it('counterbalances sides within every scenario and across the nine pairs', () => {
		const mappings = COMPARISON_SCENARIO_IDS.flatMap((scenarioId) =>
			[1, 2, 3].map((runIndex) =>
				createBlindMapping({
					corpusVersion: 'phase-a-frozen-v1',
					scenarioIds: COMPARISON_SCENARIO_IDS,
					scenarioId,
					runIndex
				})
			)
		);

		// No scenario may put the workflow lane on one side for all three of its pairs; that is
		// exactly what the v1 mapping did to C07. See PHASE_A_AUDIT_2026-07-25.md S3.
		for (const scenarioId of COMPARISON_SCENARIO_IDS) {
			const sides = mappings
				.filter((mapping) => mapping.scenarioId === scenarioId)
				.map((mapping) => mapping.workflowSide);
			expect(new Set(sides).size).toBe(2);
		}

		// Overall the split must be as close to even as nine pairs allow.
		const onA = mappings.filter((mapping) => mapping.workflowSide === 'A').length;
		expect(onA === 4 || onA === 5).toBe(true);

		// Run index must not correlate with lane globally: adjacent scenarios invert.
		const byRun = [1, 2, 3].map(
			(runIndex) =>
				mappings.filter(
					(mapping) => mapping.runIndex === runIndex && mapping.workflowSide === 'A'
				).length
		);
		expect(byRun.every((count) => count > 0 && count < 3)).toBe(true);
	});

	it('rejects a scenario that is not part of the comparison set', () => {
		expect(() =>
			createBlindMapping({
				corpusVersion: 'phase-a-frozen-v1',
				scenarioIds: COMPARISON_SCENARIO_IDS,
				scenarioId: 'a0-c01-in-sync-explanation',
				runIndex: 1
			})
		).toThrow('not part of the blind comparison set');
	});

	it('uses a strict three-judge majority and otherwise returns tie', () => {
		expect(aggregatePanelWinner([decision('A'), decision('A'), decision('B')])).toBe('A');
		expect(aggregatePanelWinner([decision('A'), decision('B'), decision('tie')])).toBe('tie');
		expect(() => aggregatePanelWinner([decision('A')])).toThrow('exactly 3');
	});

	it('never counts a tie or required-check failure as a workflow win', () => {
		const mapping = createBlindMapping({
			corpusVersion: 'phase-a-frozen-v1',
			scenarioIds: COMPARISON_SCENARIO_IDS,
			scenarioId: 'a0-c07-campaign-workflow-research',
			runIndex: 2
		});
		expect(
			isWorkflowWin({
				panelWinner: mapping.workflowSide,
				mapping,
				workflowRequiredChecksPassed: true
			})
		).toBe(true);
		expect(
			isWorkflowWin({
				panelWinner: mapping.workflowSide,
				mapping,
				workflowRequiredChecksPassed: false
			})
		).toBe(false);
		expect(
			isWorkflowWin({
				panelWinner: 'tie',
				mapping,
				workflowRequiredChecksPassed: true
			})
		).toBe(false);
	});

	it('validates only at 7/9 agreement or better with no complete scenario inversion', () => {
		const dj = labels(['A', 'A', 'A', 'B', 'B', 'B', 'A', 'B', 'A']);
		const sevenOfNine = labels(['A', 'A', 'B', 'B', 'B', 'B', 'A', 'A', 'A']);
		expect(validatePanelAgainstDj({ panel: sevenOfNine, dj })).toMatchObject({
			valid: true,
			agreementCount: 7,
			completeScenarioInversions: []
		});

		const sixOfNine = labels(['A', 'B', 'B', 'B', 'B', 'B', 'A', 'A', 'A']);
		expect(validatePanelAgainstDj({ panel: sixOfNine, dj }).valid).toBe(false);

		const inverted = labels(['B', 'B', 'B', 'B', 'B', 'B', 'A', 'B', 'A']);
		expect(validatePanelAgainstDj({ panel: inverted, dj })).toMatchObject({
			valid: false,
			completeScenarioInversions: ['c06']
		});
	});
});
