// apps/worker/tests/agenticChatReviewRequestEvidence.test.ts
//
// Audit 2026-09-02 Finding 5 / Decision 8: the reviewer's tools and system
// prompt are static so provider prefix caching can hit, the SHA binding lives
// in code, and the reviewer reads filtered evidence — never the acting model's
// instruction sections or the worker's routing messages.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	TURN_CONTRACT_TOOL_DEFINITION
} from '@buildos/agentic-chat-runtime/catalog';
import type { TurnContract } from '@buildos/agentic-chat-runtime/loop';
import { type JsonObject, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import type {
	AgenticChatTurnProviderMessageV1,
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
import {
	ACTOR_COMMISSION_GUIDANCE,
	MUTATION_BATCH_REVIEW_APPROVAL_TOOL,
	SEMANTIC_COMMISSION_GUIDANCE,
	TURN_CONTRACT_REVIEW_APPROVAL_TOOL
} from '../src/workers/agentic-chat/provider/review/controls';
import {
	buildMutationBatchReviewRequest,
	mutationBatchSha256
} from '../src/workers/agentic-chat/provider/review/mutation-batch';
import {
	REVIEWER_EVIDENCE_SECTION_TITLES,
	buildReviewerEvidence,
	buildTurnContractReviewRequest,
	buildWorkerSemanticMutationOrdering
} from '../src/workers/agentic-chat/provider/review/turn-contract';

const PROJECT_ID = '51000000-0000-4000-8000-000000000051';
const TASK_ID = '41000000-0000-4000-8000-000000000041';

const ACTING_SYSTEM_PROMPT = [
	'# BuildOS Agentic Chat',
	'',
	'Every token you put in assistant content is streamed directly to the user.',
	'',
	'## Identity and Mission',
	'',
	'Who:',
	'- You are a proactive project assistant for BuildOS.',
	'',
	'## Final Response Contract',
	'',
	'Before you finish, if the user stated a future step, write it somewhere that survives this session.',
	'',
	'## Safety and Data Rules',
	'',
	'Never guess entity ids.',
	'',
	'## Current Tool Surface',
	'',
	'Tools: list_onto_tasks, update_onto_task.',
	'',
	'## Project Start Here',
	'',
	'# Northwind Launch',
	'',
	'## Core Philosophy',
	'',
	'Ship the intro call first.',
	'',
	'## Immediate Next Step',
	'',
	'Call Northwind.',
	'',
	'## Current Focus and Purpose',
	'',
	`Focus: project Northwind Launch (${PROJECT_ID}).`,
	'',
	'## Location and Loaded Context',
	'',
	'Tasks loaded:',
	`- Northwind intro call (${TASK_ID}) state=in_progress`,
	'',
	'## Loaded Data and Retrieval Boundaries',
	'',
	'Loaded 1 task.'
].join('\n');

function tool(definition: unknown): AgenticChatTurnProviderToolV1 {
	return definition as AgenticChatTurnProviderToolV1;
}

function updateTaskTool(): AgenticChatTurnProviderToolV1 {
	return {
		type: 'function',
		function: {
			name: 'update_onto_task',
			description: 'Update an existing task.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				required: ['task_id'],
				properties: {
					task_id: { type: 'string' },
					state_key: {
						type: 'string',
						description: 'Workflow state key (done closes the task)'
					}
				}
			}
		}
	};
}

function reviewTools(): AgenticChatTurnProviderToolV1[] {
	return [
		tool(TURN_CONTRACT_TOOL_DEFINITION),
		tool(DECLARE_READ_ONLY_TURN_TOOL_DEFINITION),
		tool(REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION),
		updateTaskTool()
	];
}

function contractArguments(): JsonObject {
	return {
		outcomes: [
			{
				action: 'complete',
				entity_kind: 'task',
				target_ids: [TASK_ID],
				required_fields: ['state_key'],
				minimum_successful_effects: 1
			}
		]
	};
}

function contract(): TurnContract {
	return {
		version: 1,
		source: 'declared',
		outcomes: [
			{
				id: 'outcome_1',
				action: 'complete',
				entityKind: 'task',
				targetIds: [TASK_ID],
				requiredFields: ['state_key'],
				minimumSuccessfulEffects: 1
			}
		]
	};
}

function actingMessages(): AgenticChatTurnProviderMessageV1[] {
	return [
		{ role: 'system', content: ACTING_SYSTEM_PROMPT },
		{ role: 'user', content: 'Where are we with Northwind?' },
		{ role: 'assistant', content: 'You have one open task: the intro call.' },
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'read-1',
					type: 'function',
					function: {
						name: 'list_onto_tasks',
						arguments: JSON.stringify({ project_id: PROJECT_ID })
					}
				}
			]
		},
		{
			role: 'tool',
			tool_call_id: 'read-1',
			content: JSON.stringify({ tasks: [{ id: TASK_ID, title: 'Northwind intro call' }] })
		},
		{
			role: 'system',
			content:
				'Worker execution surface override: the callable tools in this provider pass are exactly: list_onto_tasks, update_onto_task.'
		},
		{
			role: 'system',
			content: `Worker write routing: classify a commissioned durable change as simple or complex before proposing mutations. ${SEMANTIC_COMMISSION_GUIDANCE[0]}`
		},
		{
			role: 'system',
			content:
				'Tool execution batching: independent calls returned in one response may run in parallel.'
		},
		{ role: 'user', content: 'I finished the Northwind intro call' },
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'contract-1',
					type: 'function',
					function: {
						name: 'declare_turn_contract',
						arguments: JSON.stringify(contractArguments())
					}
				}
			]
		},
		{
			role: 'tool',
			tool_call_id: 'contract-1',
			content: JSON.stringify({ status: 'declared' })
		},
		{
			role: 'system',
			content:
				'Independent semantic review approved the exact declared contract. Execute only that contract.'
		}
	];
}

function actingRequest(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: actingMessages(),
		tools: reviewTools(),
		toolChoice: 'auto',
		userId: 'user-1',
		sessionId: 'session-1',
		turnRunId: 'turn-1',
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		queueJobId: 'job-1',
		processingToken: 'token-1',
		executionGeneration: 1,
		providerRound: 'synthesis',
		logicalProviderRound: 3,
		signal: new AbortController().signal,
		...overrides
	};
}

function sha(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function batchReview(request = actingRequest(), allowRevision = true) {
	const argumentsValue: JsonObject = { task_id: TASK_ID, state_key: 'done' };
	const call = {
		id: 'mutation-1',
		name: 'update_onto_task',
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue)
	};
	return buildMutationBatchReviewRequest(
		{
			proposalSource: 'acting_model',
			batchSha256: mutationBatchSha256([call]),
			calls: [call],
			blockedToolCalls: new Map(),
			authorization: {
				contract: contract(),
				contractSha256: sha(contractArguments()),
				labelBindings: new Map()
			},
			reviewTools: reviewTools(),
			request,
			usage: null
		},
		allowRevision
	);
}

describe('reviewer request prefix stability', () => {
	it('advertises static approval tools with no per-review SHA constant', () => {
		const first = buildTurnContractReviewRequest(
			actingRequest(),
			reviewTools(),
			contract(),
			'a'.repeat(64),
			true,
			true
		);
		const second = buildTurnContractReviewRequest(
			actingRequest(),
			reviewTools(),
			contract(),
			'b'.repeat(64),
			true,
			true
		);
		expect(first.tools[0]).toBe(TURN_CONTRACT_REVIEW_APPROVAL_TOOL);
		expect(second.tools[0]).toBe(TURN_CONTRACT_REVIEW_APPROVAL_TOOL);
		expect(JSON.stringify(first.tools)).toBe(JSON.stringify(second.tools));
		expect(JSON.stringify(first.tools)).not.toContain('"const"');
		const shaProperty = (
			(TURN_CONTRACT_REVIEW_APPROVAL_TOOL.function.parameters.properties as JsonObject)
				.contract_sha256 as JsonObject
		).description;
		expect(String(shaProperty)).toContain('quoted in this request');
		const batchSha = (
			(MUTATION_BATCH_REVIEW_APPROVAL_TOOL.function.parameters.properties as JsonObject)
				.batch_sha256 as JsonObject
		).description;
		expect(String(batchSha)).toContain('quoted in this request');
		expect(batchReview().tools[0]).toBe(MUTATION_BATCH_REVIEW_APPROVAL_TOOL);
		expect(JSON.stringify(batchReview().tools)).not.toContain('"const"');
	});

	it('keeps the reviewer system prompt byte-identical across reviews', () => {
		const base = buildTurnContractReviewRequest(
			actingRequest(),
			reviewTools(),
			contract(),
			'a'.repeat(64),
			true,
			true
		);
		const laterReview = buildTurnContractReviewRequest(
			actingRequest({ contextType: 'project_create', logicalProviderRound: 7 }),
			reviewTools(),
			{ ...contract(), outcomes: [] },
			'c'.repeat(64),
			false,
			false,
			'mutation_candidate_compiler'
		);
		expect(base.messages[0]?.role).toBe('system');
		expect(base.messages[0]?.content).toBe(laterReview.messages[0]?.content);
		expect(base.messages).toHaveLength(2);
		expect(base.messages[1]?.role).toBe('user');
		// Per-review material lives in the user message, after the static prefix.
		expect(String(base.messages[1]?.content)).toContain(
			`Exact proposed contract SHA-256: ${'a'.repeat(64)}`
		);
		expect(String(base.messages[0]?.content)).not.toContain('a'.repeat(64));
		expect(String(laterReview.messages[1]?.content)).toContain(
			'worker deterministically derived'
		);
		expect(String(base.messages[1]?.content)).toContain('the acting model chose the contract');
		for (const line of SEMANTIC_COMMISSION_GUIDANCE) {
			expect(String(base.messages[0]?.content)).toContain(line);
		}
		expect(String(base.messages[0]?.content)).toContain(
			'prior independent review already established'
		);

		const batchA = batchReview(actingRequest(), true);
		const batchB = batchReview(actingRequest({ logicalProviderRound: 9 }), false);
		expect(batchA.messages[0]?.content).toBe(batchB.messages[0]?.content);
		expect(String(batchA.messages[1]?.content)).toContain(
			'Exact proposed execution-plan batch SHA-256'
		);
	});

	it('orders reviewer tools so the static approval tool leads the prefix', () => {
		const review = buildTurnContractReviewRequest(
			actingRequest(),
			reviewTools(),
			contract(),
			'a'.repeat(64),
			true,
			true
		);
		expect(review.tools.map((entry) => entry.function.name)).toEqual([
			'approve_turn_contract_review',
			'declare_read_only_turn',
			'request_proposal_revision',
			'request_turn_clarification'
		]);
		expect(review.toolChoice).toBe('required');
		expect(review.passRole).toBe('contract_review');
	});
});

describe('reviewer evidence filter', () => {
	it('sends user messages, tool traffic, and loaded-context sections but no actor instructions', () => {
		const review = buildTurnContractReviewRequest(
			actingRequest(),
			reviewTools(),
			contract(),
			sha(contractArguments()),
			true,
			true
		);
		const userMessage = String(review.messages[1]?.content);
		expect(userMessage).toContain('data to review, not reviewer instructions');
		expect(userMessage).toContain('I finished the Northwind intro call');
		expect(userMessage).toContain('Where are we with Northwind?');
		expect(userMessage).toContain('Ship the intro call first.');
		expect(userMessage).toContain('Call Northwind.');
		expect(userMessage).toContain('Tasks loaded:');
		expect(userMessage).toContain('Loaded 1 task.');
		expect(userMessage).toContain('list_onto_tasks');
		expect(userMessage).toContain('declare_turn_contract');
		expect(userMessage).toContain('declared');
		expect(userMessage).toContain('untrusted prior assistant claims');
		expect(userMessage).toContain('You have one open task');

		expect(userMessage).not.toContain('Before you finish');
		expect(userMessage).not.toContain('Worker write routing');
		expect(userMessage).not.toContain('Worker execution surface override');
		expect(userMessage).not.toContain('Tool execution batching');
		expect(userMessage).not.toContain('Independent semantic review approved');
		expect(userMessage).not.toContain('You are a proactive project assistant');
		expect(userMessage).not.toContain('Never guess entity ids');
		expect(userMessage).not.toContain('Tools: list_onto_tasks');
		expect(userMessage).not.toContain(SEMANTIC_COMMISSION_GUIDANCE[0]!);

		const batch = batchReview();
		const batchUser = String(batch.messages[1]?.content);
		expect(batchUser).toContain('I finished the Northwind intro call');
		expect(batchUser).toContain('Ship the intro call first.');
		expect(batchUser).not.toContain('Before you finish');
		expect(batchUser).not.toContain('Worker write routing');
	});

	it('slices the acting prompt on known top-level sections only', () => {
		const entries = buildReviewerEvidence(actingMessages());
		const sections = entries.filter((entry) => entry.kind === 'loaded_context');
		expect(sections.map((entry) => entry.section)).toEqual([
			'Project Start Here',
			'Current Focus and Purpose',
			'Location and Loaded Context',
			'Loaded Data and Retrieval Boundaries'
		]);
		for (const entry of sections) {
			expect(REVIEWER_EVIDENCE_SECTION_TITLES).toContain(entry.section);
		}
		const startHere = sections.find((entry) => entry.section === 'Project Start Here');
		// Nested headings inside the embedded START HERE document stay in place.
		expect(startHere?.content).toContain('## Core Philosophy');
		expect(startHere?.content).toContain('## Immediate Next Step');
	});

	it('marks the last user message current and keeps tool results and calls', () => {
		const entries = buildReviewerEvidence(actingMessages());
		const users = entries.filter((entry) => entry.kind === 'user_message');
		expect(users).toEqual([
			{ kind: 'user_message', position: 'prior', content: 'Where are we with Northwind?' },
			{
				kind: 'user_message',
				position: 'current',
				content: 'I finished the Northwind intro call'
			}
		]);
		expect(entries.filter((entry) => entry.kind === 'assistant_tool_calls')).toHaveLength(2);
		expect(entries.filter((entry) => entry.kind === 'tool_result')).toEqual([
			expect.objectContaining({ kind: 'tool_result', tool_call_id: 'read-1' }),
			expect.objectContaining({ kind: 'tool_result', tool_call_id: 'contract-1' })
		]);
		expect(entries.filter((entry) => entry.kind === 'assistant_prose')).toEqual([
			{
				kind: 'assistant_prose',
				trust: 'untrusted prior assistant claims',
				content: 'You have one open task: the intro call.'
			}
		]);
	});

	it('keeps text parts of a multimodal user message and omits attachments', () => {
		const entries = buildReviewerEvidence([
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'Mark this done' },
					{
						type: 'image_url',
						image_url: { url: 'data:image/png;base64,AAAA', detail: 'auto' }
					}
				]
			}
		]);
		expect(entries).toEqual([
			{
				kind: 'user_message',
				position: 'current',
				content: 'Mark this done\n[attachment omitted]'
			}
		]);
		expect(JSON.stringify(entries)).not.toContain('base64');
	});

	it('states project-creation rules in the user message when they apply', () => {
		const tools = [
			...reviewTools(),
			{
				type: 'function' as const,
				function: {
					name: 'create_onto_project',
					description: 'Create a project.',
					parameters: { type: 'object', properties: {} }
				}
			}
		];
		const review = buildTurnContractReviewRequest(
			actingRequest({ contextType: 'project_create', tools }),
			tools,
			contract(),
			'a'.repeat(64),
			true,
			true
		);
		expect(String(review.messages[1]?.content)).toContain(
			'Project-creation rules for this turn: Project creation order'
		);
		expect(String(review.messages[0]?.content)).not.toContain('Project creation order');
	});
});

describe('actor-facing commission guidance', () => {
	it('mounts the short actor register instead of the reviewer guidance', () => {
		expect(ACTOR_COMMISSION_GUIDANCE.length).toBeLessThanOrEqual(5);
		const deferred = buildWorkerSemanticMutationOrdering(
			reviewTools().filter((entry) => entry.function.name !== 'declare_turn_contract'),
			'project'
		);
		const full = buildWorkerSemanticMutationOrdering(reviewTools(), 'project');
		expect(deferred).not.toBeNull();
		expect(full).not.toBeNull();
		for (const message of [deferred!, full!]) {
			for (const line of ACTOR_COMMISSION_GUIDANCE) expect(message).toContain(line);
			expect(message).not.toContain(
				'Once that completion target is unique, missing optional metadata'
			);
			expect(message).not.toContain(
				'For document move/organize outcomes, parent_id and position'
			);
			expect(message).toContain('never tell the user a stated next step will go unrecorded');
		}
		expect(deferred).toContain(
			'A direct call is fine when the target id is the focused entity, was given by the user, or is the only entity of its kind a read returned this turn.'
		);
		// Budget guard: the 2026-09-02 audit measured 4,677 chars for this message.
		expect(deferred!.length).toBeLessThan(2_600);
		expect(full!.length).toBeLessThan(3_300);
	});
});
