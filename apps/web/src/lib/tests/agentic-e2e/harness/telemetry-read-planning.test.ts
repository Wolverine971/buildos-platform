// apps/web/src/lib/tests/agentic-e2e/harness/telemetry-read-planning.test.ts
import { describe, expect, it } from 'vitest';

import { summarizeReadPlanningObservations, type ExecutionObservationRow } from './telemetry';

const SHA = {
	outlineA: 'a'.repeat(64),
	outlineB: 'b'.repeat(64),
	sectionA: 'c'.repeat(64),
	resourceA: 'd'.repeat(64),
	resourceB: 'e'.repeat(64),
	plan1: 'f'.repeat(64),
	plan2: '1'.repeat(64),
	plan3: '2'.repeat(64)
};

function ended(sequenceIndex: number, payload: Record<string, unknown>): ExecutionObservationRow {
	return {
		execution_generation: 1,
		phase: 'tool',
		event_type: 'tool_execution_ended',
		observed_at: `2026-09-02T00:00:0${sequenceIndex}.000Z`,
		payload: {
			sequence_index: sequenceIndex,
			status: 'success',
			logical_provider_round: 1,
			read_epoch: 0,
			execution_class: 'evidence_read',
			memo_served: false,
			graph_plan_sha256: SHA.plan1,
			graph_layer_index: 0,
			graph_layer_width: 2,
			...payload
		}
	};
}

describe('summarizeReadPlanningObservations', () => {
	it('separates projections, exact duplicates, controls, and post-mutation rereads', () => {
		const summary = summarizeReadPlanningObservations([
			ended(1, { exact_read_key: SHA.outlineA, resource_key: SHA.resourceA }),
			ended(2, { exact_read_key: SHA.outlineB, resource_key: SHA.resourceB }),
			ended(3, {
				logical_provider_round: 2,
				exact_read_key: SHA.sectionA,
				resource_key: SHA.resourceA,
				graph_plan_sha256: SHA.plan2
			}),
			ended(4, {
				logical_provider_round: 2,
				exact_read_key: SHA.outlineA,
				resource_key: SHA.resourceA,
				memo_served: true,
				graph_plan_sha256: SHA.plan2
			}),
			ended(5, {
				logical_provider_round: 3,
				execution_class: 'review',
				graph_plan_sha256: SHA.plan3,
				graph_layer_width: 1
			}),
			ended(6, {
				logical_provider_round: 4,
				read_epoch: 1,
				exact_read_key: SHA.outlineA,
				resource_key: SHA.resourceA,
				graph_plan_sha256: '3'.repeat(64),
				graph_layer_width: 1
			})
		]);

		expect(summary).toEqual({
			evidenceReadCallCount: 5,
			uniqueExactReadCount: 3,
			exactDuplicateCount: 1,
			uniqueResourceCount: 2,
			additionalProjectionCount: 1,
			evidenceProviderRoundCount: 3,
			controlProviderRoundCount: 1,
			firstCompleteEvidenceRound: 2,
			memoServedCount: 1,
			justifiedPostMutationRereadCount: 1,
			mutationCallCount: 0,
			replayedMutationCount: 0,
			rejectedCallCount: 0,
			providerRetryCount: 0,
			evidenceRoundWidths: [2, 2, 1],
			graphLayerWidths: [2, 2, 1, 1]
		});
	});

	it('does not count a retry after a failed read as a successful duplicate', () => {
		const summary = summarizeReadPlanningObservations([
			ended(1, {
				status: 'failure',
				exact_read_key: SHA.outlineA,
				resource_key: SHA.resourceA,
				graph_layer_width: 1
			}),
			ended(2, {
				logical_provider_round: 2,
				exact_read_key: SHA.outlineA,
				resource_key: SHA.resourceA,
				graph_plan_sha256: SHA.plan2,
				graph_layer_width: 1
			})
		]);

		expect(summary.exactDuplicateCount).toBe(0);
		expect(summary.firstCompleteEvidenceRound).toBe(2);
	});
});
