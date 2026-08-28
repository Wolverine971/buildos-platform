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
		expect(
			assessDirectWriteBatch([
				call('update_onto_task', { task_id: '1', state_key: 'done' }),
				call('create_onto_task', { project_id: '2', title: 'Ship' }),
				call('tag_onto_entity', { project_id: '2', entity_type: 'task', entity_id: '1' })
			])
		).toEqual({ kind: 'simple', mutationCount: 3 });
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
