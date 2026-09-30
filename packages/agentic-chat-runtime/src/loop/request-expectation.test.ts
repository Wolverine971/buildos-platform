// packages/agentic-chat-runtime/src/loop/request-expectation.test.ts
import { describe, expect, it } from 'vitest';
import { buildMutationBatch } from './mutation-batch';
import { parseRequestExpectation } from './request-expectation';
import type { FastToolExecution } from './shared';
import { getSafeWriteToolNamesForTurnContract, resolveTurnContractOutcome } from './turn-contract';

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

describe('whole-request completion across stages', () => {
	it('keeps omitted fields and scalar values outstanding even when every target was touched', () => {
		const original = expectation();
		const result = resolveTurnContractOutcome({
			contract: original,
			toolExecutions: succeeded()
		});
		expect(result.fulfilled).toBe(false);
		expect(original.outcomes[0]!.requiredFields).toEqual(['name', 'description']);
		expect(original.outcomes[1]!.changes).toEqual([
			{ field: 'title', value: '100-Day Book Production System' }
		]);
	});

	it('fulfills the unchanged checklist only after later stages supply the missing fields', () => {
		const original = expectation();
		const later = [
			...PLAN_IDS.slice(1).map((id) => ({
				name: 'update_onto_plan',
				args: { plan_id: id, name: 'Nonfiction plan' }
			})),
			{
				name: 'update_onto_document',
				args: { document_id: RULES_DOC, title: '100-Day Book Production System' }
			}
		].map(
			(call, index): FastToolExecution => ({
				toolCall: {
					id: `later-${index}`,
					type: 'function',
					function: { name: call.name, arguments: JSON.stringify(call.args) }
				},
				result: { tool_call_id: `later-${index}`, success: true, result: null }
			})
		);
		expect(
			resolveTurnContractOutcome({
				contract: original,
				toolExecutions: [...succeeded(), ...later]
			}).fulfilled
		).toBe(true);
	});

	it('keeps later-stage targets absent from the approved batch outstanding', () => {
		const original = expectation([LATER_TASK]);
		expect(
			resolveTurnContractOutcome({ contract: original, toolExecutions: succeeded() })
				.fulfilled
		).toBe(false);
		expect(original.outcomes.find((outcome) => outcome.id === 'tasks')!.targetIds).toEqual([
			LATER_TASK
		]);
	});
});

describe('archive completion preserves workflow semantics', () => {
	it.each(['task', 'goal'])('matches %s archived:true without completing the record', (kind) => {
		const contract = parseRequestExpectation({
			outcomes: [
				{
					id: 'archive',
					action: 'archive',
					entity_kind: kind,
					target_ids: [LATER_TASK],
					required_fields: ['archived'],
					minimum_successful_effects: 1
				}
			]
		})!;
		const toolName = `update_onto_${kind}`;
		const write: FastToolExecution = {
			toolCall: {
				id: 'archive',
				type: 'function',
				function: {
					name: toolName,
					arguments: JSON.stringify({ [`${kind}_id`]: LATER_TASK, archived: true })
				}
			},
			result: {
				tool_call_id: 'archive',
				success: true,
				result: {
					[kind]: {
						id: LATER_TASK,
						state_key: 'done',
						archived_at: '2026-09-29T00:00:00Z'
					}
				}
			}
		};
		expect(getSafeWriteToolNamesForTurnContract(contract)).toContain(toolName);
		expect(resolveTurnContractOutcome({ contract, toolExecutions: [write] }).fulfilled).toBe(
			true
		);
		const completion = {
			...contract,
			outcomes: contract.outcomes.map((outcome) => ({
				...outcome,
				action: 'complete' as const,
				requiredFields: []
			}))
		};
		expect(
			resolveTurnContractOutcome({ contract: completion, toolExecutions: [write] }).fulfilled
		).toBe(false);
		const wrong = {
			...write,
			toolCall: {
				...write.toolCall,
				function: {
					name: toolName,
					arguments: JSON.stringify({ [`${kind}_id`]: LATER_TASK, state_key: 'done' })
				}
			}
		};
		expect(resolveTurnContractOutcome({ contract, toolExecutions: [wrong] }).fulfilled).toBe(
			false
		);
	});
});
