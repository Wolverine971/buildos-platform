// apps/worker/tests/agenticChatWriteRouting.test.ts
import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';
import {
	type DirectWriteRouteContext,
	MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN,
	assessDirectWriteBatch,
	collectReadResultEntityRefs,
	collectSingleHitEntityIds,
	directWriteContractInstruction,
	summarizeReadResultEntityRefs
} from '../src/workers/agentic-chat/provider/write-routing';

let callIndex = 0;

function call(
	name: string,
	argumentsValue: JsonObject = {},
	scheduling?: CompletedProviderToolCall['scheduling']
): CompletedProviderToolCall {
	const canonicalArguments = JSON.stringify(argumentsValue);
	callIndex += 1;
	return {
		id: `call-${name}-${callIndex}`,
		name,
		arguments: argumentsValue,
		canonicalArguments,
		canonicalProviderArguments: canonicalArguments,
		...(scheduling ? { scheduling } : {})
	};
}

describe('direct write routing', () => {
	it('accepts one same-round batch of up to three ordinary mutations', () => {
		const focused = { contextType: 'project', entityId: '2', projectId: '2' };
		expect(
			assessDirectWriteBatch(
				[
					call('create_onto_task', { project_id: '2', title: 'Ship' }),
					call('create_onto_goal', { project_id: '2', name: 'Launch' }),
					call('create_onto_risk', { project_id: '2', title: 'Delay', impact: 'high' })
				],
				focused
			)
		).toEqual({ kind: 'simple', mutationCount: 3 });
	});

	it('requires semantic review when a mutation selects an existing entity', () => {
		expect(
			assessDirectWriteBatch([call('update_onto_task', { task_id: '1', state_key: 'done' })])
		).toEqual({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review',
			mutationCount: 1
		});
		expect(
			assessDirectWriteBatch([
				call('create_onto_task', { project_id: '2', title: 'Ship', goal_id: '3' })
			])
		).toMatchObject({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review'
		});
	});

	it('admits only an update to the already focused project', () => {
		const focused = { contextType: 'project', entityId: '2', projectId: '2' };
		expect(
			assessDirectWriteBatch(
				[call('update_onto_project', { project_id: '2', name: 'New' })],
				focused
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });
		expect(
			assessDirectWriteBatch(
				[call('update_onto_project', { project_id: '3', name: 'Other' })],
				focused
			)
		).toMatchObject({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review'
		});
	});

	it('requires review when a create selects its parent project from global context', () => {
		expect(
			assessDirectWriteBatch([call('create_onto_task', { project_id: '2', title: 'Ship' })], {
				contextType: 'global',
				entityId: null,
				projectId: null
			})
		).toMatchObject({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review'
		});
	});

	it('requires a contract when the batch exceeds the hard count floor', () => {
		const assessment = assessDirectWriteBatch(
			Array.from({ length: MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN + 1 }, (_, index) =>
				call('update_onto_task', { task_id: String(index), state_key: 'done' })
			)
		);
		expect(assessment).toEqual({
			kind: 'contract_required',
			reason: 'mutation_count_exceeded',
			mutationCount: 4
		});
		if (assessment.kind !== 'contract_required') throw new Error('Expected contract route');
		expect(directWriteContractInstruction(assessment)).toContain(
			'direct lane permits at most 3'
		);
	});

	it.each(['move_document_in_tree', 'unlink_onto_edge', 'move_onto_task', 'create_onto_project'])(
		'routes contract-only operation %s away from direct execution',
		(name) => {
			expect(assessDirectWriteBatch([call(name)])).toEqual({
				kind: 'contract_required',
				reason: 'operation_requires_contract',
				mutationCount: 1
			});
		}
	);

	it('requires a contract for mixed and explicitly ordered batches', () => {
		expect(
			assessDirectWriteBatch([call('update_onto_task'), call('get_project_overview')])
		).toMatchObject({ kind: 'contract_required', reason: 'mixed_tool_batch' });
		expect(
			assessDirectWriteBatch([
				call('update_onto_task', {}, { callRef: 'update', after: ['create'] })
			])
		).toMatchObject({
			kind: 'contract_required',
			reason: 'ordered_or_dependent_batch'
		});
	});

	it('does not classify a read-only batch as a write', () => {
		expect(assessDirectWriteBatch([call('get_project_overview')])).toEqual({
			kind: 'not_a_write'
		});
	});
});

const FOCUSED_PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const TASK_ID = '41000000-0000-4000-8000-000000000051';
const OTHER_TASK_IDS = [
	'41000000-0000-4000-8000-000000000052',
	'41000000-0000-4000-8000-000000000053'
];
const DOCUMENT_ID = '42000000-0000-4000-8000-000000000004';
const GOAL_ID = '43000000-0000-4000-8000-000000000004';

function focusedProject(overrides: Partial<DirectWriteRouteContext> = {}): DirectWriteRouteContext {
	return {
		contextType: 'project',
		entityId: FOCUSED_PROJECT_ID,
		projectId: FOCUSED_PROJECT_ID,
		userMessage: 'Current request',
		resolvedEntityIds: new Map(),
		...overrides
	};
}

describe('resolved_existing direct lane (Decision 3)', () => {
	it('admits an update whose target is the focused entity', () => {
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID, state_key: 'done' })],
				focusedProject({ contextType: 'task', entityId: TASK_ID })
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });
	});

	it('admits an update whose target id the user typed and a read this turn loaded', () => {
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID, due_at: '2026-09-04T15:00:00Z' })],
				focusedProject({
					userMessage: `push ${TASK_ID} to Friday`,
					turnSeenEntityIds: new Map([[TASK_ID, 'task']])
				})
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });
	});

	it('refuses a pasted id that no read this turn loaded', () => {
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID, due_at: '2026-09-04T15:00:00Z' })],
				focusedProject({ userMessage: `push ${TASK_ID} to Friday` })
			)
		).toMatchObject({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review'
		});
	});

	it('never resolves an id that is only a substring of the message', () => {
		// A pasted transcript or JSON blob is not the user naming a target: only
		// a whole UUID token counts, and only alongside read evidence.
		const embedded = `see task_id=${TASK_ID}xyz for the details`;
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID, state_key: 'done' })],
				focusedProject({
					userMessage: embedded,
					turnSeenEntityIds: new Map([[TASK_ID, 'task']])
				})
			)
		).toMatchObject({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review'
		});
	});

	it('normalizes case on both sides of the single-hit lookup', () => {
		const oneHit = collectSingleHitEntityIds({
			tasks: [{ id: TASK_ID.toUpperCase(), title: 'Send the launch email' }]
		});
		expect([...oneHit.keys()]).toEqual([TASK_ID]);
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID.toUpperCase(), state_key: 'done' })],
				focusedProject({ resolvedEntityIds: oneHit })
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });
	});

	it('admits three resolved single-target updates in one batch', () => {
		const resolved = new Map([
			[TASK_ID, 'task'],
			[OTHER_TASK_IDS[0]!, 'task'],
			[OTHER_TASK_IDS[1]!, 'task']
		]);
		expect(
			assessDirectWriteBatch(
				[TASK_ID, ...OTHER_TASK_IDS].map((id) =>
					call('update_onto_task', { task_id: id, state_key: 'done' })
				),
				focusedProject({ resolvedEntityIds: resolved })
			)
		).toEqual({ kind: 'simple', mutationCount: 3 });
	});

	it('admits an update whose target a read returned alone, and refuses a three-hit read', () => {
		const oneHit = collectSingleHitEntityIds({
			tasks: [{ id: TASK_ID, title: 'Send the launch email to the beta list' }]
		});
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID, state_key: 'done' })],
				focusedProject({ resolvedEntityIds: oneHit })
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });

		const threeHits = collectSingleHitEntityIds({
			tasks: [TASK_ID, ...OTHER_TASK_IDS].map((id) => ({ id, title: 'Email something' }))
		});
		expect(threeHits.size).toBe(0);
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID, state_key: 'done' })],
				focusedProject({ resolvedEntityIds: threeHits })
			)
		).toMatchObject({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review'
		});
	});

	it('does not count a by-id read as resolution evidence', () => {
		expect(
			collectSingleHitEntityIds(
				{ task: { id: TASK_ID, title: 'Only one' } },
				JSON.stringify({ task_id: TASK_ID })
			).size
		).toBe(0);
	});

	it('requires every id-valued reference on the call to be resolved, not only the target', () => {
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID, goal_id: GOAL_ID })],
				focusedProject({ contextType: 'task', entityId: TASK_ID })
			)
		).toMatchObject({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review'
		});
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: TASK_ID, goal_id: GOAL_ID })],
				focusedProject({
					contextType: 'task',
					entityId: TASK_ID,
					resolvedEntityIds: new Map([[GOAL_ID, 'goal']])
				})
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });
	});

	it('matches kinds: a lone document never resolves a task target', () => {
		expect(
			assessDirectWriteBatch(
				[call('update_onto_task', { task_id: DOCUMENT_ID, state_key: 'done' })],
				focusedProject({ resolvedEntityIds: new Map([[DOCUMENT_ID, 'document']]) })
			)
		).toMatchObject({ kind: 'contract_required' });
		expect(
			assessDirectWriteBatch(
				[call('update_onto_document', { document_id: DOCUMENT_ID, title: 'Renamed' })],
				focusedProject({ resolvedEntityIds: new Map([[DOCUMENT_ID, 'document']]) })
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });
	});

	it('keeps a cold reference on the contract lane when no context is available', () => {
		expect(
			assessDirectWriteBatch([
				call('update_onto_task', { task_id: TASK_ID, state_key: 'done' })
			])
		).toMatchObject({
			kind: 'contract_required',
			reason: 'target_resolution_requires_review'
		});
	});
});

describe('collectReadResultEntityRefs', () => {
	it('infers kinds from fields, then collection keys, and captures titles', () => {
		const refs = collectReadResultEntityRefs({
			project: { id: FOCUSED_PROJECT_ID, name: 'Launch' },
			tasks: [
				{ id: TASK_ID, title: 'Send the launch email', project_id: FOCUSED_PROJECT_ID },
				{ id: OTHER_TASK_IDS[0], title: 'Second' }
			],
			results: [{ id: DOCUMENT_ID, kind: 'document', title: 'Notes' }],
			documents: { [GOAL_ID]: { id: GOAL_ID, title: 'Keyed by id' } }
		});
		expect(refs).toEqual([
			{ id: FOCUSED_PROJECT_ID, kind: 'project', title: 'Launch' },
			{ id: TASK_ID, kind: 'task', title: 'Send the launch email' },
			{ id: OTHER_TASK_IDS[0], kind: 'task', title: 'Second' },
			{ id: DOCUMENT_ID, kind: 'document', title: 'Notes' },
			{ id: GOAL_ID, kind: 'document', title: 'Keyed by id' }
		]);
		expect(summarizeReadResultEntityRefs(refs)).toBe('2 documents, 1 project, 2 tasks');
	});

	it('ignores foreign-key fields and non-uuid ids, and de-duplicates', () => {
		const refs = collectReadResultEntityRefs({
			tasks: [
				{ id: TASK_ID, title: 'First sighting', goal_id: GOAL_ID },
				{ id: TASK_ID, title: 'Repeat' },
				{ id: 'not-a-uuid', title: 'Skipped' }
			]
		});
		expect(refs).toEqual([{ id: TASK_ID, kind: 'task', title: 'First sighting' }]);
	});
});
