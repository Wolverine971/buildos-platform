// packages/agentic-chat-runtime/src/loop/request-expectation.test.ts
import { describe, expect, it } from 'vitest';
import { buildMutationBatch } from './mutation-batch';
import {
	parseRequestExpectation,
	reconcileRequestExpectationWithApprovedBatch
} from './request-expectation';
import type { FastToolExecution } from './shared';
import { resolveTurnContractOutcome } from './turn-contract';

// Shape of the 2026-09-22 book-loop approval (session 36c6eeea…): the reviewer
// required plan `name` and a document retitle, then approved calls that set only
// descriptions/content. Every write succeeded.
const PLAN_IDS = [
	'39f201a1-c209-47d0-999d-6400b242cb90',
	'4698bf3f-5bbc-4bd2-8315-2d37e804e9e8',
	'51e8eefa-562d-4f13-bc40-3937409f8a7d'
];
const RULES_DOC = 'd9bad4b5-1964-4521-b0b1-2815582d378d';
const LATER_TASK = '078dad14-02fc-41ba-a2db-082aba6636fd';

function expectation(extraTaskTargets: string[] = []) {
	return parseRequestExpectation({
		summary: 'Convert the fiction workspace into a nonfiction project.',
		outcomes: [
			{
				id: 'plans',
				action: 'update',
				entity_kind: 'plan',
				target_ids: PLAN_IDS,
				required_fields: ['name', 'description'],
				minimum_successful_effects: PLAN_IDS.length
			},
			{
				id: 'production_rules',
				action: 'update',
				entity_kind: 'document',
				target_ids: [RULES_DOC],
				required_fields: ['content', 'title'],
				changes: [{ field: 'title', value: '100-Day Book Production System' }],
				minimum_successful_effects: 1
			},
			...(extraTaskTargets.length
				? [
						{
							id: 'tasks',
							action: 'update',
							entity_kind: 'task',
							target_ids: extraTaskTargets,
							required_fields: ['description'],
							minimum_successful_effects: extraTaskTargets.length
						}
					]
				: [])
		]
	})!;
}

const batch = buildMutationBatch([
	{
		id: 'c1',
		name: 'update_onto_plan',
		canonicalProviderArguments: JSON.stringify({
			plan_id: PLAN_IDS[0],
			name: 'Phase 2: Chapter & Framework Blueprint (Days 8–15)',
			description: 'Map the frameworks.'
		})
	},
	...PLAN_IDS.slice(1).map((id, index) => ({
		id: `c${index + 2}`,
		name: 'update_onto_plan',
		canonicalProviderArguments: JSON.stringify({ plan_id: id, description: 'Nonfiction.' })
	})),
	{
		id: 'c9',
		name: 'update_onto_document',
		canonicalProviderArguments: JSON.stringify({
			document_id: RULES_DOC,
			content: '# 100-Day Book Production System'
		})
	}
]);

function succeeded(): FastToolExecution[] {
	return batch.calls.map((call) => ({
		toolCall: {
			id: call.id,
			type: 'function',
			function: { name: call.name, arguments: call.canonicalArguments }
		},
		result: { tool_call_id: call.id, success: true, result: null }
	}));
}

describe('reconcileRequestExpectationWithApprovedBatch', () => {
	it('stops reporting approved, successful writes as unfinished', () => {
		const original = expectation();
		expect(
			resolveTurnContractOutcome({ contract: original, toolExecutions: succeeded() })
				.fulfilled
		).toBe(false);
		const reconciled = reconcileRequestExpectationWithApprovedBatch(original, batch);
		expect(
			resolveTurnContractOutcome({ contract: reconciled, toolExecutions: succeeded() })
				.fulfilled
		).toBe(true);
		expect(reconciled.outcomes[0]!.requiredFields).toEqual(['description']);
		expect(reconciled.outcomes[1]!.changes).toBeUndefined();
	});

	it('keeps later-stage targets absent from the approved batch outstanding', () => {
		const reconciled = reconcileRequestExpectationWithApprovedBatch(
			expectation([LATER_TASK]),
			batch
		);
		const tasks = reconciled.outcomes.find((outcome) => outcome.id === 'tasks')!;
		expect(tasks.targetIds).toEqual([LATER_TASK]);
		expect(tasks.requiredFields).toEqual(['description']);
		expect(
			resolveTurnContractOutcome({ contract: reconciled, toolExecutions: succeeded() })
				.fulfilled
		).toBe(false);
	});

	it('returns the same expectation when the approved calls already satisfy it', () => {
		const satisfied = parseRequestExpectation({
			outcomes: [
				{
					id: 'plans',
					action: 'update',
					entity_kind: 'plan',
					target_ids: PLAN_IDS,
					required_fields: ['description'],
					minimum_successful_effects: PLAN_IDS.length
				}
			]
		})!;
		expect(reconcileRequestExpectationWithApprovedBatch(satisfied, batch)).toBe(satisfied);
	});
});
