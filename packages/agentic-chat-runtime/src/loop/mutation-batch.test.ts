// packages/agentic-chat-runtime/src/loop/mutation-batch.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildMutationBatch,
	mutationBatchSha256,
	serializeMutationBatchForReview
} from './mutation-batch';

function streamed(name: string, args: Record<string, unknown>, id = `${name}-1`) {
	return { id, name, canonicalProviderArguments: JSON.stringify(args) };
}

describe('mutation batch digest', () => {
	it('covers tool names, arguments and ordering', () => {
		const base = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1', due_at: '2026-09-18' })
		]);
		const differentValue = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1', due_at: '2026-09-19' })
		]);
		const differentTool = buildMutationBatch([
			streamed('create_onto_task', { task_id: 't1', due_at: '2026-09-18' })
		]);

		expect(mutationBatchSha256(base)).not.toBe(mutationBatchSha256(differentValue));
		expect(mutationBatchSha256(base)).not.toBe(mutationBatchSha256(differentTool));
	});

	it('changes when two calls swap order, because order expresses dependency', () => {
		const forward = buildMutationBatch([
			streamed('create_onto_task', { title: 'Permit' }, 'a'),
			streamed('create_onto_task', { title: 'Cabinets' }, 'b')
		]);
		const reversed = buildMutationBatch([
			streamed('create_onto_task', { title: 'Cabinets' }, 'b'),
			streamed('create_onto_task', { title: 'Permit' }, 'a')
		]);

		expect(mutationBatchSha256(forward)).not.toBe(mutationBatchSha256(reversed));
	});

	// A provider retry re-streams the same proposal with fresh call ids. That is
	// the same batch and must not force a second paid review.
	it('ignores provider call ids so a re-streamed proposal keeps its approval', () => {
		const first = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1' }, 'call_1')
		]);
		const retried = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1' }, 'call_9')
		]);

		expect(mutationBatchSha256(first)).toBe(mutationBatchSha256(retried));
	});

	it('shows the reviewer the real arguments, not a description of them', () => {
		const batch = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1', due_at: '2026-09-18' })
		]);
		const digest = mutationBatchSha256(batch);

		expect(serializeMutationBatchForReview(batch)).toEqual([
			{
				call: 1,
				tool: 'update_onto_task',
				arguments: { task_id: 't1', due_at: '2026-09-18' }
			}
		]);
		expect(batch.calls[0]!.canonicalArguments).toBe('{"task_id":"t1","due_at":"2026-09-18"}');
		expect(mutationBatchSha256(batch)).toBe(digest);
	});
});
