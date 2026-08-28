// apps/worker/tests/agenticChatWriteRouting.test.ts
import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';
import {
	MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN,
	assessDirectWriteBatch,
	directWriteContractInstruction
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
			assessDirectWriteBatch([
				call('create_onto_task', { project_id: '2', title: 'Ship' }),
				call('create_onto_goal', { project_id: '2', name: 'Launch' }),
				call('create_onto_risk', { project_id: '2', title: 'Delay', impact: 'high' })
			], focused)
		).toEqual({ kind: 'simple', mutationCount: 3 });
	});

	it('requires semantic review when a mutation selects an existing entity', () => {
		expect(
			assessDirectWriteBatch([
				call('update_onto_task', { task_id: '1', state_key: 'done' })
			])
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
			assessDirectWriteBatch(
				[call('create_onto_task', { project_id: '2', title: 'Ship' })],
				{ contextType: 'global', entityId: null, projectId: null }
			)
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
