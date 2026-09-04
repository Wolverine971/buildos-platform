// apps/worker/tests/agenticChatRetest20260904Regressions.test.ts
//
// Regressions from the 2026-09-04 production retest
// (artifacts/agentic-chat-postdeploy-6d787284c.md). Each case pins the exact
// harness behavior that turned a clear user request into a dead turn.

import { beforeAll, describe, expect, it } from 'vitest';
import {
	ONTOLOGY_WRITE_TOOLS,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	TURN_CONTRACT_TOOL_DEFINITION
} from '@buildos/agentic-chat-runtime/catalog';
import {
	parseDeclaredTurnContract,
	provideAgenticChatLoopToolCatalog
} from '@buildos/agentic-chat-runtime/loop';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';
import type {
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
import { validateCompletedProviderCalls } from '../src/workers/agentic-chat/provider/validation';
import {
	buildTurnContractReviewRequest,
	projectCreateShellGuidance
} from '../src/workers/agentic-chat/provider/review/turn-contract';
import { completeTurnContractReviewDecision } from '../src/workers/agentic-chat/provider/review/decision-completion';
import {
	appendToolCallDelta,
	createToolCallAccumulator
} from '../src/workers/agentic-chat/provider/stream-tool-calls';
import { surfaceFor } from '../src/workers/agentic-chat/provider/turn-phase';

const PROJECT_ID = '51000000-0000-4000-8000-000000000051';
const DOCUMENT_ID = '41000000-0000-4000-8000-000000000041';

function providerTool(definition: unknown): AgenticChatTurnProviderToolV1 {
	return definition as AgenticChatTurnProviderToolV1;
}

function writeTools(...names: string[]): AgenticChatTurnProviderToolV1[] {
	return ONTOLOGY_WRITE_TOOLS.filter((tool) => names.includes(tool.function.name)).map(
		providerTool
	);
}

const controlTools = [
	providerTool(TURN_CONTRACT_TOOL_DEFINITION),
	providerTool(REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION)
];

function requestFor(
	contextType: string,
	message: string,
	tools: AgenticChatTurnProviderToolV1[]
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [{ role: 'user', content: message }],
		tools,
		toolChoice: 'auto',
		contextType,
		projectId: contextType === 'global' ? null : PROJECT_ID,
		entityId: null,
		userId: 'user-1',
		sessionId: 'session-1',
		turnRunId: 'turn-1',
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		queueJobId: 'queue-1',
		processingToken: 'processing-1',
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		signal: new AbortController().signal
	} as AgenticChatTurnProviderRequestV1;
}

function declarationCall(argumentsValue: JsonObject) {
	return {
		id: 'contract-1',
		name: 'declare_turn_contract',
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue)
	};
}

beforeAll(() => provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} })));

// Case 8: the reviewer pasted the whole document body into a `content` change,
// hit the 160-character schema cap, padded it with "|||||", and then spent
// both revisions re-reviewing its own garbage before asking the user which
// document they meant.
describe('reviewer corrections that carry prose', () => {
	const documentTools = [...controlTools, ...writeTools('update_onto_document')];
	const request = requestFor(
		'project',
		'Update the existing "QA — Cedar House Marketing Brief" in place. Change only Audience.',
		documentTools
	);
	const proposal = parseDeclaredTurnContract({
		outcomes: [
			{
				action: 'update',
				entity_kind: 'document',
				target_ids: [DOCUMENT_ID],
				description: 'Replace Audience and Call to action; preserve everything else.'
			}
		]
	})!;

	it('adopts the correction as a content postcondition, never as a truncated change value', () => {
		const paddedBody = `# Cedar House Marketing Brief\n\n## Audience\nFirst-time homeowners in the Baltimore area planning a kitchen and bathroom renovation.\n\n## Promise\nClear scope,|||||`;
		expect(paddedBody).toHaveLength(160);
		const reviewRequest = buildTurnContractReviewRequest(
			request,
			documentTools,
			proposal,
			'a'.repeat(64),
			true,
			true
		);
		const accumulator = createToolCallAccumulator();
		appendToolCallDelta(accumulator, [
			{
				index: 0,
				id: 'revision-1',
				type: 'function',
				function: {
					name: 'request_proposal_revision',
					arguments: JSON.stringify({
						reason: 'The proposal declares no content postcondition.',
						required_correction:
							'Set required_fields to ["content"] and preserve every other loaded character.',
						corrected_contract: {
							outcomes: [
								{
									id: 'outcome_1',
									action: 'update',
									entity_kind: 'document',
									target_ids: [DOCUMENT_ID],
									required_fields: ['content'],
									changes: [{ field: 'content', value: paddedBody }],
									description:
										'Replace Audience and Call to action; preserve the rest.',
									minimum_successful_effects: 1
								}
							]
						},
						reference_candidates: [
							{
								reference: 'QA — Cedar House Marketing Brief',
								candidates: [
									{ id: DOCUMENT_ID, title: 'QA — Cedar House Marketing Brief' }
								]
							}
						]
					})
				}
			}
		]);
		const decisions = completeTurnContractReviewDecision({
			actingRequest: request,
			admittedTools: documentTools,
			reviewRequest,
			toolCalls: accumulator,
			finished: true,
			finishedReason: 'tool_calls',
			fallbackReason: null,
			contract: proposal,
			contractReviewSha256: 'a'.repeat(64),
			allowRevision: true
		});
		expect(decisions).toHaveLength(1);
		expect(decisions[0]?.name).toBe('request_proposal_revision');
		const corrected = decisions[0]?.arguments.corrected_contract as JsonObject;
		const outcome = (corrected.outcomes as JsonObject[])[0]!;
		expect(outcome.required_fields).toEqual(['content']);
		expect(outcome).not.toHaveProperty('changes');
		expect(JSON.stringify(decisions[0]?.arguments)).not.toContain('|||||');
		expect(decisions[0]?.canonicalArguments).not.toContain('|||||');
	});

	it('tells the reviewer that prose belongs in required_fields, not changes', () => {
		const reviewRequest = buildTurnContractReviewRequest(
			request,
			documentTools,
			proposal,
			'a'.repeat(64),
			true,
			true
		);
		const systemPrompt = String(reviewRequest.messages[0]?.content);
		expect(systemPrompt).toContain(
			'Prose fields (content, description, body) are postconditions'
		);
		expect(systemPrompt).toContain('capped at 160 characters');
	});
});

// Case 1: the same fully specified project brief failed from General Chat and
// succeeded from Project Setup, because only the project_create surface
// mounted create_onto_project and every shell-first guard was keyed on that
// context type instead of on the capability.
describe('project creation from the global surface', () => {
	const globalTools = [
		...controlTools,
		...writeTools('create_onto_project', 'create_onto_task', 'update_onto_task')
	];
	const brief =
		'Create a construction project named "Cedar House Renovation". Budget cap $85,000. Do not create tasks yet.';

	it('applies the shell-first contract rules to a global contract that creates a project', () => {
		const issues = validateCompletedProviderCalls(
			[
				declarationCall({
					outcomes: [
						{
							action: 'create',
							entity_kind: 'project',
							minimum_successful_effects: 1,
							required_fields: ['title', 'description'],
							changes: [{ field: 'title', value: 'Cedar House Renovation' }]
						}
					]
				})
			],
			requestFor('global', brief, controlTools),
			globalTools
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.errors.join(' ')).toContain(
			'The project outcome must omit required_fields and changes'
		);
	});

	it('rejects a promised record kind that no admitted creation tool can produce', () => {
		const issues = validateCompletedProviderCalls(
			[
				declarationCall({
					outcomes: [
						{ action: 'create', entity_kind: 'project', minimum_successful_effects: 1 },
						{ action: 'create', entity_kind: 'plan', minimum_successful_effects: 1 }
					]
				})
			],
			requestFor('global', brief, controlTools),
			globalTools
		);
		expect(issues[0]?.errors.join(' ')).toContain(
			'No available creation tool can create these requested record types: plan'
		);
	});

	it('leaves a global contract that does not create a project alone', () => {
		const issues = validateCompletedProviderCalls(
			[
				declarationCall({
					outcomes: [
						{
							action: 'update',
							entity_kind: 'task',
							target_ids: ['61000000-0000-4000-8000-000000000061'],
							required_fields: ['due_at'],
							minimum_successful_effects: 1
						}
					]
				})
			],
			requestFor('global', 'Push the cabinet task to Monday.', controlTools),
			globalTools
		);
		expect(issues).toEqual([]);
	});

	it('narrows the approved carve-out to the shell on any surface that mounts it', () => {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				{ action: 'create', entity_kind: 'project', minimum_successful_effects: 1 },
				{ action: 'create', entity_kind: 'task', minimum_successful_effects: 1 }
			]
		})!;
		const surface = surfaceFor('contract_carve_out', globalTools, {
			contract,
			contextType: 'global'
		});
		expect(surface?.tools.map((tool) => tool.function.name)).toEqual(['create_onto_project']);
	});

	it('states the shell rules conditionally outside Project Setup', () => {
		const global = projectCreateShellGuidance('global', globalTools);
		expect(global[0]).toMatch(/^When the user asks to create a new project/);
		expect(projectCreateShellGuidance('project_create', globalTools)[0]).toMatch(
			/^Project creation order:/
		);
		expect(projectCreateShellGuidance('global', controlTools)).toEqual([]);
	});
});
