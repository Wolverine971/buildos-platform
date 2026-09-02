// apps/web/src/lib/tests/agentic-e2e/scenarios/tool-graph-parallel-reads.scenario.ts
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario } from '../harness/types';
import { harnessProjectName, seedScenarioProject } from '../harness/seed';
import {
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	normalizeComparableText
} from '../harness/assertions';
import {
	getExecutionObservations,
	summarizeReadPlanningObservations,
	waitForTurnRun
} from '../harness/telemetry';

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Tool Graph Parallel Reads'),
			type_key: 'project.business.product_launch',
			description: 'Production canary fixture for independent document reads.'
		},
		entities: [
			{
				temp_id: 'alpha-notes',
				kind: 'document',
				title: 'Alpha Launch Notes',
				body_markdown: '# Alpha Launch Notes\n\nCodename: cobalt. Approved budget: $1,200.'
			},
			{
				temp_id: 'beta-notes',
				kind: 'document',
				title: 'Beta Launch Notes',
				body_markdown: '# Beta Launch Notes\n\nCodename: marigold. Approved budget: $2,400.'
			},
			{
				temp_id: 'gamma-notes',
				kind: 'document',
				title: 'Gamma Launch Notes',
				body_markdown: '# Gamma Launch Notes\n\nCodename: sequoia. Approved budget: $3,600.'
			}
		],
		relationships: []
	};
}

export const toolGraphParallelReadsScenario: Scenario = {
	id: 'tool-graph-parallel-reads',
	title: 'Read three independent documents before comparing them',
	category: 'document',
	skip: () => process.env.AGENTIC_TOOL_GRAPH_PRODUCTION_CANARY !== 'true',
	seed: async (ctx) => seedScenarioProject(ctx, spec()),
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'Compare the full contents of Alpha Launch Notes, Beta Launch Notes, and Gamma Launch Notes. Read all three independently before answering. Give me each codename and approved budget, and do not edit anything.',
			assert: async (turn, ctx) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertNoMutations(turn, 'this production canary is read-only');
				const turnRun = await waitForTurnRun(ctx.db.admin, turn.streamRunId!);
				assertTurnRunCompleted(turnRun);

				const text = normalizeComparableText(turn.assistantText);
				for (const expected of [
					'cobalt',
					'marigold',
					'sequoia',
					'1,200',
					'2,400',
					'3,600'
				]) {
					if (!text.includes(expected)) {
						throw new Error(
							`[assert] comparison omitted ${expected}: ${turn.assistantText}`
						);
					}
				}

				if (!turnRun) throw new Error('[assert] completed turn has no durable turn row');
				const readPlanning = summarizeReadPlanningObservations(
					await getExecutionObservations(ctx.db.admin, turnRun.id)
				);
				const expected = {
					evidenceReadCallCount: 6,
					uniqueExactReadCount: 6,
					exactDuplicateCount: 0,
					uniqueResourceCount: 3,
					additionalProjectionCount: 3,
					evidenceProviderRoundCount: 2,
					controlProviderRoundCount: 0,
					firstCompleteEvidenceRound: 2,
					memoServedCount: 0,
					justifiedPostMutationRereadCount: 0,
					mutationCallCount: 0,
					replayedMutationCount: 0,
					rejectedCallCount: 0,
					evidenceRoundWidths: [3, 3],
					graphLayerWidths: [3, 3]
				};
				const scheduleMismatch = Object.entries(expected).some(
					([key, value]) =>
						JSON.stringify(readPlanning[key as keyof typeof readPlanning]) !==
						JSON.stringify(value)
				);
				if (scheduleMismatch) {
					throw new Error(
						`[assert] lean scan/read schedule mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(readPlanning)}`
					);
				}
			}
		}
	]
};
