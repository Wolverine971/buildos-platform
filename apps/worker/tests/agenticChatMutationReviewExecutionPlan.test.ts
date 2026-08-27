// apps/worker/tests/agenticChatMutationReviewExecutionPlan.test.ts
import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import { canonicalizeAgenticChatJson } from '@buildos/shared-types';
import { mutationBatchSha256 } from '../src/workers/agentic-chat/provider/review/mutation-batch';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';

function call(
	id: string,
	name: string,
	arguments_: JsonObject,
	scheduling?: { callRef: string | null; after: readonly string[] }
): CompletedProviderToolCall {
	const canonicalArguments = canonicalizeAgenticChatJson(arguments_);
	const providerArguments = scheduling
		? {
				...arguments_,
				...(scheduling.callRef ? { call_ref: scheduling.callRef } : {}),
				after: [...scheduling.after]
			}
		: arguments_;
	return {
		id,
		name,
		arguments: arguments_,
		canonicalArguments,
		canonicalProviderArguments: canonicalizeAgenticChatJson(providerArguments),
		...(scheduling ? { scheduling } : {})
	};
}

describe('Agentic Chat mutation review execution-plan binding', () => {
	it('changes the reviewed hash when model scheduling dependencies change', () => {
		const first = call(
			'call-a',
			'update_onto_task',
			{ task_id: 'task-a', state_key: 'done' },
			{ callRef: 'first', after: [] }
		);
		const independent = call(
			'call-b',
			'update_onto_task',
			{ task_id: 'task-b', state_key: 'done' },
			{ callRef: 'second', after: [] }
		);
		const dependent = call(
			'call-b',
			'update_onto_task',
			{ task_id: 'task-b', state_key: 'done' },
			{ callRef: 'second', after: ['first'] }
		);

		expect(mutationBatchSha256([first, independent])).not.toBe(
			mutationBatchSha256([first, dependent])
		);
	});

	it('binds read siblings and provider order around reviewed mutations', () => {
		const read = call('call-read', 'get_workspace_overview', {});
		const mutation = call('call-write', 'update_onto_task', {
			task_id: 'task-a',
			state_key: 'done'
		});

		expect(mutationBatchSha256([mutation])).not.toBe(mutationBatchSha256([read, mutation]));
		expect(mutationBatchSha256([read, mutation])).not.toBe(
			mutationBatchSha256([mutation, read])
		);
	});
});
