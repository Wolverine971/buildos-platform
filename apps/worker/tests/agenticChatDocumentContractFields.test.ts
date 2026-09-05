// apps/worker/tests/agenticChatDocumentContractFields.test.ts
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
import {
	contractSha256,
	validateApprovedTurnContractMutations,
	validateCompletedProviderCalls
} from '../src/workers/agentic-chat/provider/validation';
import { buildTurnContractReviewRequest } from '../src/workers/agentic-chat/provider/review/turn-contract';
import { completeTurnContractReviewDecision } from '../src/workers/agentic-chat/provider/review/decision-completion';
import {
	appendToolCallDelta,
	createToolCallAccumulator
} from '../src/workers/agentic-chat/provider/stream-tool-calls';

const PROJECT_ID = '51000000-0000-4000-8000-000000000051';
const DOCUMENT_ID = '41000000-0000-4000-8000-000000000041';

function providerTool(definition: unknown): AgenticChatTurnProviderToolV1 {
	return definition as AgenticChatTurnProviderToolV1;
}

const tools = [
	TURN_CONTRACT_TOOL_DEFINITION,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	...ONTOLOGY_WRITE_TOOLS.filter((tool) =>
		['update_onto_document', 'move_document_in_tree', 'create_onto_document'].includes(
			tool.function.name
		)
	)
].map(providerTool);
const controlTools = [providerTool(TURN_CONTRACT_TOOL_DEFINITION)];
const request: AgenticChatTurnProviderRequestV1 = {
	messages: [
		{ role: 'user', content: 'Tighten only the Rollback section; preserve the other sections.' }
	],
	tools,
	toolChoice: 'auto',
	contextType: 'project',
	projectId: PROJECT_ID,
	entityId: DOCUMENT_ID,
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
};

function declaration(field: string): JsonObject {
	return {
		outcomes: [
			{
				action: 'update',
				entity_kind: 'document',
				target_ids: [DOCUMENT_ID],
				required_fields: [field],
				description: 'Tighten only Rollback and preserve all other sections.'
			}
		]
	};
}

function call(argumentsValue: JsonObject) {
	return {
		id: 'contract-1',
		name: 'declare_turn_contract',
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue)
	};
}

beforeAll(() => provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} })));

describe('executable contract fields', () => {
	it.each([undefined, []])('rejects a fieldless document update before review (%j)', (fields) => {
		const args: JsonObject = {
			outcomes: [
				{
					action: 'update',
					entity_kind: 'document',
					target_ids: [DOCUMENT_ID],
					minimum_successful_effects: 1,
					...(fields ? { required_fields: fields } : {})
				}
			]
		};
		const issues = validateCompletedProviderCalls(
			[call(args)],
			{
				...request,
				tools: controlTools
			},
			tools
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.errors.join(' ')).toContain(
			'document update must name the changed fields'
		);
		expect(args.outcomes).toEqual([
			expect.not.objectContaining({ required_fields: ['content'] })
		]);
	});

	it('accepts a title-only change without inventing a content requirement', () => {
		const args: JsonObject = {
			outcomes: [
				{
					action: 'update',
					entity_kind: 'document',
					target_ids: [DOCUMENT_ID],
					minimum_successful_effects: 1,
					changes: [{ field: 'title', value: 'Renamed brief' }]
				}
			]
		};
		expect(validateCompletedProviderCalls([call(args)], request)).toEqual([]);
		expect(parseDeclaredTurnContract(args)?.outcomes[0]?.requiredFields).toEqual(['title']);
	});

	it.each(['duration_minutes', 'props.duration_minutes'])(
		'accepts nested task estimate contracts using %s',
		(field) => {
			const taskTools = [
				...controlTools,
				providerTool(REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION),
				...ONTOLOGY_WRITE_TOOLS.filter(
					(tool) => tool.function.name === 'update_onto_task'
				).map(providerTool)
			];
			const args = {
				outcomes: [
					{
						action: 'update',
						entity_kind: 'task',
						target_ids: [DOCUMENT_ID],
						changes: [{ field, value: '120' }]
					}
				]
			};
			expect(
				validateCompletedProviderCalls([call(args)], { ...request, tools: taskTools })
			).toEqual([]);
			const review = buildTurnContractReviewRequest(
				request,
				taskTools,
				parseDeclaredTurnContract(args)!,
				'a'.repeat(64),
				true,
				true
			);
			expect(JSON.stringify(review.messages)).toContain('props.duration_minutes');
			expect(JSON.stringify(review.messages)).toContain('Estimated work in minutes');
		}
	);
	it('rejects invented nested task fields', () => {
		const taskTools = [
			...controlTools,
			...ONTOLOGY_WRITE_TOOLS.filter((tool) => tool.function.name === 'update_onto_task').map(
				providerTool
			)
		];
		expect(
			validateCompletedProviderCalls(
				[
					call({
						outcomes: [
							{
								action: 'update',
								entity_kind: 'task',
								target_ids: [DOCUMENT_ID],
								changes: [{ field: 'props.estimated_duration', value: '120' }]
							}
						]
					})
				],
				{ ...request, tools: taskTools }
			)
		).toHaveLength(1);
	});
	it('authorizes only the bound dependency endpoints and direction', () => {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				...['install', 'order'].map((label) => ({
					action: 'create',
					entity_kind: 'task',
					label,
					changes: [{ field: 'title', value: label }]
				})),
				{
					action: 'link',
					entity_kind: 'relationship',
					src_label: 'install',
					dst_label: 'order',
					changes: [{ field: 'rel', value: 'depends_on' }]
				}
			]
		})!;
		const bindings = new Map([
			['install', 'task-install'],
			['order', 'task-order']
		]);
		const mutation = (overrides: JsonObject = {}) => ({
			...call({
				src_kind: 'task',
				src_id: 'task-install',
				dst_kind: 'task',
				dst_id: 'task-order',
				rel: 'depends_on',
				...overrides
			}),
			name: 'link_onto_entities'
		});
		const validate = (overrides: JsonObject = {}, bound = bindings) =>
			validateApprovedTurnContractMutations(
				[mutation(overrides)],
				contract,
				contractSha256(contract),
				bound
			);
		expect(validate()).toEqual([]);
		for (const args of [
			{ src_id: 'wrong' },
			{ src_kind: 'document' },
			{ rel: 'related_to' },
			{ src_id: 'task-order', dst_id: 'task-install' }
		])
			expect(validate(args)).toHaveLength(1);
		expect(validate({}, new Map())[0]?.errors.join(' ')).toContain('has not been created yet');
	});
	it.each([
		{ entityKind: 'goal', fields: ['name', 'due_at', 'project_id'], rejected: true },
		{ entityKind: 'task', fields: ['title', 'project_id'], rejected: true },
		{ entityKind: 'goal', fields: ['title', 'due_at'], rejected: false },
		{ entityKind: 'task', fields: ['title', 'due_at'], rejected: false }
	])(
		'validates project-child create fields against completion receipts: %j',
		({ entityKind, fields, rejected }) => {
			const admittedTools = [
				...controlTools,
				...ONTOLOGY_WRITE_TOOLS.filter((tool) =>
					['create_onto_goal', 'create_onto_task'].includes(tool.function.name)
				).map(providerTool)
			];
			const args = {
				outcomes: [
					{
						action: 'create',
						entity_kind: entityKind,
						minimum_successful_effects: 1,
						required_fields: fields
					}
				]
			};
			const issues = validateCompletedProviderCalls(
				[call(args)],
				{ ...request, tools: controlTools },
				admittedTools
			);
			expect(issues).toHaveLength(rejected ? 1 : 0);
			if (rejected)
				expect(issues[0]?.errors.join(' ')).toContain(
					'cannot produce required field "project_id"'
				);
		}
	);

	it.each([
		'rollback_section_text',
		'_rollback section contains the revised concise wording',
		'update_strategy',
		'merge_instructions',
		'document_id'
	])('returns acting-model repair feedback for %s', (field) => {
		const issues = validateCompletedProviderCalls([call(declaration(field))], request);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.errors.join(' ')).toContain(field);
		expect(issues[0]?.errors.join(' ')).toContain('content');
	});

	it('accepts a content postcondition with section-level intent in description', () => {
		expect(validateCompletedProviderCalls([call(declaration('content'))], request)).toEqual([]);
	});

	it('validates against admitted write tools while the acting surface contains only controls', () => {
		const narrowedRequest = {
			...request,
			tools: controlTools
		};
		expect(
			validateCompletedProviderCalls(
				[call(declaration('rollback_section_text'))],
				narrowedRequest,
				tools
			)[0]?.errors.join(' ')
		).toContain('rollback_section_text');
		expect(
			validateCompletedProviderCalls([call(declaration('content'))], narrowedRequest, tools)
		).toEqual([]);
	});

	it('rejects invented fields in changes as well as required_fields', () => {
		const args = {
			outcomes: [
				{
					action: 'update',
					entity_kind: 'document',
					target_ids: [DOCUMENT_ID],
					changes: [{ field: 'rollback_section_text', value: 'Revert.' }]
				}
			]
		};
		expect(
			validateCompletedProviderCalls([call(args)], request)[0]?.errors.join(' ')
		).toContain('rollback_section_text');
	});

	it('accepts normalized parent placement fields for document moves', () => {
		const args = {
			outcomes: [
				{
					action: 'move',
					entity_kind: 'document',
					target_ids: [DOCUMENT_ID],
					required_fields: ['new_parent_id', 'new_position']
				}
			]
		};
		expect(validateCompletedProviderCalls([call(args)], request)).toEqual([]);
	});

	it.each(['title', 'content'])(
		'does not borrow %s from helper creates to fulfill organization',
		(field) => {
			const args = {
				outcomes: [
					{
						action: 'organize',
						entity_kind: 'document',
						target_ids: [DOCUMENT_ID],
						required_fields: [field]
					}
				]
			};
			const issues = validateCompletedProviderCalls([call(args)], request);
			expect(issues).toHaveLength(1);
			expect(issues[0]?.errors.join(' ')).toContain(`required field "${field}"`);
		}
	);

	it('rejects organization fields when only a helper create tool is available', () => {
		const args = {
			outcomes: [
				{
					action: 'organize',
					entity_kind: 'document',
					target_ids: [DOCUMENT_ID],
					required_fields: ['title']
				}
			]
		};
		const admittedTools = tools.filter(
			(tool) => tool.function.name !== 'move_document_in_tree'
		);
		expect(validateCompletedProviderCalls([call(args)], request, admittedTools)).toHaveLength(
			1
		);
	});

	it.each([
		{ kind: 'document', field: 'rollback_section_text', valid: false },
		{ kind: 'document', field: 'content', valid: true },
		{ kind: 'goal', field: 'project_id', valid: false },
		{ kind: 'goal', field: 'name', valid: true },
		{ kind: 'task', field: 'project_id', valid: false },
		{ kind: 'task', field: 'title', valid: true }
	])('checks reviewer correction field before accepting it: %j', ({ kind, field, valid }) => {
		const fieldDeclaration = (value: string): JsonObject =>
			kind === 'document'
				? declaration(value)
				: {
						outcomes: [
							{
								action: 'create',
								entity_kind: kind,
								required_fields: [value],
								minimum_successful_effects: 1
							}
						]
					};
		const admittedTools = [
			...tools,
			...ONTOLOGY_WRITE_TOOLS.filter((tool) =>
				['create_onto_goal', 'create_onto_task'].includes(tool.function.name)
			).map(providerTool)
		];
		const initialField = kind === 'document' ? 'content' : kind === 'goal' ? 'name' : 'title';
		const contract = parseDeclaredTurnContract(fieldDeclaration(initialField))!;
		const reviewRequest = buildTurnContractReviewRequest(
			request,
			admittedTools,
			contract,
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
						reason: 'Keep the edit within Rollback.',
						required_correction: 'Tighten that section only.',
						corrected_contract: fieldDeclaration(field),
						reference_candidates: []
					})
				}
			}
		]);
		const decide = () =>
			completeTurnContractReviewDecision({
				actingRequest: {
					...request,
					tools: controlTools
				},
				admittedTools,
				reviewRequest,
				toolCalls: accumulator,
				finished: true,
				finishedReason: 'tool_calls',
				fallbackReason: null,
				contract,
				contractReviewSha256: 'a'.repeat(64),
				allowRevision: true
			});
		if (valid) {
			expect(decide()[0]?.name).toBe('request_proposal_revision');
		} else {
			expect(decide).toThrow(
				expect.objectContaining({
					diagnostic: expect.objectContaining({ code: 'unexecutable_effect_fields' })
				})
			);
		}
	});
});
