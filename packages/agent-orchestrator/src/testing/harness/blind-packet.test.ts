import { describe, expect, it } from 'vitest';

import { buildBlindComparisonPackets, buildDjScoringMarkdown } from './blind-packet';

const scenarios = ['c06', 'c07', 'c08'].map((scenarioId) => ({
	scenarioId,
	requestText: `Request ${scenarioId}`,
	acceptanceCriteria: [`Criterion ${scenarioId}`]
}));

function runs(lane: string) {
	return scenarios.flatMap((scenario) =>
		[1, 2, 3].map((runIndex) => ({
			scenarioId: scenario.scenarioId,
			runIndex,
			scored: true,
			assistantText: `${lane} ${scenario.scenarioId} run ${runIndex}`,
			allRequiredChecksPassed: lane === 'workflow'
		}))
	);
}

describe('A2 blind comparison packet', () => {
	it('builds exactly nine deterministic pairs and keeps mapping out of the comparison packet', () => {
		const packets = buildBlindComparisonPackets({
			corpusVersion: 'phase-a-frozen-v1',
			scenarios,
			workflowRuns: runs('workflow'),
			controlRuns: runs('control')
		});
		expect(packets.comparison.pairs).toHaveLength(9);
		expect(packets.mapping.mappings).toHaveLength(9);
		expect(JSON.stringify(packets.comparison)).not.toContain('workflowSide');
		expect(JSON.stringify(packets.comparison)).not.toContain('controlSide');
		expect(JSON.stringify(packets.comparison)).not.toContain('RequiredChecksPassed');
	});

	it('rejects missing or duplicate scored lane outputs', () => {
		expect(() =>
			buildBlindComparisonPackets({
				corpusVersion: 'phase-a-frozen-v1',
				scenarios,
				workflowRuns: runs('workflow').slice(1),
				controlRuns: runs('control')
			})
		).toThrow('Missing scored');

		const duplicate = [...runs('workflow'), runs('workflow')[0]!];
		expect(() =>
			buildBlindComparisonPackets({
				corpusVersion: 'phase-a-frozen-v1',
				scenarios,
				workflowRuns: duplicate,
				controlRuns: runs('control')
			})
		).toThrow('duplicate scored');
	});

	it('renders a lane-free DJ worksheet with all choices blank', () => {
		const { comparison } = buildBlindComparisonPackets({
			corpusVersion: 'phase-a-frozen-v1',
			scenarios,
			workflowRuns: runs('workflow'),
			controlRuns: runs('control')
		});
		const markdown = buildDjScoringMarkdown(comparison);
		expect(markdown.match(/^## Pair /gm)).toHaveLength(9);
		expect(markdown).toContain('Winner: `A` / `B` / `tie`');
		expect(markdown).not.toContain('workflowSide');
	});
});
